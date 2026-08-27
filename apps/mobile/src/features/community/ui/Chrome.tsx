import React from 'react';
import { View, Pressable, ScrollView, Modal, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradient, gradientAngle, radius } from '../../../ui/tokens';
import { T, Num } from '../../../ui/Text';
import { ObjectCard } from '../../../ui/Panel';
import { ChevronLeft, MoreDots, Pin, Slow } from './Icons';
import { KaiDot } from './KaiDot';

/**
 * Shared chrome for the community + debrief stack.
 * New primitives live here because `src/ui/**` belongs to lane MOBILE-A.
 * Every value is the artboard's own (V3-C1 header 6/16/12 + 1px rule, etc.).
 */

/** V3-C1 / S81 / S85 stack header: back · centred title+subtitle · right slot. */
export function StackHeader({
  title, subtitle, subtitleColor, onBack, right, onRight, rightLabel, testID,
}: {
  title: string;
  subtitle?: React.ReactNode;
  subtitleColor?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  onRight?: () => void;
  rightLabel?: string;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={{
        paddingTop: Math.max(insets.top, 62) + 6,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: alpha.ivory07,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Pressable
        testID="header-back"
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ width: 24, height: 24, justifyContent: 'center' }}
      >
        {onBack ? <ChevronLeft size={20} /> : null}
      </Pressable>

      <View style={{ flex: 1, alignItems: 'center' }}>
        <T size={16} weight="bold" numberOfLines={1}>{title}</T>
        {typeof subtitle === 'string'
          ? <T size={10} c={subtitleColor ?? color.muted} style={{ marginTop: 1 }}>{subtitle}</T>
          : subtitle ?? null}
      </View>

      {onRight ? (
        <Pressable
          testID="header-right"
          accessibilityRole="button"
          accessibilityLabel={rightLabel ?? 'More'}
          onPress={onRight}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ minWidth: 24, height: 24, alignItems: 'flex-end', justifyContent: 'center' }}
        >
          {right ?? <MoreDots size={20} />}
        </Pressable>
      ) : (
        <View style={{ minWidth: 24, height: 24, alignItems: 'flex-end', justifyContent: 'center' }}>
          {right ?? null}
        </View>
      )}
    </View>
  );
}

/** Member avatar: 34px circle, initial, tinted by role (never by performance). */
export function Avatar({ initial, size = 34, tone = 'neutral' }: {
  initial: string; size?: number; tone?: 'neutral' | 'educator' | 'market' | 'kai';
}) {
  if (tone === 'kai') return <KaiDot size={size} />;
  const tint =
    tone === 'educator' ? 'rgba(255,200,87,0.30)'
    : tone === 'market' ? 'rgba(50,214,255,0.25)'
    : alpha.ivory14;
  return (
    <LinearGradient
      colors={[tint, alpha.chip85] as unknown as readonly [string, string]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{
        width: size, height: size, borderRadius: size / 2, flexShrink: 0,
        borderWidth: 0.5, borderColor: alpha.ivory14,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <T size={Math.round(size * 0.38)} weight="bold">{initial}</T>
    </LinearGradient>
  );
}

/** Evidence-based label (08 §8). Never a rank, never a score. */
export function RoleChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'gold' | 'kai' | 'green' }) {
  const c =
    tone === 'gold' ? color.gold
    : tone === 'kai' ? color.violetLight
    : tone === 'green' ? color.green
    : color.muted;
  const border =
    tone === 'gold' ? alpha.gold50
    : tone === 'kai' ? alpha.violet50
    : tone === 'green' ? alpha.green40
    : alpha.ivory25;
  const bg = tone === 'kai' ? alpha.violet20 : tone === 'gold' ? alpha.gold14 : 'transparent';
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, borderColor: border, backgroundColor: bg }}>
      <T size={9} weight="bold" c={c}>{label}</T>
    </View>
  );
}

