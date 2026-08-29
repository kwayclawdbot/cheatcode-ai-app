/**
 * ONE payload builder, from the notification row.
 *
 * THE BANNER COPY IS THE INBOX COPY. `title` and `body` are `title_plain` and
 * `body_plain` off the row `notify()` already wrote — there is no second,
 * punchier string for the lock screen. Two copies of the same sentence drift,
 * and when they drift the app is telling the user two different things about
 * one event. If the banner reads badly, the inbox reads badly, and the fix is
 * in the copy at the call site where the sentence is written.
 *
 * `data` carries the deep link and the ids the client needs to route and to
 * dedupe. Nothing here is secret: a push payload transits a third party's
 * servers (Apple, Google, Mozilla) and is stored on the device, so it holds
 * what a notification tray would show anyway and never a token, a balance, or
 * anything the inbox itself would not print.
 */
import type { NotificationCategory } from '@shared/api';
import type { NotifyKind } from '../notify';
import { KIND_CATEGORY } from './policy';

export type NotificationRecord = {
  id: string;
  kind: string;
  payload: Record<string, unknown> | null;
};

export type PushPayload = {
  title: string;
  body: string;
  data: {
    notification_id: string;
    kind: string;
    category: NotificationCategory;
    route: string | null;
    group: string | null;
  };
};

/** The last-resort strings. A push with no copy is a bug, not a blank banner. */
const FALLBACK_TITLE = 'Cheat Code';
const FALLBACK_BODY = 'Something is waiting in your inbox.';

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

export function buildPayload(row: NotificationRecord): PushPayload {
  const p = row.payload ?? {};
  const category = KIND_CATEGORY[row.kind as NotifyKind] ?? 'system';
  return {
    title: str(p.title_plain) ?? FALLBACK_TITLE,
    body: str(p.body_plain) ?? FALLBACK_BODY,
    data: {
      notification_id: row.id,
      kind: row.kind,
      category,
      route: str(p.route),
      group: str(p.group),
    },
  };
}
