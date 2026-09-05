/**
 * The research desk's own grammar.
 *
 * The desk is not the alerts lane and must not borrow its vocabulary. An alert
 * has a grade medallion because it is a trade you might take today. A desk
 * pick has a grade on the IDEA — whether the company has the shape a company
 * has before a very big move — and that is a different question with a
 * different answer. So the grade here is a plain mark with its reasoning
 * attached, never a medallion, and nothing on these screens offers to trade
 * anything.
 *
 * Colour follows the locked grammar: cyan is market data, violet is Kai's
 * intelligence, volt is the user's own action. The desk's judgement is Kai's
 * work, so it reads violet; price and state read cyan.
 */
import React from 'react';
import { View, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { T, Num, Eyebrow } from '../../ui/Text';
import { alpha, color, radius, space } from '../../ui/tokens';
import type { IdeaGrade, WatchState } from '@shared/desk';
import { WATCH_STATE_COPY } from '@shared/desk';

/**
 * The grade, as a mark rather than a medal.
 *
 * A+ and A are the two the scale exists to find, so they are the only ones
 * that get colour. Everything else is legible and quiet — "most are B or C"
 * is the desk's own instruction to itself, and a screen that celebrates a C
 * is arguing with the thing it is displaying.
 */
export function GradeMark({ grade, size = 15 }: { grade: IdeaGrade | null; size?: number }) {
  if (!grade) {
    return <T size={size - 3} c={color.dim}>ungraded</T>;
  }
  const strong = grade === 'A+' || grade === 'A';
  return (
    <View
      accessibilityLabel={`Idea grade ${grade}`}
      style={{
        paddingHorizontal: space.x8,
        paddingVertical: space.x2,
        borderRadius: radius.sm,
        borderWidth: strong ? 1 : 0.5,
        borderColor: strong ? alpha.violet50 : alpha.ivory16,
        backgroundColor: strong ? alpha.violet14 : 'transparent',
      }}
    >
      <Num size={size} weight="bold" c={strong ? color.violetLight : color.muted}>
        {grade}
      </Num>
    </View>
  );
}

/**
 * The five things the grade counts, in the desk's own order.
 *
 * This is not a paraphrase. Each line is one leg of the rubric the analyst is
 * held to, and each leg is graded off figures that are printed in the evidence
 * it reads — how big the market is, whether this company could end up owning
 * it, whether the reported numbers have started to turn, what the market
 * already pays for those numbers, and whether the stock has already moved.
 *
 * It replaced a sentence that said the grade was "how big the claim is, how
 * underpriced it looks, and how well placed this company is". Two of those
 * three had no numbers behind them anywhere in the system, so the screen was
 * describing a judgement that was partly being invented. Now it describes
 * what is actually done.
 */
export const GRADE_LEGS: readonly string[] = [
  'How big the change is — the market being created, not the company',
  'Whether this company could end up being the name that owns it',
  'Whether its reported numbers have started to turn',
  'Whether the price already assumes all of it',
  'Whether the stock is still early, or halfway up already',
] as const;

/**
 * The grade, explained on the page it is shown on.
 *
 * Ruled rows, no boxes. The numerals are Kai's judgement, so they read violet;
 * the rules are hairlines and nothing here is a rounded rectangle.
 */
export function GradeLegs() {
  return (
    <View style={{ marginTop: space.x12 }}>
      {GRADE_LEGS.map((leg, i) => (
        <View
          key={leg}
          testID={`desk-grade-leg-${i + 1}`}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space.x10,
            paddingVertical: space.x8,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: alpha.ivory10,
          }}
        >
          <Num size={11} weight="bold" c={color.violetLight} style={{ width: 12 }}>
            {i + 1}
          </Num>
          <T size={13} lh={19} c={color.muted} style={{ flex: 1 }}>{leg}</T>
        </View>
      ))}
      <View style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: alpha.ivory10,
        paddingTop: space.x8,
      }}>
        <T size={12} lh={17} c={color.dim}>
          A+ is all five. Most are B or C. The grade is on the idea, not the
          company — a great business whose future is already in the price is a
          B. It is not a forecast for this quarter.
        </T>
      </View>
    </View>
  );
}

const STATE_TONE: Record<WatchState, string> = {
  no_base: color.dim,
  coiled: color.cyan,
  armed: color.cyan,
  triggered: color.green,
  failed: color.red,
  invalidated: color.red,
  extended: color.gold,
  cooled: color.cyan,
  expired: color.dim,
};

