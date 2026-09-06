import React from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { ProgressBars } from '../../ui/Progress';
import { color } from '../../ui/tokens';
import { useSession } from '../../lib/session';
import { UsernameForm } from '../../features/identity/UsernameForm';

/**
 * Onboarding 4 of 5 — pick a username.
 *
 * WHY IT IS A STEP AND NOT A SETTING. Until today the app never asked anybody
 * for a name anywhere: 5 of 8 accounts had none, and the community signed
 * their posts "Member". A name is not a preference to be discovered later, it
 * is the thing every post, reply and mention hangs off, so it is asked once,
 * here, while somebody is already answering questions about themselves.
 *
 * IT SAVES IMMEDIATELY, unlike the three steps before it. Those collect into
 * an in-memory draft that `kai-plan` posts in one go; a username cannot work
 * that way, because it has to be checked against everybody else's before it
 * can be accepted, and a person who picks a taken name should find out here
 * rather than at the end of the flow.
 *
 * IT CAN BE SKIPPED — once, and it costs something honest. Somebody who wants
 * to look around first should be able to; posting will ask again, and so will
 * the Account tab, and the sentence under the skip says exactly that.
 */
export default function OnboardingUsername() {
  const router = useRouter();
  const { profile, refreshProfile } = useSession();

  return (
    <Screen variant="dome" layout="stack" testID="screen-username">
      <ProgressBars total={5} done={4} />
      <T size={26} weight="bold" ls={-0.4} lh={31}>What should we call you?</T>
      <T size={14} c={color.muted} style={{ marginTop: 8 }}>
        This is the name your posts are signed with in the community.
      </T>

      <ScrollView
        style={{ flex: 1, marginTop: 24 }}
        contentContainerStyle={{ gap: 18, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <UsernameForm
          current={profile?.handle ?? null}
          displayName={profile?.display_name ?? null}
          ctaLabel="That is my username"
          onSaved={async () => {
            await refreshProfile();
            router.push('/kai-plan');
          }}
        />

        <View style={{ gap: 6 }}>
          <T
            size={13}
            weight="semibold"
            c={color.muted}
            onPress={() => router.push('/kai-plan')}
            testID="username-skip"
            accessibilityRole="button"
          >
            Skip for now
          </T>
          <T size={11.5} lh={17} c={color.dim}>
            You can read every room without one. Posting will ask for it, and so will Account.
          </T>
        </View>
      </ScrollView>
    </Screen>
  );
}
