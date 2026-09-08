/**
 * READINESS STAGE — what is left of the rules, and why most of them left.
 *
 * A member's stage (0042) is where the funnel thinks they are: `beginner` →
 * `developing` → `trade_ready`, with room above it later. The owner's note is
 * explicit that this is NOT a label somebody picks once — it EVOLVES as they
 * prove competence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EVIDENCE PATH IS RETIRED. HERE IS WHAT IT WAS AND WHY IT IS GONE
 * ─────────────────────────────────────────────────────────────────────────────
 * This file used to carry `DAY_GATES`, `evaluateGate`, `stageFromEvidence`,
 * `decideStage` and `rankOf`, and `POST /api/v1/stage/evaluate` used to call
 * them. The argument for that design was written here and it was a good one for
 * the architecture it was written against:
 *
 *   Training progress lived ONLY on the device, in AsyncStorage under
 *   `ccai.training.profile.v2`. There was no training table and no route that
 *   recorded a lesson, so the server could not go and look up whether somebody
 *   passed Day 2 — the phone was the only thing that knew. That left two ways
 *   to build it: believe the phone's CONCLUSION ("set me to trade_ready"), or
 *   believe its EVIDENCE — scores and completed lessons — and re-grade that
 *   evidence server-side. The route believed neither: it re-graded. `DAY_GATES`
 *   was the server's own copy of the Day 2 and Day 7 gates, duplicated from
 *   `apps/mobile/src/features/training/curriculum.ts`, and
 *   `apps/mobile/scripts/stage-rules-test.mts` held the two copies together.
 *
 * That header also predicted its own ending: "when training gets server
 * persistence, the evidence argument disappears". Both halves of that then
 * happened at once.
 *
 *   1. TRAINING PROGRESS IS ON THE SERVER (0046). The server reads the rows. A
 *      body of self-reported scores is no longer the only thing it can know,
 *      so trusting one is no longer the best available — it is just trusting a
 *      client.
 *   2. THE BELT BECAME THE MEASURED LADDER (0047 §7). Belt and stage measure
 *      roughly the same thing, and BELT-MERGE-spec.md §9 refuses to let the
 *      product carry one ladder twice, so stage now DERIVES from the belt —
 *      white → beginner, blue/purple → developing, brown/black → trade_ready.
 *      `stage_for_belt()` is that table and `sync_stage_from_belt()` is the
 *      write, called from `grade_belt_exam`. The belt is the one with an exam
 *      behind it.
 *
 * THE RATCHET DID NOT DIE, IT MOVED. `decideStage`'s single most important
 * rule — automatic evolution PROMOTES ONLY, and a hand-set `stage_locked` is
 * never touched by anything automatic — is now `sync_stage_from_belt` in
 * 0047 §7, with the same four outcomes under the same four names (`locked`,
 * `promoted`, `unchanged`, `no_downgrade`). It is one implementation in SQL
 * next to the column it protects rather than one in SQL and one in TypeScript
 * that nothing calls. The reason for it is unchanged and worth repeating:
 * somebody who told onboarding "I actively trade" starts at `trade_ready` with
 * no belt at all, and recomputing them downwards would publicly demote them
 * next to their name in a room. The stage is a floor that rises. It means "has
 * reached", not "is currently demonstrating".
 *
 * WHAT IS LEFT HERE IS THE LADDER ITSELF AND THE FIRST RUNG: the ordered list,
 * a guard for reading the column, and `START_PLACEMENT` — the one place a stage
 * comes from an answer rather than from something earned. Onboarding still
 * needs it, so it stays.
 */

/** The ladder, in order. Extending it means appending — see 0042 §1. */
export const STAGE_ORDER = ['beginner', 'developing', 'trade_ready'] as const;

export type Stage = (typeof STAGE_ORDER)[number];

/**
 * A guard for `profiles.stage`, which is a text column with a check constraint
 * and therefore arrives here as `unknown`. A row written before 0042 applied
 * has no stage at all; callers read that as `beginner`, the bottom of the
 * ladder, rather than as an error.
 */
export function isStage(v: unknown): v is Stage {
  return typeof v === 'string' && (STAGE_ORDER as readonly string[]).includes(v);
}

/* ───────────────────────── onboarding placement ─────────────────────────── */

/**
 * "Where are you right now?" — the one question onboarding gained. The answer
 * places somebody on the ladder before they have proved anything, which is the
 * only way the first session can be pitched at the right level.
 *
 * THE JUDGEMENT CALL IS `investor`, and it is deliberate. Somebody who invests
 * but does not trade is placed at `beginner`, not `developing`, because this
 * ladder measures TRADE readiness and they have not made a trade decision under
 * a stop. The owner's own description of the beginner stage is "learns market,
 * starts with INVESTING + simple swing setups" — which is a description of
 * exactly this person, so `beginner` is where the product already intends to
 * meet them. They are also the fastest group through Training, so the stage
 * costs them days rather than weeks.
 *
 * Placement is a FLOOR, not a ceiling: the ratchet in `sync_stage_from_belt`
 * (0047 §7) means passing a belt exam can only lift somebody off the rung this
 * puts them on, and nothing sends them back down it.
 */
export const START_ANSWERS = ['brand_new', 'investor', 'swing', 'active'] as const;

export type StartAnswer = (typeof START_ANSWERS)[number];

/**
 * THE ROOM SLUGS HERE ARE THE THREE CHATS (0045).
 *
 * They used to be `beginners | swing | day-trade`, one room per desk. Community
 * is now three chats — Traders, Investors, Beginners (owner, 8 Sept) — so the
 * swing answer and the active-trader answer land in the SAME room, and the
 * mapping is the named one in `lib/social/rooms-bridge.ts` (`MODE_TO_ROOM`)
 * rather than a slug that happened to match a mode.
 *
 * `mode` and `room` no longer move together and that is the point: somebody who
 * says they swing trade still gets the swing DESK — their alerts, their charts,
 * their risk language — and reads the same conversation as the intraday
 * traders. The desk is what they trade; the chat is who they talk to.
 */
export const START_PLACEMENT: Record<
  StartAnswer,
  { stage: Stage; mode: 'invest' | 'swing' | 'day_trade'; room: 'beginners' | 'traders' }
> = {
  brand_new: { stage: 'beginner', mode: 'invest', room: 'beginners' },
  investor: { stage: 'beginner', mode: 'invest', room: 'beginners' },
  swing: { stage: 'developing', mode: 'swing', room: 'traders' },
  active: { stage: 'trade_ready', mode: 'day_trade', room: 'traders' },
};

export function isStartAnswer(v: unknown): v is StartAnswer {
  return typeof v === 'string' && (START_ANSWERS as readonly string[]).includes(v);
}
