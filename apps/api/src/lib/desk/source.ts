/**
 * The research desk's tables, read out of the brain's database.
 *
 * `ryprohqthwflinadqotj` is the same project the SMS scanner lives in, reached
 * the same way — `kaiSource()` / `readAll()` from the swing lane, env-driven,
 * no host or key written down in this repo.
 *
 * READS are everything except one. The desk writes its own picks; this app
 * does not second-guess them, cannot edit a thesis, cannot change a grade and
 * cannot delete a row. The single exception is `addManualWatch`, which puts a
 * ticker YOU chose onto the watchlist — the same thing `watchlist.py --add`
 * does — and is deliberately the only function in this module that issues
 * anything but GET. It is scoped to `source: 'manual'` rows so it can never
 * overwrite a pick the desk argued for.
 *
 * Note for whoever touches this next: the key in `KAI_SUPABASE_KEY` has full
 * write and delete on these tables — RLS on the brain's schema is open. That
 * is why the key stays server-side and no route here forwards it.
 */
import { kaiSource, readAll, type KaiSource } from '../swing/source';
import { attachLiveQuotes, quoteFor } from '../market/live';
import type {
  DeskCatalyst, DeskCompany, DeskPick, DeskTheme, DeskThemeLead, DeskWatchRow, IdeaGrade,
  PickOutcome, WatchState,
} from '@shared/desk';
import { IDEA_GRADE_SCALE, gradeRank } from '@shared/desk';

export { kaiSource, type KaiSource };

/**
 * The grade ladder, read from the contract rather than kept here.
 *
 * There used to be a second copy on this line reading `['A+','A','B+','B','C',
 * 'D']`, and it was the reason every A-, B- and C+ the analyst wrote was thrown
 * away on the way to the app. One list, one order, one place to widen it.
 */
const GRADES = IDEA_GRADE_SCALE;
const OUTCOMES = ['hit', 'miss', 'not_scored'] as const;
const STATES = [
  'no_base', 'coiled', 'armed', 'triggered', 'failed',
  'invalidated', 'extended', 'cooled', 'expired',
] as const;

/**
 * The sentinel `parse_call` stores when a write-up stopped before its CALL
 * line. Sixteen of nineteen "rejections" on 4 September were this. It is kept
 * verbatim in the brain, so it is matched verbatim here — an unfinished
 * argument must never reach a screen dressed as a decision.
 */
const NO_CALL_LINE =
  'no CALL line was emitted — the argument is stored, but the desk did not ' +
  'state a claim in the required form';

export type PickRow = {
  ticker: string; company: string | null; theme: string | null;
  theme_rank: number | null; pick_date: string | null; direction: string | null;
  horizon: string | null; status: string | null; idea_grade: string | null;
  idea_grade_why: string | null; score: number | null; market_cap: number | null;
  falsifier: string | null; revisit_when: string | null; catalysts: unknown;
  why: unknown; blockers: unknown; hypothesis: string | null; thesis: string | null;

  /*
   * The scoreboard columns. All of them are real columns on `brain_picks` and
   * all of them are `double precision` / `text` / `timestamptz` — checked
   * against the live schema on 5 September rather than assumed:
   *
   *   entry_price          double precision   the stock's close on the pick date
   *   entry_benchmark      double precision   SPY's close on that same date
   *   return_pct           double precision   the move at the horizon
   *   excess_pct           double precision   that move minus SPY's
   *   outcome              text               hit | miss | not_scored
   *   graded_at            timestamptz        when it was settled
   *
   * On that day 31 of 32 rows carried an entry price and a benchmark, and
   * ZERO carried a return, an excess or an outcome — nothing has reached its
   * horizon yet. That is the normal state of this table and the screen is
   * built for it.
   */
  entry_price: number | null; entry_benchmark: number | null;
  return_pct: number | null; excess_pct: number | null;
  outcome: string | null; graded_at: string | null;

  /*
   * Provenance. `revisit_count` is NOT NULL in the schema and reads 0 on every
   * row because nothing in the brain increments it; `nominated_by` is null on
   * every row because nothing feeds nominations back in. `news_90d` is the
   * only one of the three that is actually populated.
   */
  revisit_count: number | null; revisit_checked_at: string | null;
  news_90d: number | null; nominated_by: string | null;
  /**
   * THE COLUMN DOES NOT EXIST YET. `select=*` simply does not return it, so
   * this is `undefined` on every row today and the mapping below turns that
   * into null. The screen has a place waiting for it. When the brain starts
   * writing `potential_move_pct` — a percentage, the distance the desk thinks
   * the name could travel — it arrives here and appears with no app change.
   */
  potential_move_pct?: number | null;
};

