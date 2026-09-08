import { api } from '../../lib/api';
import type { GoalMode } from '../../lib/types';
import type { TrainingLessonNode, TrainingProfile } from './types';

/**
 * THE LESSON-CONTEXT KAI CALL.
 *
 * The rebuild package's README asks for lesson context rather than generic
 * chat, and gives the contract:
 *
 * (`unit_id` in the original contract is `day_id` here — the product's unit of
 * organisation is the DAY, per the 7-day spec, and the pin should say so.)
 *
 *   { surface, lesson_id, day_id, skill, stage, symbol, timeframe,
 *     learner_answer, chart_markup, mastery_before }
 *
 * That goes out over the app's EXISTING Kai path — `POST /kai/conversations`
 * with a `context` pin, then the SSE message stream — not a new endpoint. The
 * typed `context` argument carries the three fields the server already knows
 * how to pin (`kind`, `id`, `symbol`); the rest of the contract rides in the
 * message body, which is where a tutor prompt belongs anyway. Nothing on the
 * API side had to change, which is why this lane ships client-only.
 *
 * ONE CALL PER EXPLICIT USER ACTION. `requestReview` is invoked from the
 * "Submit for Review" button and nowhere else — no call on mount, none on
 * stage change, none on answer selection. A lesson the learner walks without
 * tapping that button costs nothing.
 */

export type TrainingKaiContext = {
  surface: 'training';
  lesson_id: string;
  day_id: string;
  skill: string;
  stage: string;
  symbol: string;
  timeframe: string;
  learner_answer: string | null;
  chart_markup: string | null;
  mastery_before: number;
};

export type TrainingKaiResult =
  | { status: 'ok'; text: string }
  | { status: 'unavailable'; text: string };

export function buildTrainingContext(
  lesson: TrainingLessonNode,
  profile: TrainingProfile,
  opts: { stage: string; symbol: string; timeframe: string; learnerAnswer: string | null; chartMarkup: string | null },
): TrainingKaiContext {
  return {
    surface: 'training',
    lesson_id: lesson.id,
    day_id: lesson.dayId,
    skill: lesson.skill,
    stage: opts.stage,
    symbol: opts.symbol,
    timeframe: opts.timeframe,
    learner_answer: opts.learnerAnswer,
    chart_markup: opts.chartMarkup,
    mastery_before: profile.mastery[lesson.skill] ?? 0,
  };
}

/**
 * The sentence shown when Kai cannot answer. It is deliberately about KAI's
 * availability, never about the learner's work — an outage must not read as
 * "your analysis was wrong", and the lesson stays completable either way.
 */
const FALLBACK = 'Kai could not review this right now. Your work is saved — finish the lesson and ask again later.';

/** Turn the contract into the message Kai actually reads. */
function tutorPrompt(ctx: TrainingKaiContext, lesson: TrainingLessonNode): string {
  return [
    `You are tutoring inside Cheat Code AI Training Mode. Teach first — do not create an alert or a trade.`,
    ``,
    `Lesson: ${lesson.title} (${ctx.lesson_id}, ${ctx.day_id})`,
    `Skill: ${ctx.skill} — the learner is at ${ctx.mastery_before}% mastery before this attempt.`,
    `Stage: ${ctx.stage}. Chart: ${ctx.symbol} on the ${ctx.timeframe}.`,
    ctx.learner_answer ? `The learner answered: ${ctx.learner_answer}` : `The learner has not answered in words.`,
    ctx.chart_markup ? `Their markup: ${ctx.chart_markup}` : `No chart markup was captured.`,
    ``,
    `Review their work in two or three short sentences: what they got right, then the one thing to sharpen next. Plain English, no jargon.`,
  ].join('\n');
}

/**
 * Runs the call and resolves to the finished text. Every failure route —
 * no API configured, no network, an auth problem, or the Anthropic account
 * being out of credit — lands on `status: 'unavailable'` with the server's
 * own sentence where there is one. The app never invents a reply: when Kai
 * cannot speak, the surface says so.
 */
export async function requestReview(
  lesson: TrainingLessonNode,
  profile: TrainingProfile,
  opts: { stage: string; symbol: string; timeframe: string; learnerAnswer: string | null; chartMarkup: string | null; mode?: GoalMode },
): Promise<TrainingKaiResult> {
  if (!api.available()) return { status: 'unavailable', text: FALLBACK };

  const ctx = buildTrainingContext(lesson, profile, opts);

  try {
    // NO `context` PIN, DELIBERATELY.
    //
    // The obvious thing is `{ kind: 'training', id: lesson_id }`, and it was
    // written that way first. `KaiContextKind` in packages/shared/api.ts is a
    // CLOSED enum — symbol, setup, alert, order, position, room, home — so the
    // server rejected the whole request with a 400 before Kai ever saw it, and
    // the lesson showed "Something in context.kind wasn't right" in Kai's voice
    // for a mistake that was entirely ours. Adding `training` to that enum is
    // an API change and a deploy; this lane is client-only.
    //
    // Nothing is lost by leaving it out: the full contract from the README
    // travels in the message body, which is what the model actually reads. The
    // pin only decides which server-side object gets loaded into the system
    // prompt, and a lesson is not one of those objects yet. When the enum and a
    // loader land, pass the pin here and the tutor gets the lesson row too.
    const conversation = await api.createConversation(
      opts.mode ?? 'swing',
      ctx.symbol ? { symbols: [ctx.symbol] } : undefined,
    );

    let text = '';
    let failure: string | null = null;

    await new Promise<void>((resolve) => {
      void api.streamMessage(conversation.id, tutorPrompt(ctx, lesson), {
        onFrame: (frame) => {
          // Only the prose frames belong in a tutor card; tool and object
          // frames are for the chat wall, which this is not.
          if (frame.type === 'text_delta') text += frame.text ?? '';
        },
        onError: (message) => { failure = message || FALLBACK; },
        onDone: () => resolve(),
      }).catch((e: unknown) => {
        failure = e instanceof Error && e.message ? e.message : FALLBACK;
        resolve();
      });
    });

    const body = text.trim();
    if (failure) return { status: 'unavailable', text: failure };
    if (!body) return { status: 'unavailable', text: FALLBACK };
    return { status: 'ok', text: body };
  } catch (e: unknown) {
    // `ApiError` already carries the server's `message_plain`; anything else
    // gets the neutral sentence rather than a stack trace in the UI.
    const message = e instanceof Error && e.message ? e.message : FALLBACK;
    return { status: 'unavailable', text: message };
  }
}
