/**
 * The research desk — what the brain is holding, and what price is doing to it.
 *
 * Two things live on one screen because they answer one question. The state
 * chip is the chart: has anything happened. The grade is the argument: is this
 * worth anything if it does. Neither is allowed to stand in for the other —
 * a `triggered` on a name whose thesis has broken is still just a chart doing
 * something, and the desk keeps both in view on purpose.
 *
 * Passes are not here. The desk wrote those up and declined; watching
 * something you declined is how a watchlist becomes a junk drawer.
 *
 * ONE component, TWO ways in. In Invest mode it is the second tab; from the
 * Account board it is a pushed screen, in every mode. The `variant` is the only
 * difference between them: the tab carries the mode control, because the tab is
 * where the mode did something visible.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { TickerMark } from '../../ui/Ticker';
import { alpha, color, radius, space, type as typeScale } from '../../ui/tokens';
import { api, ApiError } from '../../lib/api';
import { env } from '../../lib/env';
import { fixtureDeskWatchlist, fixtureDeskWatchlistEmpty } from '../../lib/fixtures';
import { useResource } from '../../lib/useResource';
import { useSession } from '../../lib/session';
import { GradeMark, StateChip, WatchStateHelp, px } from './ui';
import { IDEA_GRADE_MEANS, horizonPlain } from './plain';
import { Sheet } from '../../ui/Sheet';
import { CapabilityNotice } from '../../ui/CapabilityState';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { LevelTrack } from './instruments';
import { ModeControl } from '../home/ModeSheet';
import { secondTab } from '../nav/second-tab';
import type { DeskWatchRow, DeskWatchlistResponse, WatchState } from '@shared/desk';
import type { GoalMode } from '../../lib/types';

export function DeskWatchlist({ variant = 'stack' }: { variant?: 'tab' | 'stack' }) {
  const router = useRouter();
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const second = secondTab(mode);
  const onTab = variant === 'tab';

  /** Fixtures preview only — lets the owner and Playwright see the empty desk. */
  const params = useLocalSearchParams<{ fixture?: string }>();
  const empty = env.FIXTURES && params.fixture === 'empty';

  const load = useCallback(() => api.deskWatchlist(), []);
  /*
    ONE REQUEST FOR THE WHOLE LIST, ON THE QUOTE CADENCE.
    `/desk/watchlist` returns every row with its price already attached — the
    server batches the symbols into a single snapshot call behind it — so the
    board refreshes by asking that one endpoint again. A per-row poll would be
    the same data at twenty times the cost and is never worth writing.
  */
  const res = useResource<DeskWatchlistResponse>(
    load,
    empty ? fixtureDeskWatchlistEmpty : fixtureDeskWatchlist,
    [empty],
    { kind: 'quote' },
  );

  const [symbol, setSymbol] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  /** Which state chip was tapped. Null closes the explainer. */
  const [explain, setExplain] = useState<WatchState | null>(null);

  const rows = res.data?.rows ?? [];
  const { picks, manual } = useMemo(() => ({
    picks: rows.filter((r) => r.source === 'pick'),
    manual: rows.filter((r) => r.source === 'manual'),
  }), [rows]);

  const add = useCallback(async () => {
    const t = symbol.trim().toUpperCase();
    if (!t) return;
    setAdding(true); setAddError(null); setAdded(null);
    try {
      await api.deskAddWatch(t);
      setSymbol(''); setAdded(t);
      res.reload();
    } catch (e) {
      setAddError(e instanceof ApiError ? e.message : 'That did not go through. Try again.');
    } finally {
      setAdding(false);
    }
  }, [symbol, res]);

  return (
    <Screen variant="corner" layout={onTab ? 'tab' : 'stack'} testID="desk-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: onTab ? 20 : 0, paddingBottom: onTab ? 24 : 60 }}
      >
        {!onTab && (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            testID="desk-back"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => ({ marginBottom: space.x14, opacity: pressed ? 0.6 : 1 })}
          >
            <T size={13} c={color.volt}>‹ Back</T>
          </Pressable>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.x12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow c={color.violetLight}>Kai · research desk</Eyebrow>
            <T size={typeScale.screenTitle.size} weight="bold" c={color.text} style={{ marginTop: space.x8 }}>
              {onTab ? second.title : 'The watchlist'}
            </T>
          </View>
          {onTab ? <ModeControl mode={mode} testID="desk-mode-chip" /> : null}
        </View>

        {/*
          THE TWO MARKS, NAMED BEFORE THEY APPEAR — audit F15.

          This paragraph used to say "the chip is what the chart is doing, the
          letter is how good the idea is". Both halves were true and neither was
          usable: the chip printed `armed`, and "the letter" was a bare A− that
          a member has already met on an alert card meaning something else
          entirely. So the chip prints English now, the grade says the words
          "Idea grade", and this line says what an idea grade IS rather than
          what it is not.
        */}
        <T size={14} lh={20} c={color.muted} style={{ marginTop: space.x10, maxWidth: 460 }}>
          Every company the desk argued for, plus anything you added. Each one
          has an <T size={14} lh={20} weight="semibold" c={color.text}>idea grade</T> — how
          good the argument for the company is over the next few quarters — and a
          line saying what its share price is doing. Tap either to have it
          explained.
        </T>
        <T size={13} lh={19} c={color.dim} style={{ marginTop: space.x6, maxWidth: 460 }} testID="desk-grade-means">
          {IDEA_GRADE_MEANS}
        </T>

        {onTab ? (
          <T size={11} lh={16} c={color.dim} style={{ marginTop: space.x8 }} testID="desk-mode-note">
            {second.note}
          </T>
        ) : null}

        {/* ── add a ticker ─────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: space.x8, marginTop: space.x20 }}>
          <TextInput
            value={symbol}
            onChangeText={(v) => { setSymbol(v.toUpperCase()); setAddError(null); setAdded(null); }}
            placeholder="Add a ticker"
            placeholderTextColor={color.dim}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={add}
            accessibilityLabel="Add a ticker to the watchlist"
            testID="desk-add-input"
            style={{
              flex: 1, height: 44, paddingHorizontal: space.x14,
              borderRadius: radius.lg, borderWidth: 1, borderColor: alpha.ivory16,
              backgroundColor: alpha.surface60, color: color.text, fontSize: 15,
            }}
          />
          <Pressable
            onPress={add}
            disabled={adding || !symbol.trim()}
            accessibilityRole="button"
            testID="desk-add-submit"
            style={({ pressed }) => ({
              height: 44, paddingHorizontal: space.x18, borderRadius: radius.lg,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: symbol.trim() ? color.volt : alpha.ivory08,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {adding
              ? <ActivityIndicator size="small" color={color.bg} />
              : <T size={14} weight="bold" c={symbol.trim() ? color.bg : color.dim}>Watch</T>}
          </Pressable>
        </View>
        {addError ? (
          <T size={13} c={color.red} style={{ marginTop: space.x8 }}>{addError}</T>
        ) : added ? (
          <T size={13} c={color.green} style={{ marginTop: space.x8 }}>
            {added} is on the list. The next refresh starts reading its chart.
          </T>
        ) : null}

        {/* ── the list ─────────────────────────────────────────── */}
        {res.loading ? (
          <View style={{ paddingVertical: space.x40, alignItems: 'center' }}>
            <ActivityIndicator color={color.violet} />
          </View>
        ) : res.error ? (
          /*
            A FAILED READ IS NOT AN EMPTY DESK — audit F18's rule, applied here
            because this branch and the empty one sit next to each other and a
            line of red text is not a state. A stack that never shipped the
            route gets the same notice without a retry: asking again cannot
            deploy an endpoint.
          */
          <View style={{ marginTop: space.x24 }}>
            <CapabilityNotice
              state="failed"
              plain={res.error}
              detail="Nothing here was checked and found empty."
              onRetry={res.notAvailable ? undefined : res.reload}
              testID="desk-failed"
            />
          </View>
        ) : rows.length === 0 ? (
          <Empty onThemes={() => router.push('/desk/themes')} onKai={() => router.push('/home')} />
        ) : (
          <>
            <Group
              title="The desk argued for these"
              sub="A pick is on the list from the day it is made until its horizon runs out."
              rows={picks}
              onPick={(t) => router.push(`/desk/pick/${t}`)}
              onExplainState={setExplain}
            />
            {manual.length > 0 && (
              <Group
                title="You added these"
                sub="No written argument behind them yet — just a chart being watched."
                rows={manual}
                onPick={(t) => router.push(`/desk/pick/${t}`)}
                onExplainState={setExplain}
              />
            )}
          </>
        )}

        <Pressable
          onPress={() => router.push('/desk/themes')}
          accessibilityRole="button"
          testID="desk-themes-link"
          style={{ marginTop: space.x30 }}
        >
          {/* ObjectCard carries no padding of its own — every caller sets it. */}
          <ObjectCard tone="kai" style={{ padding: space.x16 }}>
            <Eyebrow c={color.violetLight}>Where the names come from</Eyebrow>
            <T size={17} weight="bold" c={color.text} style={{ marginTop: space.x6 }}>
              Every theme the desk is reading
            </T>
            <T size={13} lh={19} c={color.muted} style={{ marginTop: space.x6 }}>
              Judged on how much moves if it is right, never on how much is
              being written about it. Size and timing are scored separately.
            </T>
          </ObjectCard>
        </Pressable>

        {res.isFixture ? (
          <T size={10} c={color.dim} style={{ marginTop: space.x16 }}>
            Sample desk — the research service is not connected here.
          </T>
        ) : null}
      </ScrollView>

      {/*
        EACH WATCH STATE, EXPLAINED ON DEMAND — audit F15 asks for exactly this.
        All nine are listed rather than only the one tapped, because the useful
        question is "what are the possibilities"; the one tapped is highlighted
        so the answer to "what does mine mean" is still one glance.
      */}
      <Sheet
        visible={explain !== null}
        onClose={() => setExplain(null)}
        title="What the share price is doing"
        testID="desk-state-sheet"
      >
        <WatchStateHelp highlight={explain ?? undefined} />
      </Sheet>
    </Screen>
  );
}

