/**
 * The research desk contract.
 *
 * The desk is a different animal from the rest of this app. An alert is a
 * trade object with a lifecycle; a desk pick is an ARGUMENT with a grade, a
 * horizon in quarters, and a written statement of what would prove it wrong.
 * The two must not be collapsed into one another — a desk pick is not an
 * alert, cannot be traded from, and carries no entry, stop or size.
 *
 * Everything here is read out of the brain's own database. The app is a reader
 * of that work, not a second author of it.
 */
import { z } from 'zod';
import { MarketQuote } from './api';

/**
 * A+ down to D. The grade is on the IDEA, not on this quarter's trade.
 *
 * THE SCALE HAS MODIFIERS AND USED TO NOT SAY SO. This enum was the six bare
 * steps — A+, A, B+, B, C, D — while the analyst has been writing A-, B- and
 * C+ all along. Every one of those landed on `grade()`'s "not on the scale"
 * branch and reached the app as null, so a company the desk graded A- rendered
 * as "ungraded" beside one it never graded at all. A dropped grade and an
 * absent grade are indistinguishable downstream, which is the exact failure
 * this file exists to prevent, so the ladder now carries the modifiers.
 *
 * `IDEA_GRADE_SCALE` is the ORDER, best first, and it is the only place that
 * order is written down — the API's ranking, the watchlist sort and the ruler
 * on the pick screen all read it rather than keeping a copy each.
 */
export const IDEA_GRADE_SCALE = [
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D',
] as const;

export const IdeaGrade = z.enum(IDEA_GRADE_SCALE);
export type IdeaGrade = z.infer<typeof IdeaGrade>;

/**
 * Where a grade sits on the ladder, 0 for A+. An ungraded row sorts LAST —
 * behind a D — because "the desk did not put a mark on it" is less of a
 * recommendation than the lowest mark it does hand out.
 */
export function gradeRank(g: IdeaGrade | null): number {
  return g ? IDEA_GRADE_SCALE.indexOf(g) : IDEA_GRADE_SCALE.length;
}

/** What the price is doing under a name we are holding an argument about. */
export const WatchState = z.enum([
  'no_base', 'coiled', 'armed', 'triggered', 'failed',
  'invalidated', 'extended', 'cooled', 'expired',
]);
export type WatchState = z.infer<typeof WatchState>;

/** Plain English for each state. The screen never invents its own wording. */
export const WATCH_STATE_COPY: Record<WatchState, string> = {
  no_base: 'No base yet — nothing to wait for',
  coiled: 'Coiled — range has compressed',
  armed: 'Armed — there is a level to wait for',
  triggered: 'Cleared the base and holding',
  failed: 'Cleared it, then fell back inside',
  invalidated: 'Went through the level that kills it',
  extended: 'Moved without us',
  cooled: 'Back into a base — re-arm candidate',
  expired: 'The horizon ran out',
};

/**
 * How a settled call actually turned out.
 *
 * Written by the brain's `pick_grading --settle`, and ONLY when the horizon has
 * actually elapsed. `not_scored` is a pass being measured rather than judged —
 * a name the desk read and declined still has a price, and the desk records it
 * so it can tell a good standard from an expensive one, but it never mixes into
 * the hit rate because a pass had no direction to be right about.
 */
export const PickOutcome = z.enum(['hit', 'miss', 'not_scored']);
export type PickOutcome = z.infer<typeof PickOutcome>;

export const DeskCatalyst = z.object({
  when: z.string(),
  what: z.string(),
});
export type DeskCatalyst = z.infer<typeof DeskCatalyst>;

/** One row of the watchlist: what the price is doing, and why we care. */
export const DeskWatchRow = z.object({
  ticker: z.string(),
  company: z.string().nullable(),
  theme: z.string().nullable(),
  state: WatchState,
  stateSince: z.string().nullable(),
  /**
   * The price the row is showing. The live one when the market could be asked,
   * the brain's last stored reading when it could not — `quote` below says
   * which, and when it is from. Never a number without that companion.
   */
  price: z.number().nullable(),
  /**
   * The full quote behind `price`: freshness, the instant it happened, and a
   * sentence naming both. Null only when nothing could be priced at all.
   * Optional so an older client's payload still parses.
   */
  quote: MarketQuote.nullable().optional(),
  triggerPrice: z.number().nullable(),
  invalidation: z.number().nullable(),
  /** 'pick' — the desk argued for it. 'manual' — you added it by hand. */
  source: z.enum(['pick', 'manual']),
  grade: IdeaGrade.nullable(),
  horizon: z.string().nullable(),
  direction: z.enum(['long', 'short', 'pass']).nullable(),
  updatedAt: z.string().nullable(),
});
export type DeskWatchRow = z.infer<typeof DeskWatchRow>;