export type StatusRow = {
  ticker: string; theme: string | null; state: string | null;
  state_since: string | null; price: number | null; trigger_price: number | null;
  invalidation: number | null; source: string | null; updated_at: string | null;
  pick_date: string | null;
};

export type ThemeRow = {
  as_of: string; theme: string; magnitude: number | null; timeline: string | null;
  conviction: number | null; trajectory: string | null; reason: string | null;
  out_of_favour: boolean | null; entries_total: number | null;
  entries_7d: number | null; mined: boolean | null; tickers: unknown;
};

type NominationRow = {
  ticker: string; theme: string | null; reason: string | null;
  nominated_by: string | null; nominated_on: string | null; scored_on: string | null;
};

export const grade = (v: string | null): IdeaGrade | null =>
  v && (GRADES as readonly string[]).includes(v) ? (v as IdeaGrade) : null;

/**
 * The settled verdict, or nothing.
 *
 * Matched against the three words the brain actually writes, exactly like the
 * grade is. Anything else — a word from a future version, a stray string —
 * reads as "not settled" rather than being promoted onto the scoreboard, which
 * is the failure mode that would put a verdict on a screen that nobody reached.
 */
export const outcome = (v: string | null): PickOutcome | null =>
  v && (OUTCOMES as readonly string[]).includes(v) ? (v as PickOutcome) : null;

/** A number the brain wrote, or null. Never coerced from a string. */
export const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export const state = (v: string | null): WatchState =>
  v && (STATES as readonly string[]).includes(v) ? (v as WatchState) : 'no_base';

const direction = (v: string | null): 'long' | 'short' | 'pass' | null =>
  v === 'long' || v === 'short' || v === 'pass' ? v : null;

/** `why` and `blockers` are jsonb arrays; be forgiving about what comes back. */
export function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

export function catalysts(v: unknown): DeskCatalyst[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c) => {
    if (!c || typeof c !== 'object') return [];
    const { when, what } = c as { when?: unknown; what?: unknown };
    if (typeof when !== 'string' || typeof what !== 'string') return [];
    return [{ when, what }];
  });
}

/** Newest pick_date wins; a row with no date sorts last. */
const byDateDesc = (a: { pick_date: string | null }, b: { pick_date: string | null }) =>
  (b.pick_date ?? '').localeCompare(a.pick_date ?? '');

export function toPick(r: PickRow): DeskPick {
  return {
    ticker: r.ticker,
    company: r.company,
    theme: r.theme,
    themeRank: r.theme_rank,
    pickDate: r.pick_date,
    direction: direction(r.direction),
    horizon: r.horizon,
    status: r.status,
    grade: grade(r.idea_grade),
    gradeWhy: r.idea_grade_why,
    score: r.score,
    // A number the brain does not compute yet reads as null, never as zero and
    // never as something derived from market cap or the theme's size. A
    // plausible wrong figure here would be worse than an empty one.
    potentialMovePct: typeof r.potential_move_pct === 'number' ? r.potential_move_pct : null,
    marketCap: r.market_cap,
    falsifier: r.falsifier,
    revisitWhen: r.revisit_when,
    catalysts: catalysts(r.catalysts),
    why: strings(r.why),
    blockers: strings(r.blockers),
    hypothesis: r.hypothesis,
    thesis: r.thesis,

    // The scoreboard, read off the row and nowhere else. `score` is not a
    // return, `market_cap` is not a return, and neither is ever allowed to
    // fill one of these slots — that substitution is exactly the bug that put
    // "Move potential 0.597" on a screen, and it is what desk-test pins down.
    entryPrice: num(r.entry_price),
    entryBenchmark: num(r.entry_benchmark),
    returnPct: num(r.return_pct),
    excessPct: num(r.excess_pct),
    outcome: outcome(r.outcome),
    gradedAt: r.graded_at ?? null,

    revisitCount: num(r.revisit_count),
    revisitCheckedAt: r.revisit_checked_at ?? null,
    news90d: num(r.news_90d),
    nominatedBy: r.nominated_by?.trim() || null,

    unfinished: r.falsifier === NO_CALL_LINE,
  };
}

