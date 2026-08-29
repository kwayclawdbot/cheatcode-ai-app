/**
 * "HOW THIS REACHES YOU" — the delivery header on the inbox screen.
 *
 * The inbox is the truth and this block is only about the BUZZ: whether a
 * notification also lights up a phone or a browser, and if not, which of the
 * several possible reasons it is. Every dead end here is a sentence, never a
 * disabled switch — a toggle that does nothing is the app lying about what it
 * can do, and there are four separate ways to end up in that state (Expo Go, a
 * non-secure address, a refused permission, a server with no key).
 *
 * Composed from the app's own rows and rules rather than a grid of cards: this
 * is a settings surface inside a reading surface, and it has to sit under the
 * inbox's own filter rail without competing with it.
 */
import React from 'react';
import { View, Pressable, Linking, Platform } from 'react-native';
import { T, Num, Eyebrow } from '../../ui/Text';
import { RowList, Row } from '../../ui/Panel';
import { Toggle } from '../../ui/Toggle';
import { Button } from '../../ui/Button';
import { alpha, color } from '../../ui/tokens';
import { CATEGORY_ORDER, type usePush } from './usePush';

type Push = ReturnType<typeof usePush>;

const ago = (iso: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
};

/** A rule + an eyebrow. The section marker used everywhere else in the app. */
function SectionRule({ label }: { label: string }) {
  return (
    <View style={{ gap: 9, paddingTop: 2 }}>
      <View style={{ height: 0.5, backgroundColor: alpha.ivory08 }} />
      <Eyebrow>{label}</Eyebrow>
    </View>
  );
}

/** A dead end, said out loud. Title, then why, then what would change it. */
function Honest({ title, plain, testID, children }: {
  title: string; plain: string; testID: string; children?: React.ReactNode;
}) {
  return (
    <View testID={testID} style={{ gap: 7, paddingVertical: 2 }}>
      <T size={14} weight="semibold">{title}</T>
      <T size={12.5} lh={19} c={color.muted}>{plain}</T>
      {children}
    </View>
  );
}

