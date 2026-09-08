/**
 * WHAT THIS BUILD CAN ACTUALLY DO — one list, and the only list.
 *
 * Audit F02 (P1): "Promise only the capabilities available on this build." The
 * evidence was three surfaces disagreeing with each other about the same
 * product. The onboarding plan screen said a brokerage could be connected any
 * time in Account; Account said paper is the only mode and a broker comes
 * later. The training hero sold seven days of curriculum against one authored
 * lesson. The website's plan cards sold "the 7-day path, then a lesson a day"
 * to somebody who would open the app and find step 01.
 *
 * None of those were lies anybody wrote on purpose. They were three copies of
 * the same claim, edited at different times, which is what copy always does.
 * So the claim stops being copy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ACCEPTANCE TEST IS WHY `destination` IS A FIELD AND NOT A COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * F02's acceptance is that every advertised capability has a working
 * destination for that account and platform, and that an availability change
 * updates BOTH the offer and the destination. A list of strings cannot satisfy
 * the second half — somebody flips a word in a marketing bullet and the button
 * still lands on an apology.
 *
 * So an entry carries the offer (`title`, `action`, `plain`) and the
 * destination (`route`) together, and `state` decides which of the two is
 * rendered. Turning something on or off is one edit here:
 *
 *     state: 'planned'  →  no button anywhere, a "Planned" label instead
 *     state: 'available' →  the action, pointing at `route`
 *
 * A `planned` entry MUST have `route: null`, and an `available` entry MUST have
 * a route. `apps/mobile/scripts/onboarding-continuity-test.mts` fails the build
 * if either rule is broken, and it also checks that every route named here is a
 * file that exists in `apps/mobile/src/app`. That is the mechanical version of
 * "a working destination".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WEBSITE HAS A COPY, AND THAT IS DELIBERATE
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/site` is its own Vercel project with Root Directory = apps/site, and
 * its `next.config.ts` says in as many words that it imports nothing from
 * packages/shared because the parent directory is not uploaded on deploy.
 * Importing this file from the site would break that deploy.
 *
 * So the site carries a mirror at `apps/site/src/sim/capabilities.ts`, and the
 * same test reads BOTH files and fails when the id, state or title of any entry
 * stops matching. That is the pattern this repo already uses for
 * `START_PLACEMENT` / `DAY_GATES` (see `apps/api/src/lib/stage/rules.ts`):
 * duplication is the cost of a deployment boundary, and a test is what stops
 * duplication from drifting.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS NOT IN HERE
 * ─────────────────────────────────────────────────────────────────────────────
 * Entitlements. Whether THIS member may use an available capability is a
 * separate question with its own contract — `features/account/entitlements.ts`,
 * three states, `unknown` neither grants nor locks. This file answers "does the
 * product do this at all", which is the question the audit found three
 * different answers to. A capability can be `available` and still gated.
 */

/** Every capability the site, onboarding or the app is allowed to mention. */
export type CapabilityId =
  | 'paper_trading'
  | 'broker_execution'
  | 'training_basics'
  | 'training_read_chart'
  | 'training_build_plan'
  | 'kai'
  | 'swing_alerts'
  | 'day_trade_alerts'
  | 'research_desk'
  | 'chats'
  | 'belts';

/**
 * Two states, on purpose.
 *
 * "Coming soon" and "in beta" and "early access" are the words a product uses
 * when it wants credit for something it cannot do. A member gets one question
 * answered: can I do this today, or not yet.
 */
export type CapabilityState = 'available' | 'planned';

export type Capability = {
  id: CapabilityId;
  /** What a member would call it, in a list. */
  title: string;
  /**
   * The words a button is allowed to use — the audit's own instruction that
   * the action itself say "Practise with paper money", so nobody has to read a
   * footnote to learn that no money is involved.
   */
  action: string;
  state: CapabilityState;
  /**
   * The expo-router path the action opens. Null when, and only when, the state
   * is `planned` — there is nowhere honest to send somebody.
   */
  route: string | null;
  /**
   * One line. For an available capability, what it is. For a planned one, what
   * is actually missing — never a date, because we do not have one.
   */
  plain: string;
  /** Where the source of truth for this entry's state lives, for the next editor. */
  because: string;
};