/**
 * The watchlist: what the price is doing, joined to why the name is there.
 *
 * `watchlist_status` is keyed on ticker and holds the CURRENT reading, which
 * is overwritten every refresh. The argument behind the name lives in
 * `brain_picks`, one row per ticker per theme — so the join takes the newest
 * pick for the ticker, which is the same rule the brain's own refresh uses.
 */
export async function loadWatchlist(src: KaiSource): Promise<{
  asOf: string | null; rows: DeskWatchRow[];
}> {
  const [status, picks] = await Promise.all([
    readAll<StatusRow>(src, 'watchlist_status', 'select=*'),
    readAll<PickRow>(
      src, 'brain_picks',
      'select=ticker,company,theme,pick_date,direction,horizon,idea_grade,status',
    ),
  ]);
  const shaped = shapeWatchlist(status, picks);
  await priceWatchlist(shaped.rows);
  return shaped;
}

/**
 * PUT A REAL PRICE ON EVERY ROW, IN ONE CALL.
 *
 * `watchlist_status.price` is whatever the brain last wrote — a number with no
 * freshness beside it and, on a list the brain has not refreshed, no age the
 * user can see. The desk screen painted it in market cyan as though it were a
 * quote. So the live price wins when the market can be asked, the stored one
 * survives as the fallback with its own timestamp, and either way the row
 * carries the `quote` that says which of the two it is looking at.
 *
 * One `attachLiveQuotes` for the whole list: one Polygon request however many
 * names are on it. A row we cannot price at all keeps the brain's number and
 * is labelled by its age, because deleting a real number to avoid labelling it
 * is not honesty, it is an empty screen.
 */
async function priceWatchlist(rows: DeskWatchRow[]): Promise<void> {
  const carriers = rows.map((r) => ({
    symbol: r.ticker,
    // The stored reading, shaped like a snapshot so the one fallback path in
    // lib/market/live can measure its age the same way it measures any other.
    quote_snapshot: { price: r.price, source_ts: r.updatedAt },
  }));
  await attachLiveQuotes(carriers);
  rows.forEach((row, i) => {
    const q = quoteFor(carriers[i]);
    row.quote = q;
    if (q.price !== null) row.price = q.price;
  });
}

/**
 * The join and the ordering, with no I/O — this is the part that can be wrong
 * without anything erroring. A ticker written up under three themes must
 * resolve to ONE row carrying its newest argument, and the ordering must put
 * what the desk argued for above what you typed in.
 */
export function shapeWatchlist(
  status: StatusRow[], picks: Pick<PickRow, 'ticker' | 'company' | 'theme' | 'pick_date' | 'direction' | 'horizon' | 'idea_grade'>[],
): { asOf: string | null; rows: DeskWatchRow[] } {
  const newestByTicker = new Map<string, (typeof picks)[number]>();
  for (const p of [...picks].sort(byDateDesc)) {
    if (!newestByTicker.has(p.ticker)) newestByTicker.set(p.ticker, p);
  }

  const rows: DeskWatchRow[] = status.map((s) => {
    const p = newestByTicker.get(s.ticker);
    return {
      ticker: s.ticker,
      company: p?.company ?? null,
      theme: s.theme ?? p?.theme ?? null,
      state: state(s.state),
      stateSince: s.state_since,
      price: s.price,
      triggerPrice: s.trigger_price,
      invalidation: s.invalidation,
      source: s.source === 'manual' ? 'manual' : 'pick',
      grade: grade(p?.idea_grade ?? null),
      horizon: p?.horizon ?? null,
      direction: direction(p?.direction ?? null),
      updatedAt: s.updated_at,
    };
  });

  // Something the desk argued for outranks something added by hand, and within
  // each group the strongest idea comes first. A watchlist sorted by ticker is
  // an address book.
  rows.sort((a, b) =>
    (a.source === b.source ? 0 : a.source === 'pick' ? -1 : 1) ||
    gradeRank(a.grade) - gradeRank(b.grade) ||
    a.ticker.localeCompare(b.ticker));

  const asOf = status.reduce<string | null>(
    (max, s) => (s.updated_at && (!max || s.updated_at > max) ? s.updated_at : max), null);
  return { asOf, rows };
}

