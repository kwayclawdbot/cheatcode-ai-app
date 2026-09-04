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
import { GradeMark, StateChip, LinkRow, px } from './ui';
import { ModeControl } from '../home/ModeSheet';
import { secondTab } from '../nav/second-tab';
import type { DeskWatchRow, DeskWatchlistResponse } from '@shared/desk';
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
  const res = useResource<DeskWatchlistResponse>(
    load,
    empty ? fixtureDeskWatchlistEmpty : fixtureDeskWatchlist,
    [empty],
  );

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
          Every name the desk argued for, plus anything you added. The chip is
          what the chart is doing. The letter is how good the idea is — which is
          not a prediction about this quarter.
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
          <T size={14} c={color.red} style={{ marginTop: space.x24 }}>{res.error}</T>
        ) : rows.length === 0 ? (
          <Empty onThemes={() => router.push('/desk/themes')} onKai={() => router.push('/home')} />
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
