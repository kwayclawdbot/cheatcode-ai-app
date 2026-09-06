/**
 * TELLING THE PEOPLE WHO ASKED TO BE TOLD.
 *
 * One person publishes a call or shares a fill; everybody following them gets
 * exactly one notification about it. The shape is copied from
 * `lib/swing/publish.ts` — the existing N-recipient loop in this app — for the
 * same reasons it has: one `notify()` per recipient, awaited in order, counted,
 * and logged. `notify()` writes the inbox row and enqueues at most one delivery
 * per device, so ONE EVENT IS ONE PUSH; there is no second sender anywhere in
 * this lane.
 *
 * THE BANNER COPY IS THE INBOX COPY. `lib/push/payload.ts` builds the lock
 * screen straight from `body_plain`, so the sentence is written once, here, at
 * the call site — never twice with a punchier version for the phone.
 *
 * A FAN-OUT MUST NEVER FAIL THE THING IT IS ABOUT. Callers wrap this the way
 * `notify()` itself is wrapped (see the header of `lib/notify.ts`): the worst a
 * broken notification may do to a published call or a booked fill is leave the
 * followers unaware of it.
 */
import { serviceClient } from '../db';
import { log } from '../log';
import { notify, type NotifyKind } from '../notify';

/**
 * How many followers one event will notify.
 *
 * A cap rather than paging, because this runs inside a request: a member with
 * ten thousand followers must not turn one POST into ten thousand awaited
 * inserts. The number is far above any real follower count here and exists so
 * that the day it is not, the route stays fast and the log says plainly that we
 * stopped short — rather than the request timing out with nobody told at all.
 */
export const FANOUT_CAP = 500;

export async function fanOutToFollowers(opts: {
  /** The person who did the thing. They are never told about their own action. */
  authorId: string;
  kind: Extract<NotifyKind, 'community_call' | 'trade_shared'>;
  titlePlain: string;
  bodyPlain: string;
  route: string;
  payload?: Record<string, unknown>;
  requestId: string;
}): Promise<number> {
  const db = serviceClient();

  const { data, error } = await db
    .from('follows')
    .select('follower_id')
    .eq('followee_id', opts.authorId)
    .order('created_at', { ascending: false })
    .limit(FANOUT_CAP);

  if (error) {
    log('warn', opts.requestId, 'social.fanout_read_failed', { kind: opts.kind, message: error.message });
    return 0;
  }

  const followers = ((data ?? []) as Record<string, unknown>[])
    .map((r) => String(r.follower_id))
    // `follows_not_self` already makes this impossible in the database. It is
    // checked anyway because the cost is one comparison and the failure it
    // prevents — telling somebody about their own post — is the kind of thing
    // that makes an app feel like it is not paying attention.
    .filter((id) => id && id !== opts.authorId);

  if (!followers.length) {
    log('info', opts.requestId, 'social.fanout', { kind: opts.kind, author: opts.authorId, recipients: 0 });
    return 0;
  }

  let told = 0;
  for (const userId of followers) {
    const id = await notify({
      userId,
      kind: opts.kind,
      titlePlain: opts.titlePlain,
      bodyPlain: opts.bodyPlain,
      route: opts.route,
      payload: opts.payload,
      requestId: opts.requestId,
    });
    if (id) told += 1;
    else log('warn', opts.requestId, 'social.fanout_notify_failed', { kind: opts.kind, userId });
  }

  log('info', opts.requestId, 'social.fanout', {
    kind: opts.kind,
    author: opts.authorId,
    followers: followers.length,
    notified: told,
    capped: followers.length >= FANOUT_CAP,
  });
  return told;
}

/**
 * A belt is the one social notification that goes to the person themselves,
 * because it is the one thing that happened TO them rather than to somebody
 * they follow. `award_points` reports `belt_changed` so the caller never has to
 * ask a second question to find out.
 */
export async function notifyBeltEarned(opts: {
  userId: string;
  belt: string;
  label: string;
  totalPoints: number;
  requestId: string;
}): Promise<void> {
  await notify({
    userId: opts.userId,
    kind: 'belt_earned',
    titlePlain: `${opts.label} belt`,
    bodyPlain: `That last call put you on ${opts.totalPoints} points, which is the ${opts.label} belt. The belt is yours from here — points can fall, the belt does not.`,
    route: `/contributor/${opts.userId}`,
    payload: { belt: opts.belt, points: opts.totalPoints },
    requestId: opts.requestId,
  });
}
