/**
 * One written argument, in full.
 *
 * The order is the order the desk commits in: the claim, then the thing that
 * would prove it wrong, then the grade and why, then what is dated ahead, then
 * the reasoning itself. The falsifier sits directly under the claim rather than
 * at the bottom, because an argument you have to scroll to disprove is being
 * sold to you.
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
import { ObjectCard } from '../../../ui/Panel';
import { TickerMark } from '../../../ui/Ticker';
import { alpha, color, radius, space } from '../../../ui/tokens';
import { api } from '../../../lib/api';
import { env } from '../../../lib/env';
import { fixtureDeskPick } from '../../../lib/fixtures';
import { useResource } from '../../../lib/useResource';
import {
  Falsifier, GradeMark, Prose, Stat, StatRow, UnfinishedNote, money,
} from '../../../features/desk/ui';
import type { DeskPickResponse } from '@shared/desk';

const HORIZON_COPY: Record<string, string> = {
  '1q': 'one quarter',
  '2q': 'two quarters',
  '4q': 'four quarters',
};

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

  const { pick, alsoWrittenUp } = res.data;
  const isCall = pick.direction === 'long' || pick.direction === 'short';

  return (
    <Screen variant="dome" layout="stack" testID="desk-pick-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 70 }}>
        {/* ── who ──────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x12 }}>
          <TickerMark symbol={pick.ticker} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Num size={24} weight="bold" c={color.text}>{pick.ticker}</Num>
            <T size={13} c={color.dim} numberOfLines={1}>{pick.company ?? '—'}</T>
          </View>
          <GradeMark grade={pick.grade} size={17} />
        </View>

        {pick.theme ? (
          <Pressable
            onPress={() => router.push(`/desk/theme/${encodeURIComponent(pick.theme!)}`)}
            accessibilityRole="button"
            testID="desk-pick-theme-link"
            style={{ marginTop: space.x14 }}
          >
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: space.x8,
              paddingVertical: space.x10, paddingHorizontal: space.x12,
              borderRadius: radius.md, backgroundColor: alpha.violet08,
              borderWidth: 0.5, borderColor: alpha.violet45,
            }}>
              <View style={{ flex: 1 }}>
                <Eyebrow c={color.violetLight}>Found under</Eyebrow>
                <T size={14} weight="semibold" c={color.text} style={{ marginTop: space.x2 }}>
                  {pick.theme}
                </T>
              </View>
              {pick.themeRank === 1 && (
                <T size={11} weight="bold" c={color.violetLight}>the theme&rsquo;s best</T>
              )}
            </View>
          </Pressable>
        ) : null}

        {pick.unfinished && <UnfinishedNote />}

        {/* ── the claim ────────────────────────────────────────── */}
        {!pick.unfinished && (
          <ObjectCard tone={isCall ? 'voltCard' : 'default'} style={{ marginTop: space.x16, padding: space.x16 }}>
            <Eyebrow c={color.dim}>The call</Eyebrow>
            <T size={18} weight="bold" c={color.text} style={{ marginTop: space.x6 }}>
              {isCall
                ? `${pick.direction === 'long' ? 'Long' : 'Short'}${
                    pick.horizon ? `, over ${HORIZON_COPY[pick.horizon] ?? pick.horizon}` : ''}`
                : 'Passed — a position held, not a rejection'}
            </T>

            {pick.falsifier && (
              <Falsifier
                label={isCall ? 'Falsified if' : 'Falsified by'}
                text={pick.falsifier}
              />
            )}
            {pick.revisitWhen && (
              <Falsifier label="Comes back if" text={pick.revisitWhen} tone={color.gold} />
            )}

            <StatRow>
              <Stat label="Move potential" value={pick.score != null ? pick.score.toFixed(3) : '—'} />
              <Stat label="Size" value={money(pick.marketCap)} />
              <Stat label="Written" value={pick.pickDate ?? '—'} />
            </StatRow>
          </ObjectCard>
        )}

        {/* ── the grade ────────────────────────────────────────── */}
        {pick.gradeWhy && (
          <View style={{ marginTop: space.x24 }}>
            <Eyebrow c={color.muted}>Why that grade</Eyebrow>
            <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
              The grade is on the idea — how big the claim is, how underpriced it
              looks, and how well placed this company is to be one of the names
              that captures it. It is not a forecast for this quarter.
            </T>
            <T size={14} lh={21} c={color.text} style={{ marginTop: space.x10 }}>
              {pick.gradeWhy}
            </T>
          </View>
        )}

        {/* ── dated things ahead ───────────────────────────────── */}
        {pick.catalysts.length > 0 && (
          <View style={{ marginTop: space.x24 }}>
            <Eyebrow c={color.muted}>Dated ahead</Eyebrow>
            {pick.catalysts.map((c, i) => (
              <View key={i} style={{
                flexDirection: 'row', gap: space.x12, marginTop: space.x10,
                paddingTop: space.x10,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: alpha.ivory08,
              }}>
                <Num size={13} weight="bold" c={color.cyan} style={{ width: 92 }}>{c.when}</Num>
                <T size={13} lh={19} c={color.muted} style={{ flex: 1 }}>{c.what}</T>
              </View>
            ))}
          </View>
        )}

        {/* ── the arithmetic ───────────────────────────────────── */}
        {(pick.why.length > 0 || pick.blockers.length > 0) && (
          <View style={{ marginTop: space.x24 }}>
            <Eyebrow c={color.muted}>What the screen computed</Eyebrow>
            {pick.why.map((w, i) => (
              <Bullet key={`w${i}`} tone={color.green} mark="+" text={w} />
            ))}
            {pick.blockers.map((b, i) => (
              <Bullet key={`b${i}`} tone={color.red} mark="−" text={b} />
            ))}
          </View>
        )}

        {pick.hypothesis && (
          <View style={{ marginTop: space.x20 }}>
            <Eyebrow c={color.dim}>Found by searching for</Eyebrow>
            <T size={13} lh={19} c={color.muted} style={{ marginTop: space.x4, fontStyle: 'italic' }}>
              {pick.hypothesis}
            </T>
          </View>
        )}

        {/* ── the argument ─────────────────────────────────────── */}
        {pick.thesis && (
          <View style={{ marginTop: space.x30, paddingTop: space.x20, borderTopWidth: 1, borderTopColor: alpha.ivory12 }}>
            <Eyebrow c={color.violetLight}>The argument</Eyebrow>
            <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
              Every figure quoted below comes from a named filing period or a
              real daily bar. Nothing in it was estimated.
            </T>
            <View style={{ marginTop: space.x10 }}>
              <Prose text={pick.thesis} />
            </View>
          </View>
        )}

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
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: space.x10,
                  paddingVertical: space.x11,
                  borderBottomWidth: i === alsoWrittenUp.length - 1 ? 0 : 1,
                  borderBottomColor: alpha.ivory08,
                }}
              >
                <T size={13} c={color.text} style={{ flex: 1 }} numberOfLines={1}>{a.theme}</T>
                <GradeMark grade={a.grade} size={12} />
                <T size={11} c={color.dim}>{a.pickDate ?? ''}</T>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Bullet({ tone, mark, text }: { tone: string; mark: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.x10, marginTop: space.x8 }}>
      <Num size={14} weight="bold" c={tone}>{mark}</Num>
      <T size={13} lh={19} c={color.muted} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}
