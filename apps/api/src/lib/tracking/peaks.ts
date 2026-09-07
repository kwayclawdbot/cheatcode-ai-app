/**
 * THE PEAK TRACKER. What the app writes down while a call is still running.
 *
 * Before this existed the app called a trade and then forgot about it until the
 * engine graded it days later. The only record of "the best it ever got" was a
 * percentage in `score_components.outcome.mfe_5d_pct` — a number with no price
 * and no clock attached — so History could say "+22.9%" and could never say
 * "peak $27.91". This runs inside the *\/5 resolver pass and writes the extremes
 * down as they happen, as PRICES, with the time they were seen and the quality
 * of the evidence behind them.
 *
 * IT IS NOT A SECOND CRON. It is a second half of the pass that was already
 * running, sharing that pass's Polygon call. See COST below.
 *
 * =====================================================================
 * THE ACTIVE PERIOD — what "while it is running" means
 * =====================================================================
 * A call is tracked from when it was made until something ENDS it, and there
 * are four endings, recorded in `setups.resolution_kind`:
 *
 *   stop_met          the price reached the published stop
 *   target_met        the price reached the published target
 *   contract_expired  a day-trade option call reached its contract's expiry —
 *                     the only ending that family has, because it publishes no
 *                     stop and no target
 *   expired           nothing was reached and `valid_until` ran out. An ending,
 *                     NOT a result: the call was neither right nor wrong.
 *
 * THE STOP IS CHECKED BEFORE THE TARGET, the same way `legHit()` does it for a
 * member's call. Here we hold a session's high AND low rather than one price,
 * so a session that touched both levels genuinely did touch both, and we still
 * cannot know which came first. The pessimistic reading stays the honest one.
 *
 * The five-session window in `score_components.outcome` IS NOT the active
 * period. That is a SCORING convention — every family measured close-to-close
 * at five sessions so families can be compared — and it must not truncate
 * tracking. A swing call that runs eleven days to its target is tracked for
 * eleven days.
 *
 * =====================================================================
 * COST — one Polygon call per pass, no matter how much is active
 * =====================================================================
 * Everything active, house and member, is priced from ONE
 * `/v2/snapshot/locale/us/markets/stocks/tickers` request. `getSessionExtremes`
 * and the resolver's own `getSnapshot` read the same cached response
 * (`snapTickerCache` in `market/polygon.ts`), so whichever runs first pays and
 * the other is free. With nothing active the pass makes ZERO calls: the symbol
 * list is empty and the request is never sent.
 *
 * Two things cost extra, and both are once-per-row rather than once-per-pass:
 *   - SEEDING a row whose history predates tracking: one daily-bars call, the
 *     first time that row is ever seen, and never again.
 *   - GRADING a contract at its expiry: one daily-bars call, once, ever.
 *
 * =====================================================================
 * SEEDING, AND WHY A SEEDED PEAK SAYS SO
 * =====================================================================
 * Rows that were already running when this shipped have a past nobody watched.
 * It can only be reconstructed from DAILY BARS, whose high is a real high but
 * is dated to a session rather than to a minute. A live pass sees the running
 * session high within five minutes of it happening. Those are different
 * qualities of evidence, so the row records which one it holds in
 * `high_basis` / `low_basis` — 'daily_bar' or 'session' — and the History card
 * says it out loud rather than passing a daily-bar high off as a tick.
 *
 * THE BARS ARE UNADJUSTED. `fetchDailyBarsUnadjusted` exists for this and its
 * header explains the split that once minted a fake 15x here. A call made
 * before a split has to be measured in the share terms it was made in.
 */
import { serviceClient } from '../db';
import { log } from '../log';
import { fetchDailyBarsUnadjusted, getSessionExtremes } from '../market/polygon';

/** How many rows of each kind one pass will touch. Same reasoning as the
 *  resolver's own BATCH: a pass must finish inside its function timeout rather
 *  than half-write, and oldest-looked-at first means a backlog drains. */
const BATCH = 300;

export type PeakReport = {
  tracked_setups: number;
  tracked_calls: number;
  seeded: number;
  extremes_written: number;
  resolved: number;
  contracts_identified: number;
  contracts_graded: number;
  polygon_extra_calls: number;
  plain: string;
};

