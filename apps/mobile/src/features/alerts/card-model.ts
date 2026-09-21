/**
 * THE V2 ALERT CARD, AS PURE FUNCTIONS (redesign 2026-09-21).
 *
 *   docs/design/redesign-2026-09-21/CheatCode_UI_Redesign_Spec.md
 *   → "Alerts" and "V2 → Alert cards are market instruments"
 *
 * Everything the card DECIDES lives here, with no React and no network, so the
 * rules can be tested as text (scripts/alert-card-v2-test.mts) and the card is
 * left drawing what it was told:
 *
 *   stateVerb      the status chip, said as a verb — "Entry triggered",
 *                  "Watching resistance", "Target 1 hit" — and only ever a verb
 *                  the data supports. A target is "hit" because the peak tracker
 *                  measured the price there, never because a label said so.
 *   rankActive /   which ONE card wears the orange edge glow. The spec allows
 *   pickPriority   it on "the single highest-priority alert", so it is one
 *                  card or none, never a list of glowing cards.
 *   windowBars     the microchart's 24h / 72h slice of real bars.
 *   dayChangePct   the day's move — the server's own number first, else the
 *                  bars' last close against the previous session's.
 *   rangeOf        the stop – entry – target rail with the current price on
 *                  it. Drawn only when all three levels make a coherent plan.
 *   analyticsCells the secondary row — only facts that exist. A cell with no
 *                  measurement behind it is omitted, never filled.
 *   contractLine   the Day Trade contract row: strike · expiry · paid · the
 *                  best it traded after the alert (tracker `contract_peak`).
 */
import type { AlertCard, AlertCardState, AlertOptionContract, Candle } from '../../lib/types';

/* ------------------------------------------------------------------ */
/* numbers inside the wire's level strings                             */
/* ------------------------------------------------------------------ */

const numbersIn = (v: string | null | undefined): number[] =>
  v == null
    ? []
    : (String(v).match(/-?\d[\d,]*(?:\.\d+)?/g) ?? [])
        .map((n) => Number(n.replace(/,/g, '')))
        .filter((n) => Number.isFinite(n));

/**
 * A level as a number. A single price is itself; a ZONE ("504–507") is its
 * first edge, which is what the rail marks — the label under it still prints
 * the zone as written, so the rail never pretends the zone was one price.
 * A sentence with no number in it ("after 10:00") is not a level.
 */
export function levelOf(v: string | null | undefined): number | null {
  const ns = numbersIn(v);
  if (ns.length === 1 || ns.length === 2) return ns[0];
  return null;
}

export const isZoneText = (v: string | null | undefined): boolean => numbersIn(v).length === 2;

/** Long unless the card says otherwise — the same reading the trade adapter makes. */
export function isShort(alert: AlertCard): boolean {
  const said = `${alert.trade.direction ?? ''} ${alert.direction_label ?? ''}`.toLowerCase();
  if (/\b(short|put|sell)\b/.test(said)) return true;
  if (/\b(long|call|buy|accumulate)\b/.test(said)) return false;
  const e = levelOf(alert.trade.entry);
  const t = levelOf(alert.trade.target);
  return e != null && t != null && t < e;
}

/** True for the unusual-options family: the card leads with a contract. */
export const isContractLed = (alert: AlertCard): boolean => (alert.recommended_options?.length ?? 0) > 0;

/* ------------------------------------------------------------------ */
/* price                                                               */
/* ------------------------------------------------------------------ */

/** The live price: the quote, else the wire's Current, else the last real bar. */
export function currentPrice(alert: AlertCard, bars?: readonly Candle[] | null): number | null {
  const q = alert.quote?.price;
  if (typeof q === 'number' && Number.isFinite(q) && q > 0) return q;
  const wire = numbersIn(alert.trade.current);
  if (wire.length === 1 && wire[0] > 0) return wire[0];
  const last = bars && bars.length ? bars[bars.length - 1].c : null;
  return typeof last === 'number' && Number.isFinite(last) ? last : null;
}

