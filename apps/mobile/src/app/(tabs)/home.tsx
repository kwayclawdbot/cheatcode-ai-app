import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { AppBar, IconButton } from '../../ui/AppBar';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ContextChip } from '../../ui/Chips';
import { TypingDots } from '../../ui/Bubble';
import { BriefingCard } from '../../ui/Briefing';
import { KeyboardDock } from '../../ui/KeyboardDock';
import { CapabilityMark } from '../../ui/CapabilityState';
import { Bell, Plus, Search } from '../../ui/Icons';
import { color, layout } from '../../ui/tokens';
import {
  ComparisonToolCard, ConversationsDrawer, FollowUpChips, KAI_OFFLINE_PLAIN, KaiComposer, KaiMessage, KaiNote,
  KaiWords, LearningPathCard, MonitoringLine, SetupToolCard, TodayBriefCard, UserMessage,
  briefRows, chartCaption, composeBrief, composeOpening, followUps, learningPlacement, mentionedSymbols, monitoringLine,
  resumeToday, statusLine, useConversations, useHomeV5,
} from '../../features/home';
import type { AgentOpen, FollowUp, HomeFixture, TodayBrief } from '../../features/home';
import { OfflineBanner, SavedPlanCard, recheck, useConnectivity, useDraft } from '../../features/offline';
import { DEFAULT_MODE } from '../../features/nav/second-tab';
import { useSession } from '../../lib/session';
import { useKaiWall } from '../../lib/useKai';
import { PanelLauncher, WorkspaceHost, useActiveSurface, useWorkspaceBridge, workspace } from '../../features/kai-workspace';
import type { FailedTurn, ThreadTarget } from '../../lib/kai-continuity';
import { env } from '../../lib/env';
import { useMe, useNotifications } from '../../features/account/useAccount';
import { CreditStrip } from '../../features/account/credit-instruments';
import { fixtureCreditsCeiling, fixtureCreditsOut, fixtureCreditsWarning } from '../../lib/fixtures';
import { useStageEvolution } from '../../features/stage';
import type { ConversationRow, GoalMode, Stage, WallItem } from '../../lib/types';
import { KaiMicButton, previewVoiceInFixtures, useKaiVoice } from '../../features/voice';

/** The five read-only panels, which get a taller band than the object surfaces. */
const PANEL_KINDS = new Set<string>(['quote', 'earnings', 'options', 'watchlist', 'portfolio']);

/** One Kai turn (everything between two member messages) or one member message. */
type Turn =
  | { kind: 'user'; item: Extract<WallItem, { kind: 'user_text' }> }
  | { kind: 'kai'; id: string; items: WallItem[] };

function turnsOf(items: WallItem[]): Turn[] {
  const out: Turn[] = [];
  for (const it of items) {
    if (it.kind === 'user_text') { out.push({ kind: 'user', item: it }); continue; }
    const last = out[out.length - 1];
    if (last && last.kind === 'kai') last.items.push(it);
    else out.push({ kind: 'kai', id: it.id, items: [it] });
  }
  return out;
}

/**
 * HOME — KAI IS AN AGENT, NOT A DASHBOARD (redesign V2, panel 1).
 *
 * docs/design/redesign-2026-09-21: Kai speaks first. His opening message says
 * what he checked and what he found on the member's list, positions and
 * calendar, and carries "Today's Brief" — rows that open the detail. Every
 * response after that can hold tool cards (a setup, a comparison, the rest of
 * the list), ends in follow-ups built from what it was about, and says "Kai will
 * update you …" only when an alert the member switched on is behind it. The
 * composer takes a question or a task.
 *
 * The opening is built from `GET /home` with no model call (`features/home/
 * agent.ts`), so it renders when Kai himself cannot answer — and when he
 * cannot, the screen says so once, plainly, and his replies say it too.
 *
 * What stayed from the earlier Home, unchanged underneath: the conversation
 * engine and its recovery (failed turns come back into the field, drafts
 * survive a restart), saved conversations (the search button opens them),
 * the workspace band Kai opens charts and panels in, voice, the credit strip,
 * the offline banner and the saved plan, and stage evolution. What went: the
 * war-room brain and its HUD frame, the status light and the once-a-day
 * frozen wake-up — the opening is now composed from the latest read.
 */
