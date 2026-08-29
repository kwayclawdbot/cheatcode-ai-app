/**
 * WHETHER TO BUZZ, AND IF NOT, WHY NOT.
 *
 * This is the heart of round 5 and it is a PURE FUNCTION. No database, no
 * network, no `Date.now()` — `now` is an argument. Everything that decides
 * whether a person's phone lights up at 3am is in one file that can be run a
 * thousand times in a millisecond with no stack around it, because that is the
 * only way this stays correct. `scripts/push-policy-test.ts` is the table.
 *
 * THE RESOLUTION ORDER IS FIXED (brief §7) and the order is the product:
 *
 *   entitlement   → is push a thing this account gets at all
 *   push_enabled  → the master switch the user themselves set
 *   category      → the switch for this KIND of thing
 *   quiet hours   → the switch for this TIME
 *   daily budget  → proactive kinds only; a trigger they asked for is never capped
 *   subscriptions → is there a device to send to, and is it usable
 *
 * Each gate answers for the WHOLE user, so the first one that fires returns a
 * single suppression with `subscription: null` and `transport: 'none'` (brief
 * §12.2) and nothing else is evaluated. Only the last gate is per-device.
 *
 * NOTHING IS EVER SILENTLY DROPPED. Every path out of here returns either a
 * device to send to or a reason not to, and the caller writes that reason to
 * `notification_deliveries`. The in-app row survives regardless: if we decided
 * not to wake you, the thing is still in your inbox in the morning.
 */
import type { NotificationCategory, PushTransport, QuietHours } from '@shared/api';
import type { NotifyKind } from '../notify';

/** Only the columns the decision actually reads. */
export type PushSubscriptionRecord = {
  id: string;
  transport: PushTransport;
  handle: string;
  keys: { p256dh?: string | null; auth?: string | null } | null;
  state: 'active' | 'stale' | 'revoked';
};

export type PushPrefs = {
  push_enabled: boolean;
  /** Absent key = ON. `{}` is a user who has never touched the switches. */
  categories: Partial<Record<NotificationCategory, boolean>>;
  quiet_hours: QuietHours | null;
  /** `setup_alert_prefs.max_per_day`; null = the default, not unlimited. */
  max_per_day: number | null;
};

export type SuppressionReason =
  | 'entitlement'
  | 'prefs_off'
  | 'category_off'
  | 'quiet_hours'
  | 'budget'
  | 'no_subscription'
  | 'keys_missing';

export type Suppression = {
  subscription: PushSubscriptionRecord | null;
  /** 'none' when the decision was made before any device was chosen. */
  transport: PushTransport | 'none';
  reason: SuppressionReason;
  /** The sentence the test route hands the UI. Adult, plain, no exclamation. */
  plain: string;
  /** True when the caller should also mark this subscription `stale`. */
  stale: boolean;
};

export type Resolution = {
  send: PushSubscriptionRecord[];
  suppressed: Suppression[];
};

export type ResolveInput = {
  kind: NotifyKind;
  /** `profiles.timezone` — the fallback when quiet hours name none. */
  user: { timezone: string | null };
  prefs: PushPrefs;
  /** Flag map from `entitlement_flags` for the user's tier. */
  entitlementFlags?: Record<string, unknown>;
  subscriptions: PushSubscriptionRecord[];
  now: Date;
  /** Proactive pushes already SENT today, in the user's own day. */
  sentToday: number;
  /**
   * 'test' is `POST /push/test`: the user pressed a button, so the category
   * switches and the daily budget do not apply — but quiet hours still do
   * (brief §7), because a test that ignores quiet hours proves the wrong thing.
   */
  trigger?: 'event' | 'test';
};

/**
 * Which switch turns each kind off (brief §4.5). This map is the reason
 * `NotificationCategory` has no server-side authority in the shared package:
 * the mapping is policy, and policy lives here.
 */
export const KIND_CATEGORY: Record<NotifyKind, NotificationCategory> = {
  alert_trigger: 'trade_alerts',
  alert_activated: 'trade_alerts',
  kai_room_reply: 'community',
  debrief_ready: 'coaching',
  paper_reset: 'system',
  system: 'system',
};

