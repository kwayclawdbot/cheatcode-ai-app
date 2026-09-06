/**
 * Delete account.
 *
 * ===========================================================================
 * WHAT THIS SCREEN IS FOR, AND THE ONE RULE IT IS BUILT ON
 * ===========================================================================
 * Apple has required an in-app route to account deletion since June 2022 (App
 * Review guideline 5.1.1(v)). This app has never had one, which on its own is
 * a rejection.
 *
 * THE RULE: EVERY SENTENCE ON THIS SCREEN DESCRIBES SOMETHING THE SERVER
 * ACTUALLY DOES. The list below is a plain-English rendering of
 * `supabase/migrations/0032_account_deletion.sql`, line for line. A promise
 * here that the database does not keep is worse than having no screen at all —
 * it is a false statement made to a person about their own data, and it is the
 * failure this whole feature exists to prevent.
 *
 * ---------------------------------------------------------------------------
 * WHY THREE HEADINGS AND NOT ONE
 * ---------------------------------------------------------------------------
 * "Delete" is not one thing across this data, and pretending it is would be the
 * dishonest simplification. Three things happen, they are genuinely different,
 * and a person is owed all three BEFORE they decide, not in a support email
 * afterwards:
 *
 *   DELETED     everything private to them. Gone.
 *   ANONYMISED  what they posted where other people can see it. The text goes
 *               and the name goes; the row stays so other people's replies
 *               still make sense.
 *   KEPT        what was paid, with every identifier stripped out of it.
 *
 * THE SUBSCRIPTION LINE IS THE MOST IMPORTANT SENTENCE HERE and it is given its
 * own emphasis. Deleting an account does not stop a recurring charge — that
 * money moves in a system this app does not reach into. A person who deletes
 * their account and then keeps being billed has been genuinely wronged, and the
 * only place that can be prevented is before they tap the button.
 *
 * ---------------------------------------------------------------------------
 * TYPE-TO-CONFIRM, AND WHY NOT JUST A SHEET
 * ---------------------------------------------------------------------------
 * This is the one action in the app that cannot be undone by anything, by
 * anybody, ever. A two-tap confirmation is the same gesture as dismissing a
 * toast. Typing the word is three seconds of deliberate effort and it is the
 * standard shape for exactly this, everywhere it matters.
 *
 * Design: hairlines and ruled strips, no cards. Red is used ONLY on the final
 * action — the colour grammar reserves it for financial semantics, and this is
 * the one place in the app where a destructive meaning outranks that. Volt does
 * not appear on this screen at all: volt is the person doing something they
 * want, and this is not that.
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T, Eyebrow } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { alpha, color, radius, space } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

/** The word. Case-insensitive, trimmed — this is a speed bump, not a spelling test. */
const CONFIRM_WORD = 'DELETE';

/**
 * THE THREE LISTS, AND EACH LINE MAPS TO SQL IN MIGRATION 0032.
 *
 * They are written out here rather than fetched, because they must be readable
 * BEFORE the person commits to anything and a screen that has to ask the server
 * what deletion means is a screen that can show nothing when the network is
 * poor. The cost of writing them here is that they can drift from the function.
 * That is a real risk and the mitigation is stated plainly: the migration and
 * this array are edited together, and the migration's own header carries the
 * same list in the same order so a diff of one without the other is visible.
 */
const DELETED = [
  'Your profile, your settings, and how you had Kai set up.',
  'Your paper account and everything in it — every order, every fill, every position, and the whole trade history.',
  'Every plan and debrief you ever wrote.',
  'Every conversation with Kai, and everything he had remembered about you.',
  'Your alerts and the record of when they fired.',
  'Your watchlists and every chart level you marked.',
  'Your notifications and the devices you had them sent to.',
  'Your login. You will not be able to sign back in.',
];

const ANONYMISED = [
  'Anything you posted in a room: the text is removed and the post no longer carries your name. The post itself stays in place so other people’s replies still read as a conversation.',
  'Anything you reported to a moderator stays as a report, without your name on it.',
];

const KEPT = [
  'What was paid, and the payment references behind it. Businesses have to keep those, and a card dispute can arrive months later.',
  'The record of what your questions cost us to answer.',
  'None of that keeps your name, your email, your phone number or any device. What is left is an account number that no longer points at a person anywhere in our systems.',
];

function Line({ text, first }: { text: string; first: boolean }) {
  return (
    <View style={{
      paddingVertical: space.x10,
      borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
      borderTopColor: alpha.ivory10,
    }}>
      <T size={13.5} lh={20} c={color.muted}>{text}</T>
    </View>
  );
}