type SetupRow = {
  id: string;
  symbol: string;
  intent: string;
  state: string;
  stop: number | null;
  targets: unknown;
  valid_until: string | null;
  created_at: string;
  call_price: number | null;
  high_price: number | null;
  high_at: string | null;
  low_price: number | null;
  low_at: string | null;
  last_tracked_at: string | null;
  tracking_seeded_at: string | null;
  resolution_kind: string | null;
  score_components: unknown;
  contract_ticker: string | null;
  contract_cost: number | null;
  contract_expiry: string | null;
};

const SETUP_COLUMNS =
  'id,symbol,intent,state,stop,targets,valid_until,created_at,call_price,' +
  'high_price,high_at,low_price,low_at,last_tracked_at,tracking_seeded_at,' +
  'resolution_kind,score_components,contract_ticker,contract_cost,contract_expiry';

type CallTrackRow = {
  id: string;
  symbol: string;
  direction: string;
  published_at: string;
  high_price: number | null;
  high_at: string | null;
  low_price: number | null;
  low_at: string | null;
  tracking_seeded_at: string | null;
};

const CALL_TRACK_COLUMNS =
  'id,symbol,direction,published_at,high_price,high_at,low_price,low_at,tracking_seeded_at';

/** A short is `sell_short` / `buy_to_cover`; everything else is long. The same
 *  test the database's generated `peak_price` column makes — kept in one
 *  function here so the code side asks it once too. */
function isShortIntent(intent: string | null | undefined): boolean {
  return intent === 'sell_short' || intent === 'buy_to_cover';
}

/** The calendar day in New York. Bars are dated by session, and a session is a
 *  New York day — using UTC here puts an 8pm ET print on tomorrow. */
function etDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The best and worst prices in a run of daily bars, each with the SESSION it
 * happened in. The timestamp is the bar's own date, not the moment we asked —
 * a seeded extreme is dated to when it actually occurred, and `basis` says the
 * precision is a session rather than a minute.
 */
export function extremesFromBars(
  bars: { ts: string; h: number | null; l: number | null }[]
): { high: number; highAt: string; low: number; lowAt: string } | null {
  let high: number | null = null;
  let highAt = '';
  let low: number | null = null;
  let lowAt = '';
  for (const b of bars) {
    if (b.h !== null && b.h > 0 && (high === null || b.h > high)) {
      high = b.h;
      highAt = b.ts;
    }
    if (b.l !== null && b.l > 0 && (low === null || b.l < low)) {
      low = b.l;
      lowAt = b.ts;
    }
  }
  if (high === null || low === null) return null;
  return { high, highAt, low, lowAt };
}

/**
 * Merge one observation into what the row already holds, NEVER regressing.
 *
 * A high is only replaced when it is beaten, and when it is beaten the time and
 * the basis are replaced with it. That is what keeps `high_basis` honest with
 * no extra bookkeeping: the basis on the row always describes the observation
 * that set the value standing there.
 *
 * Returns null when nothing improved, so a pass that saw no new extreme writes
 * no row.
 */
export function mergeExtremes(
  row: { high_price: number | null; low_price: number | null },
  seen: { high: number; highAt: string; low: number; lowAt: string; basis: 'session' | 'daily_bar' }
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  if (row.high_price === null || seen.high > row.high_price) {
    patch.high_price = seen.high;
    patch.high_at = seen.highAt;
    patch.high_basis = seen.basis;
  }
  if (row.low_price === null || seen.low < row.low_price) {
    patch.low_price = seen.low;
    patch.low_at = seen.lowAt;
    patch.low_basis = seen.basis;
  }
  return Object.keys(patch).length ? patch : null;
}

/* ------------------------------------------------------------------ */
/* The option contract a day trade named                                */
/* ------------------------------------------------------------------ */

/**
 * The Polygon option ticker for a named contract — `O:MRNA260821C00120000`.
 *
 * Assembled from the underlying, the expiry, the side and the strike: six
 * digits of YYMMDD, one letter, then the strike in thousandths padded to eight
 * digits. It is stored on the row the first time it is built so that a contract
 * we have already priced can never be re-derived into a different string by a
 * later change in this function.
 */
