/**
 * Live proof for lane MOBILE-5 — web push, end to end, against the REAL stack:
 * local Supabase + apps/api on :3000 + Metro on :8081.
 *
 *   node scripts/proof-push.mjs        (PROOF_BASE / PROOF_API / PROOF_LAN override)
 *
 * Nothing here is a fixture. It signs a fresh user up through the UI, then:
 *
 *   1. /account/notifications with nothing registered  → "Turn on notifications"
 *   2. presses it → the browser grants, the service worker registers, and a
 *      REAL subscription (fcm endpoint + p256dh/auth) is POSTed to the registry
 *   3. the API's own device list is read back over HTTP and must contain it
 *   4. "Send a test" → the server really sends, and the screen says so
 *   5. a real alert is armed through the API, which writes a real notification
 *   6. that notification's payload is delivered to the service worker through
 *      CDP `ServiceWorker.deliverPushMessage` — the same entry point the push
 *      service uses after decryption — and the banner must render with the
 *      notification id as its tag
 *   7. `notificationclick` is dispatched inside the worker: it must focus this
 *      client, post the route, and the app must NAVIGATE THERE
 *   8. the honest degradations render: permission denied, and a non-secure
 *      origin (the LAN address the phone actually uses), each with its own copy
 *
 * TWO THINGS THIS CANNOT PROVE, and does not pretend to:
 *   · NATIVE push. No APNs/FCM credentials, no dev build, and Expo Go has not
 *     carried remote push since SDK 53. The Expo Go copy is asserted against
 *     the source instead, and said so in the output.
 *   · That a push arrives with the app CLOSED. That is the push service's job.
 *
 * It runs against real Google Chrome, not Playwright's bundled Chromium:
 * Chromium ships without the Google API keys the Push API needs and answers
 * `AbortError: push service not available` at `pushManager.subscribe`. It also
 * needs a persistent profile — Chrome disables the Push API in incognito, which
 * is what every default Playwright context is.
 *
 * Screenshots land in proof/push-*.png.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const API = process.env.PROOF_API ?? 'http://localhost:3000';
/** The address a phone uses: plain http on a LAN IP, i.e. NOT a secure context. */
const LAN = process.env.PROOF_LAN ?? 'http://192.168.4.22:8081';
const EMAIL = `proofpush+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';
const SYMBOL = process.env.PROOF_SYMBOL ?? 'META';

const failures = [];
const notes = [];

const HIDE_DEV_CHROME = `.__expo_fast_refresh { display: none !important; }`;
const installHideDevChrome = (ctx) =>
  ctx.addInitScript((css) => {
    const add = () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);

const shot = async (page, name) => {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
};

const on = (page, screen, testid) => page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).last();
const seen = async (page, screen, testid) =>
  (await page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).count()) > 0;
const tap = async (page, screen, testid, ms = 700) => {
  const el = on(page, screen, testid);
  await el.waitFor({ state: 'visible', timeout: 40_000 });
  await el.click();
  await page.waitForTimeout(ms);
};
const go = async (page, url, wait = 2500) => {
  await page.goto(url, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(wait);
};

const pass = (msg) => console.log(`  · ${msg}`);
const fail = (msg) => { failures.push(msg); console.log(`  ✗ ${msg}`); };

async function must(page, screen, testid, why) {
  try {
    await on(page, screen, testid).waitFor({ state: 'visible', timeout: 30_000 });
    pass(why);
    return true;
  } catch {
    fail(`${why} — [${screen}] > [${testid}] never appeared`);
    return false;
  }
}

async function accessToken(page) {
  return page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.includes('auth-token') && !k.includes('code-verifier')) keys.push(k);
    }
    keys.sort();
    const bases = new Set(keys.map((k) => k.replace(/\.\d+$/, '')));
    for (const base of bases) {
      const parts = keys.filter((k) => k === base || k.startsWith(base + '.'));
      let raw = parts.map((k) => window.localStorage.getItem(k) ?? '').join('');
      if (!raw) continue;
      if (raw.startsWith('base64-')) {
        try { raw = atob(raw.slice(7)); } catch { continue; }
      }
      try {
        const v = JSON.parse(raw);
        if (v?.access_token) return v.access_token;
        if (v?.currentSession?.access_token) return v.currentSession.access_token;
      } catch { /* not this one */ }
    }
    return null;
  });
}

const apiCall = async (token, p, init = {}) => {
  const res = await fetch(`${API}/api/v1${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, json };
};