/** What the chart is doing. Market data, so cyan — never volt, never violet. */
export function StateChip({ state }: { state: WatchState }) {
  const tone = STATE_TONE[state];
  return (
    <View
      accessibilityLabel={WATCH_STATE_COPY[state]}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: space.x6,
        paddingHorizontal: space.x8, paddingVertical: space.x4,
        borderRadius: radius.pill, backgroundColor: alpha.ivory06,
      }}
    >
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tone }} />
      <T size={11} weight="semibold" c={tone}>{state.replace('_', ' ')}</T>
    </View>
  );
}

/**
 * The line that makes a claim falsifiable.
 *
 * Every argument the desk publishes carries the thing that would prove it
 * wrong, and it is given the same visual weight as the claim itself. A desk
 * that shows only its reasons cannot be judged.
 */
export function Falsifier({ label, text, tone = color.red }: {
  label: string; text: string; tone?: string;
}) {
  return (
    <View style={{
      marginTop: space.x14,
      paddingLeft: space.x12,
      borderLeftWidth: 2,
      borderLeftColor: tone,
    }}>
      <Eyebrow c={color.dim}>{label}</Eyebrow>
      <T size={14} lh={20} c={color.text} style={{ marginTop: space.x4 }}>{text}</T>
    </View>
  );
}

/**
 * An unfinished write-up.
 *
 * On 4 September sixteen of nineteen "rejections" were arguments that ran out
 * of room mid-sentence and were stored as passes. They are not decisions and
 * this app will not render them as any. Where one appears, it says what it is.
 */
export function UnfinishedNote({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{
      marginTop: space.x16, paddingLeft: space.x14, paddingVertical: space.x4,
      borderLeftWidth: 3, borderLeftColor: color.gold,
    }, style]}>
      <Eyebrow c={color.gold}>Never reached a verdict</Eyebrow>
      <T size={13} lh={19} c={color.muted} style={{ marginTop: space.x6 }}>
        This write-up stopped before stating a call — the argument ran out of
        room, not out of substance. It is stored, not decided, and it is not a
        rejection. It owes you a re-run.
      </T>
    </View>
  );
}

/**
 * Light markdown, rendered.
 *
 * The theses are written in `## heading`, `**bold**` and `- bullet` and
 * nothing else. This renders exactly that and leaves everything else as prose
 * rather than guessing — a thesis with a stray asterisk should read as a
 * thesis, not as a parser's opinion of one.
 */
export function Prose({ text }: { text: string }) {
  const blocks = text.split('\n');
  const out: React.ReactNode[] = [];
  let para: string[] = [];

  const flush = (key: string) => {
    if (!para.length) return;
    out.push(
      <Inline key={key} text={para.join(' ')} style={{ marginTop: space.x10 }} />,
    );
    para = [];
  };

  blocks.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { flush(`p${i}`); return; }
    if (/^#{2,3}\s+/.test(line)) {
      flush(`p${i}`);
      out.push(
        <Eyebrow key={`h${i}`} c={color.dim} style={{ marginTop: space.x20 }}>
          {line.replace(/^#{2,3}\s+/, '')}
        </Eyebrow>,
      );
      return;
    }
    if (/^([-*]\s|\d+\.\s)/.test(line)) {
      flush(`p${i}`);
      out.push(
        <View key={`li${i}`} style={{ flexDirection: 'row', gap: space.x8, marginTop: space.x8 }}>
          <T size={14} c={color.violetLight}>—</T>
          <Inline text={line.replace(/^([-*]\s|\d+\.\s)/, '')} style={{ flex: 1 }} />
        </View>,
      );
      return;
    }
    para.push(line);
  });
  flush('pz');

  return <View>{out}</View>;
}

/** One paragraph, with `**bold**` runs promoted to full-strength ivory. */
function Inline({ text, style }: { text: string; style?: StyleProp<ViewStyle> }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <T size={14} lh={21} c={color.muted} style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <T key={i} size={14} lh={21} weight="semibold" c={color.text}>{p.slice(2, -2)}</T>
        ) : (
          <T key={i} size={14} lh={21} c={color.muted}>{p}</T>
        ),
      )}
    </T>
  );
}

/** A tappable row that goes somewhere. Chevron on the right, nothing clever. */
export function LinkRow({ onPress, children, last = false }: {
  onPress: () => void; children: React.ReactNode; last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        paddingVertical: space.x12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: alpha.ivory08,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

export const money = (v: number | null): string => {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
};

export const px = (v: number | null): string => (v == null ? '—' : `$${v.toFixed(2)}`);