export function optionTicker(
  underlying: string,
  expiryIso: string,
  kind: 'call' | 'put',
  strike: number
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryIso)) return null;
  if (!Number.isFinite(strike) || strike <= 0) return null;
  const yymmdd = expiryIso.slice(2, 4) + expiryIso.slice(5, 7) + expiryIso.slice(8, 10);
  const thousandths = Math.round(strike * 1000);
  return `O:${underlying.toUpperCase()}${yymmdd}${kind === 'put' ? 'P' : 'C'}${String(thousandths).padStart(8, '0')}`;
}

/**
 * What the ingest said about the contract, if it said enough to price one.
 *
 * The strike, the side and the cost come from `recommended_options[0]`, whose
 * own `expiry` is a DISPLAY string ("Aug 21") and is deliberately not parsed —
 * a year-less label is not a date. The real ISO expiry comes from
 * `uoa.expiries`, and only when that array holds exactly ONE date: two expiries
 * and there is no honest way to say which contract the row means, so it is left
 * alone rather than guessed at.
 */
export function contractFromComponents(
  symbol: string,
  components: unknown
): { ticker: string; cost: number | null; expiry: string } | null {
  const comps = (components ?? {}) as Record<string, unknown>;
  const recs = comps.recommended_options;
  if (!Array.isArray(recs) || !recs.length) return null;
  const first = (recs[0] ?? {}) as Record<string, unknown>;

  const uoa = (comps.uoa ?? {}) as Record<string, unknown>;
  const expiries = uoa.expiries;
  if (!Array.isArray(expiries) || expiries.length !== 1) return null;
  const expiry = String(expiries[0]);

  const strike = numOrNull(first.strike);
  if (strike === null) return null;
  const kind = String(first.type ?? '').toLowerCase() === 'put' ? 'put' : 'call';
  const ticker = optionTicker(symbol, expiry, kind, strike);
  if (!ticker) return null;

  return { ticker, cost: numOrNull(first.cost), expiry };
}

/* ------------------------------------------------------------------ */
/* The pass                                                             */
/* ------------------------------------------------------------------ */

