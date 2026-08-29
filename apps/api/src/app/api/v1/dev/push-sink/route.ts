/**
 * /api/v1/dev/push-sink   DEV ONLY — a stand-in Web Push endpoint.
 *
 * Gated on `DEV_TOOLS=1`; without it the route answers 404 exactly as if it did
 * not exist.
 *
 * WHY THIS EXISTS. Web Push is the one transport this round can actually prove,
 * but proving it needs a real push endpoint to POST to, and the real ones
 * (Mozilla, FCM, Apple) belong to a browser that has agreed to receive from us.
 * A subscription registered against this URL gives the sender a genuine HTTP
 * endpoint: `web-push` encrypts the payload to a real P-256 key pair and signs
 * the request with our real VAPID keys, and what arrives here is byte-for-byte
 * what a browser would have received. `?status=` then lets the smoke run
 * reproduce the responses that matter — 201 accepted, 410 gone — against the
 * sender's actual code path rather than a mock of it.
 *
 * It records SHAPE ONLY: sizes, the content encoding, the TTL, and whether a
 * VAPID Authorization header was attached. The ciphertext is never stored and
 * could not be read if it were — it is encrypted to keys this server does not
 * hold the private half of.
 *
 * State is a module global. It is a development fixture; it does not survive a
 * restart and is not supposed to.
 */
import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

type Received = {
  count: number;
  last_at: string | null;
  last_bytes: number;
  last_encoding: string | null;
  last_ttl: string | null;
  last_authorized: boolean;
};

const KEY = '__cheatcode_push_sink__';

function state(): Received {
  const g = globalThis as unknown as Record<string, Received | undefined>;
  if (!g[KEY]) {
    g[KEY] = { count: 0, last_at: null, last_bytes: 0, last_encoding: null, last_ttl: null, last_authorized: false };
  }
  return g[KEY] as Received;
}

function enabled(): boolean {
  return env('DEV_TOOLS') === '1';
}

const gone = () => new Response(null, { status: 404 });

export async function POST(req: NextRequest): Promise<Response> {
  if (!enabled()) return gone();
  const url = new URL(req.url);
  const status = Number(url.searchParams.get('status') ?? 201);
  const body = await req.arrayBuffer();

  const s = state();
  s.count += 1;
  s.last_at = new Date().toISOString();
  s.last_bytes = body.byteLength;
  s.last_encoding = req.headers.get('content-encoding');
  s.last_ttl = req.headers.get('ttl');
  s.last_authorized = Boolean(req.headers.get('authorization'));

  const ok = Number.isFinite(status) && status >= 200 && status < 600 ? status : 201;
  return new Response(ok >= 400 ? 'sink' : null, { status: ok });
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!enabled()) return gone();
  if (new URL(req.url).searchParams.get('reset') === '1') {
    const g = globalThis as unknown as Record<string, Received | undefined>;
    g[KEY] = undefined;
  }
  return Response.json(state());
}
