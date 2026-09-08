import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { KeyboardDock } from '../../ui/KeyboardDock';
import { color, radius } from '../../ui/tokens';
import {
  AlsoWatching, ConversationsDrawer, Wakeup, useConversations, useHomeV5, useWakeup,
} from '../../features/home';
import type { HomeFixture, WakeDirection } from '../../features/home';
import { DEFAULT_MODE } from '../../features/nav/second-tab';
import { useSession } from '../../lib/session';
import { useKaiWall } from '../../lib/useKai';
import { env } from '../../lib/env';
import { useMe } from '../../features/account/useAccount';
import { CreditStrip } from '../../features/account/credit-instruments';
import { fixtureCreditsCeiling, fixtureCreditsOut, fixtureCreditsWarning } from '../../lib/fixtures';
import { ContinueTrainingObject } from '../../features/training/HomeObject';
import { homeOrderFor, useStageEvolution } from '../../features/stage';
import type { ConversationRow, GoalMode, WallItem } from '../../lib/types';

const Hamburger = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel="Conversations"
    testID="home-threads-open"
    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 0.55 })}
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
    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 0.55 })}
  >
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color.volt} strokeWidth={2} />
    </Svg>
  </Pressable>
);

/**
 * Home — Kai chat, and Kai waking up.
 *
 * The owner's brief: "home should be kai chat with a relevant message on first
 * page load of the day … like jarvis in iron man waking up to give the most
 * relevant info or greeting and asking what direction to go."
 *
 * So the screen is one message and then a conversation. What used to sit above
 * it — a bordered header carrying a thread title, the market status and the
 * mode label, then a separate opening line, then a priority card, then a list
 * of also-watching rows — was four things competing before the first scroll.
 * UX.md is explicit: "One thing visible at a time on mobile. Don't stack five
 * panels," and "Kai is the protagonist."
 *
 * Everything that was in that header now either lives inside Kai's own
 * sentence (the market state), moved to where it is actually set (the mode, on
 * the Account board), or is one tap behind a direction Kai offers (the report,
 * the rest of the watchlist, the symbol itself). Nothing was deleted from the
 * product; it stopped being furniture.
 */
