import React, { useMemo } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { ScreenLoading } from '../../ui/Loading';
import { Num } from '../../ui/Text';
// The six ways a surface can have nothing to show — audit F18, one vocabulary
// for the whole app rather than a private empty state per board.
import { CapabilityNotice, capabilityFor, updatedAtLabel } from '../../ui/CapabilityState';
import { alpha, color, radius } from '../../ui/tokens';
import { env } from '../../lib/env';
import { AlertsEmpty, HistoryAlertRow, StandardAlertCard } from './AlertCard';
import { useAlertActions, useAlertsRound4 } from './useAlerts';
import { timeframeForHold, useAlertCandles } from './useAlertCandles';
import { ModeControl } from '../home/ModeSheet';
import { secondTab } from '../nav/second-tab';
import { Avatar } from '../community/ui/Chrome';
import { BeltChip, CommunityCallCard, MemberName, useDeskCalls } from '../social';
import type { AlertBoardTab, AlertCard, AlertCardState, CommunityCall, GoalMode } from '../../lib/types';
import { NOT_ADVICE_ALERTS } from '../legal/disclaimers';

/**
 * Alerts — prototype board "Alerts" + docs/10 §1–§5.
 *
 * Alerts are COMPLETE TRADE OBJECTS, not notifications, and one standard card
 * grammar runs across the board: grade medallion, qualitative scorecard (never
 * fractions), expandable evidence and ONE state-driven primary action that
 * routes into the Trade Portal with the alert context
 * (`/trade/[symbol]?alert=&ctx=alert`). There is no alert-detail destination
 * between the card and the portal. The natural-language composer has moved to
 * `/alert/new`, reached by the plus in this board's header (owner, 7 Sept).
 *
 * This is the Day Trade and Swing face of the second tab. In Invest mode the
 * same tab draws the research desk instead, so the mode chip sits in the
 * header here: the person who changed the mode is the person who has to be
 * able to change it back, and Account is too far to hunt for.
 *
 * ── THREE TABS, AND WHICH THREE CHANGED (owner, 7 Sept) ──────────────────
 * It was Active · Watching · History. Watching was never a different KIND of
 * thing from Active — it is the same alert earlier in its life — so keeping it
 * behind its own tab meant checking two lists to answer the one question the
 * board exists for, "is there anything for me". The watching cards now sit IN
 * Active, unchanged, progress bars and all, sorted after the ones asking for a
 * decision. `ACTIVE_ORDER` below is what makes that one list rather than two
 * stuck together.
 *
 * The tab it freed is COMMUNITY: what MEMBERS of this desk have called, newest
 * first, in the volt card that says a person wrote it. That belongs beside the
 * house's alerts and nowhere near inside them — the two are never mixed into a
 * single list, because volt and violet mean different authors and a list that
 * interleaved them would be teaching the opposite.
 */

const TABS: { key: AlertBoardTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'community', label: 'Community' },
  { key: 'history', label: 'History' },
];

/**
 * ONE LIST, ORDERED BY HOW MUCH IT WANTS YOU.
 *
 * Active holds what the server calls `active` and what it calls `watching`.
 * Concatenating them would show a triggered card, then a dormant one, then
 * another triggered one — the join visible as a stutter in the middle. Sorting
 * the whole set on this single gradient — happening now, ready for you, running,
 * planned, nearly there, being kept an eye on, over — makes the seam disappear,
 * and the sort is stable so the server's own ordering survives inside each rank.
 *
 * `closed` never reaches this list; it is on History. It is here so the record
 * is total and the next lifecycle state cannot be silently ranked zero.
 */
const ACTIVE_ORDER: Record<AlertCardState, number> = {
  entry_reached: 0,
  ready: 1,
  order_pending: 2,
  position_active: 3,
  planned: 4,
  forming: 5,
  watching: 6,
  invalidated: 7,
  closed: 8,
};

