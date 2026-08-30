/**
 * The show's call site for the director.
 *
 * THE DIRECTOR ITSELF MOVED to `packages/shared/director.ts` in LIVE-8, because
 * a second caller appeared: Kai answering a question on the chart in the Trade
 * Portal directs fifteen seconds of prose the same way this directs five
 * minutes of it. The judgement is the same — the difference is length — and the
 * four deterministic injectors in there are the part that took the most
 * iteration to get right and would drift fastest if they were copied.
 *
 * What is left here is the part that is genuinely the show's: turning a
 * `SegmentScript` into beats, telling the director which panels have data
 * behind them on this symbol, handing it the worker's BUDGETED `ask`, and
 * putting the directed beats back into the script shape the resolver wants.
 *
 * Everything the old comments in this file explained — why the director is a
 * separate call from the one that writes the words, why it reads the whole
 * segment at once, why it can be wrong about emphasis but never about a number
 * — is now at the top of `packages/shared/director.ts`.
 */
import { direct, type CueBeat, type DirectorAsk } from '../../../packages/shared/director.ts';
import { ask } from './analyze.ts';
import type { SegmentScript } from './analyze.ts';
import type { Budget } from './budget.ts';
import type { Candidate, MarketBundle } from './api.ts';
import type { LevelEntry } from './resolve.ts';
import { log } from './log.ts';
import type { LiveSlideName } from '../../../packages/shared/live.ts';

export type { CueBeat };

/**
 * The worker's `ask`, wearing the director's interface.
 *
 * Everything about cost lives on this side of the seam: the budget, the segment
 * it is charged to, and the `kind` that decides which model answers. The
 * director knows none of it and cannot spend anything it was not handed.
 */
function budgetedAsk(opts: { budget: Budget; segment: number }): DirectorAsk {
  return async (a) => {
    const r = await ask<{ cues: { beat: string; sentence: number; cue: string }[] }>({
      budget: opts.budget,
      segment: opts.segment,
      kind: 'script',
      detail: a.detail,
      user: a.user,
      system: a.system,
      maxTokens: a.maxTokens,
      parse: (raw) => {
        try {
          const start = raw.indexOf('{');
          const end = raw.lastIndexOf('}');
          if (start < 0 || end <= start) return null;
          const v = JSON.parse(raw.slice(start, end + 1));
          return Array.isArray(v?.cues) ? { cues: v.cues } : null;
        } catch {
          return null;
        }
      },
    });
    return r ? r.value : null;
  };
}

/**
 * Direct one segment.
 *
 * Returns the script with markers spliced in. Never throws and never fails the
 * segment: a director that cannot be reached leaves the script exactly as it
 * was, and the show runs with whatever the writer put in it.
 */
export async function directSegment(opts: {
  script: SegmentScript;
  table: Map<string, LevelEntry>;
  market: MarketBundle;
  candidate: Candidate;
  symbol: string;
  budget: Budget;
  segment: number;
}): Promise<{ script: SegmentScript; cues: number; dropped: number }> {
  const beats: CueBeat[] = [
    { key: 'intro', text: opts.script.intro },
    ...opts.script.timeframes.map((t) => ({ key: t.rail, text: t.narration })),
    { key: 'thesis', text: opts.script.thesis },
  ];

  // Panels with nothing behind them raise an empty box, so the director is only
  // told about the ones this symbol can actually fill.
  const panels: LiveSlideName[] = [
    (opts.market.fundamentals ?? []).length ? 'fundamentals' : null,
    (opts.market.news ?? []).length ? 'news' : null,
    opts.candidate.evidence.length ? 'evidence' : null,
    'scorecard',
  ].filter((p): p is LiveSlideName => p !== null);

  const r = await direct({
    beats,
    table: opts.table,
    form: 'segment',
    ask: budgetedAsk({ budget: opts.budget, segment: opts.segment }),
    available: {
      priorSession: Boolean(opts.market.prior_session),
      panels,
      lastPrice: opts.market.quote.price ?? null,
    },
    // The cohost's opening is not Kai at a chart. It carries no cues by design,
    // and the per-beat camera check would otherwise report it short every time.
    skip: ['intro'],
    label: opts.symbol,
    log: (level, event, fields) => log(level, event, { symbol: opts.symbol, ...fields }),
  });

  const applied = new Map(r.beats.map((b) => [b.key, b.text]));
  const script: SegmentScript = {
    intro: applied.get('intro') ?? opts.script.intro,
    timeframes: opts.script.timeframes.map((t) => ({ ...t, narration: applied.get(t.rail) ?? t.narration })),
    thesis: applied.get('thesis') ?? opts.script.thesis,
    outro: opts.script.outro,
  };

  return { script, cues: r.cues, dropped: r.dropped };
}
