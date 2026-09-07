import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradientAngle, radius } from '../../ui/tokens';
import { T, Num } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { MeterRow } from '../grade';
import type { TickerPage } from '../../lib/types';

/** Collapsible section row — chevron rotates, content is a plain block. */
export function Collapsible({
  title, open, onToggle, children, last = false, testID,
}: {
  title: string; open: boolean; onToggle: () => void;
  children?: React.ReactNode; last?: boolean; testID?: string;
}) {
  return (
    <>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        testID={testID}
        style={{
          flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
          borderBottomWidth: last && open ? 0 : 0.5, borderBottomColor: alpha.ivory08,
        }}
      >
        <T size={13.5} weight="semibold" style={{ flex: 1 }}>{title}</T>
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Path d="M6 9l6 6 6-6" stroke={color.muted} strokeWidth={2} />
        </Svg>
      </Pressable>
      {open ? children : null}
    </>
  );
}

function Stat({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: alpha.ivory04 }}>
      <T size={9.5} c={color.muted}>{label}</T>
      {mono
        ? <Num size={12.5} weight="semibold" style={{ marginTop: 2 }}>{value}</Num>
        : <T size={12.5} weight="semibold" style={{ marginTop: 2 }}>{value}</T>}
    </View>
  );
}

/**
 * The stats we actually have, two to a row.
 *
 * Takes the whole list and drops the empties before pairing, so the layout is
 * decided by how many values exist rather than by which of four fixed slots
 * happened to be filled. One stat renders as one full-width tile; three render
 * as a pair and a single; none renders nothing.
 */
