import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ObjectCard } from '../../ui/Panel';
import { alpha, color, radius } from '../../ui/tokens';
import { SkillBar } from '../../features/training/ui';
import { useTraining } from '../../features/training/store';
import { TRAINING_UNITS } from '../../features/training/curriculum';

const skills = [
  ['Market Basics', 'market_basics'],
  ['Candlesticks', 'candles'],
  ['Market Structure', 'market_structure'],
  ['Support & Resistance', 'support_resistance'],
  ['Entries & Exits', 'entries'],
  ['Risk Management', 'risk_management'],
  ['Trade Management', 'trade_management'],
] as const;

export default function TrainingProgressScreen() {
  const router = useRouter();
  const { profile } = useTraining();
  const total = TRAINING_UNITS[0].lessons.length;
  const pct = Math.round((profile.completedLessonIds.length / total) * 100);

  return (
    <Screen variant="corner">
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8,
        paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: alpha.ivory07,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><T size={22} c={color.muted}>‹</T></Pressable>
        <T size={16} weight="bold" align="center" style={{ flex: 1 }}>Your Progress</T>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View style={{
            width: 112, height: 112, borderRadius: 56, borderWidth: 12,
            borderColor: alpha.ivory10, alignItems: 'center', justifyContent: 'center',
          }}>
            <T size={25} weight="bold">{pct}%</T>
          </View>
          <T size={16} weight="bold">Trader Foundations</T>
          <T size={11.5} c={color.muted}>{profile.completedLessonIds.length} of {total} lessons completed</T>
        </View>

        <ObjectCard r={radius.xl} style={{ padding: 15, gap: 14 }}>
          {skills.map(([label, key]) => <SkillBar key={key} label={label} value={profile.mastery[key]} />)}
        </ObjectCard>

        <View style={{ overflow: 'hidden', borderRadius: radius.xl, backgroundColor: color.surface3 }}>
          <Image source={require('../../../assets/training/kai_learner_black_male.png')} style={{ width: '100%', height: 200 }} contentFit="cover" />
          <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
            <T size={15} weight="bold">“Progress over perfection. Keep going.”</T>
            <T size={11} c={color.violetLight} style={{ marginTop: 4 }}>— KAI</T>
          </View>
        </View>

        <Button label="Back to Learning Path" kind="outline" onPress={() => router.replace('/training' as never)} />
      </ScrollView>
    </Screen>
  );
}
