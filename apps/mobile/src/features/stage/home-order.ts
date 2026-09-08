/**
 * WHAT HOME PUTS FIRST, given how ready this member is (0042).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS ORDERING. IT IS NOT A SECOND HOME SCREEN.
 * ─────────────────────────────────────────────────────────────────────────────
 * The owner's funnel note describes two quite different Home screens — a
 * beginner's opens with "Today's Beginner Pick — NVDA · Long-Term Investing ·
 * here's why", an experienced member's opens with "A Setup — TSLA · Day Trade ·
 * Breakout · Entry/Stop/Target". That is a real difference and it is NOT what
 * this pass builds: the Beginner Pick is a new Home object with its own data
 * behind it, and it is queued as its own lane.
 *
 * What this pass does is the half that needs no new content: it changes what a
 * member meets FIRST out of the objects Home already draws. That is a small
 * change with most of the effect, because the top of the screen is what a
 * person reads.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS A FUNCTION IN ITS OWN FILE RATHER THAN AN `if` IN home.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Two reasons, one of them temporary. The lasting one is that "what does Home
 * lead with" is a product rule and belongs somewhere it can be read and tested
 * without rendering a screen. The temporary one is that `home.tsx` is being
 * edited by the training lane at the same time as this was written, so the
 * smallest possible footprint in that file was worth engineering for: Home
 * imports one function and asks it one question.
 */
import type { Stage } from '../../lib/types';

export type HomeOrder = {
  /**
   * Where the "Continue Training" object sits relative to the conversation
   * wall. That object belongs to the training lane and this never changes it —
   * it only decides which side of the wall it is drawn on.
   */
  training: 'above_wall' | 'below_wall';
};

/**
 * Beginners and developing traders lead with training; trade-ready members lead
 * with the market.
 *
 * THE REASONING. For somebody still in Foundations, the single most useful
 * thing on the screen is the next lesson — the alerts below it are about a job
 * they cannot do yet, and putting them first is how an app teaches a beginner
 * that it is not for them. For somebody who has graduated, the opposite is
 * true: they came to see what is set up today, and a course they finished
 * sitting above that reads as the app not having noticed.
 *
 * `developing` sits with `beginner` rather than in the middle, because they are
 * mid-programme by definition — they passed Day 2 and have not reached Day 7 —
 * so the next lesson is still the live thread.
 *
 * A missing stage is treated as `beginner`, matching every other reader: it is
 * the honest reading of "we do not know yet", and leading a stranger with the
 * teaching object is the kinder of the two mistakes.
 */
export function homeOrderFor(stage: Stage | null | undefined): HomeOrder {
  return { training: stage === 'trade_ready' ? 'below_wall' : 'above_wall' };
}