/**
 * A COMPANY THE DESK THINKS IS WORTH UNDERSTANDING.
 *
 * This is the research list, and it is a different object from a watchlist row
 * on purpose. A watchlist row is a chart being tracked against levels; this is
 * a business with a grade and a one-line description of what it actually does.
 *
 * WHY IT HAD TO BE ITS OWN TABLE. The watchlist only ever held what the desk
 * ACTED on — the brain's `load_watchlist()` filters `direction in ('long',
 * 'short')` — so of twenty-seven graded companies about eleven reached the app,
 * several of them pointing at ungraded write-ups and rendering with no mark at
 * all. The desk's judgement of a business is not the same event as the desk
 * taking a position in it, and the Invest lane wants the first one.
 *
 * NOTHING HERE IS A TRADE. There is no stop, no target, no trigger and no
 * price to act at, and none may be added: the horizon is years, and a number to
 * act on today is the one thing that would turn this back into an alert.
 * `entryPrice` is the CLOSE ON THE DAY THE DESK FILED ITS WRITE-UP, carried
 * with `entryStampedOn` so it can never be shown as a live quote or as an
 * entry — it exists to date the argument, and a screen that prints one without
 * the other is misreading it.
 */
export const DeskCompany = z.object({
  /** The day this list was published. The app reads the latest one only. */
  asOf: z.string(),
  ticker: z.string(),
  company: z.string().nullable(),
  /**
   * What the business does, in one line, written by the desk.
   *
   * Null when the desk did not write one — and the screen then says nothing
   * rather than printing a dash, because a dash in this slot reads as a company
   * that does nothing.
   */
  businessLine: z.string().nullable(),
  ideaGrade: IdeaGrade.nullable(),
  ideaGradeWhy: z.string().nullable(),
  theme: z.string().nullable(),
  /** The day the underlying write-up was filed. */
  pickDate: z.string().nullable(),
  direction: z.enum(['long', 'short', 'pass']).nullable(),
  status: z.string().nullable(),
  horizon: z.string().nullable(),
  /** The close on `entryStampedOn`. NOT a live price and NOT an entry. */
  entryPrice: z.number().nullable(),
  entryStampedOn: z.string().nullable(),
  potentialMovePct: z.number().nullable(),
  /** In the desk's own words, what that percentage was measured against. */
  potentialMoveBasis: z.string().nullable(),
  /** The write-up this row was built from — provenance, not a second opinion. */
  sourcePick: z.string().nullable(),
  /** The desk's own ordering of the list. Null sorts last. */
  rank: z.number().nullable(),
});
export type DeskCompany = z.infer<typeof DeskCompany>;

export const DeskWatchlistResponse = z.object({
  asOf: z.string().nullable(),
  rows: z.array(DeskWatchRow),
  /**
   * The research list, best idea first. Defaulted so a response written before
   * this field existed — an older server, a cached payload — still parses
   * instead of failing the whole board over a section that is merely absent.
   * Empty means the desk has not published a list, and the screen says exactly
   * that; it never fills the space with the watchlist rows instead.
   */
  companies: z.array(DeskCompany).default([]),
});
export type DeskWatchlistResponse = z.infer<typeof DeskWatchlistResponse>;

export const DeskWatchAddRequest = z.object({
  ticker: z.string().trim().min(1).max(10).regex(
    /^[A-Za-z][A-Za-z0-9.\-]*$/,
    'A ticker is letters, digits, dots and hyphens — nothing else.',
  ),
  theme: z.string().trim().max(80).optional(),
});
export type DeskWatchAddRequest = z.infer<typeof DeskWatchAddRequest>;

/**
 * A theme is judged, never counted. Size and timing are scored separately and
 * are never averaged into one number — nothing is marked down for being years
 * out, because marking something down for being early is the failure the desk
 * exists to avoid.
 */
