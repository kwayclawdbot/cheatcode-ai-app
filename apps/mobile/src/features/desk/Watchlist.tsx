/**
 * The research desk — the companies the desk thinks are worth understanding,
 * and, under them, the names being watched.
 *
 * THE TOP OF THIS SCREEN IS RESEARCH, NOT A TRADE. The companies list has no
 * stop, no target, no trigger and no price to act at, and none may be added:
 * the horizon is years, and a number to act on today is the single thing that
 * would turn it back into an alert board. What each row carries instead is what
 * the business does, in one line, and the desk's grade on the IDEA.
 *
 * WHY IT IS A SEPARATE LIST FROM THE WATCHLIST BELOW IT. The watchlist is what
 * the desk ACTED on — the brain filters it to long and short — so of the
 * twenty-seven companies the desk graded, about eleven reached this screen, and
 * several of those pointed at write-ups carrying no grade, so they drew as
 * ungraded rows. Grading a business and taking a position in it are different
 * events. The research list is the first one, and it is the primary thing this
 * tab exists to show.
 *
 * Below it, two things that answer a different question. The state chip is the
 * chart: has anything happened. The grade is the argument: is this worth
 * anything if it does. Neither is allowed to stand in for the other — a
 * `triggered` on a name whose thesis has broken is still just a chart doing
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
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
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
import { GradeMark, StateChip, LinkRow, px } from './ui';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { ChevronRight } from '../../ui/Icons';
import { LevelTrack, saidDate } from './instruments';
import { ModeControl } from '../home/ModeSheet';
import { secondTab } from '../nav/second-tab';
import type { DeskCompany, DeskWatchRow, DeskWatchlistResponse } from '@shared/desk';
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

  const rows = res.data?.rows ?? [];
  const companies = res.data?.companies ?? [];
  /*
   * ONE COMPANY, ONE ENTRY. A name the desk both graded and took a position in
   * is in `companies` AND in `rows`, and printing it twice under two headings
   * would read as two different opinions of the same business. The research
   * list is the primary presentation, so it keeps the name and the group below
   * drops it. Nothing you added by hand is ever dropped — `manual` is your own
   * list and the desk does not edit it.
   */
  const { picks, manual } = useMemo(() => {
    const listed = new Set(companies.map((c) => c.ticker));
    return {
      picks: rows.filter((r) => r.source === 'pick' && !listed.has(r.ticker)),
      manual: rows.filter((r) => r.source === 'manual'),
    };
  }, [rows, companies]);

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

        <T size={14} lh={20} c={color.muted} style={{ marginTop: space.x10, maxWidth: 460 }}>
          The businesses the desk has read and graded, and under them the names
          it is tracking. The letter grades the idea, not this quarter.
        </T>

        {onTab ? (
          <T size={11} lh={16} c={color.dim} style={{ marginTop: space.x8 }} testID="desk-mode-note">
            {second.note}
          </T>
        ) : null}

        {/* ── the desk's own work ──────────────────────────────── */}
        {res.loading ? (
          <View style={{ paddingVertical: space.x40, alignItems: 'center' }}>
            <ActivityIndicator color={color.violet} />
          </View>
        ) : res.error ? (
          <T size={14} c={color.red} style={{ marginTop: space.x24 }}>{res.error}</T>
        ) : companies.length === 0 && rows.length === 0 ? (
          <Empty onThemes={() => router.push('/desk/themes')} onKai={() => router.push('/home')} />
        ) : (
          <>
            <Companies
              companies={companies}
              onOpen={(t) => router.push(`/desk/pick/${t}`)}
            />
            {picks.length > 0 && (
              <Group
                title="The desk argued for these"
                sub="Positions it took, tracked against a level. A pick is on the list from the day it is made until its horizon runs out."
                rows={picks}
                onPick={(t) => router.push(`/desk/pick/${t}`)}
              />
            )}
          </>
        )}

        {/* ── your own list ────────────────────────────────────── */}
        {/*
          YOURS, AND SEPARATE. The desk publishes above; this is the part of the
          screen you write. Nothing the desk does adds to it, removes from it or
          reorders it, which is why the box that adds a name lives down here
          against your list rather than at the top, where it read as a search
          across the desk's work.
        */}
        <View style={s.yours} testID="desk-yours">
          <Eyebrow c={color.muted}>You added these</Eyebrow>
          <T size={13} lh={19} c={color.dim} style={{ marginTop: space.x4 }}>
            No written argument behind them yet — just a chart being watched.
          </T>

          <View style={s.addRow}>
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
              style={s.addInput}
            />
            <Pressable
              onPress={add}
              disabled={adding || !symbol.trim()}
              accessibilityRole="button"
              testID="desk-add-submit"
              style={({ pressed }) => [
                s.addSubmit,
                { backgroundColor: symbol.trim() ? color.volt : alpha.ivory08, opacity: pressed ? 0.7 : 1 },
              ]}
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

          {manual.length > 0 ? (
            <View style={{ marginTop: space.x8 }}>
              {manual.map((r, i) => (
                <WatchRow
                  key={r.ticker}
                  row={r}
                  last={i === manual.length - 1}
                  onPick={(t) => router.push(`/desk/pick/${t}`)}
                />
              ))}
            </View>
          ) : null}
        </View>

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
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* companies worth understanding                                       */
/* ------------------------------------------------------------------ */

