/**
 * BEAT TWO — is this worth taking?
 *
 * Everything on this screen is either a grade the engine produced, a level that
 * came off a row, or a sentence Kai wrote about them. Nothing is assembled here.
 *
 * THE PART THAT MATTERS MOST IS THE PART WITH NOTHING IN IT. On a symbol with no
 * graded setup, `NoGradedSetup` says so and offers the thing Kai can honestly do
 * — mark the levels that are arithmetic on the bars — instead of producing an
 * entry, a stop and a target that would look exactly like the graded ones. A
 * conjured plan and a graded plan are visually identical once they are on a
 * screen, and the grading is the whole reason to trust this product.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T, Eyebrow, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Rule } from '../../ui/DataRow';
import { alpha, color, radius } from '../../ui/tokens';
import { GradeMedallion, Scorecard } from '../portal/grade';
import type { TradePortal } from '../portal/types';
import type { ReadLevel, TradeRead } from './read';

const LEVEL_TINT: Record<ReadLevel['key'], string> = {
  entry: color.cyan,
  stop: color.red,
  target: color.green,
  trigger: color.violetLight,
};

/* ------------------------------------------------------------------ */
/* The verdict                                                          */
/* ------------------------------------------------------------------ */

export function Verdict({ read, testID = 'decide-verdict' }: { read: TradeRead; testID?: string }) {
  return (
    <View testID={testID} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <GradeMedallion grade={read.grade_display} score={read.score} size={82} />
        <View style={{ flex: 1, gap: 5 }}>
          {read.descriptor ? <Eyebrow c={color.muted}>{read.descriptor.toUpperCase()}</Eyebrow> : null}
          <T size={16} weight="bold" lh={22} testID="decide-headline">{read.headline}</T>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The levels that justify it                                           */
/* ------------------------------------------------------------------ */

export function Because({
  levels, onMark, testID = 'decide-because',
}: {
  levels: ReadLevel[];
  /** Marks the level on the chart above. Kai names it; the chart draws it. */
  onMark: (l: ReadLevel) => void;
  testID?: string;
}) {
  if (!levels.length) return null;
  return (
    <View testID={testID} style={{ gap: 2 }}>
      <Eyebrow c={color.muted}>THE LEVELS THAT SAY SO</Eyebrow>
      <View style={{ paddingTop: 6 }}>
        {levels.map((l, i) => (
          <View key={l.key}>
            {i > 0 ? <Rule /> : null}
            <Pressable
              testID={`decide-level-${l.key}`}
              accessibilityRole="button"
              accessibilityLabel={`${l.label}. ${l.plain}. Mark it on the chart.`}
              onPress={() => onMark(l)}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 10 }}
            >
              <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: LEVEL_TINT[l.key] }} />
              <View style={{ flex: 1, gap: 3 }}>
                <Num size={14} weight="bold" c={LEVEL_TINT[l.key]}>{l.label}</Num>
                <T size={12.5} lh={18} c={color.muted}>{l.plain}</T>
              </View>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The line that ends the trade. Red, and it is never optional when a stop exists. */
export function WrongIf({ text, testID = 'decide-wrong-if' }: { text: string; testID?: string }) {
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        borderLeftWidth: 2, borderLeftColor: alpha.red45, paddingLeft: 11, paddingVertical: 2,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Eyebrow c={color.red}>WHAT WOULD PROVE IT WRONG</Eyebrow>
        <T size={13} lh={19}>{text}</T>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Kai's read, and what it looks like when it does not arrive           */
/* ------------------------------------------------------------------ */

export type KaiReadState = 'ready' | 'loading' | 'failed';

export function KaiRead({
  state, text, symbol, onRetry, testID = 'decide-kai-read',
}: {
  state: KaiReadState;
  text: string | null;
  symbol: string;
  onRetry: () => void;
  testID?: string;
}) {
  return (
    <ObjectCard tone="kai" r={radius.xl} testID={testID} style={{ padding: 14, gap: 8 }}>
      <Eyebrow c={color.violetLight}>KAI’S READ</Eyebrow>
      {state === 'loading' ? (
        <T size={13} lh={19} c={color.muted} testID="decide-kai-loading">Reading {symbol}…</T>
      ) : state === 'failed' ? (
        <View style={{ gap: 10 }}>
          <T size={13} lh={19} testID="decide-kai-failed">
            I could not load my read on {symbol} just now. The grade and the levels above came off saved rows and are
            still good — it is my write-up that did not arrive.
          </T>
          <Button label="Try again" kind="outline" height={38} full={false} onPress={onRetry} testID="decide-kai-retry" />
        </View>
      ) : (
        <T size={13} lh={20} testID="decide-kai-text">{text}</T>
      )}
      <T size={11} lh={16} c={color.dim}>Kai’s assessment, not a guarantee.</T>
    </ObjectCard>
  );
}

/* ------------------------------------------------------------------ */
/* No graded setup — the honest beat                                    */
/* ------------------------------------------------------------------ */

export function NoGradedSetup({
  read, onMarkChart, onAsk, testID = 'decide-no-setup',
}: {
  read: TradeRead;
  /** Asks Kai to mark the levels that are computed from bars. */
  onMarkChart: () => void;
  onAsk: (q: string) => void;
  testID?: string;
}) {
  return (
    <View testID={testID} style={{ gap: 13 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <GradeMedallion grade={null} score={null} size={82} />
        <View style={{ flex: 1, gap: 5 }}>
          <Eyebrow c={color.muted}>NOT GRADED</Eyebrow>
          <T size={16} weight="bold" lh={22} testID="decide-headline">{read.headline}</T>
        </View>
      </View>

      <T size={13} lh={20} c={color.muted} testID="decide-offer">{read.offer_plain}</T>

      <View style={{ flexDirection: 'row', gap: 9 }}>
        <Button
          label="Mark what’s on this chart"
          kind="kai"
          height={42}
          full={false}
          onPress={onMarkChart}
          testID="decide-mark-chart"
          accessibilityHint={`Kai marks the previous session’s high and low, the averages and VWAP on ${read.symbol}.`}
        />
      </View>

      <Rule />
      <Pressable
        testID="decide-ask-gradeable"
        accessibilityRole="button"
        onPress={() => onAsk(`What would have to happen for ${read.symbol} to become a setup worth taking?`)}
        style={{ paddingVertical: 4 }}
      >
        <T size={13} weight="semibold" c={color.violetLight}>
          What would make {read.symbol} worth taking? →
        </T>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The whole beat                                                       */
/* ------------------------------------------------------------------ */

export function DecideBeat({
  read, portal, kaiState, onMark, onMarkChart, onAsk, onRetryRead,
}: {
  read: TradeRead;
  portal: TradePortal;
  kaiState: KaiReadState;
  onMark: (l: ReadLevel) => void;
  onMarkChart: () => void;
  onAsk: (q: string) => void;
  onRetryRead: () => void;
}) {
  const components = portal.alert?.score_components ?? [];
  /**
   * THE SCORECARD IS EVIDENCE, NOT THE ANSWER (spec 10 §4: "Expandable
   * explanation and sources").
   *
   * It was above the levels once, and five meter rows pushed the entry, the stop
   * and the sentence about what would prove the trade wrong below the fold — so
   * the beat called DECIDE opened on the reasoning and hid the decision. It is
   * folded now, under the answer it explains.
   */
  const [evidence, setEvidence] = React.useState(false);

  return (
    <View style={{ gap: 16 }} testID="beat-decide">
      {read.gradeable ? <Verdict read={read} /> : (
        <NoGradedSetup read={read} onMarkChart={onMarkChart} onAsk={onAsk} />
      )}

      <Because levels={read.because} onMark={onMark} />

      {read.wrong_if ? <WrongIf text={read.wrong_if} /> : null}

      {read.gradeable ? (
        <KaiRead
          state={kaiState}
          text={read.interpretation}
          symbol={read.symbol}
          onRetry={onRetryRead}
        />
      ) : null}

      {read.gradeable && components.length ? (
        <View style={{ gap: 10 }}>
          <Pressable
            testID="decide-evidence-toggle"
            accessibilityRole="button"
            accessibilityState={{ expanded: evidence }}
            onPress={() => setEvidence((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 26 }}
          >
            <Eyebrow c={color.muted}>WHY THIS GRADE</Eyebrow>
            <T size={12} weight="semibold" c={color.violetLight}>{evidence ? 'Hide' : 'Show the five'}</T>
          </Pressable>
          {evidence ? <Scorecard components={components} testID="decide-scorecard" /> : null}
        </View>
      ) : null}

      {portal.community?.summary ? (
        <View style={{ gap: 4 }} testID="decide-community">
          <Eyebrow c={color.muted}>MEMBERS, NOT KAI</Eyebrow>
          <T size={12.5} lh={18} c={color.muted}>{portal.community.summary}</T>
        </View>
      ) : null}
    </View>
  );
}
