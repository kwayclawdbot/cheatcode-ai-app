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
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { TickerMark } from '../../ui/Ticker';
import { alpha, color, radius, space, type as typeScale } from '../../ui/tokens';
import { api, ApiError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { GradeMark, StateChip, LinkRow, px } from '../../features/desk/ui';
import type { DeskWatchRow, DeskWatchlistResponse } from '@shared/desk';

export default function DeskWatchlist() {
  const router = useRouter();
  const load = useCallback(() => api.deskWatchlist(), []);
  const res = useResource<DeskWatchlistResponse>(load, null, []);

  const [symbol, setSymbol] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

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
    <Screen variant="corner" layout="tab" testID="desk-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <Eyebrow c={color.violetLight}>Kai · research desk</Eyebrow>
        <T size={typeScale.screenTitle.size} weight="bold" c={color.text} style={{ marginTop: space.x8 }}>
          The watchlist
        </T>
        <T size={14} lh={20} c={color.muted} style={{ marginTop: space.x10, maxWidth: 460 }}>
          Every name the desk argued for, plus anything you added. The chip is
          what the chart is doing. The letter is how good the idea is — which is
          not a prediction about this quarter.
        </T>

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
          <T size={14} c={color.red} style={{ marginTop: space.x24 }}>{res.error}</T>
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <>
            <Group
              title="The desk argued for these"
              sub="A pick is on the list from the day it is made until its horizon runs out."
              rows={picks}
              onPick={(t) => router.push(`/desk/pick/${t}`)}
            />
            {manual.length > 0 && (
              <Group
                title="You added these"
                sub="No written argument behind them yet — just a chart being watched."
                rows={manual}
                onPick={(t) => router.push(`/desk/pick/${t}`)}
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
          <ObjectCard tone="kai">
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
      </ScrollView>
    </Screen>
  );
}

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
          <LinkRow key={r.ticker} onPress={() => onPick(r.ticker)} last={i === rows.length - 1}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x12 }}>
              <TickerMark symbol={r.ticker} size={30} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x8 }}>
                  <Num size={16} weight="bold" c={color.text}>{r.ticker}</Num>
                  <GradeMark grade={r.grade} size={13} />
                </View>
                <T size={12} c={color.dim} numberOfLines={1} style={{ marginTop: space.x2 }}>
                  {r.theme ?? r.company ?? '—'}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: space.x6 }}>
                <Num size={15} weight="semibold" c={color.cyan}>{px(r.price)}</Num>
                <StateChip state={r.state} />
              </View>
            </View>
          </LinkRow>
        ))}
      </View>
    </View>
  );
}

function Empty() {
  return (
    <View style={{ marginTop: space.x30 }}>
      <ObjectCard>
        <T size={15} weight="bold" c={color.text}>Nothing on the list yet</T>
        <T size={13} lh={19} c={color.muted} style={{ marginTop: space.x6 }}>
          The desk puts a name here when it writes an argument for it. You can
          add one yourself above — it starts being read on the next refresh.
        </T>
      </ObjectCard>
    </View>
  );
}
