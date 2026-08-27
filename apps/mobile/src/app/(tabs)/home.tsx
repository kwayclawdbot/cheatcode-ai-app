import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView } from 'react-native';
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
import { color, radius } from '../../ui/tokens';
import { AlsoWatching, ModeControl, PriorityObject, useHomeV5, usePriorityCandles } from '../../features/home';
import { useSession } from '../../lib/session';
import { useKaiWall } from '../../lib/useKai';
import type { GoalMode, WallItem } from '../../lib/types';

/**
 * Home — V5-H1-Home-priority.html.
 *
 * The V5 hierarchy, in order and nothing above it (audit §4):
 *   1  mode chip (global context) + market status + freshness
 *   2  Kai's short opening line — what changed and why it matters
 *   3  ONE dominant priority object
 *   4  ONE primary action, state-driven
 *   5  compact "Also watching" rows
 *   6  the persistent composer
 * The morning report is no longer the top of the screen: it is seeded into the
 * conversation BELOW the priority, where the rest of the briefing belongs.
 */
export default function Home() {
  const { profile } = useSession();
  const [modeOverride, setModeOverride] = useState<GoalMode | null>(null);
  const mode: GoalMode = modeOverride ?? (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const { data, error, isFixture } = useHomeV5(mode);
  const priorityCandles = usePriorityCandles(data?.priority?.symbol, data?.priority?.candles ?? []);
  const scroller = useRef<ScrollView | null>(null);

  /**
   * The conversation below the priority. It opens with the briefing — the
   * detail the user can read if they want it — and then behaves exactly like
   * the wall it always was.
   */
  const seed = useMemo<WallItem[]>(() => {
    if (!data) return [];
    const out: WallItem[] = [];
    if (data.briefing) out.push({ kind: 'briefing', id: 'seed-briefing', briefing: data.briefing });
    else if (data.degraded) {
      out.push({
        kind: 'notice',
        id: 'seed-degraded',
        text: data.degraded_reason ?? "I couldn't put a report together this morning. Nothing below is made up — I'll try again shortly.",
      });
    }
    if (mode === 'invest') {
      out.push({
        kind: 'notice',
        id: 'seed-invest',
        text: data.invest_notice ?? 'Managed Investing is coming in a later release. Everything you see here still works today — grading, alerts and paper practice.',
      });
    }
    return out;
  }, [data, mode]);

  const { items, send, streaming } = useKaiWall(mode, seed);

  const seedCount = seed.length;
  useEffect(() => {
    if (items.length <= seedCount) return;
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [items, seedCount]);

  const market = data?.market;

  return (
    <Screen variant="corner" layout="tab" testID="screen-home">
      {/* 1 — mode is visible global context (audit §10) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingHorizontal: 16, paddingBottom: 6 }}>
        <ModeControl mode={mode} onChanged={setModeOverride} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: market?.status === 'open' ? color.green : color.muted }} />
          <T size={12} c={color.muted}>{market?.label ?? 'Checking the market…'}</T>
          {market ? <T size={12} c={color.dim}>·</T> : null}
          {market ? <FreshnessMark freshness={market.freshness} size={12} testID="market-freshness" /> : null}
        </View>
      </View>

      <ScrollView
        ref={scroller}
        testID="kai-wall"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 6, paddingHorizontal: 16, gap: 14, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 2 — Kai's opening line */}
        <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <KaiOrb size={32} />
          <T size={19} weight="semibold" lh={26} ls={-0.2} style={{ flex: 1, paddingTop: 2 }} testID="opening-line">
            {data?.opening_line ?? 'Reading the tape…'}
          </T>
        </View>

        {/* 3 + 4 — the one object and the one action */}
        {data?.priority ? (
          <PriorityObject priority={data.priority} candles={priorityCandles} />
        ) : data ? (
          <ObjectCard r={radius.xxl} style={{ padding: 16, gap: 6 }} testID="home-priority-empty">
            <T size={15} weight="bold">Nothing needs a decision right now.</T>
            <T size={13} lh={19} c={color.muted}>
              Kai is watching your list. Ask a question below, or open Trade to look at something new.
            </T>
          </ObjectCard>
        ) : null}

        {/* 5 — secondary rows, no card weight */}
        {data ? <AlsoWatching rows={data.also_watching} /> : null}

        {/* the conversation: the briefing detail and every answer since */}
        {items.map((it, i) => {
          const prev = items[i - 1];
          const needsOrb = it.kind !== 'user_text' && (!prev || prev.kind === 'user_text');

          if (it.kind === 'user_text') return <UserBubble key={it.id}>{it.text}</UserBubble>;

          const body =
            it.kind === 'kai_text' ? (
              <KaiBubble style={{ flexShrink: 1 }}>
                <RichText text={it.streaming ? `${it.text}▍` : it.text} size={14} lh={20} />
              </KaiBubble>
            ) : it.kind === 'briefing' ? (
              <BriefingCard briefing={it.briefing} />
            ) : it.kind === 'setup' ? (
              <SetupObject setup={it.setup} testID="wall-setup" />
            ) : it.kind === 'typing' ? (
              <TypingDots testID="typing" />
            ) : it.kind === 'action' ? (
              <ObjectCard tone="kai" r={radius.xl} style={{ padding: 13 }}>
                <T size={13} lh={19} c={color.violetLight}>{it.action.summary_plain ?? it.action.label}</T>
              </ObjectCard>
            ) : (
              <ObjectCard tone="kai" r={radius.xl} style={{ padding: 13 }}>
                <T size={13} lh={19} c={color.violetLight}>{it.text}</T>
              </ObjectCard>
            );

          return (
            <View key={it.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              {needsOrb ? <KaiOrb size={30} /> : <View style={{ width: 30 }} />}
              <View style={{ flex: 1 }}>{body}</View>
            </View>
          );
        })}

        {error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample data — the service is not connected here.</T> : null}
      </ScrollView>

      {/* 6 — the composer never moves */}
      <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6 }}>
        <Composer placeholder="Ask Kai anything…" onSend={send} disabled={streaming} />
      </View>
    </Screen>
  );
}
