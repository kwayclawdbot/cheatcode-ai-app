import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Toggle } from '../../ui/Toggle';
import { KaiOrb } from '../../ui/KaiOrb';
import { Plus } from '../../ui/Icons';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import { fixtureRiskPolicy } from '../../lib/fixtures';
import { useSession } from '../../lib/session';
import type { GoalMode, RiskPolicy } from '../../lib/types';

const MODE_LABEL: Record<GoalMode, string> = { day_trade: 'Day Trade', swing: 'Swing', invest: 'Invest' };
const INVOLVEMENT_LABEL = { hands_on: 'I confirm every action', guided: 'Kai prepares, I approve' } as const;

/** V3-AC1-Account.html — rules, brokers, Kai involvement. */
export default function Account() {
  const router = useRouter();
  const { profile, session, signOut, patchProfile } = useSession();
  const [policy, setPolicy] = useState<RiskPolicy | null>(env.FIXTURES || !supabase ? fixtureRiskPolicy : null);
  const [memory, setMemory] = useState<boolean>(profile?.memory_enabled ?? true);

  useEffect(() => { setMemory(profile?.memory_enabled ?? true); }, [profile?.memory_enabled]);

  useEffect(() => {
    let alive = true;
    if (env.FIXTURES || !supabase || !session) return;
    supabase.from('risk_policies').select('daily_loss_cap_usd, max_position_pct').maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        const d = data as { daily_loss_cap_usd: number | null; max_position_pct: number | null };
        setPolicy({
          daily_loss_cap: d.daily_loss_cap_usd ?? 0,
          max_position_pct: d.max_position_pct ?? 0,
          involvement: (profile?.involvement as 'hands_on' | 'guided') ?? 'hands_on',
        });
      });
    return () => { alive = false; };
  }, [session, profile?.involvement]);

  const name = profile?.display_name ?? session?.user.email?.split('@')[0] ?? 'You';
  const mode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const involvement = policy?.involvement ?? profile?.involvement ?? 'hands_on';

  const toggleMemory = async (v: boolean) => {
    setMemory(v);
    await patchProfile({ memory_enabled: v });
  };

  return (
    <Screen variant="corner" layout="tab" testID="screen-account">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 11, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <LinearGradient
            colors={gradient.avatar as unknown as readonly [string, string, ...string[]]}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 0.5, borderColor: alpha.ivory20, alignItems: 'center', justifyContent: 'center' }}
          >
            <T size={22} weight="bold">{name.slice(0, 1).toUpperCase()}</T>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <T size={20} weight="bold">{name}</T>
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, borderColor: alpha.volt50 }}>
                <T size={10} c={color.volt}>{MODE_LABEL[mode]}</T>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, borderColor: alpha.cyan40 }}>
                <T size={10} c={color.cyan}>Paper</T>
              </View>
            </View>
          </View>
        </View>

        <Eyebrow>MY RULES</Eyebrow>
        <RowList>
          <Row>
            <T size={13} style={{ flex: 1 }}>Daily loss cap</T>
            <Num size={13} c={color.gold}>{policy ? `$${policy.daily_loss_cap}` : '—'}</Num>
          </Row>
          <Row>
            <T size={13} style={{ flex: 1 }}>Max position size</T>
            <Num size={13}>{policy ? `${policy.max_position_pct}% of balance` : '—'}</Num>
          </Row>
          <Row>
            <T size={13} style={{ flex: 1 }}>Kai involvement</T>
            <T size={12} c={color.violetLight}>{INVOLVEMENT_LABEL[involvement as 'hands_on' | 'guided']}</T>
          </Row>
          <Row last>
            <T size={13} style={{ flex: 1 }}>Paper trading</T>
            <Toggle testID="toggle-paper" value onChange={undefined} disabled label="Paper trading" />
          </Row>
        </RowList>
        <T size={10} c={color.muted} style={{ marginTop: -4 }}>
          Paper is the only mode in this release — real money needs a broker, which comes later.
        </T>

        <Eyebrow>CONNECTED</Eyebrow>
        <RowList>
          <Row last>
            <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 0.5, borderColor: alpha.ivory14, backgroundColor: alpha.ivory06, alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={13} color={color.muted} />
            </View>
            <T size={13} c={color.muted} style={{ flex: 1 }}>None — add a broker (later release)</T>
          </Row>
        </RowList>

        <Eyebrow c={color.violetLight}>KAI</Eyebrow>
        <ObjectCard tone="kai" r={radius.xl} style={{ paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <KaiOrb size={24} />
          <View style={{ flex: 1 }}>
            <T size={13} weight="semibold">Kai remembers what you tell him</T>
            <T size={11} c={color.muted} style={{ marginTop: 2 }}>Turn this off and every conversation starts fresh.</T>
          </View>
          <Toggle testID="toggle-memory" value={memory} onChange={toggleMemory} label="Kai memory" />
        </ObjectCard>

        <Button
          testID="cta-sign-out"
          label="Sign out"
          kind="outline"
          height={48}
          onPress={async () => { await signOut(); router.replace('/welcome'); }}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </Screen>
  );
}
