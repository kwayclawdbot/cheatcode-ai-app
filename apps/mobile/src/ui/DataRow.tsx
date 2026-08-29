import React from 'react';
import { View, Pressable, ViewStyle, StyleProp } from 'react-native';
import { alpha, color, space } from './tokens';
import { T, Num } from './Text';
import { ArrowRight } from './Icons';

/**
 * THE DENSE ROW, AND WHY IT IS HERE RATHER THAN INSIDE (admin).
 *
 * The product's standing rule is that there are no generic card containers —
 * no boxed rounded-rect grids. A list of two thousand people therefore cannot
 * be two thousand little boxes; it has to be what a ledger has always been:
 * type, alignment, and a hairline between one line and the next.
 *
 * That is not an admin idea. Positions, fills, the entitlement list and the
 * order book all want the same line, so the line lives in `src/ui/` where the
 * rest of the app can reach it (brief §9: "add it to src/ui/ as a shared
 * primitive — do not fork a private copy inside (admin)").
 *
 * DENSITY COMES FROM THE TYPE SCALE, NOT FROM A COMPACT THEME. These rows use
 * the same faces, the same sizes and the same `alpha.ivory08` hairline the
 * Account board already uses between its rows; what makes them read as denser
 * is that they drop the panel around them, not that they shrink.
 */
export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 0.5, backgroundColor: alpha.ivory08 }, style]} />;
}

/**
 * A vertical hairline. Used to separate figures that sit on one line, so a
 * row of numbers needs no boxes to be read as four separate things.
 */
export function VRule({ height = 22 }: { height?: number }) {
  return <View style={{ width: 0.5, height, backgroundColor: alpha.ivory08 }} />;
}

export function DataRow({
  label, sub, meta, value, valueNode, valueTone, mono = true, lead, onPress, chevron,
  last = false, dim = false, testID, accessibilityLabel,
}: {
  /** The thing this row is about. Prose face — a name, not a number. */
  label: React.ReactNode;
  /** One quiet line under the label: identity, source, whatever it is. */
  sub?: React.ReactNode;
  /** A second quiet line, for rows that carry a sentence as well as a fact. */
  meta?: React.ReactNode;
  /** The fact, right-aligned. Mono by default: numbers, ids, codes, times. */
  value?: string | null;
  valueNode?: React.ReactNode;
  valueTone?: string;
  mono?: boolean;
  lead?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
  /** The row is about something that is over, off, or no longer active. */
  dim?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x10,
        // 44 is the accessibility floor for anything tappable; a read-only row
        // is allowed to be tighter, which is where the density comes from.
        minHeight: onPress ? 44 : 34,
        paddingVertical: space.x9,
        opacity: dim ? 0.62 : 1,
      }}
    >
      {lead}
      <View style={{ flex: 1, gap: 2 }}>
        {typeof label === 'string'
          ? <T size={13.5} weight="semibold" numberOfLines={1}>{label}</T>
          : label}
        {typeof sub === 'string'
          ? <T size={11} c={color.muted} numberOfLines={1}>{sub}</T>
          : sub}
        {typeof meta === 'string'
          ? <T size={11} c={color.dim} lh={16}>{meta}</T>
          : meta}
      </View>
      {valueNode ?? (value != null
        ? (mono
            ? <Num size={12.5} weight="semibold" c={valueTone ?? color.text}>{value}</Num>
            : <T size={12.5} c={valueTone ?? color.muted}>{value}</T>)
        : null)}
      {chevron ? <ArrowRight size={12} color={color.muted} /> : null}
    </View>
  );

  return (
    <View style={{ borderBottomWidth: last ? 0 : 0.5, borderBottomColor: alpha.ivory08 }}>
      {onPress ? (
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? (typeof label === 'string' ? label : undefined)}
          onPress={onPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {body}
        </Pressable>
      ) : (
        <View testID={testID} accessibilityLabel={accessibilityLabel}>{body}</View>
      )}
    </View>
  );
}

/**
 * A NUMBER THAT KNOWS WHETHER IT KNOWS.
 *
 * `value: null` is not zero and must never render as zero — it renders "not
 * tracked yet". The null case is the reason this is a primitive instead of a
 * `<Num>` at a call site: written out by hand it becomes `?? 0` the first time
 * somebody is in a hurry, and then a dashboard is quietly lying about revenue.
 */
export function Figure({
  label, value, note, tone, size = 19, last = false, testID,
}: {
  label: string;
  /** Already formatted. Null means the app does not measure this yet. */
  value: string | null;
  note?: string | null;
  /** Money is the only thing allowed a colour here (the palette grammar). */
  tone?: string;
  size?: number;
  last?: boolean;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: space.x12,
        paddingVertical: space.x11,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: alpha.ivory08,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <T size={13} c={color.text}>{label}</T>
        {note ? <T size={11} c={color.dim} lh={16}>{note}</T> : null}
      </View>
      {value == null ? (
        <T size={11.5} c={color.dim} testID={testID ? `${testID}-untracked` : undefined}>not tracked yet</T>
      ) : (
        <Num size={size} weight="bold" c={tone ?? color.text}>{value}</Num>
      )}
    </View>
  );
}

/**
 * A share of a whole, drawn as a rule rather than as a chart. The bar IS the
 * hairline the rows are already separated by, grown to the proportion — which
 * is why a funnel made of these still reads as the same page as everything
 * above it.
 */
export function ShareBar({
  share, tone, height = 2,
}: {
  /** 0..1. Anything present but tiny still draws, so "1 person" is visible. */
  share: number;
  tone?: string;
  height?: number;
}) {
  const w = Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 0;
  return (
    <View style={{ height, backgroundColor: alpha.ivory06, borderRadius: height / 2, overflow: 'hidden' }}>
      <View style={{ width: `${w === 0 ? 0 : Math.max(1.5, w * 100)}%`, height, backgroundColor: tone ?? alpha.ivory25 }} />
    </View>
  );
}
