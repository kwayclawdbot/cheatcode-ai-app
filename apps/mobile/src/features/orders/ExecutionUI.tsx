/**
 * THE THREE PIECES THE PAPER BOARD ADDS, in one place because all three appear
 * on more than one of its screens.
 *
 *   · `DailyRiskBudget` — "Daily risk budget · $26 of $100 planned · 26%".
 *   · `OrderProgress`   — Submitted ● ─── ○ Filled, with the line under each.
 *   · `ObjectStateStrip`— where this object is now, and ONE next action (F08).
 *
 * They live in `features/orders` rather than in `ui/` because every one of them
 * is about an ORDER, and `ui/trade` is the shared kit that knows about trade
 * IDEAS. The kit is used for what it already does better than anything written
 * here — the chart and the R meter — and it is not extended sideways to learn
 * about fill quantities.
 *
 * COLOUR follows the house rule and nothing new is introduced: volt is the
 * primary action and therefore the budget a member is spending, gold is the
 * warning before the cap, red is over it, violet is Kai, muted is "not known".
 */
import React from 'react';
import { View } from 'react-native';
import { T, Num } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import { StatusDot } from '../trade/components';
import type { DailyBudget } from './daily-risk';
import { ACTION_LABEL, STATE, type ObjectState, type OrderStep } from './vocabulary';

/* ------------------------------------------------------------------ */
/* Daily risk budget                                                    */
/* ------------------------------------------------------------------ */

/**
 * The bar the board puts directly above the primary action.
 *
 * It draws in two segments — what today already carries, then what THIS order
 * adds — because those are different commitments and a member deciding whether
 * to place the order needs to see which part they are still free to change.
 * When nothing is carried yet the first segment has zero width and the bar
 * looks exactly like the board's single volt run.
 *
 * When there is no cap, or the build did not report one, no bar is drawn at
 * all. `daily-risk.ts` explains why at length: an empty track invites the
 * reader to believe a cap exists and is unspent.
 */
export function DailyRiskBudget({ budget, testID = 'daily-risk-budget' }: {
  budget: DailyBudget;
  testID?: string;
}) {
  if (budget.kind !== 'bar') {
    return (
      <View testID={testID} style={{ gap: 4, paddingHorizontal: 2, paddingVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <T size={12} c={color.muted} style={{ flex: 1 }}>Daily risk budget</T>
          <Num size={12} c={color.muted} testID={`${testID}-headline`}>{budget.headline}</Num>
        </View>
        <T size={11} lh={16} c={color.dim} testID={`${testID}-absent`}>{budget.plain}</T>
      </View>
    );
  }

  const tint = budget.over ? color.red : budget.fraction >= 0.9 ? color.gold : color.volt;
  return (
    <View testID={testID} style={{ gap: 7, paddingHorizontal: 2, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <T size={12} c={color.muted} style={{ flex: 1 }}>Daily risk budget</T>
        <Num size={12} weight="semibold" c={budget.over ? color.red : color.text} testID={`${testID}-headline`}>
          {budget.headline}
        </Num>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Daily risk budget: ${budget.headline}, ${budget.percent} used.`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: alpha.ivory08, flexDirection: 'row', overflow: 'hidden' }}>
          {/* Already carried today — the part this decision cannot change. */}
          <View style={{ width: `${budget.usedFraction * 100}%`, height: '100%', backgroundColor: color.dim }} />
          {/* What this order adds. */}
          <View
            testID={`${testID}-planned`}
            style={{ width: `${Math.max(0, budget.fraction - budget.usedFraction) * 100}%`, height: '100%', backgroundColor: tint }}
          />
        </View>
        <Num size={12} c={budget.over ? color.red : color.muted} testID={`${testID}-percent`}>{budget.percent}</Num>
      </View>
      {budget.over ? (
        <T size={11} lh={16} c={color.red} testID={`${testID}-over`}>
          This order would take today past the cap you set.
        </T>
      ) : budget.used > 0 ? (
        <T size={11} lh={16} c={color.dim}>
          {`${budget.percent} of today's budget once this order is placed — the darker part is already committed.`}
        </T>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Submitted → Filled                                                   */
/* ------------------------------------------------------------------ */

/**
 * The receipt's two-step tracker.
 *
 * The em-dash under an unreached step is deliberate and load-bearing: there is
 * no fill price yet, and printing the limit price there — or a zero — would be
 * the screen answering a question the engine has not answered.
 */
export function OrderProgress({ steps, testID = 'order-progress' }: {
  steps: OrderStep[];
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={steps.map((s) => `${s.label}. ${s.detail ?? 'Nothing yet'}.`).join(' ')}
      style={{
        flexDirection: 'row',
        borderRadius: radius.xl,
        borderWidth: 0.5,
        borderColor: alpha.ivory12,
        paddingVertical: 16,
        paddingHorizontal: 18,
      }}
    >
      {steps.map((step, i) => {
        const tint = step.done ? color.green : color.muted;
        return (
          <View key={step.key} style={{ flex: 1, gap: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                testID={`${testID}-${step.key}-dot`}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  borderWidth: 1.5,
                  borderColor: tint,
                  backgroundColor: step.done ? tint : 'transparent',
                }}
              />
              {i === 0 ? <View style={{ flex: 1, height: 1, backgroundColor: alpha.ivory12 }} /> : null}
            </View>
            <View style={{ gap: 3 }}>
              <T size={13.5} weight="semibold" c={step.current || step.done ? color.text : color.muted}>
                {step.label}
              </T>
              <T size={11.5} lh={16} c={color.muted} testID={`${testID}-${step.key}-detail`}>
                {step.detail ?? '—'}
              </T>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Where this object is now                                             */
/* ------------------------------------------------------------------ */

const STATE_TINT: Record<ObjectState, string> = {
  idea: color.muted,
  planned: color.cyan,
  order_pending: color.gold,
  position_active: color.green,
  closed: color.muted,
};

/**
 * F08's state strip: the object's state on the left, one fact about it on the
 * right, and — where the caller has somewhere to send them — the ONE next
 * action named with the vocabulary's own word.
 *
 * `meta` is the room-specific fact ("4 shares", "0 of 4 filled"). The strip
 * does not compute it, because what counts as the useful fact differs per
 * surface and a prop that tried to cover all of them would end up saying
 * nothing on each.
 */
export function ObjectStateStrip({ state, meta, plain, testID = 'state-strip' }: {
  state: ObjectState;
  meta?: string | null;
  /** Overrides the table's sentence when the server said something better. */
  plain?: string | null;
  testID?: string;
}) {
  const copy = STATE[state];
  const tint = STATE_TINT[state];
  return (
    <View testID={testID} style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 11,
          paddingHorizontal: 14,
          borderRadius: radius.xl,
          borderWidth: 0.5,
          borderColor: alpha.ivory12,
        }}
      >
        <StatusDot c={tint} size={9} />
        <T size={14} weight="semibold" c={tint} style={{ flex: 1 }} testID={`${testID}-label`}>
          {copy.label}
        </T>
        {meta ? (
          <>
            <View style={{ width: 0.5, height: 16, backgroundColor: alpha.ivory12 }} />
            <Num size={13} c={color.muted} testID={`${testID}-meta`}>{meta}</Num>
          </>
        ) : null}
      </View>
      <T size={11.5} lh={17} c={color.muted} testID={`${testID}-plain`}>
        {plain ?? copy.plain}
        {copy.next ? ` Next: ${ACTION_LABEL[copy.next]}.` : ''}
      </T>
    </View>
  );
}
