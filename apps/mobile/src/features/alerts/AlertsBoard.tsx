import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { ScreenLoading } from '../../ui/Loading';
import {
  AppBar, IconButton, SegmentedControl, SectionTabs, Button, T, color, layout, alpha, radius,
} from '../../ui/kit';
// The six ways a surface can have nothing to show — audit F18, one vocabulary
// for the whole app rather than a private empty state per board.
import { CapabilityNotice, capabilityFor, updatedAtLabel } from '../../ui/CapabilityState';
import { env } from '../../lib/env';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { AlertsEmpty, HistoryAlertRow, StandardAlertCard } from './AlertCard';
import { useAlertActions, useAlertsRound4 } from './useAlerts';
import { useAlertCandles } from './useAlertCandles';
import { useAlertBookmarks } from './useAlertBookmarks';
import { useAlertAttention } from './attention';
import { pickPriority, rankActive } from './card-model';
import { applyBoardFilter, filterIsActive, NO_FILTER, type BoardFilter } from './board-filter';
import { BellGlyph, FilterGlyph, SearchGlyph } from './instruments';
import { InvestList } from './InvestList';
import { Avatar } from '../community/ui/Chrome';
import { BeltChip, CommunityCallCard, MemberName, useDeskCalls } from '../social';
import type { AlertBoardTab, AlertCard, CommunityCall, GoalMode } from '../../lib/types';
import { NOT_ADVICE_ALERTS } from '../legal/disclaimers';
import { hitSlopFor } from '../../ui/touch';

/**
 * ALERTS — the V2 board (owner pack 2026-09-21, board V2 panel 2).
 *
 *   app bar      brand mark · "Alerts" · search · filter · bell
 *   mode         ONE segmented control: Day Trade | Swing | Invest (orange
 *                selected) — it replaces the mode dropdown and writes the same
 *                `PUT /mode` + profile patch the sheet always did, so the mode
 *                is still one setting, not a second one for this screen
 *   tabs         Active · Community · History, with counts
 *   list         the ONE priority card (expanded, orange edge glow), then the
 *                compact supporting cards
 *
 * INVEST IS A SEGMENT HERE, NOT A DIFFERENT SCREEN. It draws the research
 * watchlist in the same card language, with no tabs and no triggers —
 * investing picks are not alerts (standing ruling).
 *
 * WHICH CARD IS THE PRIORITY CARD is `pickPriority` (card-model.ts): a
 * decision now beats something you are already doing, which beats a target to
 * manage, which beats watching — then grade, then recency. Resolved cards, a
 * crossed stop and a card Kai says to leave can never wear the glow.
 *
 * Alerts are still COMPLETE TRADE OBJECTS; the whole card opens the Trade
 * detail (`/trade/[symbol]?alert=&ctx=alert`, links.ts). The natural-language
 * builder is `/alert/new`, reached from the foot of the Active list.
 *
 * WATCHING FOLDED INTO ACTIVE (owner, 7 Sept) and COMMUNITY is the desk's
 * member calls — both unchanged, see `useAlertsRound4`.
 */

const MODES: { key: GoalMode; label: string }[] = [
  { key: 'day_trade', label: 'Day Trade' },
  { key: 'swing', label: 'Swing' },
  { key: 'invest', label: 'Invest' },
];

/**
 * THE MODE, WRITTEN WHERE IT ALWAYS WAS. The segmented control shows the tap at
 * once (`pending`) and the board re-reads when the profile patch lands; if the
 * write fails the control falls back to the mode that is still true.
 */
function useModeSwitch(mode: GoalMode) {
  const { patchProfile } = useSession();
  const [pending, setPending] = useState<GoalMode | null>(null);
  const choose = useCallback(async (m: GoalMode) => {
    if (m === mode) return;
    setPending(m);
    try {
      if (api.available()) await api.setMode(m);
      await patchProfile({ primary_mode: m });
    } catch {
      /* the control returns to the mode that is still true */
    } finally {
      setPending(null);
    }
  }, [mode, patchProfile]);
  return { shown: pending ?? mode, choose };
}

/**
 * A MEMBER'S CALL ON THE BOARD: the author, then the card. The name row is the
 * door to the profile (a button may not contain another, so it sits above the
 * card rather than inside it).
 */