/**
 * PROACTIVE = we chose to send this; the user did not ask for it just now.
 * Only these are capped by `max_per_day` (brief §4.2).
 *
 *   alert_activated  Kai decided a setup was worth a watch. The archetype.
 *   system           an announcement. Nobody asked.
 *
 * Everything else follows directly from an act of the user's — their own alert
 * triggering, their own @Kai getting a reply, their own trade producing a
 * debrief, their own reset — and capping those would be us breaking a promise
 * they made to themselves. A trigger on an alert the user created is NEVER
 * capped and never deduped away: they asked for exactly this one.
 */
export const PROACTIVE_KINDS: ReadonlySet<NotifyKind> = new Set<NotifyKind>([
  'alert_activated',
  'system',
]);

/** `setup_alert_prefs.max_per_day` default, from 0008. */
export const DEFAULT_MAX_PER_DAY = 5;

/**
 * The app is a US-market product and quiet hours are collected without a
 * timezone by default. Falling back to UTC would shift a New York user's
 * 22:00–07:00 window five hours and buzz them at 2am, which is the exact
 * failure this whole file exists to prevent. Market time is the honest guess.
 */
export const DEFAULT_TIMEZONE = 'America/New_York';

/** The entitlement flag that could gate push. Absent = push is not gated. */
export const PUSH_ENTITLEMENT_FLAG = 'push_notifications';

export function isProactive(kind: NotifyKind): boolean {
  return PROACTIVE_KINDS.has(kind);
}

/**
 * "HH:MM" (seconds tolerated) → minutes since local midnight, or null if it is
 * not a time. Null means "no quiet hours", never "quiet all day": a malformed
 * preference must fail towards delivering the notification, because the inbox
 * cannot ring a doorbell and a silent app looks broken.
 */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * `now` as minutes since midnight IN `timeZone`. Pure: the only inputs are the
 * instant and the zone. An unknown zone answers null rather than throwing —
 * a typo in a preference must not be able to take down an order path.
 */
export function localMinutes(now: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const min = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    // Some ICU builds render midnight as hour 24 under hour12:false.
    return (h % 24) * 60 + min;
  } catch {
    return null;
  }
}

/**
 * Is `now` inside the window? THE WRAP PAST MIDNIGHT IS THE NORMAL CASE —
 * 22:00→07:00 is what a person means by "quiet hours" — so it is written first
 * in the reader's mind and tested first in the table.
 *
 * `start === end` is treated as NO window. The alternative reading ("quiet for
 * all 1440 minutes") would silence a user forever from a fat-fingered form, and
 * a preference screen that can permanently mute you by accident is worse than
 * one that occasionally buzzes.
 */
export function inQuietHours(
  quiet: QuietHours | null | undefined,
  now: Date,
  fallbackTimeZone: string | null
): boolean {
  if (!quiet) return false;
  const start = parseClock(quiet.start);
  const end = parseClock(quiet.end);
  if (start === null || end === null || start === end) return false;

  const zone = quiet.timezone || fallbackTimeZone || DEFAULT_TIMEZONE;
  const nowMin = localMinutes(now, zone) ?? localMinutes(now, DEFAULT_TIMEZONE);
  if (nowMin === null) return false;

  return start > end
    ? nowMin >= start || nowMin < end // wraps past midnight
    : nowMin >= start && nowMin < end;
}

/** A web row is deliverable only with BOTH of the browser's keys. */
export function isDeliverable(sub: PushSubscriptionRecord): boolean {
  if (sub.transport !== 'web') return true;
  return Boolean(sub.keys?.p256dh && sub.keys?.auth);
}

const userLevel = (reason: SuppressionReason, plain: string): Suppression => ({
  subscription: null,
  transport: 'none',
  reason,
  plain,
  stale: false,
});

