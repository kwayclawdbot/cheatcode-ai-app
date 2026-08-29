/**
 * The native transport — Expo's push service.
 *
 * NOT VERIFIED AGAINST A DEVICE. There are no APNs or FCM credentials for this
 * project and no dev build to receive a token, so nothing in this file has ever
 * put a banner on a phone. `PUSH_DRY_RUN=1` is how the path is exercised: the
 * payload is built, chunked and logged, the delivery is marked `sent`, and
 * nothing is contacted. That proves the plumbing and the shape of the message.
 * It does not prove native push works, and this comment is here so nobody reads
 * a green smoke run as if it did. Owner blocker: brief §11.1.
 *
 * TICKETS ARE NOT DELIVERIES. `sendPushNotificationsAsync` returns a ticket
 * meaning "Expo accepted this", which is why a ticket moves a row to `sent` and
 * only a RECEIPT — fetched at least 15 minutes later — moves it to `delivered`.
 * `DeviceNotRegistered`, from either, retires the token: the app was deleted or
 * the token was reissued, and a token that will never work again is a row that
 * should stop being tried, not a failure to retry.
 */
import { Expo, type ExpoPushMessage, type ExpoPushReceipt, type ExpoPushTicket } from 'expo-server-sdk';
import { env } from '../env';
import { log } from '../log';
import type { PushPayload } from './payload';
import type { SendOutcome } from './send';

let client: Expo | null = null;

export function expoClient(): Expo {
  if (!client) client = new Expo({ accessToken: env('EXPO_ACCESS_TOKEN') });
  return client;
}

/** Dry run is the EXPO path only. Web push really sends; it has a real endpoint. */
export function expoDryRun(): boolean {
  return env('PUSH_DRY_RUN') === '1';
}

/** Expo needs no credentials of ours to accept a message, so it is always "configured". */
export function expoConfigured(): boolean {
  return true;
}

export function isExpoToken(handle: string): boolean {
  return Expo.isExpoPushToken(handle);
}

function message(handle: string, payload: PushPayload): ExpoPushMessage {
  return {
    to: handle,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: 'default',
    // The Android channel the client creates for trade alerts. A message with
    // no channel lands on the default one at whatever importance the OS chose.
    channelId: payload.data.category === 'trade_alerts' ? 'trade-alerts' : 'default',
    // Collapse on the notification id so a re-delivery replaces rather than
    // stacks. Two banners for one event is the same lie as two copies of it.
    collapseId: payload.data.notification_id,
    priority: payload.data.category === 'trade_alerts' ? 'high' : 'default',
  };
}

/**
 * One send per subscription. Chunking is per Expo's limit and the results come
 * back positionally — the nth ticket is the nth message, which is the only
 * reason the flat array below is safe to index against the input.
 */
export async function sendExpo(
  items: { handle: string; payload: PushPayload }[],
  requestId: string
): Promise<SendOutcome[]> {
  if (items.length === 0) return [];

  const out: SendOutcome[] = new Array(items.length);
  const live: { index: number; message: ExpoPushMessage }[] = [];

  items.forEach((item, i) => {
    if (!isExpoToken(item.handle)) {
      // Not an Expo token at all. No amount of retrying makes it one.
      out[i] = {
        ok: false,
        retry: false,
        revoke: true,
        reason: 'InvalidToken',
        error: 'the handle is not an Expo push token',
      };
      return;
    }
    live.push({ index: i, message: message(item.handle, item.payload) });
  });

  if (expoDryRun()) {
    for (const { index, message: m } of live) {
      log('info', requestId, 'push.expo_dry_run', {
        title: m.title,
        body: m.body,
        route: (m.data as Record<string, unknown> | undefined)?.route ?? null,
        channel: m.channelId,
      });
      // No ticket id: a dry-run row must never be handed to the receipts API,
      // and a null ticket is how the drain knows there is nothing to check.
      out[index] = { ok: true, ticketId: null };
    }
    return out;
  }

  const expo = expoClient();
  const chunks = expo.chunkPushNotifications(live.map((l) => l.message));
  let cursor = 0;
  for (const chunk of chunks) {
    let tickets: ExpoPushTicket[];
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
    } catch (e) {
      // The whole chunk failed to reach Expo — a network or 5xx problem, which
      // is exactly the case retrying is for.
      const msg = e instanceof Error ? e.message : String(e);
      for (let i = 0; i < chunk.length; i += 1) {
        out[live[cursor + i].index] = {
          ok: false,
          retry: true,
          revoke: false,
          reason: 'expo_unreachable',
          error: msg,
        };
      }
      cursor += chunk.length;
      continue;
    }

    tickets.forEach((ticket, i) => {
      const index = live[cursor + i].index;
      out[index] = ticketOutcome(ticket);
    });
    cursor += chunk.length;
  }

  return out;
}

function ticketOutcome(ticket: ExpoPushTicket): SendOutcome {
  if (ticket.status === 'ok') return { ok: true, ticketId: ticket.id };
  const code = ticket.details?.error;
  return {
    ok: false,
    // DeviceNotRegistered is permanent; MessageRateExceeded is the one worth
    // waiting on. Everything else is ours to fix, not to hammer.
    retry: code === 'MessageRateExceeded',
    revoke: code === 'DeviceNotRegistered',
    reason: code ?? 'ExpoError',
    error: ticket.message,
  };
}

export type ReceiptOutcome =
  | { state: 'delivered' }
  | { state: 'failed'; reason: string; error: string; revoke: boolean }
  | { state: 'pending' };

/**
 * Receipts are available for about a day and only some time after the send,
 * which is why the drain never asks for one younger than 15 minutes. A receipt
 * id that is simply not back yet answers `pending` and is asked again later —
 * an absent receipt is not a failure.
 */
export async function checkReceipts(
  ticketIds: string[],
  requestId: string
): Promise<Record<string, ReceiptOutcome>> {
  const result: Record<string, ReceiptOutcome> = {};
  if (ticketIds.length === 0) return result;

  const expo = expoClient();
  for (const chunk of expo.chunkPushNotificationReceiptIds(ticketIds)) {
    let receipts: Record<string, ExpoPushReceipt>;
    try {
      receipts = await expo.getPushNotificationReceiptsAsync(chunk);
    } catch (e) {
      log('warn', requestId, 'push.receipts_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    for (const [id, receipt] of Object.entries(receipts)) {
      if (receipt.status === 'ok') {
        result[id] = { state: 'delivered' };
        continue;
      }
      const code = receipt.details?.error;
      result[id] = {
        state: 'failed',
        reason: code ?? 'ExpoError',
        error: receipt.message,
        revoke: code === 'DeviceNotRegistered',
      };
    }
  }
  return result;
}
