import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ObjectCard } from '../../ui/Panel';
import { T, Num, Eyebrow } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { family } from '../../ui/fonts';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { openKaiSheet } from '../kai-sheet';
import type { AlertFilterKey, AttentionAlert, MonitoringRow } from '../../lib/types';

/** Attention (n) · Monitoring · n · History — filters, not five sections. */
export function FilterPills({
  value, onChange, counts, testID = 'alert-filters',
}: {
  value: AlertFilterKey;
  onChange: (k: AlertFilterKey) => void;
  counts: Record<AlertFilterKey, number>;
  testID?: string;
}) {
  const items: { key: AlertFilterKey; label: string; badge: boolean }[] = [
    { key: 'attention', label: 'Attention', badge: true },
    { key: 'monitoring', label: `Monitoring · ${counts.monitoring}`, badge: false },
    { key: 'history', label: 'History', badge: false },
  ];

  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: 4 }}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable
            key={it.key}
            testID={`filter-${it.key}`}
            accessibilityRole="button"
            accessibilityLabel={it.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(it.key)}
            style={({ pressed }) => ({
              height: 34, paddingHorizontal: 16, borderRadius: radius.pill,
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: active ? alpha.volt14 : 'transparent',
              borderWidth: active ? 0.5 : 0,
              borderColor: alpha.volt50,
              opacity: pressed && !active ? 0.75 : 1,
            })}
          >
            <T size={12} weight={active ? 'bold' : 'regular'} c={active ? color.volt : color.muted}>{it.label}</T>
            {it.badge && counts.attention > 0 ? (
              <View style={{ minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: color.volt, alignItems: 'center', justifyContent: 'center' }}>
                <T size={9} weight="bold" c={color.bg}>{String(counts.attention)}</T>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The attention card — the ONE strong card on this screen (audit §9).
 * Primary "Open <SYM>" goes straight to the workspace; "Ask Kai" opens the
 * sheet over Alerts so the user never leaves the list to get an explanation.
 */
export function AttentionCard({ a, testID }: { a: AttentionAlert; testID?: string }) {
  const router = useRouter();
  return (
    <ObjectCard testID={testID ?? `attention-${a.symbol}`} tone="gold" r={radius.xxl} style={{ paddingVertical: 14, paddingHorizontal: 15, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <T size={17} weight="bold">{a.symbol}</T>
        {a.grade_change ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: alpha.gold14, borderWidth: 0.5, borderColor: alpha.gold40 }}>
            <T size={11} weight="bold" c={color.gold}>{a.grade_change}</T>
          </View>
        ) : null}
        {a.age ? <T size={10} c={color.muted} style={{ marginLeft: 'auto' }}>{a.age}</T> : null}
      </View>

      <T size={14} lh={20}>{a.message}</T>

      {a.quote?.price != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Num size={12} weight="regular" c={color.muted}>{`Now ${a.quote.price.toFixed(2)}`}</Num>
          <FreshnessMark freshness={a.quote.freshness ?? 'unknown'} delayReason={a.quote.delay_reason} size={10} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          testID="attention-open"
          accessibilityRole="button"
          accessibilityLabel={`Open ${a.symbol}`}
          onPress={() => router.push(`/symbol/${encodeURIComponent(a.symbol)}?tab=overview`)}
          style={({ pressed }) => ({
            flex: 1, height: 42, borderRadius: radius.pill, backgroundColor: color.volt,
            alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
          })}
        >
          <T size={13} weight="bold" c={color.bg}>{`Open ${a.symbol}`}</T>
        </Pressable>
        <Pressable
          testID="attention-ask-kai"
          accessibilityRole="button"
          accessibilityLabel="Ask Kai"
          onPress={() => openKaiSheet({
            context: { kind: 'alert', id: a.id, symbol: a.symbol },
            question: `What changed on ${a.symbol}?`,
          })}
          style={({ pressed }) => ({
            height: 42, paddingHorizontal: 15, borderRadius: radius.pill,
            borderWidth: 0.5, borderColor: alpha.violet50, backgroundColor: alpha.violet08,
            alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
          })}
        >
          <T size={13} weight="semibold" c={color.violetLight}>Ask Kai</T>
        </Pressable>
      </View>
    </ObjectCard>
  );
}

const TONE: Record<NonNullable<MonitoringRow['value_tone']>, string> = {
  market: color.cyan,
  positive: color.green,
  risk: color.red,
  attention: color.gold,
  neutral: color.muted,
};

/**
 * The value column.
 *
 * The server sends one sentence — "now $345.82 · delayed". The figure is what
 * the eye needs; the qualifier is what honesty needs. Splitting on the middot
 * gives the artboard's tight numeric column without dropping the caveat, and
 * mono is reserved for the figure (“9 days” is a sentence, not a number).
 */
function ValueCell({ value, tone }: { value?: string | null; tone?: MonitoringRow['value_tone'] }) {
  if (!value) return null;
  const parts = value.split('\u00b7').map((p) => p.trim()).filter(Boolean);
  const head = (parts[0] ?? value).replace(/^now\s+/i, '');
  const rest = parts.slice(1).join(' \u00b7 ');
  const c = TONE[tone ?? 'neutral'];
  return (
    <View style={{ alignItems: 'flex-end', maxWidth: 104 }}>
      {/^[+\-\u2212$]?[\d.,:]+$/.test(head)
        ? <Num size={11} weight="regular" c={c}>{head}</Num>
        : <T size={11} align="right" c={c}>{head}</T>}
      {rest ? <T size={9} c={color.dim} align="right" style={{ marginTop: 2 }}>{rest}</T> : null}
    </View>
  );
}

/** Monitoring rows: symbol · condition · value. Rows, never cards. */
export function MonitoringList({ rows, testID = 'monitoring-list' }: { rows: MonitoringRow[]; testID?: string }) {
  const router = useRouter();
  if (!rows.length) {
    return (
      <T testID="monitoring-empty" size={12.5} lh={18} c={color.muted} style={{ paddingVertical: 8 }}>
        Kai is not watching anything for you right now. Tell him what matters in the box below.
      </T>
    );
  }

  return (
    <View testID={testID}>
      {rows.map((r, i) => {
        const body = (
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 11,
              paddingVertical: 11, paddingHorizontal: 2,
              borderTopWidth: 0.5, borderTopColor: alpha.ivory08,
              borderBottomWidth: i === rows.length - 1 ? 0.5 : 0,
              borderBottomColor: alpha.ivory08,
            }}
          >
            <T size={13} weight="bold" style={{ width: 50 }}>{r.symbol}</T>
            <T size={12} lh={17} c={color.muted} style={{ flex: 1 }}>{r.condition}</T>
            <ValueCell value={r.value} tone={r.value_tone} />
          </View>
        );
        return r.route ? (
          <Pressable
            key={r.id}
            testID={`monitoring-${r.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${r.symbol}. ${r.condition}`}
            onPress={() => router.push(r.route as string)}
            style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
          >
            {body}
          </Pressable>
        ) : (
          <View key={r.id} testID={`monitoring-${r.id}`}>{body}</View>
        );
      })}
    </View>
  );
}