/** The one function. See the file header for the order and why it is that order. */
export function resolveDelivery(input: ResolveInput): Resolution {
  const { kind, prefs, subscriptions, now } = input;
  const trigger = input.trigger ?? 'event';
  const flags = input.entitlementFlags ?? {};

  // 1. Entitlement. Gate PLACEMENT lives in the database (02 §11), so this is a
  //    flag lookup and not a tier comparison: nothing gates push on tier today,
  //    and the day something does, it is a seeded row and not a deploy.
  if (flags[PUSH_ENTITLEMENT_FLAG] === false) {
    return {
      send: [],
      suppressed: [userLevel('entitlement', 'Push notifications are not part of this plan.')],
    };
  }

  // 2. The master switch. The user's INTENT, which outranks everything below it
  //    and is a different question from whether the OS granted permission.
  if (!prefs.push_enabled) {
    return {
      send: [],
      suppressed: [
        userLevel('prefs_off', 'Notifications are switched off. Everything still lands in your inbox.'),
      ],
    };
  }

  // 3. The category switch. A test bypasses this deliberately — the user just
  //    pressed "send a test", and answering "your community switch is off"
  //    would be answering a question nobody asked.
  const category = KIND_CATEGORY[kind];
  if (trigger !== 'test' && prefs.categories?.[category] === false) {
    return {
      send: [],
      suppressed: [
        userLevel('category_off', 'That kind of notification is switched off. It is still in your inbox.'),
      ],
    };
  }

  // 4. Quiet hours. Suppresses EVERYTHING, including a triggered alert, and
  //    nothing is replayed when the window ends (brief §4.1): our evaluation
  //    runs off delayed quotes and the market is shut during typical quiet
  //    hours, so waking someone for a trade they cannot take is worse than the
  //    inbox — and a 7am flush of six stale alerts is worse than either.
  if (inQuietHours(prefs.quiet_hours, now, input.user.timezone)) {
    return {
      send: [],
      suppressed: [
        userLevel('quiet_hours', 'You are in quiet hours right now. This is waiting in your inbox.'),
      ],
    };
  }

  // 5. The daily budget — proactive kinds only, and never a test.
  if (trigger !== 'test' && isProactive(kind)) {
    const cap = prefs.max_per_day ?? DEFAULT_MAX_PER_DAY;
    if (Number.isFinite(cap) && input.sentToday >= cap) {
      return {
        send: [],
        suppressed: [
          userLevel(
            'budget',
            `That is ${cap} for today, which is the limit you set. The rest are in your inbox.`
          ),
        ],
      };
    }
  }

  // 6. The devices. Only 'active' rows are ever sent to; 'stale' is the
  //    sender's opinion and 'revoked' is a decision, and neither is a target.
  const active = subscriptions.filter((s) => s.state === 'active');
  if (active.length === 0) {
    return {
      send: [],
      suppressed: [
        userLevel('no_subscription', 'No device is set up for notifications yet.'),
      ],
    };
  }

  const send: PushSubscriptionRecord[] = [];
  const suppressed: Suppression[] = [];
  for (const sub of active) {
    if (isDeliverable(sub)) {
      send.push(sub);
      continue;
    }
    // A web row with null keys is storable and undeliverable (brief §12.1). It
    // is skipped and marked stale here rather than thrown inside the drain,
    // where one bad row would take the whole queue down with it.
    suppressed.push({
      subscription: sub,
      transport: sub.transport,
      reason: 'keys_missing',
      plain: 'That browser needs to be set up again before it can receive notifications.',
      stale: true,
    });
  }

  return { send, suppressed };
}

/**
 * Midnight in the user's own day, as a UTC instant. The daily budget is "how
 * many did we send you TODAY", and today is a local question — a cap that
 * resets at UTC midnight resets in the middle of a New York evening.
 *
 * Pure, and deliberately naive about the one DST day a year: the offset is read
 * at `now` and applied to midnight, so on a spring-forward day the boundary can
 * be an hour off. An hour of slack on a per-day counter is not worth a
 * timezone library.
 */
export function startOfLocalDay(now: Date, timeZone: string | null): Date {
  const zone = timeZone || DEFAULT_TIMEZONE;
  const read = (tz: string): Date | null => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).formatToParts(now);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      const [y, mo, d, h, mi, s] = [get('year'), get('month'), get('day'), get('hour') % 24, get('minute'), get('second')];
      if ([y, mo, d, h, mi, s].some((n) => !Number.isFinite(n))) return null;
      const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
      const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
      return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) - offsetMs);
    } catch {
      return null;
    }
  };
  return read(zone) ?? read(DEFAULT_TIMEZONE) ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
}
