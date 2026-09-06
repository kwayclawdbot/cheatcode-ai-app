import React from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { ScreenLoading } from '../../ui/Loading';
import { T, Eyebrow } from '../../ui/Text';
import { color } from '../../ui/tokens';
import { useMe } from '../../features/account/useAccount';
import { useSession } from '../../lib/session';
import { UsernameForm } from '../../features/identity/UsernameForm';

/**
 * Pick or change your username.
 *
 * Reached three ways: from the Account tab, from the sentence the room shows
 * when a post is refused for want of a name, and from `_layout` on the first
 * open of an account that has no handle. All three land here rather than on
 * three different versions of the same box.
 *
 * WHAT IS DELIBERATELY NOT HERE: nothing derives a username from the signed-in
 * email address. If the server has a suggestion it came from a display name;
 * if it has none the box starts empty and the person types.
 */
export default function Username() {
  const router = useRouter();
  const { data, loading, reload } = useMe();
  const { profile, refreshProfile } = useSession();

  const current = data?.identity?.handle ?? data?.profile.handle ?? profile?.handle ?? null;
  const suggested = data?.identity?.suggested_handle ?? null;
  const displayName = data?.profile.display_name ?? profile?.display_name ?? null;

  if (loading && !data) return <ScreenLoading label="Loading your account" />;

  return (
    <Screen variant="corner" layout="tab">
      <StackHeader
        title={current ? 'Your username' : 'Pick a username'}
        subtitle={current ? `You post as ${current}.` : 'Members are known by a name, not by an account number.'}
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        <Eyebrow>YOUR NAME IN THE COMMUNITY</Eyebrow>

        <UsernameForm
          current={current}
          suggested={suggested}
          displayName={displayName}
          ctaLabel={current ? 'Save username' : 'That is my username'}
          onSaved={async () => {
            await Promise.all([reload(), refreshProfile()]);
            if (router.canGoBack()) router.back();
            else router.replace('/account');
          }}
        />

        {!current ? (
          <T size={12} lh={18} c={color.dim}>
            You can read every room without one. Posting asks for it, because a post nobody can
            name cannot be replied to or mentioned.
          </T>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
