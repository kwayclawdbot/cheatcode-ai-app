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
import { alpha, color, radius } from '../../ui/tokens';
import {
  AlsoWatching, ConversationsDrawer, PriorityObject, ReviewWatchlist, StandingCard, Wakeup,
  openingFor, useConversations, useHomeV5, usePriorityCandles, useWakeup, withBriefingOffer,
} from '../../features/home';
import type { HomeFixture, WakeDirection } from '../../features/home';
import { OfflineBanner, SavedPlanCard, recheck, useConnectivity, useDraft } from '../../features/offline';
import { CapabilityMark } from '../../ui/CapabilityState';
import { Button } from '../../ui/Button';
import { DEFAULT_MODE } from '../../features/nav/second-tab';
import { useSession } from '../../lib/session';
import { useKaiWall } from '../../lib/useKai';
import type { FailedTurn, ThreadTarget } from '../../lib/kai-continuity';
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WAVE 2 — THREE THINGS, ALL OF THEM ABOUT WHAT COMES FIRST
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. THE OPENING OBJECT IS TOO LOW (audit F03). Kai's message was greeting +
 *    market state + lead + evidence + aside + question before anything to do.
 *    It is now greeting + one line + THE ACTION — a lesson for a beginner, a
 *    setup or a position for a trader, the standing when there is neither —
 *    and the prose is behind "Read the briefing". `openingFor` holds that
 *    argument; `withBriefingOffer` guarantees the prose stays reachable.
 *
 * 2. QUIET IS NOW A FINDING, NOT AN ABSENCE (audit F18). The payload carries
 *    `standing`: what the server actually checked and whether every read
 *    answered. A morning where nothing is happening and a morning where the
 *    positions read failed no longer look the same. `StandingCard` draws the
 *    difference and refuses to say "your watchlist is up to date" unless the
 *    server proved it.
 *
 * 3. LOSING THE NETWORK IS A STATE, NOT AN ERROR. `useConnectivity` answers
 *    the question `api.available()` never did, the last good payload is
 *    remembered with the instant it was fetched, and the saved plan's levels
 *    stay readable under a banner that says exactly how old they are.
 *
 * THE KAI LANE'S WORK IS UNTOUCHED. The thread is still an explicit input to
 * `useKaiWall`, the wall still owns the conversation, and the composer dock is
 * where it was. Nothing here reaches into any of that.
 */
