/**
 * GET /api/v1/market/logo/{symbol}  →  image bytes, or 404
 *
 * WHY THIS ROUTE EXISTS AT ALL
 * ----------------------------
 * Polygon's company marks live at
 *   https://api.polygon.io/v1/reference/company-branding/<b64 domain>/images/<date>_icon.png
 * and that URL answers **401 without `?apiKey=`** (verified 2026-09-01). So the
 * one thing the client must never do is hold that URL: putting it in the bundle
 * means shipping the market-data key to every phone. The bytes come through
 * here instead, the key is appended server-side, and the app only ever knows
 * about `/api/v1/market/logo/AAPL`.
 *
 * UNAUTHENTICATED, ON PURPOSE
 * ---------------------------
 * Every other route in this app is `authed()`. This one is not, and the reason
 * is narrow: an `<Image>` cannot carry a bearer token on web without fetching
 * the bytes by hand and blobbing them, which throws away the browser's own
 * image cache — the exact thing that makes a list of 40 rows cheap. What leaks
 * by leaving it open is a public company logo, which is not a secret and is not
 * about a user. What does NOT leak is the key.
 *
 * The budget is still defended, because an open door onto a metered API is a
 * real thing to worry about:
 *   · the symbol must match `^[A-Z0-9.-]{1,10}$` before anything is fetched;
 *   · resolution reads `instruments.meta.profile.logo_url` FIRST, so a symbol
 *     the app already knows costs zero Polygon requests, ever;
 *   · a reference lookup goes through `polyGet`, which is rate-limited and
 *     429-aware like every other call in this app;
 *   · answers are memoised in-process, misses included, so a page full of ETFs
 *     asks Polygon once and then stops asking;
 *   · both the hit and the miss carry a long `Cache-Control`, so the CDN and
 *     the phone answer most of these without reaching the server.
 *
 * ONLY POLYGON'S OWN HOST IS FETCHED. The URL arrives from a database column,
 * and a database column is not a promise. `api.polygon.io` is checked before
 * the fetch so this cannot be turned into a general-purpose SSRF proxy by
 * anything that can write that row.
 *
 * A SYMBOL WITH NO MARK IS A 404, NOT A PLACEHOLDER. ETFs have no branding at
 * all on this plan (SPY, QQQ, ARKK all answer `branding: null`), and inventing
 * a grey square here would push a design decision into the network layer. The
 * client owns the fallback; this route only ever says "here it is" or "there
 * isn't one".
 */
import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { serviceClient } from '@/lib/db';
import { fetchTickerReference } from '@/lib/market/polygon';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

const SYMBOL = /^[A-Z0-9.-]{1,10}$/;
const POLYGON_HOST = 'api.polygon.io';

/** A mark is a brand asset. It changes about as often as a company rebrands. */
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
/** A miss is cheaper to re-check, but not on every scroll. */
const MISS_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_BYTES = 512 * 1024;

type Entry = { at: number; body: ArrayBuffer; type: string } | { at: number; body: null };
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<Entry>>();

function fresh(e: Entry | undefined): e is Entry {
  if (!e) return false;
  return Date.now() - e.at < (e.body ? HIT_TTL_MS : MISS_TTL_MS);
}

/**
 * Where the mark lives, cheapest source first.
 *
 * `icon_url` before `logo_url`: the icon is the square mark and the logo is a
 * wide wordmark, and everything that renders a ticker in this app renders it in
 * a square. A wordmark squeezed into 30×30 is illegible, which is worse than
 * the letters fallback it would have replaced.
 */
async function resolveUrl(symbol: string): Promise<string | null> {
  try {
    const db = serviceClient();
    const { data } = await db.from('instruments').select('meta').eq('symbol', symbol).maybeSingle();
    const profile = (data as { meta?: { profile?: { logo_url?: string | null } } } | null)?.meta?.profile;
    if (profile?.logo_url) return profile.logo_url;
  } catch {
    // No database configured, or the row is not there yet. Fall through to the
    // reference lookup rather than failing a logo request over it.
  }
  const ref = await fetchTickerReference(symbol);
  return ref?.branding?.icon_url ?? ref?.branding?.logo_url ?? null;
}

async function load(symbol: string): Promise<Entry> {
  const key = env('POLYGON_API_KEY');
  if (!key) return { at: Date.now(), body: null };

  const raw = await resolveUrl(symbol);
  if (!raw) return { at: Date.now(), body: null };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { at: Date.now(), body: null };
  }
  if (url.protocol !== 'https:' || url.hostname !== POLYGON_HOST) {
    log('warn', 'logo', 'logo.foreign_host', { symbol, host: url.hostname });
    return { at: Date.now(), body: null };
  }
  url.searchParams.set('apiKey', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return { at: Date.now(), body: null };
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return { at: Date.now(), body: null };
    const body = await res.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_BYTES) return { at: Date.now(), body: null };
    return { at: Date.now(), body, type };
  } catch {
    return { at: Date.now(), body: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(
  _req: NextRequest,
  route: { params: Promise<{ symbol: string }> }
): Promise<Response> {
  const { symbol: rawSymbol } = await route.params;
  const symbol = decodeURIComponent(rawSymbol ?? '').toUpperCase().trim();
  if (!SYMBOL.test(symbol)) return miss(60);

  let entry = cache.get(symbol);
  if (!fresh(entry)) {
    let p = inFlight.get(symbol);
    if (!p) {
      p = load(symbol).finally(() => inFlight.delete(symbol));
      inFlight.set(symbol, p);
    }
    entry = await p;
    cache.set(symbol, entry);
  }

  if (!entry.body) return miss(21_600);
  return new Response(entry.body, {
    status: 200,
    headers: {
      'content-type': entry.type,
      'content-length': String(entry.body.byteLength),
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}

/** "There isn't one." The client draws its own mark; nothing is invented here. */
function miss(seconds: number): Response {
  return new Response(null, {
    status: 404,
    headers: { 'cache-control': `public, max-age=${seconds}` },
  });
}