export async function runPeakTracking(opts: {
  requestId: string;
  at: string;
  /** Symbols the caller is about to price anyway. Folded into this pass's one
   *  snapshot request so the resolver's own quote read costs nothing extra. */
  alsoPrice?: string[];
}): Promise<PeakReport> {
  const db = serviceClient();
  const at = opts.at;
  const today = etDate(at);

  let seeded = 0;
  let written = 0;
  let resolved = 0;
  let identified = 0;
  let graded = 0;
  let extraCalls = 0;

  /* --- 1. What is still running ---------------------------------------- */
  //
  // A setup is live while the scanner still calls it 'ready' and nothing has
  // ended it. `state` stays the scanner's to move; `resolution_kind` is ours.
  const setupsRes = await db
    .from('setups')
    .select(SETUP_COLUMNS)
    .eq('state', 'ready')
    .is('resolution_kind', null)
    .order('last_tracked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (setupsRes.error) {
    log('warn', opts.requestId, 'peaks.setups_read_failed', { message: setupsRes.error.message });
  }
  const setups = (setupsRes.data ?? []) as unknown as SetupRow[];

  const callsRes = await db
    .from('community_calls')
    .select(CALL_TRACK_COLUMNS)
    .eq('status', 'open')
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (callsRes.error) {
    log('warn', opts.requestId, 'peaks.calls_read_failed', { message: callsRes.error.message });
  }
  const calls = (callsRes.data ?? []) as unknown as CallTrackRow[];

  /* --- 2. One snapshot for everything active --------------------------- */
  const symbols = [
    ...new Set(
      [
        ...setups.map((s) => s.symbol),
        ...calls.map((c) => c.symbol),
        ...(opts.alsoPrice ?? []),
      ]
        .filter(Boolean)
        .map((s) => s.toUpperCase())
    ),
  ].sort();

  // Nothing active anywhere: no request, no writes, no cost. Contract grading
  // below can still have work to do, so this is not an early return.
  const session = symbols.length ? await getSessionExtremes(symbols) : new Map();

  /* --- 3. Seed anything whose history predates tracking ---------------- */
  //
  // One daily-bars call per row, the FIRST time that row is ever seen. A row
  // called today has no history to reconstruct and is skipped: the session
  // merge below already covers it, and a bars call for a single open session
  // would buy nothing.
  async function seedFor(
    symbol: string,
    calledAt: string
  ): Promise<{ high: number; highAt: string; low: number; lowAt: string } | null> {
    const from = etDate(calledAt);
    if (from >= today) return null;
    extraCalls += 1;
    const bars = await fetchDailyBarsUnadjusted(symbol, from, today);
    if (!bars.ok) {
      log('warn', opts.requestId, 'peaks.seed_failed', { symbol, from, reason: bars.reason });
      return null;
    }
    return extremesFromBars(bars.data);
  }

  /* --- 4. House alerts -------------------------------------------------- */
  const stampedSetups: string[] = [];

  for (const s of setups) {
    const patch: Record<string, unknown> = {};

    if (!s.tracking_seeded_at) {
      const hist = await seedFor(s.symbol, s.created_at);
      if (hist) {
        Object.assign(patch, mergeExtremes(s, { ...hist, basis: 'daily_bar' }) ?? {});
        patch.tracking_seeded_at = at;
        seeded += 1;
        // Keep the in-memory row in step so the session merge below compares
        // against what we are about to write, not against what was there.
        if (patch.high_price !== undefined) s.high_price = patch.high_price as number;
        if (patch.low_price !== undefined) s.low_price = patch.low_price as number;
      } else {
        // Nothing to reconstruct — a row called today, or a symbol Polygon has
        // no bars for. Either way it has now been considered, and saying so
        // stops every future pass from asking again.
        patch.tracking_seeded_at = at;
      }
    }

    const live = session.get(s.symbol.toUpperCase());
    if (live) {
      const merged = mergeExtremes(
        {
          high_price: (patch.high_price as number | undefined) ?? s.high_price,
          low_price: (patch.low_price as number | undefined) ?? s.low_price,
        },
        { high: live.high, highAt: at, low: live.low, lowAt: at, basis: 'session' }
      );
      if (merged) Object.assign(patch, merged);
    }

    /* --- 5. Did anything end it? --------------------------------------- */
    //
    // Checked against the SESSION's range rather than one print, so a spike
    // through a level between two passes is still caught. The stop is tested
    // first: a session that reached both levels reached both, and which came
    // first is not a thing a daily or session aggregate can tell us.
    const short = isShortIntent(s.intent);
    const high = (patch.high_price as number | undefined) ?? s.high_price;
    const low = (patch.low_price as number | undefined) ?? s.low_price;
    const target = firstTarget(s.targets);

    let kind: string | null = null;
    let price: number | null = null;

    if (s.stop !== null && high !== null && low !== null) {
      if (short ? high >= s.stop : low <= s.stop) {
        kind = 'stop_met';
        price = s.stop;
      }
    }
    if (!kind && target !== null && high !== null && low !== null) {
      if (short ? low <= target : high >= target) {
        kind = 'target_met';
        price = target;
      }
    }
    if (!kind && s.valid_until && s.valid_until < at) {
      // Ran out of time without reaching either level. An ending, not a result,
      // and deliberately no price: there is no level that ended it, and a last
      // close standing in for one would read as though something was hit.
      kind = 'expired';
      price = null;
    }

    if (kind) {
      patch.resolution_kind = kind;
      patch.resolution_price = price;
      patch.resolved_at = at;
      resolved += 1;
    }

    patch.last_tracked_at = at;

    if (Object.keys(patch).length === 1) {
      // Only the stamp changed — batch it with the others rather than spending
      // a round trip per row.
      stampedSetups.push(s.id);
      continue;
    }

    const { error } = await db.from('setups').update(patch).eq('id', s.id);
    if (error) {
      log('warn', opts.requestId, 'peaks.setup_write_failed', { setup_id: s.id, message: error.message });
      continue;
    }
    if (patch.high_price !== undefined || patch.low_price !== undefined) written += 1;
  }

  if (stampedSetups.length) {
    const { error } = await db.from('setups').update({ last_tracked_at: at }).in('id', stampedSetups);
    if (error) {
      log('warn', opts.requestId, 'peaks.setup_stamp_failed', { message: error.message });
    }
  }

  /* --- 6. Members' calls ------------------------------------------------ */
  //
  // The extremes only. Whether a member's call hit its stop or its target is
  // the resolver's own decision and stays there — writing it in two places is
  // how the two start disagreeing.
  for (const c of calls) {
    const patch: Record<string, unknown> = {};

    if (!c.tracking_seeded_at) {
      const hist = await seedFor(c.symbol, c.published_at);
      if (hist) {
        Object.assign(patch, mergeExtremes(c, { ...hist, basis: 'daily_bar' }) ?? {});
        seeded += 1;
        if (patch.high_price !== undefined) c.high_price = patch.high_price as number;
        if (patch.low_price !== undefined) c.low_price = patch.low_price as number;
      }
      patch.tracking_seeded_at = at;
    }

    const live = session.get(c.symbol.toUpperCase());
    if (live) {
      const merged = mergeExtremes(
        {
          high_price: (patch.high_price as number | undefined) ?? c.high_price,
          low_price: (patch.low_price as number | undefined) ?? c.low_price,
        },
        { high: live.high, highAt: at, low: live.low, lowAt: at, basis: 'session' }
      );
      if (merged) Object.assign(patch, merged);
    }

    if (!Object.keys(patch).length) continue;
    const { error } = await db.from('community_calls').update(patch).eq('id', c.id);
    if (error) {
      log('warn', opts.requestId, 'peaks.call_write_failed', { call_id: c.id, message: error.message });
      continue;
    }
    if (patch.high_price !== undefined || patch.low_price !== undefined) written += 1;
  }

  /* --- 7. The contract lane -------------------------------------------- */
  const contractWork = await runContractLane({ requestId: opts.requestId, at, today });
  identified = contractWork.identified;
  graded = contractWork.graded;
  extraCalls += contractWork.calls;

  return {
    tracked_setups: setups.length,
    tracked_calls: calls.length,
    seeded,
    extremes_written: written,
    resolved,
    contracts_identified: identified,
    contracts_graded: graded,
    polygon_extra_calls: extraCalls,
    plain: setups.length || calls.length
      ? `Watched ${setups.length} house alert${setups.length === 1 ? '' : 's'} and ${calls.length} member call${calls.length === 1 ? '' : 's'} across ${symbols.length} symbol${symbols.length === 1 ? '' : 's'}: ${written} new extreme${written === 1 ? '' : 's'}, ${seeded} seeded from history, ${resolved} ended.`
      : 'Nothing active to watch.',
  };
}