/**
 * ONE COMPANY, LED BY THE COMPANY — audit F15.
 *
 * The row this replaces put the TICKER at 16 bold and its second line was the
 * theme slug with the hyphens taken out ("humanoid robotics"), falling back to
 * the company name only when there was no theme. So the name of the business
 * was the thing most likely to be missing from a row about a business, and
 * everything a beginner could actually use — what it is, why it is here, how
 * long for — was either absent or in the desk's own shorthand.
 *
 * The order now is the order the board prints: who it is, what price is doing,
 * why it is on the desk, how long the desk is giving it, and only then the
 * state of the chart — which is a tappable explanation rather than a word.
 *
 * WHAT IS STILL NOT HERE, ON PURPOSE: a sentence about what the company does.
 * `/desk/watchlist` does not carry one — the write-up does, and the pick screen
 * one tap away leads with it. Inventing a description on this row from the
 * theme and the ticker is exactly the fabrication the desk exists not to do.
 */
function WatchRow({ row, onPick, onExplainState }: {
  row: DeskWatchRow; onPick: () => void; onExplainState: (state: WatchState) => void;
}) {
  const horizon = horizonPlain(row.horizon);
  const theme = row.theme ? row.theme.replace(/-/g, ' ') : null;
  return (
    <View style={{ gap: space.x8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x12 }}>
        <TickerMark symbol={row.ticker} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* The NAME first, at a size somebody reads, with the ticker under
              it — a person who chose investing knows "Apple", not "AAPL". */}
          <T size={16} weight="bold" c={color.text} numberOfLines={2}>
            {row.company ?? row.ticker}
          </T>
          <Num size={13} c={color.dim} style={{ marginTop: space.x2 }}>{row.ticker}</Num>
        </View>
        <View style={{ alignItems: 'flex-end', gap: space.x4 }}>
          <Num size={17} weight="semibold" c={color.cyan}>{px(row.price)}</Num>
          {/* The desk used to paint this number in market cyan with nothing
              beside it, and it was whatever the brain last wrote — which could
              be an hour or a fortnight ago. The mark says which, and when. */}
          {row.quote ? (
            <FreshnessMark
              freshness={row.quote.freshness ?? 'unknown'}
              delayReason={row.quote.delay_reason}
              at={row.quote.source_ts}
              size={10}
              testID={`desk-freshness-${row.ticker}`}
            />
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.x8 }}>
        <GradeMark grade={row.grade} size={14} label testID={`desk-grade-${row.ticker}`} />
        <StateChip
          state={row.state}
          onExplain={() => onExplainState(row.state)}
          testID={`desk-state-${row.ticker}`}
        />
      </View>

      {/* WHY IT IS ON THE DESK. The theme is the desk's own answer and it is
          printed as one, rather than as a caption under the ticker where it
          read like a category. A hand-added name says what it is instead. */}
      <T size={13} lh={19} c={color.muted} testID={`desk-why-${row.ticker}`}>
        {row.source === 'manual'
          ? 'You added this one. There is no written argument behind it yet — the desk is only watching the chart.'
          : theme
          ? `On the desk because of its ${theme} theme.`
          : 'The desk wrote an argument for this one. Open it to read why.'}
      </T>

      <T size={12} c={horizon.known ? color.muted : color.dim} testID={`desk-horizon-${row.ticker}`}>
        {horizon.text}
      </T>

      {/* Where price sits between the level that kills it and the level that
          arms it. Drawn only when the desk wrote both down — half a track
          would be a picture of a guess. */}
      <LevelTrack price={row.price} trigger={row.triggerPrice} invalidation={row.invalidation} />

      <Pressable
        onPress={onPick}
        accessibilityRole="button"
        accessibilityLabel={`Understand ${row.company ?? row.ticker}`}
        accessibilityHint="Opens what the company does, why it is being watched and what could change"
        testID={`desk-explore-${row.ticker}`}
        style={({ pressed }) => ({
          minHeight: 40, alignSelf: 'flex-start', paddingHorizontal: space.x14,
          alignItems: 'center', justifyContent: 'center',
          borderRadius: radius.pill, borderWidth: 1, borderColor: alpha.volt55,
          backgroundColor: alpha.volt10, opacity: pressed ? 0.7 : 1,
        })}
      >
        <T size={13} weight="semibold" c={color.volt}>
          {`Understand ${row.ticker}`}
        </T>
      </Pressable>
    </View>
  );
}

