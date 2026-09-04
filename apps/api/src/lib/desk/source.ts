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
import type {
  DeskCatalyst, DeskPick, DeskTheme, DeskThemeLead, DeskWatchRow, IdeaGrade, WatchState,
} from '@shared/desk';

export { kaiSource, type KaiSource };

const GRADES = ['A+', 'A', 'B+', 'B', 'C', 'D'] as const;
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
};

export type StatusRow = {
  ticker: string; theme: string | null; state: string | null;
  state_since: string | null; price: number | null; trigger_price: number | null;
  invalidation: number | null; source: string | null; updated_at: string | null;
  pick_date: string | null;
};

type ThemeRow = {
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
    marketCap: r.market_cap,
    falsifier: r.falsifier,
    revisitWhen: r.revisit_when,
    catalysts: catalysts(r.catalysts),
    why: strings(r.why),
    blockers: strings(r.blockers),
    hypothesis: r.hypothesis,
    thesis: r.thesis,
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
  return shapeWatchlist(status, picks);
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
  const rank = (g: IdeaGrade | null) => (g ? GRADES.indexOf(g) : GRADES.length);
  rows.sort((a, b) =>
    (a.source === b.source ? 0 : a.source === 'pick' ? -1 : 1) ||
    rank(a.grade) - rank(b.grade) ||
    a.ticker.localeCompare(b.ticker));

  const asOf = status.reduce<string | null>(
    (max, s) => (s.updated_at && (!max || s.updated_at > max) ? s.updated_at : max), null);
  return { asOf, rows };
}

/** Every write-up for one company, newest first. Empty if the desk never wrote it. */
export async function loadPicksForTicker(src: KaiSource, ticker: string): Promise<DeskPick[]> {
  const rows = await readAll<PickRow>(
    src, 'brain_picks', `select=*&ticker=eq.${encodeURIComponent(ticker.toUpperCase())}`);
  return [...rows].sort(byDateDesc).map(toPick);
}

function toTheme(r: ThemeRow): DeskTheme {
  return {
    theme: r.theme,
    magnitude: r.magnitude,
    timeline: r.timeline,
    conviction: r.conviction,
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
  const themes = rows.map(toTheme)
    .sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0) || a.theme.localeCompare(b.theme));
  return { asOf, themes };
}

export async function loadTheme(src: KaiSource, theme: string): Promise<DeskTheme | null> {
  const rows = await readAll<ThemeRow>(
    src, 'theme_history',
    `select=*&theme=eq.${encodeURIComponent(theme)}&order=as_of.desc&limit=1`);
  return rows[0] ? toTheme(rows[0]) : null;
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
