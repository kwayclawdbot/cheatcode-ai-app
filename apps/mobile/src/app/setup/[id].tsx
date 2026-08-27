import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Segmented, ChipRail } from '../../ui/Segmented';
import { Stepper, ChecklistRow } from '../../ui/Stepper';
import { CandleChart, ChartLevel } from '../../ui/MiniChart';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { KaiOrb } from '../../ui/KaiOrb';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useSetupCandles, useSetupDetail } from '../../features/setups/useSetupDetail';
import type { ExplainLevel, Scenario, SetupState } from '../../lib/types';

type ViewKey = 'live' | 'plan' | 'learn';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: 'plan', label: 'Plan' },
  { key: 'learn', label: 'Learn' },
];

const LEVELS: { key: ExplainLevel; label: string }[] = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'family', label: 'Family' },
];

const STATE_C: Record<SetupState, string> = {
  forming: color.cyan, ready: color.green, confirmed: color.green, triggered: color.green,
  invalidated: color.red, expired: color.muted, watching: color.muted,
};

const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toFixed(2)}`);

function ScenarioTile({ s }: { s: Scenario }) {
  const c = s.tone === 'good' ? color.green : s.tone === 'bad' ? color.red : color.muted;
  const bg = s.tone === 'good' ? color.greenTint : s.tone === 'bad' ? color.redTint : alpha.ivory06;
  const bd = s.tone === 'good' ? alpha.green40 : s.tone === 'bad' ? alpha.red40 : alpha.ivory14;
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderWidth: 1, borderColor: bd, borderRadius: 14, padding: 12 }}>
      <T size={11} weight="semibold" c={c} ls={0.66}>{s.label.toUpperCase()}</T>
      {s.amount ? <Num size={18} weight="semibold" c={c} style={{ marginTop: 5, marginBottom: 3 }}>{s.amount}</Num> : null}
      <T size={11} lh={15} c={color.muted} style={{ marginTop: s.amount ? 0 : 6 }}>{s.plain}</T>
    </View>
  );
}

/**
 * Setup detail — Setup-detail.html + V3-K1-Research.html.
 *
 * One object, three views of it: what is happening now (Live), what you would
 * do about it (Plan), and why it can work (Learn). The identity strip is sticky
 * so the ticker, the grade, the state and the freshness never scroll away —
 * the four questions in five seconds (07 §2).
 */
export default function SetupDetail() {
  const params = useLocalSearchParams<{ id?: string; view?: string }>();
  const id = String(params.id ?? '');
  const router = useRouter();
  const { data, loading, error, isFixture } = useSetupDetail(id);
  const [view, setView] = useState<ViewKey>(params.view === 'learn' || params.view === 'plan' ? params.view : 'live');
  const [level, setLevel] = useState<ExplainLevel>('beginner');
  const [showTech, setShowTech] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const [following, setFollowing] = useState(false);
  const [followed, setFollowed] = useState<string | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);

  const { candles, fromFixture } = useSetupCandles(data?.symbol);

  const levels = useMemo<ChartLevel[]>(() => {
    if (!data) return [];
    const out: ChartLevel[] = [];
    const t = data.plan.targets[0]?.price;
    if (data.plan.entry != null) out.push({ price: data.plan.entry, label: `Entry ${data.plan.entry.toFixed(2)}`, c: color.cyan, weight: 1.4, side: 'left' });
    if (t != null) out.push({ price: t, label: `Target ${t.toFixed(2)}`, c: color.green, weight: 1.2, side: 'right' });
    if (data.plan.stop != null) out.push({ price: data.plan.stop, label: `Stop ${data.plan.stop.toFixed(2)}`, c: color.red, weight: 1.2, side: 'right' });
    return out;
  }, [data]);

  const follow = async () => {
    if (!data) return;
    setFollowing(true);
    setFollowError(null);
    try {
      if (api.available()) await api.followSetup(data.id);
      setFollowed(`Added to Watching. Kai drafted an alert for ${data.plan.entry != null ? data.plan.entry.toFixed(2) : data.symbol}.`);
    } catch (e) {
      setFollowError(e instanceof Error ? e.message : "That didn't go through. Try again.");
    } finally {
      setFollowing(false);
    }
  };

  if (loading && !data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-setup">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.violet} />
        </View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-setup">
        <StackHeader title="Setup" />
        <View style={{ paddingHorizontal: 16 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18, gap: 8 }}>
            <T size={15} weight="bold">This setup isn&apos;t available.</T>
            <T size={13} c={color.muted} lh={19}>{error ?? 'It may have expired. Kai only keeps a setup while the idea is still honest.'}</T>
          </ObjectCard>
        </View>
      </Screen>
    );
  }

  const stateC = STATE_C[data.state] ?? color.muted;
  const q = data.learn.quiz;

  return (
    <Screen variant="corner" layout="tab" testID="screen-setup">
      {/* sticky identity — ticker, grade, state, freshness */}
      <StackHeader
        title={data.symbol}
        testID="setup-identity"
        subtitleNode={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stateC }} />
              <T size={11} c={stateC}>{data.state_label}</T>
            </View>
            <T size={11} c={color.dim}>·</T>
            <FreshnessMark
              freshness={data.quote?.freshness ?? 'unknown'}
              delayReason={data.quote?.delay_reason}
              size={11}
              testID="setup-freshness"
            />
          </View>
        }
        right={
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: alpha.violet14, borderWidth: 1, borderColor: alpha.violet50 }}>
            <T size={15} weight="bold" c={color.violetLight}>{data.grade_display}</T>
          </View>
        }
      />

      {data.live.stepper.length ? (
        <View style={{ paddingLeft: 16, paddingBottom: 10 }}>
          <Stepper steps={data.live.stepper} testID="setup-stepper" />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Segmented options={VIEWS} value={view} onChange={setView} testID="setup-view" />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------ LIVE ------------------------------ */}
        {view === 'live' ? (
          <>
            <CandleChart
              testID="setup-chart"
              candles={candles}
              levels={levels}
              height={200}
              footerLeft={fromFixture ? 'Sample bars' : 'Polygon · delayed'}
              footerRight="1D · 5m candles"
            />

            {data.quote?.price != null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <T size={12} c={color.muted}>Last</T>
                <Num size={15} weight="semibold">{data.quote.price.toFixed(2)}</Num>
                <FreshnessMark
                  freshness={data.quote.freshness ?? 'unknown'}
                  delayReason={data.quote.delay_reason}
                  size={11}
                />
              </View>
            ) : null}

            {data.live.narration.map((n, i) => (
              <View
                key={`${n.time ?? ''}-${i}`}
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  backgroundColor: color.surface2,
                  borderWidth: 1,
                  borderColor: alpha.violet22,
                  borderLeftWidth: 3,
                  borderLeftColor: color.violet,
                  borderRadius: radius.lg,
                  paddingVertical: 11,
                  paddingHorizontal: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <T size={13.5} lh={20}>{n.text}</T>
                  <Num size={10} weight="medium" c={color.violet} style={{ marginTop: 5 }}>
                    {`KAI${n.time ? ` · ${n.time}` : ''}`}
                  </Num>
                </View>
              </View>
            ))}

            {data.live.confirmations.length ? (
              <>
                <Eyebrow c={color.cyan}>WHAT KAI IS WAITING FOR</Eyebrow>
                <ObjectCard r={radius.xl} style={{ padding: 14, gap: 11 }}>
                  {data.live.confirmations.map((c) => <ChecklistRow key={c.label} item={c} />)}
                </ObjectCard>
              </>
            ) : null}

            {data.live.technical ? (
              <>
                <Pressable
                  testID="setup-technical-toggle"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showTech }}
                  onPress={() => setShowTech((v) => !v)}
                  style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: alpha.ivory20, borderRadius: radius.lg, padding: 12 }}
                >
                  <T size={12} weight="medium" c={color.muted}>
                    {showTech ? 'Hide the technical read' : 'Show me the technical read'}
                  </T>
                </Pressable>
                {showTech ? (
                  <View style={{ backgroundColor: color.surface3, borderRadius: radius.lg, padding: 12 }}>
                    <Num size={12} weight="regular" c={color.muted} style={{ lineHeight: 19 }}>{data.live.technical}</Num>
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {/* ------------------------------ PLAN ------------------------------ */}
        {view === 'plan' ? (
          <>
            <RowList>
              <Row>
                <T size={13} c={color.muted} style={{ flex: 1 }}>Entry condition</T>
                <T size={12.5} weight="medium" align="right" style={{ maxWidth: '55%' }}>{data.plan.entry_condition ?? '—'}</T>
              </Row>
              <Row>
                <T size={13} c={color.muted} style={{ flex: 1 }}>Entry zone</T>
                <Num size={13} c={color.cyan}>{data.plan.entry_zone ?? money(data.plan.entry)}</Num>
              </Row>
              <Row>
                <T size={13} c={color.muted} style={{ flex: 1 }}>Stop</T>
                <Num size={13} c={color.red}>{money(data.plan.stop)}</Num>
              </Row>
              <Row>
                <T size={13} c={color.muted} style={{ flex: 1 }}>Setup fails</T>
                <T size={12.5} weight="medium" c={color.red} align="right" style={{ maxWidth: '55%' }}>{data.plan.invalidation ?? '—'}</T>
              </Row>
              <Row>
                <T size={13} c={color.muted} style={{ flex: 1 }}>Targets</T>
                <Num size={13} c={color.green}>
                  {data.plan.targets.length ? data.plan.targets.map((t) => `$${t.price.toFixed(2)}`).join(' · ') : '—'}
                </Num>
              </Row>
              <Row last={!data.plan.risk_reward}>
                <T size={13} c={color.muted} style={{ flex: 1 }}>Suggested size</T>
                <T size={12.5} weight="medium" align="right" style={{ maxWidth: '55%' }}>{data.plan.size_suggestion ?? 'Kai has not sized this yet'}</T>
              </Row>
              {data.plan.risk_reward ? (
                <Row last>
                  <T size={13} c={color.muted} style={{ flex: 1 }}>Risk / reward</T>
                  <Num size={13}>{data.plan.risk_reward}</Num>
                </Row>
              ) : null}
            </RowList>

            {data.plan.scenarios.length ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {data.plan.scenarios.slice(0, 2).map((s) => <ScenarioTile key={s.label} s={s} />)}
              </View>
            ) : null}
            {data.plan.scenarios[2] ? (
              <T size={12} lh={18} c={color.muted}>
                {`${data.plan.scenarios[2].label}: ${data.plan.scenarios[2].plain}`}
              </T>
            ) : null}

            {data.fit.reasons.length ? (
              <ObjectCard r={radius.xl} style={{ padding: 13, gap: 8 }}>
                <Eyebrow c={data.fit.ok ? color.green : color.gold}>
                  {data.fit.ok ? 'THIS FITS YOUR RULES' : 'THIS DOES NOT FIT YOUR RULES'}
                </Eyebrow>
                {data.fit.reasons.map((r) => (
                  <View key={r} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <View style={{ paddingTop: 3 }}>
                      <Check size={12} color={data.fit.ok ? color.green : color.gold} strokeWidth={2.6} />
                    </View>
                    <T size={12.5} lh={18} c={color.muted} style={{ flex: 1 }}>{r}</T>
                  </View>
                ))}
              </ObjectCard>
            ) : null}

            <T size={12} lh={18} c={color.muted}>
              Kai prepares and explains. Nothing is sent anywhere without you.
            </T>

            {followed ? (
              <ObjectCard tone="volt" r={radius.xl} style={{ padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Check size={15} color={color.volt} strokeWidth={2.6} />
                <T size={13} style={{ flex: 1 }}>{followed}</T>
                <Button label="See it" kind="ghost" height={34} full={false} size={12} onPress={() => router.push('/alerts')} />
              </ObjectCard>
            ) : (
              <Button
                testID="cta-watch-it"
                label={data.next_action ?? 'Watch it'}
                kind="volt"
                height={52}
                loading={following}
                onPress={follow}
                accessibilityHint="Adds this setup to Watching and drafts an alert for the entry level."
              />
            )}
            {followError ? <T size={12} c={color.red}>{followError}</T> : null}

            <Button
              testID="cta-build-plan"
              label="Build plan"
              kind="outline"
              height={48}
              disabled
              accessibilityHint="Plans arrive with paper trading."
            />
            <T size={11} c={color.dim} align="center" style={{ marginTop: -6 }}>Plans arrive with paper trading.</T>
          </>
        ) : null}

        {/* ------------------------------ LEARN ----------------------------- */}
        {view === 'learn' ? (
          <>
            <ObjectCard tone="kai" r={radius.xl} style={{ padding: 16, gap: 8 }} testID="setup-why">
              <Eyebrow c={color.violetLight}>WHY THIS SETUP CAN WORK</Eyebrow>
              <T size={14} lh={22}>{data.learn.why_plain}</T>
            </ObjectCard>

            {data.learn.evidence.length ? (
              <ObjectCard r={radius.xl} style={{ padding: 16, gap: 11 }}>
                <Eyebrow c={color.cyan}>THE EVIDENCE</Eyebrow>
                {data.learn.evidence.map((e) => <ChecklistRow key={e.label} item={e} />)}
              </ObjectCard>
            ) : null}

            <Eyebrow c={color.violetLight}>HOW SHOULD KAI EXPLAIN IT?</Eyebrow>
            <ChipRail options={LEVELS} value={level} onChange={setLevel} tone="kai" testID="explain-level" />
            <ObjectCard r={radius.xl} style={{ padding: 16 }}>
              <T size={14} lh={22} testID="explain-body">
                {data.explain[level] || 'Kai has not written this level yet.'}
              </T>
            </ObjectCard>

            {data.learn.similar_example ? (
              <ObjectCard r={radius.xl} style={{ padding: 16, gap: 6 }}>
                <Eyebrow>SIMILAR SETUP</Eyebrow>
                <T size={13.5} lh={20}>{data.learn.similar_example}</T>
              </ObjectCard>
            ) : null}

            {q ? (
              <ObjectCard r={radius.xl} style={{ padding: 16, gap: 10 }} testID="setup-quiz">
                <Eyebrow>QUICK CHECK</Eyebrow>
                <T size={14} weight="medium" lh={20}>{q.q}</T>
                {q.options.map((opt, i) => {
                  const chosen = answer === i;
                  const right = i === q.answer_idx;
                  const revealed = answer !== null;
                  const bd = revealed && right ? alpha.green40 : chosen ? alpha.red40 : alpha.ivory10;
                  const bg = revealed && right ? color.greenTint : chosen ? color.redTint : color.surface3;
                  return (
                    <Pressable
                      key={opt}
                      testID={`quiz-option-${i}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: chosen }}
                      onPress={() => setAnswer(i)}
                      style={{ borderWidth: 1, borderColor: bd, backgroundColor: bg, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' }}
                    >
                      <T size={13}>{opt}</T>
                    </Pressable>
                  );
                })}
                {answer !== null ? (
                  <T size={12.5} lh={18} weight="medium" c={answer === q.answer_idx ? color.green : color.gold}>
                    {q.explanation
                      ?? (answer === q.answer_idx
                        ? 'That is the one. Below that level the reason to be in the trade is gone.'
                        : 'Not quite — the setup is only invalid when the level that supports it gives way.')}
                  </T>
                ) : null}
              </ObjectCard>
            ) : null}

            <Button
              testID="cta-ask-kai"
              label="Ask Kai about this"
              kind="kai"
              height={48}
              icon={<KaiOrb size={16} glow={false} />}
              onPress={() =>
                router.push(`/home?ask=${encodeURIComponent(`Explain the ${data.symbol} setup to me`)}&setup_id=${encodeURIComponent(data.id)}`)
              }
            />
          </>
        ) : null}

        {isFixture ? (
          <T size={10} c={color.dim} align="center">Sample data — the live setup service is not connected here.</T>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
