/**
 * Order review lifecycle (lane MOBILE-B).
 *
 * Two rules from docs/BUILD-BRIEF-round-3.md drive everything here:
 *   · a preview EXPIRES (60s day / 10m swing-invest). Past that the numbers on
 *     screen are not the numbers that would be sent, so the primary action is
 *     replaced by "Get fresh numbers" rather than left armed.
 *   · `accepted` is not `filled`. Submitting yields an order that exists and has
 *     not filled; the screen says exactly that and then polls until it does.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { tradeApi } from '../../lib/trade-api';
import type { OrderPreview, OrderRow, OrderTicket } from './types';

/** Seconds left on a preview, ticking. `null` when the server set no expiry. */
export function useExpiry(expiresAt: string | null | undefined) {
  const target = expiresAt ? new Date(expiresAt).getTime() : null;
  const compute = useCallback(
    () => (target == null || !Number.isFinite(target) ? null : Math.max(0, Math.round((target - Date.now()) / 1000))),
    [target],
  );
  const [left, setLeft] = useState<number | null>(compute);

  useEffect(() => {
    setLeft(compute());
    if (target == null || !Number.isFinite(target)) return;
    const t = setInterval(() => setLeft(compute()), 1000);
    return () => clearInterval(t);
  }, [compute, target]);

  return { secondsLeft: left, expired: left != null && left <= 0 };
}

/** Takes (and re-takes) a preview for a ticket. Nothing is ever sent here. */
export function usePreview(ticket: OrderTicket | null) {
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const key = ticket ? JSON.stringify(ticket) : '';
  useEffect(() => {
    if (!ticket) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    tradeApi.preview(ticket)
      .then((p) => { if (alive.current) setPreview(p); })
      .catch((e: unknown) => {
        if (!alive.current) return;
        setPreview(null);
        setError(e instanceof Error ? e.message : 'I could not price that order just now.');
      })
      .finally(() => { if (alive.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { preview, loading, error, repreview: () => setNonce((n) => n + 1) };
}

export type SubmitPhase = 'idle' | 'sending' | 'accepted' | 'filled' | 'failed';

const TERMINAL = new Set(['filled', 'cancelled', 'rejected']);
const POLL_MS = 1500;
const POLL_BUDGET_MS = 20_000;

/**
 * Submit, then watch. The two states are rendered separately on purpose: an
 * order that has been accepted but has not filled is a real thing a user can be
 * holding, and telling them it filled would be a lie.
 */
export function useSubmit() {
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  useEffect(() => () => { stop.current = true; }, []);

  const submit = useCallback(async (previewId: string, onPlaced?: (o: OrderRow) => void) => {
    setPhase('sending');
    setError(null);
    let placed: OrderRow;
    try {
      placed = await tradeApi.submit(previewId);
    } catch (e) {
      setPhase('failed');
      setError(e instanceof Error ? e.message : 'That order did not go through.');
      return null;
    }
    setOrder(placed);
    // Round 4: the confirmed screen takes over the moment the order EXISTS, so
    // the user sees "Placed · paper account" rather than a spinner that waits
    // for a fill. The poll below keeps running for callers that stay here.
    onPlaced?.(placed);
    setPhase(placed.status === 'filled' ? 'filled' : 'accepted');
    // One watcher per order. When a caller took over on `onPlaced` (round 4:
    // the confirmed screen), polling here as well would race it and eat the
    // accepted state before the user ever sees it.
    if (onPlaced || TERMINAL.has(placed.status) || !placed.id) return placed;

    // Poll GET /orders/:id — the paper tick fills resting limits between calls.
    const until = Date.now() + POLL_BUDGET_MS;
    let latest = placed;
    while (!stop.current && Date.now() < until && !TERMINAL.has(latest.status)) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      try {
        latest = await tradeApi.order(placed.id);
      } catch {
        break;                       // keep the accepted state; do not invent a fill
      }
      if (stop.current) break;
      setOrder(latest);
      if (latest.status === 'filled') setPhase('filled');
    }
    return latest;
  }, []);

  return { phase, order, error, submit };
}
