import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Eyebrow, Num } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ObjectCard } from '../../ui/Panel';
import { Check, ChevronRight, Lock } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { SkillBar, TrainingProgress } from '../../features/training/ui';
import { useTraining } from '../../features/training/store';
import { TRAINING_DAYS, lessonsForDay } from '../../features/training/curriculum';
import {
  dayCompletedLessonIds,
  dayState,
  evaluateDayGate,
  programmeProgressPct,
} from '../../features/training/gates';
import { currentStep, lessonsForStep, nextWrittenLesson } from '../../features/training/path';
import { SIGNAL_META, SKILL_LABEL, SKILL_ORDER } from '../../features/training/labels';
import { competencyRegistry } from '../../features/training/competencies';
import type { CompetencySignal } from '../../features/training/types';

/**
 * SKILL PROGRESS — Board 09, middle screen.
 *
 * ===========================================================================
 * WHAT CHANGED, AND WHY
 * ===========================================================================
 * This screen used to open with nine mastery bars, then a table of every
 * competency in the curriculum, then seven day cards with their gate chips. All
 * of it true, none of it an answer to the question a member actually arrives
 * with: WHAT DO I DO NEXT?
 *
 * The audit's F12 says it in one line: "Lead with the next demonstrated skill
 * and a concise achievement." Board 09 draws that — one ring for the module the
 * member is in, three rows saying Passed / Practising / Next, and a card naming
 * the next skill with a button on it.
 *
 * So the detail moved DOWN, behind "View full progress", where somebody who
 * wants to audit their own record can still read every number. Nothing was
 * deleted; the order changed, and the order was the finding.
 *
 * ===========================================================================
 * A COMPETENCY NOBODY HAS BEEN ASKED TO DEMONSTRATE READS "NEXT"
 * ===========================================================================
 * Never 0%, never a blank. In this product a blank in a scoring table reads as
 * a finding, and "we have not asked you yet" is not a finding.
 */

/** The three words the board uses, and what each of them means here. */
const ROW_STATE = {
  passed: { label: 'Passed', c: color.green },
  practising: { label: 'Practising', c: color.gold },
  next: { label: 'Next', c: color.dim },
} as const;

type RowState = keyof typeof ROW_STATE;

function rowStateFor(signal: CompetencySignal | undefined): RowState {
  if (!signal || signal === 'unproven') return 'next';
  if (signal === 'developing') return 'practising';
  return 'passed';
}