/** "Holds META" — 08 §10 requires disclosure on structured trade-idea posts. */
export function DisclosureChip({ label, holds }: { label: string; holds: boolean }) {
  return (
    <View
      accessibilityLabel={`Position disclosure: ${label}`}
      style={{
        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
        borderWidth: 0.5, borderColor: holds ? alpha.gold50 : alpha.ivory25,
      }}
    >
      <T size={9} c={holds ? color.gold : color.muted}>{label}</T>
    </View>
  );
}

/**
 * 08 §10: community claims are visibly unverified until Kai checks them.
 * Shape + label + colour — muted while unverified, green only once verified,
 * because "verified" is a factual result, not sentiment.
 */
export function ClaimChip({ state, label }: { state: 'unverified' | 'verified' | 'partial' | 'false'; label?: string }) {
  const spec = {
    unverified: { text: label ?? 'Unverified', c: color.muted, border: alpha.ivory25, mark: '○' },
    verified: { text: label ?? 'Verified by Kai', c: color.green, border: alpha.green40, mark: '✓' },
    partial: { text: label ?? 'Partly verified', c: color.gold, border: alpha.gold50, mark: '◐' },
    false: { text: label ?? 'Not true', c: color.red, border: alpha.red40, mark: '×' },
  }[state];
  return (
    <View
      accessibilityLabel={spec.text}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, borderColor: spec.border }}
    >
      <T size={9} c={spec.c}>{spec.mark}</T>
      <T size={9} c={spec.c}>{spec.text}</T>
    </View>
  );
}

/**
 * Community sentiment.
 * The artboard paints this bar green/red. Sentiment is NOT a financial outcome
 * and the palette reserves green/red for financial semantics, so it renders in
 * two ivory weights with both sides named in words. Copy keeps the artboard's
 * "not evidence" disclaimer, which is the whole point of the object.
 */
export function SentimentBar({ bullPct, sample, compact = false }: { bullPct: number; sample: number; compact?: boolean }) {
  const bull = Math.max(0, Math.min(100, Math.round(bullPct)));
  return (
    <View
      accessibilityLabel={`Community sentiment: ${bull} percent bullish from ${sample} posts. Sentiment is not evidence.`}
      style={{ gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {compact ? <T size={11} c={color.muted} style={{ width: 64 }}>Community</T> : null}
        <View style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', backgroundColor: alpha.ivory08 }}>
          <View style={{ width: `${bull}%`, backgroundColor: alpha.ivory25 }} />
          <View style={{ flex: 1, backgroundColor: alpha.ivory10 }} />
        </View>
        <Num size={11} weight="medium">{bull}%</Num>
      </View>
      <T size={10} c={color.muted}>
        {bull}% read it bullish · {100 - bull}% bearish · {sample} posts · sentiment is not evidence
      </T>
    </View>
  );
}

/** V3-C1's red "NEW MESSAGES · 9:40" rule. */
export function NewMessagesRule({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: alpha.red45 }} />
      <T size={9} weight="bold" ls={0.72} c={color.red}>{label}</T>
      <View style={{ flex: 1, height: 1, backgroundColor: alpha.red45 }} />
    </View>
  );
}

