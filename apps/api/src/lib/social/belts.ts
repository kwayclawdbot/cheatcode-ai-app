/**
 * THE SCORING RULES, READ FROM THE DATABASE RATHER THAN RETYPED HERE.
 *
 * `points_config()` (0039 §1) is the single place the numbers live, kept as an
 * immutable SQL function so that changing the scoring is a migration with a
 * diff. This file is the only thing in the API that reads it, and everything
 * the app prints about points is built from what it returns.
 *
 * WHY THAT MATTERS ENOUGH TO BE A RULE. A scoring system nobody can check reads
 * as rigged. If the formula on the screen were a string in TypeScript, then the
 * day somebody retunes a band in SQL the app would go on printing the old one
 * and every user reading it would be reading a lie — and nothing would fail, so
 * nobody would find out. So: no literal from 0039 appears in this file, and
 * when the config cannot be read the app says it cannot read it rather than
 * printing numbers it has not checked.
 */
import type { Belt, BeltBlock, PointsExplainer } from '@shared/api';
import { log } from '../log';
import { callRpc } from '../rpc';

export type PointsBand = { min_accuracy: number; multiplier: number };
export type BeltRung = { key: Belt; label: string; min_points: number };

export type PointsConfig = {
  call_win: number;
  call_loss: number;
  kai_trade_win: number;
  kai_trade_loss: number;
  accuracy_window: number;
  warmup_resolved: number;
  /** Highest threshold first, exactly as 0039 stores them. */
  bands: PointsBand[];
  /** Highest belt first, exactly as 0039 stores them. */
  belts: BeltRung[];
};

/**
 * Cached for the life of the process. The config is an IMMUTABLE function, so a
 * change to it is a migration and therefore a deploy — there is no window in
 * which a running server could hold a stale copy of something that changed
 * underneath it.
 */
let cached: PointsConfig | null = null;

export async function pointsConfig(requestId = '-'): Promise<PointsConfig | null> {
  if (cached) return cached;
  const rpc = await callRpc<Record<string, unknown>>('points_config', {}, requestId);
  if (!rpc.ok || !rpc.data || typeof rpc.data !== 'object') {
    log('warn', requestId, 'social.points_config_unavailable', {
      missing: rpc.ok === false ? rpc.missing : null,
    });
    return null;
  }
  const raw = rpc.data;
  const num = (k: string, fallback: number) => {
    const v = Number(raw[k]);
    return Number.isFinite(v) ? v : fallback;
  };
  const bands = Array.isArray(raw.bands)
    ? (raw.bands as Record<string, unknown>[]).map((b) => ({
        min_accuracy: Number(b.min_accuracy),
        multiplier: Number(b.multiplier),
      }))
    : [];
  const belts = Array.isArray(raw.belts)
    ? (raw.belts as Record<string, unknown>[]).map((b) => ({
        key: String(b.key) as Belt,
        label: String(b.label),
        min_points: Number(b.min_points),
      }))
    : [];
  if (!bands.length || !belts.length) {
    log('warn', requestId, 'social.points_config_incomplete', {});
    return null;
  }
  cached = {
    call_win: num('call_win', 0),
    call_loss: num('call_loss', 0),
    kai_trade_win: num('kai_trade_win', 0),
    kai_trade_loss: num('kai_trade_loss', 0),
    accuracy_window: num('accuracy_window', 0),
    warmup_resolved: num('warmup_resolved', 0),
    bands,
    belts,
  };
  return cached;
}

/** Test seam, and the way a hosted process picks up a re-tuned config on deploy. */
export function resetPointsConfig(): void {
  cached = null;
}

/* ------------------------------------------------------------------ */
/* The belt block                                                       */
/* ------------------------------------------------------------------ */

const WHITE: BeltBlock = { key: 'white', label: 'White', next_at: null, next_label: null, progress: null };

/**
 * Where somebody stands on the ladder, and how far to the next rung.
 *
 * THE BELT IS PASSED IN, NOT COMPUTED FROM THE POINTS. 0039 keeps the belt as a
 * HIGH-WATER MARK: points can fall and the belt does not, because a ladder you
 * can slide back down becomes something to protect by not calling. Recomputing
 * it here from the current total would quietly undo that in the one place the
 * user actually reads it.
 *
 * `progress` is therefore clamped: somebody holding Purple whose points have
 * fallen below the Purple threshold shows an empty bar, never a negative one.
 */
export function beltBlock(belt: string | null | undefined, points: number, cfg: PointsConfig | null): BeltBlock {
  if (!cfg) return WHITE;
  // 0039 stores the ladder highest-first. Ascending is the direction a person
  // climbs it, and the direction "the next one up" means anything in.
  const ladder = [...cfg.belts].sort((a, b) => a.min_points - b.min_points);
  const idx = Math.max(
    0,
    ladder.findIndex((b) => b.key === (belt ?? 'white'))
  );
  const current = ladder[idx] ?? ladder[0];
  const next = ladder[idx + 1] ?? null;
  if (!current) return WHITE;
  if (!next) {
    return { key: current.key, label: current.label, next_at: null, next_label: null, progress: null };
  }
  const span = next.min_points - current.min_points;
  const gained = points - current.min_points;
  const progress = span > 0 ? Math.min(1, Math.max(0, gained / span)) : 0;
  return {
    key: current.key,
    label: current.label,
    next_at: next.min_points,
    next_label: next.label,
    progress: Math.round(progress * 1000) / 1000,
  };
}