export const DeskTheme = z.object({
  theme: z.string(),
  /** 0–10 at the theme's CEILING, not its expected value. */
  magnitude: z.number().nullable(),
  timeline: z.string().nullable(),
  conviction: z.number().nullable(),
  /**
   * The day the reading beside it was actually taken.
   *
   * THE READING IS NOT ALWAYS FROM THE LATEST RUN, and the date is how the
   * screen stays honest about that. The 6 September theme run ran out of credit
   * part way through and stored zeros — later corrected to nulls — against 25
   * of the 27 themes behind the desk. A theme the desk scored 7.5 on the 5th
   * still has that reading, and throwing it away because a later run could not
   * repeat it would make the desk look as though it had no opinion. So the last
   * REAL reading is what is shown, carrying the day it was made.
   *
   * Null means nothing about this theme has ever been judged, and then there is
   * no number to date — the screen says so in words.
   */
  judgedOn: z.string().nullable().default(null),
  trajectory: z.string().nullable(),
  reason: z.string().nullable(),
  /** A big theme cooling off is often the entry, not a reason to look away. */
  outOfFavour: z.boolean(),
  entriesTotal: z.number().nullable(),
  entries7d: z.number().nullable(),
  mined: z.boolean(),
  tickers: z.array(z.string()),
});
export type DeskTheme = z.infer<typeof DeskTheme>;

/**
 * The full write-up. `thesis` is the argument in light markdown; everything
 * else is the part of it the desk committed to in a fixed shape.
 */
export const DeskPick = z.object({
  ticker: z.string(),
  company: z.string().nullable(),
  theme: z.string().nullable(),
  themeRank: z.number().nullable(),
  pickDate: z.string().nullable(),
  direction: z.enum(['long', 'short', 'pass']).nullable(),
  horizon: z.string().nullable(),
  status: z.string().nullable(),
  grade: IdeaGrade.nullable(),
  gradeWhy: z.string().nullable(),
  score: z.number().nullable(),
  /**
   * How far the desk thinks this could travel, as a percentage.
   *
   * NOTHING WRITES THIS YET. The brain has no column for it; the app reads it
   * as null and the screen shows an empty measure that says so in words. It is
   * declared here so the day the brain writes `potential_move_pct` the number
   * appears with no further work in the app.
   *
   * `score` is NOT this and must never be shown as if it were. `score` is the
   * 0-to-1 number the desk ranks candidates by — it has no units, it is not a
   * price and it is not a return. The screen that labelled it "Move potential"
   * was wrong, and that label is gone.
   */
  potentialMovePct: z.number().nullable(),
  marketCap: z.number().nullable(),

  /* ── the scoreboard ────────────────────────────────────────────────
   *
   * For an accumulation system this is the only thing that settles an
   * argument. The desk stamps the price it was looking at ON THE DAY it made
   * the claim, together with what the S&P 500 was at that same moment, and
   * then measures both again when the horizon has actually run out.
   *
   * The reason the entry is stamped on the day rather than reconstructed
   * later: rebuild it in six months from an adjusted price series and you are
   * grading the desk against a number it never saw.
   *
   * NOTHING IN THE APP COMPUTES ANY OF THESE. Every one is read off the row.
   * Where the brain has not settled a call, they are null and the screen says
   * why — a horizon that has not run out yet is not a result, and a blank is
   * not a zero.
   */

  /** The stock's closing price on the day the desk made the claim. */
  entryPrice: z.number().nullable(),
  /**
   * The S&P 500's closing price on that SAME day. A price, not a percentage,
   * and useless on its own — it exists so the market's move over the holding
   * period can be measured from the same starting line as the idea's.
   */
  entryBenchmark: z.number().nullable(),
  /** What the idea made or lost by the end of its horizon, as a percentage. */
  returnPct: z.number().nullable(),
  /**
   * The same period's move MINUS the S&P 500's. This is the scoreboard.
   *
   * A long that made 4% in a quarter the market made 9% was right about
   * nothing, and only this number says so.
   */
  excessPct: z.number().nullable(),
  /** Hit, miss, or measured-but-not-scored. Null until the horizon elapses. */
  outcome: PickOutcome.nullable(),
  /** When the call was settled. Null means it has not been. */
  gradedAt: z.string().nullable(),

  /* ── provenance: how much attention this idea has had ───────────── */

  /**
   * How many times the desk has come back to this write-up.
   *
   * The column is NOT NULL and every row in the brain reads 0, because nothing
   * in the brain increments it yet. The screen says "never revisited" and says
   * why, rather than presenting a zero as a measurement.
   */
  revisitCount: z.number().nullable(),
  /** When something last came back to it. Null on every row today. */
  revisitCheckedAt: z.string().nullable(),
  /**
   * How many news items the search found about this company in the 90 days
   * before it was written up.
   *
   * A RAW COUNT AND NOTHING ELSE. It only means something against how big the
   * company is — twelve articles is silence for a trillion-dollar platform and
   * a crowd for a $400m manufacturer — and the desk makes that comparison
   * itself, in the evidence list, when it counted. The app does not redo it.
   */
  news90d: z.number().nullable(),
  /**
   * The ticker of the write-up that named this company as a better fit.
   *
   * Provenance, not endorsement: it says where the idea came from, not that
   * anything scored it. Null on every row today — nothing feeds nominations
   * back into the pipeline yet.
   */
  nominatedBy: z.string().nullable(),

  /** The single thing that would prove the argument wrong. */
  falsifier: z.string().nullable(),
  /** For a pass: the measurable thing that brings it back. */
  revisitWhen: z.string().nullable(),
  catalysts: z.array(DeskCatalyst),
  /** What the screen computed in its favour, and against. */
  why: z.array(z.string()),
  blockers: z.array(z.string()),
  /** The description the search matched to find it. */
  hypothesis: z.string().nullable(),
  thesis: z.string().nullable(),
  /**
   * True when the write-up stopped before stating a call. Not a rejection —
   * an argument that ran out of room. The screen must say so rather than
   * render it as a decision the desk made.
   */
  unfinished: z.boolean(),
});
export type DeskPick = z.infer<typeof DeskPick>;

