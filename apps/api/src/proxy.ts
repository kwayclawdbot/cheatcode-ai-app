/**
 * CORS for the Expo-web client (Next 16 renamed `middleware.ts` → `proxy.ts`;
 * see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 *
 * The mobile app runs on native (no CORS) and on web (`npx expo start --web`,
 * http://localhost:8081 / 8082 / whatever port Metro grabs, plus LAN IPs when a
 * phone browser hits the dev server). Those origins must be able to call
 * /api/v1/* with `Authorization` + `Content-Type`, including the Kai SSE route.
 *
 * No credentials mode: auth is a Bearer token, never a cookie, so
 * `Access-Control-Allow-Credentials` is deliberately NOT sent and the echoed
 * origin can never be used to ride a session.
 *
 * Allowed origins:
 *   - http://localhost[:port]
 *   - http://127.0.0.1[:port]
 *   - http://192.168.x.x[:port]        (LAN dev, phone browser → laptop)
 *   - anything listed in ALLOWED_ORIGINS (comma-separated, exact match) —
 *     that is where the deployed web origin goes.
 *
 * Headers land on route-handler responses too (streaming included) because
 * `NextResponse.next()` headers are merged into the final response.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const LOCAL_ORIGIN_PATTERNS = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
];

const CORS_HEADERS: Record<string, string> = {
  // `x-cheatcode-client` is the storefront lane's client identifier (see
  // `lib/storefront.ts`). It was added to every request the app makes without
  // being added here, and a request header that is not on this list is not a
  // 403 — the browser refuses to send the request at all, so on Expo web EVERY
  // /api/v1 call failed with a bare "Load failed". Native is unaffected, which
  // is exactly why it could sit here unnoticed.
  //
  // Written as a literal rather than imported from `lib/storefront.ts`: CORS
  // must keep working whether or not that module is present, and a build-time
  // import would tie this file's fate to a lane that is still in flight. If
  // the name ever changes, both places change together.
  'Access-Control-Allow-Headers': 'authorization, content-type, x-cheatcode-client',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** Read at request time, not module load: env is not baked into the build. */
function configuredOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (LOCAL_ORIGIN_PATTERNS.some((re) => re.test(origin))) return true;
  return configuredOrigins().includes(origin);
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '';
  const allowed = isAllowedOrigin(origin);

  // Preflight: answer here, never reach the route handler.
  if (request.method === 'OPTIONS') {
    const headers = new Headers(CORS_HEADERS);
    headers.set('Vary', 'Origin');
    if (allowed) headers.set('Access-Control-Allow-Origin', origin);
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  // Vary on every response — the answer differs per origin, so caches must not
  // reuse one origin's ACAO for another.
  response.headers.set('Vary', 'Origin');
  if (allowed) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    for (const [k, v] of Object.entries(CORS_HEADERS)) response.headers.set(k, v);
  }
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
