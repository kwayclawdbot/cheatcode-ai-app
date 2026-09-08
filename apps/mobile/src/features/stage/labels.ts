/**
 * The words for a readiness stage (0042), in one place so the profile, the
 * community line and the onboarding step cannot describe the same member
 * differently.
 *
 * These follow the house rule about plain English: no "cohort", no "tier", no
 * "level 2". A stage is a sentence about what somebody can do.
 */
import type { Stage, StartAnswer } from '../../lib/types';

/** The tag itself. Two words at most — it renders at 9px beside a name. */
export const STAGE_LABEL: Record<Stage, string> = {
  beginner: 'Beginner',
  developing: 'Developing',
  trade_ready: 'Trade Ready',
};

/**
 * What the stage MEANS, for the profile where there is room to say it. Written
 * to the member, in the second person, and never as a ranking against anybody
 * else — the ladder is about their own progress and a leaderboard is a
 * different product.
 */
export const STAGE_BLURB: Record<Stage, string> = {
  beginner:
    'Learning how the market works. Kai explains more, investing and simple swing setups come first, and the Beginners room is yours.',
  developing:
    'Reading charts on your own and trading swings. Kai assumes the basics and starts showing you the day-trade side.',
  trade_ready:
    'Out of Foundations. Full analysis, less hand-holding, and Kai challenges your reasoning instead of teaching it.',
};

/** What moves somebody OFF this rung. Shown on the profile under the blurb. */
export const STAGE_NEXT: Record<Stage, string | null> = {
  beginner: 'Pass Day 2 of training — read a chart and call the trend — and this becomes Developing.',
  developing: 'Graduate Day 7 and this becomes Trade Ready.',
  trade_ready: null,
};

/* ───────────────────── onboarding: "Where are you right now?" ────────────── */

/**
 * The four answers, in the order they are offered. The order is deliberate: it
 * runs from least to most experienced, so somebody brand new meets themselves
 * in the first option rather than scanning past three descriptions of people
 * who already know more than they do.
 *
 * The mapping from an answer to a stage lives on the SERVER
 * (`apps/api/src/lib/stage/rules.ts`, `START_PLACEMENT`) and is not repeated
 * here — this file owns the words, that file owns the consequences.
 */
export const START_OPTIONS: { key: StartAnswer; title: string; sub: string }[] = [
  {
    key: 'brand_new',
    title: "I'm brand new",
    sub: 'Never bought a stock, or close to it. Start me at the beginning.',
  },
  {
    key: 'investor',
    title: "I invest but don't really trade",
    sub: 'I hold things long-term. Entries, stops and targets are not how I think yet.',
  },
  {
    key: 'swing',
    title: 'I swing trade',
    sub: 'I take positions for days or weeks and I can read a chart.',
  },
  {
    key: 'active',
    title: 'I actively trade',
    sub: 'I trade regularly, intraday included. Skip the teaching.',
  },
];
