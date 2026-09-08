import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Eyebrow, Num } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ObjectCard } from '../../ui/Panel';
import { Check, Lock } from '../../ui/Icons';
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
import { SIGNAL_META, SKILL_LABEL, SKILL_ORDER } from '../../features/training/labels';
import { competencyRegistry } from '../../features/training/competencies';

/**
 * THE TRADER PROFILE.
 *
 * Two different questions, answered separately because they are different
 * questions. Skill mastery says how far along an AREA is. The competency
 * signals underneath say WHERE inside it the member is weak — which is the
 * half Kai needs, because "Lesson 1 completed" tells a tutor nothing.
 *
 * A competency nobody has been asked to demonstrate reads "Not yet shown",
 * never 0% and never a blank. In this product a blank in a scoring table reads
 * as a finding, and "we have not asked you" is not a finding.
 */
export default function TrainingProgressScreen() {
  const router = useRouter();
  const { profile } = useTraining();
  const pct = programmeProgressPct(profile);
  const registry = competencyRegistry();

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
        <T size={16} weight="bold" align="center" style={{ flex: 1 }}>Your Progress</T>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 9 }}>
          <View
            style={{
              width: 112,
              height: 112,
              borderRadius: 56,
              borderWidth: 12,
              borderColor: alpha.ivory10,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Num size={25} weight="bold" testID="training-overall-pct">{`${pct}%`}</Num>
          </View>
          <T size={16} weight="bold">Zero to Trade Ready</T>
          <T size={11.5} c={color.muted}>
            {profile.completedLessonIds.length === 0
              ? 'Nothing completed yet — Day 1 is open.'
              : `${TRAINING_DAYS.filter((d) => dayState(profile, d.id) === 'complete').length} of 7 days complete`}
          </T>
        </View>

        {/* ── skill mastery ────────────────────────────────────────────── */}
        <View style={{ gap: 9 }}>
          <Eyebrow c={color.muted}>SKILL MASTERY</Eyebrow>
          <ObjectCard r={radius.xl} style={{ padding: 15, gap: 14 }}>
            {SKILL_ORDER.map((key) => (
              <SkillBar key={key} label={SKILL_LABEL[key]} value={profile.mastery[key] ?? 0} />
            ))}
          </ObjectCard>
        </View>

        {/* ── granular competency signals ──────────────────────────────── */}
        <View style={{ gap: 9 }}>
          <Eyebrow c={color.muted}>COMPETENCY SIGNALS</Eyebrow>
          <ObjectCard r={radius.xl} style={{ paddingHorizontal: 15, paddingVertical: 4 }}>
            {registry.map((tag, i) => {
              const signal = profile.competencies[tag.key] ?? 'unproven';
              const meta = SIGNAL_META[signal];
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
                  <T size={13} c={color.text} style={{ flex: 1 }}>{tag.label}</T>
                  <T size={11.5} weight="bold" c={meta.c}>{meta.label}</T>
                </View>
              );
            })}
          </ObjectCard>
          <T size={11} lh={16} c={color.dim}>
            These come from what you actually answered. “Passed” means you explained it in your own
            words — nothing scored that one.
          </T>
        </View>

        {/* ── day by day ───────────────────────────────────────────────── */}
        <View style={{ gap: 9 }}>
          <Eyebrow c={color.muted}>DAY BY DAY</Eyebrow>
          <View style={{ gap: 9 }}>
            {TRAINING_DAYS.map((day) => {
              const state = dayState(profile, day.id);
              const gate = evaluateDayGate(profile, day.id);
              const done = dayCompletedLessonIds(profile, day.id).length;
              const total = lessonsForDay(day.id).length;
              const dayPct = total === 0 ? 0 : Math.round((done / total) * 100);
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

        <View style={{ overflow: 'hidden', borderRadius: radius.xl, backgroundColor: color.surface3 }}>
          <Image
            source={require('../../../assets/training/kai_learner_black_male.png')}
            style={{ width: '100%', height: 190 }}
            contentFit="cover"
          />
          <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
            <T size={15} weight="bold">“Progress over perfection. Keep going.”</T>
            <Eyebrow c={color.violetLight}>KAI</Eyebrow>
          </View>
        </View>

        <Button label="Back to the Path" kind="outline" onPress={() => router.replace('/training' as never)} />
      </ScrollView>
    </Screen>
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
