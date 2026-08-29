/**
 * THE TAP HAS TO LAND ON THE THING.
 *
 * A notification that says "META crossed 604.50" and then drops the user on
 * Home has failed at the only job it had. This component is mounted once, above
 * every route, and turns an arriving or tapped notification into navigation:
 *
 *   foreground (native)   §4.4 — if the user is ALREADY LOOKING at the screen
 *                         the notification is about, no banner. The screen has
 *                         already updated; a banner would be the app telling
 *                         someone something they are currently reading.
 *   tapped (native)       response listener → `router.push(data.route)`
 *   cold start (native)   `getLastNotificationResponseAsync()`, because the tap
 *                         that LAUNCHED the app happened before any listener in
 *                         this process existed. Without this the deep link
 *                         works from a warm app and silently does not from a
 *                         cold one, which is the harder case to notice and the
 *                         more common one in real use.
 *   tapped (web)          the service worker focuses this tab and posts the
 *                         route; we navigate in place rather than reloading.
 *
 * The badge is the unread count and the inbox clears it (`clearBadge()`).
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { notificationsModule, setBadgeCount } from './register';

/** The route the user is on, readable from the notification handler. */
let currentPath = '/';
let unreadBadge = 0;

/** Called by the inbox when it opens: the user is looking at them now. */
export function clearBadge(): void {
  unreadBadge = 0;
  void setBadgeCount(0);
}

function bumpBadge(): void {
  unreadBadge += 1;
  void setBadgeCount(unreadBadge);
}

const routeOf = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null;
  const r = (data as { route?: unknown }).route;
  return typeof r === 'string' && r.startsWith('/') ? r : null;
};

/** Is the user already on the screen this notification is about? */
const lookingAtIt = (route: string | null): boolean =>
  !!route && (currentPath === route || currentPath.startsWith(`${route}/`) || route.startsWith(`${currentPath}/`));

export function NotificationBridge() {
  const router = useRouter();
  const path = usePathname();
  const handled = useRef<string | null>(null);

  currentPath = path || '/';

  /* ---------------- native ---------------- */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const N = notificationsModule();
    if (!N) return;

    N.setNotificationHandler({
      handleNotification: async (notification) => {
        const route = routeOf(notification.request.content.data);
        const onIt = lookingAtIt(route);
        if (!onIt) bumpBadge();
        return {
          // §4.4: no banner over the screen that already says it.
          shouldShowBanner: !onIt,
          shouldShowList: true,
          shouldPlaySound: !onIt,
          shouldSetBadge: false,
        };
      },
    });

    const sub = N.addNotificationResponseReceivedListener((response) => {
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      const route = routeOf(response.notification.request.content.data);
      clearBadge();
      if (route) router.push(route as never);
    });

    // The tap that launched the app: it happened before this listener existed.
    void N.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      const route = routeOf(response.notification.request.content.data);
      clearBadge();
      if (route) router.push(route as never);
    });

    return () => sub.remove();
  }, [router]);

  /* ---------------- web ---------------- */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.type !== 'cheatcode:notification-click') return;
      const route = routeOf(msg) ?? routeOf(msg.data);
      if (route) router.push(route as never);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  return null;
}