/** Onboarding belongs to another lane and moves; walk whatever is on screen. */
async function walkOnboarding(page) {
  const visible = async (screen) =>
    page.locator(`[data-testid="${screen}"]`).last()
      .waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false);

  const step = async (screen, ids) => {
    if (!(await visible(screen))) return false;
    console.log(`  · ${screen}`);
    for (const id of ids) if (await seen(page, screen, id)) await tap(page, screen, id, 600);
    return true;
  };

  await step('screen-onboarding-kai', ['mode-day_trade', 'funding-paper']);
  await step('screen-goal', ['mode-day_trade', 'goal-day_trade', 'cta-continue']);
  await step('screen-risk', ['cta-continue']);
  await step('screen-personalize', ['experience-some', 'exp-some', 'focus-big_tech', 'cta-continue']);
  await step('screen-summary', ['cta-start', 'cta-continue']);
  await step('screen-kai-plan', ['cta-start']);
  await page.locator('[data-testid="screen-home"]').last()
    .waitFor({ state: 'visible', timeout: 40_000 })
    .catch(() => { throw new Error('onboarding never reached Home'); });
}

/** What the browser has actually been shown, read back from the registration. */
const shownNotifications = (page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return null;
    const list = await reg.getNotifications();
    return list.map((n) => ({ title: n.title, body: n.body, tag: n.tag, data: n.data }));
  });

/**
 * The Expo Go path can never be rendered by a browser, so it is asserted where
 * it actually lives: the source. This is not a substitute for running it on a
 * phone — it only proves the copy and the guard have not drifted.
 */
