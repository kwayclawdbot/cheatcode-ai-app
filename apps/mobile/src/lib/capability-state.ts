/**
 * THE F18 STATE MACHINE, WITH NO REACT IN IT.
 *
 * This is to `ui/CapabilityState.tsx` what `lib/freshness-decay.ts` is to
 * `ui/FreshnessMark.tsx`: the rule, separated from the drawing, so it can be
 * asserted without a renderer. The component re-exports everything here, so
 * callers still import one thing.
 *
 * The vocabulary and the argument for each state live in the component's
 * header. What lives here is the ORDER the tests are applied in, which is the
 * part that is easy to get subtly wrong and impossible to see in a screenshot.
 */

export type Capability = 'ready' | 'loading' | 'quiet' | 'stale' | 'offline' | 'blocked' | 'failed';

export type CapabilityInput = {
  /** Do we hold anything at all to draw? */
  hasData: boolean;
  /** Is a request in flight? */
  loading?: boolean;
  /** Did the last request fail? */
  failed?: boolean;
  /** Is the device connected? `undefined` = we have not been told. */
  online?: boolean | undefined;
  /** Is this refused by the member's plan rather than missing? */
  blocked?: boolean;
  /**
   * Did every read this surface depends on ANSWER? Only a true here permits
   * `quiet`. Callers that cannot prove it must leave it false and get `failed`
   * or `stale`, which is the honest reading of "we do not know".
   */
  verified?: boolean;
  /** Is what we hold empty? */
  empty?: boolean;
};

/**
 * ONE PLACE THAT DECIDES WHICH OF THE SIX IT IS.
 *
 * The order of these tests is the argument, and it is deliberately not the
 * order a `useResource` reports things in:
 *
 *   1. `blocked` first. An entitlement wall is true whether or not the network
 *      is up, and telling somebody to reconnect when reconnecting cannot help
 *      is worse than telling them nothing.
 *   2. `offline` before `failed`. A request that failed because the phone has
 *      no signal is not a broken service, and "try again" means something very
 *      different in the two cases.
 *   3. `stale` before `failed` ONLY when we still hold data. Losing a screen
 *      full of numbers that were true five minutes ago to a single failed poll
 *      is the bug this ordering exists to stop.
 *   4. `loading` only when we hold nothing. A refresh over good data is not a
 *      loading state; it is data with a slightly older timestamp.
 *   5. `quiet` LAST, and only when `verified` — which the caller must prove.
 *      This is the F18 rule in one line: an empty answer is a finding, an
 *      unanswered question is not, and nothing may collapse the second into
 *      the first.
 */
export function capabilityFor(input: CapabilityInput): Capability {
  if (input.blocked) return 'blocked';
  if (input.online === false) return 'offline';
  if (input.failed && input.hasData) return 'stale';
  if (input.failed) return 'failed';
  if (input.loading && !input.hasData) return 'loading';
  if (input.empty) return input.verified ? 'quiet' : 'failed';
  return 'ready';
}

/**
 * "Last updated 8:42 AM" — the provenance line every cached read carries.
 *
 * Returns null rather than a placeholder when there is no usable instant,
 * because a provenance line with no provenance in it is worse than none: it
 * looks like the app knows when the data is from.
 */
export function updatedAtLabel(at: number | string | null | undefined, prefix = 'Last updated'): string | null {
  if (at === null || at === undefined) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return `${prefix} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * NetInfo's two booleans, reduced to one answer.
 *
 * `isInternetReachable` is respected when NetInfo has decided one way or the
 * other: a phone attached to a captive-portal Wi-Fi is `isConnected: true` and
 * cannot reach anything, and telling that member their request simply failed
 * would send them looking for a bug in the app. While it is still `null`
 * (undetermined) we fall back to `isConnected`, because "connected but not yet
 * probed" is not evidence of being offline.
 */
export function onlineFrom(s: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  if (s.isConnected === false) return false;
  if (s.isInternetReachable === false) return false;
  return Boolean(s.isConnected);
}
