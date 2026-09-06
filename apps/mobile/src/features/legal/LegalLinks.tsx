/**
 * PRIVACY POLICY AND TERMS, LINKED WHERE APPLE LOOKS FOR THEM.
 *
 * Two places, and both are required rather than nice to have:
 *
 *   BEFORE SIGN-IN, on the welcome screen. App Review reaches the app before
 *   it has an account in hand, and a policy a person can only find after
 *   creating an account is not reachable to the person deciding whether to
 *   create one.
 *
 *   AFTER SIGN-IN, in Account and on the Plan screen. This is where a person
 *   who already uses the app goes to look, and where a reviewer checks second.
 *
 * ---------------------------------------------------------------------------
 * IT DRAWS NOTHING WHEN THERE IS NOTHING TO LINK TO.
 * ---------------------------------------------------------------------------
 * A "Privacy Policy" row that opens a 404 fails review harder than a missing
 * one: the reviewer has evidence of a broken required link rather than an
 * oversight. `legalReady()` gates the whole component, and each row is drawn
 * only if its own URL is a real https address. See `urls.ts` — the addresses
 * are configuration, and setting them is on the owner's list before submission.
 *
 * ---------------------------------------------------------------------------
 * IT OPENS IN AN IN-APP BROWSER, NOT SAFARI.
 * ---------------------------------------------------------------------------
 * `WebBrowser.openBrowserAsync` keeps the person inside the app with a Done
 * button. Being thrown out to Safari to read a policy and having to find your
 * way back is a worse experience and reads, to a reviewer, as a link off the
 * app rather than a document belonging to it.
 *
 * Design: hairline rules, no card. Muted, because a legal link is a reference
 * and not an action — volt is reserved for what the person is actually doing.
 */
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { T } from '../../ui/Text';
import { alpha, color, space } from '../../ui/tokens';
import { PRIVACY_URL, TERMS_URL, legalReady } from './urls';

function open(url: string) {
  void WebBrowser.openBrowserAsync(url);
}

function LegalRow({ label, url, first, testID }: {
  label: string; url: string; first: boolean; testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={`${label}, opens in a browser`}
      onPress={() => open(url)}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        paddingVertical: space.x11,
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: alpha.ivory10,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x10 }}>
        <T size={13} c={color.muted} style={{ flex: 1 }}>{label}</T>
        <T size={12} c={color.dim}>›</T>
      </View>
    </Pressable>
  );
}

/**
 * The pair, as a ruled strip. `compact` drops the eyebrow for places that are
 * already inside a labelled section.
 */
export function LegalLinks({ style, compact = false, testID = 'legal-links' }: {
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  testID?: string;
}) {
  if (!legalReady()) return null;

  return (
    <View testID={testID} style={style}>
      {compact ? null : (
        <T size={10.5} weight="semibold" c={color.dim} style={{ letterSpacing: 0.8, marginBottom: space.x4 }}>
          LEGAL
        </T>
      )}
      <View style={{
        borderTopWidth: 1, borderTopColor: alpha.ivory16,
        borderBottomWidth: 1, borderBottomColor: alpha.ivory08,
      }}>
        {PRIVACY_URL ? (
          <LegalRow label="Privacy Policy" url={PRIVACY_URL} first testID="legal-privacy" />
        ) : null}
        {TERMS_URL ? (
          <LegalRow label="Terms of Service" url={TERMS_URL} first={!PRIVACY_URL} testID="legal-terms" />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The one-line variant for the welcome and sign-up screens, where a ruled strip
 * would be heavier than the surface deserves. Same rule: nothing at all when
 * there is nothing to open.
 */
export function LegalFootnote({ style, testID = 'legal-footnote' }: {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  // Read into locals so the null checks below narrow inside the callbacks —
  // a module-level `const` that TypeScript cannot prove is stable across a
  // closure does not narrow, and a `!` here would be exactly the assertion this
  // component exists to avoid.
  const privacy = PRIVACY_URL;
  const terms = TERMS_URL;
  if (!legalReady()) return null;

  return (
    <View testID={testID} style={[{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }, style]}>
      {privacy ? (
        <Pressable
          testID="legal-footnote-privacy"
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy, opens in a browser"
          onPress={() => open(privacy)}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: 30, justifyContent: 'center' })}
        >
          <T size={11.5} c={color.muted}>Privacy Policy</T>
        </Pressable>
      ) : null}
      {privacy && terms ? (
        <T size={11.5} c={color.dim} style={{ paddingHorizontal: space.x8, lineHeight: 30 }}>·</T>
      ) : null}
      {terms ? (
        <Pressable
          testID="legal-footnote-terms"
          accessibilityRole="link"
          accessibilityLabel="Terms of Service, opens in a browser"
          onPress={() => open(terms)}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: 30, justifyContent: 'center' })}
        >
          <T size={11.5} c={color.muted}>Terms of Service</T>
        </Pressable>
      ) : null}
    </View>
  );
}
