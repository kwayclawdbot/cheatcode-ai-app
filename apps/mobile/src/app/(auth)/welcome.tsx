import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { Button } from '../../ui/Button';
import { alpha, color, gradientAngle, radius } from '../../ui/tokens';

/**
 * Welcome — prototype board "Welcome".
 * Mark, name, one promise, one line from Kai, and the two ways in. Nothing
 * else: the first screen's job is to say what this is and let the person move.
 */
export default function Welcome() {
  const router = useRouter();

  return (
    <Screen variant="dome" layout="stack" testID="screen-welcome" style={{ paddingTop: 120, paddingHorizontal: 24, paddingBottom: 48 }}>
      <View style={{ flex: 1, alignItems: 'center', gap: 18 }}>
        <View
          style={{
            width: 76, height: 76, borderRadius: 22, backgroundColor: color.volt,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: color.volt, shadowOpacity: 0.35, shadowRadius: 25, shadowOffset: { width: 0, height: 0 },
          }}
        >
          <Svg width={38} height={38} viewBox="0 0 24 24" fill="none">
            <Path d="M13 3 4 14h6l-1 7 9-11h-6l1-7z" stroke={color.bg} strokeWidth={2.4} />
          </Svg>
        </View>

        <T size={32} weight="bold" ls={-0.5}>Cheat Code AI</T>

        <T size={15} c={color.muted} align="center" lh={22}>
          Trade with Kai — an AI that grades setups, watches your risk, and never spends a dollar without you.
        </T>

        <LinearGradient
          colors={[alpha.violet20, alpha.violet06]}
          start={gradientAngle.start}
          end={gradientAngle.end}
          style={{
            flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 12,
            paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.xl,
            borderWidth: 0.5, borderColor: alpha.violet50,
          }}
        >
          <KaiOrb size={28} />
          <T size={13} lh={18}>“I'll show you one real setup in the first minute.”</T>
        </LinearGradient>
      </View>

      <View style={{ gap: 10 }}>
        <Button testID="cta-get-started" label="Create account" height={52} arrow onPress={() => router.push('/sign-up')} />
        <Button testID="cta-sign-in" label="Log in" kind="outline" height={46} onPress={() => router.push('/sign-in')} />
      </View>
    </Screen>
  );
}