/** New York calendar day of an instant — sessions are ET days. */
function etDay(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * The day's move, in percent.
 *
 * The quote's own `change_pct` wins — it is the feed's number against the
 * official previous close. Without it, the bars answer: the last bar's close
 * against the final close of the PREVIOUS ET session in the same series.
 * With one session of bars there is no previous close, and the answer is null
 * rather than a move measured from the morning's open.
 */
export function dayChangePct(alert: AlertCard, bars?: readonly Candle[] | null): number | null {
  const q = alert.quote?.change_pct;
  if (typeof q === 'number' && Number.isFinite(q)) return q;
  if (!bars || bars.length < 2) return null;
  const last = bars[bars.length - 1];
  const today = etDay(last.t);
  if (!today) return null;
  for (let i = bars.length - 2; i >= 0; i -= 1) {
    const d = etDay(bars[i].t);
    if (d && d !== today) {
      const prev = bars[i].c;
      if (!Number.isFinite(prev) || prev <= 0) return null;
      const now = currentPrice(alert, bars) ?? last.c;
      return ((now - prev) / prev) * 100;
    }
  }
  return null;
}

/**
 * The microchart's window: every bar within `hours` of the LAST bar — not of
 * the clock, so a chart opened on a Saturday still shows Friday's session
 * rather than an empty frame.
 */
export function windowBars(bars: readonly Candle[] | null | undefined, hours: 24 | 72): Candle[] {
  if (!bars || !bars.length) return [];
  const lastT = Date.parse(bars[bars.length - 1].t);
  if (!Number.isFinite(lastT)) return [...bars];
  const from = lastT - hours * 3_600_000;
  return bars.filter((b) => {
    const t = Date.parse(b.t);
    return Number.isFinite(t) && t > from;
  });
}

/* ------------------------------------------------------------------ */
/* the verb                                                            */
/* ------------------------------------------------------------------ */

export type VerbTone = 'neutral' | 'action' | 'up' | 'down';
export type StateVerb = { label: string; tone: VerbTone };

/**
 * THE STATUS CHIP, AS A VERB.
 *
 * Strongest fact first, and the order is the rule:
 *
 *   1. the member's own book — a position or a working order is what they
 *      are doing, whatever price has done;
 *   2. a resolved card says so plainly;
 *   3. what the TRACKER measured — the stop crossed, a target reached. These
 *      beat the setup's own state because they are claims about price and
 *      price is what the tracker watched;
 *   4. the lifecycle state the server derived, as a verb;
 *   5. watching, qualified by where price sits against the entry: under a
 *      long's entry the entry is resistance; over a short's it is support.
 */
export function stateVerb(alert: AlertCard, current?: number | null): StateVerb {
  const s: AlertCardState = alert.state;
  const t = alert.tracking ?? null;
  if (s === 'position_active') return { label: 'Position open', tone: 'action' };
  if (s === 'order_pending') return { label: 'Order working', tone: 'action' };
  if (s === 'closed') return { label: 'Closed', tone: 'neutral' };
  if (s === 'invalidated') return { label: t?.stop_hit ? 'Stop hit' : 'Setup invalidated', tone: 'down' };
  if (t?.stop_hit) return { label: 'Stop hit', tone: 'down' };
  if (t?.targets_hit != null && t.targets_hit >= 1) {
    return { label: `Target ${t.targets_hit} hit`, tone: 'up' };
  }
  if (s === 'planned') return { label: 'Plan ready', tone: 'action' };
  if (s === 'entry_reached') return { label: 'Entry triggered', tone: 'action' };
  if (s === 'ready') {
    return isContractLed(alert)
      ? { label: 'Flow triggered', tone: 'action' }
      : { label: 'Ready to enter', tone: 'action' };
  }
  if (s === 'forming') return { label: 'Building confirmation', tone: 'neutral' };
  const entry = levelOf(alert.trade.entry);
  if (entry != null && current != null && Number.isFinite(current)) {
    const short = isShort(alert);
    if (!short && current < entry) return { label: 'Watching resistance', tone: 'neutral' };
    if (short && current > entry) return { label: 'Watching support', tone: 'neutral' };
    return { label: 'Watching entry', tone: 'neutral' };
  }
  return { label: entry != null ? 'Watching entry' : 'Watching', tone: 'neutral' };
}

/* ------------------------------------------------------------------ */
/* priority                                                            */
/* ------------------------------------------------------------------ */

/**
 * How much a card wants the member right now — lower is more urgent, and
 * `null` means it can never be THE priority card.
 *
 *   0  a decision now: entry triggered / ready / flow fired
 *   1  the member is acting: a position, a working order, a written plan
 *   2  a target has been reached — something to manage
 *   3  watching or forming
 *
 * Never the priority card: resolved ones, a crossed stop, and a card Kai says
 * to leave (`kai_passes`) — an orange glow on "I'd pass" would be the board
 * contradicting itself.
 */
export function priorityTier(alert: AlertCard): number | null {
  const s = alert.state;
  if (s === 'closed' || s === 'invalidated') return null;
  if (alert.tracking?.stop_hit) return null;
  if (alert.kai_passes) return null;
  if (s === 'entry_reached' || s === 'ready') return 0;
  if (s === 'position_active' || s === 'order_pending' || s === 'planned') return 1;
  if ((alert.tracking?.targets_hit ?? 0) >= 1) return 2;
  return 3;
}

const TIER_ORDER_FALLBACK = 4;

const firedAt = (a: AlertCard): number => {
  const t = a.triggered_at ? Date.parse(a.triggered_at) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/**
 * The Active list in the order the board draws it: tier, then grade score
 * (higher first, ungraded last), then the newest. Stable, so the server's own
 * order survives inside any tie.
 */
export function rankActive(list: readonly AlertCard[]): AlertCard[] {
  return list
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const tx = priorityTier(x.a) ?? TIER_ORDER_FALLBACK;
      const ty = priorityTier(y.a) ?? TIER_ORDER_FALLBACK;
      if (tx !== ty) return tx - ty;
      const sx = x.a.score ?? -1;
      const sy = y.a.score ?? -1;
      if (sx !== sy) return sy - sx;
      const fx = firedAt(x.a);
      const fy = firedAt(y.a);
      if (fx !== fy) return fy - fx;
      return x.i - y.i;
    })
    .map(({ a }) => a);
}

