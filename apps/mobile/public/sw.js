/**
 * Cheat Code AI service worker — ONE JOB: receive a push and open the thing.
 *
 * THERE IS NO CACHING LAYER HERE, DELIBERATELY (round-5 brief §8). An offline
 * strategy is its own product decision — what a stale price, a stale position
 * or a stale alert is allowed to look like when the network is gone — and
 * quietly serving yesterday's numbers from a cache is exactly the kind of lie
 * the freshness rules in this app exist to prevent. So: no `fetch` handler, no
 * precache, no `install`-time asset list. When that decision is made it will be
 * made on purpose, in its own round.
 *
 * The payload is written by `apps/api/src/lib/push/payload.ts` and is the same
 * sentence as the inbox row:
 *   { title, body, data: { notification_id, kind, category, route, group } }
 *
 * `tag` is the notification id, so the SAME notification arriving twice — a
 * retry, two browser instances, a receipt replay — collapses into one banner
 * rather than stacking. Different notifications keep their own banners.
 */

/* eslint-env serviceworker */
/* global self, clients */

const FALLBACK_TITLE = 'Cheat Code';
const FALLBACK_BODY = 'Something is waiting in your inbox.';

// Take over as soon as we are installed. A push subscription belongs to the
// registration, not to the page that made it, and a user who just switched
// notifications on must not have to reload before the first one can arrive.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function readPush(event) {
  if (!event.data) return { title: FALLBACK_TITLE, body: FALLBACK_BODY, data: {} };
  try {
    const parsed = event.data.json();
    return {
      title: typeof parsed.title === 'string' && parsed.title ? parsed.title : FALLBACK_TITLE,
      body: typeof parsed.body === 'string' && parsed.body ? parsed.body : FALLBACK_BODY,
      data: parsed.data && typeof parsed.data === 'object' ? parsed.data : {},
    };
  } catch {
    // A push we cannot read is still a push. Saying nothing would be worse than
    // saying "there is something in your inbox", which is always true.
    return { title: FALLBACK_TITLE, body: event.data.text() || FALLBACK_BODY, data: {} };
  }
}

self.addEventListener('push', (event) => {
  const { title, body, data } = readPush(event);
  const tag = typeof data.notification_id === 'string' && data.notification_id
    ? data.notification_id
    : `cheatcode-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192-maskable.png',
      // The banner is a summary of something that already happened; it never
      // needs to interrupt twice for the same fact.
      renotify: false,
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const route = typeof data.route === 'string' && data.route.startsWith('/') ? data.route : '/account/notifications';

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      // An app the user already has open must not be replaced by a second copy
      // of itself: focus the tab that exists and hand it the route, so the tap
      // lands as in-app navigation with the user's state intact.
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        client.postMessage({ type: 'cheatcode:notification-click', route, data });
        if ('focus' in client) return client.focus();
        return undefined;
      }
      // Nothing open: this is a cold start, and the route has to travel in the
      // URL because there is no client to message yet.
      if (clients.openWindow) return clients.openWindow(self.location.origin + route);
      return undefined;
    })()
  );
});
