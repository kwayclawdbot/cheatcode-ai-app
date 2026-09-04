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

/** A+ down to D. The grade is on the IDEA, not on this quarter's trade. */
export const IdeaGrade = z.enum(['A+', 'A', 'B+', 'B', 'C', 'D']);
export type IdeaGrade = z.infer<typeof IdeaGrade>;

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
  price: z.number().nullable(),
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

export const DeskWatchlistResponse = z.object({
  asOf: z.string().nullable(),
  rows: z.array(DeskWatchRow),
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
  marketCap: z.number().nullable(),
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

export const DeskPickResponse = z.object({
  pick: DeskPick,
  /** Other things the desk wrote about this same company, newest first. */
  alsoWrittenUp: z.array(z.object({
    theme: z.string(),
    pickDate: z.string().nullable(),
    grade: IdeaGrade.nullable(),
    status: z.string().nullable(),
  })),
});
export type DeskPickResponse = z.infer<typeof DeskPickResponse>;

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
  })),
  /** Companies a write-up said fit this theme better than what it was handed. */
  leads: z.array(DeskThemeLead),
});
export type DeskThemeResponse = z.infer<typeof DeskThemeResponse>;
