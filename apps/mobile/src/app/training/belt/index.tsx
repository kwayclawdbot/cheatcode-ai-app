import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import type { BeltProfileResponse } from '@cheatcode/shared';
import { Screen } from '../../../ui/Screen';
import { T, Eyebrow, Num } from '../../../ui/Text';
import { Button } from '../../../ui/Button';
import { ObjectCard } from '../../../ui/Panel';
import { Check, Lock } from '../../../ui/Icons';
import { alpha, color, radius } from '../../../ui/tokens';
import { BELT_LABEL, beltEdge, beltInk, isBelt } from '../../../features/social/belts';
import { lessonNodeById } from '../../../features/training/curriculum';
import { fetchBeltProfile, trainingApiAvailable } from '../../../features/training/remote';

/**
 * THE BELT PROFILE — Board 09, right screen.
 *
 * ===========================================================================
 * THE RING FILLS TO *ELIGIBLE*. IT DOES NOT HAND OVER A BELT.
 * ===========================================================================
 * The owner's decision of 8 September: "merge belt system so that user gains
 * belt xp via lessons and/or trade calls but has to take and pass a test to
 * earn the belt itself." BELT-MERGE-spec.md §10 states what that means for this
 * screen, and it is the one design constraint here that is not negotiable:
 *
 *     "A ring that fills to 100% and then hands over a belt is the design this
 *      decision rejected. The ring fills to *eligible*; the member still has to
 *      sit down and pass."
 *
 * So the ring counts the four things that must be true before the exam opens,
 * and the control underneath it is a sentence with a verb in it — "Sit the Blue
 * Belt test" — with the reason printed beside it when it is shut.
 *
 * ===========================================================================
 * EVERY NUMBER ON THIS SCREEN CAME FROM THE SERVER
 * ===========================================================================
 * The checklist, the thresholds and the scoring sentences are all computed by
 * `belt_eligibility()` and `points_config()` and served by `GET /belts/me`. None
 * of it is recomputed here, for the reason `lib/social/belts.ts` gives about the
 * formula: a scoring system nobody can check reads as rigged, and two copies of
 * it is how the printed one starts lying. When the service cannot be reached
 * this screen says so and shows nothing — a belt ladder drawn from a guess is
 * worse than an empty screen, because it looks exactly as authoritative.
 */

/** What each rung is ABOUT, in the member's language. Copy, not configuration. */
const BELT_STAGE: Record<string, string> = {
  white: 'Foundations',
  blue: 'Reading the market',
  purple: 'Building the plan',
  brown: 'Discipline',
  black: 'Proven',
};

