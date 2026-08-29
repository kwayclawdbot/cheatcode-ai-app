import React from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { ScreenLoading } from '../../ui/Loading';
import { T } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { color } from '../../ui/tokens';
import { useMe } from '../../features/account/useAccount';

/**
 * THE OPERATOR'S DOOR — AND THIS FILE IS NOT THE LOCK.
 *
 * Brief §3: "the admin bundle may ship in the app, but the client is never the
 * boundary — every byte comes from a `staffed()` route. The UI hides itself for
 * non-staff as a courtesy, not as a control."
 *
 * So this gate is exactly that courtesy. It reads the `staff` block `/me`
 * re-derives on every request and, for anybody else, renders the same sentence
 * the API itself answers with — "That is not something this app does." Somebody
 * who edits this check out of a bundle gains nothing: the six screens behind it
 * have no data of their own, and every route they call asks `staff_members`
 * again before it says a word.
 *
 * WHY THE SAME SENTENCE. An admin route answers NOT_FOUND rather than FORBIDDEN
 * precisely so it does not confirm that it exists. A screen that said "you are
 * not an admin" would confirm it in one line and undo that.
 */
export default function AdminLayout() {
  const router = useRouter();
  const { data, loading } = useMe();

  if (loading && !data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-admin-gate">
        <ScreenLoading />
      </Screen>
    );
  }

  if (!data?.staff.is_staff) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-admin-denied">
        <StackHeader title="Not found" onBack={() => router.replace('/home')} />
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
          <T size={15} weight="bold">That is not something this app does.</T>
          <T size={13} c={color.muted} lh={20}>
            Nothing is missing from your account. If you were sent here by a link, it was not meant for you.
          </T>
          <Button testID="cta-admin-home" label="Back to home" kind="outline" height={48} onPress={() => router.replace('/home')} />
        </View>
      </Screen>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // The same motion as every other stack destination in the app.
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: color.bg },
      }}
    />
  );
}