/** The first published target price, or null. `targets` is a jsonb array of
 *  `{ label, price }`; a row with an empty array published no target, which is
 *  the normal state of a day-trade alert and not a fault. */
function firstTarget(targets: unknown): number | null {
  if (!Array.isArray(targets) || !targets.length) return null;
  const first = (targets[0] ?? {}) as Record<string, unknown>;
  return numOrNull(first.price);
}

/**
 * The contract a day trade named: find it, then grade it when it expires.
 *
 * This runs on its own selection rather than beside the stock loop because the
 * two lanes end at different times. A day trade's STOCK side is finished at the
 * closing bell — `state` leaves 'ready' the same afternoon — but its CONTRACT
 * is not finished until its expiry, which is days later. A row whose stock side
 * closed weeks ago still has a contract worth grading, and it would never be
 * reached by a query that only looks at live rows.
 */
async function runContractLane(opts: {
  requestId: string;
  at: string;
  today: string;
}): Promise<{ identified: number; graded: number; calls: number }> {
  const db = serviceClient();
  let identified = 0;
  let graded = 0;
  let calls = 0;

  /* (a) Rows that named a contract but have not had it identified yet. */
  // Only rows that actually named a contract. Without this filter every pass
  // re-reads every day-trade alert the app has ever held, most of which named
  // nothing and never will.
  const unident = await db
    .from('setups')
    .select('id,symbol,score_components')
    .eq('mode', 'day_trade')
    .is('contract_ticker', null)
    .not('score_components->recommended_options', 'is', null)
    .limit(BATCH);

  if (unident.error) {
    log('warn', opts.requestId, 'peaks.contract_scan_failed', { message: unident.error.message });
  }

  for (const row of (unident.data ?? []) as { id: string; symbol: string; score_components: unknown }[]) {
    const c = contractFromComponents(row.symbol, row.score_components);
    if (!c) continue;
    const { error } = await db
      .from('setups')
      .update({ contract_ticker: c.ticker, contract_cost: c.cost, contract_expiry: c.expiry })
      .eq('id', row.id);
    if (error) {
      log('warn', opts.requestId, 'peaks.contract_ident_failed', { setup_id: row.id, message: error.message });
      continue;
    }
    identified += 1;
  }

  /* (b) Contracts whose expiry has passed and that have not been graded. */
  const due = await db
    .from('setups')
    .select('id,symbol,created_at,contract_ticker,contract_expiry,contract_cost,resolution_kind')
    .not('contract_ticker', 'is', null)
    .is('contract_graded_at', null)
    .lte('contract_expiry', opts.today)
    .limit(50);

  if (due.error) {
    log('warn', opts.requestId, 'peaks.contract_due_failed', { message: due.error.message });
    return { identified, graded, calls };
  }

  for (const row of (due.data ?? []) as {
    id: string;
    symbol: string;
    created_at: string;
    contract_ticker: string;
    contract_expiry: string;
    contract_cost: number | null;
    resolution_kind: string | null;
  }[]) {
    const from = etDate(row.created_at);
    calls += 1;
    const bars = await fetchDailyBarsUnadjusted(row.contract_ticker, from, row.contract_expiry);
    if (!bars.ok || !bars.data.length) {
      log('warn', opts.requestId, 'peaks.contract_bars_missing', {
        setup_id: row.id,
        ticker: row.contract_ticker,
        reason: bars.ok ? 'no_bars' : bars.reason,
      });
      continue;
    }

    const ext = extremesFromBars(bars.data);
    // The expiry session's own close is what the contract was worth at the end.
    // A contract that did not trade on its expiry day has no such close, and
    // that is left absent rather than filled with the last price it happened to
    // print days earlier — which would read as a settlement it never had.
    const lastBar = bars.data[bars.data.length - 1];
    const closeOnExpiry =
      lastBar && etDate(lastBar.ts) === row.contract_expiry ? numOrNull(lastBar.c) : null;

    const patch: Record<string, unknown> = {
      contract_graded_at: opts.at,
      contract_basis: 'daily_bar',
    };
    if (ext) {
      patch.contract_peak = ext.high;
      patch.contract_peak_at = ext.highAt;
    }
    if (closeOnExpiry !== null) patch.contract_expiry_value = closeOnExpiry;

    // The contract expiring IS the ending for this family — it publishes no
    // stop and no target, so nothing else was ever going to end it. Only
    // claimed where nothing has ended the row already: a day trade whose stock
    // side hit a level keeps that as its ending.
    //
    // `resolution_price` stays NULL here and that is deliberate. Everywhere
    // else on this row it is a STOCK price — the stop or the target that was
    // reached — and the contract's closing value is an option price. Putting
    // one in the other's column is the frame mix this whole file is built to
    // avoid; the contract's ending lives in `contract_expiry_value`, where it
    // is unambiguous.
    if (!row.resolution_kind) {
      patch.resolution_kind = 'contract_expired';
      patch.resolved_at = opts.at;
    }

    const { error } = await db.from('setups').update(patch).eq('id', row.id);
    if (error) {
      log('warn', opts.requestId, 'peaks.contract_grade_failed', { setup_id: row.id, message: error.message });
      continue;
    }
    graded += 1;
    log('info', opts.requestId, 'peaks.contract_graded', {
      setup_id: row.id,
      ticker: row.contract_ticker,
      cost: row.contract_cost,
      peak: ext?.high ?? null,
      expiry_value: closeOnExpiry,
    });
  }

  return { identified, graded, calls };
}
