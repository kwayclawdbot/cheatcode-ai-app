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
 *
 * ---------------------------------------------------------------------------
 * DAY TRADE WAS ARCHIVED AS COMING SOON ON 2026-09-06, AND IS LIVE AGAIN THE
 * SAME DAY — because the condition that archived it was met.
 *
 * WHY IT WAS ARCHIVED. The same-day picker was not running. The intraday cron
 * was disabled on 2026-08-03 pending the fix the 2026-07-29 audit called for,
 * and the last opening-range alert this product sent was 2026-08-04. So Day
 * Trade held a mode chip, a tab and a heading, and behind them nothing a person
 * could act on — which reads as broken rather than as unfinished.
 *
 * WHAT CHANGED. A different same-day picker is publishing: the
 * unusual-options-activity day-trade engine, which polls the options flow feed
 * through the session and POSTs each alert it fires to
 * `/api/v1/internal/uoa-alerts`, where it becomes an ordinary `setups` row with
 * `mode = day_trade`. That is the producer-side condition this comment asked
 * for, and it is met by a different engine to the one that broke — which is the
 * honest reading, not a technicality: the opening-range picker is still down.
 *
 * WHAT THE MODE NOW SHOWS. Real cards, on the days that engine fires. It is a
 * selective filter — 17 alerts across 94 sessions in the measured record — so a
 * quiet day is a genuinely empty board rather than a broken one. That is the
 * one thing to watch here: if the empty days start reading as breakage again,
 * the answer is a line on the board saying the engine is running and has not
 * fired today, NOT flipping this back.
 *
 * THE FLIP IS STILL ONE LINE. Nothing else in the app reads the state any other
 * way — not the tab bar, not the tab screen, not the mode sheet, not
 * onboarding.
 * ---------------------------------------------------------------------------
 */
import type { GoalMode } from '../../lib/types';

/**
 * THE FLIP. `true` = Day Trade is an ordinary alerts tab.
 *
 * Set it back to `false` if the day-trade producer stops publishing entirely
 * and the mode again has nothing behind it. It is the only switch; if you find
 * yourself changing a second file to turn the mode on or off, something has
 * grown a second answer and that is the bug.
 */
export const DAY_TRADE_LIVE = true;

/**
 * The mode a screen assumes when the profile has not loaded or has no
 * `primary_mode` — a row written before onboarding finished, or the first
 * frame after a cold start.
 *
 * It was `day_trade`, which is now the one mode with nothing in it, so a
 * person could see the coming-soon screen for a moment purely because their
 * profile had not arrived yet. Swing is the mode that is actually live, so
 * that is what a screen falls back to.
 */
export const DEFAULT_MODE: GoalMode = 'swing';

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
  /**
   * True when this mode has nothing live behind it and the tab should say so
   * rather than draw an empty board. Only Day Trade, and only while
   * `DAY_TRADE_LIVE` is false.
   */
  comingSoon: boolean;
};

const ALERTS = {
  label: 'Alerts',
  icon: 'bell',
  title: 'Alerts',
  desk: false,
  comingSoon: false,
} as const;

/** Swing is the live alerts mode and the answer for anything unrecognised. */
const SWING: SecondTab = {
  ...ALERTS,
  note: "You're in Swing mode, so these are multi-day alerts. Switch to Invest and this tab becomes the research desk.",
};

export function secondTab(mode: GoalMode): SecondTab {
  switch (mode) {
    case 'invest':
      return {
        ...ALERTS,
        label: 'Research',
        icon: 'desk',
        title: 'The watchlist',
        note: "You're in Invest mode, so this tab is the research desk. Today's alerts are in Swing — change the mode to see them.",
        desk: true,
      };
    case 'day_trade':
      return DAY_TRADE_LIVE
        ? {
          ...ALERTS,
          note: "You're in Day Trade mode, so these are same-day alerts. Switch to Invest and this tab becomes the research desk.",
        }
        : {
          ...ALERTS,
          // The tab bar still says Alerts, because that is what this slot is
          // and will be. The SCREEN is where the mode explains itself — a tab
          // renamed "Soon" would make the whole app look half-built for the
          // sake of one mode.
          title: 'Day Trade',
          note: "Day Trade is not live yet. Swing alerts are running today — switch the mode above to see them.",
          comingSoon: true,
        };
    case 'swing':
    default:
      return SWING;
  }
}

/** Every mode the profile can hold. Nothing may fall through to a blank tab. */
export const ALL_MODES: GoalMode[] = ['day_trade', 'swing', 'invest'];

/**
 * Is this mode something a person can actually use today? Read by the mode
 * sheet and by onboarding so the label and the tab cannot disagree.
 *
 * Invest counts as live: its second tab is the research desk, which has
 * content. Whether Home has a lead setup in Invest is a separate question and
 * is not this function's to answer.
 */
export function modeIsLive(mode: GoalMode): boolean {
  return mode === 'day_trade' ? DAY_TRADE_LIVE : true;
}

/**
 * The short marker a picker puts next to a mode that is not live. Null when
 * the mode is live, so a caller renders nothing rather than an empty pill.
 */
export function modeBadge(mode: GoalMode): string | null {
  return modeIsLive(mode) ? null : 'COMING SOON';
}
