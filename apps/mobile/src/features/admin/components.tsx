import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { NotConnected, ScreenLoading } from '../../ui/Loading';
import { ChipRail } from '../../ui/Segmented';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ShareBar } from '../../ui/DataRow';
import { alpha, color, space } from '../../ui/tokens';
import { statusLabel, statusTone } from './format';
import type { CrmStatus } from '../../lib/types';

/**
 * THE OPERATOR'S DOOR IS A ROOM IN THE SAME BUILDING.
 *
 * Every board below is `Screen` + `StackHeader` + a `ChipRail` + the app's own
 * `ScreenLoading` and `NotConnected` — the same components, the same 16px
 * gutter, the same corner wash, the same cross-fade. Nothing here is an admin
 * theme; the density comes from the type scale and from hairlines, which is
 * the only thing that changes between this and the Account board.
 *
 * The rail is `ChipRail` in its volt tone because moving between boards is the
 * OPERATOR'S OWN ACTION, which is what volt means in this palette. Kai is not
 * in this part of the app at all, so violet never appears here.
 */
export type BoardKey = 'overview' | 'people' | 'invites' | 'sources' | 'audit';

const BOARDS: { key: BoardKey; label: string; route: string }[] = [
  { key: 'overview', label: 'Overview', route: '/admin' },
  { key: 'people', label: 'People', route: '/admin/people' },
  { key: 'invites', label: 'Invites', route: '/admin/invites' },
  { key: 'sources', label: 'Sources', route: '/admin/sources' },
  { key: 'audit', label: 'Audit', route: '/admin/audit' },
];

export function Board({
  title, subtitle, right, current, loading, notAvailable, error, empty, children, testID, onBack,
}: {
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
  current: BoardKey;
  loading?: boolean;
  notAvailable?: boolean;
  error?: string | null;
  /** True when the request succeeded and there is genuinely nothing yet. */
  empty?: string | null;
  children?: React.ReactNode;
  testID: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <Screen variant="corner" layout="tab" testID={testID}>
      <StackHeader title={title} subtitle={subtitle} right={right} onBack={onBack} />

      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <ChipRail
          testID="admin-rail"
          options={BOARDS.map((b) => ({ key: b.key, label: b.label }))}
          value={current}
          onChange={(k) => {
            const b = BOARDS.find((x) => x.key === k);
            if (b) router.replace(b.route as never);
          }}
        />
      </View>

      {loading ? (
        <ScreenLoading label="Reading the ledger…" />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: space.x14 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          testID={`${testID}-body`}
        >
          {notAvailable ? (
            <NotConnected what="The operator's board" />
          ) : (
            <>
              {children}
              {empty ? <T size={12.5} c={color.muted} lh={19}>{empty}</T> : null}
              {error ? <T size={11.5} c={color.muted} align="center">{error}</T> : null}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

/** A section label in the app's own eyebrow treatment. Never a card heading. */
export function Section({ label, note, children }: { label: string; note?: string | null; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Eyebrow>{label}</Eyebrow>
      {note ? <T size={11.5} c={color.dim} lh={17} style={{ marginBottom: 2 }}>{note}</T> : null}
      <View>{children}</View>
    </View>
  );
}

/**
 * STATE, IN TYPE. Not a pill, not green, not red — an uppercase mono token
 * that leans on weight and `muted`/`dim` the way the palette grammar requires
 * of anything that is not money (brief §9).
 */
export function StatusMark({ status, size = 10 }: { status: CrmStatus; size?: number }) {
  const t = statusTone(status);
  return (
    <Num size={size} weight={t.weight === 'regular' ? 'medium' : t.weight} c={t.c}>
      {statusLabel(status).toUpperCase()}
    </Num>
  );
}

/** The funnel as rules, not as boxes: one line per stage, widths in proportion. */
export function FunnelRow({
  status, people, share, onPress, last,
}: { status: CrmStatus; people: number; share: number; onPress?: () => void; last?: boolean }) {
  const t = statusTone(status);
  const body = (
    <View style={{
      gap: 6, paddingVertical: space.x10,
      borderBottomWidth: last ? 0 : 0.5, borderBottomColor: alpha.ivory08,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <T size={13} weight={t.weight === 'bold' ? 'bold' : 'regular'} c={t.c} style={{ flex: 1 }}>
          {statusLabel(status)}
        </T>
        <Num size={14} weight="semibold" c={t.c}>{people.toLocaleString('en-US')}</Num>
      </View>
      <ShareBar share={share} tone={status === 'paying' ? alpha.ivory25 : alpha.ivory12} />
    </View>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${statusLabel(status)}, ${people} people`}
      testID={`funnel-${status}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  ) : <View testID={`funnel-${status}`}>{body}</View>;
}

/**
 * Thirty days of arrivals, drawn as columns of the same hairline the rows use.
 * No axis, no gridlines, no legend box — the two numbers under it are the
 * legend, and the tallest day is labelled because that is the only value a
 * reader can otherwise not recover from the shape.
 */
export function DailyBars({ rows }: { rows: { day: string; signups: number; leads: number }[] }) {
  const series = [...rows].reverse();
  const peak = Math.max(1, ...series.map((r) => r.signups + r.leads));
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 54 }} testID="admin-daily">
        {series.map((r) => {
          const total = r.signups + r.leads;
          return (
            <View key={r.day} style={{ flex: 1, justifyContent: 'flex-end', gap: 1 }}>
              {r.leads ? (
                <View style={{ height: Math.max(1, (r.leads / peak) * 46), backgroundColor: alpha.ivory12 }} />
              ) : null}
              {r.signups ? (
                <View style={{ height: Math.max(1, (r.signups / peak) * 46), backgroundColor: alpha.ivory25 }} />
              ) : (
                total === 0 ? <View style={{ height: 1, backgroundColor: alpha.ivory06 }} /> : null
              )}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Num size={10} weight="regular" c={color.dim}>{series[0]?.day ?? ''}</Num>
        <T size={10} c={color.dim}>
          {`${series.reduce((n, r) => n + r.signups, 0)} signed up · ${series.reduce((n, r) => n + r.leads, 0)} leads · peak ${peak} in a day`}
        </T>
        <Num size={10} weight="regular" c={color.dim}>{series[series.length - 1]?.day ?? ''}</Num>
      </View>
    </View>
  );
}
