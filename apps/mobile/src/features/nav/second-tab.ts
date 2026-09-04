/**
 * What the second tab is, in each mode.
 *
 * `primary_mode` has stored day_trade / swing / invest since onboarding, and
 * Invest has meant nothing — the onboarding sheet still says managed investing
 * "arrives in a later release". This is what makes Invest real: the second tab
 * carries today's alerts for a day trader and a swing trader, and the research
 * desk for an investor. The tab bar stays at five, because five is the ceiling
 * on a phone.
 *
 * The mapping lives here, on its own, with no React and no network, so the tab
 * bar, the tab screen and the test all read the SAME answer. A label that says
 * "Alerts" over a screen of themes is the exact failure this module prevents.
 */
import type { GoalMode } from '../../lib/types';

export type SecondTab = {
  /** The word under the glyph in the tab bar. Short — five of these share a phone. */
  label: string;
  /** Which glyph the tab bar draws. */
  icon: 'bell' | 'desk';
  /** The heading at the top of the screen. */
  title: string;
  /**
   * One line saying what this tab is showing and what would change it. The mode
   * is the thing that changed, so the screen says so rather than leaving a
   * person to work out why their alerts turned into a watchlist.
   */
  note: string;
  /** True when this tab is showing the research desk rather than alerts. */
  desk: boolean;
};

const ALERTS = {
  label: 'Alerts',
  icon: 'bell',
  title: 'Alerts',
  desk: false,
} as const;

export function secondTab(mode: GoalMode): SecondTab {
  switch (mode) {
    case 'invest':
      return {
        label: 'Research',
        icon: 'desk',
        title: 'The watchlist',
        note: "You're in Invest mode, so this tab is the research desk. Today's alerts are in Day Trade and Swing — change the mode to see them.",
        desk: true,
      };
    case 'swing':
      return {
        ...ALERTS,
        note: "You're in Swing mode, so these are multi-day alerts. Switch to Invest and this tab becomes the research desk.",
      };
    case 'day_trade':
    default:
      return {
        ...ALERTS,
        note: "You're in Day Trade mode, so these are same-day alerts. Switch to Invest and this tab becomes the research desk.",
      };
  }
}

/** Every mode the profile can hold. Nothing may fall through to a blank tab. */
export const ALL_MODES: GoalMode[] = ['day_trade', 'swing', 'invest'];
