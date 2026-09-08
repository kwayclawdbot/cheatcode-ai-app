/**
 * The entitlement contract, wired to the two reads that feed it.
 *
 * Split from `entitlements.ts` so the rules themselves stay a pure module that
 * `scripts/entitlement-test.mts` can import under Node. Everything here is
 * plumbing: `/me` carries the flags, `/credits` carries the plan's name, and
 * `buildEntitlementView` decides what any of it means.
 *
 * `failed` is the state the plan screen must not paper over — `/me` answered
 * with nothing and the loader has stopped. `loading` is not that: a request
 * still in flight is a spinner, not a downgrade.
 */
import { useMemo } from 'react';
import { useMe } from './useAccount';
import { useCredits } from './useCredits';
import { buildEntitlementView, type EntitlementView } from './entitlements';
import type { Me } from '../../lib/types';

export type EntitlementResource = EntitlementView & {
  /**
   * The daily allowance, or null. Handed back here so a screen that needs
   * both does not call `useMe()` a second time alongside this hook — that is
   * two `/me` requests for one render, and the second one can answer
   * differently from the first.
   */
  balance: NonNullable<Me['credits']> | null;
  /** The server's own one-liner about the plan, or null. */
  plain: string | null;
  loading: boolean;
  /** `/me` was asked and could not answer. Never the same thing as "free". */
  failed: boolean;
  /** The endpoint is not deployed on this stack, rather than broken. */
  notAvailable: boolean;
  /** Plain-English message from whichever read failed, or null. */
  error: string | null;
  isFixture: boolean;
  reload: () => void;
};

export function useEntitlements(): EntitlementResource {
  const me = useMe();
  const credits = useCredits();

  const view = useMemo(
    () => buildEntitlementView(me.data, credits.data ?? null),
    [me.data, credits.data],
  );

  return {
    ...view,
    balance: credits.data?.credits ?? me.data?.credits ?? null,
    plain: me.data?.subscription.plain ?? null,
    loading: me.loading || credits.loading,
    failed: !me.data && !me.loading,
    notAvailable: me.notAvailable,
    error: me.error ?? credits.error,
    isFixture: me.isFixture,
    reload: () => { me.reload(); credits.reload(); },
  };
}