/** "N new since you left" — from room_members.last_read_seq. */
export function CatchUpPill({ count, onPress, testID }: { count: number; onPress?: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${count} new since you left. Jump to them.`}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: 'center',
        flexDirection: 'row', alignItems: 'center', gap: 7,
        height: 32, paddingHorizontal: 14, borderRadius: radius.pill,
        borderWidth: 0.5, borderColor: alpha.volt50, backgroundColor: alpha.volt10,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.volt }} />
      <T size={11} weight="semibold" c={color.volt}>{count} new since you left</T>
    </Pressable>
  );
}

/** Pinned intelligence strip (08 §3 room anatomy). */
export function PinnedStrip({ kind, text }: { kind: 'kai' | 'moderator' | 'warning' | 'session'; text: string }) {
  const isKai = kind === 'kai';
  const isWarn = kind === 'warning';
  return (
    <ObjectCard
      tone={isKai ? 'kai' : isWarn ? 'gold' : 'default'}
      r={radius.lg}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 9, paddingHorizontal: 12 }}
    >
      <View style={{ paddingTop: 2 }}>
        <Pin size={12} color={isKai ? color.violetLight : isWarn ? color.gold : color.muted} />
      </View>
      <T size={12} lh={17} style={{ flex: 1 }}>
        <T size={12} weight="bold" c={isKai ? color.violetLight : isWarn ? color.gold : color.muted}>
          {isKai ? 'Pinned · Kai' : isWarn ? 'Pinned · Warning' : 'Pinned'}
        </T>
        {'  '}{text}
      </T>
    </ObjectCard>
  );
}

/** Mode selector chip row — Day trade / Swing / Investing. */
export function ModeChips({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            testID={`mode-${o.id}`}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => ({
              height: 30, paddingHorizontal: 13, borderRadius: radius.pill,
              flexDirection: 'row', alignItems: 'center',
              borderWidth: on ? 0 : 0.5, borderColor: alpha.ivory24,
              backgroundColor: on ? color.volt : 'transparent',
              opacity: pressed ? 0.82 : 1,
            })}
          >
            <T size={12} weight={on ? 'bold' : 'semibold'} c={on ? color.bg : color.muted}>{o.label}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Bottom sheet used for the @Kai command list, moderation actions, etc. */
export function Sheet({
  visible, onClose, title, subtitle, children, testID,
}: {
  visible: boolean; onClose: () => void; title: string; subtitle?: string;
  children: React.ReactNode; testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
        {/* The panel gradient is translucent by design; a sheet floats over live
            content, so it sits on an opaque base or the room reads through it. */}
        <View
          style={{
            margin: 12, marginBottom: Math.max(insets.bottom, 16),
            borderRadius: radius.xxxl, backgroundColor: color.surface2, overflow: 'hidden',
          }}
        >
        <ObjectCard
          testID={testID}
          r={radius.xxxl}
          style={{ padding: 18, gap: 12 }}
        >
          <View style={{ gap: 3 }}>
            <T size={18} weight="bold">{title}</T>
            {subtitle ? <T size={12} c={color.muted}>{subtitle}</T> : null}
          </View>
          {children}
        </ObjectCard>
        </View>
      </View>
    </Modal>
  );
}

/** A tappable row inside a Sheet. */
export function SheetRow({
  label, hint, onPress, disabled, tone = 'default', testID, last = false,
}: {
  label: string; hint?: string; onPress?: () => void; disabled?: boolean;
  tone?: 'default' | 'kai' | 'danger'; testID?: string; last?: boolean;
}) {
  const c = tone === 'kai' ? color.violetLight : tone === 'danger' ? color.red : color.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48, justifyContent: 'center', paddingVertical: 10,
        borderBottomWidth: last ? 0 : 0.5, borderBottomColor: alpha.ivory08,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      })}
    >
      <T size={14} weight="semibold" c={c}>{label}</T>
      {hint ? <T size={11} c={color.muted} style={{ marginTop: 2 }}>{hint}</T> : null}
    </Pressable>
  );
}

/** Slow-mode / restricted-posting notice on a room header. */
export function RoomStateNote({ slowModeS, restricted }: { slowModeS?: number; restricted?: boolean }) {
  if (!slowModeS && !restricted) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Slow size={11} />
      <T size={10} c={color.gold}>
        {restricted ? 'Posting restricted' : `Slow mode · one message every ${slowModeS}s`}
      </T>
    </View>
  );
}

/** A price level as a token — cyan (market data), mono, never plain text. */
export function LevelToken({ value, tone = 'market' }: { value: string; tone?: 'market' | 'target' | 'invalid' }) {
  const c = tone === 'target' ? color.green : tone === 'invalid' ? color.red : color.cyan;
  const bg = tone === 'target' ? color.greenTint : tone === 'invalid' ? color.redTint : alpha.cyan10;
  return (
    <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: bg }}>
      <Num size={12} weight="medium" c={c}>{value}</Num>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 0.5, backgroundColor: alpha.ivory08 }, style]} />;
}

export const kaiGradient = gradient.kai;