/**
 * The desk's published research list.
 *
 * One row per business: its mark, its name, what it actually does in one line,
 * and the grade on the idea. NOTHING ELSE. No price, no level, no state chip —
 * this list is read on a horizon of years and any number a person could act on
 * today would be answering a question nobody came here with.
 *
 * An empty list says the desk has not published one. It never borrows the
 * watchlist rows to fill the space, and it never draws a placeholder row: on
 * this screen a blank reads as a finding, and a fabricated company would read
 * as research.
 */
function Companies({ companies, onOpen }: {
  companies: DeskCompany[]; onOpen: (ticker: string) => void;
}) {
  const published = saidDate(companies[0]?.asOf ?? null);
  return (
    <View style={s.research} testID="desk-research">
      <T size={22} lh={27} weight="bold" c={color.text}>Companies worth understanding.</T>
      <T size={14} lh={20} c={color.muted} style={{ marginTop: space.x6 }}>
        Clear ideas. Real businesses.
      </T>

      {companies.length === 0 ? (
        <View style={s.researchEmpty} testID="desk-research-empty">
          <T size={13} lh={19} c={color.muted}>
            The desk has not published a list yet. When it does, the companies it
            has read and graded appear here — the watchlist below is a different
            thing and is not stood in for them.
          </T>
        </View>
      ) : (
        <>
          {published ? (
            <T size={11} c={color.dim} style={{ marginTop: space.x8 }} testID="desk-research-asof">
              {`The desk's list, published ${published}.`}
            </T>
          ) : null}
          <View style={{ marginTop: space.x12 }}>
            {companies.map((c, i) => (
              <CompanyRow
                key={c.ticker}
                company={c}
                last={i === companies.length - 1}
                onOpen={onOpen}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/** One business, and the desk's mark on the idea behind it. */
function CompanyRow({ company: c, last, onOpen }: {
  company: DeskCompany; last: boolean; onOpen: (ticker: string) => void;
}) {
  return (
    <LinkRow onPress={() => onOpen(c.ticker)} last={last}>
      <View style={s.companyRow} testID={`desk-company-${c.ticker}`}>
        {/* A ticker never appears as plain text — house rule, one component. */}
        <TickerMark symbol={c.ticker} size={38} />
        <View style={s.companyBody}>
          <Num size={16} weight="bold" c={color.text}>{c.ticker}</Num>
          {c.company ? (
            <T size={13} lh={18} c={color.muted} numberOfLines={1} style={{ marginTop: space.x2 }}>
              {c.company}
            </T>
          ) : null}
          {/* No line written means no line drawn. A dash here would read as a
              company that does nothing rather than as a sentence not yet
              written, and the two are not the same fact. */}
          {c.businessLine ? (
            <T size={12.5} lh={17} c={color.dim} numberOfLines={2} style={{ marginTop: space.x4 }}>
              {c.businessLine}
            </T>
          ) : null}
        </View>
        <View style={s.companyEnd}>
          <IdeaGradePill grade={c.ideaGrade} />
          <ChevronRight size={10} color={color.dim} />
        </View>
      </View>
    </LinkRow>
  );
}

/**
 * The grade, with the word that says what it is a grade OF.
 *
 * A bare letter beside a company reads as a rating of the company. It is a
 * rating of the IDEA — a great business whose future is already in the price is
 * a B — so the label is part of the object rather than a caption somewhere else
 * on the screen. The mark itself is `GradeMark`, unchanged, so this row and the
 * write-up it opens cannot disagree about how a grade looks.
 */
function IdeaGradePill({ grade }: { grade: DeskCompany['ideaGrade'] }) {
  if (!grade) {
    return (
      <T size={11} c={color.dim} style={{ textAlign: 'right' }}>
        not graded
      </T>
    );
  }
  return (
    <View style={s.gradePill}>
      <T size={10} weight="semibold" c={color.dim}>Idea grade</T>
      <GradeMark grade={grade} size={13} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the watchlist rows                                                  */
/* ------------------------------------------------------------------ */

function Group({ title, sub, rows, onPick }: {
  title: string; sub: string; rows: DeskWatchRow[]; onPick: (ticker: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <View style={{ marginTop: space.x30 }}>
      <Eyebrow c={color.muted}>{title}</Eyebrow>
      <T size={13} lh={19} c={color.dim} style={{ marginTop: space.x4 }}>{sub}</T>
      <View style={{ marginTop: space.x8 }}>
        {rows.map((r, i) => (
          <WatchRow key={r.ticker} row={r} last={i === rows.length - 1} onPick={onPick} />
        ))}
      </View>
    </View>
  );
}

/** A tracked name: what the chart is doing, and what it is doing it against. */
function WatchRow({ row: r, last, onPick }: {
  row: DeskWatchRow; last: boolean; onPick: (ticker: string) => void;
}) {
  return (
    <LinkRow onPress={() => onPick(r.ticker)} last={last}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x12 }}>
        <TickerMark symbol={r.ticker} size={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x8 }}>
            <Num size={16} weight="bold" c={color.text}>{r.ticker}</Num>
            <GradeMark grade={r.grade} size={13} />
          </View>
          <T size={12} c={color.dim} numberOfLines={1} style={{ marginTop: space.x2 }}>
            {r.theme ? r.theme.replace(/-/g, ' ') : r.company ?? 'no theme written down'}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: space.x6 }}>
          <Num size={15} weight="semibold" c={color.cyan}>{px(r.price)}</Num>
          {/* The desk used to paint this number in market cyan with
              nothing beside it, and it was whatever the brain last
              wrote — which could be an hour or a fortnight ago. The
              mark says which, and when. */}
          {r.quote ? (
            <FreshnessMark
              freshness={r.quote.freshness ?? 'unknown'}
              delayReason={r.quote.delay_reason}
              at={r.quote.source_ts}
              size={10}
              testID={`desk-freshness-${r.ticker}`}
            />
          ) : null}
          <StateChip state={r.state} />
          {/* Where price sits between the level that kills it and the
              level that arms it. Drawn only when the desk wrote both
              down — half a track would be a picture of a guess. */}
          <LevelTrack price={r.price} trigger={r.triggerPrice} invalidation={r.invalidation} />
        </View>
      </View>
    </LinkRow>
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
          add one yourself below — it starts being read on the next refresh.
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

/*
 * Identity layer: hand-rolled StyleSheet, every value out of `src/ui/tokens.ts`.
 * No raw colour, no hex, no utility class — the desk is one of the surfaces a
 * member would recognise as this product, so it is built the way the rest of
 * that surface is.
 */
const s = StyleSheet.create({
  research: {
    marginTop: space.x30,
  },
  researchEmpty: {
    marginTop: space.x14,
    paddingLeft: space.x12,
    borderLeftWidth: 2,
    borderLeftColor: alpha.ivory16,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x12,
  },
  companyBody: {
    flex: 1,
    minWidth: 0,
  },
  companyEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x8,
  },
  gradePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x6,
    paddingLeft: space.x8,
    paddingRight: space.x4,
    paddingVertical: space.x4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: alpha.violet50,
  },
  yours: {
    marginTop: space.x30,
  },
  addRow: {
    flexDirection: 'row',
    gap: space.x8,
    marginTop: space.x12,
  },
  addInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: space.x14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: alpha.ivory16,
    backgroundColor: alpha.surface60,
    color: color.text,
    fontSize: 15,
  },
  addSubmit: {
    height: 44,
    paddingHorizontal: space.x18,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
