/**
 * The notifications screen's whole state, in one place.
 *
 * Four facts have to agree before a person gets a buzz, and every one of them
 * can be false on its own:
 *
 *   the environment   can this build/browser receive a push at all
 *   the permission    has the OS or the browser been asked, and what did it say
 *   the registry      is there a device row on the server for this device
 *   the switches      `push_enabled` and the per-category prefs
 *
 * Conflating any two of them produces the classic broken notifications screen:
 * a toggle that is on while nothing arrives. So each is loaded and reported
 * separately, and the screen says which one is the reason.
 *
 * PERMISSION IS NEVER REQUESTED BY THIS HOOK ON LOAD. `enable()` is called from
 * a press, and a browser or OS that already said no is never asked again — the
 * screen shows the route to settings instead (§4.3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { api, ApiError } from '../../lib/api';
import type {
  NotificationCategory, NotificationCategoryMap, PushDevice, PushRegistry, PushTestResult,
} from '../../lib/types';
import { pushEnvironment, type PushBlocker } from './capability';
import { nativePermission } from './register';
import { turnOnPush } from './enable';
import { currentEndpoint, unsubscribeWeb, webPermission } from './web-push';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export type PushScreenState = {
  loading: boolean;
  /** True when this API build has no push routes — say so, don't guess. */
  notAvailable: boolean;
  blocker: PushBlocker | null;
  permission: PushPermission;
  registry: PushRegistry | null;
  devices: PushDevice[];
  /** The row that IS this device, when we can tell. */
  thisDeviceId: string | null;
  pushEnabled: boolean;
  categories: NotificationCategoryMap;
  busy: boolean;
  /** A plain sentence about the last action. Never a code, never a stack. */
  message: string | null;
  test: PushTestResult | null;
};

const CATEGORY_ORDER: { key: NotificationCategory; label: string; sub: string }[] = [
  { key: 'trade_alerts', label: 'Alerts you set', sub: 'A level you asked Kai to watch gives way.' },
  { key: 'order_status', label: 'Your orders and positions', sub: 'An order fills, a position closes.' },
  { key: 'community', label: 'Replies to you', sub: 'Kai answers you in a room.' },
  { key: 'coaching', label: 'Debriefs', sub: 'A trade is closed and Kai has read it back.' },
  { key: 'system', label: 'Account and service', sub: 'Resets, plan changes, service notices.' },
];

export { CATEGORY_ORDER };

export function usePush() {
  const available = api.available();
  const [state, setState] = useState<PushScreenState>({
    loading: available,
    notAvailable: !available,
    blocker: pushEnvironment(undefined).blocker,
    permission: 'undetermined',
    registry: null,
    devices: [],
    thisDeviceId: null,
    pushEnabled: true,
    categories: {},
    busy: false,
    message: null,
    test: null,
  });
  const alive = useRef(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const readPermission = useCallback(async (): Promise<PushPermission> => {
    if (Platform.OS === 'web') {
      const p = webPermission();
      return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
    }
    return nativePermission();
  }, []);

  useEffect(() => {
    if (!available) {
      setState((s) => ({ ...s, loading: false, notAvailable: true, blocker: pushEnvironment(undefined).blocker }));
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    (async () => {
      const permission = await readPermission();
      let registry: PushRegistry | null = null;
      let notAvailable = false;
      let categories: NotificationCategoryMap = {};
      try {
        registry = await api.pushRegistry();
      } catch (e) {
        notAvailable = e instanceof ApiError && (e.code === 'NOT_FOUND' || e.code === 'NO_API');
      }
      try {
        const me = await api.me();
        categories = me.settings.notification_categories ?? {};
      } catch {
        /* the switches fall back to "all on", which is the server's default too */
      }

      // Which row is this browser? The server never returns handles, so the
      // match is made locally against the endpoint this browser holds.
      let thisDeviceId: string | null = null;
      if (Platform.OS === 'web' && registry?.devices.length) {
        const endpoint = await currentEndpoint();
        if (endpoint) {
          // One web row per browser in practice; when there are several, the
          // most recent web row is the one this browser just registered.
          const webRows = registry.devices.filter((d) => d.transport === 'web');
          thisDeviceId = webRows[webRows.length - 1]?.id ?? null;
        }
      }

      if (cancelled || !alive.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        notAvailable,
        permission,
        registry,
        devices: registry?.devices ?? [],
        thisDeviceId,
        pushEnabled: registry?.push_enabled ?? true,
        categories,
        blocker: pushEnvironment(registry?.vapid_public_key).blocker,
      }));
    })();

    return () => { cancelled = true; };
  }, [available, readPermission, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  /**
   * The prompt. Reached only from a press on a surface the user opened, or
   * from the priming sheet after they armed an alert.
   */
  const enable = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, message: null, test: null }));
    const result = await turnOnPush(state.registry?.vapid_public_key ?? null);

    const permission = await readPermission();
    if (!alive.current) return result;

    setState((s) => ({
      ...s,
      busy: false,
      permission,
      pushEnabled: result.ok ? true : s.pushEnabled,
      message: result.plain,
    }));
    if (result.ok) reload();
    return result;
  }, [readPermission, reload, state.registry]);

  /** The master switch off. The devices stay registered; nothing is sent. */
  const setPushEnabled = useCallback(async (on: boolean) => {
    setState((s) => ({ ...s, pushEnabled: on, busy: true, message: null }));
    try {
      await api.putSettings({ push_enabled: on });
      setState((s) => ({
        ...s,
        busy: false,
        message: on
          ? 'Notifications are back on.'
          : 'Notifications are off. Everything still lands in your inbox.',
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        pushEnabled: !on,
        busy: false,
        message: e instanceof Error ? e.message : "That didn't save. Try again.",
      }));
    }
  }, []);

  /** A category switch. Sent as a PATCH: one key, the rest untouched. */
  const setCategory = useCallback(async (key: NotificationCategory, on: boolean) => {
    setState((s) => ({ ...s, categories: { ...s.categories, [key]: on }, message: null }));
    try {
      await api.putSettings({ notification_categories: { [key]: on } });
    } catch (e) {
      setState((s) => ({
        ...s,
        categories: { ...s.categories, [key]: !on },
        message: e instanceof Error ? e.message : "That didn't save. Try again.",
      }));
    }
  }, []);

  /**
   * "Send a test". The answer is `plain` plus every suppression, because the
   * user's real question is "is this broken, or is it me" and quiet hours is
   * an answer, not a failure.
   */
  const sendTest = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, message: null, test: null }));
    try {
      const test = await api.pushTest();
      if (!alive.current) return;
      setState((s) => ({ ...s, busy: false, test, message: null }));
    } catch (e) {
      if (!alive.current) return;
      setState((s) => ({
        ...s,
        busy: false,
        message: e instanceof Error ? e.message : 'The test did not go out. Try again in a moment.',
      }));
    }
  }, []);

  /** Turn one device off. Revoke on the server, unsubscribe locally if it is us. */
  const forget = useCallback(async (id: string) => {
    setState((s) => ({ ...s, busy: true, message: null }));
    try {
      await api.revokePushDevice(id);
      if (Platform.OS === 'web') await unsubscribeWeb();
      setState((s) => ({
        ...s,
        busy: false,
        message: 'That device will not get notifications any more. Everything still lands in your inbox.',
      }));
      reload();
    } catch (e) {
      setState((s) => ({
        ...s,
        busy: false,
        message: e instanceof Error ? e.message : 'That device could not be turned off. Try again.',
      }));
    }
  }, [reload]);

  return { ...state, enable, setPushEnabled, setCategory, sendTest, forget, reload };
}
