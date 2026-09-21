/**
 * WHAT THE DOCK SHOWS BESIDES ITS FIVE GLYPHS — the mode, the alerts dot and the
 * Trade padlock — worked out in one place.
 *
 * This used to live inline in `app/(tabs)/_layout.tsx`, which was fine while
 * the tab navigator was the only thing that drew a dock. The Trade section is a
 * stacked route (`/trade/[symbol]`) that the spec still counts as a primary
 * screen, so it draws the same dock itself — and a dock that reads its dot and
 * its padlock differently on one screen is not "identical across all primary
 * screens". Both callers read this hook, so the two cannot disagree.
 *
 * The reasoning behind each piece is unchanged and still written where it
 * matters: the padlock is a courtesy read from the enforcement contract
 * (`features/account/entitlements.ts`), and the dot is only drawn on a CHECKED
 * answer (`features/alerts/attention.ts`).
 */
import { useAlertAttention } from '../alerts/attention';
import { useMe } from '../account/useAccount';
import { buildEntitlementView } from '../account/entitlements';
import { useSession } from '../../lib/session';
import { DEFAULT_MODE, secondTab } from './second-tab';
import type { GoalMode } from '../../lib/types';

export function useDockState(): {
  mode: GoalMode;
  second: ReturnType<typeof secondTab>;
  badges: Record<string, boolean>;
  locked: Record<string, boolean>;
} {
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? DEFAULT_MODE;
  const second = secondTab(mode);
  const me = useMe();
  // Only an explicit `excluded` locks; an unknown answer leaves the tab unmarked.
  const tradeLocked = buildEntitlementView(me.data, null).tradePanel === 'excluded';
  // In Invest mode the tab is not showing alerts, so it neither carries nor pays for their dot.
  const alertsTabShowsAlerts = !second.desk && !second.comingSoon;
  const attention = useAlertAttention(alertsTabShowsAlerts);
  return {
    mode,
    second,
    badges: { alerts: attention.status === 'ready' && attention.needsAttention },
    locked: { trade: tradeLocked },
  };
}
