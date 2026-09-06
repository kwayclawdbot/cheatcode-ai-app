/**
 * The allowance.
 *
 * `GET /credits` is the one read. To this client it answers with the balance
 * and ONE plan — the person's own — carrying no price and no top-up pack. The
 * server decides that, not this file: see `apps/api/src/lib/storefront.ts`.
 */
import { useCallback } from 'react';
import { api } from '../../lib/api';
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

/*
 * `useTopup` IS GONE AND MUST NOT COME BACK.
 *
 * It called `POST /billing/topup` and opened a Stripe payment page. A way to
 * buy anything from inside the app breaks App Store rule 3.1.3(b), which is
 * what allows this app to honour a subscription bought on the website without
 * shipping In-App Purchase. The route still serves the website; it answers
 * NOT_FOUND to this client. See `apps/api/src/lib/storefront.ts`.
 */
