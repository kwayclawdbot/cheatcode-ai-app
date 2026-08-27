/**
 * The small objects the paper-execution screens share (lane MOBILE-B).
 * All of them come straight off V3-P1 / V3-T1 / V4-TR3; nothing new is invented
 * here, and nothing in `src/ui/**` (lane MOBILE-A) is edited.
 */
import React from 'react';
import { View, Pressable, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { T, Num } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import type { Quote } from '../../lib/types';
import type { RiskCheck } from '../orders/types';

/* ---------------- money ---------------- */

export const money = (n: number | null | undefined, dp = 2): string =>
  n == null ? '—' : `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

/** −$21.30 uses a real minus sign, never a hyphen. */
export const signedMoney = (n: number | null | undefined, dp = 2): string =>
  n == null ? '—' : `${n < 0 ? '−' : '+'}${money(n, dp)}`;

export const signedPct = (n: number | null | undefined): string =>
  n == null ? '' : `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(2)}%`;

export const pnlColor = (n: number | null | undefined): string =>
  n == null ? color.muted : n < 0 ? color.red : color.green;

/** "1.29 shares" — fractional sizes print their decimals, whole ones do not. */
export const shareLabel = (qty: number | null | undefined): string => {
  if (qty == null) return '—';
  const s = Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
  return `${s} ${Math.abs(qty) === 1 ? 'share' : 'shares'}`;
};

/* ---------------- chips + lines ---------------- */

/** The cyan Paper pill. It is on every screen that can move (paper) money. */
export function PaperChip({ label = 'Paper', testID }: { label?: string; testID?: string }) {
  return (
    <View
      testID={testID}
      accessibilityLabel="Paper account"
      style={{
        paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill,
        borderWidth: 0.5, borderColor: alpha.cyan40, backgroundColor: alpha.cyan07,
      }}
    >
      <T size={10} weight="semibold" c={color.cyan}>{label}</T>
    </View>
  );
}

export function StatusDot({ c = color.green, size = 6 }: { c?: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c }} />;
}

/**
 * Back control for the screens that keep the artboard's own big title instead
 * of `StackHeader` (Positions, Review order, the plan). Same 34px box the rest
 * of the app uses, so "back" is in the same place everywhere.
 */
export function BackButton({ onPress, testID = 'back' }: { onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => ({
        width: 34, height: 34, borderRadius: radius.lg, borderWidth: 1, borderColor: alpha.ivory10,
        backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center',
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d="M15 5l-7 7 7 7" stroke={color.text} strokeWidth={2.2} />
      </Svg>
    </Pressable>
  );
}

/**
 * Quiet filter pill. Deliberately NOT `ui/Button`'s Chip: that fills with volt,
 * and volt is the user's one dominant action on a screen — on Positions that is
 * "Review", not "which list am I looking at".
 */
export function FilterPill({
  label, selected, onPress, testID,
}: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={({ pressed }) => ({
        height: 28, paddingHorizontal: 13, borderRadius: radius.pill,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 0.5, borderColor: selected ? alpha.volt55 : alpha.ivory16,
        backgroundColor: selected ? alpha.volt10 : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <T size={12} weight="semibold" c={selected ? color.volt : color.muted}>{label}</T>
    </Pressable>
  );
}

/** Kai's one-line remark: orb + violet-light sentence. */
export function KaiLine({ text, testID }: { text: string; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
      <KaiOrb size={16} glow={false} />
      <T size={12} c={color.violetLight} lh={17} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

/* ---------------- rows + tiles ---------------- */

export function DetailRow({
  label, value, valueColor, mono = true, last = false, onPress, testID, hint,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
  last?: boolean;
  onPress?: () => void;
  testID?: string;
  hint?: string;
}) {
  const body = (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 6, minHeight: onPress ? 44 : 0,
        borderBottomWidth: last ? 0 : 0.5, borderBottomColor: alpha.ivory08,
      }}
    >
      <T size={13} c={color.muted}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {mono
          ? <Num size={13} weight="semibold" c={valueColor}>{value}</Num>
          : <T size={13} weight="semibold" c={valueColor}>{value}</T>}
        {onPress ? <T size={11} c={color.dim}>Edit</T> : null}
      </View>
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={hint ?? `Edit ${label}`} onPress={onPress}>
      {body}
    </Pressable>
  );
}

/** Entry / Target / Stop tiles — V3-T1's three coloured surfaces. */
export function LevelTile({
  label, value, tone, testID,
}: { label: string; value: string; tone: 'entry' | 'target' | 'stop'; testID?: string }) {
  const spec = {
    entry: { bg: color.cyanTint, bd: alpha.cyan40, c: color.cyan },
    target: { bg: color.greenTint, bd: alpha.green40, c: color.green },
    stop: { bg: color.redTint, bd: alpha.red40, c: color.red },
  }[tone];
  return (
    <View
      testID={testID}
      style={{
        flex: 1, paddingVertical: 11, paddingHorizontal: 4, borderRadius: 14,
        backgroundColor: spec.bg, borderWidth: 0.5, borderColor: spec.bd, alignItems: 'center',
      }}
    >
      <T size={10} c={color.muted}>{label}</T>
      <Num size={15} weight="semibold" c={spec.c} style={{ marginTop: 2 }}>{value}</Num>
    </View>
  );
}

/** "If target hits ≈ +$46" / "If stopped −$58". */
export function ScenarioTile({
  label, value, tone, testID,
}: { label: string; value: string; tone: 'up' | 'down'; testID?: string }) {
  const up = tone === 'up';
  return (
    <LinearGradient
      colors={(up
        ? ['rgba(53,208,127,0.10)', alpha.surface60]
        : ['rgba(255,90,95,0.10)', alpha.surface60]) as unknown as readonly [string, string]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{
        flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
        borderWidth: 0.5, borderColor: up ? alpha.green40 : alpha.red40,
      }}
    >
      <View testID={testID}>
        <T size={10} c={color.muted}>{label}</T>
        <Num size={16} weight="semibold" c={up ? color.green : color.red} style={{ marginTop: 2 }}>{value}</Num>
      </View>
    </LinearGradient>
  );
}

/* ---------------- bars ---------------- */

/**
 * Stop · now · target. The fill is where price sits between the stop and the
 * target, so "how much room is left" is a glance, not arithmetic.
 */
export function StopNowTargetBar({
  stop, now, target, testID,
}: { stop: number | null; now: number | null; target: number | null; testID?: string }) {
  if (stop == null || now == null || target == null || target === stop) {
    return (
      <View testID={testID}>
        <T size={10} c={color.dim}>No stop and target on this one yet.</T>
      </View>
    );
  }
  const raw = (now - stop) / (target - stop);
  const pct = Math.max(0, Math.min(1, raw)) * 100;
  const danger = pct < 15;
  return (
    <View testID={testID} style={{ gap: 4 }}>
      <View style={{ height: 7, borderRadius: 4, backgroundColor: alpha.ivory08 }}>
        {danger ? (
          <View style={{ width: `${Math.max(pct, 3)}%`, height: '100%', borderRadius: 4, backgroundColor: color.red }} />
        ) : (
          <LinearGradient
            colors={[color.red, color.cyan, color.green] as unknown as readonly [string, string, string]}
            locations={[0, 0.4, 1] as unknown as readonly [number, number, number]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ width: `${Math.max(pct, 3)}%`, height: '100%', borderRadius: 4 }}
          />
        )}
        <View
          style={{
            position: 'absolute', left: `${pct}%`, top: -3, width: 2, height: 13,
            backgroundColor: color.text,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Num size={10} weight="regular" c={color.red}>{`Stop ${stop}`}</Num>
        <Num size={10} weight="regular" c={color.muted}>{`now ${now}`}</Num>
        <Num size={10} weight="regular" c={color.green}>{`Target ${target}`}</Num>
      </View>
    </View>
  );
}

/**
 * "Daily risk used  ▓▓▓░░  $58 / $200" — one line, volt while there is room,
 * gold when it is nearly gone, red when it is spent.
 */
export function RiskBar({
  label, used, cap, testID,
}: { label: string; used: number | null; cap: number | null; testID?: string }) {
  if (cap == null || cap <= 0) return null;
  const u = Math.max(0, used ?? 0);
  const ratio = Math.min(1, u / cap);
  const c = ratio >= 1 ? color.red : ratio >= 0.9 ? color.gold : color.volt;
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 }}>
      <T size={12} c={color.muted}>{label}</T>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: alpha.ivory08 }}>
        <View style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 3, backgroundColor: c }} />
      </View>
      <Num size={12} weight="regular" c={ratio >= 0.9 ? c : color.muted}>{`${money(u, 0)} / ${money(cap, 0)}`}</Num>
    </View>
  );
}

/* ---------------- Kai risk check (V4-TR3) ---------------- */

const VERDICT = {
  pass: { label: 'Passes', c: color.green },
  advisory: { label: 'Worth knowing', c: color.gold },
  blocker: { label: "Can't place this", c: color.red },
} as const;

/**
 * Kai's read on the order.
 *
 * The header badge follows the WORST finding, not the friendliest: an advisory
 * (say, tech exposure going to 58%) reads gold as "Worth knowing" — it is never
 * rounded up to a green "Passes". A blocker reads red and the primary action
 * upstream is disabled.
 */
export function KaiRiskCheck({
  risk, children, testID,
}: { risk: RiskCheck; children?: React.ReactNode; testID?: string }) {
  const v = VERDICT[risk.verdict];
  return (
    <LinearGradient
      colors={gradient.kai as unknown as readonly [string, string]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{
        borderRadius: radius.xxl, paddingVertical: 11, paddingHorizontal: 15,
        borderWidth: 0.5, borderColor: alpha.violet50, gap: 8,
      }}
    >
      <View testID={testID} style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <KaiOrb size={20} glow={false} />
          <T size={12} weight="bold" c={color.violetLight}>Kai risk check</T>
          <View
            testID={`risk-verdict-${risk.verdict}`}
            style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <StatusDot c={v.c} size={5} />
            <T size={10} weight="semibold" c={v.c}>{v.label}</T>
          </View>
        </View>

        <T size={13} lh={19}>{risk.headline}</T>

        {risk.blockers.map((b) => (
          <View key={b.code} style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start' }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.red, marginTop: 6 }} />
            <T size={12} c={color.red} lh={17} style={{ flex: 1 }}>{b.message}</T>
          </View>
        ))}
        {risk.advisories.map((a) => (
          <View key={a.code} style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start' }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.gold, marginTop: 6 }} />
            <T size={12} c={color.gold} lh={17} style={{ flex: 1 }}>{a.message}</T>
          </View>
        ))}

        {children ? (
          <View style={{ gap: 6, paddingTop: 7, borderTopWidth: 0.5, borderTopColor: alpha.violetLight18 }}>
            {children}
          </View>
        ) : null}

        <T size={10} c={color.dim}>Kai&apos;s assessment — not a guarantee.</T>
      </View>
    </LinearGradient>
  );
}

/** Small label/number pair used inside the risk panel. */
export function RiskLine({ label, value, c }: { label: string; value: string; c?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <T size={12} c={color.muted}>{label}</T>
      <Num size={12} weight="semibold" c={c}>{value}</Num>
    </View>
  );
}

/** "Quote 508.40 · delayed" under a number that came from the market. */
export function QuoteLine({
  quote, note, style, testID,
}: { quote: Quote | null | undefined; note?: string | null; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View
      testID={testID}
      style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, style]}
    >
      {quote?.price != null ? <Num size={11} weight="regular" c={color.cyan}>{`Quote ${quote.price.toFixed(2)}`}</Num> : null}
      <FreshnessMark freshness={quote?.freshness ?? 'unknown'} delayReason={quote?.delay_reason} size={11} />
      {note ? <T size={11} c={color.muted}>{note}</T> : null}
    </View>
  );
}

/** Full-bleed gradient card body used by the ticket / review panels. */
export function Panel({
  children, style, testID,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <LinearGradient
      colors={gradient.panel as unknown as readonly [string, string, string]}
      locations={gradient.panelLocations as unknown as readonly [number, number, number]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={[{ borderRadius: radius.xxl, borderWidth: 0.5, borderColor: alpha.ivory16 }, style]}
    >
      <View testID={testID}>{children}</View>
    </LinearGradient>
  );
}
