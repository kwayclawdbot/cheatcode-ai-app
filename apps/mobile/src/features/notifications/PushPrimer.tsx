/**
 * THE ONE PRIMING MOMENT (§4.3, §8).
 *
 * Never prompt cold. The OS or browser prompt is reached from a surface the
 * user opened, or immediately after an act that implies wanting it — and the
 * act this app has is arming an alert. Someone who has just told Kai to watch a
 * level has, in the same breath, told us they want to be told when it gives
 * way. That is the only moment we spend the prompt on, and we spend it ONCE
 * EVER: a person who says "not now" is not asked again by this sheet.
 *
 * "Once ever" is stored locally, not on the server, because it is a fact about
 * this install and this browser — the same account on a new phone gets the
 * moment again, which is correct, since that phone has its own permission to
 * grant.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { KaiOrb } from '../../ui/KaiOrb';
import { color } from '../../ui/tokens';
import { api } from '../../lib/api';
import { pushEnvironment } from './capability';
import { nativePermission } from './register';
import { webPermission } from './web-push';
import { turnOnPush } from './enable';

const PRIMED_KEY = 'cheatcode.push.primed.v1';

async function alreadyPrimed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PRIMED_KEY)) === '1';
  } catch {
    // Storage we cannot read must not become a prompt we show forever, so an
    // unreadable store counts as "already asked".
    return true;
  }
}

async function markPrimed(): Promise<void> {
  try {
    await AsyncStorage.setItem(PRIMED_KEY, '1');
  } catch {
    /* the moment passes either way */
  }
}

/**
 * Is the priming moment due right now?
 *
 * It is not due when: it has been shown before, notifications are already on,
 * the permission was already refused (asking again is the one thing §4.3
 * forbids), or this build/browser cannot receive a push at all — offering
 * something that cannot work is worse than saying nothing.
 */
export function usePrimingGate(active: boolean) {
  const [due, setDue] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      if (!api.available()) return;
      if (await alreadyPrimed()) return;

      const permission =
        Platform.OS === 'web' ? webPermission() : await nativePermission();
      if (permission === 'granted' || permission === 'denied') return;

      // The web branch needs the server's VAPID answer before it can promise
      // anything, so ask the registry rather than guess.
      let vapid: string | null | undefined;
      if (Platform.OS === 'web') {
        try {
          vapid = (await api.pushRegistry()).vapid_public_key;
        } catch {
          return;
        }
      }
      if (pushEnvironment(vapid).blocker) return;
      if (!cancelled) setDue(true);
    })();
    return () => { cancelled = true; };
  }, [active]);

  const close = useCallback(async () => {
    setDue(false);
    await markPrimed();
  }, []);

  return { due, close };
}

/**
 * The sheet's contents. Rendered inside the confirmation sheet the user is
 * already looking at after arming an alert, so this is one moment and one
 * sheet rather than a second thing appearing over the first.
 */
export function PushPrimingBlock({
  summaryPlain, onDone,
}: {
  /** The alert they just armed, in Kai's own words. */
  summaryPlain?: string | null;
  /** Called once the moment is over, whichever way it went. */
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const turnOn = async () => {
    setBusy(true);
    const result = await turnOnPush();
    setBusy(false);
    await markPrimed();
    if (result.ok) {
      onDone();
      return;
    }
    // A refusal is an answer, and the user sees it here rather than being
    // returned to a screen that quietly did nothing.
    setMessage(result.plain);
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <KaiOrb size={24} />
        <View style={{ flex: 1, gap: 6 }}>
          <T size={15} weight="bold">Want a buzz when this triggers?</T>
          <T size={13} lh={20} c={color.muted}>
            {summaryPlain
              ? `I can send this to your ${Platform.OS === 'web' ? 'browser' : 'phone'} the moment it happens, in the same words you will read in your inbox.`
              : 'I can send it the moment it happens, in the same words you will read in your inbox.'}
          </T>
        </View>
      </View>

      {message ? <T size={12.5} lh={19} c={color.gold}>{message}</T> : null}

      <Button
        testID="priming-turn-on"
        label="Turn on notifications"
        kind="volt"
        height={48}
        loading={busy}
        onPress={turnOn}
      />
      <Button
        testID="priming-not-now"
        label="Not now"
        kind="ghost"
        height={44}
        onPress={async () => { await markPrimed(); onDone(); }}
      />
    </View>
  );
}
