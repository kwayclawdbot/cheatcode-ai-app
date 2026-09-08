/**
 * WHAT THE APP CAN ACTUALLY DO — the website's copy of the one list.
 *
 * THE SOURCE OF TRUTH IS `packages/shared/capabilities.ts`. This file is a
 * mirror, and the mirror exists for a deployment reason rather than a design
 * one: `apps/site/next.config.ts` says, in as many words, that this project is
 * its own Vercel deployment with Root Directory = apps/site and that the parent
 * directory is not uploaded — "unlike apps/api it imports nothing from
 * packages/shared, so it is entirely self-contained". An import from
 * `../../../../packages/shared` would compile locally and fail the deploy.
 *
 * So the two files are kept honest by a test instead of by the module system.
 * `apps/mobile/scripts/onboarding-continuity-test.mts` reads BOTH and fails if
 * any entry's id, state, title, action or line stops matching. This is the same
 * arrangement `apps/api/src/lib/stage/rules.ts` has with the training
 * curriculum, and the reasoning there applies here: duplication is the cost of
 * a boundary, and a test is what stops duplication from drifting.
 *
 * WHY THE SITE NEEDS THIS AT ALL. Audit F02. The plan cards used to promise
 * "The 7-day path, then a lesson a day" and "Every alert family, including day
 * trade" — hand-written bullets, edited months apart from the screens they
 * describe. One authored lesson was behind the first of those. A visitor who
 * paid for that expectation opens the app and finds step 01 and two steps
 * marked "Coming next". Now the bullets ARE these entries, and a `planned`
 * entry renders with the word Planned beside it rather than as a promise.
 *
 * EDIT BOTH FILES, ALWAYS. If you are here because the test failed, the fix is
 * almost never to change this file alone — check which side is stale.
 */

export type CapabilityId =
  | "paper_trading"
  | "broker_execution"
  | "training_basics"
  | "training_read_chart"
  | "training_build_plan"
  | "kai"
  | "swing_alerts"
  | "day_trade_alerts"
  | "research_desk"
  | "chats"
  | "belts";

export type CapabilityState = "available" | "planned";

export type Capability = {
  id: CapabilityId;
  title: string;
  /** The words a button is allowed to use. */
  action: string;
  state: CapabilityState;
  /** What it is, or — when planned — what is actually missing. Never a date. */
  plain: string;
};

export const CAPABILITIES: Record<CapabilityId, Capability> = {
  paper_trading: {
    id: "paper_trading",
    title: "Paper trading",
    action: "Practise with paper money",
    state: "available",
    plain:
      "A practice account with a real balance and real prices. Nothing reaches a broker.",
  },
  broker_execution: {
    id: "broker_execution",
    title: "Trading with real money",
    action: "Connect a brokerage",
    state: "planned",
    plain:
      "There is no brokerage connection in this release. Paper is the only mode.",
  },
  training_basics: {
    id: "training_basics",
    title: "Market basics",
    action: "Start step 01",
    state: "available",
    plain: "What you are looking at, and what you are actually buying.",
  },
  training_read_chart: {
    id: "training_read_chart",
    title: "Read a chart",
    action: "Start step 02",
    state: "planned",
    plain:
      "Step 02 is not written yet. Step 01 is, and it is where the path starts.",
  },
  training_build_plan: {
    id: "training_build_plan",
    title: "Build a plan",
    action: "Start step 03",
    state: "planned",
    plain: "Step 03 is not written yet.",
  },
  kai: {
    id: "kai",
    title: "Ask Kai",
    action: "Ask Kai",
    state: "available",
    plain:
      "Ask about any screen, any setup, any position, in the level of detail you asked for.",
  },
  swing_alerts: {
    id: "swing_alerts",
    title: "Swing alerts",
    action: "See swing alerts",
    state: "available",
    plain: "Multi-day setups with entry, invalidation and target on the card.",
  },
  day_trade_alerts: {
    id: "day_trade_alerts",
    title: "Same-day alerts",
    action: "See same-day alerts",
    state: "available",
    plain:
      "Selective. The unusual-options-activity engine fires on the days the setup appears, not daily.",
  },
  research_desk: {
    id: "research_desk",
    title: "Research desk",
    action: "Open the desk",
    state: "available",
    plain:
      "Companies explained as businesses — the horizon, the story, and what would break it.",
  },
  chats: {
    id: "chats",
    title: "The three chats",
    action: "Open the chats",
    state: "available",
    plain:
      "Traders, Investors and Beginners. Reading one never changes what you trade.",
  },
  belts: {
    id: "belts",
    title: "Belt progression",
    action: "See your belt",
    state: "available",
    plain:
      "A belt is earned by passing that rung’s exam. Account size appears nowhere in it.",
  },
};

export const PLANNED_LABEL = "Planned";

export function capability(id: CapabilityId): Capability {
  return CAPABILITIES[id];
}

export function isAvailable(id: CapabilityId): boolean {
  return CAPABILITIES[id].state === "available";
}