function StatGrid({ stats }: { stats: { label: string; value?: string | null; mono?: boolean }[] }) {
  const have = stats.filter((s) => typeof s.value === 'string' && s.value.trim() !== '');
  if (!have.length) return null;
  const rows: typeof have[] = [];
  for (let i = 0; i < have.length; i += 2) rows.push(have.slice(i, i + 2));
  return (
    <View style={{ gap: 8 }} testID="ticker-stat-grid">
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          {row.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value as string} mono={s.mono ?? true} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Kai's view — the short take plus the three question chips. */
export function KaiView({ take, actions, onAsk }: { take: string; actions: string[]; onAsk: (q?: string) => void }) {
  return (
    <LinearGradient
      colors={[alpha.violet18, alpha.surface70]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{ borderRadius: radius.xl, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 0.5, borderColor: alpha.violet45, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}
      testID="ticker-kai-view"
    >
      <KaiOrb size={22} glow={false} />
      <View style={{ flex: 1, gap: 8 }}>
        <T size={13} lh={19}>
          <T size={13} weight="bold" c={color.violetLight}>Kai's view</T>
          <T size={13} c={color.muted}> · </T>
          {take}
        </T>
        <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
          {actions.map((a, i) => (
            <Pressable
              key={a}
              onPress={() => onAsk(i === 0 ? undefined : a)}
              accessibilityRole="button"
              testID={`ticker-kai-action-${i}`}
              style={{
                paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 0.5,
                borderColor: i === 0 ? alpha.violet50 : alpha.ivory20,
                backgroundColor: i === 0 ? alpha.violet08 : 'transparent',
              }}
            >
              <T size={11} c={i === 0 ? color.violetLight : color.muted}>{a}</T>
            </Pressable>
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

/**
 * Overview — the reference half: what the company is, and the few numbers that
 * describe it rather than today.
 *
 * THE ACTIVE-ALERT STRIP THAT USED TO LIVE HERE IS GONE. It was a gold bar
 * reading "A− · A− · Ready · View" — the grade printed twice because `grade`
 * and the state label both start with it — tucked at the bottom of a collapsed
 * section. The same alert is now the "On the desk now" block at the top of the
 * page, with its levels, the line that ends the trade and a way into Trade. Two
 * renderings of one alert on one screen is worse than either alone, and the one
 * that lost is the one nobody could see without expanding a section first.
 */
export function OverviewBody({ overview }: { overview: TickerPage['overview'] }) {
  return (
    <View style={{ paddingTop: 4, paddingBottom: 13, gap: 9 }} testID="ticker-overview-body">
      {overview.summary ? <T size={12.5} c={color.muted} lh={19}>{overview.summary}</T> : null}
      {/*
        A BLANK NEVER LOOKS BLANK — it looks like a finding.
        These four were `?? '—'`, so a symbol whose fundamentals had not loaded
        showed four dashes in four boxes, which on a financial surface reads as
        "we checked and there is no P/E" rather than "we do not have this".
        A stat we do not have is not drawn, and a row with nothing in it is not
        drawn either, so the grid closes up instead of displaying its own gaps.
      */}
      <StatGrid
        stats={[
          { label: 'Market cap', value: overview.market_cap },
          { label: 'Next earnings', value: overview.next_earnings },
          { label: 'P/E', value: overview.pe },
          { label: 'Sector', value: overview.sector, mono: false },
        ]}
      />
    </View>
  );
}

export function TechnicalsBody({ technicals }: { technicals: TickerPage['technicals'] }) {
  return (
    <View style={{ paddingTop: 4, paddingBottom: 13, gap: 8 }} testID="ticker-technicals-body">
      {technicals.meters.map((m) => (
        <MeterRow key={m.label} label={m.label} status={m.status} strength={m.strength} width={78} />
      ))}
      {technicals.support || technicals.resistance ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
          {technicals.support ? (
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9, backgroundColor: color.cyanTint, borderWidth: 0.5, borderColor: alpha.cyan40 }}>
              <Num size={11} c={color.cyan}>{technicals.support}</Num>
            </View>
          ) : null}
          {technicals.resistance ? (
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9, backgroundColor: color.greenTint, borderWidth: 0.5, borderColor: alpha.green40 }}>
              <Num size={11} c={color.green}>{technicals.resistance}</Num>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function CommunityBody({
  community, onOpenCircle,
}: { community: TickerPage['community']; onOpenCircle: () => void }) {
  const bull = community.bullish_pct ?? 50;
  return (
    <View style={{ paddingBottom: 13, gap: 8 }} testID="ticker-community-body">
      {/*
        The same rule as the stat grid: "Most-mentioned level —" claims the room
        talked and settled on nothing. When there is no level, the sentence is
        simply not made.
      */}
      {community.common_level ? (
        <T size={12} c={color.muted}>
          Most-mentioned level <Num size={12} c={color.cyan}>{community.common_level}</Num>
          {community.posts_today != null ? ` · ${community.posts_today} posts today` : ''}
        </T>
      ) : community.posts_today != null ? (
        <T size={12} c={color.muted}>{community.posts_today} posts today</T>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' }}>
          <View style={{ width: `${bull}%`, backgroundColor: 'rgba(53,208,127,0.55)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(255,90,95,0.45)' }} />
        </View>
        <T size={10.5} c={color.muted}>
          {bull}% bullish{community.sample != null ? ` · sample ${community.sample}` : ''}
        </T>
      </View>
      {community.circle ? (
        <Pressable onPress={onOpenCircle} accessibilityRole="button" testID="ticker-open-circle">
          <T size={11.5} weight="semibold" c={color.violetLight}>{community.circle.label} ›</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The three collapsible sections in one bordered container. */
export function TickerSections({
  page, onOpenCircle,
}: { page: TickerPage; onOpenCircle: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ overview: true, technicals: false, community: false });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <LinearGradient
      colors={['rgba(255,247,232,0.055)', alpha.surface70]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{ borderRadius: radius.xl, borderWidth: 0.5, borderColor: alpha.ivory14, paddingHorizontal: 15, paddingVertical: 4 }}
      testID="ticker-sections"
    >
      <Collapsible title="Overview" open={open.overview} onToggle={() => toggle('overview')} testID="ticker-section-overview">
        <OverviewBody overview={page.overview} />
      </Collapsible>
      <Collapsible title="Technicals" open={open.technicals} onToggle={() => toggle('technicals')} testID="ticker-section-technicals">
        <TechnicalsBody technicals={page.technicals} />
      </Collapsible>
      <Collapsible title="Community" open={open.community} onToggle={() => toggle('community')} last testID="ticker-section-community">
        <CommunityBody community={page.community} onOpenCircle={onOpenCircle} />
      </Collapsible>
    </LinearGradient>
  );
}
