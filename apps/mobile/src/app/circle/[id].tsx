/**
 * `/circle/[id]` — Setup-room.html.
 *
 * A circle is a room with a clock: the header carries the ring, the name, the
 * days remaining and the member count; the live chart with the setup's levels
 * sits at the top so nobody argues about a level they cannot see; then the
 * thread, with Kai's verification objects rendered as objects rather than more
 * text. Composer is "@Kai · Message the room…".
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle as SvgCircle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Composer } from '../../ui/Composer';
import { KaiOrb } from '../../ui/KaiOrb';
import { Check } from '../../ui/Icons';
import { ScreenLoading } from '../../ui/Loading';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { alpha, color, radius } from '../../ui/tokens';
import { circlesApi } from '../../lib/community-api';
import { portalApi } from '../../lib/trade-api';
import { ClubBody } from '../../features/community/ui/ClubFeed';
import type { CircleDetail, CircleMessage } from '../../features/circles/types';
import type { Candle } from '../../lib/types';
import type { Freshness } from '../../ui/FreshnessMark';

const RING = 2 * Math.PI * 16.5;

function HeaderRing({ progress, initial }: { progress: number; initial: string }) {
  return (
    <View style={{ width: 36, height: 36 }}>
      <Svg viewBox="0 0 36 36" width={36} height={36} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <SvgCircle cx={18} cy={18} r={16.5} fill="none" stroke={alpha.ivory08} strokeWidth={2} />
        <SvgCircle
          cx={18} cy={18} r={16.5} fill="none" stroke={color.volt} strokeWidth={2} strokeLinecap="round"
          strokeDasharray={RING.toFixed(1)}
          strokeDashoffset={(RING * Math.max(0, Math.min(1, progress))).toFixed(1)}
        />
      </Svg>
      <View
        style={{
          position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 14,
          backgroundColor: alpha.chip85, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <T size={12} weight="bold">{initial}</T>
      </View>
    </View>
  );
}

/** The circle's chart: a line with the setup's levels drawn across it. */
function CircleChart({ candles, levels }: { candles: Candle[]; levels: CircleDetail['levels'] }) {
  const W = 330;
  const H = 92;
  if (!candles.length) {
    return (
      <View style={{ gap: 7, paddingVertical: 6 }}>
        {[...levels].sort((a, b) => b.price - a.price).map((l) => {
          const c = l.kind === 'stop' ? color.red : l.kind === 'target' ? color.green : color.cyan;
          return (
            <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: `${c}55` }} />
              <Num size={9} weight="regular" c={c}>{l.label}</Num>
            </View>
          );
        })}
        <T size={11} c={color.dim}>No price bars for this room yet. The levels above are real.</T>
      </View>
    );
  }
  const closes = candles.map((c) => c.c);
  const prices = [...closes, ...levels.map((l) => l.price)];
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  if (max === min) { max += 1; min -= 1; }
  const pad = (max - min) * 0.1;
  min -= pad; max += pad;
  const y = (p: number) => ((max - p) / (max - min)) * H;
  const step = closes.length > 1 ? W / (closes.length - 1) : W;
  const points = closes.map((c, i) => `${(i * step).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
  const lastY = y(closes[closes.length - 1]);

  return (
    <View>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} accessibilityLabel="Circle price chart with the setup levels">
        {levels.map((l) => {
          const c = l.kind === 'stop' ? color.red : l.kind === 'target' ? color.green : color.cyan;
          return l.kind === 'entry' ? (
            <Rect key={l.label} x={0} y={Math.max(0, y(l.price) - 4)} width={W} height={9} fill={alpha.cyan14} />
          ) : (
            <Line key={l.label} x1={0} y1={y(l.price)} x2={W} y2={y(l.price)} stroke={c} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
          );
        })}
        <Polyline points={points} fill="none" stroke={color.cyan} strokeWidth={1.8} />
        <SvgCircle cx={W} cy={lastY} r={3} fill={color.cyan} />
      </Svg>
      {levels.map((l) => {
        const c = l.kind === 'stop' ? color.red : l.kind === 'target' ? color.green : color.cyan;
        const bg = l.kind === 'stop' ? color.redTint : l.kind === 'target' ? color.greenTint : color.cyanTint;
        return (
          <View
            key={`tag-${l.label}`}
            pointerEvents="none"
            style={{
              position: 'absolute', right: 4, top: Math.max(0, Math.min(H - 14, y(l.price) - 7)),
              paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5,
              backgroundColor: bg, borderWidth: 0.5, borderColor: `${c}66`,
            }}
          >
            <Num size={9} weight="regular" c={c}>{l.label}</Num>
          </View>
        );
      })}
    </View>
  );
}

function Message({ m }: { m: CircleMessage }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }} testID={`circle-message-${m.id}`}>
      {m.is_kai ? <KaiOrb size={34} /> : (
        <View
          style={{
            width: 34, height: 34, borderRadius: 17, backgroundColor: alpha.chip85,
            borderWidth: 0.5, borderColor: alpha.ivory14, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <T size={13} weight="bold">{m.initial}</T>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <T size={13.5} weight="bold" c={m.is_kai ? color.violetLight : m.role ? color.gold : color.text}>{m.author}</T>
          {m.is_kai ? (
            <View style={{ paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4, backgroundColor: alpha.violet20, borderWidth: 0.5, borderColor: alpha.violet50 }}>
              <T size={8.5} weight="bold" c={color.violetLight}>AI</T>
            </View>
          ) : m.role ? (
            <View style={{ paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4, backgroundColor: alpha.gold14, borderWidth: 0.5, borderColor: alpha.gold40 }}>
              <T size={8.5} weight="bold" c={color.gold}>{m.role}</T>
            </View>
          ) : null}
          {m.at ? <T size={10} c={color.dim}>{m.at}</T> : null}
        </View>

        {m.verification ? (
          <View
            testID="kai-verification"
            style={{
              marginTop: 5, borderLeftWidth: 3, borderLeftColor: color.violet,
              borderTopRightRadius: 12, borderBottomRightRadius: 12, borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
              backgroundColor: alpha.violet14, paddingVertical: 10, paddingHorizontal: 12, gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <T size={11} weight="bold" c={color.violetLight}>{m.verification.title}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Check size={10} color={color.green} strokeWidth={3} />
                <T size={10} c={color.green}>{m.verification.result_plain}</T>
              </View>
            </View>
            <T size={12} lh={17}>{m.verification.body}</T>
          </View>
        ) : (
          <View style={{ marginTop: 2 }}><ClubBody text={m.body} size={13.5} /></View>
        )}

        {m.reactions.length ? (
          <View style={{ flexDirection: 'row', gap: 5, marginTop: 5 }}>
            {m.reactions.map((r) => (
              <View
                key={r.emoji}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3,
                  borderRadius: 8, backgroundColor: alpha.green12, borderWidth: 0.5, borderColor: alpha.green40,
                }}
              >
                <T size={10}>{r.emoji}</T>
                <Num size={10} weight="regular" c={color.green}>{String(r.count)}</Num>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function CircleRoom() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const circleId = String(id ?? '');

  const [detail, setDetail] = useState<CircleDetail | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!circleId) return;
    try {
      const r = await circlesApi.detail(circleId);
      setDetail(r.detail);
      if (r.detail.circle.symbol) {
        // 5-minute bars: the one intraday resolution every stack serves.
        const c = await portalApi.candles(r.detail.circle.symbol, '5m');
        setCandles(c.candles);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'I could not open that circle.');
    }
  }, [circleId]);

  useEffect(() => { void load(); }, [load]);

  if (!detail && !error) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-circle">
        <ScreenLoading label="Opening the circle…" />
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-circle">
        <View style={{ padding: 16 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>{error}</T>
          </ObjectCard>
        </View>
      </Screen>
    );
  }

  const c = detail.circle;
  /** "2d left" is the ring's shorthand; the header says it in words. */
  const remaining = c.time_left_plain
    .replace(/^(\d+)d left$/, (_m, n) => `${n} ${n === '1' ? 'day' : 'days'} remaining`)
    .replace(/^(\d+)h left$/, (_m, n) => `${n} ${n === '1' ? 'hour' : 'hours'} remaining`)
    .replace(/^(\d+)m left$/, (_m, n) => `${n} minutes remaining`);
  const daysLine = [remaining, `${c.members} members`].join(' · ');

  return (
    <Screen variant="corner" layout="tab" testID="screen-circle">
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16,
          paddingTop: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: alpha.ivory07,
        }}
      >
        <Pressable
          testID="circle-back"
          accessibilityRole="button"
          accessibilityLabel="Back to the club"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/community'))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color.text} strokeWidth={2.2}>
            <Path d="M15 5l-7 7 7 7" />
          </Svg>
        </Pressable>
        <HeaderRing progress={c.progress} initial={(c.symbol[0] ?? 'C').toUpperCase()} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={15} weight="bold" numberOfLines={1} testID="circle-name">{c.name}</T>
          <T size={10} c={color.dim} testID="circle-meta">{daysLine}</T>
        </View>
        {c.symbol ? (
          <Pressable
            testID="circle-open-chart"
            accessibilityRole="button"
            accessibilityLabel={`Open the ${c.symbol} chart`}
            onPress={() => router.push(`/trade/${encodeURIComponent(c.symbol)}` as never)}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <T size={11.5} weight="semibold" c={color.volt}>Chart ›</T>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <ObjectCard r={radius.xl} style={{ padding: 13, gap: 8 }} testID="circle-chart">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {detail.quote?.price != null ? (
                <>
                  <Num size={13} weight="semibold">{detail.quote.price.toFixed(2)}</Num>
                  {detail.quote.change_pct != null ? (
                    <Num size={11} weight="regular" c={detail.quote.change_pct >= 0 ? color.green : color.red}>
                      {`${detail.quote.change_pct >= 0 ? '+' : ''}${detail.quote.change_pct.toFixed(2)}%`}
                    </Num>
                  ) : null}
                  <FreshnessMark freshness={(detail.quote.freshness as Freshness) ?? 'unknown'} size={10} />
                </>
              ) : (
                <T size={11} c={color.dim}>No quote yet</T>
              )}
            </View>
            {detail.watching != null ? <T size={10} c={color.muted}>{`${detail.watching} watching`}</T> : null}
          </View>
          <CircleChart candles={candles} levels={detail.levels} />
        </ObjectCard>

        {detail.kai_read ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <KaiOrb size={26} />
            <T size={13.5} lh={20} style={{ flex: 1 }} testID="circle-kai-read">{detail.kai_read}</T>
          </View>
        ) : null}

        {detail.messages.map((m) => <Message key={m.id} m={m} />)}

        {detail.locked ? (
          <ObjectCard r={radius.xl} style={{ padding: 15, gap: 6 }} testID="circle-locked">
            <T size={13} weight="bold">You are not in this circle yet</T>
            <T size={12.5} lh={18} c={color.muted}>
              {detail.locked.plain} The levels above are the setup&apos;s own, and they are live.
            </T>
          </ObjectCard>
        ) : !detail.messages.length ? (
          <T size={12.5} c={color.muted}>Nobody has posted in this circle yet.</T>
        ) : null}

        {c.closed ? (
          <T size={11.5} c={color.gold} testID="circle-closed">
            This circle has closed. It stays readable, but nothing new can be posted.
          </T>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 10, paddingTop: 4 }}>
        <Composer
          testID="circle-composer"
          placeholder={detail.locked ? 'Open the setup to join this circle' : '@Kai · Message the room…'}
          disabled={c.closed || !!detail.locked}
          onSend={(text) => {
            void circlesApi.post(circleId, text).then((m) => {
              if (m) setDetail((d) => (d ? { ...d, messages: [...d.messages, m] } : d));
            }).catch(() => { /* the composer keeps the text; nothing is faked */ });
          }}
        />
      </View>
    </Screen>
  );
}