function BoardCallRow({ call }: { call: CommunityCall }) {
  const router = useRouter();
  return (
    <View style={{ gap: 8 }} testID={`board-call-${call.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${call.author.display_name}, open their profile`}
        accessibilityHint="Everything they have published, and how it turned out."
        testID={`board-call-author-${call.id}`}
        onPress={() => router.push(`/contributor/${encodeURIComponent(call.author.user_id)}` as never)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32, opacity: pressed ? 0.65 : 1 })}
        hitSlop={hitSlopFor(200, 32)}
      >
        <Avatar initial={call.author.initial} url={call.author.avatar_url} size={24} />
        <MemberName
          name={call.author.display_name}
          belt={call.author.belt}
          handle={call.author.handle}
          showHandle
          size={13}
          handleSize={12}
          testID={`board-call-name-${call.id}`}
        />
        <BeltChip belt={call.author.belt} />
        <View style={{ flex: 1 }} />
        <T variant="meta" c={color.textSecondary}>{call.time_label}</T>
      </Pressable>
      <CommunityCallCard call={call} compact />
    </View>
  );
}

/** One row of choices in the filter sheet. */
function FilterRow<K extends string>({ label, options, value, onChange, testID }: {
  label: string; options: { key: K; label: string }[]; value: K; onChange: (k: K) => void; testID: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <T variant="meta" c={color.textSecondary}>{label}</T>
      <SegmentedControl options={options} value={value} onChange={onChange} testID={testID} />
    </View>
  );
}

/**
 * The top of the board — app bar, mode control and (for the alert modes) the
 * section tabs. Shared by both bodies so the chrome is identical in all three
 * segments; only the list underneath changes.
 */
function BoardTop({ mode, tabs, filter }: {
  mode: GoalMode;
  tabs?: { value: AlertBoardTab; onChange: (t: AlertBoardTab) => void; counts: Record<AlertBoardTab, number> } | null;
  filter?: { active: boolean; open: () => void } | null;
}) {
  const router = useRouter();
  const { shown, choose } = useModeSwitch(mode);
  const attention = useAlertAttention(mode !== 'invest');
  const needs = attention.status === 'ready' && attention.needsAttention;
  return (
    <>
      <AppBar
        title="Alerts"
        actions={(
          <>
            <IconButton icon={<SearchGlyph />} accessibilityLabel="Look up a company" onPress={() => router.push('/symbol/search' as never)} testID="alerts-search" />
            {filter ? (
              <IconButton
                icon={<FilterGlyph c={filter.active ? color.action : color.textPrimary} />}
                accessibilityLabel={filter.active ? 'Filter alerts, a filter is on' : 'Filter alerts'}
                badge={filter.active}
                onPress={filter.open}
                testID="alerts-filter"
              />
            ) : null}
            <IconButton
              icon={<BellGlyph />}
              accessibilityLabel={needs ? 'Notifications, something needs you' : 'Notifications'}
              badge={needs}
              onPress={() => router.push('/account/notifications' as never)}
              testID="alerts-bell"
            />
          </>
        )}
      />
      <View style={{ paddingHorizontal: layout.gutter, gap: 12, paddingBottom: 12 }}>
        <SegmentedControl options={MODES} value={shown} onChange={(m) => { void choose(m); }} testID="alerts-mode" />
        {tabs ? (
          <SectionTabs
            tabs={[
              { key: 'active', label: 'Active', count: tabs.counts.active },
              { key: 'community', label: 'Community', count: tabs.counts.community },
              { key: 'history', label: 'History', count: tabs.counts.history },
            ]}
            value={tabs.value}
            onChange={tabs.onChange}
            testID="alerts-tabs"
          />
        ) : null}
      </View>
    </>
  );
}

/** The second tab. Invest draws the research list; Day Trade and Swing draw alerts. */
export function AlertsBoard({ mode }: { mode: GoalMode }) {
  if (mode === 'invest') {
    return (
      <Screen variant="corner" layout="tab" testID="screen-alerts">
        <BoardTop mode={mode} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          testID="alerts-list-invest"
        >
          <InvestList />
        </ScrollView>
      </Screen>
    );
  }
  return <TradeAlertsBoard mode={mode} />;
}

