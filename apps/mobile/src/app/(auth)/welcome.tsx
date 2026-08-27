import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { KaiBubble } from '../../ui/Bubble';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { BandChart } from '../../ui/MiniChart';
import { Info } from '../../ui/Icons';
import { color, type } from '../../ui/tokens';

/**
 * Welcome / first run — V2-O1-First-run.html.
 * The artboard is step 2 of the walkthrough; the brief maps it to the pre-auth
 * entry, so the header rhythm, Kai bubble, teaching panel and the volt/outline
 * button pair are lifted verbatim and only the copy + actions are the entry's.
 */
export default function Welcome() {
  const router = useRouter();

  return (
    <Screen variant="dome" layout="stack" testID="screen-welcome">
      <T size={type.eyebrowHero.size} weight="bold" ls={1.1} c={color.violetLight}>
        CHEAT CODE AI · PAPER MONEY FIRST
      </T>
      <T size={type.heroTitle.size} weight="bold" ls={-0.4} lh={31} style={{ marginTop: 10 }}>
        An AI that watches the market with you
      </T>
      <T size={14} c={color.muted} style={{ marginTop: 8 }}>
        Kai grades setups before you look, shows the risk first, and never moves money without you.
      </T>

      <View style={{ gap: 11, marginTop: 22, flex: 1 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <KaiOrb size={30} />
          <KaiBubble style={{ flex: 1 }}>
            <T size={14} lh={20}>
              I'm Kai. I'll show you what I look at — <T size={14} lh={20} weight="bold">a level, the volume, and what would prove me wrong</T>. Nothing here spends real money.
            </T>
          </KaiBubble>
        </View>

        <ObjectCard style={{ paddingVertical: 13, paddingHorizontal: 15, gap: 9 }}>
          <BandChart />
          <T size={13} lh={20}>
            <T size={13} lh={20} weight="bold" c={color.cyan}>The shaded band</T> is where buyers keep stepping in. Price is above it — that's a good sign, not a guarantee.
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Info size={11} color={color.muted} />
            <T size={11} c={color.muted} style={{ flex: 1 }}>
              “Level” means a price where lots of people tend to buy or sell.
            </T>
          </View>
        </ObjectCard>

        <View style={{ flex: 1 }} />

        <View style={{ gap: 8 }}>
          <Button testID="cta-get-started" label="Get started" height={46} arrow onPress={() => router.push('/sign-up')} />
          <Button testID="cta-sign-in" label="I have an account" kind="outline" height={42} onPress={() => router.push('/sign-in')} />
        </View>
      </View>
    </Screen>
  );
}