/** The id of the ONE card that wears the orange glow, or null when none may. */
export function pickPriority(list: readonly AlertCard[]): string | null {
  const top = rankActive(list)[0];
  return top && priorityTier(top) !== null ? top.id : null;
}

/* ------------------------------------------------------------------ */
/* time                                                                */
/* ------------------------------------------------------------------ */

/** "just now" · "2m ago" · "3h ago" · "2d ago" · "Sep 18". Null without an instant. */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}

/* ------------------------------------------------------------------ */
/* the range rail                                                      */
/* ------------------------------------------------------------------ */

export type Range = {
  stop: number; entry: number; target: number;
  /** 0..1 along the rail, stop at 0 and target at 1 whichever way round the trade is. */
  entryAt: number;
  /** Where the current price sits, clamped to the rail; null without a price. */
  currentAt: number | null;
  /** True when the price is beyond an end of the rail (past target or through stop). */
  currentOutside: boolean;
  /** Reward over risk, from the three levels. */
  r: number;
};

/**
 * THE STOP – ENTRY – TARGET RAIL, or nothing.
 *
 * All three levels must be numbers and must make a plan in the card's own
 * direction (a long's stop under its entry under its target, a short's the
 * other way). Anything else draws no rail — half a rail would be a picture of
 * a guess, and the Day Trade family publishes no stop or target at all.
 */
export function rangeOf(alert: AlertCard, current: number | null): Range | null {
  const stop = levelOf(alert.trade.stop);
  const entry = levelOf(alert.trade.entry);
  const target = levelOf(alert.trade.target);
  if (stop == null || entry == null || target == null) return null;
  const short = isShort(alert);
  const sign = short ? -1 : 1;
  const risk = (entry - stop) * sign;
  const reward = (target - entry) * sign;
  if (!(risk > 0) || !(reward > 0)) return null;
  const span = target - stop;
  const at = (v: number) => (v - stop) / span;
  let currentAt: number | null = null;
  let outside = false;
  if (current != null && Number.isFinite(current)) {
    const raw = at(current);
    outside = raw < 0 || raw > 1;
    currentAt = Math.max(0, Math.min(1, raw));
  }
  return { stop, entry, target, entryAt: at(entry), currentAt, currentOutside: outside, r: reward / risk };
}

/**
 * The R the card's header shows. The rail's own ratio when the plan is
 * coherent; for a ZONE entry the server's stated ratio instead (a ratio
 * measured off the near edge of a zone is a best case, and the old card never
 * printed one — see trade-adapter.ts); otherwise none.
 */
export function rMultiple(alert: AlertCard, range: Range | null): number | null {
  if (isZoneText(alert.trade.entry) || isZoneText(alert.trade.stop) || isZoneText(alert.trade.target)) {
    const stated = numbersIn(alert.trade.rr)[0];
    return stated != null && stated > 0 ? stated : null;
  }
  if (range) return range.r;
  return null;
}

/* ------------------------------------------------------------------ */
/* the analytics row                                                   */
/* ------------------------------------------------------------------ */

export type AnalyticsCell = { key: string; label: string; value: string; icon: 'rr' | 'pattern' | 'volume' | 'premium' | 'ask' };

