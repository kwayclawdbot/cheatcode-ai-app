/**
 * Account.
 *
 * ===========================================================================
 * IT WAS A FEATURE DIRECTORY. IT IS NOW ORDERED BY WHAT PEOPLE COME HERE FOR.
 * ===========================================================================
 * The board held identity, sharing, the Kai profile, risk rules, a dozen
 * destinations, brokerage, memory, adherence, sign-out and the legal links in
 * roughly the order they were built. Finding the notification settings meant
 * reading the whole page, and the audit's own test — "find and change guidance,
 * notification delivery and practice balance without scanning the full account
 * page" — failed on all three.
 *
 * THE ORDER IS NOW THE AUDIT'S: Profile · Guidance · Practice account ·
 * Notifications · Plan, and then everything that is genuinely a destination
 * rather than a setting. Learning and debriefs keep their rows here because
 * this is where people look for them, but they are no longer wedged between a
 * risk rule and a credit balance.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THAT MATTERED MOST: A ROW THAT LOOKED LIKE A DOOR WAS A SWITCH.
 * ---------------------------------------------------------------------------
 * "Trading mode" and "Experience level" CHANGED THEIR VALUE when tapped,
 * cycling one step each time, while wearing the same chevron as every row that
 * opens a screen — and while the mode chip a few pixels above opened a proper
 * chooser. So one setting behaved two ways on one screen, and a person tapping
 * to read their mode changed how Kai scans the market instead.
 *
 * Every setting with more than two values now opens an explicit sheet listing
 * the options and what each one does. The rule is written down, with the
 * argument, in `features/account/controls.tsx`; the two cycler functions are
 * deleted and `features/account/profile.ts` says why they may not return.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS DELIBERATELY LEFT ALONE
 * ---------------------------------------------------------------------------
 * The protections. Memory review and deletion, the trade-sharing switch with
 * its enforceable promise, the paper-reset confirmation and the
 * account-deletion confirmation are all exactly as they were, because the
 * audit named them as the parts of this screen that were already right.
 * Discoverability was the problem; those flows were not.
 *
 * The simulated-trade action is now behind `__DEV__` as well as its flag — the
 * argument is written out beside the DEVELOPER block below.
 */
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
import { StageTag, STAGE_NEXT } from '../../features/stage';
import { useKaiProfile, useMe, useSettingsWriter } from '../../features/account/useAccount';
import { useTraining } from '../../features/training/store';
import { useAvatar } from '../../features/account/useAvatar';
import { Avatar } from '../../features/community/ui/Chrome';
import {
  EXPERIENCE_CONSEQUENCE, EXPERIENCE_ORDER, FOCUS_CHIP, FOCUS_ORDER, GUIDANCE_LABEL,
} from '../../features/account/profile';
import { ChoiceSheet, NavRow, SaveNote, SettingRow, type Choice } from '../../features/account/controls';
import { ModeSheet, MODE_LABEL } from '../../features/trade/ModeSheet';
import { PaperChip } from '../../features/trade/components';
import type { Experience, FocusKey, GoalMode } from '../../lib/types';

const INVOLVEMENT_LABEL = { hands_on: 'I confirm every action', guided: 'Kai prepares, I approve' } as const;

/**
 * GUIDANCE, AS A LIST OF CHOICES WITH THEIR CONSEQUENCES.
 * The label says what you get; the detail says what changes. Both come from
 * `profile.ts` so onboarding and this board describe the same setting the same
 * way — see the header of `GUIDANCE_LABEL` for why it is no longer called
 * "Experience level".
 */
const GUIDANCE_CHOICES: Choice<Experience>[] = EXPERIENCE_ORDER.map((k) => ({
  key: k,
  label: GUIDANCE_LABEL[k],
  detail: EXPERIENCE_CONSEQUENCE[k],
}));

/**
 * True only in a development bundle. Metro replaces `__DEV__` with a literal,
 * so the branch that reads it is dropped from a release build entirely; the
 * `typeof` guard is for Node, which reads this file in the static test scripts
 * and has no such global.
 */
const DEV_BUILD = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

/** What the goal actually changes, in one line each. Mirrors `ModeSheet`. */
const GOAL_HINT: Record<GoalMode, string> = {
  day_trade: 'Intraday charts and same-day ideas.',
  swing: 'Multi-day charts and ideas that need days to work.',
  invest: 'Long charts and language about businesses.',
};

