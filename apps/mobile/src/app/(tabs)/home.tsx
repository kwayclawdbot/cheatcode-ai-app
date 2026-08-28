import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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
import {
  AlsoWatching, ConversationsDrawer, PriorityObject, useConversations, useHomeV5, usePriorityCandles,
} from '../../features/home';
import { MODE_LABEL } from '../../features/account/profile';
import { useSession } from '../../lib/session';
import { useKaiWall } from '../../lib/useKai';
import { alpha } from '../../ui/tokens';
import type { ConversationRow, GoalMode, WallItem } from '../../lib/types';

const Hamburger = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel="Conversations"
    testID="home-threads-open"
    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
  >
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M4 6h16M4 12h16M4 18h10" stroke={color.text} strokeWidth={2} />
    </Svg>
  </Pressable>
);

const NewThread = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel="New conversation"
    testID="home-thread-new"
    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
  >
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color.volt} strokeWidth={2} />
    </Svg>
  </Pressable>
);

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
  /** Mode is set in onboarding and changed on the Account board (Kai profile). */
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const { data, error, isFixture } = useHomeV5(mode);
  const threads = useConversations();
  const [threadsOpen, setThreadsOpen] = useState(false);
  /** Which conversation the workspace is showing. 'today' carries the
   *  priority object as its opening object; the others do not. */
  const [thread, setThread] = useState<{ kind: 'today' } | { kind: 'new' } | { kind: 'saved'; row: ConversationRow }>({ kind: 'today' });
  const [threadNonce, setThreadNonce] = useState(0);
  const activeThread = thread.kind === 'saved' ? thread.row : null;
  const priorityCandles = usePriorityCandles(data?.priority?.symbol, data?.priority?.candles ?? []);
  const scroller = useRef<ScrollView | null>(null);

  /**
   * The conversation below the priority. It opens with the briefing — the
   * detail the user can read if they want it — and then behaves exactly like
   * the wall it always was.
   */
  const seed = useMemo<WallItem[]>(() => {
    // Opening an older conversation replaces today's opening object with that
    // thread — Kai picks it up rather than pretending it is this morning.
    if (thread.kind === 'saved') {
      return [{ kind: 'notice', id: `thread-${thread.row.id}-${threadNonce}`, text: `Picking up “${thread.row.title}”. Ask me anything about it.` }];
    }
    if (thread.kind === 'new') {
      return [{ kind: 'notice', id: `thread-new-${threadNonce}`, text: 'New conversation. Ask me about a symbol, a setup or your rules.' }];
    }
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
  }, [data, mode, thread, threadNonce]);

  const { items, send, streaming } = useKaiWall(mode, seed);

  const seedCount = seed.length;
  useEffect(() => {
    if (items.length <= seedCount) return;
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [items, seedCount]);

  const market = data?.market;

  /** The daily conversation is titled by the API; this is the local fallback. */
  const todayTitle = useMemo(
    () => `Morning Briefing · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    [],
  );

  const newThread = () => {
    setThread({ kind: 'new' });
    setThreadNonce((n) => n + 1);
    setThreadsOpen(false);
  };

  const openThread = (row: ConversationRow) => {
    setThread(row.title === todayTitle ? { kind: 'today' } : { kind: 'saved', row });
    setThreadNonce((n) => n + 1);
    setThreadsOpen(false);
  };

  return (
    <Screen variant="corner" layout="tab" testID="screen-home">
      {/* 1 — the conversation's own header: drawer · title · new thread */}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 11,
          paddingTop: 8, paddingHorizontal: 16, paddingBottom: 8,
          borderBottomWidth: 1, borderBottomColor: alpha.ivory07,
        }}
      >
        <Hamburger onPress={() => setThreadsOpen(true)} />
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <T size={14} weight="semibold" numberOfLines={1} testID="home-thread-title">
            {thread.kind === 'saved' ? thread.row.title : thread.kind === 'new' ? 'New conversation' : todayTitle}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: market?.status === 'open' ? color.cyan : color.muted }} />
            <T size={10} c={color.muted}>{market?.label ?? 'Checking the market…'}</T>
            <T size={10} c={color.dim}>·</T>
            <T size={10} weight="semibold" c={color.volt} testID="home-mode">{MODE_LABEL[mode]}</T>
            {market ? <FreshnessMark freshness={market.freshness} size={10} testID="market-freshness" /> : null}
          </View>
        </View>
        <NewThread onPress={newThread} />
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
        {thread.kind === 'today' ? (
        <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <KaiOrb size={32} />
          <T size={19} weight="semibold" lh={26} ls={-0.2} style={{ flex: 1, paddingTop: 2 }} testID="opening-line">
            {data?.opening_line ?? 'Reading the tape…'}
          </T>
        </View>
        ) : null}

        {/* 3 + 4 — the one object and the one action (today's thread only) */}
        {thread.kind === 'today' && data?.priority ? (
          <PriorityObject priority={data.priority} candles={priorityCandles} />
        ) : thread.kind === 'today' && data ? (
          <ObjectCard r={radius.xxl} style={{ padding: 16, gap: 6 }} testID="home-priority-empty">
            <T size={15} weight="bold">Nothing needs a decision right now.</T>
            <T size={13} lh={19} c={color.muted}>
              Kai is watching your list. Ask a question below, or open Trade to look at something new.
            </T>
          </ObjectCard>
        ) : null}

        {/* 5 — secondary rows, no card weight */}
        {thread.kind === 'today' && data ? <AlsoWatching rows={data.also_watching} /> : null}

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
        <Composer placeholder="Message Kai…" onSend={send} disabled={streaming} />
      </View>

      <ConversationsDrawer
        visible={threadsOpen}
        onClose={() => setThreadsOpen(false)}
        pinned={threads.data.pinned}
        recent={threads.data.recent}
        q={threads.q}
        onQuery={threads.setQ}
        activeId={activeThread?.id ?? null}
        onOpen={openThread}
        onPin={(row) => { void threads.togglePin(row.id); }}
        onNew={newThread}
        loading={threads.loading}
      />
    </Screen>
  );
}
