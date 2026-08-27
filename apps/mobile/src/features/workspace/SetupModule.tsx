import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ObjectCard } from '../../ui/Panel';
import { T, Num } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { Bell } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { openKaiSheet } from '../kai-sheet';
import type { PositionModule, SetupModule as SetupModuleType } from '../../lib/types';

function Level({ label, value, c, bg, border, testID }: {
  label: string; value: string; c: string; bg: string; border: string; testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 11, backgroundColor: bg, borderWidth: 0.5, borderColor: border, alignItems: 'center' }}
    >
      <T size={9} c={color.muted}>{label}</T>
      <Num size={13} weight="semibold" c={c} style={{ marginTop: 1 }}>{value}</Num>
    </View>
  );
}

/** A secondary action reads as a word, not a button (audit §9). */
function TextAction({ label, c, onPress, testID }: { label: string; c: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <T size={12} weight="semibold" c={c}>{label}</T>
    </Pressable>
  );
}

/**
 * V5-W1's setup MODULE — a state inside the symbol workspace, never its own
 * destination (consolidation rule 1). Kai owns this object, so it wears the
 * violet panel; the one dominant action inside it is the user's, so it is volt.
 */
export function SetupModuleCard({
  symbol, module, watching, busy, onWatch, onSeeWhy, onBuildPlan, testID = 'setup-module',
}: {
  symbol: string;
  module: SetupModuleType;
  watching: boolean;
  busy?: boolean;
  onWatch: () => void;
  onSeeWhy: () => void;
  onBuildPlan: () => void;
  testID?: string;
}) {
  const primaryLabel = module.primary_action.label === 'Watch this' && watching
    ? 'Watching'
    : module.primary_action.label;

  return (
    <ObjectCard testID={testID} tone="kai" r={radius.xxl} style={{ paddingVertical: 14, paddingHorizontal: 15, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <KaiOrb size={20} />
        <T size={12} weight="bold" c={color.violetLight} testID="setup-state">{module.state_label}</T>
        <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.sm, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
          <T size={11} weight="bold" c={color.violet}>{module.grade_display}</T>
        </View>
        {/* Distance to entry only matters while the idea is still live. */}
        {module.distance_label && module.state !== 'invalidated' && module.state !== 'expired' ? (
          <T size={11} c={color.cyan} style={{ marginLeft: 'auto' }}>{module.distance_label}</T>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Level testID="level-entry" label="Entry" value={module.entry ?? '—'} c={color.cyan} bg={color.cyanTint} border={alpha.cyan40} />
        <Level testID="level-target" label="Target" value={module.target ?? '—'} c={color.green} bg={color.greenTint} border={alpha.green40} />
        <Level testID="level-invalid" label="Invalid" value={module.invalid ?? '—'} c={color.red} bg={color.redTint} border={alpha.red40} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          testID="setup-primary"
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          accessibilityState={{ selected: watching, busy: !!busy }}
          onPress={onWatch}
          style={({ pressed }) => ({
            flex: 1, height: 42, borderRadius: radius.pill,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
            backgroundColor: watching ? 'transparent' : color.volt,
            borderWidth: watching ? 1 : 0,
            borderColor: alpha.volt55,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {/* The bell belongs to "Watch this" — not to "Review what changed". */}
          {/^watch/i.test(primaryLabel) ? <Bell size={13} color={watching ? color.volt : color.bg} /> : null}
          <T size={13} weight="bold" c={watching ? color.volt : color.bg}>{primaryLabel}</T>
        </Pressable>
        <TextAction testID="setup-see-why" label="See why" c={color.violetLight} onPress={onSeeWhy} />
        <TextAction testID="setup-build-plan" label="Build a plan" c={color.muted} onPress={onBuildPlan} />
      </View>

      {module.note ? <T size={11} lh={16} c={color.muted}>{module.note}</T> : null}
    </ObjectCard>
  );
}

/**
 * The position module. It lives on Overview because the decision chain has to
 * stay visible on the symbol (audit §9) — but the position itself is Trade's
 * object, so every action here routes to MOBILE-B's `/position/[id]`.
 */
export function PositionModuleCard({ symbol, position, testID = 'position-module' }: {
  symbol: string; position: PositionModule; testID?: string;
}) {
  const router = useRouter();
  const up = (position.unrealized_pnl ?? 0) >= 0;
  return (
    <ObjectCard testID={testID} r={radius.xxl} style={{ paddingVertical: 13, paddingHorizontal: 15, gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <T size={12} weight="bold" c={color.muted}>YOUR POSITION</T>
        {position.health_label ? (
          <T size={11} c={position.health_label.toLowerCase().includes('risk') ? color.gold : color.green}>{position.health_label}</T>
        ) : null}
        {position.unrealized_pnl != null ? (
          <Num size={13} weight="semibold" c={up ? color.green : color.red} style={{ marginLeft: 'auto' }}>
            {`${up ? '+' : '−'}$${Math.abs(position.unrealized_pnl).toFixed(2)}`}
          </Num>
        ) : null}
      </View>

      <T size={12.5} lh={18} c={color.muted}>
        {position.plain
          ?? [
            position.qty != null ? `${position.qty} shares` : null,
            position.avg_price != null ? `average ${position.avg_price.toFixed(2)}` : null,
            position.stop != null ? `stop ${position.stop}` : null,
            position.target != null ? `target ${position.target}` : null,
          ].filter(Boolean).join(' · ')}
      </T>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <TextAction
          testID="position-manage"
          label="Manage"
          c={color.volt}
          onPress={() => router.push(`/position/${encodeURIComponent(position.id)}`)}
        />
        <TextAction
          testID="position-ask-kai"
          label="Ask Kai"
          c={color.violetLight}
          onPress={() => openKaiSheet({
            context: { kind: 'position', id: position.id, symbol },
            question: `How is my ${symbol} position doing against the plan?`,
          })}
        />
      </View>
    </ObjectCard>
  );
}
