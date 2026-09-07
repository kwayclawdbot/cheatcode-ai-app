import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ObjectCard } from '../../ui/Panel';
import { alpha, color, radius } from '../../ui/tokens';
import { TRAINING_UNITS } from '../../features/training/curriculum';
import { LessonPathRow, TrainingProgress } from '../../features/training/ui';
import { useTraining } from '../../features/training/store';

export default function TrainingHome() {
  const router = useRouter();
  const { profile } = useTraining();
  const unit = TRAINING_UNITS[0];
  const complete = profile.completedLessonIds.length;
  const pct = Math.round((complete / unit.lessons.length) * 100);

  return (
    <Screen variant="corner" testID="screen-training">
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
        paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: alpha.ivory07,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><T size={22} c={color.muted}>‹</T></Pressable>
        <T size={16} weight="bold" align="center" style={{ flex: 1 }}>Training</T>
        <Pressable onPress={() => router.push('/training/progress' as never)} hitSlop={12}>
          <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 0.5, borderColor: alpha.ivory20, alignItems: 'center', justifyContent: 'center' }}>
            <T size={12}>◉</T>
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: 260, overflow: 'hidden' }}>
          <Image
            source={require('../../../assets/training/hero_black_male.png')}
            style={{ position: 'absolute', right: -20, top: 0, width: '62%', height: '100%' }}
            contentFit="contain"
          />
          <View style={{ position: 'absolute', left: 16, top: 26, width: '64%' }}>
            <T size={10} weight="bold" c={color.muted} style={{ letterSpacing: 1.3 }}>TRAINING MODE</T>
            <T size={29} weight="bold" lh={33} style={{ marginTop: 8 }}>Your Path to{'\n'}Confident Trading</T>
            <T size={12.5} lh={19} c={color.muted} style={{ marginTop: 8 }}>
              Structured lessons. Real market skills. Kai with you the whole way.
            </T>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14 }}>
          <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: alpha.gold14, alignItems: 'center', justifyContent: 'center' }}>
                <T size={18} c={color.gold}>↗</T>
              </View>
              <View style={{ flex: 1 }}>
                <T size={13.5} weight="bold">Trader Foundations</T>
                <T size={10.5} c={color.muted}>{complete} / {unit.lessons.length} lessons</T>
              </View>
              <T size={12} weight="bold">{pct}%</T>
            </View>
            <TrainingProgress value={pct} />
          </ObjectCard>

          <View style={{ gap: 2 }}>
            {unit.lessons.map((lesson, i) => {
              const done = profile.completedLessonIds.includes(lesson.id);
              const active = profile.currentLessonId === lesson.id;
              const locked = i > profile.completedLessonIds.length;
              return (
                <LessonPathRow
                  key={lesson.id}
                  lesson={lesson}
                  index={i}
                  active={active}
                  complete={done}
                  locked={locked}
                  onPress={() => router.push(`/training/${lesson.id}` as never)}
                />
              );
            })}
          </View>

          <Button
            label="Continue Training"
            arrow
            onPress={() => router.push(`/training/${profile.currentLessonId}` as never)}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