export default function Account() {
  const router = useRouter();
  const { profile, session, signOut, patchProfile } = useSession();
  const { data, loading, isFixture, notAvailable, reload } = useMe();
  const settings = useSettingsWriter(reload);
  const [memory, setMemory] = useState<boolean>(profile?.memory_enabled ?? true);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);
  const [modeOpen, setModeOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  // Overall mastery, averaged across the skills the curriculum tracks. Shown
  // only to a member who has actually begun: `enrolled` is the "is there a
  // stored profile" question, which is not the same as "is the profile
  // populated" — everyone holds the empty default until storage is read.
  const training = useTraining();
  const masteryValues = Object.values(training.profile.mastery);
  const overallMastery = masteryValues.length
    ? Math.round(masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length)
    : 0;
  const trainingValue = training.enrolled ? `${overallMastery}%` : null;

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
  /* Readiness stage (0042). `/me` and the session both carry it; either will
     do, and null means an API build that predates the column — in which case
     the block below draws nothing rather than claiming a rung. */
  const stage = data?.profile.stage ?? profile?.stage ?? null;
  const name = data?.profile.display_name ?? profile?.display_name ?? handle ?? 'You';
  const needsHandle = identity ? identity.needs_handle : handle === null;
  /**
   * THE PICTURE, READ THE SAME WAY THE NAME IS.
   *
   * `/me` answers with it in two places — `identity` is the block the identity
   * lane owns and `profile` is the older shape — and the session's cached
   * profile is the third, for the moment before `/me` comes back. First one
   * that is a real string wins; anything else is "no picture", which is a
   * complete answer and draws the initial.
   */
  const avatarUrl =
    identity?.avatar_url?.trim()
    || data?.profile.avatar_url?.trim()
    || profile?.avatar_url?.trim()
    || null;
  const avatar = useAvatar(reload);

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
          {/*
            YOUR OWN FACE, AT THE TOP OF YOUR OWN BOARD.

            TWO BRANCHES, AND THEY ARE NOT THE SAME COMPONENT ON PURPOSE.
            · A PICTURE goes through the shared `Avatar`, which is what draws
              every member's picture in the rooms, the feed, the call cards and
              the leaderboard. One implementation of "a photo in a circle"
              means this screen cannot drift from the rest of the app.
            · NO PICTURE keeps this board's own `gradient.avatar` disc. That
              gradient is not decoration a component library could supply — it
              is the signed-off pixel of this header (proof/), it is warmer and
              larger than the neutral disc `Avatar` falls back to, and swapping
              it would change a screen nobody asked to change in order to
              tidy up a branch nobody sees.
            The whole thing is tappable either way: the fastest place to reach
            "set a picture" is the picture-shaped hole where one should be.
          */}
          <Pressable
            testID="account-avatar"
            accessibilityRole="button"
            accessibilityLabel={avatarUrl ? 'Your profile picture. Change it.' : 'Add a profile picture.'}
            accessibilityState={{ busy: avatar.busy }}
            disabled={avatar.busy}
            onPress={avatar.choose}
            style={({ pressed }) => ({ opacity: avatar.busy ? 0.5 : pressed ? 0.75 : 1 })}
          >
            {avatarUrl ? (
              <Avatar initial={name.slice(0, 1).toUpperCase()} url={avatarUrl} size={54} />
            ) : (
              <LinearGradient
                colors={gradient.avatar as unknown as readonly [string, string, ...string[]]}
                start={gradientAngle.start}
                end={gradientAngle.end}
                style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 0.5, borderColor: alpha.ivory20, alignItems: 'center', justifyContent: 'center' }}
              >
                <T size={22} weight="bold">{name.slice(0, 1).toUpperCase()}</T>
              </LinearGradient>
            )}
          </Pressable>
          <View style={{ flex: 1 }}>
            <T size={20} weight="bold" numberOfLines={1}>{name}</T>
            {/* The username, under the name, exactly as a post is signed. A
                blank says it is blank; it never borrows the display name. */}
            <T size={12} c={handle ? color.muted : color.volt} numberOfLines={1} testID="account-handle">
              {handle ? `@${handle}` : 'No username yet'}
            </T>
            {/* Where they are on the ladder (0042), on their own profile and in
                the same quiet ink it wears beside their name in a room. It is
                READ-ONLY here on purpose: unlike the mode chip below it, this
                is not a preference — it is earned, and a control that let
                somebody set it would be a lie about what it means. What moves
                it is said underneath, in `STAGE_NEXT`. */}
            {stage ? (
              <View style={{ marginTop: 3 }} testID="account-stage">
                <StageTag stage={stage} />
                {/* The tag is two words and two words cannot explain
                    themselves. This is the one surface with room to say what
                    moves it, so it does — a stage nobody can see the exit from
                    is a label, which is the thing it is explicitly not. */}
                {STAGE_NEXT[stage] ? (
                  <T size={11} c={color.dim} style={{ marginTop: 2 }} testID="account-stage-next">
                    {STAGE_NEXT[stage]}
                  </T>
                ) : null}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 4, alignItems: 'center' }}>
              {/* The goal chip. It opens the SAME sheet the Goal row in
                  Guidance opens, which is the same sheet Trade and Home open —
                  one setting, one chooser, wherever you meet it. */}
              <Pressable
                testID="mode-chip"
                accessibilityRole="button"
                accessibilityLabel={`Goal: ${MODE_LABEL[mode]}. Change it.`}
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

        {/* ── 1 · PROFILE ──────────────────────────────────────────
            Who other members see. First because it is the only part of this
            screen anybody else ever looks at, and because a member without a
            username is stopped at the door of every room. */}
        <Eyebrow>PROFILE</Eyebrow>
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
          {/*
            IT SAYS WHAT IS HAPPENING WHILE IT HAPPENS. Sending a photo over a
            phone connection is not instant, and a row that looked identical
            during the wait would read as a tap that did nothing.
          */}
          <Row>
            <Pressable
              testID="identity-avatar"
              accessibilityRole="button"
              accessibilityLabel={avatarUrl ? 'Profile picture. Choose a different one.' : 'Add a profile picture.'}
              accessibilityState={{ busy: avatar.busy }}
              disabled={avatar.busy}
              onPress={avatar.choose}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44 }}
            >
              <View style={{ flex: 1 }}>
                <T size={14}>Profile picture</T>
                <T size={11.5} c={avatar.busy ? color.volt : color.muted} style={{ marginTop: 2 }}>
                  {avatar.working
                    ?? (avatarUrl
                      ? 'Shown next to your posts.'
                      : 'Members with a picture are easier to recognise in a room.')}
                </T>
              </View>
              {avatarUrl ? (
                <Avatar initial={name.slice(0, 1).toUpperCase()} url={avatarUrl} size={28} />
              ) : (
                <T size={13} weight="semibold" c={color.volt}>Add one</T>
              )}
              <ArrowRight size={12} color={color.dim} />
            </Pressable>
          </Row>
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
              last
            />
          ) : null}
        </RowList>

        {/* REMOVING IT IS A SEPARATE, QUIETER ACT.
            It only exists when there is something to remove, and it is a ghost
            row rather than a button: taking your picture down is a decision a
            member makes deliberately, not one the board should invite. */}
        {avatarUrl && !avatar.busy ? (
          <Pressable
            testID="identity-avatar-remove"
            accessibilityRole="button"
            accessibilityLabel="Remove your profile picture"
            onPress={avatar.remove}
            style={({ pressed }) => ({ minHeight: 32, justifyContent: 'center', marginTop: -6, opacity: pressed ? 0.6 : 1 })}
          >
            <T size={11.5} c={color.muted}>Remove my picture</T>
          </Pressable>
        ) : null}

        {avatar.error ? (
          <T size={11.5} lh={17} c={color.red} testID="identity-avatar-error" style={{ marginTop: -4 }}>
            {avatar.error}
          </T>
        ) : null}

        {/* ── 2 · GUIDANCE ─────────────────────────────────────────
            The three answers that shape how Kai works, all of them explicit
            choices from a sheet.

            THE NAMES ARE THE AUDIT'S, AND THEY ARE NOT INTERCHANGEABLE.
            GOAL is what you are here to do. GUIDANCE is how much Kai explains,
            and it is adjustable any time — it is a preference, not a grade.
            READINESS is the earned rung beside your name at the top of this
            screen, which nothing here can set. Belts are a community track
            record and are not drawn on this board at all. Four ideas that used
            to share three overlapping labels. */}
        <Eyebrow>GUIDANCE</Eyebrow>
        <T size={11.5} c={color.muted} lh={17} style={{ marginTop: -4 }}>
          How Kai works with you. Change any of it whenever you like — none of it is a grade.
        </T>
        <RowList testID="kai-profile">
          <SettingRow
            testID="kai-profile-mode"
            label="Goal"
            hint={GOAL_HINT[mode]}
            value={MODE_LABEL[mode]}
            onPress={() => setModeOpen(true)}
          />
          <SettingRow
            testID="kai-profile-experience"
            label="Guidance"
            hint="How much Kai explains as he goes."
            value={GUIDANCE_LABEL[kai.experience]}
            onPress={() => setGuidanceOpen(true)}
          />
          <SettingRow
            testID="kai-profile-focus"
            label="Kai watches"
            hint="What he scans first."
            value={kai.focusShort}
            onPress={() => setFocusOpen(true)}
            last
          />
        </RowList>
        <SaveNote
          testID="kai-profile-save"
          status={kai.save.status}
          message={kai.save.message}
          onRetry={kai.save.retry}
        />

        {/* Kai's own voice line, in Kai's colour, said in the first person. It
            is the proof that the Guidance row above did something. */}
        <View
          testID="kai-voice-line"
          style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 11, paddingHorizontal: 13, borderRadius: 14, backgroundColor: alpha.violet10, borderLeftWidth: 2, borderLeftColor: color.violet }}
        >
          <KaiOrb size={18} glow={false} />
          <T size={12} lh={17.5} c={color.muted} style={{ flex: 1 }}>{kai.voiceLine}</T>
        </View>

        <RowList>
          <NavRow
            testID="nav-settings"
            icon={<Gear size={14} color={color.muted} />}
            label="Explanation depth, quiet hours, text size"
            onPress={() => router.push('/account/settings')}
            last
          />
        </RowList>

        {/* ── 3 · PRACTICE ACCOUNT ─────────────────────────────────
            The balance, and the rules that govern what can be risked against
            it. They belong together: a loss cap means nothing without the
            number it is a cap on. */}
        <Eyebrow>PRACTICE ACCOUNT</Eyebrow>
        <RowList>
          <NavRow
            testID="nav-paper"
            icon={<Bars size={14} color={color.muted} />}
            label="Practice balance"
            value={data?.paper ? `$${Math.round(data.paper.equity).toLocaleString('en-US')}` : null}
            onPress={() => router.push('/account/paper')}
          />
          {/*
            A NAV ROW RATHER THAN A READING, because this number is now
            changeable. Risk moved out of signup to the front of the first paper
            order (audit F01, `features/onboarding/risk-gate.ts`), and somebody
            who took the default should not have to start an order to be asked.
            `/account/risk` mounts the same screen the order ticket detours to.
          */}
          <NavRow
            testID="nav-risk"
            icon={<Bars size={14} color={color.muted} />}
            label="Daily loss cap"
            value={policy ? `$${policy.daily_loss_cap}` : null}
            onPress={() => router.push('/account/risk')}
          />
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
          Resetting the balance lives on the practice account screen, behind a confirmation.
        </T>

        {/* ── 4 · NOTIFICATIONS ────────────────────────────────── */}
        <Eyebrow>NOTIFICATIONS</Eyebrow>
        <RowList>
          <NavRow
            testID="nav-notifications"
            icon={<Bell size={14} color={color.muted} />}
            label="What reaches you, and how"
            onPress={() => router.push('/account/notifications')}
            last
          />
        </RowList>

        {/* ── 5 · PLAN ─────────────────────────────────────────────
            Credits sit ABOVE the plan on purpose: "how many questions have I
            got left" is asked far more often than "what am I on", and the
            value is a real balance read from the server — never a placeholder
            when there is nothing to show. */}
        <Eyebrow>PLAN</Eyebrow>
        <RowList>
          <NavRow
            testID="nav-credits"
            icon={<KaiOrb size={14} glow={false} />}
            label="Credits"
            value={data?.credits ? `${data.credits.available} left today` : null}
            onPress={() => router.push('/account/credits')}
          />
          <NavRow
            testID="nav-subscription"
            icon={<Lock size={14} color={color.muted} />}
            label="Your plan and what it covers"
            value={data?.credits?.plan_name ?? (tier === 'premium' ? 'Premium' : 'Free')}
            onPress={() => router.push('/account/subscription')}
            last
          />
        </RowList>

        {/* ── WHAT THE CLUB SEES ───────────────────────────────────
            A privacy answer, kept whole and kept visible. The switch is OFF
            until the server says otherwise — never assumed, never
            optimistically on. */}
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
        <SaveNote
          testID="sharing-save"
          status={settings.status}
          message={settings.error}
          onRetry={settings.retry}
        />

        {/* ── LEARNING ─────────────────────────────────────────────
            Not settings. These are journeys, and their own screens are the
            places they naturally end — the rows here are a second door for the
            person who came looking in Account, not the only one. */}
        <Eyebrow>LEARNING</Eyebrow>
        <RowList>
          {/* Training's value is the member's own mastery, or nothing at all —
              a learner who has never opened a lesson is shown no number rather
              than a zero, because a zero here reads as a grade. */}
          <NavRow
            testID="nav-training"
            icon={<Bars size={14} color={color.muted} />}
            label="Training & Mastery"
            value={trainingValue}
            onPress={() => router.push('/training' as never)}
          />
          <NavRow
            testID="nav-debriefs"
            icon={<Calendar size={14} color={color.muted} />}
            label="Trade debriefs"
            onPress={() => router.push('/debrief')}
          />
          {/* The research desk is not a setting — it is where the slow work
              lives. It sits here because the tab bar is five items and stays
              five items, not because it is an afterthought. */}
          <NavRow
            testID="nav-desk"
            icon={<KaiOrb size={14} glow={false} />}
            label="Research desk"
            onPress={() => router.push('/desk')}
            last
          />
        </RowList>

        {/* Rule adherence — a receipt from real debriefs, shown only once there
            are enough sessions for the number to mean anything (>= 3). It sits
            with Learning because that is what it is a receipt from. */}
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

        {/* ── KAI'S MEMORY ─────────────────────────────────────────
            The master switch and the door to review or delete what is held.
            Both kept exactly as they were: the audit named this one of the
            protections worth preserving. */}
        <Eyebrow c={color.violetLight}>KAI</Eyebrow>
        <ObjectCard tone="kai" r={radius.xl} style={{ paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <KaiOrb size={24} />
          <View style={{ flex: 1 }}>
            <T size={13} weight="semibold">Kai remembers what you tell him</T>
            <T size={11} c={color.muted} style={{ marginTop: 2 }}>Turn this off and every conversation starts fresh.</T>
          </View>
          <Toggle testID="toggle-memory" value={memory} onChange={toggleMemory} label="Kai memory" />
        </ObjectCard>
        <RowList>
          <NavRow
            testID="nav-memory"
            icon={<KaiOrb size={14} glow={false} />}
            label="Review or delete what Kai remembers"
            onPress={() => router.push('/account/memory')}
            last
          />
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

        {/*
          THE SIMULATED TRADE, AND WHY IT IS BEHIND TWO CONDITIONS NOW.

          `env.DEV_TOOLS` reads `EXPO_PUBLIC_DEV_TOOLS`, which is baked into the
          bundle at build time — so a release built with that variable still
          set, or inherited from a shell, shipped a button that manufactures a
          fake closed trade into a real member's history. In a financial
          product that is the worst class of bug there is, and it was one
          environment variable away at all times.

          `__DEV__` is false in every release bundle by construction, so the
          action cannot reach a shipped build regardless of configuration. The
          flag is kept alongside it because the API route is gated on its own
          `DEV_TOOLS=1` and there is no reason to show a button the server will
          answer 404 to. Written as a `typeof` guard because this module is also
          read by Node in the test scripts, where the global does not exist.
        */}
        {DEV_BUILD && env.DEV_TOOLS ? (
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

      {/* Every setting on this board with more than two values is changed from
          one of these three sheets, and from nowhere else. */}
      <ModeSheet visible={modeOpen} mode={mode} onClose={() => setModeOpen(false)} />

      <ChoiceSheet
        visible={guidanceOpen}
        testID="sheet-guidance"
        title="How much should Kai explain?"
        intro="This changes his wording everywhere, not what he is allowed to say. Move it whenever you like."
        options={GUIDANCE_CHOICES}
        value={kai.experience}
        onChange={kai.chooseExperience}
        onClose={() => setGuidanceOpen(false)}
      />

      {/* Kai watches is the one MULTI-select here, so it keeps its own sheet
          with chips rather than the single-answer list. */}
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
        <SaveNote status={kai.save.status} message={kai.save.message} onRetry={kai.save.retry} />
        <Button label="Done" kind="volt" height={48} onPress={() => setFocusOpen(false)} />
      </Sheet>

      <Sheet visible={!!simResult} onClose={() => setSimResult(null)} title="Simulated trade" testID="sheet-simulate">
        <T size={13} lh={20} c={color.muted}>{simResult}</T>
        <Button label="Open debriefs" kind="volt" height={48} onPress={() => { setSimResult(null); router.push('/debrief'); }} />
      </Sheet>
    </Screen>
  );
}
