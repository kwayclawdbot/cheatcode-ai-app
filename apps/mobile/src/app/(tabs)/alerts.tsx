/**
 * The second tab, which is two screens.
 *
 * `primary_mode` has been stored since onboarding and Invest has meant nothing
 * until now. Here is what it means: a day trader and a swing trader get
 * today's alerts, and an investor gets the research desk — the same slot, the
 * same route, a different job. The tab bar stays at five items.
 *
 * The mode is read from the profile the app already loads. There is no second
 * setting for this, and there must never be one: two switches for one idea is
 * how a person ends up in a state they cannot explain.
 */
import React from 'react';
import { useSession } from '../../lib/session';
import { secondTab } from '../../features/nav/second-tab';
import { AlertsBoard } from '../../features/alerts/AlertsBoard';
import { DeskWatchlist } from '../../features/desk/Watchlist';
import type { GoalMode } from '../../lib/types';

export default function SecondTabScreen() {
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  return secondTab(mode).desk ? <DeskWatchlist variant="tab" /> : <AlertsBoard mode={mode} />;
}
