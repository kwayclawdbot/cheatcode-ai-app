/**
 * WHAT IS ON THE CALENDAR FOR THE NAMES THIS MEMBER HAS SOMETHING RIDING ON.
 *
 * Home's opening brief (V2 "Kai is an agent") summarises watchlist, position
 * and calendar changes. The only calendar this server can actually read is the
 * per-company earnings date from Unusual Whales (`lib/market/uw.ts`, cached six
 * hours). There is no economic-calendar source wired — no CPI, no Fed — so this
 * block never claims one. When the earnings source is not connected, or it did
 * not answer, the block says that in a sentence and carries no events: an
 * empty list from a failed read must never look like "nothing is coming up".
 *
 * Pure apart from the injected reader, so `scripts/home-agent-test.mts` checks
 * every branch without a network.
 */
import type { HomeAgentCalendar, HomeCalendarEvent } from '@shared/api';

export type NextEarnings =
  | { ok: true; next: { date: string; confirmed: boolean; when: 'premarket' | 'postmarket' | null } | null }
  | { ok: false };

export type CalendarDeps = {
  /** False when the earnings source has no token on this server. */
  configured: boolean;
  nextEarnings: (symbol: string) => Promise<NextEarnings>;
  /** Today in New York, `YYYY-MM-DD`. */
  today: string;
};

/** How far ahead a report is worth a row in today's brief. */
export const CALENDAR_HORIZON_DAYS = 7;
/** At most this many companies are asked about — the source is shared and rate-limited. */
export const CALENDAR_MAX_SYMBOLS = 6;
/** Home never waits longer than this for the calendar. */
export const CALENDAR_TIMEOUT_MS = 2500;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** `work`, or `fallback` if it has not settled within `ms`. The timer is always cleared. */
function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

export async function homeCalendar(
  symbols: readonly string[],
  deps: CalendarDeps,
  opts: { horizonDays?: number; maxSymbols?: number; timeoutMs?: number } = {},
): Promise<HomeAgentCalendar> {
  const horizon = opts.horizonDays ?? CALENDAR_HORIZON_DAYS;
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z.]{1,6}$/.test(s)))]
    .slice(0, opts.maxSymbols ?? CALENDAR_MAX_SYMBOLS);

  if (!deps.configured) {
    return {
      state: 'not_connected',
      plain: 'The earnings calendar is not connected on this server, so report dates are not shown.',
      events: [],
    };
  }
  if (!unique.length) {
    return { state: 'ok', plain: 'Nothing on your list to check report dates for.', events: [] };
  }

  const failedRead: NextEarnings = { ok: false };
  const reads = await Promise.all(
    unique.map((symbol) =>
      within(
        deps.nextEarnings(symbol).catch((): NextEarnings => failedRead),
        opts.timeoutMs ?? CALENDAR_TIMEOUT_MS,
        failedRead,
      ).then((r) => ({ symbol, r })),
    ),
  );

  const events: HomeCalendarEvent[] = [];
  let failed = 0;
  for (const { symbol, r } of reads) {
    if (!r.ok) { failed += 1; continue; }
    const next = r.next;
    if (!next || !/^\d{4}-\d{2}-\d{2}/.test(next.date)) continue;
    const date = next.date.slice(0, 10);
    const days = daysBetween(deps.today, date);
    if (days < 0 || days > horizon) continue;
    events.push({
      kind: 'earnings',
      symbol,
      date,
      when: next.when ?? 'unknown',
      confirmed: next.confirmed,
      days_away: days,
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));

  if (failed === unique.length) {
    return {
      state: 'unavailable',
      plain: 'The earnings calendar did not answer just now, so report dates are not shown.',
      events: [],
    };
  }
  const partial = failed > 0 ? ` I could not check ${failed} of them just now.` : '';
  return {
    state: 'ok',
    plain: events.length
      ? `${events.length} report${events.length === 1 ? '' : 's'} in the next ${horizon} days on your names.${partial}`
      : `No reports in the next ${horizon} days on your names.${partial}`,
    events,
  };
}

/**
 * The alert a member switched on, as the sentence Home can repeat back.
 * "Alert me when PURR breaks 24.40" → "when PURR breaks 24.40". Words that do
 * not start with a recognisable ask give null, and the phone repeats them as
 * written instead of rephrasing them into a promise.
 */
export function watchClause(naturalLanguage: string | null | undefined): string | null {
  const s = String(naturalLanguage ?? '').trim().replace(/[.!]+$/, '');
  if (!s) return null;
  const m = /^(?:please\s+)?(?:alert|tell|notify|ping|warn|text)\s+me\s+(when|if|once)\s+(.+)$/i.exec(s)
    ?? /^let\s+me\s+know\s+(when|if|once)\s+(.+)$/i.exec(s);
  if (m) return `${m[1].toLowerCase()} ${m[2]}`;
  return null;
}
