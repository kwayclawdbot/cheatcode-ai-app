/**
 * Paper-account reset policy: once per calendar month.
 *
 * "Calendar month", not "30 days" — a user who reset on the 28th can reset
 * again on the 1st, which is what "once a month" means to a person.
 */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function canResetPaper(lastResetAt: string | null, now = new Date()): boolean {
  if (!lastResetAt) return true;
  return monthKey(lastResetAt) !== monthKey(now.toISOString());
}

export function nextResetAllowedAt(lastResetAt: string | null, now = new Date()): string | null {
  if (canResetPaper(lastResetAt, now)) return null;
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function resetPlain(lastResetAt: string | null, now = new Date()): string {
  if (canResetPaper(lastResetAt, now)) {
    return 'You can reset your practice balance once a month. This month is available.';
  }
  return 'You have already reset this month. The next one is available on the 1st.';
}