/* ------------------------------------------------------------------------ */
/* the research list — companies worth understanding                         */
/* ------------------------------------------------------------------------ */

/**
 * `desk_research`, one row per company per publication day.
 *
 * The desk publishes this list separately from the watchlist because the two
 * answer different questions. `watchlist_status` holds what the desk ACTED on —
 * the brain's own loader filters `direction in ('long','short')` — so a company
 * the desk read, graded and did not take a position in never reached the app at
 * all. Twenty-seven graded companies, about eleven rows. This table is the
 * judgement of the businesses, and it is the thing the Invest lane reads.
 *
 * Same database, same key, same `readAll`. No new env var and no new secret:
 * the brain publishes it into the schema this module already reads.
 */
export type ResearchRow = {
  as_of: string; ticker: string; company: string | null; business_line: string | null;
  idea_grade: string | null; idea_grade_why: string | null; theme: string | null;
  pick_date: string | null; direction: string | null; status: string | null;
  horizon: string | null; entry_price: number | null; entry_stamped_on: string | null;
  potential_move_pct: number | null; potential_move_basis: string | null;
  source_pick: string | null; rank: number | null; created_at: string | null;
};

/** A string the desk actually wrote, or nothing. Whitespace is not a sentence. */
const text = (v: string | null | undefined): string | null => v?.trim() || null;

export function toCompany(r: ResearchRow): DeskCompany {
  return {
    asOf: r.as_of,
    ticker: r.ticker.trim().toUpperCase(),
    company: text(r.company),
    // A blank business line is left blank. The screen omits the element rather
    // than printing a dash, because a dash on this row reads as a company that
    // does nothing rather than as a line the desk has not written yet.
    businessLine: text(r.business_line),
    ideaGrade: grade(text(r.idea_grade)),
    ideaGradeWhy: text(r.idea_grade_why),
    theme: text(r.theme),
    pickDate: text(r.pick_date),
    direction: direction(text(r.direction)),
    status: text(r.status),
    horizon: text(r.horizon),
    // The close on the day the write-up was filed, carried WITH its date. It is
    // not a quote and it is not an entry — nothing downstream may present it as
    // either, and it is the only price on this surface at all.
    entryPrice: num(r.entry_price),
    entryStampedOn: text(r.entry_stamped_on),
    potentialMovePct: num(r.potential_move_pct),
    potentialMoveBasis: text(r.potential_move_basis),
    sourcePick: text(r.source_pick),
    rank: num(r.rank),
  };
}

/**
 * The published day's list, in the desk's own order — no I/O, so this is the
 * part that can be wrong without erroring.
 *
 * Only the newest `as_of` survives. Mixing two publication days would put a
 * fortnight-old grade next to today's under one heading with one date on it,
 * and nothing on the row would say which was which. Within the day the desk's
 * `rank` is the order; a row with no rank sorts after the ranked ones on grade,
 * and an unranked, ungraded row sorts last by ticker rather than jumping the
 * queue on a null.
 */
export function shapeResearch(rows: ResearchRow[]): DeskCompany[] {
  const latest = rows.reduce<string | null>(
    (max, r) => (r.as_of && (!max || r.as_of > max) ? r.as_of : max), null);
  if (!latest) return [];

  const seen = new Set<string>();
  const out: DeskCompany[] = [];
  for (const r of rows) {
    if (r.as_of !== latest) continue;
    const c = toCompany(r);
    // `(as_of, ticker)` is the primary key, so a duplicate cannot happen in the
    // table. It can happen in a payload, and one company printed twice under
    // two grades is a list nobody can trust.
    if (seen.has(c.ticker)) continue;
    seen.add(c.ticker);
    out.push(c);
  }

  const at = (c: DeskCompany) => (c.rank === null ? Number.MAX_SAFE_INTEGER : c.rank);
  out.sort((a, b) =>
    at(a) - at(b) ||
    gradeRank(a.ideaGrade) - gradeRank(b.ideaGrade) ||
    a.ticker.localeCompare(b.ticker));
  return out;
}

