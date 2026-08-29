/**
 * What the show costs, measured, and the cap that stops it.
 *
 * MEASURED, NOT ESTIMATED, for the model: every Anthropic call reports
 * `usage.input_tokens` / `output_tokens` / cache counters, and those numbers
 * times the published per-million rates is the actual bill for that call. The
 * deprecated show's cost telemetry was built and then "only wired in stub form",
 * so nobody ever knew what a segment cost until the invoice arrived — that is
 * the specific failure this module exists to not repeat. `record()` is called at
 * every call site, and a segment's `cost_usd` is written to its row.
 *
 * ESTIMATED, AND LABELLED, for TTS: OpenAI bills speech by input tokens rather
 * than by anything the client can count exactly, so the per-character rate here
 * is a configurable approximation (`LIVE_TTS_USD_PER_1K_CHARS`) and the ops doc
 * says to reconcile it against a real invoice. A number that is a guess is
 * marked as a guess; the alternative — quietly reporting it as measured — is how
 * a budget cap ends up defending nothing.
 *
 * THE CAP IS A PROJECTION, NOT A POSTMORTEM. `wouldBreach()` is asked BEFORE a
 * segment is built, using the running average cost per segment. Checking after
 * the fact would mean the cap is discovered by exceeding it.
 */
import { config } from './config.ts';
import { log, money } from './log.ts';

/**
 * Published per-million-token rates. Anthropic's price list, keyed by model.
 * An unknown model falls back to the Sonnet rate and says so once, because
 * silently pricing a model at zero is how a cap stops working.
 */
const MODEL_RATES: Record<string, { in: number; out: number }> = {
  'claude-sonnet-5': { in: 2.0, out: 10.0 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0 },
  'claude-opus-5': { in: 5.0, out: 25.0 },
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
};

const FALLBACK_RATE = { in: 2.0, out: 10.0 };
let warnedUnknownModel = false;

function ratesFor(model: string): { in: number; out: number } {
  const r = MODEL_RATES[model];
  if (r) return r;
  if (!warnedUnknownModel) {
    warnedUnknownModel = true;
    log('warn', 'budget.unknown_model', { model, priced_as: 'claude-sonnet-5' });
  }
  return FALLBACK_RATE;
}

export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/**
 * A cached read is a tenth of the input rate and a cache write is a quarter more
 * than one — the standard multipliers. They matter here because the analyzer's
 * system prompt is several thousand tokens and fires four times per segment, so
 * whether it is cached is most of the difference between a $2 hour and a $5 one.
 */
export function anthropicCostUsd(model: string, usage: Usage): number {
  const r = ratesFor(model);
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const usd =
    (inTok * r.in + outTok * r.out + cacheRead * r.in * 0.1 + cacheWrite * r.in * 1.25) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** ESTIMATE. See the header — reconcile against an invoice before quoting it. */
export function ttsCostUsd(characters: number): number {
  const per1k = Number(process.env.LIVE_TTS_USD_PER_1K_CHARS ?? 0.015);
  return Math.round((characters / 1000) * per1k * 1_000_000) / 1_000_000;
}

export type CostLine = {
  segment: number | null;
  kind: 'analysis' | 'script' | 'tts' | 'other';
  usd: number;
  detail: string;
  measured: boolean;
};

export class Budget {
  private readonly capPerHour: number;
  private readonly startedAt = Date.now();
  private lines: CostLine[] = [];
  private degradedAt: number | null = null;

  constructor(capPerHour = config.budgetPerHour()) {
    this.capPerHour = capPerHour;
  }

  record(line: CostLine): void {
    this.lines.push(line);
    log('info', 'budget.spend', {
      kind: line.kind,
      segment: line.segment,
      usd: money(line.usd),
      total: money(this.total()),
      measured: line.measured,
      detail: line.detail,
    });
  }

  total(): number {
    return this.lines.reduce((a, l) => a + l.usd, 0);
  }

  forSegment(seq: number): number {
    return this.lines.filter((l) => l.segment === seq).reduce((a, l) => a + l.usd, 0);
  }

  /**
   * Hours of SHOW elapsed, floored at a minute so the first segment is not
   * divided by zero.
   *
   * Multiplied by `LIVE_PACE`, and that is not a fudge: the cap is a budget per
   * hour of BROADCAST, and a dev run at pace 25 plays an hour of show in two
   * minutes. Without the multiplier every fast run trips the cap in its third
   * segment and reports a degrade that would never happen on air — which makes
   * the one signal that matters here untrustworthy exactly when it is cheapest
   * to check.
   */
  private hours(): number {
    const pace = Math.max(1, Number(process.env.LIVE_PACE ?? 1));
    return Math.max(((Date.now() - this.startedAt) * pace) / 3_600_000, 1 / 60);
  }

  /** Spend projected onto a full hour at the current rate. */
  runRateUsdPerHour(): number {
    return this.total() / this.hours();
  }

  /** What a segment has cost on average so far. Null until one has been paid for. */
  averageSegmentUsd(): number | null {
    const segs = new Set(this.lines.filter((l) => l.segment !== null).map((l) => l.segment));
    if (!segs.size) return null;
    return this.total() / segs.size;
  }

  /**
   * "Can I afford to build the next one?"
   *
   * The allowance is the cap prorated over the show's elapsed time, plus one
   * segment's headroom — a show four minutes old is allowed a fraction of an
   * hour's budget, and without the headroom the very first segment would breach
   * a $3/hr cap the moment it cost more than 20 cents. The headroom is what
   * makes the cap a RATE limit rather than a start-up ban.
   */
  wouldBreach(projectedUsd?: number): boolean {
    const avg = this.averageSegmentUsd();
    const next = projectedUsd ?? avg ?? 0;
    const allowance = this.capPerHour * this.hours() + (avg ?? this.capPerHour / 12);
    return this.total() + next > allowance;
  }

  /** Latched: once the show has degraded it stays degraded, and says why. */
  markDegraded(): void {
    if (this.degradedAt === null) {
      this.degradedAt = Date.now();
      log('warn', 'budget.cap_reached', {
        cap_usd_per_hour: this.capPerHour,
        spent: money(this.total()),
        run_rate: money(this.runRateUsdPerHour()),
        note: 'dropping to cached and fixture segments',
      });
    }
  }

  get degraded(): boolean {
    return this.degradedAt !== null;
  }

  get cap(): number {
    return this.capPerHour;
  }

  /** The per-segment table the build gate asks for. */
  table(): { segment: number | null; usd: number; measured: boolean; detail: string; kind: string }[] {
    return this.lines.map((l) => ({
      segment: l.segment,
      usd: l.usd,
      measured: l.measured,
      detail: l.detail,
      kind: l.kind,
    }));
  }

  summary(): { total_usd: number; per_hour: number; segments: Record<string, number> } {
    const per: Record<string, number> = {};
    for (const l of this.lines) {
      const k = l.segment === null ? 'show' : String(l.segment);
      per[k] = Math.round(((per[k] ?? 0) + l.usd) * 1_000_000) / 1_000_000;
    }
    return {
      total_usd: Math.round(this.total() * 1_000_000) / 1_000_000,
      per_hour: Math.round(this.runRateUsdPerHour() * 10000) / 10000,
      segments: per,
    };
  }
}