export const CAPABILITIES: Record<CapabilityId, Capability> = {
  paper_trading: {
    id: 'paper_trading',
    title: 'Paper trading',
    action: 'Practise with paper money',
    state: 'available',
    route: '/account/paper',
    plain: 'A practice account with a real balance and real prices. Nothing reaches a broker.',
    because: 'Paper is the only account kind this build creates — 0020 paper execution.',
  },
  broker_execution: {
    id: 'broker_execution',
    title: 'Trading with real money',
    action: 'Connect a brokerage',
    state: 'planned',
    route: null,
    plain: 'There is no brokerage connection in this release. Paper is the only mode.',
    because:
      'apps/mobile/src/app/(tabs)/account.tsx: "Paper is the only mode in this release — real money needs a broker, which comes later."',
  },
  training_basics: {
    id: 'training_basics',
    title: 'Market basics',
    action: 'Start step 01',
    state: 'available',
    route: '/training',
    plain: 'What you are looking at, and what you are actually buying.',
    because: 'PATH_STEPS[0] in apps/mobile/src/features/training/path.ts — day-1 lesson 1 is written.',
  },
  training_read_chart: {
    id: 'training_read_chart',
    title: 'Read a chart',
    action: 'Start step 02',
    state: 'planned',
    route: null,
    plain: 'Step 02 is not written yet. Step 01 is, and it is where the path starts.',
    because: 'PATH_STEPS[1] has no lesson with hasContent — stepState() returns "coming".',
  },
  training_build_plan: {
    id: 'training_build_plan',
    title: 'Build a plan',
    action: 'Start step 03',
    state: 'planned',
    route: null,
    plain: 'Step 03 is not written yet.',
    because: 'PATH_STEPS[2] has no lesson with hasContent — stepState() returns "coming".',
  },
  kai: {
    id: 'kai',
    title: 'Ask Kai',
    action: 'Ask Kai',
    state: 'available',
    route: '/home',
    plain: 'Ask about any screen, any setup, any position, in the level of detail you asked for.',
    because: 'One engine, lib/useKai.ts, reached from Home and every object screen.',
  },
  swing_alerts: {
    id: 'swing_alerts',
    title: 'Swing alerts',
    action: 'See swing alerts',
    state: 'available',
    route: '/alerts',
    plain: 'Multi-day setups with entry, invalidation and target on the card.',
    because: 'features/nav/second-tab.ts — swing is the always-live alerts mode.',
  },
  day_trade_alerts: {
    id: 'day_trade_alerts',
    title: 'Same-day alerts',
    action: 'See same-day alerts',
    state: 'available',
    route: '/alerts',
    plain: 'Selective. The unusual-options-activity engine fires on the days the setup appears, not daily.',
    because: 'DAY_TRADE_LIVE in features/nav/second-tab.ts. Flip that and flip this together.',
  },
  research_desk: {
    id: 'research_desk',
    title: 'Research desk',
    action: 'Open the desk',
    state: 'available',
    route: '/desk',
    plain: 'Companies explained as businesses — the horizon, the story, and what would break it.',
    because: 'secondTab("invest") is the desk, and /desk is also pushed from Account in every mode.',
  },
  chats: {
    id: 'chats',
    title: 'The three chats',
    action: 'Open the chats',
    state: 'available',
    route: '/community',
    plain: 'Traders, Investors and Beginners. Reading one never changes what you trade.',
    because: 'Migration 0045 three_chats; MODE_TO_ROOM in features/community/rooms.ts.',
  },
  belts: {
    id: 'belts',
    title: 'Belt progression',
    action: 'See your belt',
    state: 'available',
    route: '/training/belt',
    plain: 'A belt is earned by passing that rung’s exam. Account size appears nowhere in it.',
    because: 'Migrations 0046/0047 — server-side progress, belt from the exam.',
  },
};

/** Stable order for anything that renders the whole list. */
export const CAPABILITY_ORDER: CapabilityId[] = [
  'paper_trading',
  'kai',
  'swing_alerts',
  'day_trade_alerts',
  'research_desk',
  'chats',
  'training_basics',
  'training_read_chart',
  'training_build_plan',
  'belts',
  'broker_execution',
];

export function capability(id: CapabilityId): Capability {
  return CAPABILITIES[id];
}

export function isAvailable(id: CapabilityId): boolean {
  return CAPABILITIES[id].state === 'available';
}

/**
 * The offer, filtered to what can actually be opened.
 *
 * Callers that draw a list of things a member can do NOW pass their ids
 * through here. The planned ones are not dropped silently — `plannedFrom`
 * returns them so the same screen can label them, which is the audit's
 * instruction: offer only available lessons and label the rest as planned.
 */
export function availableFrom(ids: CapabilityId[]): Capability[] {
  return ids.map(capability).filter((c) => c.state === 'available');
}

export function plannedFrom(ids: CapabilityId[]): Capability[] {
  return ids.map(capability).filter((c) => c.state === 'planned');
}

/** The one word a planned capability is labelled with, everywhere. */
export const PLANNED_LABEL = 'Planned';

/**
 * The destination for an id, or null.
 *
 * Written as a function rather than read off the object at the call site so
 * that a caller physically cannot navigate to a planned capability: there is no
 * route to pass to `router.push`, and the type says so.
 */
export function routeFor(id: CapabilityId): string | null {
  const c = CAPABILITIES[id];
  return c.state === 'available' ? c.route : null;
}
