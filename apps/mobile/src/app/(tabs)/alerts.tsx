/**
 * The second tab, which is three screens.
 *
 * V2 (owner pack, 2026-09-21): ONE board for all three modes, with a
 * Day Trade | Swing | Invest segmented control at the top. Invest still means
 * the research desk — the board draws the desk's graded companies in the
 * alert card's visual language, with no triggers (investing picks are not
 * alerts). The full desk stays at /desk.
 *
 * `primary_mode` has been stored since onboarding and Invest has meant nothing
 * until now. Here is what it means: a swing trader gets today's alerts, an
 * investor gets the research desk — the same slot, the same route, a different
 * job. The tab bar stays at five items.
 *
 * The third screen is Day Trade, which is ARCHIVED AS COMING SOON (owner
 * ruling, 2026-09-06). Its same-day picker is not publishing, so the tab says
 * that rather than drawing an alerts board with nothing same-day on it. The
 * mode is not removed and its data is not deleted — see `nav/second-tab.ts`,
 * where `DAY_TRADE_LIVE` is the single line that turns it back on.
 *
 * The mode is read from the profile the app already loads. There is no second
 * setting for this, and there must never be one: two switches for one idea is
 * how a person ends up in a state they cannot explain.
 */
import React from 'react';
import { useSession } from '../../lib/session';
import { DEFAULT_MODE, secondTab } from '../../features/nav/second-tab';
import { AlertsBoard } from '../../features/alerts/AlertsBoard';
import { DayTradeComingSoon } from '../../features/alerts/DayTradeComingSoon';
import type { GoalMode } from '../../lib/types';

export default function SecondTabScreen() {
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? DEFAULT_MODE;
  const second = secondTab(mode);
  // Invest is a segment of the same board now (V2, 2026-09-21): the board
  // draws the research list for it, in the alert card's visual language.
  if (second.comingSoon) return <DayTradeComingSoon mode={mode} />;
  return <AlertsBoard mode={mode} />;
}