export default function Home() {
  const { profile, session, refreshProfile } = useSession();
  const router = useRouter();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? DEFAULT_MODE;

  const params = useLocalSearchParams<{ fixture?: string; credits?: string; ask?: string; stage?: string; voice?: string; kai?: string }>();
  /** Fixtures preview only: `?stage=` shows Home as that member would see it. */
  const fixtureStage: Stage | null =
    env.FIXTURES && (params.stage === 'beginner' || params.stage === 'developing' || params.stage === 'trade_ready')
      ? params.stage : null;
  const stage: Stage | undefined = fixtureStage ?? profile?.stage ?? undefined;
  useStageEvolution(refreshProfile);

  const { online } = useConnectivity();
  const fixture: HomeFixture =
    env.FIXTURES && (params.fixture === 'quiet' || params.fixture === 'down') ? params.fixture : 'default';
  const home = useHomeV5(mode, fixture);
  const { data, isFixture, remembered } = home;

  /** `data` is live; `remembered` is the last live answer with the instant it came. Never merged. */
  const shown = data ?? remembered?.value ?? null;
  const fetchedAt = data ? null : (remembered?.fetchedAt ?? null);
  const standing = fetchedAt ? null : (shown?.standing ?? null);

  /** When this screen first spoke. Kai's opening carries this time. */
  const openedAt = useRef(new Date()).current;

  /* ---------------- threads ---------------- */

  const threads = useConversations();
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [thread, setThread] = useState<{ kind: 'today' } | { kind: 'new' } | { kind: 'saved'; row: ConversationRow }>({ kind: 'today' });
  const [threadNonce, setThreadNonce] = useState(0);
  const activeThread = thread.kind === 'saved' ? thread.row : null;
  const scroller = useRef<ScrollView | null>(null);

  /**
   * TODAY CONTINUES (V2: "each session feels continuous rather than reset").
   * The first payload names the conversation the member was last in; if they
   * spoke in it today, today's thread IS that conversation and its transcript
   * comes back under the opening. Decided once — a later refresh must never
   * yank the member out of the thread they are typing in.
   */
  const [resume, setResume] = useState<string | null>(null);
  const resumeDecided = useRef(false);
  /** Set once the member has said anything here — after that, today is what they made it. */
  const spoke = useRef(false);
  useEffect(() => {
    if (resumeDecided.current || !data) return;
    resumeDecided.current = true;
    if (!spoke.current) setResume(resumeToday(data.conversation, openedAt));
  }, [data, openedAt]);

  const seed = useMemo<WallItem[]>(() => {
    if (thread.kind === 'saved') return [];
    if (thread.kind === 'new') {
      return [{ kind: 'notice', id: `thread-new-${threadNonce}`, text: 'New conversation. Ask me about a symbol, a setup or your rules.' }];
    }
    return [];
  }, [thread, threadNonce]);

  const target = useMemo<ThreadTarget>(
    () => (thread.kind === 'saved'
      ? { kind: 'saved', id: thread.row.id }
      : thread.kind === 'new'
        ? { kind: 'new', nonce: threadNonce }
        : { kind: 'today', resume }),
    [thread, threadNonce, resume],
  );

  /* ---------------- Kai's hands on the screen ---------------- */

  const pendingKai = useRef<string[]>([]);
  const [kaiSaid, setKaiSaid] = useState(0);
  const sayInWall = useCallback((text: string) => {
    if (!text.trim()) return;
    pendingKai.current.push(text);
    setKaiSaid((n) => n + 1);
  }, []);
  const bridge = useWorkspaceBridge({ onNarrate: sayInWall, onAnswer: sayInWall });

  const {
    items, send, append, stop, retry, clearFailure,
    streaming, loadingHistory, failed: liveFailure, suggestions, credits, setCredits,
  } = useKaiWall(mode, seed, target, bridge);

  useEffect(() => {
    if (!pendingKai.current.length) return;
    const texts = pendingKai.current.splice(0, pendingKai.current.length);
    append(texts.map((text) => ({ kind: 'kai_text' as const, id: `ws${Math.random().toString(36).slice(2)}`, text, streaming: false, at: new Date().toISOString() })));
  }, [kaiSaid, append]);

  const activeSurface = useActiveSurface();
  const [panelsOpen, setPanelsOpen] = useState(false);
  const workspaceHeight =
    activeSurface?.kind === 'chart' ? 360
      : activeSurface && PANEL_KINDS.has(activeSurface.kind) ? 400
        : 300;

  useEffect(() => {
    if (thread.kind === 'new') workspace.reset();
  }, [thread.kind, threadNonce]);

  /** "Ask Kai about this" from a saved thread starts a new one, never rewrites the old. */
  const askText = typeof params.ask === 'string' ? params.ask : '';
  const askHandled = useRef('');
  useEffect(() => {
    if (!askText || askHandled.current === askText) return;
    askHandled.current = askText;
    if (thread.kind !== 'saved') return;
    setThread({ kind: 'new' });
    setThreadNonce((n) => n + 1);
  }, [askText, thread.kind]);

  /* ---------------- drafts and recovery (unchanged contract) ---------------- */

  const drafts = useDraft(session?.user?.id ?? profile?.user_id ?? 'anon', `kai.${mode}`);
  useEffect(() => {
    if (liveFailure?.restore && liveFailure.text.trim()) drafts.save(liveFailure.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFailure]);
  const savedTurn = useMemo<FailedTurn | null>(
    () => (!liveFailure && drafts.restored && drafts.draft.trim()
      ? { generation: -1, text: drafts.draft, plain: 'Saved from last time.', restore: true }
      : null),
    [liveFailure, drafts.restored, drafts.draft],
  );
  const failed = liveFailure ?? savedTurn;
  const [draftNonce, setDraftNonce] = useState(0);
  useEffect(() => { if (failed?.restore) setDraftNonce((n) => n + 1); }, [failed]);
  const sendAgain = useCallback(() => { retry(); setDraftNonce((n) => n + 1); drafts.clear(); }, [retry, drafts]);

  /* ---------------- is Kai able to answer ---------------- */

  const me = useMe();
  const creditFixture = env.FIXTURES ? String(params.credits ?? '') : '';
  const meCredits = creditFixture === 'warn' ? fixtureCreditsWarning
    : creditFixture === 'out' ? fixtureCreditsOut
    : creditFixture === 'ceiling' ? fixtureCreditsCeiling
    : me.data?.credits ?? null;
  useEffect(() => {
    if (meCredits) setCredits((prev) => prev ?? meCredits);
  }, [meCredits, setCredits]);

  /**
   * KAI OFFLINE is the server's provider check (out of credit, refused key),
   * carried on `/home`. `?kai=offline` previews it in fixtures only. The
   * member's OWN allowance running out is a different sentence — the credit
   * strip says that one — so it is not folded in here.
   */
  const kaiAvailable = env.FIXTURES && params.kai === 'offline' ? false : (shown?.agent?.kai.available ?? true);

  /**
   * A question to a Kai we KNOW cannot answer is not sent to fail: the member's
   * words stay in the thread and Kai says why, in the same sentence the server
   * uses. When we do not know (an older server), it goes, and the server's own
   * reply says the same thing.
   */
  const ask = useCallback((text: string) => {
    const body = text.trim();
    if (!body) return;
    drafts.clear();
    if (!kaiAvailable) {
      const now = new Date().toISOString();
      const id = Math.random().toString(36).slice(2);
      append([
        { kind: 'user_text', id: `off-u-${id}`, text: body, at: now },
        { kind: 'kai_text', id: `off-k-${id}`, text: `${KAI_OFFLINE_PLAIN} Ask me again when I'm back.`, at: now },
      ]);
      return;
    }
    void send(body);
  }, [append, drafts, kaiAvailable, send]);

  const voicePreview = env.FIXTURES && params.voice === 'on';
  useEffect(() => { if (voicePreview) previewVoiceInFixtures(true); }, [voicePreview]);
  const voice = useKaiVoice({ onTranscript: ask, items, streaming });

  /* ---------------- the opening ---------------- */

  const rows = useMemo(() => (shown ? briefRows(shown) : []), [shown]);
  const brief = useMemo<TodayBrief | null>(
    () => (shown ? composeBrief({ ...shown, standing: standing ?? null }, openedAt) : null),
    [shown, standing, openedAt],
  );
  const opening = useMemo(() => composeOpening({
    now: openedAt,
    name: profile?.display_name,
    stage,
    mode,
    data: shown,
    standing: standing ?? null,
    rows,
    rememberedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null,
  }), [openedAt, profile?.display_name, stage, mode, shown, standing, rows, fetchedAt]);

  const status = statusLine({
    kaiAvailable,
    online: online ?? null,
    positionsOpen: shown?.agent?.positions_open ?? null,
    market: shown?.market ?? null,
  });

  /** Offers already taken — a chip must never be a no-op the second time. */
  const [used, setUsed] = useState<string[]>([]);

  const openThing = useCallback((o: AgentOpen) => {
    if (o.kind === 'route') { router.push(o.route as never); return; }
    if (o.kind === 'reveal') {
      if (shown?.briefing) {
        append([
          { kind: 'kai_text', id: 'wake-brief-note', text: 'The report I wrote this morning.', at: new Date().toISOString() },
          { kind: 'briefing', id: 'wake-briefing', briefing: shown.briefing },
        ]);
      }
      return;
    }
    workspace.apply(
      o.surface === 'earnings' ? { type: 'show_earnings', symbol: o.symbol }
        : o.surface === 'quote' ? { type: 'show_quote', symbol: o.symbol }
          : { type: 'open_chart', symbol: o.symbol, timeframe: null, setup_id: null },
    );
  }, [append, router, shown]);

  const onFollowUp = useCallback((f: FollowUp) => {
    setUsed((u) => (u.includes(f.id) ? u : [...u, f.id]));
    if (f.kind === 'open' && f.open) { openThing(f.open); return; }
    if (f.task) ask(f.task);
  }, [ask, openThing]);

  /* ---------------- turns, chips and the monitoring line ---------------- */

  const turns = useMemo(() => turnsOf(items), [items]);
  if (items.some((it) => it.kind === 'user_text')) spoke.current = true;
  const lastKai = [...turns].reverse().find((t) => t.kind === 'kai') as Extract<Turn, { kind: 'kai' }> | undefined;
  const lastTurn = turns[turns.length - 1];
  /** Everything the thread already knows by name — only these count as "mentioned". */
  const known = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.symbol) s.add(r.symbol); });
    items.forEach((it) => { if (it.kind === 'setup') s.add(it.setup.symbol); });
    shown?.agent?.monitoring.forEach((m) => { if (m.symbol) s.add(m.symbol); });
    return [...s];
  }, [rows, items, shown]);
  const others = rows.map((r) => r.symbol).filter((s): s is string => !!s);
  const learning = stage !== 'trade_ready' && stage !== 'developing';

  const chipsFor = useCallback((t: Extract<Turn, { kind: 'kai' }>) => {
    const text = t.items.filter((i) => i.kind === 'kai_text').map((i) => (i as { text: string }).text).join(' ');
    return followUps({
      setups: t.items.filter((i) => i.kind === 'setup').map((i) => ({ symbol: (i as Extract<WallItem, { kind: 'setup' }>).setup.symbol, entry: (i as Extract<WallItem, { kind: 'setup' }>).setup.entry })),
      comparison: (t.items.find((i) => i.kind === 'comparison') as Extract<WallItem, { kind: 'comparison' }> | undefined)?.comparison ?? null,
      brief: null,
      mentioned: mentionedSymbols(text, known),
      hasAction: t.items.some((i) => i.kind === 'action'),
    }, { stage, kaiAvailable, others }).filter((f) => !used.includes(f.id));
  }, [known, stage, kaiAvailable, others, used]);

  const symbolsOf = useCallback((t: Extract<Turn, { kind: 'kai' }>) => {
    const text = t.items.filter((i) => i.kind === 'kai_text').map((i) => (i as { text: string }).text).join(' ');
    const fromSetups = t.items.filter((i) => i.kind === 'setup').map((i) => (i as Extract<WallItem, { kind: 'setup' }>).setup.symbol);
    return [...new Set([...fromSetups, ...mentionedSymbols(text, known)])];
  }, [known]);

  const openingIsLatest = thread.kind === 'today' && !items.some((it) => it.kind === 'user_text');
  const openingChips = useMemo(() => (brief ? followUps({
    setups: [], comparison: null, brief, mentioned: [], hasAction: false,
  }, { stage, kaiAvailable, others, hasReport: !!shown?.briefing }).filter((f) => !used.includes(f.id)) : []), [brief, stage, kaiAvailable, others, shown, used]);
  const openingWatch = monitoringLine(others, shown?.agent);

  const seedCount = seed.length;
  useEffect(() => {
    if (items.length <= seedCount) return;
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [items, seedCount]);

  const retryEverything = useCallback(() => { void recheck().finally(() => { home.reload(); }); }, [home]);

  const newThread = () => { setThread({ kind: 'new' }); setThreadNonce((n) => n + 1); setThreadsOpen(false); };
  const openThread = (row: ConversationRow) => { setThread({ kind: 'saved', row }); setThreadNonce((n) => n + 1); setThreadsOpen(false); };
  const backToToday = () => { setThread({ kind: 'today' }); setThreadNonce((n) => n + 1); setThreadsOpen(false); };

  const notes = useNotifications();
  const unread = (notes.data ?? []).some((n) => !n.read_at);
  const initial = (profile?.display_name ?? '').trim().slice(0, 1) || null;
  const placement = learningPlacement(stage);

  /* ---------------- drawing ---------------- */

  const renderItem = (it: WallItem) => {
    switch (it.kind) {
      case 'kai_text': return <KaiWords key={it.id} text={it.text} streaming={it.streaming} />;
      case 'setup': return <SetupToolCard key={it.id} setup={it.setup} mode={mode} />;
      case 'comparison': return <ComparisonToolCard key={it.id} comparison={it.comparison} />;
      case 'briefing': return <BriefingCard key={it.id} briefing={it.briefing} />;
      case 'watching': return (
        <TodayBriefCard
          key={it.id}
          title="Also watching"
          testID="also-watching"
          brief={{ id: it.id, dateLabel: '', footnote: null, rows: briefRows({ priority: null, also_watching: it.rows, agent: null }) }}
          onOpen={openThing}
        />
      );
      case 'typing': return <TypingDots key={it.id} testID="typing" />;
      case 'action': return (
        <Card key={it.id} tone="kai" style={{ padding: 13 }}>
          <T variant="meta" lh={19} c={color.kaiInk}>{it.action.summary_plain ?? it.action.label}</T>
        </Card>
      );
      default: return <KaiNote key={it.id} text={it.text} />;
    }
  };

  return (
    <Screen variant="corner" layout="tab" testID="screen-home">
      <AppBar
        title="Kai"
        status={status}
        testID="home-app-bar"
        actions={(
          <>
            <IconButton
              testID="home-threads-open"
              accessibilityLabel="Search your conversations"
              icon={<Search size={22} color={color.textPrimary} strokeWidth={1.75} />}
              onPress={() => { setThreadsOpen(true); threads.reload(); }}
            />
            <IconButton
              testID="home-bell"
              accessibilityLabel={unread ? 'Notifications, some unread' : 'Notifications'}
              badge={unread}
              icon={<Bell size={22} color={color.textPrimary} strokeWidth={1.75} />}
              onPress={() => router.push('/account/notifications' as never)}
            />
          </>
        )}
      />

      {thread.kind !== 'today' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: layout.gutter, paddingBottom: 4 }}>
          <Pressable
            testID="home-thread-title"
            accessibilityRole="button"
            accessibilityLabel={`${thread.kind === 'saved' ? thread.row.title : 'New conversation'}. Back to today.`}
            onPress={backToToday}
            style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
          >
            <T variant="meta" c={color.textSecondary} numberOfLines={1}>
              {`‹ Today  ·  ${thread.kind === 'saved' ? thread.row.title : 'New conversation'}`}
            </T>
          </Pressable>
          <IconButton testID="home-thread-new" accessibilityLabel="New conversation" icon={<Plus size={20} color={color.textPrimary} />} onPress={newThread} />
        </View>
      ) : null}

      <PanelLauncher visible={panelsOpen} onClose={() => setPanelsOpen(false)} />

      <WorkspaceHost
        mode={mode}
        height={workspaceHeight}
        busy={streaming}
        caption={chartCaption(items, streaming && activeSurface?.kind === 'chart')}
        onChartRuntime={bridge.bindApply}
        onRoute={(r) => router.push(r as never)}
      />

      <ScrollView
        ref={scroller}
        testID="kai-wall"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 4, paddingHorizontal: layout.gutter, gap: 18, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {thread.kind === 'today' ? (
          <OfflineBanner online={online} fetchedAt={fetchedAt} onRetry={retryEverything} retrying={home.loading} />
        ) : null}

        {/* KAI SPEAKS FIRST. Built from the read, not from a model. */}
        {thread.kind === 'today' ? (
          <KaiMessage at={openedAt.toISOString()} dim={!kaiAvailable} testID="kai-opening">
            <KaiWords text={opening} testID="kai-opening-text" />
            {placement === 'top' ? <LearningPathCard /> : null}
            {brief ? <TodayBriefCard brief={brief} onOpen={openThing} /> : null}
            {fetchedAt && shown?.priority?.symbol ? (
              <SavedPlanCard
                symbol={shown.priority.symbol}
                entry={shown.priority.levels.entry ?? null}
                stop={shown.priority.levels.invalid ?? null}
                target={shown.priority.levels.target ?? null}
                candles={shown.priority.candles}
                fetchedAt={fetchedAt}
              />
            ) : null}
            {openingIsLatest ? <FollowUpChips chips={openingChips} onPress={onFollowUp} /> : null}
            {openingIsLatest && openingWatch ? <MonitoringLine text={openingWatch} /> : null}
          </KaiMessage>
        ) : null}

        {thread.kind === 'today' && placement === 'below' ? <LearningPathCard /> : null}

        {thread.kind === 'today' && online === false && fetchedAt ? (
          <View style={{ gap: 8 }}>
            <Button testID="offline-reconnect" label="Retry connection" height={48} arrow loading={home.loading} onPress={retryEverything} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <CapabilityMark state="quiet" size={13} />
              <T variant="meta" c={color.textSecondary} testID="offline-plan-safe">Your plan is saved.</T>
            </View>
          </View>
        ) : null}

        {loadingHistory ? (
          <T variant="meta" c={color.textSecondary} align="center" testID="home-thread-loading">
            Getting the rest of this conversation…
          </T>
        ) : null}

        {turns.map((t) => {
          if (t.kind === 'user') {
            return <UserMessage key={t.item.id} text={t.item.text} at={t.item.at} initial={initial} />;
          }
          const first = t.items.find((i) => i.kind === 'kai_text') as { at?: string | null } | undefined;
          const isLast = t === lastKai && lastTurn === t && !streaming;
          const chips = isLast ? chipsFor(t) : [];
          const watch = isLast ? monitoringLine(symbolsOf(t), shown?.agent) : null;
          return (
            <KaiMessage key={t.id} at={first?.at ?? null} dim={!kaiAvailable}>
              {t.items.map(renderItem)}
              {chips.length ? <FollowUpChips chips={chips} onPress={onFollowUp} /> : null}
              {watch ? <MonitoringLine text={watch} /> : null}
            </KaiMessage>
          );
        })}
      </ScrollView>

      <KeyboardDock floor={6} safeArea={false} style={{ paddingTop: 8, paddingHorizontal: layout.gutter, gap: 8 }}>
        <CreditStrip credits={credits} onPress={() => router.push('/account/credits')} testID="home-credit-strip" />
        {isFixture ? <T variant="meta" c={color.textSecondary} align="center">Sample data — the service is not connected here.</T> : null}

        {/* KAI OFFLINE, SAID ONCE. The brief above is still true — it is read
            off the account, not written by him. */}
        {!kaiAvailable ? (
          <T variant="meta" c={color.textSecondary} align="center" testID="kai-offline-note">
            Kai is offline. Your alerts and positions are still watched.
          </T>
        ) : null}

        {liveFailure ? (
          <View style={{ gap: 6 }} testID="kai-failure">
            <T variant="meta" lh={16} c={color.textSecondary} align="center">{liveFailure.plain}</T>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Button testID="kai-retry" label="Send that again" kind="voltGhost" height={36} full={false} onPress={sendAgain} />
              <Button testID="kai-failure-dismiss" label="Dismiss" kind="ghost" height={36} full={false} onPress={clearFailure} />
            </View>
          </View>
        ) : null}

        {/* A thread that opens empty gets a few short questions tied to it. */}
        {target.kind !== 'today' && kaiAvailable && !streaming && !failed && !items.some((it) => it.kind === 'user_text') ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {suggestions.map((q) => (
              <ContextChip key={q} testID="kai-suggestion" label={q} onPress={() => ask(q)} />
            ))}
          </View>
        ) : null}

        {savedTurn ? (
          <T variant="meta" c={color.textSecondary} align="center" testID="composer-draft-saved">
            Draft saved — this is the question you did not get to send.
          </T>
        ) : null}

        <KaiComposer
          onSend={ask}
          onAttach={() => setPanelsOpen(true)}
          streaming={streaming}
          onStop={stop}
          draft={failed?.restore ? failed.text : ''}
          draftNonce={draftNonce}
          voiceOverlay={voice.overlay}
          mic={voice.enabled ? (
            <KaiMicButton
              phase={voice.phase}
              level={voice.level}
              onPress={voice.press}
              waiting={voice.waiting || !kaiAvailable}
              size={38}
              tone="kai"
            />
          ) : null}
        />
      </KeyboardDock>

      <ConversationsDrawer
        visible={threadsOpen}
        onClose={() => setThreadsOpen(false)}
        pinned={threads.data.pinned}
        recent={threads.data.recent}
        q={threads.q}
        onQuery={threads.setQ}
        activeId={activeThread?.id ?? (resume && thread.kind === 'today' ? resume : null)}
        onOpen={openThread}
        onPin={(row) => { void threads.togglePin(row.id); }}
        onNew={newThread}
        loading={threads.loading}
      />
    </Screen>
  );
}
