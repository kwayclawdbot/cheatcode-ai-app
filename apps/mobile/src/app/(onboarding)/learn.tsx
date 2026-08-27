import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { KaiBubble } from '../../ui/Bubble';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ProgressDots } from '../../ui/Progress';
import { LevelChart, LevelLegend, LevelKey } from '../../ui/MiniChart';
import { Bell } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

const PROMPT = 'Which of these three would tell you buyers have taken control?';
const RIGHT = 'Exactly. Above 504, buyers are in control. Want me to watch it for you?';
const WRONG: Record<Exclude<LevelKey, '504'>, string> = {
  '540': "That's the target — where I'd take profit. Confirmation happens lower, where buyers first prove themselves.",
  '460': "That's the invalidation — below it the idea is wrong. Confirmation is the level above the band.",
};

/** V3-O1-Tap-to-learn.html — one idea, learned by doing. */
export default function Learn() {
  const router = useRouter();
  const { patchProfile } = useSession();
  const { width } = useWindowDimensions();
  const [chosen, setChosen] = useState<LevelKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const correct = chosen === '504';
  const chartWidth = Math.min(width, 430) - 40 - 32; // screen padding 20*2 + card padding 16*2

  const finish = async () => {
    setBusy(true);
    try {
      if (api.available()) {
        await api.draftAlert('Watch META for a break above 504', { symbol: 'META', level: 504, setup_id: 'seed-meta' });
        setNote('Saved — it\'s under Watching in Alerts as a draft.');
      }
      await patchProfile({ onboarding: { completed: true } });
    } catch {
      setNote("I couldn't save that watch yet — you can set it again from Alerts.");
    } finally {
      setBusy(false);
      router.replace('/home');
    }
  };

  return (
    <Screen variant="dome" layout="stack" testID="screen-learn">
      <T size={24} weight="bold" ls={-0.4} lh={30} align="center">{'Tap the level that would\nconfirm this setup'}</T>

      <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
        <ObjectCard r={radius.xxxl} style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T size={17} weight="bold">META</T>
            <View style={{ paddingHorizontal: 9, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
              <T size={12} weight="bold" c={color.violet}>B+</T>
            </View>
          </View>
          <LevelChart chosen={chosen} onChoose={setChosen} width={chartWidth} />
          <LevelLegend />
        </ObjectCard>

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <KaiOrb size={30} />
          <KaiBubble style={{ flex: 1 }}>
            {chosen === null ? (
              <T size={14} lh={20}>{PROMPT}</T>
            ) : correct ? (
              <T size={14} lh={20}>
                Exactly. Above <T size={14} lh={20} weight="bold">504</T>, buyers are in control. Want me to watch it for you?
              </T>
            ) : (
              <T size={14} lh={20}>{WRONG[chosen as Exclude<LevelKey, '504'>]}</T>
            )}
          </KaiBubble>
        </View>

        <Button
          testID="cta-watch"
          label="Watch 504 for me"
          height={48}
          icon={<Bell size={15} color={color.bg} strokeWidth={2.2} />}
          disabled={!correct}
          loading={busy}
          onPress={finish}
          accessibilityHint={correct ? 'Creates a draft alert Kai will monitor.' : 'Pick the confirmation level first.'}
        />
        {note ? <T size={11} c={color.muted} align="center">{note}</T> : null}
      </View>

      <ProgressDots total={4} done={4} caption="Step 4 of 4" />
    </Screen>
  );
}
