/**
 * THE RUNAWAY-LOOP GUARD. No more than 12 Kai questions a minute per person.
 *
 * The daily credits cap how much a loop can spend in a day; this caps how fast.
 * A person typing cannot ask twelve questions a minute and read the answers, so
 * the limit never touches real use — it catches a stuck retry, a script, or a
 * button held down, before it burns the day's credits in a few seconds.
 *
 * Checked at the route BEFORE the credit read and before any model call, so a
 * refused question costs nothing. Kept in memory per server instance: a loop
 * hammers the instance it is connected to, and a guard that needs the database
 * would fail open exactly when the database is the problem.
 */
export const KAI_QUESTIONS_PER_MINUTE = 12;
const WINDOW_MS = 60_000;

export const SLOW_DOWN_PLAIN =
  "You're sending questions faster than Kai can answer them. Give it a minute, then ask again.";

const recent = new Map<string, number[]>();

/**
 * Record one question and say whether it may go ahead. Refused questions are
 * not recorded, so someone who waits a minute is always let back in.
 */
export function allowKaiQuestion(
  userId: string,
  now = Date.now(),
  limit = KAI_QUESTIONS_PER_MINUTE
): { allowed: boolean; retryAfterSec: number } {
  const times = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= limit) {
    recent.set(userId, times);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((times[0] + WINDOW_MS - now) / 1000)) };
  }
  times.push(now);
  recent.set(userId, times);
  // Idle users are forgotten so the map cannot grow for the life of the process.
  if (recent.size > 5_000) {
    for (const [id, ts] of recent) if (!ts.length || now - ts[ts.length - 1] >= WINDOW_MS) recent.delete(id);
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** For tests. */
export function resetRateGuard(): void {
  recent.clear();
}
