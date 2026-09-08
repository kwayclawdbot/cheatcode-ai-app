import React from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { color } from '../../ui/tokens';
import { useSession } from '../../lib/session';
import { UsernameForm } from '../../features/identity/UsernameForm';

/**
 * Pick a username — OPTIONAL, and no longer a step.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT STOPPED BEING A GATE
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F01: "Move focus and username to the moment they are useful, with
 * username required before posting." It was step 5 of 6, in front of Home, and
 * the requirement it was standing in for was already enforced somewhere better:
 * `POST /rooms/:id/messages` refuses a post from an account with no username,
 * on the server, whatever the phone thinks. So the screen was not protecting
 * anything — it was asking a stranger to name themselves for a room they had
 * not seen yet, before they had seen anything at all.
 *
 * The requirement still exists and still bites at exactly the right moment: the
 * first time somebody tries to post. `src/app/_layout.tsx` also asks once per
 * launch for accounts that have none, at `/account/username`, and the Account
 * board has the row. Three places that ask when it matters, instead of one wall
 * in front of the product.
 *
 * A NAME IS STILL NOT A PREFERENCE. It is what every post, reply and mention
 * hangs off, and 5 of 8 accounts had none before it was asked for anywhere.
 * That argument is why this screen is offered from the plan step rather than
 * deleted — somebody who wants to pick one now should be able to.
 *
 * IT SAVES IMMEDIATELY, unlike the draft answers, and always has: a username
 * has to be checked against everybody else's before it can be accepted, and
 * somebody who picks a taken name should find out here rather than later.
 */
export default function OnboardingUsername() {
  const router = useRouter();
  const { profile, refreshProfile } = useSession();

  const back = () => (router.canGoBack() ? router.back() : router.replace('/kai-plan'));

  return (
    <Screen variant="dome" layout="stack" testID="screen-username">
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
            back();
          }}
        />

        <View style={{ gap: 6 }}>
          <T
            size={13}
            weight="semibold"
            c={color.muted}
            onPress={back}
            testID="username-skip"
            accessibilityRole="button"
          >
            Not now
          </T>
          <T size={11.5} lh={17} c={color.dim}>
            You can read every room without one. Posting will ask for it, and so will Account.
          </T>
        </View>
      </ScrollView>
    </Screen>
  );
}