function Group({ eyebrow, tone, lines, testID }: {
  eyebrow: string; tone: string; lines: string[]; testID: string;
}) {
  return (
    <View style={{ marginTop: space.x22 }} testID={testID}>
      <Eyebrow c={tone}>{eyebrow}</Eyebrow>
      <View style={{
        marginTop: space.x8,
        borderTopWidth: 1, borderTopColor: alpha.ivory16,
        borderBottomWidth: 1, borderBottomColor: alpha.ivory08,
      }}>
        {lines.map((l, i) => <Line key={l} text={l} first={i === 0} />)}
      </View>
    </View>
  );
}

export default function DeleteAccount() {
  const router = useRouter();
  const { signOut } = useSession();
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const run = async () => {
    if (!armed || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (!api.available()) {
        /**
         * FIXTURES MODE DOES NOT PRETEND TO DELETE ANYTHING.
         *
         * A sample "your account is gone" over a real account is the single
         * most alarming thing this screen could show, and a sample one over a
         * sample account teaches the owner that a flow works when it has never
         * once been run. So it says what it is.
         */
        setError('This preview is not connected to the service, so nothing was deleted. Run the app against the API to use this.');
        return;
      }
      const r = await api.deleteAccount();
      // THE SERVER'S OWN SENTENCE, never one written here. If the two could
      // differ, this screen could claim a deletion that did not happen.
      setDone(r?.plain ?? 'Your account has been deleted.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work, and nothing has been changed.');
    } finally {
      setBusy(false);
    }
  };

  /* ---- afterwards ---------------------------------------------------- */
  if (done) {
    return (
      <Screen variant="corner" layout="stack" testID="screen-account-deleted">
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: space.x40 }}>
          <Eyebrow c={color.muted}>Done</Eyebrow>
          <T size={26} weight="bold" style={{ marginTop: space.x10 }}>Your account is gone</T>
          <T size={14} lh={22} c={color.muted} style={{ marginTop: space.x14 }}>{done}</T>
          <View style={{ flex: 1 }} />
          <Button
            testID="cta-deleted-close"
            label="Close"
            kind="outline"
            height={52}
            onPress={async () => { await signOut(); router.replace('/welcome'); }}
            style={{ marginBottom: space.x24 }}
          />
        </View>
      </Screen>
    );
  }

  /* ---- before -------------------------------------------------------- */
  return (
    <Screen variant="corner" layout="tab" testID="screen-account-delete">
      <StackHeader title="Delete account" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <T size={22} weight="bold" lh={28}>
          This cannot be undone
        </T>
        <T size={14} lh={21} c={color.muted} style={{ marginTop: space.x10 }}>
          There is no way to get any of it back — not by us, not by support, not
          by signing up again with the same email. Here is exactly what happens.
        </T>

        <Group eyebrow="Deleted" tone={color.red} lines={DELETED} testID="delete-list-deleted" />
        <Group eyebrow="Kept, but no longer yours" tone={color.gold} lines={ANONYMISED} testID="delete-list-anonymised" />
        <Group eyebrow="Kept, and why" tone={color.muted} lines={KEPT} testID="delete-list-kept" />

        {/*
          THE SUBSCRIPTION WARNING, GIVEN ITS OWN SURFACE.
          It is the one consequence a person cannot come back and fix from
          inside this app once they have tapped the button, so it is not a line
          in a list. It says nothing about where to buy and nothing about a
          price — that is the same App Store rule the rest of the app follows —
          only that this action does not stop a charge.
        */}
        <View
          testID="delete-billing-warning"
          style={{
            marginTop: space.x24, padding: space.x14,
            borderRadius: radius.xl,
            borderWidth: StyleSheet.hairlineWidth, borderColor: alpha.gold40,
            backgroundColor: alpha.ivory06,
          }}
        >
          <T size={13} weight="semibold" c={color.gold}>This does not cancel a subscription</T>
          <T size={13} lh={20} c={color.muted} style={{ marginTop: space.x6 }}>
            If you pay for a plan, that is billed separately and deleting your
            account here will not stop it. Cancel it where you set it up, and do
            that first — once this account is gone you cannot manage it from
            inside the app.
          </T>
        </View>

        {/* ---- the gate ---- */}
        <View style={{ marginTop: space.x26 }}>
          <Field
            testID="field-confirm-delete"
            label={`Type ${CONFIRM_WORD} to confirm`}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={CONFIRM_WORD}
            editable={!busy}
            error={error}
          />
        </View>

        <Button
          testID="cta-delete-account"
          label="Delete my account"
          kind="outline"
          height={52}
          loading={busy}
          disabled={!armed || busy}
          onPress={run}
          accessibilityHint="Permanently deletes your account and everything in it"
          style={{
            marginTop: space.x16,
            borderColor: armed ? alpha.red45 : alpha.ivory20,
            backgroundColor: armed ? alpha.red10 : 'transparent',
          }}
        />

        <Button
          testID="cta-delete-cancel"
          label="Keep my account"
          kind="ghost"
          height={48}
          onPress={() => router.back()}
          style={{ marginTop: space.x8 }}
        />
      </ScrollView>
    </Screen>
  );
}
