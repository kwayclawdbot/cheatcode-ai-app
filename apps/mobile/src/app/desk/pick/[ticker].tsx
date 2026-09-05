/**
 * One written argument, in full.
 *
 * The old screen was right about what to show and wrong about how. It printed
 * an eleven-thousand-character argument as a single block of prose with three
 * numbers stacked above it, and nobody could see the shape of a write-up
 * without reading all of it.
 *
 * So the top of the screen is now an instrument panel — the grade on its
 * six-step scale, the call as a direction, the time frame as a run of
 * quarters, the potential move as an open measure, and the theme's own size and
 * timing read straight off the theme table. Each is drawn as the thing it is,
 * on one ruled strip, rather than dropped into a grid of identical boxes.
 *
 * Below it the order is still the order the desk commits in: the idea in a
 * breath, then the thing that would prove it wrong, then why the grade, then
 * the evidence, then the dated events, then the argument itself broken into the
 * sections the desk already wrote it in.
 *
 * Nothing here trades. A desk pick is a horizon in quarters and a company you
 * have an opinion about; the entry is a separate question this screen does not
 * answer and must not imply.
 */
import React, { useCallback } from 'react';
import { ScrollView, View, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../ui/Screen';
import { T, Num, Eyebrow } from '../../../ui/Text';
import { TickerMark } from '../../../ui/Ticker';
import { alpha, color, radius, space } from '../../../ui/tokens';
import { api } from '../../../lib/api';
import { env } from '../../../lib/env';
import { fixtureDeskPick } from '../../../lib/fixtures';
import { useResource } from '../../../lib/useResource';
import { Falsifier, GradeLegs, GradeMark, UnfinishedNote, money } from '../../../features/desk/ui';
import {
  Bay, BaySplit, CallMark, CatalystSpine, GradeScale, HorizonTrack, Ledger,
  PotentialMove, Provenance, Scoreboard, Strip, ThemeGauges,
} from '../../../features/desk/instruments';
import { ThesisReader } from '../../../features/desk/ThesisReader';
import { settlesOn, type DeskPickResponse } from '@shared/desk';

export default function DeskPickDetail() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const router = useRouter();
  const symbol = (ticker ?? '').toUpperCase();

  const load = useCallback(() => api.deskPick(symbol), [symbol]);
  const res = useResource<DeskPickResponse>(load, env.FIXTURES ? fixtureDeskPick(symbol) : null, [symbol]);

  if (res.loading) {
    return (
      <Screen variant="dome" layout="stack">
        <View style={{ paddingVertical: space.x40, alignItems: 'center' }}>
          <ActivityIndicator color={color.violet} />
        </View>
      </Screen>
    );
  }
  if (res.error || !res.data) {
    return (
      <Screen variant="dome" layout="stack">
        <T size={15} c={color.text}>{res.error ?? `Nothing written up for ${symbol}.`}</T>
        <Pressable onPress={() => router.back()} style={{ marginTop: space.x16 }}>
          <T size={14} c={color.volt}>Back to the watchlist</T>
        </Pressable>
      </Screen>
    );
  }

  const { pick, alsoWrittenUp, themeJudgement } = res.data;

  return (
    <Screen variant="dome" layout="stack" testID="desk-pick-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 70 }}>
        {/* ── who ──────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x12 }}>
          <TickerMark symbol={pick.ticker} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Num size={26} weight="bold" c={color.text}>{pick.ticker}</Num>
            <T size={13} c={color.dim} numberOfLines={1}>{pick.company ?? '—'}</T>
          </View>
          <View style={{ alignItems: 'flex-end', gap: space.x4 }}>
            {pick.marketCap != null && (
              <Num size={13} weight="semibold" c={color.muted}>{money(pick.marketCap)}</Num>
            )}
            {pick.pickDate && <T size={11} c={color.dim}>written {pick.pickDate}</T>}
          </View>
        </View>

        {/* ── the idea in a breath ─────────────────────────────── */}
        {pick.hypothesis ? (
          <View
            testID="desk-pick-hypothesis"
            style={{
              marginTop: space.x18, paddingLeft: space.x14,
              borderLeftWidth: 3, borderLeftColor: color.violet,
            }}
          >
            <Eyebrow c={color.violetLight}>The desk went looking for</Eyebrow>
            <T size={15} lh={22} c={color.text} style={{ marginTop: space.x6 }}>
              {pick.hypothesis}
            </T>
          </View>
        ) : null}

        {pick.unfinished && <UnfinishedNote />}

        {/* ── the instrument panel ─────────────────────────────── */}
        {/* One ruled strip, internally divided. Deliberately not a grid of
            cards: each reading is drawn as the thing it measures. */}
        <Strip style={{ marginTop: space.x20 }} testID="desk-pick-panel">
          <Bay first>
            <GradeScale grade={pick.grade} />
          </Bay>

          <BaySplit
            left={<CallMark direction={pick.unfinished ? null : pick.direction} status={pick.status} />}
            right={<HorizonTrack horizon={pick.horizon} />}
          />

          <Bay>
            <PotentialMove pct={pick.potentialMovePct} />
          </Bay>

          {themeJudgement ? (
            <Bay>
              <Pressable
                onPress={() => router.push(`/desk/theme/${encodeURIComponent(themeJudgement.theme)}`)}
                accessibilityRole="button"
                testID="desk-pick-theme-link"
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x8 }}>
                  <Eyebrow c={color.violetLight}>Found under</Eyebrow>
                  {pick.themeRank === 1 && (
                    <T size={10} weight="bold" c={color.violetLight}>· BEST FIT IN THE THEME</T>
                  )}
                  <T size={12} c={color.volt} style={{ marginLeft: 'auto' }}>open ›</T>
                </View>
                <T size={17} weight="bold" c={color.text} style={{ marginTop: space.x4 }}>
                  {themeJudgement.theme.replace(/-/g, ' ')}
                </T>
                <View style={{ marginTop: space.x12 }}>
                  <ThemeGauges
                    magnitude={themeJudgement.magnitude}
                    timeline={themeJudgement.timeline}
                    conviction={themeJudgement.conviction}
                    trajectory={themeJudgement.trajectory}
                    outOfFavour={themeJudgement.outOfFavour}
                  />
                </View>
              </Pressable>
            </Bay>
          ) : pick.theme ? (
            <Bay>
              <Pressable
                onPress={() => router.push(`/desk/theme/${encodeURIComponent(pick.theme!)}`)}
                accessibilityRole="button"
                testID="desk-pick-theme-link"
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Eyebrow c={color.violetLight}>Found under</Eyebrow>
                <T size={17} weight="bold" c={color.text} style={{ marginTop: space.x4 }}>
                  {pick.theme.replace(/-/g, ' ')}
                </T>
                <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x6 }}>
                  The desk is no longer judging this theme, so its size and
                  timing are not being shown.
                </T>
              </Pressable>
            </Bay>
          ) : null}
        </Strip>

        {/* ── how it actually did ──────────────────────────────── */}
        {/* Placed directly under the panel, ahead of everything the desk
            merely argued, because a result outranks an argument. On a call
            that has not run its course it is the starting line and the date
            it settles on — which is the whole record that exists today. */}
        <View style={{ marginTop: space.x24 }}>
          <Scoreboard
            outcome={pick.outcome}
            returnPct={pick.returnPct}
            excessPct={pick.excessPct}
            entryPrice={pick.entryPrice}
            entryBenchmark={pick.entryBenchmark}
            pickDate={pick.pickDate}
            horizon={pick.horizon}
            gradedAt={pick.gradedAt}
            settlesOn={settlesOn(pick.pickDate, pick.horizon)}
            direction={pick.direction}
          />
        </View>

        {/* ── what kills it ────────────────────────────────────── */}
        {pick.falsifier && !pick.unfinished ? (
          <View style={{ marginTop: space.x24 }} testID="desk-pick-falsifier">
            <Falsifier
              label={pick.direction === 'pass' ? 'What the pass rests on' : 'What would prove this wrong'}
              text={pick.falsifier}
            />
          </View>
        ) : null}
        {pick.revisitWhen ? (
          <View style={{ marginTop: space.x8 }} testID="desk-pick-revisit">
            <Falsifier label="What brings it back" text={pick.revisitWhen} tone={color.gold} />
          </View>
        ) : null}

        {/* ── why that grade ───────────────────────────────────── */}
        {pick.gradeWhy && (
          <View style={{ marginTop: space.x24 }} testID="desk-pick-grade-why">
            <Eyebrow c={color.muted}>Why that grade</Eyebrow>
            <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
              The grade asks one thing: does this look like a company before a
              very big move? Five things count.
            </T>
            <GradeLegs />
            <T size={14} lh={21} c={color.text} style={{ marginTop: space.x16 }}>
              {pick.gradeWhy}
            </T>
          </View>
        )}

        {/* ── the evidence, for and against ────────────────────── */}
        {(pick.why.length > 0 || pick.blockers.length > 0) && (
          <View style={{ marginTop: space.x24 }} testID="desk-pick-ledger">
            <Ledger why={pick.why} blockers={pick.blockers} />
          </View>
        )}

        {/* ── dated things ahead ───────────────────────────────── */}
        {pick.catalysts.length > 0 && (
          <View style={{ marginTop: space.x24 }}>
            <CatalystSpine items={pick.catalysts} />
          </View>
        )}

        {/* ── the argument, in its own sections ────────────────── */}
        <ThesisReader thesis={pick.thesis} />

        {/* ── the same company, other themes ───────────────────── */}
        {alsoWrittenUp.length > 0 && (
          <View style={{ marginTop: space.x30 }}>
            <Eyebrow c={color.muted}>Also written up under</Eyebrow>
            <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
              The search runs per theme, so the same company can be argued more
              than once. These are different arguments, not copies.
            </T>
            {alsoWrittenUp.map((a, i) => (
              <Pressable
                key={`${a.theme}-${i}`}
                onPress={() => router.push(`/desk/theme/${encodeURIComponent(a.theme)}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: space.x10,
                  paddingVertical: space.x11,
                  borderBottomWidth: i === alsoWrittenUp.length - 1 ? 0 : 1,
                  borderBottomColor: alpha.ivory08,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <T size={13} c={color.text} style={{ flex: 1 }} numberOfLines={1}>
                  {a.theme.replace(/-/g, ' ')}
                </T>
                <GradeMark grade={a.grade} size={12} />
                <T size={11} c={color.dim}>{a.pickDate ?? ''}</T>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── where it came from ──────────────────────────────── */}
        {/* Last, and quietly. None of this is evidence for or against the
            argument; putting it any higher would say that it was. */}
        <View style={{ marginTop: space.x30 }}>
          <Provenance
            revisitCount={pick.revisitCount}
            revisitCheckedAt={pick.revisitCheckedAt}
            news90d={pick.news90d}
            nominatedBy={pick.nominatedBy}
            onOpenNominator={(t) => router.push(`/desk/pick/${encodeURIComponent(t)}`)}
          />
        </View>

        {res.isFixture ? (
          <T size={10} c={color.dim} style={{ marginTop: space.x20 }}>
            Sample desk — the research service is not connected here.
          </T>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
