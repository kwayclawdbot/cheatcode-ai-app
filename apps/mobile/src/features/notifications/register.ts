/**
 * NATIVE PUSH — permission, token, channel, registration.
 *
 * ⚠ THIS PATH IS WRITTEN AND CANNOT BE PROVEN THIS ROUND. There are no APNs or
 * FCM credentials and no development build, and Expo Go has not carried remote
 * push since SDK 53. Every function here therefore ends in an honest answer
 * rather than an exception, and `pushEnvironment()` refuses to let the UI reach
 * them at all in Expo Go. Do not read a green screen as proof native push
 * works — see the ops checklist in the round-5 docs.
 *
 * `expo-notifications` is loaded with a guarded `require`, never a top-level
 * import. The web build must never evaluate a native notifications module just
 * because a screen imported one symbol from this file.
 */
import { Platform } from 'react-native';
import type { PushDevice } from '../../lib/types';
import { api } from '../../lib/api';
import { deviceLabel, easProjectId, isExpoGo } from './capability';

/** The subset of expo-notifications this app uses. */
type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null = null;

/** Null on web and anywhere the module cannot load — never a throw. */
export function notificationsModule(): NotificationsModule | null {
  if (Platform.OS === 'web') return null;
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
    return cached;
  } catch {
    return null;
  }
}

export type NativePermission = 'granted' | 'denied' | 'undetermined';

export async function nativePermission(): Promise<NativePermission> {
  const N = notificationsModule();
  if (!N) return 'undetermined';
  try {
    const { status, canAskAgain } = await N.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    // "undetermined" means we may still ask. A denial we can no longer undo is
    // 'denied', and §4.3 says a denial is never auto-asked again.
    return status === 'undetermined' || canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'undetermined';
  }
}

/**
 * The Android channel. It must exist BEFORE a token is requested on Android 13+
 * or `getExpoPushTokenAsync` has nothing to attach to.
 *
 * One channel, `trade-alerts`, at HIGH importance: everything this app sends is
 * a thing the user asked to be told about, and splitting into five channels
 * would just hand the OS five switches that mean the same as our own category
 * switches — two settings screens disagreeing about one fact.
 */
export async function ensureAndroidChannel(): Promise<void> {
  const N = notificationsModule();
  if (!N || Platform.OS !== 'android') return;
  try {
    await N.setNotificationChannelAsync('trade-alerts', {
      name: 'Alerts and trades',
      importance: N.AndroidImportance.HIGH,
      lockscreenVisibility: N.AndroidNotificationVisibility.PRIVATE,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#C8FF00',
    });
  } catch {
    /* a missing channel degrades the banner, it does not break registration */
  }
}

export type NativeRegisterResult =
  | { ok: true; device: PushDevice }
  | { ok: false; reason: 'expo_go' | 'no_project_id' | 'denied' | 'no_token' | 'failed'; plain: string };

/**
 * Ask, mint, register. Only ever called from a surface the user opened.
 */
export async function registerNative(): Promise<NativeRegisterResult> {
  const N = notificationsModule();
  if (!N) {
    return { ok: false, reason: 'failed', plain: 'Notifications are not available in this build.' };
  }
  if (isExpoGo()) {
    return {
      ok: false,
      reason: 'expo_go',
      plain:
        'Notifications need the installed app; this is the Expo Go preview, which stopped carrying them in SDK 53.',
    };
  }
  const projectId = easProjectId();
  if (!projectId) {
    return {
      ok: false,
      reason: 'no_project_id',
      plain: 'This build has no EAS project id, so no push token can be issued for it yet.',
    };
  }

  await ensureAndroidChannel();

  try {
    const current = await N.getPermissionsAsync();
    const granted =
      current.status === 'granted'
        ? true
        : current.canAskAgain
          ? (await N.requestPermissionsAsync()).status === 'granted'
          : false;
    if (!granted) {
      return {
        ok: false,
        reason: 'denied',
        plain:
          'Notifications are off for Cheat Code in your phone settings. Everything still lands in your inbox.',
      };
    }

    const token = await N.getExpoPushTokenAsync({ projectId });
    if (!token?.data) {
      return { ok: false, reason: 'no_token', plain: 'Your phone did not hand back a push token. Try again in a moment.' };
    }

    const device = await api.registerPush({
      transport: 'expo',
      handle: token.data,
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      device_label: deviceLabel(),
    });
    return { ok: true, device };
  } catch (e) {
    return {
      ok: false,
      reason: 'failed',
      plain: `Your phone could not be set up for notifications${e instanceof Error && e.message ? `: ${e.message}` : '.'}`,
    };
  }
}

/** Badge = unread inbox count. Cleared when the inbox opens. */
export async function setBadgeCount(count: number): Promise<void> {
  const N = notificationsModule();
  if (!N) return;
  try {
    await N.setBadgeCountAsync(Math.max(0, Math.trunc(count)));
  } catch {
    /* a badge is a nicety; it never fails a screen */
  }
}