async function assertExpoGoSource() {
  const src = await fs.readFile(path.join(ROOT, 'src/features/notifications/capability.ts'), 'utf8');
  const guarded = /if \(isExpoGo\(\)\)/.test(src);
  const copy = src.includes('Notifications need the installed app');
  if (guarded && copy) pass('Expo Go guard + copy present in capability.ts (source assertion only)');
  else fail('the Expo Go guard or its copy is missing from capability.ts');
}

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'cheatcode-push-'));

  // Real Chrome, persistent profile: the Push API needs both.
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  await installHideDevChrome(ctx);
  await ctx.grantPermissions(['notifications'], { origin: BASE });

  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 200)); });

  const cdp = await ctx.newCDPSession(page);
  let registrationId = null;
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => {
    for (const r of e.registrations ?? []) {
      if (!r.isDeleted && r.scopeURL.startsWith(BASE)) registrationId = r.registrationId;
    }
  });
  await cdp.send('ServiceWorker.enable');

  try {
    console.log(`live user: ${EMAIL}`);
    console.log('[0] the PWA head + service worker are served');
    await go(page, `${BASE}/welcome`, 2500);
    const head = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
      appleCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content') ?? null,
      theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
      secure: window.isSecureContext,
    }));
    if (head.manifest === '/manifest.webmanifest') pass('manifest linked from the head');
    else fail(`manifest not linked (${head.manifest})`);
    if (head.appleCapable === 'yes') pass('apple-mobile-web-app-capable present (the iOS install path)');
    else fail('apple-mobile-web-app-capable missing');
    if (head.theme === '#0B0B0E') pass('theme-color matches the app background');
    else fail(`theme-color is ${head.theme}`);
    if (head.secure) pass('localhost is a secure context');
    else fail('localhost did not report a secure context');

    const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
    if (manifest.display === 'standalone' && manifest.icons.some((i) => i.purpose === 'maskable')) {
      pass(`manifest: ${manifest.name}, standalone, ${manifest.icons.length} icons incl. maskable`);
    } else fail('manifest is missing standalone display or maskable icons');

    console.log('[1] sign up + onboarding');
    await tap(page, 'screen-welcome', 'cta-get-started');
    await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
    await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
    await tap(page, 'screen-sign-up', 'cta-create');
    await walkOnboarding(page);
    await page.waitForTimeout(1200);
    const token = await accessToken(page);
    if (!token) throw new Error('no access token — the sign-up did not produce a session');
    pass('signed in');

    console.log('[2] the inbox, with nothing registered');
    await go(page, `${BASE}/account/notifications`, 2500);
    await must(page, 'screen-notifications', 'push-delivery', 'the delivery header is on the inbox');
    await must(page, 'screen-notifications', 'push-turn-on', 'nothing registered → one action, no dead switch');
    const offText = await page.locator('[data-testid="push-delivery"]').innerText();
    if (/Turn on notifications/.test(offText) && !/!/.test(offText)) pass('copy is plain and adult (no exclamation marks)');
    else if (/!/.test(offText)) fail('an exclamation mark reached the delivery copy');
    await shot(page, 'push-01-off');

    console.log('[3] turn them on — permission, service worker, subscription');
    await tap(page, 'screen-notifications', 'push-turn-on', 2500);
    await must(page, 'screen-notifications', 'push-devices', 'the device list appears');
    await must(page, 'screen-notifications', 'push-categories', 'the category switches appear');
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager?.getSubscription();
      const json = sub?.toJSON();
      return {
        scope: reg?.scope ?? null,
        active: !!reg?.active,
        endpoint: sub?.endpoint ?? null,
        keys: json?.keys ? Object.keys(json.keys).sort() : [],
      };
    });
    if (sw.active && sw.scope?.endsWith('/')) pass(`service worker active at ${sw.scope}`);
    else fail('the service worker never became active');
    if (sw.endpoint && sw.keys.join(',') === 'auth,p256dh') pass(`real push subscription minted (${sw.endpoint.slice(0, 42)}…)`);
    else fail(`no usable push subscription: ${JSON.stringify(sw).slice(0, 200)}`);
    await shot(page, 'push-02-registered');

    console.log('[4] the API registry agrees');
    const list = await apiCall(token, '/push/subscriptions');
    const subs = list.json?.subscriptions ?? [];
    const web = subs.find((s) => s.transport === 'web' && s.state === 'active');
    if (web) pass(`GET /push/subscriptions: ${subs.length} device(s), web row ${web.id} — "${web.plain}"`);
    else fail(`the registry has no active web subscription: ${JSON.stringify(list.json).slice(0, 200)}`);
    if (subs.some((s) => 'handle' in s || 'keys' in s)) fail('the API returned a push handle or keys to the client');
    else pass('no handle and no keys came back to the client');

    console.log('[5] send a test — the server really sends, and says what it did');
    // FCM has answered 410 for a subscription less than a second old — the
    // token is minted locally before the push service knows about it. Give it
    // a moment, or the very first push revokes a perfectly good device.
    await page.waitForTimeout(3000);
    await tap(page, 'screen-notifications', 'push-send-test', 4000);
    const result = await page.locator('[data-testid="push-test-result"]').innerText().catch(() => '');
    if (/Sent to/.test(result)) pass(`test route: "${result}"`);
    else fail(`the test did not report a send: "${result}"`);
    await shot(page, 'push-03-test-sent');

    console.log('[6] arm a real alert → a real notification with a real deep link');
    const draft = await apiCall(token, '/alerts/draft', {
      method: 'POST',
      body: JSON.stringify({
        natural_language: `Tell me when ${SYMBOL} trades above 500`,
        refs: { symbol: SYMBOL, level: 500 },
      }),
    });
    const draftId = draft.json?.alert?.id;
    if (!draftId) throw new Error(`alert draft failed: ${draft.status} ${JSON.stringify(draft.json).slice(0, 200)}`);
    const armed = await apiCall(token, '/alerts', { method: 'POST', body: JSON.stringify({ draft_id: draftId }) });
    if (armed.status >= 300) throw new Error(`arming failed: ${armed.status}`);
    await page.waitForTimeout(2500);

    const inbox = await apiCall(token, '/notifications');
    const groups = inbox.json?.groups ?? {};
    const rows = [...(groups.action_required ?? []), ...(groups.changes ?? []), ...(groups.fyi ?? [])];
    const armedRow = rows.find((n) => (n.route ?? n.payload?.route ?? '').startsWith('/alert/'));
    if (!armedRow) throw new Error('the armed alert did not write a notification with a deep link');
    const payload = {
      title: armedRow.title_plain ?? armedRow.payload?.title_plain ?? 'Cheat Code',
      body: armedRow.body_plain ?? armedRow.payload?.body_plain ?? '',
      data: {
        notification_id: armedRow.id,
        kind: armedRow.kind ?? 'alert_activated',
        category: 'trade_alerts',
        route: armedRow.route ?? armedRow.payload?.route,
        group: armedRow.group ?? null,
      },
    };
    pass(`notification ${armedRow.id} — "${payload.title}" → ${payload.data.route}`);

    // A real encrypted push was also queued to this browser by notify(). It
    // travels through Google, so it is REPORTED, never asserted: a proof that
    // fails on someone else's uptime proves nothing about this app.
    const early = await shownNotifications(page);
    if (early?.length) notes.push(`a real encrypted push also arrived from the server (${early.length} shown)`);

    console.log('[7] deliver it to the service worker and read the banner back');
    if (!registrationId) fail('no service worker registration id came back over CDP');
    await cdp.send('ServiceWorker.deliverPushMessage', {
      origin: BASE,
      registrationId: String(registrationId ?? 0),
      data: JSON.stringify(payload),
    });
    await page.waitForTimeout(1200);
    const shown = (await shownNotifications(page)) ?? [];
    const banner = shown.find((n) => n.tag === armedRow.id);
    if (!banner) {
      fail(`the push did not render a notification (${JSON.stringify(shown).slice(0, 200)})`);
    } else {
      pass(`banner rendered: "${banner.title}" / "${banner.body}"`);
      if (banner.tag === armedRow.id) pass('tag is the notification id, so a retry collapses instead of stacking');
      if (banner.title === payload.title && banner.body === payload.body) {
        pass('the banner copy IS the inbox copy — no second voice');
      } else fail('the banner copy drifted from the inbox row');
      if (banner.data?.route === payload.data.route) pass('the deep link travelled in the payload');
      else fail('the payload lost its route');
    }
    await shot(page, 'push-04-delivered');

    console.log('[8] click it — the worker focuses this client and the app navigates');
    const trail = [];
    const record = (f) => { if (f === page.mainFrame()) trail.push(f.url()); };
    page.on('framenavigated', record);

    const worker = ctx.serviceWorkers().find((w) => w.url().startsWith(BASE));
    if (!worker) fail('the service worker is not attached to this context');
    const dispatched = worker
      ? await worker.evaluate(async (tag) => {
          const list = await self.registration.getNotifications();
          const n = list.find((x) => x.tag === tag) ?? list[0];
          if (!n) return 'no-notification';
          try {
            self.dispatchEvent(new NotificationEvent('notificationclick', { notification: n }));
          } catch (e) {
            return `threw: ${String(e)}`;
          }
          return 'dispatched';
        }, armedRow.id)
      : 'no-worker';
    if (dispatched !== 'dispatched') fail(`notificationclick was not dispatched: ${dispatched}`);
    await page.waitForTimeout(4000);
    page.off('framenavigated', record);
    const visited = [...trail, page.url()].map((u) => u.replace(BASE, ''));
    // `/alert/:id` is a REDIRECT route (round 4): it resolves the alert's
    // symbol and forwards to the Trade Portal, falling back to the list when it
    // cannot. So the assertion is that the tap navigated to the route the
    // NOTIFICATION carried — where that route then sends the user is the
    // routing lane's business, not the push transport's.
    if (visited.some((u) => u.startsWith(payload.data.route))) {
      pass(`the tap navigated to ${payload.data.route} → ${visited[visited.length - 1]}`);
    } else {
      fail(`the tap did not reach ${payload.data.route} — went ${JSON.stringify(visited)}`);
    }
    if (visited[visited.length - 1] === '/account/notifications') {
      fail('the app never left the inbox');
    }
    await shot(page, 'push-05-clicked');

    console.log('[9] honest degradation — permission denied');
    await cdp.send('Browser.setPermission', {
      origin: BASE,
      permission: { name: 'notifications' },
      setting: 'denied',
    });
    await go(page, `${BASE}/account/notifications`, 3000);
    await must(page, 'screen-notifications', 'push-denied', 'a refused permission says so and points at settings');
    const deniedText = await page.locator('[data-testid="push-denied"]').innerText().catch(() => '');
    if (/padlock|Settings/i.test(deniedText)) pass('the denied copy carries the route back');
    else fail(`the denied copy has no route back: "${deniedText.slice(0, 120)}"`);
    await shot(page, 'push-06-denied');

    console.log('[10] honest degradation — the LAN address a phone actually uses');
    await go(page, `${LAN}/welcome`, 3000);
    const insecure = await page.evaluate(() => ({
      secure: window.isSecureContext,
      sw: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    }));
    if (!insecure.secure) pass(`${LAN} is not a secure context (serviceWorker present: ${insecure.sw})`);
    else notes.push(`${LAN} reported a secure context — the insecure branch was not exercised`);
    // A different origin is a different session store, so sign in again.
    await go(page, `${LAN}/sign-in`, 2000);
    if (await seen(page, 'screen-sign-in', 'field-email')) {
      await on(page, 'screen-sign-in', 'field-email').fill(EMAIL);
      await on(page, 'screen-sign-in', 'field-password').fill(PASSWORD);
      await tap(page, 'screen-sign-in', 'cta-sign-in', 4000);
    }
    await go(page, `${LAN}/account/notifications`, 3000);
    if (await seen(page, 'screen-notifications', 'push-blocker-insecure_context')) {
      const copy = await page.locator('[data-testid="push-blocker-insecure_context"]').innerText();
      pass(`insecure origin explains itself: "${copy.split('\n')[0]}"`);
      await shot(page, 'push-07-insecure-context');
    } else if (await seen(page, 'screen-notifications', 'push-delivery')) {
      fail('the LAN origin rendered the delivery header without the insecure-context explanation');
      await shot(page, 'push-07-insecure-context');
    } else {
      notes.push('could not reach the inbox on the LAN origin (sign-in did not carry) — insecure copy not shot');
    }

    console.log('[11] the native path — asserted, not proven');
    await assertExpoGoSource();
    notes.push('NATIVE PUSH IS UNPROVEN: no APNs/FCM credentials, no dev build, and Expo Go cannot receive push (SDK 53+).');
  } catch (e) {
    fail(`run aborted: ${e.message}`);
    await shot(page, 'push-99-aborted').catch(() => {});
  } finally {
    await ctx.close();
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  console.log('\n──────── notes ────────');
  notes.forEach((n) => console.log(`  · ${n}`));
  if (failures.length) {
    console.log('\n──────── FAILURES ────────');
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log('\nproof-push: green');
};

main();