function StateTabs({ value, onChange, counts }: {
  value: AlertBoardTab; onChange: (t: AlertBoardTab) => void; counts: Record<AlertBoardTab, number>;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 26, borderBottomWidth: 1, borderBottomColor: alpha.ivory08 }} testID="alerts-tabs">
      {TABS.map((t) => {
        const on = value === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${t.label}, ${counts[t.key]} alerts`}
            testID={`alerts-tab-${t.key}`}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingBottom: 9, marginBottom: -1,
              borderBottomWidth: 2, borderBottomColor: on ? color.volt : 'transparent',
            }}
          >
            <T size={13.5} weight="bold" c={on ? color.text : color.muted}>{t.label}</T>
            {t.key === 'active' && counts.active ? (
              <View style={{ minWidth: 17, height: 17, borderRadius: 9, backgroundColor: color.volt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <T size={9.5} weight="bold" c={color.bg}>{counts.active}</T>
              </View>
            ) : null}
            {t.key !== 'active' && counts[t.key] ? (
              <T size={12} c={color.muted}>{counts[t.key]}</T>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A MEMBER'S CALL ON THE BOARD: the author, then the card.
 *
 * The compact card drops its own authorship block on purpose — in a room the
 * message row above it already carries the avatar, the name and the time. This
 * list is that row. It is also the tap target for the profile: the card's
 * insides are already pressable (the ticker), and on web react-native renders
 * `accessibilityRole="button"` as a real `<button>`, which cannot contain
 * another. So the name is the door, above the card, where a name belongs.
 */
function BoardCallRow({ call }: { call: CommunityCall }) {
  const router = useRouter();
  return (
    <View style={{ gap: 7 }} testID={`board-call-${call.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${call.author.display_name}, open their profile`}
        accessibilityHint="Everything they have published, and how it turned out."
        testID={`board-call-author-${call.id}`}
        onPress={() => router.push(`/contributor/${encodeURIComponent(call.author.user_id)}` as never)}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 2, opacity: pressed ? 0.65 : 1,
        })}
      >
        <Avatar initial={call.author.initial} url={call.author.avatar_url} size={22} />
        {/* NO `userId` HERE. The whole row above is already the door, and on
            web react-native renders `accessibilityRole="button"` as a real
            <button> — a second one inside it is illegal markup. This call is
            only asking `MemberName` for the belt ink, so that a name is the
            same colour on this board as it is everywhere else. */}
        <MemberName
          name={call.author.display_name}
          belt={call.author.belt}
          handle={call.author.handle}
          showHandle
          size={12.5}
          handleSize={10.5}
          testID={`board-call-name-${call.id}`}
        />
        <BeltChip belt={call.author.belt} />
        <View style={{ flex: 1 }} />
        <T size={10.5} c={color.dim}>{call.time_label}</T>
      </Pressable>
      <CommunityCallCard call={call} compact />
    </View>
  );
}

export function AlertsBoard({ mode }: { mode: GoalMode }) {
  const router = useRouter();
  /** Fixtures preview only — lets the owner and Playwright see the quiet day. */
  const params = useLocalSearchParams<{ fixture?: string }>();
  /*
   * THE MODE IS PART OF THE QUESTION, so it is an argument and not just a
   * caption in the header.
   *
   * `/alerts` is scoped on the server by the profile's mode, and the app read
   * it without ever mentioning which mode it was asking about. So the switch
   * wrote the new mode, the header redrew, and the list underneath kept the
   * answer to the old question — a day trader looking at swing picks until he
   * happened to change tab. Passing it here is what makes the board re-ask.
   */
  const { data, loading, error, isFixture, reload, tab, setTab, checkedAt } = useAlertsRound4(
    mode,
    env.FIXTURES && params.fixture === 'empty' ? 'empty' : 'default',
  );
  const actions = useAlertActions(reload);
  const second = secondTab(mode);
  /** This desk's member calls. A separate route, never folded into `/alerts`. */
  const calls = useDeskCalls(mode);
  const callList = calls.data ?? [];

  /**
   * ACTIVE, FOLDED. The server's two lists become one, then sort onto the one
   * gradient. Nothing is dropped and nothing is re-styled: a watching card is
   * the same `StandardAlertCard` it always was, progress bar included.
   */
  const activeList = useMemo<AlertCard[]>(() => {
    if (!data) return [];
    return [...data.active, ...data.watching]
      .sort((a, b) => ACTIVE_ORDER[a.state] - ACTIVE_ORDER[b.state]);
  }, [data]);

  /**
   * THE BARS THE ALERT WIRE DOES NOT CARRY.
   *
   * The card draws its levels on a price map now, and an alert payload has no
   * price history in it — the bars live behind `/market/candles`, the same
   * lane the trade portal reads. Asking here rather than inside the card keeps
   * one request per symbol for the whole board however many cards want it, and
   * keeps the card a pure function of what it was handed.
   *
   * A daily bar is the wrong picture for an intraday plan, so the timeframe
   * follows the hold: a day trade drawn on dailies would put every level
   * inside a single candle. Anything the fetch does not return is simply
   * absent, and the card falls back to the levels on an honest empty chart.
   */
  const candleRequests = useMemo(
    () => activeList.map((a) => ({ symbol: a.symbol, tf: timeframeForHold(a.trade.hold) })),
    [activeList],
  );
  const candles = useAlertCandles(candleRequests);

  /**
   * COUNTS THAT ARE TRUE, and each one true in its own way.
   *
   * Active is the server's own `active` + `watching` numbers added together —
   * two counts the API sends, not a guess about a list we might only have half
   * of. Community is `callList.length`, the calls actually on screen, because
   * that route sends no count and inventing one would be the exact lie this
   * board keeps not telling. History is unchanged.
   */
  const counts = useMemo<Record<AlertBoardTab, number>>(() => ({
    active: (data?.counts.active ?? data?.active.length ?? 0)
      + (data?.counts.watching ?? data?.watching.length ?? 0),
    community: callList.length,
    history: data?.counts.history ?? data?.history.length ?? 0,
  }), [data, callList.length]);

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-alerts">
        <ScreenLoading label="Checking what Kai is watching…" />
      </Screen>
    );
  }

  /**
   * A quiet day has to lead somewhere. Each offer below is a route that
   * already exists — Kai on Home, the other tab, a company page, a member's
   * own call — so an empty list is a fork in the road rather than a wall.
   */
  const askKai = { label: 'Ask Kai what he sees', testID: 'alerts-empty-kai', onPress: () => router.push('/home') };
  const lookUp = { label: 'Look up a company', testID: 'alerts-empty-search', onPress: () => router.push('/symbol/search') };
  const seeCommunity = {
    label: counts.community === 1 ? 'See the 1 member call' : `See the ${counts.community} member calls`,
    testID: 'alerts-empty-community',
    onPress: () => setTab('community'),
  };
  const publishCall = {
    label: 'Publish a call',
    testID: 'alerts-empty-publish',
    onPress: () => router.push('/community/call/new'),
  };

  const offers =
    tab === 'active'
      ? (counts.community ? [seeCommunity, askKai] : [askKai, lookUp])
      : tab === 'community'
      ? [publishCall, lookUp]
      : [askKai];

  /**
   * QUIET IS NOT THE SAME AS UNANSWERED — audit F18.
   *
   * This board used to render the empty state whenever the list was short and
   * print the error, if there was one, as a grey line UNDERNEATH it. So a
   * failed load looked exactly like a verified quiet day plus a footnote, which
   * is the one confusion the finding says must not be possible: "a failed load
   * cannot be mistaken for a verified empty list."
   *
   * `capabilityFor` is the shared decision (`ui/CapabilityState.tsx`). Three of
   * its inputs are the whole argument:
   *
   *   · `verified` is TRUE only when a payload actually arrived and the last
   *     request did not fail. Nothing else may produce a "Nothing here" screen.
   *   · `failed` with data in hand is STALE, not failed — a poll that missed
   *     must not throw away cards that were true when they landed.
   *   · Community is asked separately because it is a separate route. Its
   *     `notAvailable` is a stack that never shipped the endpoint, which is a
   *     real answer about the service and not an empty list of calls.
   */
  const visible: AlertCard[] | CommunityCall[] =
    tab === 'history' ? (data?.history ?? []) : tab === 'community' ? callList : activeList;
  const answered = tab === 'community' ? calls.data != null : !!data;
  const failed = tab === 'community' ? !!calls.error || calls.notAvailable : !!error;
  const capability = capabilityFor({
    hasData: answered && visible.length > 0,
    loading: tab === 'community' ? calls.loading : loading,
    failed,
    verified: answered && !failed,
    empty: visible.length === 0,
  });

  /** The sentence is always this board's, never the shared component's. */
  const failedPlain =
    tab === 'community'
      ? calls.notAvailable
        ? "Member calls aren't live on this stack yet."
        : (calls.error ?? 'I could not read what members have called.')
      : (error ?? 'I could not read your alerts just now.');
  const retry = tab === 'community' ? calls.reload : reload;
  /* A stack that has not shipped the route cannot be retried into existence. */
  const onRetry = tab === 'community' && calls.notAvailable ? undefined : retry;

  return (
    <Screen variant="corner" layout="tab" testID="screen-alerts">
      <View style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 6, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <T size={28} weight="bold">{second.title}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/*
              Where the natural-language bar went. `/alert/new` is the same
              builder on its own screen, and it was reachable from a company
              page and a plan but not from the board that is about alerts.
            */}
            <Pressable
              testID="alerts-new"
              accessibilityRole="button"
              accessibilityLabel="New alert"
              accessibilityHint="Describe what to watch and Kai reads it back before anything is set."
              onPress={() => router.push('/alert/new' as never)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => ({
                width: 30, height: 30, borderRadius: radius.pill,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 0.5, borderColor: alpha.ivory24,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <T size={16} weight="regular" c={color.muted}>+</T>
            </Pressable>
            <ModeControl mode={mode} testID="alerts-mode-chip" />
          </View>
        </View>
        <T size={11} lh={16} c={color.dim} testID="alerts-mode-note">{second.note}</T>
        <StateTabs value={tab} onChange={setTab} counts={counts} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 11 }}
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
          <AlertsEmpty
            copy={
              tab === 'history'
                ? 'Nothing has finished yet. Executed, closed and invalidated alerts land here, and the record is worth more than the list.'
                : tab === 'community'
                // NOT the alerts payload's `empty_copy`. That sentence is about
                // what Kai is or is not seeing, and this list is not Kai's.
                ? 'Nobody on this desk has published a call yet. A call is a member saying what they are doing and letting it be checked later — yours can be the first.'
                // Active takes the server's sentence when there is one. The
                // server is the half that knows which mode the board is in, and
                // an empty Active tab means something different in Day Trade
                // than it does in Swing. The string below is the fallback for an
                // offline or fixture render, not a second opinion.
                : data?.empty_copy ?? 'Nothing needs a decision right now. Kai moves an alert here the moment a verified event happens — no alert is better than a made-up one.'
            }
            offers={offers}
          />
        ) : (
          <>
            {/* Cards that were true when they landed, and a refresh that did
                not. Both facts on screen, neither pretending to be the other. */}
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
              ? (data?.history ?? []).map((a) => <HistoryAlertRow key={a.id} alert={a} />)
              : tab === 'community'
              ? callList.map((c) => <BoardCallRow key={c.id} call={c} />)
              : activeList.map((a) => (
                  /* The bars are fetched by the board, not the card: one
                     request per symbol however many cards want it, and the card
                     stays a pure function of what it was handed. */
                  <StandardAlertCard
                    key={a.id}
                    alert={a}
                    candles={candles[a.symbol.toUpperCase()]}
                  />
                ))}
          </>
        )}

        {actions.error ? <T size={11} c={color.red} align="center">{actions.error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample alerts — the alerts service is not connected here.</T> : null}
      </ScrollView>

      {/*
        THE PREVIEW THAT BELONGED TO THE BAR WENT WITH IT.

        `useAlertBuilder`'s preview card and its error line were only ever
        reachable through the natural-language bar removed below: nothing else
        on this board calls `builder.build()`, so with the bar gone the card
        could not be made to appear by any sequence of taps. Leaving it would
        have left forty lines of UI that reads as live and is not, which is the
        kind of thing that gets "fixed" by somebody months from now who cannot
        work out why it never shows. `/alert/new` has the same read-it-back step
        on its own screen, where it is reachable.
      */}

      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        {/*
          THE "TELL ME WHEN TSLA DROPS BELOW 170…" BAR IS GONE FROM HERE.

          It was a violet Kai bar pinned above the disclaimer on every one of
          the three tabs, so it sat under the board whether you were reading
          alerts, member calls or history — a permanent input for a thing most
          visits are not there to do.

          THE CAPABILITY DID NOT GO WITH IT. That bar built an alert out of a
          sentence, and the same builder is a whole screen at `/alert/new`
          ("New alert — Tell Kai what to watch"), which was already reachable
          from a company page and from a plan. What it was NOT reachable from
          was this board, which is the one place somebody thinking about alerts
          actually is — so the header now carries a plus that goes there. The
          bar became a button, and the button is one line instead of a
          46pt gradient with its own text field.

          THE DISCLAIMER STAYS. It is about the alerts on the board, not about
          the composer that used to sit above it, and it is the one line here
          that is not clutter.
        */}
        <T size={9.5} lh={14} c={color.dim} align="center" style={{ marginTop: 8 }} testID="alerts-not-advice">
          {NOT_ADVICE_ALERTS}
        </T>
      </View>

      {/* NOT ON YOUR PLAN — SAID, NOT SOLD.
          The title used to read "That needs the premium plan" and the action
          was "See what premium adds", which opened a price ladder. Inside the
          iOS app that is a route to a purchase, and App Store rule 3.1.3(b)
          forbids it in an app that honours a subscription bought on the web.
          The server's own sentence still explains exactly what happened. */}
      <Sheet
        visible={!!actions.upgradeNeeded}
        onClose={actions.dismissUpgrade}
        title="Not on your plan"
        testID="sheet-entitlement"
      >
        <T size={13} lh={20} c={color.muted}>{actions.upgradeNeeded}</T>
        <Button label="Got it" kind="volt" height={48} onPress={actions.dismissUpgrade} />
      </Sheet>
    </Screen>
  );
}
