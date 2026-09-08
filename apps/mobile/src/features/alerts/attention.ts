/**
 * THE ATTENTION DOT, AND WHY IT USED TO LIE — audit F18 (P2).
 *
 * `app/(tabs)/_layout.tsx` asked `/alerts` once, in a `useEffect` with an empty
 * dependency list, and drew a dot if anything came back. The tabs never
 * unmount, so that answer was the answer for the rest of the session: a member
 * who opened the board, dealt with the one alert that needed them and came back
 * to a screen with a dot still on it was being told something the app had not
 * checked since launch. "An outdated attention dot loses credibility" — and it
 * is worse than that, because the same dot is what a member trusts when it is
 * absent.
 *
 * THE FIX IS A SHARED FACT, NOT A SECOND FETCH.
 *
 * This module holds one attention reading for the whole app. The tab bar reads
 * it; the alerts board INVALIDATES it — on every successful load, and after
 * every action that changes an alert (activate, pause, resume, cancel). So
 * acknowledging the thing the dot points at is what clears the dot, which is
 * the audit's acceptance test in one sentence. Coming back to the foreground
 * re-asks too, because an app that was in a pocket for an hour knows nothing.
 *
 * THREE ANSWERS, NOT TWO. `unknown` is not `quiet`: a service that could not be
 * reached has told us nothing, and a dot must never be drawn from a failure —
 * nor must its ABSENCE be presented as a verified all-clear. Only `ready` is a
 * checked answer, and only `ready` is allowed to move the badge. This is the
 * same rule `features/account/entitlements.ts` applies to a padlock, for the
 * same reason.
 *
 * There is no polling here. The board polls on the market cadence and tells
 * this module every time; a second timer on the tab bar would be a request per
 * fifteen seconds from every screen in the app for a dot.
 */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { env } from '../../lib/env';
import { fixtureAlertsSimple } from '../../lib/fixtures';
import { isForeground, subscribeForeground } from '../../lib/foreground';

export type AttentionStatus = 'unknown' | 'ready' | 'unavailable';

export type Attention = {
  status: AttentionStatus;
  /** Only meaningful when `status` is 'ready'. */
  needsAttention: boolean;
  /** When the reading was taken, for a "Last checked" line. */
  checkedAt: number | null;
};

const UNKNOWN: Attention = { status: 'unknown', needsAttention: false, checkedAt: null };

let current: Attention = UNKNOWN;
let revision = 0;
const listeners = new Set<() => void>();

const emit = () => { listeners.forEach((l) => l()); };

/** The reading as it stands. Read-only; nothing outside this file may set it. */
export const attentionNow = (): Attention => current;

function put(next: Attention): void {
  if (
    next.status === current.status &&
    next.needsAttention === current.needsAttention &&
    next.checkedAt === current.checkedAt
  ) return;
  current = next;
  emit();
}

/**
 * SOMETHING HAPPENED TO AN ALERT — ask again.
 *
 * Called by the board when a payload lands and by `useAlertActions` when an
 * action succeeds. It does not itself decide the new answer: the server owns
 * what counts as needing attention (a triggered alert, a position at risk, a
 * followed thesis that died — see `lib/v5/attention.ts`), and guessing at it
 * from the cards a board happens to be holding is how two surfaces start
 * disagreeing about the same dot.
 *
 * `force` is the difference between "the member just did something" and "a
 * fifteen-second poll came back". The first must be answered immediately —
 * acknowledging an alert has to clear its dot at once, that is the whole
 * finding. The second is throttled to `GENTLE_GAP`, because a board that polls
 * on the market cadence would otherwise cost a second request every fifteen
 * seconds for the rest of the session, from every screen in the app, for a dot.
 */
const GENTLE_GAP = 60_000;

let mode: 'gentle' | 'force' = 'force';

export function alertsChanged(force = false): void {
  if (force) mode = 'force';
  revision += 1;
  emit();
}

let pending: Promise<void> | null = null;

async function refresh(): Promise<void> {
  if (pending) return pending;
  const gentle = mode === 'gentle';
  mode = 'gentle';
  if (gentle && current.checkedAt !== null && Date.now() - current.checkedAt < GENTLE_GAP) return;
  const at = revision;
  pending = (async () => {
    /*
      No API to ask. In a fixtures build the sample board is what is on screen,
      so the dot describes it; in a build that simply has no API configured the
      honest answer is that nothing has been checked.
    */
    if (!api.available()) {
      put(env.FIXTURES
        ? { status: 'ready', needsAttention: fixtureAlertsSimple.attention.length > 0, checkedAt: Date.now() }
        : { status: 'unavailable', needsAttention: false, checkedAt: Date.now() });
      return;
    }
    try {
      const d = await api.alertsSimple();
      // A newer invalidation arrived while this was in flight; that request
      // will write instead. Storing this one would resurrect the dot the
      // member just cleared.
      if (at !== revision) return;
      put({ status: 'ready', needsAttention: d.attention.length > 0, checkedAt: Date.now() });
    } catch {
      if (at !== revision) return;
      // A failed read is not a quiet board. The dot keeps whatever was last
      // CHECKED rather than being invented or cleared by an outage.
      put({ ...current, status: current.status === 'ready' ? 'ready' : 'unavailable' });
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/**
 * The tab bar's view of it. `enabled` is false in the modes whose second tab is
 * not showing alerts at all — a dot pointing at a screen you are not on is
 * noise, and it should not cost a request either.
 */
export function useAlertAttention(enabled = true): Attention {
  const [, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const rev = revision;
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    // `rev` is the dependency that makes an invalidation re-ask.
  }, [enabled, rev]);

  /*
    Coming back to the front is the other moment the held answer is worth
    nothing. `subscribeForeground` never fires on subscribe, so the mount read
    above is still the one that seeds it.
  */
  useEffect(() => {
    if (!enabled) return;
    return subscribeForeground((fg) => { if (fg && isForeground()) void refresh(); });
  }, [enabled]);

  return enabled ? current : UNKNOWN;
}