/* ------------------------------------------------------------------ */
/* The formula, in the words the app prints                             */
/* ------------------------------------------------------------------ */

const pct = (n: number) => `${Math.round(n * 100)}%`;
const times = (n: number) => `${Number(n.toFixed(2)).toString()}x`;

/**
 * The four sentences from the 0039 header, GENERATED FROM THE DEPLOYED CONFIG
 * so the printed formula cannot drift from the one the database used. Every
 * number in them came back from `points_config()` on this request.
 *
 * The warm-up is the fifth line and is stated separately, exactly as 0039 says
 * it should be: it is the one rule that is not part of the formula, it expires
 * on its own, and burying it inside the multiplier sentence would make that
 * sentence wrong for everybody in their first week.
 */
export function pointsExplainer(cfg: PointsConfig | null): PointsExplainer {
  if (!cfg) {
    // NOT a hardcoded copy of the formula. If we cannot read the rules we do not
    // print numbers we have not checked — a printed formula that is a guess is
    // worse than no formula, because it looks exactly as authoritative.
    return {
      lines: ['I could not read the scoring rules just now, so I am not going to print numbers I cannot check.'],
      belts: [],
    };
  }

  const bands = [...cfg.bands].sort((a, b) => b.min_accuracy - a.min_accuracy);
  const top = bands[0];
  const bottom = bands[bands.length - 1];
  // The threshold the bottom band sits UNDER — "half below 40%" means 40% is
  // where the band above it starts, not where the bottom one does.
  const bottomEdge = bands[bands.length - 2] ?? top;

  const lines = [
    'You score when a call resolves, never when you post one. A call only counts if you published real levels — an entry, and a stop or a target.',
    `A win adds ${cfg.call_win}. A loss subtracts ${Math.abs(cfg.call_loss)}.`,
    `Taking one of Kai's alerts and having it work adds ${cfg.kai_trade_win}; it costs ${Math.abs(cfg.kai_trade_loss)} if it does not. Less than your own call, because the read was Kai's.`,
    `Your accuracy over your last ${cfg.accuracy_window} resolved calls scales what your wins are worth — ${times(bottom.multiplier)} below ${pct(bottomEdge.min_accuracy)}, ${times(top.multiplier)} at ${pct(top.min_accuracy)} and up. Losses always count full.`,
    `Your first ${cfg.warmup_resolved} resolutions count at face value, so nobody is penalised for having no record yet.`,
  ];

  return {
    lines,
    // Printed lowest first: that is the order a person climbs them, and the
    // order the config stores them in is the order the SQL needed.
    belts: [...cfg.belts]
      .sort((a, b) => a.min_points - b.min_points)
      .map((b) => ({ key: b.key, label: b.label, min_points: b.min_points })),
  };
}

/**
 * THE FIFTH SENTENCE, ADDED BY THE BELT MERGE.
 *
 * Spec §10 asks for it in these words and they are printed verbatim, the same
 * way `POINTS_PLAIN` prints the other four. It is separate from
 * `pointsExplainer` above because that function answers "how are points
 * scored", which has not changed, and this one answers "and what are points FOR
 * now", which has: they buy the right to sit, and the belt comes from the test.
 *
 * Two more lines follow it because leaving them out would make the first one
 * read as the whole rule, and it is not: the two halves are the part people get
 * wrong, and the part that stops thirty lessons from being a Blue Belt with no
 * resolved call.
 */
export const BELT_EXAM_PLAIN: string[] = [
  'You earn XP from lessons and from calls that resolve. XP is what lets you sit for the next belt. The belt itself is earned by passing its test.',
  'Both halves count and neither replaces the other: lessons on their own will not get you there, and calls on their own will not either.',
  'A belt is never taken away. Losing calls lower what you need for the NEXT one; they never take back the one you hold.',
];

/**
 * The scoring rules as the Belt Profile screen prints them: the four sentences
 * plus the warm-up, then the three above. When the config cannot be read,
 * `pointsExplainer` already refuses to print numbers it has not checked, and the
 * belt lines are still true without it, so they are still shown.
 */
export function beltExplainer(cfg: PointsConfig | null): PointsExplainer {
  const base = pointsExplainer(cfg);
  return { lines: [...base.lines, ...BELT_EXAM_PLAIN], belts: base.belts };
}

/** True while the first `warmup_resolved` resolutions still count at face value. */
export function inWarmup(resolved: number, cfg: PointsConfig | null): boolean {
  if (!cfg) return false;
  return resolved < cfg.warmup_resolved;
}
