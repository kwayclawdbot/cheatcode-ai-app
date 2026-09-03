/**
 * How many places each group gets on a bounded History page.
 *
 * Pure, and in its own file so it can be tested without a database — the rule
 * it encodes is a product decision, not an implementation detail.
 */
/**
 * History is PROPORTIONAL BY FAMILY, not simply the most recent rows.
 *
 * Ordering the back catalogue by recency alone showed 25 longs and zero shorts,
 * because the short model stopped firing on 3 August while the longs run to
 * today. That reproduces exactly the omission this tab exists to prevent: a
 * record that quietly drops the losing half is not a record.
 *
 * The app now holds all six families the SMS product has ever sent (826 picks,
 * February onward), and recency alone would show only the two that still fire.
 * So each family gets a share of the page matching its share of the corpus,
 * with a FLOOR OF ONE: a family can be under-represented, never invisible.
 */

/**
 * `limit` places shared out in proportion to `sizes`, every non-empty group
 * guaranteed at least one, and never more places than a group has rows.
 */
export function proportionalSlots(sizes: number[], limit: number): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total === 0 || limit <= 0) return sizes.map(() => 0);
  if (total <= limit) return [...sizes];

  const present = sizes.filter((n) => n > 0).length;
  // More non-empty groups than places: the floor cannot be honoured for all of
  // them, so the largest groups take the places. Nothing is invented.
  if (present > limit) {
    const order = sizes.map((n, i) => [n, i] as const).sort((x, y) => y[0] - x[0]);
    const out = sizes.map(() => 0);
    for (let i = 0; i < limit; i += 1) out[order[i][1]] = 1;
    return out;
  }

  // The share each group has earned, before the floor and the cap.
  const want = sizes.map((n) => (limit * n) / total);
  const out: number[] = sizes.map((n, i) => (n === 0 ? 0 : Math.min(n, Math.max(1, Math.floor(want[i])))));

  let left = limit - out.reduce((a, b) => a + b, 0);
  // The floor pushed a small group above its share and overshot the page: take
  // the excess back off whichever group is furthest ABOVE its share, never
  // below one.
  while (left < 0) {
    let pick = -1;
    let worst = 0;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] <= 1) continue;
      const over = out[i] - want[i];
      if (pick === -1 || over > worst) { pick = i; worst = over; }
    }
    if (pick === -1) break;
    out[pick] -= 1;
    left += 1;
  }
  // Places still going spare go to whichever group is furthest BELOW its share
  // and has rows left to show — one at a time, so the deficit is re-read after
  // every award instead of the page being handed out round-robin.
  while (left > 0) {
    let pick = -1;
    let best = 0;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] >= sizes[i]) continue;
      const under = want[i] - out[i];
      if (pick === -1 || under > best) { pick = i; best = under; }
    }
    if (pick === -1) break; // every group is exhausted
    out[pick] += 1;
    left -= 1;
  }
  return out;
}
