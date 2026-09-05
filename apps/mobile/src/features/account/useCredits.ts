/**
 * The allowance, and buying more of it.
 *
 * `GET /credits` is the one read. It carries the balance, the plan ladder and
 * the top-up pack together, so the credits screen never has to assemble a
 * price list of its own — a marketing list typed into the app is how a price
 * change ends up shipped in one half of a product.
 */
import { useCallback, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import {
  fixtureCreditsPayload, fixtureCreditsCeiling, fixtureCreditsOut,
  fixtureCreditsTopup, fixtureCreditsWarning,
} from '../../lib/fixtures';
import type { CreditsPayload } from '../../lib/types';

/** Fixtures preview only — lets the owner and Playwright see every state. */
export type CreditFixture = 'default' | 'warn' | 'out' | 'ceiling' | 'topup';

const FIXTURE: Record<CreditFixture, CreditsPayload> = {
  default: fixtureCreditsPayload,
  warn: { ...fixtureCreditsPayload, credits: fixtureCreditsWarning },
  out: { ...fixtureCreditsPayload, credits: fixtureCreditsOut },
  ceiling: { ...fixtureCreditsPayload, credits: fixtureCreditsCeiling },
  topup: { ...fixtureCreditsPayload, credits: fixtureCreditsTopup },
};

export function useCredits(fixture: CreditFixture = 'default') {
  const load = useCallback(() => api.credits(), []);
  return useResource<CreditsPayload | null>(load, FIXTURE[fixture], [fixture]);
}

/**
 * `POST /billing/topup`. The honest "not configured yet" path is a first-class
 * result, exactly as it is for the subscription checkout: no keys means a plain
 * sentence and nothing charged, never a dead checkout url.
 */
export function useTopup() {
  const [state, setState] = useState<{ url: string | null; message: string | null; busy: boolean }>({
    url: null, message: null, busy: false,
  });

  const start = useCallback(async () => {
    if (!api.available()) {
      setState({ url: null, message: 'Top-ups open soon.', busy: false });
      return;
    }
    setState({ url: null, message: null, busy: true });
    try {
      const r = await api.billingTopup();
      setState({ url: r?.url ?? null, message: r?.url ? null : 'Top-ups open soon.', busy: false });
    } catch (e) {
      const msg = e instanceof ApiError && e.code === 'BILLING_NOT_CONFIGURED'
        ? e.message || 'Top-ups open soon.'
        : e instanceof Error ? e.message : 'Top-ups open soon.';
      setState({ url: null, message: msg, busy: false });
    }
  }, []);

  return { ...state, start, dismiss: () => setState({ url: null, message: null, busy: false }) };
}
