// Session-recovery proof: (A) stale access token → silent refresh, Home loads.
// (B) dead refresh token → app signs out and shows the welcome/sign-in screen.
import { chromium } from 'playwright';
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const EMAIL = `sess+${Date.now()}@cheatcode.test`, PASS = 'proof-pass-123';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
const tid = (id)=>p.locator(`[data-testid="${id}"]`);
await p.goto(`${BASE}/welcome`, { waitUntil:'load', timeout:120000 }); await p.waitForTimeout(2500);
await tid('cta-get-started').click(); await tid('field-email').fill(EMAIL); await tid('field-password').fill(PASS); await tid('cta-create').click();
await p.waitForURL(/\/kai/, { timeout: 60000 }); await p.waitForTimeout(1500);
const keyOf = async () => p.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')));
const key = await keyOf(); if (!key) throw new Error('no session key in localStorage');
// (A) make the access token look expired: expires_at in the past + garbage access token
await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now()/1000) - 10; s.access_token = s.access_token.slice(0,-6)+'xxxxxx'; localStorage.setItem(k, JSON.stringify(s)); }, key);
await p.reload({ waitUntil:'load' }); await p.waitForTimeout(4000);
const urlA = p.url(); const after = JSON.parse(await p.evaluate((k)=>localStorage.getItem(k), key));
const refreshed = after && after.expires_at > Math.floor(Date.now()/1000) + 60 && !after.access_token.endsWith('xxxxxx');
console.log('A stale access token → refreshed:', refreshed, '| url:', urlA.replace(BASE,''));
await p.screenshot({ path: 'proof/session-A-refreshed.png' });
// prove an API call works with the refreshed token: onboarding screen already calls nothing; hit Home path by finishing nothing — instead call the API directly with the stored token
const apiOk = await p.evaluate(async (k) => { const s = JSON.parse(localStorage.getItem(k)); const r = await fetch('http://192.168.4.22:3000/api/v1/me', { headers:{ Authorization:`Bearer ${s.access_token}` } }); return r.status; }, key);
console.log('A GET /me with refreshed token → HTTP', apiOk);
// (B) kill the refresh token too → expect sign-out → welcome
await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now()/1000) - 10; s.access_token = s.access_token.slice(0,-6)+'yyyyyy'; s.refresh_token = 'dead-refresh-token'; localStorage.setItem(k, JSON.stringify(s)); }, key);
await p.reload({ waitUntil:'load' }); await p.waitForTimeout(6000);
const urlB = p.url(); const hasWelcome = await tid('screen-welcome').count() > 0 || /welcome|sign-in/.test(urlB);
console.log('B dead refresh token → signed out to welcome:', hasWelcome, '| url:', urlB.replace(BASE,''));
await p.screenshot({ path: 'proof/session-B-signed-out.png' });
console.log('page errors:', errs.length); await b.close();
if (!refreshed || apiOk !== 200 || !hasWelcome) process.exit(1);