/**
 * When a call is due to be settled, from the desk's own rule.
 *
 * This is NOT a market number and nothing is inferred from it. It restates one
 * line of the brain's `pick_grading.py` — `HORIZON_DAYS = {1q: 91, 2q: 182,
 * 4q: 365}`, counted from the day the write-up was filed — so that a blank
 * scoreboard can say WHY it is blank instead of just being empty.
 *
 * Returns null when the desk wrote no horizon, and that is the honest answer
 * for twelve of the thirty-two write-ups: with no horizon there is no date the
 * settler will ever act on, so those calls can never be settled at all. The
 * screen says exactly that rather than leaving the reader to guess.
 */
const HORIZON_DAYS: Record<string, number> = { '1q': 91, '2q': 182, '4q': 365 };

export function settlesOn(pickDate: string | null, horizon: string | null): string | null {
  if (!pickDate || !horizon) return null;
  const days = HORIZON_DAYS[horizon.trim().toLowerCase()];
  if (!days) return null;
  const d = new Date(`${pickDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const DeskPickResponse = z.object({
  pick: DeskPick,
  /** Other things the desk wrote about this same company, newest first. */
  alsoWrittenUp: z.array(z.object({
    theme: z.string(),
    pickDate: z.string().nullable(),
    grade: IdeaGrade.nullable(),
    status: z.string().nullable(),
  })),
  /**
   * The theme's OWN judgement, carried onto the pick.
   *
   * How big the claim is and when it lands are properties of the theme, not of
   * the company, and the pick screen has to show both — so it reads them off
   * the theme table rather than inferring anything from the pick. Null when
   * the pick has no theme, or the theme is no longer being judged.
   */
  themeJudgement: DeskTheme.nullable().default(null),
});
export type DeskPickResponse = z.infer<typeof DeskPickResponse>;


export const DeskThemesResponse = z.object({
  asOf: z.string().nullable(),
  themes: z.array(DeskTheme),
});
export type DeskThemesResponse = z.infer<typeof DeskThemesResponse>;

export const DeskThemeLead = z.object({
  ticker: z.string(),
  reason: z.string().nullable(),
  nominatedBy: z.string().nullable(),
  nominatedOn: z.string().nullable(),
  /** Null until something scores it. The nomination loop is not closed yet. */
  scoredOn: z.string().nullable(),
});
export type DeskThemeLead = z.infer<typeof DeskThemeLead>;

export const DeskThemeResponse = z.object({
  theme: DeskTheme,
  /** The running argument — dated entries the desk has kept since April. */
  note: z.string().nullable(),
  /** Every company the desk wrote up under this theme, newest first. */
  writtenUp: z.array(z.object({
    ticker: z.string(),
    company: z.string().nullable(),
    grade: IdeaGrade.nullable(),
    status: z.string().nullable(),
    direction: z.enum(['long', 'short', 'pass']).nullable(),
    pickDate: z.string().nullable(),
    themeRank: z.number().nullable(),
    /**
     * How it actually turned out, once the horizon ran out. Null on every
     * write-up the desk has made so far — the oldest is months short of its
     * first settlement date — so the list says that plainly instead of
     * leaving a column of blanks nobody can explain.
     */
    outcome: PickOutcome.nullable(),
    /** The move against the S&P 500 over the holding period. */
    excessPct: z.number().nullable(),
  })),
  /** Companies a write-up said fit this theme better than what it was handed. */
  leads: z.array(DeskThemeLead),
});
export type DeskThemeResponse = z.infer<typeof DeskThemeResponse>;