/**
 * The table not being there is an honest empty list, not a failure.
 *
 * On 8 September `desk_research` answered `404 PGRST205` — the brain had not
 * created it yet — and the whole watchlist board would have gone to its error
 * state over a section that simply has nothing in it. A missing table means the
 * desk has not published a list; the screen says that in words. ANY OTHER
 * failure still throws, because "the read broke" and "there is nothing to read"
 * are different facts and a screen must not state the second when it means the
 * first.
 */
const NO_SUCH_TABLE = /read failed: 404/;

const notPublished = (e: unknown): boolean =>
  e instanceof Error && NO_SUCH_TABLE.test(e.message);

/**
 * The name the desk PUBLISHED for a company, or nothing.
 *
 * `brain_picks.company` is the raw string off the market-data feed, listing
 * boilerplate and all — "SiTime Corporation Common Stock". The research list is
 * written from cleaned names, so on 8 September the card read "SiTime
 * Corporation" and the write-up it opened read "SiTime Corporation Comm…",
 * which is one company wearing two names inside one tap.
 *
 * The cleaning is NOT redone here. This reads the value the desk published and
 * prefers it; where the desk has published nothing for a ticker, the feed
 * string stands, because a name off the feed beats no name at all.
 */
export async function loadResearchName(
  src: KaiSource, ticker: string,
): Promise<string | null> {
  try {
    const rows = await readAll<{ company: string | null }>(
      src, 'desk_research',
      `select=company&ticker=eq.${encodeURIComponent(ticker.trim().toUpperCase())}` +
      '&order=as_of.desc&limit=1',
    );
    return text(rows[0]?.company ?? null);
  } catch (e) {
    if (notPublished(e)) return null;
    throw e;
  }
}

/** The latest published research list. Empty when the desk has not published. */
export async function loadResearch(src: KaiSource): Promise<DeskCompany[]> {
  try {
    const latest = await readAll<{ as_of: string }>(
      src, 'desk_research', 'select=as_of&order=as_of.desc&limit=1');
    const asOf = latest[0]?.as_of ?? null;
    if (!asOf) return [];

    const rows = await readAll<ResearchRow>(
      src, 'desk_research', `select=*&as_of=eq.${encodeURIComponent(asOf)}&order=rank.asc`);
    return shapeResearch(rows);
  } catch (e) {
    if (notPublished(e)) return [];
    throw e;
  }
}

/** Every write-up for one company, newest first. Empty if the desk never wrote it. */
export async function loadPicksForTicker(src: KaiSource, ticker: string): Promise<DeskPick[]> {
  const rows = await readAll<PickRow>(
    src, 'brain_picks', `select=*&ticker=eq.${encodeURIComponent(ticker.toUpperCase())}`);
  return [...rows].sort(byDateDesc).map(toPick);
}

/**
 * A RUN THAT COULD NOT JUDGE WROTE ITS FAILURE AS A ZERO.
 *
 * On 6 September the theme run lost its credit part way through and stored
 * `magnitude 0, conviction 0` with the reason `NOT JUDGED — ordered by recent
 * activity only` against 25 of the 27 themes behind today's desk. The app read
 * those zeros as readings and drew "How big if it is right — 0.0 of 10" with an
 * empty bar, which is the screen stating the desk's lowest possible judgement
 * about a theme it had scored 7.5 the day before.
 *
 * So the sentence the brain writes when it did not judge is matched here, the
 * same way `NO_CALL_LINE` is matched for a write-up that never reached a call,
 * and the numbers beside it are refused rather than passed on. A theme that was
 * genuinely judged zero still comes through as zero — absence and a low score
 * are different facts and the screen says them differently.
 */
const NOT_JUDGED = /^\s*NOT JUDGED\b/i;

