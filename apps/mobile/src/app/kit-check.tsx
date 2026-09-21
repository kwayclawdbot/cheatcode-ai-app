/**
 * `/kit-check` — the redesign kit on one screen, in the real app.
 *
 * Every token and shared component from the 2026-09-21 redesign
 * (docs/design/redesign-2026-09-21), rendered by the running app on the real
 * fonts and the member's real text size, so a screen lane can see what it is
 * composing with and the owner can check the foundation against the boards.
 * The values shown are illustrative labels for the components, not market data.
 *
 * DEV / FIXTURES ONLY, like `/design-check` and `/stage-check`.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { env } from '../lib/env';
import {
  AppBar, Button, Card, CardStack, ContextChip, Divider, GradeBadge, IconButton, Pill,
  PriceTriplet, SectionTabs, SegmentedControl, StatusChip, T, Num,
  color, layout, palette, typeScale, type TextVariant,
} from '../ui/kit';
import { Bell, Search, Bars } from '../ui/Icons';
import { gradeBand } from '../features/grade/bands';

const SWATCHES: Array<[string, string]> = [
  ['Canvas', palette.canvas], ['Surface', palette.surface], ['Raised', palette.raised],
  ['Text primary', palette.textPrimary], ['Text secondary', palette.textSecondary],
  ['Brand orange', palette.orange], ['Orange light', palette.orangeLight], ['Kai violet', palette.violet],
  ['Market up', palette.positive], ['Market down', palette.negative], ['Grade gold', palette.gold],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <T variant="sectionTitle">{title}</T>
      {children}
    </View>
  );
}

export default function KitCheck() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'day' | 'swing' | 'invest'>('swing');
  const [tab, setTab] = useState<'active' | 'community' | 'history'>('active');
  if (!env.FIXTURES && !env.DEV_TOOLS) {
    return (
      <View style={{ flex: 1, backgroundColor: color.canvas, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <T c={color.textSecondary} align="center">This harness only runs in a development build.</T>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }} testID="screen-kit-check">
      <AppBar
        title="Kit check"
        status={{ text: 'Redesign foundation 2026-09-21', live: true }}
        actions={<>
          <IconButton accessibilityLabel="Search" icon={<Search size={22} color={color.textPrimary} strokeWidth={1.75} />} />
          <IconButton accessibilityLabel="Alerts" badge icon={<Bell size={22} color={color.textPrimary} strokeWidth={1.75} />} />
        </>}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingBottom: 48, gap: 32 }}>
        <Section title="Colour">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SWATCHES.map(([name, hex]) => (
              <View key={name} style={{ width: '31%', gap: 4 }}>
                <View style={{ height: 40, borderRadius: 10, backgroundColor: hex, borderWidth: 1, borderColor: color.textSecondary + '33' }} />
                <T variant="meta">{name}</T>
                <Num variant="meta" weight="regular" c={color.textSecondary}>{hex}</Num>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Type">
          {(Object.keys(typeScale) as TextVariant[]).map((v) => (
            <View key={v} style={{ gap: 2 }}>
              <T variant="meta" c={color.textSecondary}>{`${v} · ${typeScale[v].size}/${typeScale[v].lh}${typeScale[v].mono ? ' · Geist Mono' : ''}`}</T>
              {typeScale[v].mono ? <Num variant={v}>24.40</Num> : <T variant={v}>Clear, decisive, human.</T>}
            </View>
          ))}
        </Section>

        <Section title="Controls">
          <SegmentedControl
            options={[{ key: 'day', label: 'Day Trade' }, { key: 'swing', label: 'Swing' }, { key: 'invest', label: 'Invest' }]}
            value={mode}
            onChange={setMode}
            testID="kit-mode"
          />
          <SectionTabs
            tabs={[{ key: 'active', label: 'Active', count: 12 }, { key: 'community', label: 'Community', count: 1 }, { key: 'history', label: 'History', count: 30 }]}
            value={tab}
            onChange={setTab}
            testID="kit-tabs"
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ContextChip label="Watchlist" onPress={() => {}} />
            <ContextChip label="Technicals" icon={<Bars size={16} color={color.textPrimary} strokeWidth={1.75} />} onPress={() => {}} />
            <ContextChip label="Explain the thesis" tone="kai" onPress={() => {}} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <StatusChip label="Entry triggered" tone="up" />
            <StatusChip label="Watching resistance" tone="neutral" />
            <StatusChip label="Stopped out" tone="down" />
            <Pill label="Swing · Long" />
            <Pill label="Kai" tone="kai" />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <GradeBadge grade="A+" score={92} />
            <GradeBadge grade="A" score={85} />
            <GradeBadge grade="B" score={72} />
            <GradeBadge grade="C" score={55} />
            <GradeBadge grade="Pass" score={20} />
          </View>
          <Button label="Review setup" arrow onPress={() => {}} />
          <Button label="Morning briefing" kind="outline" onPress={() => {}} />
        </Section>

        <Section title="Cards">
          <CardStack>
            <Card priority edge={gradeBand('A', 85).edge} testID="kit-card-priority">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <T variant="cardTitle">Priority card</T>
                <GradeBadge grade="A" score={85} size="sm" />
              </View>
              <T variant="meta" c={color.textSecondary} style={{ marginTop: 4 }}>Orange edge glow: one card per screen</T>
              <Divider style={{ marginVertical: 12 }} />
              <PriceTriplet entry={24.4} stop={22.37} target={30.49} r={3} />
            </Card>
            <Card edge={gradeBand('B', 72).edge}>
              <T variant="cardTitle">Standard card, grade edge</T>
              <T variant="body" c={color.textSecondary}>Flat surface, 1px border, radius 18, 16 inside.</T>
            </Card>
            <Card tone="kai">
              <T variant="cardTitle" c={color.kaiInk}>Kai card</T>
              <T variant="body">Violet outline and glow only when Kai is speaking.</T>
            </Card>
          </CardStack>
        </Section>
      </ScrollView>
    </View>
  );
}