export default function TrainingProgressScreen() {
  const router = useRouter();
  const { profile, storage } = useTraining();
  const [showAll, setShowAll] = useState(false);

  const step = currentStep(profile);
  const registry = competencyRegistry();
  const next = nextWrittenLesson(profile);

  // The module ring is about the module, not the whole seven days. A member who
  // has done everything that exists should not be shown 3%.
  const stepLessons = lessonsForStep(step).filter((l) => l.hasContent);
  const stepDone = stepLessons.filter((l) => profile.completedLessonIds.includes(l.id)).length;
  const modulePct = stepLessons.length === 0 ? 0 : Math.round((stepDone / stepLessons.length) * 100);

  // The most recent thing actually demonstrated. Null is a normal answer.
  const achievement = registry.find((t) => rowStateFor(profile.competencies[t.key]) === 'passed');

  return (
    <Screen variant="corner" testID="screen-training-progress">
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
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <T size={22} c={color.muted}>‹</T>
        </Pressable>
        <T size={16} weight="bold" align="center" style={{ flex: 1 }}>Your progress</T>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <View style={{ gap: 5 }}>
          <Eyebrow c={color.muted}>YOUR PROGRESS</Eyebrow>
          <T size={27} weight="bold" ls={-0.5}>{step.title}</T>
          <T size={13} c={color.muted}>{step.outcome}</T>
        </View>

        {/* ── the ring, and the one achievement beside it ─────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <ModuleRing value={modulePct} />
          <View style={{ flex: 1, gap: 6, borderLeftWidth: 0.5, borderLeftColor: alpha.ivory12, paddingLeft: 16 }}>
            <Eyebrow c={color.muted}>LATEST{'\n'}ACHIEVEMENT</Eyebrow>
            {achievement ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: color.green,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={12} color={color.bg} />
                </View>
                <T size={13.5} weight="bold" style={{ flex: 1 }}>{achievement.label}</T>
              </View>
            ) : (
              <T size={12.5} lh={18} c={color.dim}>
                Nothing demonstrated yet. The first lesson measures one.
              </T>
            )}
          </View>
        </View>

        {/* ── Passed / Practising / Next ──────────────────────────────────── */}
        <ObjectCard r={radius.xl} style={{ paddingHorizontal: 15, paddingVertical: 4 }}>
          {registry.map((tag, i) => {
            const state = rowStateFor(profile.competencies[tag.key]);
            const meta = ROW_STATE[state];
            return (
              <View
                key={tag.key}
                testID={`training-competency-${tag.key}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 12,
                  borderBottomWidth: i === registry.length - 1 ? 0 : 0.5,
                  borderBottomColor: alpha.ivory08,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: state === 'passed' ? 0 : 1,
                    borderColor: state === 'practising' ? color.gold : alpha.ivory20,
                    backgroundColor: state === 'passed' ? color.green : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {state === 'passed' ? <Check size={11} color={color.bg} /> : null}
                  {state === 'practising' ? <T size={11} c={color.gold}>···</T> : null}
                </View>
                <T size={13} c={state === 'next' ? color.muted : color.text} style={{ flex: 1 }}>
                  {tag.label}
                </T>
                <T size={11.5} weight="bold" c={meta.c}>{meta.label}</T>
              </View>
            );
          })}
        </ObjectCard>

        {/* ── the next skill, with something to press ─────────────────────── */}
        {next ? (
          <Pressable
            testID="training-next-skill"
            onPress={() => router.push(`/training/${next.id}` as never)}
          >
            <ObjectCard r={radius.xl} style={{ padding: 14, gap: 9 }}>
              <Eyebrow c={color.muted}>NEXT SKILL</Eyebrow>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <T size={15} weight="bold">{next.title}</T>
                  <T size={12} lh={18} c={color.muted}>{next.subtitle}</T>
                </View>
                <ChevronRight size={16} color={color.muted} />
              </View>
              <Button
                testID="training-practise"
                label="Practise this skill"
                arrow
                onPress={() => router.push(`/training/${next.id}` as never)}
              />
            </ObjectCard>
          </Pressable>
        ) : (
          <ObjectCard r={radius.xl} style={{ padding: 14, gap: 6 }}>
            <T size={13} weight="bold">Nothing left to practise yet</T>
            <T size={12.5} lh={19} c={color.muted}>
              You have finished every lesson that has been written. The next ones are being authored.
            </T>
          </ObjectCard>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Check size={11} color={storage === 'account' ? color.green : color.dim} />
          <T size={11} c={color.muted}>
            {storage === 'account'
              ? 'This record is on your account, not on this phone.'
              : storage === 'device'
              ? 'Kept on this device until the service is reachable.'
              : 'Practising as a guest — sign in to keep this.'}
          </T>
        </View>

        {/* ── everything else, one tap down ───────────────────────────────── */}
        <Pressable
          testID="training-view-progress"
          onPress={() => setShowAll((v) => !v)}
          style={{ paddingVertical: 6 }}
        >
          <T size={12} weight="bold" c={color.muted}>
            {showAll ? 'Hide full progress' : 'View full progress'}
          </T>
        </Pressable>

        {showAll ? (
          <>
            <View style={{ gap: 9 }}>
              <Eyebrow c={color.muted}>SKILL MASTERY</Eyebrow>
              <ObjectCard r={radius.xl} style={{ padding: 15, gap: 14 }}>
                {SKILL_ORDER.map((key) => (
                  <SkillBar key={key} label={SKILL_LABEL[key]} value={profile.mastery[key] ?? 0} />
                ))}
              </ObjectCard>
              <T size={11} lh={16} c={color.dim}>
                Mastery is the sum of what each completed lesson was worth, counted once. Re-walking
                a lesson to fix a weak score raises the score, not the bar.
              </T>
            </View>

            <View style={{ gap: 9 }}>
              <Eyebrow c={color.muted}>COMPETENCY SIGNALS</Eyebrow>
              <ObjectCard r={radius.xl} style={{ paddingHorizontal: 15, paddingVertical: 4 }}>
                {registry.map((tag, i) => {
                  const signal = profile.competencies[tag.key] ?? 'unproven';
                  const meta = SIGNAL_META[signal];
                  return (
                    <View
                      key={tag.key}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 12,
                        borderBottomWidth: i === registry.length - 1 ? 0 : 0.5,
                        borderBottomColor: alpha.ivory08,
                      }}
                    >
                      <T size={13} c={color.text} style={{ flex: 1 }}>{tag.label}</T>
                      <T size={11.5} weight="bold" c={meta.c}>{meta.label}</T>
                    </View>
                  );
                })}
              </ObjectCard>
              <T size={11} lh={16} c={color.dim}>
                These come from what you actually answered. “Passed” means you explained it in your
                own words — nothing scored that one.
              </T>
            </View>

            <View style={{ gap: 9 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Eyebrow c={color.muted}>DAY BY DAY</Eyebrow>
                <View style={{ flex: 1 }} />
                <Num size={10.5} c={color.dim} testID="training-overall-pct">
                  {`${programmeProgressPct(profile)}% of the plan`}
                </Num>
              </View>
              <View style={{ gap: 9 }}>
                {TRAINING_DAYS.map((day) => {
                  const state = dayState(profile, day.id);
                  const gate = evaluateDayGate(profile, day.id);
                  const done = dayCompletedLessonIds(profile, day.id).length;
                  const total = lessonsForDay(day.id).length;
                  const dayPct = total === 0 ? 0 : Math.round((done / total) * 100);
                  const written = lessonsForDay(day.id).filter((l) => l.hasContent).length;
                  return (
                    <ObjectCard
                      key={day.id}
                      testID={`training-progress-day-${day.index}`}
                      r={radius.lg}
                      style={{ padding: 13, gap: 9, opacity: state === 'locked' ? 0.62 : 1 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Num size={12} weight="bold" c={color.dim} style={{ width: 18 }}>
                          {String(day.index)}
                        </Num>
                        <T size={13} weight="bold" style={{ flex: 1 }} numberOfLines={1}>{day.title}</T>
                        {state === 'complete' ? (
                          <Check size={14} color={color.volt} />
                        ) : state === 'locked' ? (
                          <Lock size={13} color={color.dim} />
                        ) : (
                          <Num size={11.5} weight="bold" c={color.volt}>{`${dayPct}%`}</Num>
                        )}
                      </View>
                      <TrainingProgress value={dayPct} />
                      {written === 0 ? (
                        <T size={10.5} c={color.dim}>No lesson in this day has been written yet.</T>
                      ) : null}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <GateChip
                          label={gate.score.label}
                          needed={gate.score.needed}
                          actual={gate.score.actual}
                          met={gate.score.met}
                        />
                        {gate.requirements.map((r) => (
                          <GateChip
                            key={r.label}
                            label={r.label}
                            needed={r.needed}
                            actual={r.actual}
                            met={r.met}
                          />
                        ))}
                      </View>
                    </ObjectCard>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}

        <Pressable testID="training-open-belt-from-progress" onPress={() => router.push('/training/belt' as never)}>
          <ObjectCard r={radius.xl} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <T size={13} weight="bold">Your belt</T>
              <T size={12} lh={18} c={color.muted}>
                What this and your calls add up to, and what the next belt asks for.
              </T>
            </View>
            <ChevronRight size={16} color={color.muted} />
          </ObjectCard>
        </Pressable>

        <Button label="Back to the path" kind="outline" onPress={() => router.replace('/training' as never)} />
      </ScrollView>
    </Screen>
  );
}

/** The module ring. One number, and it is about the module the member is in. */
function ModuleRing({ value }: { value: number }) {
  const size = 132;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, value / 100));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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
      <Num size={27} weight="bold" testID="training-module-pct">{`${value}%`}</Num>
      <T size={9} c={color.dim} ls={0.7}>COMPLETE</T>
    </View>
  );
}

/** A single gate threshold, with the number it needs and the number it has. */
function GateChip({
  label,
  needed,
  actual,
  met,
}: {
  label: string;
  needed: number;
  actual: number;
  met: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: radius.sm,
        borderWidth: 0.5,
        borderColor: met ? alpha.volt50 : alpha.ivory16,
        backgroundColor: met ? alpha.volt08 : 'transparent',
      }}
    >
      <T size={10} c={met ? color.volt : color.muted}>{label}</T>
      <Num size={10} weight="bold" c={met ? color.volt : color.dim}>
        {`${actual}/${needed}%`}
      </Num>
    </View>
  );
}
