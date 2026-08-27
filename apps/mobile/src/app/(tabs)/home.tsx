import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { KaiBubble, UserBubble, TypingDots } from '../../ui/Bubble';
import { BriefingCard } from '../../ui/Briefing';
import { RichText } from '../../ui/RichText';
import { SetupObject } from '../../ui/SetupObject';
import { ObjectCard } from '../../ui/Panel';
import { Composer } from '../../ui/Composer';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { Bolt } from '../../ui/Icons';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { fixtureHome } from '../../lib/fixtures';
import { useSession } from '../../lib/session';
import { useKaiWall } from '../../lib/useKai';
import type { GoalMode, HomePayload, WallItem } from '../../lib/types';

const MODE_LABEL: Record<GoalMode, string> = { day_trade: 'Day Trade', swing: 'Swing', invest: 'Invest' };

const DAY = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/**
 * V3-H1-Glance-home.html — the primary screen.
 * mode chip + market status + freshness / Kai's conversation wall (briefing
 * object, lead graded setup, your turns, typing indicator) / composer.
 */
export default function Home() {
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const [data, setData] = useState<HomePayload | null>(api.available() ? null : fixtureHome);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scroller = useRef<ScrollView | null>(null);

  useEffect(() => {
    let alive = true;
    if (!api.available()) return;
    api.home(mode)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) { setLoadError(e instanceof Error ? e.message : 'Could not load your briefing.'); setData(fixtureHome); } });
    return () => { alive = false; };
  }, [mode]);

  const seed = useMemo<WallItem[]>(() => {
    if (!data) return [];
    const out: WallItem[] = [];
    if (data.briefing?.headline) out.push({ kind: 'kai_text', id: 'seed-headline', text: data.briefing.headline });
    if (data.briefing) out.push({ kind: 'briefing', id: 'seed-briefing', briefing: data.briefing });
    else if (data.degraded) out.push({ kind: 'notice', id: 'seed-degraded', text: data.degraded_reason ?? "I couldn't put a report together this morning. Nothing below is made up — I'll try again shortly." });
    if (mode === 'invest') {
      out.push({
        kind: 'notice',
        id: 'seed-invest',
        text: data.invest_notice ?? 'Managed Investing is coming in a later release. Everything you see below still works today — grading, alerts and paper practice.',
      });
    }
    if (data.lead_setup && mode !== 'invest') out.push({ kind: 'setup', id: 'seed-setup', setup: data.lead_setup });
    return out;
  }, [data, mode]);

  const { items, send, streaming } = useKaiWall(mode, seed);

  // On first open the briefing IS the screen, so the wall stays at the top.
  // Auto-scroll only kicks in once the conversation has grown past the seed.
  const seedCount = seed.length;
  useEffect(() => {
    if (items.length <= seedCount) return;
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [items, seedCount]);

  const market = data?.market;
  const today = DAY[new Date().getDay()];

  return (
    <Screen variant="corner" layout="tab" testID="screen-home">
      {/* mode chip + market status + freshness */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
        <LinearGradient
          testID="mode-chip"
          colors={gradient.modeChip as unknown as readonly [string, string, ...string[]]}
          start={gradientAngle.start}
          end={gradientAngle.end}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.volt55 }}
        >
          <Bolt size={13} color={color.volt} />
          <T size={13} weight="semibold" c={color.volt}>{MODE_LABEL[mode]}</T>
        </LinearGradient>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: market?.status === 'open' ? color.green : color.muted }} />
          <T size={12} c={color.muted}>{market?.label ?? 'Checking the market…'}</T>
          {market ? <T size={12} c={color.dim}>·</T> : null}
          {market ? <FreshnessMark freshness={market.freshness} size={12} testID="market-freshness" /> : null}
        </View>
      </View>

      {/* conversation wall */}
      <ScrollView
        ref={scroller}
        testID="kai-wall"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 16, gap: 11, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <T size={10} align="center" ls={0.6} c={color.muted}>{`${today} · FIRST OPEN OF THE DAY`}</T>

        {items.length === 0 ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <KaiOrb size={30} />
            <TypingDots />
          </View>
        ) : null}

        {items.map((it, i) => {
          const prev = items[i - 1];
          const needsOrb = it.kind !== 'user_text' && (!prev || prev.kind === 'user_text');
          const indent = it.kind === 'user_text' ? 0 : 40; // orb 30 + gap 10

          if (it.kind === 'user_text') return <UserBubble key={it.id}>{it.text}</UserBubble>;

          const body =
            it.kind === 'kai_text' ? (
              <KaiBubble style={{ flexShrink: 1 }}>
                <RichText text={it.streaming ? `${it.text}▍` : it.text} size={14} lh={20} />
              </KaiBubble>
            ) : it.kind === 'briefing' ? (
              <BriefingCard briefing={it.briefing} />
            ) : it.kind === 'setup' ? (
              <SetupObject setup={it.setup} testID="lead-setup" />
            ) : it.kind === 'typing' ? (
              <TypingDots testID="typing" />
            ) : (
              <ObjectCard tone="kai" r={radius.xl} style={{ padding: 13 }}>
                <T size={13} lh={19} c={color.violetLight}>{it.text}</T>
              </ObjectCard>
            );

          return (
            <View key={it.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              {needsOrb ? <KaiOrb size={30} /> : <View style={{ width: indent - 10 }} />}
              <View style={{ flex: 1 }}>{body}</View>
            </View>
          );
        })}

        {loadError ? <T size={11} c={color.muted} align="center">{loadError}</T> : null}
      </ScrollView>

      <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6 }}>
        <Composer placeholder="Ask Kai…" onSend={send} disabled={streaming} />
      </View>
    </Screen>
  );
}
