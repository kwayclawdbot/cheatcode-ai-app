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

export function OverviewBody({
  overview, activeAlert, onViewAlert,
}: {
  overview: TickerPage['overview'];
  activeAlert: TickerPage['active_alert'];
  onViewAlert: () => void;
}) {
  return (
    <View style={{ paddingTop: 4, paddingBottom: 13, gap: 9 }} testID="ticker-overview-body">
      {overview.summary ? <T size={12.5} c={color.muted} lh={19}>{overview.summary}</T> : null}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat label="Market cap" value={overview.market_cap ?? '—'} />
          <Stat label="Next earnings" value={overview.next_earnings ?? '—'} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat label="P/E" value={overview.pe ?? '—'} />
          <Stat label="Sector" value={overview.sector ?? '—'} mono={false} />
        </View>
      </View>
      {activeAlert ? (
        <View
          testID="ticker-active-alert"
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10,
            borderRadius: 10, backgroundColor: alpha.gradeGold07, borderWidth: 0.5, borderColor: alpha.gradeGold55,
          }}
        >
          <T size={11.5} weight="bold" c={color.gradeGold}>{activeAlert.grade}</T>
          <T size={11.5} c={color.muted} style={{ flex: 1 }}>{activeAlert.line}</T>
          <Pressable onPress={onViewAlert} accessibilityRole="button" testID="ticker-view-alert">
            <T size={11.5} weight="semibold" c={color.volt}>View</T>
          </Pressable>
        </View>
      ) : null}
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
      <T size={12} c={color.muted}>
        Most-mentioned level <Num size={12} c={color.cyan}>{community.common_level ?? '—'}</Num>
        {community.posts_today != null ? ` · ${community.posts_today} posts today` : ''}
      </T>
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
  page, onViewAlert, onOpenCircle,
}: { page: TickerPage; onViewAlert: () => void; onOpenCircle: () => void }) {
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
        <OverviewBody overview={page.overview} activeAlert={page.active_alert ?? null} onViewAlert={onViewAlert} />
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
