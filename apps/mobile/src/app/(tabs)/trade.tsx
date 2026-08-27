import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { KaiOrb } from '../../ui/KaiOrb';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { Sparkline } from '../../ui/MiniChart';
import { Bolt, Search } from '../../ui/Icons';
import { family } from '../../ui/fonts';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import { fixtureInstruments, fixtureSetups } from '../../lib/fixtures';
import { useSession } from '../../lib/session';
import type { GoalMode, GradedSetup, Instrument } from '../../lib/types';

const MODE_LABEL: Record<GoalMode, string> = { day_trade: 'Day Trade', swing: 'Swing', invest: 'Invest' };

const SPARK_UP = '0,16 8,14 16,15 24,11 32,12 40,8 48,9 60,4';
const SPARK_DOWN = '0,6 8,8 16,7 24,11 32,10 40,14 48,13 60,16';

/**
 * V4-TR1-Trade-landing.html, honest stub.
 * No Buy/Sell in this slice. The equity strip only appears when a paper account
 * actually exists, and it is labeled PAPER.
 */
export default function Trade() {
  const { profile, session } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const [q, setQ] = useState('');
  const [instruments, setInstruments] = useState<Instrument[]>(env.FIXTURES || !supabase ? fixtureInstruments : []);
  const [setups, setSetups] = useState<GradedSetup[]>(api.available() ? [] : fixtureSetups.slice(0, 2));
  const [paper, setPaper] = useState<{ equity: number } | null>(env.FIXTURES ? { equity: 10000 } : null);

  useEffect(() => {
    let alive = true;
    if (env.FIXTURES || !supabase) return;
    supabase.from('instruments').select('symbol, name').limit(10)
      .then(({ data }) => { if (alive && data) setInstruments(data as Instrument[]); });
    if (session) {
      supabase.from('accounts').select('id, kind, equity, starting_balance').eq('kind', 'paper').maybeSingle()
        .then(({ data }) => {
          if (!alive || !data) return;
          const d = data as { equity?: number; starting_balance?: number };
          setPaper({ equity: d.equity ?? d.starting_balance ?? 0 });
        });
    }
    return () => { alive = false; };
  }, [session]);

  useEffect(() => {
    let alive = true;
    if (!api.available()) return;
    api.setups(mode).then((r) => { if (alive) setSetups(r); }).catch(() => {});
    return () => { alive = false; };
  }, [mode]);

  /** `instruments` carries no prices; the ranked setups do. Merge them so a
   *  watchlist row shows a real quote with its real freshness, or no number
   *  at all — never a number without a timestamp behind it. */
  const quoted = useMemo(() => {
    const bySymbol = new Map(setups.filter((s) => s.quote?.price != null).map((s) => [s.symbol, s.quote!]));
    return instruments.map((i) => {
      const q2 = i.quote ?? bySymbol.get(i.symbol) ?? null;
      return q2 ? { ...i, quote: q2, last: i.last ?? q2.price ?? null } : i;
    });
  }, [instruments, setups]);

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return quoted;
    return quoted.filter((i) => i.symbol.includes(s) || (i.name ?? '').toUpperCase().includes(s));
  }, [q, quoted]);

  const listFreshness = filtered.find((i) => i.quote)?.quote?.freshness ?? 'unknown';

  return (
    <Screen variant="corner" layout="tab" testID="screen-trade">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 11, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={28} weight="bold">Trade</T>
          <LinearGradient
            colors={gradient.modeChip as unknown as readonly [string, string, ...string[]]}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.volt55 }}
          >
            <Bolt size={11} color={color.volt} />
            <T size={12} weight="semibold" c={color.volt}>{MODE_LABEL[mode]}</T>
          </LinearGradient>
        </View>

        {paper ? (
          <ObjectCard r={radius.xl} style={{ paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T size={10} c={color.muted}>Practice balance</T>
                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 0.5, borderColor: alpha.cyan40 }}>
                  <T size={9} weight="bold" c={color.cyan}>PAPER</T>
                </View>
              </View>
              <Num size={19} weight="semibold" style={{ marginTop: 3 }}>
                {`$${paper.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </Num>
            </View>
            <View style={{ justifyContent: 'flex-end' }}>
              <T size={10} c={color.muted}>Not real money</T>
            </View>
          </ObjectCard>
        ) : null}

        <LinearGradient
          colors={gradient.composer as unknown as readonly [string, string, ...string[]]}
          start={gradientAngle.start}
          end={gradientAngle.end}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory20 }}
        >
          <Search size={15} color={color.muted} />
          <TextInput
            testID="trade-search"
            accessibilityLabel="Search symbols"
            value={q}
            onChangeText={setQ}
            placeholder="Symbol or company"
            placeholderTextColor={color.muted}
            autoCapitalize="characters"
            style={{ flex: 1, fontFamily: family.regular, fontSize: 13, color: color.text, ...(({ outlineStyle: 'none' } as unknown) as object) }}
          />
        </LinearGradient>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow>WATCHLIST</Eyebrow>
          {filtered.some((i) => i.quote) ? <FreshnessMark freshness={listFreshness} size={10} /> : null}
        </View>
        {filtered.length === 0 ? (
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted}>Nothing matches "{q}".</T>
          </ObjectCard>
        ) : (
          <RowList style={{ paddingVertical: 2 }}>
            {filtered.map((it, i) => {
              const up = (it.change_pct ?? 0) >= 0;
              return (
                <Row key={it.symbol} last={i === filtered.length - 1} style={{ paddingVertical: 10, gap: 11 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 9, borderWidth: 0.5, borderColor: alpha.ivory14, backgroundColor: alpha.ivory06, alignItems: 'center', justifyContent: 'center' }}>
                    <Num size={12}>{it.symbol.slice(0, 1)}</Num>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T size={14} weight="bold">{it.symbol}</T>
                    <T size={10} c={color.muted}>{it.name}</T>
                  </View>
                  {it.change_pct != null ? <Sparkline up={up} points={up ? SPARK_UP : SPARK_DOWN} /> : null}
                  <View style={{ width: 74, alignItems: 'flex-end' }}>
                    {it.last != null ? (
                      <>
                        <Num size={12}>{it.last.toFixed(2)}</Num>
                        {it.change_pct != null ? (
                          <Num size={10} weight="regular" c={up ? color.green : color.red}>
                            {`${up ? '+' : '−'}${Math.abs(it.change_pct).toFixed(2)}%`}
                          </Num>
                        ) : (
                          <FreshnessMark freshness={it.quote?.freshness ?? 'unknown'} size={9} />
                        )}
                      </>
                    ) : (
                      <T size={10} c={color.dim}>No quote yet</T>
                    )}
                  </View>
                </Row>
              );
            })}
          </RowList>
        )}

        <Eyebrow c={color.violetLight}>KAI OPPORTUNITIES</Eyebrow>
        {setups.length === 0 ? (
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted}>Kai hasn't graded anything worth your attention in this mode yet.</T>
          </ObjectCard>
        ) : (
          setups.slice(0, 3).map((s) => (
            <ObjectCard key={s.id} tone="kaiCard" r={radius.xl} style={{ paddingVertical: 12, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <KaiOrb size={32} glow={false} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <T size={14} weight="bold">{`${s.symbol} ${s.direction === 'short' ? 'short-side' : 'bullish'} setup`}</T>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
                    <T size={11} weight="bold" c={color.violet}>{s.grade_display}</T>
                  </View>
                </View>
                <T size={11} c={color.muted} style={{ marginTop: 2 }}>{s.risk_line}</T>
              </View>
              {s.quote?.price != null ? (
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Num size={12}>{s.quote.price.toFixed(2)}</Num>
                  <FreshnessMark freshness={s.quote.freshness ?? 'unknown'} size={9} />
                </View>
              ) : null}
            </ObjectCard>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
