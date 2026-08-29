/**
 * The prep buffer: producer fills, consumer drains, neither blocks the other.
 *
 * Depth counts ITEMS PLUS IN-FLIGHT. Depth 2 means at most two segments in any
 * state of readiness — one finished and one cooking, or two finished — not two
 * finished plus however many happen to be mid-analysis. The distinction is the
 * difference between a bounded spend and an unbounded one, since every in-flight
 * segment is model calls already paid for.
 *
 * THE STALE-PREP REAPER EXISTS BECAUSE THE OLD ONE DID NOT HAVE IT. Its buffer
 * recorded `startedAt` on every in-flight prep and never read it, so a producer
 * that died mid-analysis leaked a slot permanently: at depth 2, one leak halves
 * throughput and two leaks deadlock the show with the consumer waiting forever
 * on a producer that is waiting forever for a slot. Here a prep that has been in
 * flight past `staleMs` is reaped, its slot released, and the loss logged.
 *
 * `popNext()` RESOLVES WITH null WHEN CLOSED and otherwise waits — the consumer
 * has nothing useful to do with an empty buffer except wait, and what covers the
 * gap for the AUDIENCE is a cohost bridge emitted by the director, not a
 * fallback item invented down here. A buffer that manufactures filler is a
 * buffer that hides the fact that the producer has stopped.
 */
import { log } from './log.ts';

export type BufferItem<T> = { symbol: string; value: T; queuedAt: number };

export class PrepBuffer<T> {
  private items: BufferItem<T>[] = [];
  private inFlight = new Map<string, number>();
  private recent: string[] = [];
  private slotWaiters: ((ok: boolean) => void)[] = [];
  private itemWaiters: ((v: BufferItem<T> | null) => void)[] = [];
  private closed = false;

  constructor(
    private readonly depth = 2,
    private readonly historyLimit = 5,
    private readonly staleMs = 5 * 60_000
  ) {}

  private reapStale(): void {
    const now = Date.now();
    for (const [symbol, startedAt] of this.inFlight) {
      if (now - startedAt > this.staleMs) {
        this.inFlight.delete(symbol);
        log('warn', 'buffer.reaped', {
          symbol,
          held_ms: now - startedAt,
          note: 'a prep never finished; its slot is back',
        });
      }
    }
  }

  hasCapacity(): boolean {
    this.reapStale();
    return this.items.length + this.inFlight.size < this.depth;
  }

  /** Resolves true when there is room, false when the buffer has closed. */
  waitForSlot(): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    if (this.hasCapacity()) return Promise.resolve(true);
    return new Promise((resolve) => this.slotWaiters.push(resolve));
  }

  startPrep(symbol: string): void {
    if (!symbol) throw new Error('a prep needs a symbol');
    this.inFlight.set(symbol.toUpperCase(), Date.now());
  }

  push(symbol: string, value: T): void {
    const key = symbol.toUpperCase();
    this.inFlight.delete(key);
    this.items.push({ symbol: key, value, queuedAt: Date.now() });
    const waiter = this.itemWaiters.shift();
    if (waiter) waiter(this.items.shift()!);
  }

  /** A prep that failed. Frees the slot without buffering anything. */
  abortPrep(symbol: string, reason: string): void {
    const key = symbol.toUpperCase();
    if (!this.inFlight.delete(key)) return;
    log('warn', 'buffer.aborted', { symbol: key, reason });
    this.wakeSlot();
  }

  popNext(): Promise<BufferItem<T> | null> {
    if (this.items.length) {
      const item = this.items.shift()!;
      this.wakeSlot();
      return Promise.resolve(item);
    }
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => this.itemWaiters.push(resolve));
  }

  /** Non-destructive: what the outro names while the chart is still on this one. */
  peekNext(): BufferItem<T> | null {
    return this.items[0] ?? null;
  }

  markPlayed(symbol: string): void {
    this.recent.push(symbol.toUpperCase());
    while (this.recent.length > this.historyLimit) this.recent.shift();
    this.wakeSlot();
  }

  /** Prepared ∪ in-flight ∪ recently played. The router's no-repeat set. */
  blocked(): string[] {
    return [...new Set([...this.items.map((i) => i.symbol), ...this.inFlight.keys(), ...this.recent])];
  }

  get readyDepth(): number {
    return this.items.length;
  }

  get inFlightCount(): number {
    return this.inFlight.size;
  }

  private wakeSlot(): void {
    if (!this.hasCapacity()) return;
    const w = this.slotWaiters.shift();
    if (w) w(true);
  }

  /** Wake everybody so no loop is left parked on a promise that will never settle. */
  close(): void {
    this.closed = true;
    this.items = [];
    this.inFlight.clear();
    for (const w of this.slotWaiters.splice(0)) w(false);
    for (const w of this.itemWaiters.splice(0)) w(null);
  }
}