/**
 * THE ROW IS NOT A BUTTON ANY MORE, AND IT CANNOT BE.
 *
 * It used to be one `LinkRow` — the whole row a single tap target. It now
 * carries TWO actions of its own (explain this state, understand this company)
 * and on web react-native renders `accessibilityRole="button"` as a real
 * `<button>`, which may not contain another. The same rule already governs the
 * community call rows on the alerts board; the answer there and here is the
 * same: the row is a container, and the things inside it that do something are
 * the things you press.
 */
function Group({ title, sub, rows, onPick, onExplainState }: {
  title: string; sub: string; rows: DeskWatchRow[];
  onPick: (ticker: string) => void; onExplainState: (state: WatchState) => void;
}) {
  if (!rows.length) return null;
  return (
    <View style={{ marginTop: space.x30 }}>
      <Eyebrow c={color.muted}>{title}</Eyebrow>
      <T size={13} lh={19} c={color.dim} style={{ marginTop: space.x4 }}>{sub}</T>
      <View style={{ marginTop: space.x8 }}>
        {rows.map((r, i) => (
          <View
            key={r.ticker}
            testID={`desk-row-${r.ticker}`}
            style={{
              paddingVertical: space.x14,
              borderBottomWidth: i === rows.length - 1 ? 0 : 1,
              borderBottomColor: alpha.ivory08,
            }}
          >
            <WatchRow row={r} onPick={() => onPick(r.ticker)} onExplainState={onExplainState} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * An empty desk, with somewhere to go.
 *
 * A new account has no picks against its name, and saying so is the honest
 * answer. But the themes are already there and already judged — the work
 * exists before any single name does — so the empty list points at it rather
 * than leaving a person on a screen with one text box and no reason to trust
 * it.
 */
function Empty({ onThemes, onKai }: { onThemes: () => void; onKai: () => void }) {
  return (
    <View style={{ marginTop: space.x30 }} testID="desk-empty">
      <ObjectCard style={{ padding: space.x16 }}>
        <T size={15} weight="bold" c={color.text}>Nothing on the list yet</T>
        <T size={13} lh={19} c={color.muted} style={{ marginTop: space.x6 }}>
          The desk puts a name here when it writes an argument for it. You can
          add one yourself above — it starts being read on the next refresh.
          The themes are already judged either way, and that is where the names
          come from.
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x8, marginTop: space.x14 }}>
          <Offer label="See what the desk is reading" onPress={onThemes} testID="desk-empty-themes" />
          <Offer label="Ask Kai where to start" onPress={onKai} testID="desk-empty-kai" />
        </View>
      </ObjectCard>
    </View>
  );
}

function Offer({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => ({
        height: 38, paddingHorizontal: space.x14, borderRadius: radius.pill,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: alpha.volt55, backgroundColor: alpha.volt10,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <T size={12.5} weight="semibold" c={color.volt}>{label}</T>
    </Pressable>
  );
}