const compactUsd = (n: number): string =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${Math.round(n)}`;

const times = (n: number): string => (n >= 100 ? `${Math.round(n).toLocaleString('en-US')}×` : `${n.toFixed(1)}×`);

/**
 * The secondary analytics row — at most four cells, each one a fact the card
 * already carries. Nothing is derived to fill the row out:
 *
 *   Risk / Reward  from the levels (or the stated ratio on a zone)
 *   Pattern        the scanner's own setup label
 *   Volume         the scanner's measured ratio; else a number the scorer
 *                  wrote into its volume reading ("1.6× the 20-day average");
 *                  else, for a contract, its volume against its own average
 *   Premium        a contract's premium paid
 *   Paid at ask    the share of that premium paid at the offer
 *
 * The board's "Confidence" cell is not here: no producer writes a confidence,
 * and relabelling the grade would print the same fact twice.
 */
export function analyticsCells(alert: AlertCard, r: number | null): AnalyticsCell[] {
  const cells: AnalyticsCell[] = [];
  if (r != null && Number.isFinite(r) && r > 0) cells.push({ key: 'rr', label: 'Risk / Reward', value: `${r.toFixed(1)}R`, icon: 'rr' });
  const pattern = alert.analytics?.pattern?.trim();
  if (pattern) cells.push({ key: 'pattern', label: 'Pattern', value: pattern, icon: 'pattern' });

  const c: AlertOptionContract | null = alert.recommended_options?.[0] ?? null;
  const ratio = alert.analytics?.volume_ratio ?? null;
  let volume: string | null = ratio != null && ratio > 0 ? times(ratio) : null;
  if (!volume) {
    const comp = (alert.score_components ?? []).find((x) => (x.key ?? '').toLowerCase() === 'volume');
    const said = comp?.explanation?.match(/(\d+(?:\.\d+)?)\s*(?:×|x(?![a-z]))/i);
    if (said && comp && comp.status.trim().toLowerCase() !== 'unknown') volume = `${Number(said[1]).toFixed(1)}×`;
  }
  if (!volume && c?.volume_vs_own_adv != null && c.volume_vs_own_adv > 0) volume = times(c.volume_vs_own_adv);
  if (volume) cells.push({ key: 'volume', label: c && !ratio ? 'Volume vs avg' : 'Volume', value: volume, icon: 'volume' });

  if (c?.premium != null && c.premium > 0) cells.push({ key: 'premium', label: 'Premium', value: compactUsd(c.premium), icon: 'premium' });
  if (c?.ask_side_share != null && c.ask_side_share > 0) {
    cells.push({ key: 'ask', label: 'Paid at ask', value: `${Math.round(c.ask_side_share * 100)}%`, icon: 'ask' });
  }
  return cells.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* the Day Trade contract row                                          */
/* ------------------------------------------------------------------ */

export type ContractLine = {
  side: 'Call' | 'Put';
  strike: string;
  expiry: string;
  paid: string | null;
  /** The best the contract traded after the alert, from the tracker. Null until measured. */
  peak: string | null;
  multiple: string | null;
};

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * "120C · Aug 21 · paid $5.60 · peak $27.91 (5.0×)". The paid price is what the
 * alert priced the contract at (tracker cost first, the engine's own cost
 * second); the peak is ONLY the tracker's `contract_peak` — a contract nobody
 * followed yet shows no peak rather than a hopeful one.
 */
export function contractLine(alert: AlertCard): ContractLine | null {
  const c = alert.recommended_options?.[0];
  if (!c) return null;
  const t = alert.tracking ?? null;
  const costWire = numbersIn(c.cost)[0];
  const cost = t?.contract_cost ?? (costWire != null && costWire > 0 ? costWire : null);
  const peak = t?.contract_peak ?? null;
  const mult = t?.contract_peak_multiple ?? (peak != null && cost ? peak / cost : null);
  return {
    side: c.type === 'put' ? 'Put' : 'Call',
    strike: `$${c.strike.replace(/^\$/, '')}`,
    expiry: c.expiry,
    paid: cost != null ? usd(cost) : null,
    peak: peak != null && peak > 0 ? usd(peak) : null,
    multiple: peak != null && mult != null && Number.isFinite(mult) && mult > 0 ? `${mult.toFixed(1)}×` : null,
  };
}

/* ------------------------------------------------------------------ */
/* the microchart's candles                                            */
/* ------------------------------------------------------------------ */

/**
 * At most `max` candles, by MERGING neighbours into wider bars (first open,
 * highest high, lowest low, last close) — never by dropping any. A 72-hour
 * five-minute series is ~230 bars; drawn one-to-one in 180 points they are
 * sub-pixel slivers, and skipping bars would hide the very spike a card is
 * about. Every real bar still contributes to the picture.
 */
export function bucketBars(bars: readonly Candle[], max: number): Candle[] {
  if (bars.length <= max || max < 1) return [...bars];
  const size = Math.ceil(bars.length / max);
  const out: Candle[] = [];
  for (let i = 0; i < bars.length; i += size) {
    const chunk = bars.slice(i, i + size);
    out.push({
      t: chunk[0].t,
      o: chunk[0].o,
      h: Math.max(...chunk.map((b) => b.h)),
      l: Math.min(...chunk.map((b) => b.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((s, b) => s + (b.v ?? 0), 0),
    });
  }
  return out;
}
