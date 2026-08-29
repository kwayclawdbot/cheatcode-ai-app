/**
 * CAN THIS COPY OF THE APP RECEIVE A PUSH AT ALL — and if not, what is the
 * true sentence to say about it.
 *
 * This file exists because there are four different ways to be unable to
 * receive a notification and every one of them looks identical to a user: a
 * switch that does nothing. The round-5 brief is explicit that the app must
 * never fail silently, never throw, and never render a dead toggle. So the
 * environment answers first, in words, and the switch is only drawn where it
 * can actually do something.
 *
 * The four:
 *
 *   expo_go            Expo Go REMOVED remote push in SDK 53, and SDK 54 is
 *                      what this app runs. The owner's whole test loop is Expo
 *                      Go, so this is the case that will actually be hit, and
 *                      it must say so plainly rather than pretend.
 *   insecure_context   Web push requires a secure context. `localhost` counts;
 *                      the LAN IP over plain http does NOT — there is no
 *                      `navigator.serviceWorker` there at all — which is
 *                      exactly how this app is opened on a phone today.
 *   no_project_id      `getExpoPushTokenAsync` needs an EAS project id. There
 *                      is none in app.json yet (owner blocker §11.1), and
 *                      asking for OS permission we cannot then use would be
 *                      spending the one permission prompt a user ever gives us.
 *   unsupported        An old browser with no Push API, or an iOS Safari tab
 *                      that has not been added to the home screen.
 *
 * NOTHING HERE ASKS FOR PERMISSION. Reading the environment is not prompting;
 * §4.3 says the prompt is only ever reached from a surface the user opened.
 */
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { PushPlatform, PushTransport } from '../../lib/types';

export type PushBlockerReason =
  | 'expo_go'
  | 'insecure_context'
  | 'unsupported'
  | 'no_project_id'
  | 'no_vapid';

export type PushBlocker = {
  reason: PushBlockerReason;
  /** One short line, adult and plain. No exclamation marks. */
  title: string;
  /** Why, and what would change it. Never "something went wrong". */
  plain: string;
};

export type PushEnvironment = {
  transport: PushTransport;
  platform: PushPlatform;
  /** Null when this device could receive a push once permission is given. */
  blocker: PushBlocker | null;
};

/** True inside Expo Go, where remote push does not exist from SDK 53 on. */
export function isExpoGo(): boolean {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    // `appOwnership` is deprecated but still the value older tooling reports.
    Constants.appOwnership === 'expo'
  );
}

/**
 * The EAS project id `getExpoPushTokenAsync` needs. Read from both places the
 * manifest can carry it, because which one is populated depends on how the app
 * was launched.
 */
export function easProjectId(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const fromEas = Constants.easConfig?.projectId;
  return fromExtra || fromEas || null;
}

/**
 * A secure context is the precondition for a service worker, and a service
 * worker is the precondition for web push. `window.isSecureContext` is true on
 * https and on localhost, false on `http://192.168.x.x` — which is the address
 * the phone uses to reach this dev server.
 */
export function isSecureWebContext(): boolean {
  if (Platform.OS !== 'web') return true;
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

export function webPushSupported(): boolean {
  if (Platform.OS !== 'web') return false;
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof window.Notification === 'function'
  );
}

const nativePlatform = (): PushPlatform => (Platform.OS === 'android' ? 'android' : 'ios');

/**
 * "Chrome on macOS" / "iPhone". The label exists so a user with three devices
 * can turn the right one off, and for no other reason — it is never used to
 * identify a device to the server, which keys on the handle.
 */
export function deviceLabel(): string {
  if (Platform.OS !== 'web') return Platform.OS === 'android' ? 'Android device' : 'iPhone';
  if (typeof navigator === 'undefined') return 'This browser';
  const ua = navigator.userAgent || '';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os =
    /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'this computer';
  return `${browser} on ${os}`;
}

/**
 * The one function the UI calls. `vapidPublicKey` is what the SERVER said it
 * has (`GET /push/subscriptions`), not what the client wishes were true —
 * subscribing against a key the server cannot sign for yields an endpoint that
 * silently never delivers, which is indistinguishable from working push until
 * the day it matters.
 */
export function pushEnvironment(vapidPublicKey?: string | null): PushEnvironment {
  if (Platform.OS !== 'web') {
    const platform = nativePlatform();
    if (isExpoGo()) {
      return {
        transport: 'expo',
        platform,
        blocker: {
          reason: 'expo_go',
          title: 'Notifications need the installed app',
          plain:
            'This is the Expo Go preview, and Expo Go stopped carrying push notifications in SDK 53. Everything still lands in your inbox here. The buzz starts working in the installed build.',
        },
      };
    }
    if (!easProjectId()) {
      return {
        transport: 'expo',
        platform,
        blocker: {
          reason: 'no_project_id',
          title: 'This build has no push credentials yet',
          plain:
            'A native token is issued against an EAS project, and this build does not have one. Nothing is wrong with your account — there is no address to send to until the app is built for the store.',
        },
      };
    }
    return { transport: 'expo', platform, blocker: null };
  }

  if (!isSecureWebContext()) {
    return {
      transport: 'web',
      platform: 'web',
      blocker: {
        reason: 'insecure_context',
        title: 'This address cannot receive notifications',
        plain:
          'Browsers only allow notifications on a secure address — https, or localhost on this computer. You opened the app over plain http on a local network address, so there is nothing for the browser to switch on. It works once the app is hosted.',
      },
    };
  }

  if (!webPushSupported()) {
    return {
      transport: 'web',
      platform: 'web',
      blocker: {
        reason: 'unsupported',
        title: 'This browser cannot receive notifications',
        plain:
          'It does not offer the push service the app uses. On an iPhone, add Cheat Code to the home screen first — Safari only allows notifications once it is installed there.',
      },
    };
  }

  if (vapidPublicKey === null) {
    return {
      transport: 'web',
      platform: 'web',
      blocker: {
        reason: 'no_vapid',
        title: 'The server cannot send browser notifications yet',
        plain:
          'It has no signing key configured, so nothing could be delivered even after you allowed it. Everything still lands in your inbox.',
      },
    };
  }

  return { transport: 'web', platform: 'web', blocker: null };
}