export default function Home() {
  const { profile, session, refreshProfile } = useSession();
  const router = useRouter();
  /** Mode is set in onboarding and changed on the Account board (Kai profile). */
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? DEFAULT_MODE;

  /**
   * What this member meets first (0042). `homeOrderFor` still decides which
   * side of the wall the training object sits on for members who do NOT open
   * with it; `openingFor` decides who opens with it at all (audit F03).
   * The "Today's Beginner Pick" object the funnel note describes is a separate
   * lane with its own data behind it and is not built here.
   */
  const homeOrder = homeOrderFor(profile?.stage);
  // Training progress lives on the device, so the server cannot see a
  // graduation on its own. This reports the evidence and refreshes the profile
  // if the server decides it was worth a promotion — which is what makes the
  // ordering above change by itself.
  useStageEvolution(refreshProfile);

  /** The network, answered properly for the first time. See `features/offline`. */
  const { online } = useConnectivity();

  /** Fixtures preview only — lets the owner and Playwright see the quiet day. */
  const params = useLocalSearchParams<{ fixture?: string; credits?: string; ask?: string }>();
  const fixture: HomeFixture =
    env.FIXTURES && (params.fixture === 'quiet' || params.fixture === 'down') ? params.fixture : 'default';

  const home = useHomeV5(mode, fixture);
  const { data, error, isFixture, remembered } = home;

  /**
   * WHAT THE SCREEN IS ACTUALLY DRAWING, AND WHERE IT CAME FROM.
   *
   * `data` is the server's answer. `remembered` is the last one it gave, with
   * the instant it gave it. They are never merged: `shown` is one or the other
   * and `fetchedAt` is non-null exactly when it is the remembered one, which is
   * what makes "Offline · Last updated 8:42 AM" a fact rather than a decoration.
   */
  const shown = data ?? remembered?.value ?? null;
  const fetchedAt = data ? null : (remembered?.fetchedAt ?? null);
  /**
   * A REMEMBERED STANDING IS NOT A STANDING. "Nothing needs a decision, last
   * checked 8:42" is a claim about a check that happened before the connection
   * dropped, and re-drawing it now would present an old all-clear as a current
   * one — the same mistake as a cached price under a live label. When we are
   * showing remembered data the banner and the saved plan carry the story
   * instead, and they say how old it is.
   */
  const standing = fetchedAt ? null : (shown?.standing ?? null);

  /**
   * The opening object (audit F03): a lesson for beginners, a setup or a
   * position for traders, the standing when there is neither.
   */
  const opening = openingFor({ stage: profile?.stage, mode, hasPriority: !!shown?.priority });
  const priorityCandles = usePriorityCandles(shown?.priority?.symbol, shown?.priority?.candles ?? []);
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
    /**
     * A SAVED THREAD SEEDS ITSELF, FROM THE SERVER (audit F04).
     *
     * This used to be a notice reading "Picking up “<title>”" — which was the
     * whole of what "opening a conversation" did. The messages were never
     * fetched, and the next turn went to whichever conversation the wall had
     * made for itself. The wall now binds to the row's id and restores its
     * transcript, so the thread's own words are the seed and a sentence
     * claiming to have picked it up would be furniture on top of the evidence.
     */
    if (thread.kind === 'saved') return [];
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

  /**
   * WHICH CONVERSATION THE WALL IS ACTUALLY IN.
   *
   * The screen's selection and the wall's server conversation are now the same
   * fact rather than two that were allowed to disagree (audit F04). A saved row
   * IS its id; New earns a real conversation on its first turn; Today is the
   * one Kai woke into.
   */
  const target = useMemo<ThreadTarget>(
    () => (thread.kind === 'saved'
      ? { kind: 'saved', id: thread.row.id }
      : thread.kind === 'new'
        ? { kind: 'new', nonce: threadNonce }
        : { kind: 'today' }),
    [thread, threadNonce],
  );

  const {
    items, send, append, stop, retry, clearFailure,
    streaming, loadingHistory, failed: liveFailure, suggestions, credits, setCredits,
  } = useKaiWall(mode, seed, target);

  /**
   * "Ask Kai about this" arriving from a setup while an OLD conversation is
   * open opens a new one. Stamping a fresh object onto somebody's saved thread
   * would rewrite what that thread is about; the pinned context belongs to the
   * conversation the question starts.
   */
  const askText = typeof params.ask === 'string' ? params.ask : '';
  const askHandled = useRef('');
  useEffect(() => {
    if (!askText || askHandled.current === askText) return;
    askHandled.current = askText;
    if (thread.kind !== 'saved') return;
    setThread({ kind: 'new' });
    setThreadNonce((n) => n + 1);
  }, [askText, thread.kind]);

  /**
   * THEY ALSO SURVIVE THE APP CLOSING (board 07, "Draft saved").
   *
   * The Kai lane made a failed turn's words come back into the field; they
   * still died with the screen. `useDraft` writes them to storage the moment a
   * turn fails and hands them back on the next open.
   */
  const drafts = useDraft(session?.user?.id ?? profile?.user_id ?? 'anon', `kai.${mode}`);
  useEffect(() => {
    if (liveFailure?.restore && liveFailure.text.trim()) drafts.save(liveFailure.text);
    // `drafts` is deliberately not a dependency: including it re-runs this on
    // every storage state change, which would rewrite the record on its own
    // restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFailure]);

  /**
   * A SAVED DRAFT *IS* AN UNSENT TURN, SO IT ARRIVES THROUGH THE SAME DOOR.
   *
   * The alternative was a second channel into the composer, and two sources
   * fighting over one `draft` prop is how a field ends up with the wrong words
   * in it. A turn that failed and a turn that was never sent are the same
   * situation one app-restart apart, so the stored copy is shaped as the
   * `FailedTurn` it came from and `failed` is the two of them, live first.
   *
   * `generation: -1` never matches a live thread generation, which is exactly
   * right: `retry()` resends the turn the WALL is holding, and the wall is
   * holding nothing after a restart. So the recovery footer below stays keyed
   * to `liveFailure` — a retry button that cannot retry would be worse than no
   * button — and the restored words get the honest "Draft saved" note instead.
   */
  const savedTurn = useMemo<FailedTurn | null>(
    () => (!liveFailure && drafts.restored && drafts.draft.trim()
      ? { generation: -1, text: drafts.draft, plain: 'Saved from last time.', restore: true }
      : null),
    [liveFailure, drafts.restored, drafts.draft],
  );
  const failed = liveFailure ?? savedTurn;

  /**
   * The words go back into the composer. The nonce is what makes the SAME
   * question restorable twice — a second failure of it must not be a no-op for
   * the field, and neither must a restore after a retry.
   */
  const [draftNonce, setDraftNonce] = useState(0);
  useEffect(() => { if (failed?.restore) setDraftNonce((n) => n + 1); }, [failed]);

  /** Retry sends the restored words, so neither the field nor storage keeps a copy. */
  const sendAgain = useCallback(() => { retry(); setDraftNonce((n) => n + 1); drafts.clear(); }, [retry, drafts]);
  /** A question that got out is no longer a draft. */
  const sendAndClear = useCallback((text: string) => { drafts.clear(); void send(text); }, [drafts, send]);

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
    // Ask the OS about the network before asking the server again: a reload
    // over a dead connection is a spinner and a second identical failure.
    if (d.kind === 'retry') { void recheck().finally(() => { wake.clear(); home.reload(); }); return; }
    if (d.kind === 'briefing') {
      /**
       * THE PROSE THE COMPACT OPENING HELD BACK (audit F03).
       *
       * The market state, the evidence behind the lead and the overnight aside
       * were three paragraphs above the first thing to do. They are not gone —
       * this is where they arrive, in Kai's own words, when somebody asks for
       * them. The written report follows if there is one; on a morning Kai's
       * report failed there is still the state and the evidence, which are read
       * off the account rather than written by him.
       */
      const prose = [wake.wakeup?.state, wake.wakeup?.evidence, wake.wakeup?.aside]
        .filter((t): t is string => !!t && !!t.trim())
        .join('\n\n');
      const out: WallItem[] = [];
      if (prose) out.push({ kind: 'kai_text', id: 'wake-brief-prose', text: prose });
      if (shown?.briefing) {
        out.push({ kind: 'kai_text', id: 'wake-brief-note', text: 'The full report, as I wrote it this morning.' });
        out.push({ kind: 'briefing', id: 'wake-briefing', briefing: shown.briefing });
      }
      if (out.length) append(out);
      return;
    }
    if (d.kind === 'watching' && shown?.also_watching.length) {
      append([
        { kind: 'kai_text', id: 'wake-watch-note', text: 'The rest of what I am keeping an eye on for you.' },
        { kind: 'watching', id: 'wake-watching', rows: shown.also_watching },
      ]);
    }
  }, [append, shown, home, router, wake]);

  /**
   * The wake-up minus the offers already taken — and shaped for the compact
   * opening.
   *
   * `wd-primary` is dropped when the priority OBJECT is drawn, because that
   * object's own volt button is the same action and two of them is one too
   * many. `withBriefingOffer` then guarantees the prose stays one tap away.
   */
  const wakeMessage = useMemo(() => {
    if (!wake.wakeup) return null;
    const drop = new Set(used);
    if (opening.kind === 'priority') drop.add('wd-primary');
    const trimmed = drop.size
      ? { ...wake.wakeup, directions: wake.wakeup.directions.filter((d) => !drop.has(d.id)) }
      : wake.wakeup;
    return withBriefingOffer(trimmed, !!shown?.briefing);
  }, [wake.wakeup, used, opening.kind, shown]);

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
  /**
   * RETRY MEANS RETRY EVERYTHING (audit F18: "reconnect refreshes without
   * losing the selected context"). It asks the OS about the network first,
   * because a reload over a dead connection is a spinner and a second failure,
   * and it leaves the thread, the drawer and the composer exactly where they
   * were — nothing about which conversation is open depends on the payload.
   */
  const retryEverything = useCallback(() => {
    void recheck().finally(() => { wake.clear(); home.reload(); });
  }, [home, wake]);

  const trainingRow =
    thread.kind === 'today' && !opening.trainingInOpening ? (
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ width: 30 }} />
        <View style={{ flex: 1 }}><ContinueTrainingObject /></View>
      </View>
    ) : null;

  /**
   * THE ONE THING TO DO, DRAWN DIRECTLY UNDER KAI'S TWO LINES (audit F03).
   *
   * Whichever of the three it is, it carries its own button — that is the
   * acceptance test: at 390px the first actionable object AND its button are
   * above the fold. `ContinueTrainingObject` and `PriorityObject` both already
   * end in one; the standing's button is the practice offer inside it.
   */
  const openingAction =
    opening.kind === 'training' ? <ContinueTrainingObject />
      : opening.kind === 'priority' && shown?.priority ? (
        <PriorityObject priority={shown.priority} candles={priorityCandles} />
      ) : standing ? (
        <StandingCard standing={standing} onRetry={retryEverything}>
          {standing.state === 'quiet' ? (
            <View style={{ gap: 4 }}>
              {/* A short practice is the quiet day's offer — the training
                  object IS that offer, and it already knows whether this
                  member has started. Drawing a second, invented one would be
                  the app recommending something it has not got. */}
              <ContinueTrainingObject testID="standing-practice" />
              <ReviewWatchlist onPress={() => router.push('/trade' as never)} />
            </View>
          ) : null}
        </StandingCard>
      ) : null;

  return (
    <Screen variant="corner" layout="tab" testID="screen-home">
      {/*
        The only chrome. Two dim controls and no bar: no rule, no title, no
        market chip, no mode label. A title appears ONLY when you are inside
        another conversation, because then you genuinely need to know which.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 4 }}>
        {/* Re-read on open: a conversation started in this sitting only exists
            on the server after its first turn, and the drawer is where somebody
            goes to come back to it. */}
        <Hamburger onPress={() => { setThreadsOpen(true); threads.reload(); }} />
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
        {/*
          OFFLINE, SAID ONCE, AT THE TOP (board 07, right screen). It draws
          nothing at all until NetInfo has actually answered — a banner that
          flashes on every cold start is a banner nobody reads.
        */}
        {thread.kind === 'today' ? (
          <OfflineBanner online={online} fetchedAt={fetchedAt} onRetry={retryEverything} retrying={home.loading} />
        ) : null}

        {/* The one message, and then the one thing to do. */}
        {thread.kind === 'today' ? (
          <Wakeup
            message={wakeMessage}
            greeting={wake.greeting}
            animate={!wake.seenBefore}
            onDirection={onDirection}
            compact
            action={openingAction}
          />
        ) : null}

        {/*
          THE CAVEAT, WHEN THE OPENING IS SOMETHING ELSE (audit F18).
          A setup can be real and the rest of the read can still have failed.
          The object above stays — it was found — but the screen must not let
          it imply it is the whole picture. `StandingCard` draws nothing for a
          quiet or a needs-you standing here; only the unverified one speaks.
        */}
        {thread.kind === 'today' && standing && opening.kind !== 'standing' && standing.state === 'unverified' ? (
          <StandingCard standing={standing} onRetry={retryEverything} />
        ) : null}

        {/*
          THE SAVED PLAN, WHEN THERE IS NO LIVE ANSWER AND WE REMEMBER ONE.
          It is drawn from the remembered payload's own levels and bars, at the
          instant they were fetched, and it says "not live" in the card rather
          than relying on the banner above to be read. It never appears
          alongside live data — `fetchedAt` is non-null only when `data` is not.
        */}
        {thread.kind === 'today' && fetchedAt && shown?.priority?.symbol ? (
          <SavedPlanCard
            symbol={shown.priority.symbol}
            entry={shown.priority.levels.entry ?? null}
            stop={shown.priority.levels.invalid ?? null}
            target={shown.priority.levels.target ?? null}
            candles={shown.priority.candles}
            fetchedAt={fetchedAt}
          />
        ) : null}

        {/*
          "Retry connection", where the board puts it: under the saved plan, as
          the one thing to do. The banner's own small retry is for the case
          where there is nothing saved to sit above this.
        */}
        {thread.kind === 'today' && online === false && fetchedAt ? (
          <View style={{ gap: 8 }}>
            <Button
              testID="offline-reconnect"
              label="Retry connection"
              height={48}
              arrow
              loading={home.loading}
              onPress={retryEverything}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <CapabilityMark state="quiet" size={13} />
              <T size={12} c={color.muted} testID="offline-plan-safe">Your plan is saved.</T>
            </View>
          </View>
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


        {/* Saved messages are being fetched. Stated, not mimed with a
            skeleton: an empty wall under a thread title is the one thing this
            screen must never look like again. */}
        {loadingHistory ? (
          <T size={11} c={color.dim} align="center" testID="home-thread-loading">
            Getting the rest of this conversation…
          </T>
        ) : null}

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

        {/*
          RECOVERY, WHERE THE WORK WAS (audit F05). A request that never reached
          the server takes its turn back out of the wall and puts the words back
          in the field below — so what is left to say is "here is why, and here
          is the button". Kai DECLINING is not this: that arrives as his own
          sentence in the conversation and offers no retry, because retrying a
          refusal just spends the allowance twice.
        */}
        {liveFailure ? (
          <View style={{ gap: 6 }} testID="kai-failure">
            <T size={11} lh={16} c={color.muted} align="center">{liveFailure.plain}</T>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Pressable
                testID="kai-retry"
                accessibilityRole="button"
                accessibilityLabel="Send that again"
                onPress={sendAgain}
                style={({ pressed }) => ({
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  borderWidth: 0.5,
                  borderColor: alpha.volt40,
                  backgroundColor: alpha.volt08,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <T size={12} weight="bold" c={color.volt}>Send that again</T>
              </Pressable>
              <Pressable
                testID="kai-failure-dismiss"
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                onPress={clearFailure}
                style={({ pressed }) => ({ paddingVertical: 7, paddingHorizontal: 10, opacity: pressed ? 0.6 : 1 })}
              >
                <T size={12} c={color.dim}>Dismiss</T>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/*
          Short questions tied to what is on screen, offered only before the
          member has said anything in this thread — after that they would be
          the app talking over them. They carry no numbers by construction
          (see `suggestedQuestions`), so nothing here can invent a price.

          NOT ON TODAY. The wake-up already offers Kai's own directions there,
          and two rows of things to tap under one message is the stacking this
          screen was rebuilt to stop. These are for the threads that open with
          nothing in them.
        */}
        {target.kind !== 'today' && !streaming && !failed && !items.some((it) => it.kind === 'user_text') ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {suggestions.map((q) => (
              <Pressable
                key={q}
                testID="kai-suggestion"
                accessibilityRole="button"
                accessibilityLabel={q}
                onPress={() => { sendAndClear(q); }}
                style={({ pressed }) => ({
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: radius.pill,
                  borderWidth: 0.5,
                  borderColor: alpha.ivory08,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <T size={11.5} c={color.violetLight}>{q}</T>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/*
          "Draft saved" — and only when it is true. The mark appears when the
          words in the field came out of storage, which is the one case where a
          member needs to be told the app kept something for them. It is never
          shown over an empty composer: claiming to have saved nothing is a
          claim about nothing.
        */}
        {savedTurn ? (
          <T size={11} c={color.dim} align="center" testID="composer-draft-saved">
            Draft saved — this is the question you did not get to send.
          </T>
        ) : null}

        <Composer
          placeholder="Message Kai…"
          onSend={sendAndClear}
          streaming={streaming}
          onStop={stop}
          draft={failed?.restore ? failed.text : ''}
          draftNonce={draftNonce}
        />
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