function TradeAlertsBoard({ mode }: { mode: GoalMode }) {
  const router = useRouter();
  /** Fixtures preview only — lets the owner and Playwright see the quiet day. */
  const params = useLocalSearchParams<{ fixture?: string }>();
  const { data, loading, error, isFixture, reload, tab, setTab, checkedAt } = useAlertsRound4(
    mode,
    env.FIXTURES && params.fixture === 'empty' ? 'empty' : 'default',
  );
  const actions = useAlertActions(reload);
  const bookmarks = useAlertBookmarks();
  const calls = useDeskCalls(mode);
  const callList = calls.data ?? [];
  const [filter, setFilter] = useState<BoardFilter>(NO_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const filtering = filterIsActive(filter);

  /** Active + Watching as ONE list, filtered, in priority order. */
  const activeList = useMemo<AlertCard[]>(() => {
    if (!data) return [];
    return rankActive(applyBoardFilter([...data.active, ...data.watching], filter, bookmarks.savedIds));
  }, [data, filter, bookmarks.savedIds]);
  const historyList = useMemo<AlertCard[]>(
    () => applyBoardFilter(data?.history ?? [], filter, bookmarks.savedIds),
    [data, filter, bookmarks.savedIds],
  );
  const priorityId = useMemo(() => pickPriority(activeList), [activeList]);

  /**
   * THE BARS THE ALERT WIRE DOES NOT CARRY — five-minute bars for every card's
   * 24h/72h microchart, one request per symbol for the whole board (the cache
   * lives in useAlertCandles). A symbol the fetch does not return simply draws
   * no chart.
   */
  const candleRequests = useMemo(
    () => activeList.map((a) => ({ symbol: a.symbol, tf: '5m' as const })),
    [activeList],
  );
  const candles = useAlertCandles(candleRequests);

  /** Server counts when nothing is filtered; the filtered lengths when something is. */
  const counts = useMemo<Record<AlertBoardTab, number>>(() => ({
    active: filtering
      ? activeList.length
      : (data?.counts.active ?? data?.active.length ?? 0) + (data?.counts.watching ?? data?.watching.length ?? 0),
    community: callList.length,
    history: filtering ? historyList.length : (data?.counts.history ?? data?.history.length ?? 0),
  }), [data, callList.length, filtering, activeList.length, historyList.length]);

  const top = (
    <BoardTop
      mode={mode}
      tabs={{ value: tab, onChange: setTab, counts }}
      filter={{ active: filtering, open: () => setFilterOpen(true) }}
    />
  );

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-alerts">
        {top}
        <ScreenLoading label="Checking what Kai is watching…" />
      </Screen>
    );
  }

  const askKai = { label: 'Ask Kai what he sees', testID: 'alerts-empty-kai', onPress: () => router.push('/home') };
  const lookUp = { label: 'Look up a company', testID: 'alerts-empty-search', onPress: () => router.push('/symbol/search') };
  const clearFilter = { label: 'Clear the filter', testID: 'alerts-empty-clear', onPress: () => setFilter(NO_FILTER) };
  const seeCommunity = {
    label: counts.community === 1 ? 'See the 1 member call' : `See the ${counts.community} member calls`,
    testID: 'alerts-empty-community',
    onPress: () => setTab('community'),
  };
  const publishCall = { label: 'Publish a call', testID: 'alerts-empty-publish', onPress: () => router.push('/community/call/new') };
  const offers =
    filtering && tab !== 'community'
      ? [clearFilter]
      : tab === 'active'
      ? (counts.community ? [seeCommunity, askKai] : [askKai, lookUp])
      : tab === 'community'
      ? [publishCall, lookUp]
      : [askKai];

  /**
   * QUIET IS NOT THE SAME AS UNANSWERED — audit F18. Only an answered, unfailed
   * request may draw "Nothing here"; a failed poll with cards in hand is STALE
   * and keeps them. (`capabilityFor`, ui/CapabilityState.tsx.)
   */
  const visible: AlertCard[] | CommunityCall[] =
    tab === 'history' ? historyList : tab === 'community' ? callList : activeList;
  const answered = tab === 'community' ? calls.data != null : !!data;
  const failed = tab === 'community' ? !!calls.error || calls.notAvailable : !!error;
  const capability = capabilityFor({
    hasData: answered && visible.length > 0,
    loading: tab === 'community' ? calls.loading : loading,
    failed,
    verified: answered && !failed,
    empty: visible.length === 0,
  });
  const failedPlain =
    tab === 'community'
      ? calls.notAvailable
        ? "Member calls aren't live on this stack yet."
        : (calls.error ?? 'I could not read what members have called.')
      : (error ?? 'I could not read your alerts just now.');
  const retry = tab === 'community' ? calls.reload : reload;
  const onRetry = tab === 'community' && calls.notAvailable ? undefined : retry;

  const emptyCopy =
    filtering && tab !== 'community'
      ? 'Nothing matches this filter.'
      : tab === 'history'
      ? 'Nothing has finished yet. Executed, closed and invalidated alerts land here, and the record is worth more than the list.'
      : tab === 'community'
      ? 'Nobody on this desk has published a call yet. A call is a member saying what they are doing and letting it be checked later — yours can be the first.'
      : data?.empty_copy ?? 'Nothing needs a decision right now. Kai moves an alert here the moment a verified event happens — no alert is better than a made-up one.';

  return (
    <Screen variant="corner" layout="tab" testID="screen-alerts">
      {top}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingBottom: 16, gap: layout.cardGap }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        testID={`alerts-list-${tab}`}
      >
        {capability === 'failed' ? (
          <CapabilityNotice
            state="failed"
            plain={failedPlain}
            detail="Nothing here was checked and found empty — the request did not come back."
            onRetry={onRetry}
            testID="alerts-failed"
          />
        ) : capability === 'loading' ? (
          <CapabilityNotice state="loading" plain="Checking what Kai is watching…" testID="alerts-loading" />
        ) : capability === 'quiet' ? (
          <AlertsEmpty copy={emptyCopy} offers={offers} />
        ) : (
          <>
            {capability === 'stale' ? (
              <CapabilityNotice
                state="stale"
                plain={failedPlain}
                detail="These are the cards from the last answer that arrived."
                at={tab === 'community' ? null : updatedAtLabel(checkedAt, 'Last checked')}
                onRetry={onRetry}
                testID="alerts-stale"
              />
            ) : null}
            {tab === 'history'
              ? historyList.map((a) => <HistoryAlertRow key={a.id} alert={a} />)
              : tab === 'community'
              ? callList.map((c) => <BoardCallRow key={c.id} call={c} />)
              : activeList.map((a) => {
                  const top = a.id === priorityId;
                  return (
                    <StandardAlertCard
                      key={a.id}
                      alert={a}
                      density={top ? 'priority' : 'compact'}
                      priority={top}
                      candles={candles[a.symbol.toUpperCase()]}
                      bookmarked={bookmarks.isSaved(a.id)}
                      onToggleBookmark={() => { void bookmarks.toggle(a.id, a.symbol); }}
                    />
                  );
                })}
          </>
        )}

        {tab === 'active' ? (
          <Pressable
            testID="alerts-new"
            accessibilityRole="button"
            accessibilityLabel="Create an alert"
            accessibilityHint="Describe what to watch and Kai reads it back before anything is set."
            onPress={() => router.push('/alert/new' as never)}
            style={({ pressed }) => ({
              minHeight: 44, borderRadius: radius.control, borderWidth: 1, borderStyle: 'dashed',
              borderColor: alpha.border, alignItems: 'center', justifyContent: 'center',
              backgroundColor: pressed ? color.raised : 'transparent',
            })}
          >
            <T variant="meta" weight="semibold" c={color.textSecondary}>+ Create an alert</T>
          </Pressable>
        ) : null}

        {bookmarks.error ? <T variant="meta" c={color.marketDown} align="center">{bookmarks.error}</T> : null}
        {actions.error ? <T variant="meta" c={color.marketDown} align="center">{actions.error}</T> : null}
        {isFixture ? <T variant="meta" c={color.textSecondary} align="center">Sample alerts — the alerts service is not connected here.</T> : null}
        <T variant="meta" c={color.textSecondary} align="center" style={{ marginTop: 4 }} testID="alerts-not-advice">
          {NOT_ADVICE_ALERTS}
        </T>
      </ScrollView>

      {/* FILTER — local to this board, never saved; the dot on the icon says one is on. */}
      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filter alerts" testID="sheet-alerts-filter">
        <View style={{ gap: 16 }}>
          <FilterRow
            label="Grade"
            options={[{ key: 'any', label: 'Any' }, { key: 'a', label: 'A and above' }]}
            value={filter.grade}
            onChange={(grade) => setFilter((f) => ({ ...f, grade }))}
            testID="filter-grade"
          />
          <FilterRow
            label="Direction"
            options={[{ key: 'any', label: 'Any' }, { key: 'long', label: 'Long' }, { key: 'short', label: 'Short' }]}
            value={filter.direction}
            onChange={(direction) => setFilter((f) => ({ ...f, direction }))}
            testID="filter-direction"
          />
          <FilterRow
            label="Show"
            options={[{ key: 'all', label: 'All' }, { key: 'saved', label: 'Saved only' }]}
            value={filter.saved ? 'saved' : 'all'}
            onChange={(v) => setFilter((f) => ({ ...f, saved: v === 'saved' }))}
            testID="filter-saved"
          />
          {!bookmarks.persisted && api.available() ? (
            <T variant="meta" c={color.textSecondary}>Saved alerts are kept on this device until saving is live on the server.</T>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Clear" kind="outline" height={44} onPress={() => setFilter(NO_FILTER)} testID="filter-clear" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Done" height={44} onPress={() => setFilterOpen(false)} testID="filter-done" />
            </View>
          </View>
        </View>
      </Sheet>

      {/* NOT ON YOUR PLAN — SAID, NOT SOLD (App Store 3.1.3(b)). */}
      <Sheet
        visible={!!actions.upgradeNeeded}
        onClose={actions.dismissUpgrade}
        title="Not on your plan"
        testID="sheet-entitlement"
      >
        <T variant="body" c={color.textSecondary}>{actions.upgradeNeeded}</T>
        <Button label="Got it" height={48} onPress={actions.dismissUpgrade} />
      </Sheet>
    </Screen>
  );
}