export function DeliveryPanel({ push }: { push: Push }) {
  const {
    loading, notAvailable, blocker, permission, devices, pushEnabled, categories,
    busy, message, test, thisDeviceId,
  } = push;

  const active = devices.filter((d) => d.state !== 'revoked');
  const registered = active.length > 0;

  const body = () => {
    if (loading) {
      return <T size={12.5} c={color.muted}>Checking how notifications reach you…</T>;
    }

    // The API on this stack has no push routes. Say that, rather than draw a
    // switch whose writes go nowhere.
    if (notAvailable) {
      return (
        <Honest
          testID="push-not-connected"
          title="Notifications are not connected here"
          plain="This build of the service has no notification sender yet. Everything still lands in the inbox below."
        />
      );
    }

    // Expo Go, a plain-http LAN address, an old browser, a server with no key.
    if (blocker) {
      return (
        <Honest testID={`push-blocker-${blocker.reason}`} title={blocker.title} plain={blocker.plain} />
      );
    }

    // Asked once, refused. §4.3: never ask again — show the way to settings.
    if (permission === 'denied') {
      return (
        <Honest
          testID="push-denied"
          title="Notifications are blocked for Cheat Code"
          plain={
            Platform.OS === 'web'
              ? 'Your browser is refusing them for this site. Open the padlock in the address bar, allow notifications, then come back here.'
              : 'Your phone is refusing them for this app. You can allow them again in Settings.'
          }
        >
          {Platform.OS === 'web' ? null : (
            <Button
              testID="push-open-settings"
              label="Open settings"
              kind="outline"
              height={44}
              full={false}
              style={{ alignSelf: 'flex-start' }}
              onPress={() => { void Linking.openSettings(); }}
            />
          )}
        </Honest>
      );
    }

    // Nothing registered yet. One action, and the prompt lives behind it.
    if (!registered) {
      return (
        <View style={{ gap: 10 }}>
          <T size={12.5} lh={19} c={color.muted}>
            Right now everything waits for you here. Kai can also send it to this{' '}
            {Platform.OS === 'web' ? 'browser' : 'phone'} the moment it happens, in the same words.
          </T>
          <Button
            testID="push-turn-on"
            label="Turn on notifications"
            kind="voltGhost"
            height={46}
            loading={busy}
            onPress={() => { void push.enable(); }}
          />
        </View>
      );
    }

    return (
      <View style={{ gap: 11 }}>
        <RowList testID="push-devices">
          <Row>
            <View style={{ flex: 1 }}>
              <T size={13}>Send to my devices</T>
              <T size={11} c={color.muted} style={{ marginTop: 2 }}>
                Off means silent everywhere. The inbox is unchanged.
              </T>
            </View>
            <Toggle
              testID="push-master"
              value={pushEnabled}
              label="Send notifications to my devices"
              onChange={(v) => { void push.setPushEnabled(v); }}
            />
          </Row>
          {active.map((d, i) => {
            const last = ago(d.last_success_at);
            return (
              <Row key={d.id} last={i === active.length - 1}>
                <View style={{ flex: 1 }}>
                  <T size={13}>{d.plain}</T>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 }}>
                    {d.id === thisDeviceId ? <T size={11} c={color.volt}>This device</T> : null}
                    {last ? <Num size={10.5} weight="regular" c={color.dim}>{`last sent ${last}`}</Num> : null}
                  </View>
                </View>
                <Pressable
                  testID={`push-forget-${d.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Turn off ${d.plain}`}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => { void push.forget(d.id); }}
                >
                  <T size={12} c={color.muted}>Turn off</T>
                </Pressable>
              </Row>
            );
          })}
        </RowList>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Button
            testID="push-send-test"
            label="Send a test"
            kind="outline"
            height={40}
            full={false}
            loading={busy}
            onPress={() => { void push.sendTest(); }}
          />
          {test ? (
            <T testID="push-test-result" size={12} lh={18} c={test.sent > 0 ? color.volt : color.gold} style={{ flex: 1 }}>
              {test.plain}
            </T>
          ) : null}
        </View>

        {/* A suppression is the ANSWER to "is this broken", so it is printed in
            full rather than collapsed into "not sent". */}
        {test?.suppressed.length ? (
          <View testID="push-test-suppressed" style={{ gap: 4 }}>
            {test.suppressed.map((s, i) => (
              <T key={`${s.reason}${i}`} size={11.5} lh={17} c={color.muted}>{s.plain}</T>
            ))}
          </View>
        ) : null}

        <SectionRule label="TELL ME ABOUT" />
        <RowList testID="push-categories">
          {CATEGORY_ORDER.map((c, i) => (
            <Row key={c.key} last={i === CATEGORY_ORDER.length - 1}>
              <View style={{ flex: 1 }}>
                <T size={13}>{c.label}</T>
                <T size={11} c={color.muted} style={{ marginTop: 2 }}>{c.sub}</T>
              </View>
              <Toggle
                testID={`push-category-${c.key}`}
                value={categories[c.key] !== false}
                label={c.label}
                disabled={!pushEnabled}
                onChange={(v) => { void push.setCategory(c.key, v); }}
              />
            </Row>
          ))}
        </RowList>
        <T size={10.5} lh={16} c={color.dim}>
          Quiet hours hold everything, including an alert you set. Nothing is replayed afterwards — it waits in your
          inbox instead. You set the window in How Kai talks to you.
        </T>
      </View>
    );
  };

  return (
    <View testID="push-delivery" style={{ gap: 10 }}>
      <SectionRule label="HOW THIS REACHES YOU" />
      {body()}
      {message ? <T testID="push-message" size={12} lh={18} c={color.muted}>{message}</T> : null}
    </View>
  );
}
