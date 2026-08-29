/**
 * What the show talks about next.
 *
 * Four tiers, in this order, and a symbol is never repeated inside one show:
 *
 *   1. Ready A/B setups from today   — the premise of the product
 *   2. Subscriber requests           — somebody paid to ask
 *   3. Recent winners                — the receipts, outside their hold window
 *   4. Watchlist / movers            — the floor, so the show never goes quiet
 *
 * THE ORDER IS A PRODUCT DECISION, NOT A HEURISTIC. The show exists because Kai
 * analyzes setups; a rundown that opened on a viewer request would be a request
 * show with some analysis in it. Requests sit at tier 2 rather than tier 1 for
 * the same reason, and they still beat everything below because someone is
 * waiting for theirs and can tell whether it came up.
 *
 * THE `blocked` SET IS THE WHOLE DEDUPE. It is the union of what is prepared,
 * what is being prepared, and what has recently played — so a name cannot be
 * queued twice by two tiers, and cannot come back four minutes after it aired.
 * The API applies it inside the query so the fallback tier fills the gap in the
 * same round trip, rather than the router filtering afterwards and coming back
 * short.
 *
 * ONE THING THE OLD SHOW'S ROUTER GOT WRONG AND THIS ONE DOES NOT: it popped
 * paid requests destructively while scanning, so a blocked request was thrown
 * away rather than left in the queue. Here a request is only settled once it has
 * actually aired — `take()` reserves, `settle()` disposes — because somebody
 * asked for that ticker and a segment that fails to prepare must not silently
 * consume it.
 */
import { fetchRundown, settleRequest, type Candidate } from './api.ts';
import { log } from './log.ts';

export type SourceMode = 'review' | 'market';

export class SourceRouter {
  /** Symbols that have been handed out this show. Never handed out twice. */
  private readonly issued = new Set<string>();
  /** Reserved requests: handed to a segment, not yet settled. */
  private readonly reserved = new Map<string, string>();
  private exhausted = false;

  constructor(private readonly mode: SourceMode) {}

  /** Prepared + in flight + recently played, from the director. */
  blocked(extra: Iterable<string> = []): string[] {
    const out = new Set(this.issued);
    for (const s of extra) out.add(s.toUpperCase());
    return [...out];
  }

  /**
   * The next thing to talk about, or null when there is nothing left.
   *
   * `null` ends the show. That is the correct ending for a review show — it
   * covers today's setups, today's requests and today's winners, and then it is
   * over — and it is the wrong ending for a market-hours show, which is LIVE-4's
   * problem to solve by waiting on `setup_events` rather than by inventing a
   * segment here.
   */
  async next(inFlight: Iterable<string> = []): Promise<Candidate | null> {
    if (this.exhausted) return null;

    const { candidates, degraded, degraded_reason } = await fetchRundown({
      mode: this.mode,
      limit: 12,
      exclude: this.blocked(inFlight),
    });

    if (degraded || !candidates.length) {
      this.exhausted = true;
      log('warn', 'sources.exhausted', { reason: degraded_reason ?? 'the rundown came back empty' });
      return null;
    }

    // The API already ranks within tiers and orders the tiers; taking the first
    // unissued candidate is the routing decision, and keeping it that simple is
    // what makes the priority order auditable from one place.
    const pick = candidates.find((c) => !this.issued.has(c.symbol.toUpperCase()));
    if (!pick) {
      this.exhausted = true;
      return null;
    }

    this.issued.add(pick.symbol.toUpperCase());
    if (pick.request_id) this.reserved.set(pick.symbol.toUpperCase(), pick.request_id);
    log('info', 'sources.picked', {
      symbol: pick.symbol,
      source: pick.source,
      rank: pick.rank,
      grade: pick.grade_display ?? '—',
    });
    return pick;
  }

  /**
   * A segment aired, or failed. Only now does a subscriber request leave the
   * queue — and a failed segment releases the SYMBOL too, so a name that could
   * not be prepared at 8:04 can be tried again later in the show.
   */
  async settle(symbol: string, outcome: 'presented' | 'skipped', segmentId?: string): Promise<void> {
    const key = symbol.toUpperCase();
    const requestId = this.reserved.get(key);
    if (requestId) {
      this.reserved.delete(key);
      await settleRequest(requestId, outcome, segmentId).catch((e) =>
        log('warn', 'sources.settle_failed', { symbol, message: String(e) })
      );
    }
    if (outcome === 'skipped') this.issued.delete(key);
  }

  get done(): boolean {
    return this.exhausted;
  }
}
