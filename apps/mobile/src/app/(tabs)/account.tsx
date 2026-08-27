import React, { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Toggle } from '../../ui/Toggle';
import { Sheet } from '../../ui/Sheet';
import { KaiOrb } from '../../ui/KaiOrb';
import { ArrowRight, Plus, Gear, Bell, Lock, Bars, Calendar } from '../../ui/Icons';
import { NotConnected, ScreenLoading } from '../../ui/Loading';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { env } from '../../lib/env';
import { useSession } from '../../lib/session';
import { useMe } from '../../features/account/useAccount';
import { ModeSheet, MODE_LABEL } from '../../features/trade/ModeSheet';
import { PaperChip, money } from '../../features/trade/components';
import type { GoalMode } from '../../lib/types';
const INVOLVEMENT_LABEL = { hands_on: 'I confirm every action', guided: 'Kai prepares, I approve' } as const;

function NavRow({
  icon, label, value, onPress, last = false, testID,
}: { icon: React.ReactNode; label: string; value?: string | null; onPress: () => void; last?: boolean; testID?: string }) {
  return (
    <Row last={last}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44 }}
      >
        <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 0.5, borderColor: alpha.ivory14, backgroundColor: alpha.ivory06, alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
        <T size={13.5} style={{ flex: 1 }}>{label}</T>
        {value ? <T size={12} c={color.muted}>{value}</T> : null}
        <ArrowRight size={12} color={color.muted} />
      </Pressable>
    </Row>
  );
}

/**
 * Account — V3-AC1-Account.html, completed.
 * The rules you set, everything Kai holds about you, and the honest state of
 * money: paper only, no broker, upgrades not open yet.
 */