export default function BeltProfileScreen() {
  const router = useRouter();
  const [data, setData] = useState<BeltProfileResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  const load = useCallback(async () => {
    if (!trainingApiAvailable()) {
      setState('unavailable');
      return;
    }
    try {
      setData(await fetchBeltProfile());
      setState('ready');
    } catch {
      setState('unavailable');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const belt = data && isBelt(data.belt) ? data.belt : 'white';
  const next = data?.next ?? null;
  const ring = data?.progress_to_eligible ?? null;

  return (
    <Screen variant="corner" testID="screen-belt-profile">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: alpha.ivory07,
        }}
      >
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/training' as never))} hitSlop={12}>
          <T size={22} c={color.muted}>‹</T>
        </Pressable>
        <T size={16} weight="bold" align="center" style={{ flex: 1 }}>Your belt</T>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {state === 'unavailable' ? (
          <ObjectCard r={radius.xl} style={{ padding: 16, gap: 10 }} testID="belt-unavailable">
            <T size={13} weight="bold">I cannot read your belt right now</T>
            <T size={12.5} lh={19} c={color.muted}>
              Belts, XP and what the next one asks for are all worked out on the server, and I could
              not reach it. I am not going to draw a ladder I have not checked.
            </T>
            <Button label="Try again" kind="outline" onPress={() => { setState('loading'); void load(); }} />
          </ObjectCard>
        ) : state === 'loading' ? (
          <T size={12.5} c={color.muted}>Reading your record…</T>
        ) : data ? (
          <>
            {/* ── the belt itself ─────────────────────────────────────────── */}
            <View style={{ gap: 6 }}>
              <Eyebrow c={color.muted}>YOUR BELT</Eyebrow>
              <T size={30} weight="bold" ls={-0.6} c={beltInk(belt)} testID="belt-current">
                {`${BELT_LABEL[belt].toUpperCase()} BELT`}
              </T>
              <T size={14} c={color.muted}>{BELT_STAGE[belt] ?? ''}</T>
            </View>

            <ObjectCard
              r={radius.xxxl}
              style={{ padding: 16, gap: 14, borderColor: beltEdge(belt), borderWidth: 0.5 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                {/* THE RING: how much of the NEXT rung's eligibility is met. */}
                <EligibilityRing value={ring} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Pillar label="Knowledge" value={`${data.xp_training} XP`} caption="from lessons" />
                  <Pillar label="Planning" value={`${data.clean_paper_plans}`} caption="clean paper plans" />
                  <Pillar label="Discipline" value={`${data.calls_resolved}`} caption="calls resolved" />
                </View>
              </View>

              {data.belt_source === 'legacy_points' && belt !== 'white' ? (
                <T size={11.5} lh={17} c={color.dim} testID="belt-legacy-note">
                  You earned this belt on points, before the test existed. It is yours and it stays
                  yours. Your next belt needs its test, like everybody else&rsquo;s
                  {data.may_convert_legacy ? ' — and you can sit this one voluntarily if you want it on the record.' : '.'}
                </T>
              ) : null}
            </ObjectCard>

            {/* ── the next rung ───────────────────────────────────────────── */}
            {next ? (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                  <T size={17} weight="bold" style={{ flex: 1 }}>{`Next: ${next.label} Belt`}</T>
                  <Num size={12} c={color.dim}>
                    {ring === null ? '' : `${Math.round(ring * 100)}%`}
                  </Num>
                </View>

                <ObjectCard r={radius.xl} style={{ paddingHorizontal: 15, paddingVertical: 4 }}>
                  {next.checks.map((c, i) => (
                    <View
                      key={`${c.kind}-${c.key ?? c.label}`}
                      testID={`belt-check-${c.kind}-${c.key ?? i}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 12,
                        borderBottomWidth: i === next.checks.length - 1 ? 0 : 0.5,
                        borderBottomColor: alpha.ivory08,
                      }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          borderWidth: c.met ? 0 : 1,
                          borderColor: alpha.ivory20,
                          backgroundColor: c.met ? color.green : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {c.met ? <Check size={11} color={color.bg} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <T size={13} c={c.met ? color.text : color.muted}>{c.label}</T>
                        {/* WHAT IS SHORT, AND BY HOW MUCH. A locked door with no
                            sign on it is a bug — the same argument the day gates
                            make in `gates.ts`. */}
                        {!c.met && c.need !== null ? (
                          <T size={11} c={color.dim}>{`You have ${c.have ?? 0} of ${c.need}`}</T>
                        ) : null}
                        {!c.met && c.kind === 'competency' ? (
                          <T size={11} c={color.dim}>{competencyNote(c.taught_by)}</T>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </ObjectCard>

                {/* THE ACTION. Explicit, and shut with a reason when it is shut. */}
                {next.may_sit ? (
                  <Button
                    testID="belt-sit-exam"
                    label={`Sit the ${next.label} Belt test`}
                    arrow
                    onPress={() => router.push(`/training/belt/exam/${next.key}` as never)}
                  />
                ) : (
                  <ObjectCard r={radius.xl} style={{ padding: 13, gap: 7 }} testID="belt-exam-shut">
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Lock size={13} color={color.dim} />
                      <T size={12.5} weight="bold" c={color.muted}>
                        {`The ${next.label} Belt test is not open yet`}
                      </T>
                    </View>
                    <T size={12} lh={18} c={color.muted}>{shutReason(next)}</T>
                  </ObjectCard>
                )}

                {next.proposed ? (
                  <T size={11} lh={16} c={color.dim}>
                    The numbers on this rung are a proposal and may change before it opens. Blue is
                    the rung that has been argued and built.
                  </T>
                ) : null}
              </View>
            ) : (
              <ObjectCard r={radius.xl} style={{ padding: 14, gap: 6 }}>
                <T size={13} weight="bold">There is no rung above this one</T>
                <T size={12.5} lh={19} c={color.muted}>
                  Black is the top of the ladder. It is not a licence and it is not a claim that any
                  trade is safe.
                </T>
              </ObjectCard>
            )}

            {/* ── the rules, printed verbatim ─────────────────────────────── */}
            <View style={{ gap: 8 }} testID="belt-explainer">
              <Eyebrow c={color.muted}>HOW THIS IS SCORED</Eyebrow>
              {data.explainer.lines.map((line) => (
                <T key={line} size={12} lh={18} c={color.muted}>{line}</T>
              ))}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
                {data.explainer.belts.map((b) => (
                  <View
                    key={b.key}
                    style={{
                      flexDirection: 'row',
                      gap: 6,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: radius.sm,
                      borderWidth: 0.5,
                      borderColor: b.key === belt ? beltEdge(belt) : alpha.ivory16,
                    }}
                  >
                    <T size={10} c={isBelt(b.key) ? beltInk(b.key) : color.muted}>{b.label}</T>
                    <Num size={10} c={color.dim}>{String(b.min_points)}</Num>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** One of the three pillars Board 09 names under the belt. */
function Pillar({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
      <T size={12} c={color.muted} style={{ width: 74 }}>{label}</T>
      <Num size={13} weight="bold">{value}</Num>
      <T size={10.5} c={color.dim} style={{ flex: 1 }}>{caption}</T>
    </View>
  );
}

/**
 * The ring. Null — at Black, or before the server answers — draws an empty
 * track and no number, because a full ring would be a claim and an invented
 * percentage would be a lie.
 */
function EligibilityRing({ value }: { value: number | null }) {
  const size = 104;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} testID="belt-ring">
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={alpha.ivory10} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color.green}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Num size={20} weight="bold">{value === null ? '—' : `${Math.round(filled * 100)}%`}</Num>
      <T size={9} c={color.dim} ls={0.6}>TO ELIGIBLE</T>
    </View>
  );
}

/**
 * A competency nobody can demonstrate yet, said out loud.
 *
 * Four of the five competency keys the ladder asks for belong to lessons that
 * have not been written. Hiding that would be promising a belt the curriculum
 * cannot currently deliver; the audit's whole complaint about this product is
 * the gap between what a screen claims and what exists behind it.
 */
function competencyNote(taughtBy: string | null): string {
  if (!taughtBy) return 'Not demonstrated yet.';
  const node = lessonNodeById(taughtBy);
  if (!node) return 'Not demonstrated yet.';
  return node.hasContent
    ? `Demonstrated in ${node.title}.`
    : `Measured by ${node.title}, which is still being written.`;
}

function shutReason(next: {
  eligible: boolean;
  exam_written: boolean;
  attempts_30d: number;
  attempts_cap: number;
  cooldown_until: string | null;
  label: string;
}): string {
  if (!next.eligible) {
    return 'It unlocks when everything above is done. XP and calls buy the right to sit the test; the test is what earns the belt.';
  }
  if (!next.exam_written) {
    return `You are eligible. The ${next.label} Belt test itself has not been written yet — Blue is the only rung built so far, and the others follow once its pass rate says the bar is in the right place.`;
  }
  if (next.cooldown_until) {
    return `There is a wait after a failed attempt. You can sit it again after ${new Date(next.cooldown_until).toLocaleString()}.`;
  }
  if (next.attempts_30d >= next.attempts_cap) {
    return `You have used your ${next.attempts_cap} sittings for this month. The cap exists so the chart tasks cannot be brute-forced by repetition.`;
  }
  return 'It is not open right now.';
}