export function toTheme(r: ThemeRow): DeskTheme {
  const judged = !(r.reason && NOT_JUDGED.test(r.reason));
  return {
    theme: r.theme,
    magnitude: judged ? num(r.magnitude) : null,
    timeline: r.timeline,
    conviction: judged ? num(r.conviction) : null,
    // Filled in by `withLastReading` from the row the reading actually came
    // from. A theme mapped on its own carries the day it was written.
    judgedOn: judged && num(r.magnitude) !== null ? r.as_of : null,
    trajectory: r.trajectory,
    reason: r.reason,
    outOfFavour: r.out_of_favour === true,
    entriesTotal: r.entries_total,
    entries7d: r.entries_7d,
    mined: r.mined === true,
    tickers: strings(r.tickers),
  };
}

/**
 * THE LAST READING THE DESK ACTUALLY TOOK, carried onto today's row.
 *
 * A run that could not judge must not erase a judgement that was made. The 6
 * September run ran out of credit and wrote nothing it had scored; the desk had
 * scored AI-Infrastructure-Services 7.5 for size and 7 for conviction the day
 * before, and that is still what the desk thinks. Showing an absence there
 * would throw away a true reading and present the desk as having no opinion,
 * which is its own kind of dishonesty.
 *
 * So the JUDGEMENT — size, timing, conviction, heading, and the sentence
 * explaining it — comes off the last row that was actually judged, and
 * `judgedOn` says which day that was so the screen can never present a reading
 * from the 5th as though it were taken today. Everything that describes
 * CURRENT activity — how many entries, whether it has been mined, the tickers
 * under it — stays on today's row, because those are facts about now and were
 * not affected by the outage.
 */
export function withLastReading(latest: DeskTheme, judged: DeskTheme | null): DeskTheme {
  if (latest.magnitude !== null || !judged) return latest;
  return {
    ...latest,
    magnitude: judged.magnitude,
    timeline: judged.timeline,
    conviction: judged.conviction,
    trajectory: judged.trajectory,
    reason: judged.reason,
    outOfFavour: judged.outOfFavour,
    judgedOn: judged.judgedOn,
  };
}

/**
 * The last judged row for each of these themes, if there is one.
 *
 * `magnitude=not.is.null` throws out the empty rows in the database rather than
 * over the wire; the mapping then throws out any row whose reason says the run
 * did not judge, because for one day in September those rows carried a zero
 * that passed the SQL filter and meant nothing.
 */
async function lastJudged(
  src: KaiSource, themes: string[],
): Promise<Map<string, DeskTheme>> {
  const out = new Map<string, DeskTheme>();
  if (!themes.length) return out;
  // Each value is encoded on its own and the commas are left as commas — they
  // are the list separator PostgREST reads, and encoding them turns a list of
  // themes into one theme with commas in its name.
  const list = themes.map((t) => `"${encodeURIComponent(t).replace(/"/g, '')}"`).join(',');
  const rows = await readAll<ThemeRow>(
    src, 'theme_history',
    `select=*&magnitude=not.is.null&theme=in.(${list})&order=as_of.desc`);
  for (const r of rows) {
    if (out.has(r.theme)) continue;
    const t = toTheme(r);
    if (t.magnitude === null) continue;
    out.set(r.theme, t);
  }
  return out;
}

/**
 * Every live theme from the most recent judging, largest first.
 *
 * Size and timing are never collapsed: the sort is on magnitude alone, and a
 * 5y+ theme sits above a "now" theme when it is bigger. That is the point.
 */
export async function loadThemes(src: KaiSource): Promise<{
  asOf: string | null; themes: DeskTheme[];
}> {
  const latest = await readAll<{ as_of: string }>(
    src, 'theme_history', 'select=as_of&order=as_of.desc&limit=1');
  const asOf = latest[0]?.as_of ?? null;
  if (!asOf) return { asOf: null, themes: [] };

  const rows = await readAll<ThemeRow>(
    src, 'theme_history', `select=*&as_of=eq.${encodeURIComponent(asOf)}`);
  const today = rows.map(toTheme);
  const earlier = await lastJudged(
    src, today.filter((t) => t.magnitude === null).map((t) => t.theme));
  // Sorted on size alone, largest first — on the reading each theme actually
  // has, whichever day it was taken. A theme NOTHING has ever judged is not a
  // small one: it goes last rather than being ranked as though it scored zero,
  // which is the same mistake in the sort that the zero was in the render.
  const size = (t: DeskTheme) => (t.magnitude === null ? -Infinity : t.magnitude);
  const themes = today
    .map((t) => withLastReading(t, earlier.get(t.theme) ?? null))
    .sort((a, b) => size(b) - size(a) || a.theme.localeCompare(b.theme));
  return { asOf, themes };
}