/**
 * The inline natural-language composer (consolidation rule 4).
 * Type a sentence → Kai shows what he understood → you activate. No separate
 * "new alert" screen for the common case.
 */
export function AlertComposer({
  onBuild, pending, testID = 'alert-composer',
}: { onBuild: (text: string) => void; pending: boolean; testID?: string }) {
  const [value, setValue] = useState('');
  const can = value.trim().length > 2 && !pending;

  return (
    <LinearGradient
      testID={testID}
      colors={gradient.kaiCard as unknown as readonly [string, string, ...string[]]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 9,
        height: 46, paddingLeft: 15, paddingRight: 6,
        borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.violet45,
      }}
    >
      <KaiOrb size={20} glow={false} />
      <TextInput
        testID="alert-nl-input"
        accessibilityLabel="Describe the alert in your own words"
        value={value}
        onChangeText={setValue}
        onSubmitEditing={() => { if (can) { onBuild(value.trim()); } }}
        placeholder="Tell me when TSLA drops below 170…"
        placeholderTextColor={color.muted}
        returnKeyType="go"
        style={{
          flex: 1, fontFamily: family.regular, fontSize: 13, color: color.text,
          ...(({ outlineStyle: 'none' } as unknown) as object),
        }}
      />
      <Pressable
        testID="alert-nl-read"
        accessibilityRole="button"
        accessibilityLabel="Read it back"
        accessibilityState={{ disabled: !can, busy: pending }}
        disabled={!can}
        onPress={() => { onBuild(value.trim()); }}
        style={({ pressed }) => ({
          height: 34, paddingHorizontal: 13, borderRadius: radius.pill,
          backgroundColor: color.volt, alignItems: 'center', justifyContent: 'center',
          opacity: can ? (pressed ? 0.82 : 1) : 0.45,
        })}
      >
        <T size={12} weight="bold" c={color.bg}>{pending ? 'Reading…' : 'Read it'}</T>
      </Pressable>
    </LinearGradient>
  );
}

export { Eyebrow };