export default function Home() {
  const { profile, session, refreshProfile } = useSession();
  const router = useRouter();
  /** Mode is set in onboarding and changed on the Account board (Kai profile). */
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? DEFAULT_MODE;

  /**
   * What this member meets first (0042). Ordering only — Home draws the same
   * objects for everybody, and which one is at the top is the whole change.
   * The "Today's Beginner Pick" object the funnel note describes is a separate
   * lane with its own data behind it and is not built here.
   */
  const homeOrder = homeOrderFor(profile?.stage);
  // Training progress lives on the device, so the server cannot see a
  // graduation on its own. This reports the evidence and refreshes the profile
  // if the server decides it was worth a promotion — which is what makes the
  // ordering above change by itself.
  useStageEvolution(refreshProfile);

  /** Fixtures preview only — lets the owner and Playwright see the quiet day. */
  const params = useLocalSearchParams<{ fixture?: string; credits?: string }>();
  const fixture: HomeFixture =
    env.FIXTURES && (params.fixture === 'quiet' || params.fixture === 'down') ? params.fixture : 'default';

  const home = useHomeV5(mode, fixture);
  const { data, error, isFixture } = home;
  const threads = useConversations();
  const [threadsOpen, setThreadsOpen] = useState(false);
  /** Which conversation the workspace is showing. 'today' is the one Kai woke into. */
  const [thread, setThread] = useState<{ kind: 'today' } | { kind: 'new' } | { kind: 'saved'; row: ConversationRow }>({ kind: 'today' });
  const [threadNonce, setThreadNonce] = useState(0);
  const activeThread = thread.kind === 'saved' ? thread.row : null;
  const scroller = useRef<ScrollView | null>(null);

  /** Offers Kai has already answered — a pill must never become a no-op. */
  const [used, setUsed] = useState<string[]>([]);

  const wake = useWakeup({
    name: profile?.display_name,
    // The session id exists before the profile row does, so the day's greeting
    // is filed under the right person from the very first render.
    userKey: session?.user?.id ?? profile?.user_id ?? 'anon',
    home,
  });

  /**
   * The conversation below the wake-up.
   *
   * Today's thread starts EMPTY — the wake-up is the message, and the report
   * and the watchlist are behind Kai's own offers rather than dumped on open.
   * Opening another thread replaces it with that thread's opening notice.
   */
  const seed = useMemo<WallItem[]>(() => {
    if (thread.kind === 'saved') {
      return [{ kind: 'notice', id: `thread-${thread.row.id}-${threadNonce}`, text: `Picking up “${thread.row.title}”. Ask me anything about it.` }];
    }
    if (thread.kind === 'new') {
      return [{ kind: 'notice', id: `thread-new-${threadNonce}`, text: 'New conversation. Ask me about a symbol, a setup or your rules.' }];
    }
    if (mode === 'invest' && data) {
      return [{
        kind: 'notice',
        id: 'seed-invest',
        text: data.invest_notice ?? 'Your second tab is the research desk while you are in Invest mode — every name the desk argued for, and why. Kai placing trades for you is a later release; grading, alerts and paper practice work today.',
      }];
    }
    return [];
  }, [data, mode, thread, threadNonce]);

  const { items, send, append, streaming, credits, setCredits } = useKaiWall(mode, seed);

  /**
   * THE BALANCE, SEEDED ONCE AND THEN LIVE.
   *
   * `/me` already carries it, so opening Home knows the balance without a
   * request of its own. After that every reply carries the new one on the
   * stream, so the strip is never stale and never costs a round trip.
   *
   * `me.credits` is null on an API build that predates the credit system, and
   * the strip then draws nothing at all — which is right. A warning about an
   * allowance that does not exist would be an invented one.
   */
  const me = useMe();
  /**
   * Fixtures preview only: `?credits=warn|out|ceiling` puts the strip in the
   * state it is hard to reach on purpose. On a real stack the parameter does
   * nothing at all — the balance is whatever the server says it is.
   */
  const creditFixture = env.FIXTURES ? String(params.credits ?? '') : '';
  const meCredits = creditFixture === 'warn' ? fixtureCreditsWarning
    : creditFixture === 'out' ? fixtureCreditsOut
    : creditFixture === 'ceiling' ? fixtureCreditsCeiling
    : me.data?.credits ?? null;
  useEffect(() => {
    if (meCredits) setCredits((prev) => prev ?? meCredits);
  }, [meCredits, setCredits]);

  const seedCount = seed.length;
  useEffect(() => {
    if (items.length <= seedCount) return;
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [items, seedCount]);

  /**
   * Every offer has to land somewhere real. A route is the server's own action
   * route or a tab that exists; the two "show me the rest" offers are things
   * Kai already holds, so they drop straight into the conversation.
   */
  const onDirection = useCallback((d: WakeDirection) => {
    setUsed((u) => (u.includes(d.id) ? u : [...u, d.id]));
    if (d.kind === 'route') { router.push(d.route as never); return; }
    if (d.kind === 'retry') { wake.clear(); home.reload(); return; }
    if (d.kind === 'briefing' && data?.briefing) {
      append([
        { kind: 'kai_text', id: 'wake-brief-note', text: 'The full report, as I wrote it this morning.' },
        { kind: 'briefing', id: 'wake-briefing', briefing: data.briefing },
      ]);
      return;
    }
    if (d.kind === 'watching' && data?.also_watching.length) {
      append([
        { kind: 'kai_text', id: 'wake-watch-note', text: 'The rest of what I am keeping an eye on for you.' },
        { kind: 'watching', id: 'wake-watching', rows: data.also_watching },
      ]);
    }
  }, [append, data, home, router, wake]);

  /** The wake-up minus the offers already taken. */
  const wakeMessage = useMemo(() => {
    if (!wake.wakeup) return null;
    if (!used.length) return wake.wakeup;
    return { ...wake.wakeup, directions: wake.wakeup.directions.filter((d) => !used.includes(d.id)) };
  }, [wake.wakeup, used]);

  const newThread = () => {
    setThread({ kind: 'new' });
    setThreadNonce((n) => n + 1);
    setThreadsOpen(false);
  };

  const openThread = (row: ConversationRow) => {
    setThread({ kind: 'saved', row });
    setThreadNonce((n) => n + 1);
    setThreadsOpen(false);
  };

  const backToToday = () => {
    setThread({ kind: 'today' });
    setThreadNonce((n) => n + 1);
    setThreadsOpen(false);
  };

  /**
   * The training object, built once and drawn in exactly one of two places (see
   * `homeOrder`). It keeps the wall's 30px orb gutter so the left edge lines up
   * wherever it lands, and it stays gated on Today: scrolled back into an older
   * thread it would be an interruption from the present.
   *
   * `ContinueTrainingObject` belongs to the training lane and is untouched —
   * this only decides where it sits. It returns null while it is loading, so
   * nothing here may reserve space or draw a divider around it.
   */
  const trainingRow =
    thread.kind === 'today' ? (
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ width: 30 }} />
        <View style={{ flex: 1 }}><ContinueTrainingObject /></View>
      </View>
    ) : null;

  return (
    <Screen variant="corner" layout="tab" testID="screen-home">
      {/*
        The only chrome. Two dim controls and no bar: no rule, no title, no
        market chip, no mode label. A title appears ONLY when you are inside
        another conversation, because then you genuinely need to know which.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 4 }}>
        <Hamburger onPress={() => setThreadsOpen(true)} />
        {thread.kind === 'today' ? (
          <View style={{ flex: 1 }} />
        ) : (
          <Pressable
            testID="home-thread-title"
            accessibilityRole="button"
            accessibilityLabel={`${thread.kind === 'saved' ? thread.row.title : 'New conversation'}. Back to today.`}
            onPress={backToToday}
            style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.7 : 1 })}
          >
            <T size={13} weight="semibold" c={color.muted} numberOfLines={1} align="center">
              {thread.kind === 'saved' ? thread.row.title : 'New conversation'}
            </T>
          </Pressable>
        )}
        <NewThread onPress={newThread} />
      </View>

      <ScrollView
        ref={scroller}
        testID="kai-wall"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 14, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* The one message. */}
        {thread.kind === 'today' ? (
          <Wakeup
            message={wakeMessage}
            greeting={wake.greeting}
            animate={!wake.seenBefore}
            onDirection={onDirection}
          />
        ) : null}

        {/* Training rides with Kai's one message, not in the conversation
            below it: it is a standing invitation, not a thing he just said.
            It draws only on Today — scrolled back into an older thread it
            would be an interruption from the present.

            WHERE it rides is keyed to the member's readiness stage (0042).
            Somebody still in Foundations meets the next lesson before the
            market; somebody who has graduated meets the market first, and a
            course they finished sitting above it would read as the app not
            having noticed. `homeOrderFor` holds that argument in full. */}
        {homeOrder.training === 'above_wall' ? trainingRow : null}

        {/* Then the conversation. */}
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
            ) : it.kind === 'watching' ? (
              <AlsoWatching rows={it.rows} />
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

        {/* Trade-ready members get it here instead — after the setups, not
            before them. Same object, same owner; only the position moved. */}
        {homeOrder.training === 'below_wall' ? trainingRow : null}

        {/* Kai already said this in his own words; this stays for the thread views. */}
        {error && thread.kind !== 'today' ? <T size={11} c={color.muted} align="center">{error}</T> : null}
      </ScrollView>

      {/* The composer rides the keyboard up instead of being buried under it —
          KeyboardDock is what does that. The preview note sits with it, not with
          Kai — it is a fact about this build, not something Kai is telling you. */}
      <KeyboardDock floor={6} safeArea={false} style={{ paddingTop: 10, paddingHorizontal: 16, gap: 8 }}>
        {/*
          THE ONLY PLACE CREDITS APPEAR IN THE CONVERSATION, and only near the
          end of one. It draws at 80% consumed or once Kai has stopped, and is
          absent for the whole of a normal day — Home is a conversation, and a
          counter ticking down beside it would change what the screen is about.
        */}
        <CreditStrip
          credits={credits}
          onPress={() => router.push('/account/credits')}
          testID="home-credit-strip"
        />
        {isFixture ? <T size={10} c={color.dim} align="center">Sample data — the service is not connected here.</T> : null}
        <Composer placeholder="Message Kai…" onSend={send} disabled={streaming} />
      </KeyboardDock>

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