export default function Account() {
  const router = useRouter();
  const { profile, session, signOut, patchProfile } = useSession();
  const { data, loading, isFixture, notAvailable, reload } = useMe();
  const [memory, setMemory] = useState<boolean>(profile?.memory_enabled ?? true);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);
  const [modeOpen, setModeOpen] = useState(false);

  React.useEffect(() => {
    setMemory(data?.memory_enabled ?? profile?.memory_enabled ?? true);
  }, [data?.memory_enabled, profile?.memory_enabled]);

  /** No display name yet: use the readable part of the email, without the
   *  `+tag` a test or alias address carries. */
  const emailName = session?.user.email?.split('@')[0]?.split('+')[0];
  const name = data?.profile.display_name ?? profile?.display_name ?? (emailName || 'You');
  const mode = (data?.profile.primary_mode ?? profile?.primary_mode ?? 'day_trade') as GoalMode;
  const involvement = (data?.risk_policy.involvement ?? profile?.involvement ?? 'hands_on') as 'hands_on' | 'guided';
  const policy = data?.risk_policy ?? null;
  const tier = data?.subscription.tier ?? 'free';

  const toggleMemory = async (v: boolean) => {
    setMemory(v);
    await patchProfile({ memory_enabled: v });
    if (api.available()) {
      try { await api.putMemorySettings(v); } catch { /* profile write already carried it */ }
    }
  };

  const simulate = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      if (api.available()) {
        await api.simulateClosedTrade();
        setSimResult('A closed paper trade was created. Open Debriefs to have Kai review it.');
      } else {
        setSimResult('Fixtures mode — connect the api-app with DEV_TOOLS=1 to create a real simulated trade.');
      }
      reload();
    } catch (e) {
      setSimResult(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setSimulating(false);
    }
  };

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-account">
        <ScreenLoading />
      </Screen>
    );
  }

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
            <T size={20} weight="bold" numberOfLines={1}>{name}</T>
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 4, alignItems: 'center' }}>
              {/* Mode is global context, so it is CHANGEABLE wherever it is shown
                  (audit §6) — the same sheet Trade uses, writing PUT /mode. */}
              <Pressable
                testID="mode-chip"
                accessibilityRole="button"
                accessibilityLabel={`Mode: ${MODE_LABEL[mode]}. Change it.`}
                onPress={() => setModeOpen(true)}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, borderColor: alpha.volt50 }}
              >
                <T size={10} c={color.volt}>{MODE_LABEL[mode]}</T>
              </Pressable>
              <PaperChip />
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, borderColor: tier === 'premium' ? alpha.gold40 : alpha.ivory14 }}>
                <T size={10} c={tier === 'premium' ? color.gold : color.muted}>{tier === 'premium' ? 'Premium' : 'Free'}</T>
              </View>
            </View>
          </View>
        </View>

        {/* Paper strip — the same account Trade opens on, stated the same way. */}
        <Pressable
          testID="paper-strip"
          accessibilityRole="button"
          accessibilityLabel="Practice account. Open your positions."
          onPress={() => router.push('/position')}
        >
          <ObjectCard r={radius.xl} style={{ paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <T size={10} c={color.muted}>Practice balance</T>
              <Num size={19} weight="semibold" style={{ marginTop: 3 }}>
                {data?.paper ? money(data.paper.equity) : '—'}
              </Num>
              <T size={10} c={color.muted} style={{ marginTop: 3 }}>Not real money — nothing here can be withdrawn.</T>
            </View>
            {data?.paper?.buying_power != null ? (
              <View style={{ alignItems: 'flex-end' }}>
                <T size={10} c={color.muted}>Buying power</T>
                <Num size={13} style={{ marginTop: 3 }}>{money(data.paper.buying_power, 0)}</Num>
              </View>
            ) : null}
          </ObjectCard>
        </Pressable>

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
            <T size={12} c={color.violetLight}>{INVOLVEMENT_LABEL[involvement]}</T>
          </Row>
          <Row last>
            <T size={13} style={{ flex: 1 }}>Paper trading</T>
            <Toggle testID="toggle-paper" value onChange={undefined} disabled label="Paper trading" />
          </Row>
        </RowList>
        <T size={10} c={color.muted} style={{ marginTop: -4 }}>
          Paper is the only mode in this release — real money needs a broker, which comes later.
        </T>

        <Eyebrow>SETTINGS</Eyebrow>
        <RowList>
          <NavRow testID="nav-settings" icon={<Gear size={14} color={color.muted} />} label="How Kai talks to you" onPress={() => router.push('/account/settings')} />
          <NavRow testID="nav-notifications" icon={<Bell size={14} color={color.muted} />} label="Notifications" onPress={() => router.push('/account/notifications')} />
          <NavRow testID="nav-memory" icon={<KaiOrb size={14} glow={false} />} label="What Kai remembers" onPress={() => router.push('/account/memory')} />
          <NavRow testID="nav-paper" icon={<Bars size={14} color={color.muted} />} label="Paper account" value={data?.paper ? `$${Math.round(data.paper.equity).toLocaleString('en-US')}` : null} onPress={() => router.push('/account/paper')} />
          <NavRow testID="nav-debriefs" icon={<Calendar size={14} color={color.muted} />} label="Trade debriefs" onPress={() => router.push('/debrief')} />
          <NavRow testID="nav-subscription" icon={<Lock size={14} color={color.muted} />} label="Plan" value={tier === 'premium' ? 'Premium' : 'Free'} onPress={() => router.push('/account/subscription')} last />
        </RowList>

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

        {env.DEV_TOOLS ? (
          <>
            <Eyebrow c={color.gold}>DEVELOPER</Eyebrow>
            <Button
              testID="cta-simulate-trade"
              label="Simulate a closed paper trade (dev)"
              kind="outline"
              height={46}
              loading={simulating}
              onPress={simulate}
            />
          </>
        ) : null}

        <Button
          testID="cta-sign-out"
          label="Sign out"
          kind="outline"
          height={48}
          onPress={async () => { await signOut(); router.replace('/welcome'); }}
          style={{ marginTop: 8 }}
        />

        {notAvailable ? <NotConnected what="Your account details" /> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample account — the account service is not connected here.</T> : null}
      </ScrollView>

      <ModeSheet visible={modeOpen} mode={mode} onClose={() => setModeOpen(false)} />

      <Sheet visible={!!simResult} onClose={() => setSimResult(null)} title="Simulated trade" testID="sheet-simulate">
        <T size={13} lh={20} c={color.muted}>{simResult}</T>
        <Button label="Open debriefs" kind="volt" height={48} onPress={() => { setSimResult(null); router.push('/debrief'); }} />
      </Sheet>
    </Screen>
  );
}
