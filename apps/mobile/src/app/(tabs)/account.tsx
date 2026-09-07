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
import { LegalLinks } from '../../features/legal/LegalLinks';
import { NOT_ADVICE_LONG } from '../../features/legal/disclaimers';
import { api } from '../../lib/api';
import { env } from '../../lib/env';
import { useSession } from '../../lib/session';
import { useKaiProfile, useMe, useSettingsWriter } from '../../features/account/useAccount';
import { FOCUS_CHIP, FOCUS_ORDER } from '../../features/account/profile';
import { ModeSheet, MODE_LABEL } from '../../features/trade/ModeSheet';
import { PaperChip } from '../../features/trade/components';
import type { FocusKey, GoalMode } from '../../lib/types';
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
  const settings = useSettingsWriter(reload);
  const [memory, setMemory] = useState<boolean>(profile?.memory_enabled ?? true);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);
  const [modeOpen, setModeOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  React.useEffect(() => {
    setMemory(data?.memory_enabled ?? profile?.memory_enabled ?? true);
  }, [data?.memory_enabled, profile?.memory_enabled]);

  /**
   * SHARING IS READ, NEVER ASSUMED.
   *
   * It starts false and is only ever moved by an answer from `/me`. A screen
   * that guessed "probably on" would show somebody a switch claiming their
   * trades are public when they are not — or, far worse, the reverse.
   */
  const [shareTrades, setShareTrades] = useState(false);
  React.useEffect(() => {
    if (data) setShareTrades(data.settings.share_trades);
  }, [data?.settings.share_trades, data]);

  const toggleShareTrades = async (v: boolean) => {
    setShareTrades(v);
    const ok = await settings.save({ share_trades: v });
    // The server refused. The switch goes back where it was rather than
    // sitting on a state nothing agreed to.
    if (!ok) setShareTrades(!v);
  };

  /**
   * WHAT THIS PERSON IS CALLED, AND WHAT WE REFUSE TO CALL THEM.
   *
   * The order is: the name they gave, then the username they picked, then
   * "You".
   *
   * IT NO LONGER FALLS BACK TO THEIR EMAIL ADDRESS. It used to read
   * `kcoffie90` off `kcoffie90@gmail.com` and print it at the top of the
   * Account tab as though it were a name somebody had chosen. It is not — it
   * is a login, and showing it as a name is the same mistake an earlier lane
   * rejected for `display_name`. If there is nothing real to show, "You" is
   * honest and the username row below says what is missing.
   */
  const identity = data?.identity ?? null;
  const handle = identity?.handle ?? data?.profile.handle ?? profile?.handle ?? null;
  const name = data?.profile.display_name ?? profile?.display_name ?? handle ?? 'You';
  const needsHandle = identity ? identity.needs_handle : handle === null;
  const mode = (data?.profile.primary_mode ?? profile?.primary_mode ?? 'day_trade') as GoalMode;
  const involvement = (data?.risk_policy.involvement ?? profile?.involvement ?? 'hands_on') as 'hands_on' | 'guided';
  const policy = data?.risk_policy ?? null;
  const tier = data?.subscription.tier ?? 'free';
  const kai = useKaiProfile(mode);

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
            {/* The username, under the name, exactly as a post is signed. A
                blank says it is blank; it never borrows the display name. */}
            <T size={12} c={handle ? color.muted : color.volt} numberOfLines={1} testID="account-handle">
              {handle ? `@${handle}` : 'No username yet'}
            </T>
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 4, alignItems: 'center' }}>
              {/* Mode is global context, so it is CHANGEABLE wherever it is shown
                  (audit §6) — the same sheet Trade uses, writing PUT /mode. */}
              <Pressable
                testID="mode-chip"
                accessibilityRole="button"
                accessibilityLabel={`Mode: ${kai.modeLabel}. Change it.`}
                onPress={() => setModeOpen(true)}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, borderColor: alpha.volt50 }}
              >
                <T size={10} c={color.volt}>{kai.modeLabel}</T>
              </Pressable>
              <PaperChip />
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, borderColor: tier === 'premium' ? alpha.gold40 : alpha.ivory14 }}>
                <T size={10} c={tier === 'premium' ? color.gold : color.muted}>{tier === 'premium' ? 'Premium' : 'Free'}</T>
              </View>
            </View>
          </View>
        </View>

        {/* WHO YOU ARE — the username, and the picture that goes with it.
            Drawn ABOVE the Kai profile because it is the only row on this
            screen other members ever see. */}
        <Eyebrow>YOU</Eyebrow>
        <RowList testID="identity">
          <Pressable
            testID="identity-username"
            accessibilityRole="button"
            accessibilityLabel={handle ? `Username, ${handle}. Change it.` : 'Pick a username.'}
            onPress={() => router.push('/account/username')}
          >
            <Row>
              <View style={{ flex: 1 }}>
                <T size={14}>Username</T>
                <T size={11.5} c={color.muted} style={{ marginTop: 2 }}>
                  {needsHandle
                    ? 'Members are known by a name. Posting asks for one.'
                    : 'What your posts are signed with.'}
                </T>
              </View>
              <T size={13} weight="semibold" c={needsHandle ? color.volt : color.text}>
                {handle ? `@${handle}` : 'Pick one'}
              </T>
              <ArrowRight size={12} color={color.dim} />
            </Row>
          </Pressable>
          <Row last>
            <View style={{ flex: 1 }}>
              <T size={14}>Profile picture</T>
              {/* SAYS WHAT IS TRUE TODAY. The column exists, the upload is
                  another lane's and has not landed; a button that opened a
                  picker and then failed would be worse than this sentence. */}
              <T size={11.5} c={color.muted} style={{ marginTop: 2 }}>
                {identity?.avatar_url
                  ? 'Shown next to your posts.'
                  : 'Not set. Picking a photo arrives with the next release.'}
              </T>
            </View>
            <T size={13} c={color.dim}>{identity?.avatar_url ? 'Set' : 'None'}</T>
          </Row>
        </RowList>

        {/* WHAT THE CLUB SEES.
            Its own section, directly under YOU, because it is a privacy answer
            and privacy answers do not belong buried under a settings chevron.
            The switch is OFF until the server says otherwise — never assumed,
            never optimistically on. */}
        <Eyebrow>WHAT THE CLUB SEES</Eyebrow>
        <RowList testID="sharing">
          <Row last>
            <View style={{ flex: 1 }}>
              <T size={14}>Share my trades</T>
              {/*
                THE PROMISE, IN ONE LINE, AND IT IS ENFORCEABLE.
                It is not a reassurance written by a designer: the shared-trade
                table has no quantity, no notional and no P/L column
                (migration 0038), so there is nothing for a future screen to
                accidentally render. That is why the sentence can be this
                definite.
              */}
              <T size={11.5} lh={16.5} c={color.muted} style={{ marginTop: 3 }}>
                Direction and levels are shown. Size and dollars never are.
              </T>
            </View>
            <Toggle
              testID="toggle-share-trades"
              value={shareTrades}
              label="Share my trades"
              onChange={toggleShareTrades}
            />
          </Row>
        </RowList>
        <T size={10} lh={15} c={color.dim} style={{ marginTop: -4 }}>
          {shareTrades
            ? 'Trades you take appear on your profile and in your followers’ feed. You can still turn any single one off when you send it.'
            : 'Off. Nothing you trade is shown to anybody, and calls you publish are a separate, deliberate act.'}
        </T>
        {settings.error ? (
          <T size={11.5} c={color.red} testID="sharing-error" style={{ marginTop: -4 }}>{settings.error}</T>
        ) : null}

        {/* YOUR KAI PROFILE — the three answers that shape how Kai works.
            Tapping a row changes it and writes PUT /settings. */}
        <Eyebrow>YOUR KAI PROFILE</Eyebrow>
        <T size={11.5} c={color.muted} lh={17} style={{ marginTop: -4 }}>
          Set during onboarding. Changing these changes how Kai scans, writes and warns you.
        </T>
        <RowList testID="kai-profile">
          <Pressable
            testID="kai-profile-mode"
            accessibilityRole="button"
            accessibilityLabel={`Trading mode: ${kai.modeLabel}. Change it.`}
            onPress={kai.cycleMode}
          >
            <Row>
              <T size={13} style={{ flex: 1 }}>Trading mode</T>
              <T size={12.5} weight="semibold" c={color.volt}>{kai.modeLabel}</T>
              <ArrowRight size={12} color={color.muted} />
            </Row>
          </Pressable>
          <Pressable
            testID="kai-profile-experience"
            accessibilityRole="button"
            accessibilityLabel={`Experience level: ${kai.experienceLabel}. Change it.`}
            onPress={kai.cycleExperience}
          >
            <Row>
              <T size={13} style={{ flex: 1 }}>Experience level</T>
              <T size={12.5} c={color.muted}>{kai.experienceLabel}</T>
              <ArrowRight size={12} color={color.muted} />
            </Row>
          </Pressable>
          <Pressable
            testID="kai-profile-focus"
            accessibilityRole="button"
            accessibilityLabel={`Kai watches ${kai.focusShort}. Change it.`}
            onPress={() => setFocusOpen(true)}
          >
            <Row last>
              <T size={13}>Kai watches</T>
              <T size={12.5} c={color.muted} align="right" style={{ flex: 1 }}>{kai.focusShort}</T>
              <ArrowRight size={12} color={color.muted} />
            </Row>
          </Pressable>
        </RowList>

        {/* Kai's own voice line, in Kai's colour, said in the first person. */}
        <View
          testID="kai-voice-line"
          style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 11, paddingHorizontal: 13, borderRadius: 14, backgroundColor: alpha.violet10, borderLeftWidth: 2, borderLeftColor: color.violet }}
        >
          <KaiOrb size={18} glow={false} />
          <T size={12} lh={17.5} c={color.muted} style={{ flex: 1 }}>{kai.voiceLine}</T>
        </View>

        {/* The board goes straight from Kai's voice line to the rules — the
            practice balance already lives on the "Paper account" row below, so
            a second card saying the same number is one card too many (audit). */}
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
          {/* THE ONE DOOR TO YOUR OWN PROFILE. `/contributor/:id` is where a
              member's published calls, their record and their belt live, and
              until this row existed there was no way into it for your own id
              from anywhere in the app — you could reach everybody else's
              profile by tapping their name, and never your own. It is drawn
              only once the session has given us an id, because
              `/contributor/` with nothing after it is a broken screen. */}
          {session?.user?.id ? (
            <NavRow
              testID="nav-profile"
              icon={<Bars size={14} color={color.muted} />}
              label="Your profile and calls"
              onPress={() => router.push(`/contributor/${session.user.id}` as never)}
            />
          ) : null}
          <NavRow testID="nav-settings" icon={<Gear size={14} color={color.muted} />} label="How Kai talks to you" onPress={() => router.push('/account/settings')} />
          <NavRow testID="nav-notifications" icon={<Bell size={14} color={color.muted} />} label="Notifications" onPress={() => router.push('/account/notifications')} />
          <NavRow testID="nav-memory" icon={<KaiOrb size={14} glow={false} />} label="What Kai remembers" onPress={() => router.push('/account/memory')} />
          <NavRow testID="nav-paper" icon={<Bars size={14} color={color.muted} />} label="Paper account" value={data?.paper ? `$${Math.round(data.paper.equity).toLocaleString('en-US')}` : null} onPress={() => router.push('/account/paper')} />
          <NavRow testID="nav-debriefs" icon={<Calendar size={14} color={color.muted} />} label="Trade debriefs" onPress={() => router.push('/debrief')} />
          {/* The research desk is not a setting — it is where the slow work
              lives. It sits here because the tab bar is five items and stays
              five items, not because it is an afterthought. */}
          <NavRow testID="nav-desk" icon={<KaiOrb size={14} glow={false} />} label="Research desk" onPress={() => router.push('/desk')} />
          {/* Credits sit ABOVE the plan on purpose: "how many questions have
              I got left" is asked far more often than "what am I paying", and
              the value is a real balance read from the server — never a
              placeholder when there is nothing to show. */}
          <NavRow
            testID="nav-credits"
            icon={<KaiOrb size={14} glow={false} />}
            label="Credits"
            value={data?.credits ? `${data.credits.available} left today` : null}
            onPress={() => router.push('/account/credits')}
          />
          <NavRow testID="nav-subscription" icon={<Lock size={14} color={color.muted} />} label="Plan" value={data?.credits?.plan_name ?? (tier === 'premium' ? 'Premium' : 'Free')} onPress={() => router.push('/account/subscription')} last />
        </RowList>

        {/* THE OPERATOR'S DOOR. Drawn only when `/me` says this account holds a
            staff row — a courtesy, not a control (brief §3): the board behind
            it has no data of its own and every route it calls re-asks
            `staff_members` before answering. Volt because the whole surface is
            the operator's own action. */}
        {data?.staff.is_staff ? (
          <>
            <Eyebrow c={color.volt}>OPERATOR</Eyebrow>
            <RowList testID="staff-entry">
              <NavRow
                testID="nav-admin"
                icon={<Bars size={14} color={color.volt} />}
                label="Admin & CRM"
                value={data.staff.role ?? undefined}
                onPress={() => router.push('/admin')}
                last
              />
            </RowList>
            <T size={10.5} c={color.dim} lh={16} style={{ marginTop: -4 }}>{data.staff.plain}</T>
          </>
        ) : null}

        <Eyebrow>CONNECTED</Eyebrow>
        <RowList>
          <Row last>
            <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 0.5, borderColor: alpha.ivory14, backgroundColor: alpha.ivory06, alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={13} color={color.muted} />
            </View>
            <T size={13} c={color.muted} style={{ flex: 1 }}>None — add a broker later</T>
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

        {/* Rule adherence — a receipt from real debriefs, shown only once there
            are enough sessions for the number to mean anything (>= 3). */}
        {kai.adherence && kai.adherence.sessions >= 3 ? (
          <ObjectCard tone="kai" r={radius.xl} style={{ paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 }} testID="rule-adherence">
            <KaiOrb size={24} />
            <T size={13} lh={18} style={{ flex: 1 }}>
              You've followed your rules{' '}
              <T size={13} weight="bold">{`${kai.adherence.followed} of the last ${kai.adherence.sessions}`}</T>
              {' '}sessions.
            </T>
            <Pressable onPress={() => router.push('/debrief')} accessibilityRole="button" testID="rule-adherence-details">
              <T size={11} weight="semibold" c={color.violetLight}>Details</T>
            </Pressable>
          </ObjectCard>
        ) : null}

        {/* ── LEGAL ─────────────────────────────────────────────────
            Privacy Policy and Terms, where App Review looks for them in a
            signed-in app (guideline 5.1.1). They also appear on the welcome
            screen, for the person — and the reviewer — who has not signed in
            yet. Both draw nothing until the URLs are configured; see
            `features/legal/urls.ts`, which is a submission blocker. */}
        <LegalLinks style={{ marginTop: 6 }} testID="account-legal" />

        <Button
          testID="cta-sign-out"
          label="Sign out"
          kind="outline"
          height={48}
          onPress={async () => { await signOut(); router.replace('/welcome'); }}
          style={{ marginTop: 8 }}
        />

        {/* ── DELETING THE ACCOUNT ──────────────────────────────────
            Apple has required an in-app path to this since June 2022
            (guideline 5.1.1(v)). It sits directly under Sign out because that
            is where a person looks for it, and it is a plain ghost row rather
            than a red button: the weight belongs on the confirmation screen,
            where the consequences are actually spelled out, not on the door. */}
        <Pressable
          testID="cta-delete-account-entry"
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          onPress={() => router.push('/account/delete')}
          style={({ pressed }) => ({
            minHeight: 44, justifyContent: 'center', alignItems: 'center',
            marginTop: 2, opacity: pressed ? 0.6 : 1,
          })}
        >
          <T size={13} c={color.muted}>Delete account</T>
        </Pressable>

        {/* THE STANDING DISCLAIMER. This app has an AI that discusses entries
            and stops, so the account board carries the full sentence. The
            wording is a DRAFT and needs the owner's legal review — see
            `features/legal/disclaimers.ts`. */}
        <T size={10.5} lh={16} c={color.dim} style={{ marginTop: 10 }} testID="account-not-advice">
          {NOT_ADVICE_LONG}
        </T>

        {notAvailable ? <NotConnected what="Your account details" /> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample account — the account service is not connected here.</T> : null}
      </ScrollView>

      <ModeSheet visible={modeOpen} mode={mode} onClose={() => setModeOpen(false)} />

      <Sheet visible={focusOpen} onClose={() => setFocusOpen(false)} title="What should Kai watch?" testID="sheet-focus">
        <T size={12.5} lh={18} c={color.muted}>Kai scans these first. Everything else still gets graded, just later.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FOCUS_ORDER.map((k: FocusKey) => {
            const on = kai.focus.includes(k);
            return (
              <Pressable
                key={k}
                testID={`focus-chip-${k}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${FOCUS_CHIP[k]}${on ? ', selected' : ''}`}
                onPress={() => kai.toggleFocus(k)}
                style={{
                  paddingVertical: 9, paddingHorizontal: 15, borderRadius: radius.pill, borderWidth: 0.5,
                  borderColor: on ? alpha.volt55 : alpha.ivory20,
                  backgroundColor: on ? alpha.volt10 : 'transparent',
                }}
              >
                <T size={13} c={on ? color.volt : color.muted}>{FOCUS_CHIP[k]}</T>
              </Pressable>
            );
          })}
        </View>
        <T size={11.5} c={color.muted}>{kai.focus.length ? `Kai will scan ${kai.focusShort} first.` : 'Pick at least one, or Kai scans everything.'}</T>
        <Button label="Done" kind="volt" height={48} onPress={() => setFocusOpen(false)} />
      </Sheet>

      <Sheet visible={!!simResult} onClose={() => setSimResult(null)} title="Simulated trade" testID="sheet-simulate">
        <T size={13} lh={20} c={color.muted}>{simResult}</T>
        <Button label="Open debriefs" kind="volt" height={48} onPress={() => { setSimResult(null); router.push('/debrief'); }} />
      </Sheet>
    </Screen>
  );
}
