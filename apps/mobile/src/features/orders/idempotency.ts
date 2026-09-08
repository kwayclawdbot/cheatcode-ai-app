/**
 * ONE PRESS IS ONE ORDER — audit F08's acceptance criterion, in one function.
 *
 *     "Double-tap, timeout and reconnect cannot create ambiguous submissions;
 *      authoritative order status resolves uncertainty."
 *
 * Disabling a button while `phase === 'sending'` does not achieve that. `phase`
 * is React state, so two taps inside one frame both observe `idle` and both
 * send. And a send that times out leaves a member pressing again with no way of
 * knowing whether the first one landed — the network's silence is not evidence
 * either way.
 *
 * `POST /orders/submit` is idempotent on `idempotency_key` and returns the
 * ORIGINAL order for a repeat (apps/api/src/lib/execution/submit.ts, enforced by
 * a unique index on `orders.idempotency_key`). So the key is derived from the
 * PREVIEW and remembered: every attempt to place the same priced order carries
 * the same key, and the engine can only make one order out of them however many
 * times the app asks.
 *
 * A key deliberately never expires. A PREVIEW does — past `expires_at` the
 * review screen re-prices, which yields a new `preview_id` and therefore a new
 * key. That is correct: a re-priced order is a different order and must be
 * allowed to exist alongside the first.
 *
 * The map is process-lifetime and unbounded, which is fine at this scale: it
 * holds one short string per order a member previews in one session. Clearing
 * it would be the bug — a key that is forgotten is a key that cannot deduplicate
 * the retry it exists for.
 *
 * No imports. This is the piece `paper-lifecycle-test.mts` pins down.
 */
const keys = new Map<string, string>();

/** Stable for the life of the app process, unique per preview. */
export function submitKeyFor(previewId: string): string {
  const existing = keys.get(previewId);
  if (existing) return existing;
  const key = `sub-${previewId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  keys.set(previewId, key);
  return key;
}

/** Test seam only. Nothing in the app calls this. */
export function forgetSubmitKeys(): void {
  keys.clear();
}