export async function loadTheme(src: KaiSource, theme: string): Promise<DeskTheme | null> {
  const rows = await readAll<ThemeRow>(
    src, 'theme_history',
    `select=*&theme=eq.${encodeURIComponent(theme)}&order=as_of.desc&limit=1`);
  if (!rows[0]) return null;
  const latest = toTheme(rows[0]);
  if (latest.magnitude !== null) return latest;
  const earlier = await lastJudged(src, [theme]);
  return withLastReading(latest, earlier.get(theme) ?? null);
}

/**
 * The running argument behind a theme — dated entries the desk has kept since
 * April, stored as a vault note rather than a table because it is prose.
 */
export async function loadThemeNote(src: KaiSource, theme: string): Promise<string | null> {
  const path = `Kai/Intel/Themes/${theme}.md`;
  const rows = await readAll<{ content: string | null }>(
    src, 'vault_store', `select=content&path=eq.${encodeURIComponent(path)}`);
  return rows[0]?.content ?? null;
}

export async function loadPicksForTheme(src: KaiSource, theme: string): Promise<DeskPick[]> {
  const rows = await readAll<PickRow>(
    src, 'brain_picks', `select=*&theme=eq.${encodeURIComponent(theme)}`);
  return [...rows].sort(byDateDesc).map(toPick);
}

/**
 * Companies a write-up said fit the theme better than the candidate it was
 * handed. Leads, never picks — naming one does not promote it, and `scoredOn`
 * is null on every one of them because nothing feeds them back through the
 * pipeline yet. The screen says so rather than implying they were considered.
 */
export async function loadLeads(src: KaiSource, theme: string): Promise<DeskThemeLead[]> {
  const rows = await readAll<NominationRow>(
    src, 'theme_nominations', `select=*&theme=eq.${encodeURIComponent(theme)}`);
  const seen = new Set<string>();
  const out: DeskThemeLead[] = [];
  for (const r of rows) {
    if (seen.has(r.ticker)) continue;
    seen.add(r.ticker);
    out.push({
      ticker: r.ticker,
      reason: r.reason,
      nominatedBy: r.nominated_by,
      nominatedOn: r.nominated_on,
      scoredOn: r.scored_on,
    });
  }
  return out;
}

/**
 * Put a ticker you chose onto the watchlist.
 *
 * THE ONLY WRITE IN THIS MODULE. It mirrors `watchlist.add_manual()`: a row
 * with `source: 'manual'` and no reading yet, which the brain's next refresh
 * picks up and starts tracking. It cannot touch a pick — `on_conflict=ticker`
 * with a manual payload would overwrite one, so the caller checks first and
 * this function refuses rather than clobbering an argued position.
 */
export async function addManualWatch(
  src: KaiSource, ticker: string, theme?: string,
): Promise<{ added: boolean; reason?: string }> {
  const symbol = ticker.trim().toUpperCase();
  const existing = await readAll<{ ticker: string; source: string | null }>(
    src, 'watchlist_status', `select=ticker,source&ticker=eq.${encodeURIComponent(symbol)}`);
  if (existing.length) {
    return {
      added: false,
      reason: existing[0].source === 'manual'
        ? `${symbol} is already on your watchlist.`
        : `${symbol} is already on the watchlist — the desk wrote it up.`,
    };
  }

  const res = await fetch(`${src.url}/rest/v1/watchlist_status`, {
    method: 'POST',
    headers: {
      apikey: src.key,
      Authorization: `Bearer ${src.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([{
      ticker: symbol,
      source: 'manual',
      theme: theme?.trim() || null,
      state: 'no_base',
      notes: 'added by hand',
      updated_at: new Date().toISOString(),
    }]),
  });
  if (!res.ok) {
    throw new Error(`watchlist add failed: ${res.status} ${await res.text()}`);
  }
  return { added: true };
}
