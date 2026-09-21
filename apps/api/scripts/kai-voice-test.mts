/**
 * PROOF FOR KAI'S VOICE DOORS (lane C) — costs nothing to run.
 *
 * No key, no database, no model. Every dependency with a network behind it is
 * a fake handed to the route factories, and the provider client is driven with
 * a fake `fetch`. What is proved:
 *
 *  1. AUTH FIRST. No session → 401 on all four doors, before a byte of the body
 *     is read and before anything is spent.
 *  2. LIMITS BEFORE MONEY. Too big, too long, too short, no length, the wrong
 *     format, and the web FormData trap (a string where a file should be) are
 *     refused before the credit check and before OpenAI is called.
 *  3. CREDITS. Out of credits → 402 with Kai's own sentence, and OpenAI is not
 *     called. A finished transcription is recorded at its real cost and
 *     settled. A cached spoken reply costs nothing.
 *  4. PROVIDER FAILURES are sentences with the right status, never OpenAI's
 *     text; whisper-1 is tried only when the MODEL is refused, not on outage.
 *  5. THE MATH in voice-billing's header, and the spoken-text cleaner.
 *
 * Run: npx tsx scripts/kai-voice-test.mts
 */
import { UNAUTHENTICATED } from '../src/lib/errors.ts';
import { ApiError } from '../src/lib/errors.ts';
import { resetRateLimits, rateLimit } from '../src/lib/ratelimit.ts';
import { makeSpeak, makeTranscribe, makeVoiceSettings, type VoiceDeps } from '../src/lib/kai/voice-routes.ts';
import {
  MAX_AUDIO_BYTES,
  VoiceProviderError,
  extensionFor,
  spokenText,
  transcribe,
  voiceCostUsd,
} from '../src/lib/kai/voice-io.ts';
import { USD_PER_UNIT, unitsForUsd, voiceChargeId, wholeCreditsFor } from '../src/lib/kai/voice-billing.ts';
import type { CreditState } from '../src/lib/kai/credits.ts';

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  else passes += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

/* ------------------------------------------------------------------ */
/* fakes                                                               */
/* ------------------------------------------------------------------ */

const STATE = { degraded: false, period: { kind: 'day', key: '2026-09-21', start: '2026-09-21T00:00:00Z' } } as unknown as CreditState;

type Calls = { gate: number; transcribe: number; speak: number; record: unknown[]; settle: number; pref: boolean | null };

function deps(over: Partial<VoiceDeps> = {}): { d: VoiceDeps; calls: Calls } {
  const calls: Calls = { gate: 0, transcribe: 0, speak: 0, record: [], settle: 0, pref: null };
  const d: VoiceDeps = {
    auth: async (req) => {
      if (req.headers.get('authorization') !== 'Bearer good') throw UNAUTHENTICATED();
      return { id: '00000000-0000-0000-0000-000000000001', email: null };
    },
    available: () => true,
    gate: async () => {
      calls.gate += 1;
      return STATE;
    },
    transcribe: async (o) => {
      calls.transcribe += 1;
      return { text: 'what is Nvidia doing today', model: 'gpt-4o-mini-transcribe', duration_ms: o.declaredMs };
    },
    speak: async () => {
      calls.speak += 1;
      return { audio_url: 'https://x/a.mp3', duration_ms: 4000, state: 'estimated', cached: false };
    },
    record: async (o) => {
      calls.record.push(o);
    },
    settle: async () => {
      calls.settle += 1;
      return 0;
    },
    readPref: async () => true,
    writePref: async (_u, r) => {
      calls.pref = r;
    },
    limit: () => {},
    ...over,
  };
  return { d, calls };
}

const URL_T = 'http://api.test/api/v1/kai/voice/transcribe';
const URL_S = 'http://api.test/api/v1/kai/voice/speak';

function audioForm(opts: { bytes?: number; type?: string; ms?: string | null; asString?: boolean } = {}) {
  const form = new FormData();
  if (opts.asString) form.append('audio', '[object Object]');
  else form.append('audio', new Blob([new Uint8Array(opts.bytes ?? 20_000)], { type: opts.type ?? 'audio/webm' }), 'v.webm');
  if (opts.ms !== null) form.append('duration_ms', opts.ms ?? '3200');
  return form;
}

const post = (url: string, body: BodyInit, auth = true, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', body, headers: { ...(auth ? { authorization: 'Bearer good' } : {}), ...headers } });

async function body(res: Response) {
  return (await res.json()) as { error?: { code: string; message_plain: string }; [k: string]: unknown };
}

/* ------------------------------------------------------------------ */
/* 1. auth                                                              */
/* ------------------------------------------------------------------ */
{
  const { d, calls } = deps();
  const t = await makeTranscribe(d)(post(URL_T, audioForm(), false));
  check('transcribe: no session → 401', t.status === 401, t.status);
  const s = await makeSpeak(d)(post(URL_S, JSON.stringify({ text: 'hi' }), false));
  check('speak: no session → 401', s.status === 401, s.status);
  const { GET, PUT } = makeVoiceSettings(d);
  const g = await GET(new Request('http://api.test/api/v1/kai/voice'));
  check('settings GET: no session → 401', g.status === 401, g.status);
  const p = await PUT(new Request('http://api.test/api/v1/kai/voice', { method: 'PUT', body: '{"replies":true}' }));
  check('settings PUT: no session → 401', p.status === 401, p.status);
  const bad = await makeTranscribe(d)(post(URL_T, audioForm(), false, { authorization: 'Bearer forged' }));
  check('transcribe: bad token → 401', bad.status === 401, bad.status);
  check('nothing was spent or called on any refused request', calls.gate === 0 && calls.transcribe === 0 && calls.speak === 0);
}

/* ------------------------------------------------------------------ */
/* 2. limits before money                                               */
/* ------------------------------------------------------------------ */
{
  const cases: [string, FormData, number][] = [
    ['file over 4 MB → 413', audioForm({ bytes: MAX_AUDIO_BYTES + 1 }), 413],
    ['declared 90 s → 413', audioForm({ ms: '90000' }), 413],
    ['too short (200 bytes) → 400', audioForm({ bytes: 200 }), 400],
    ['no duration_ms → 400', audioForm({ ms: null }), 400],
    ['duration_ms not a number → 400', audioForm({ ms: 'abc' }), 400],
    ['unsupported type (image/png) → 415', audioForm({ type: 'image/png' }), 415],
    ['web FormData trap: audio is a string → 400', audioForm({ asString: true }), 400],
  ];
  for (const [name, form, status] of cases) {
    const { d, calls } = deps();
    const res = await makeTranscribe(d)(post(URL_T, form));
    const b = await body(res);
    check(`transcribe: ${name}`, res.status === status && !!b.error?.message_plain, { status: res.status, b });
    check(`transcribe: ${name} — no credit check, no OpenAI call`, calls.gate === 0 && calls.transcribe === 0);
  }
  {
    const { d, calls } = deps();
    const res = await makeTranscribe(d)(
      post(URL_T, new Uint8Array(10), true, { 'content-length': String(MAX_AUDIO_BYTES * 2), 'content-type': 'multipart/form-data; boundary=x' })
    );
    check('transcribe: declared content-length over cap → 413 before reading', res.status === 413 && calls.transcribe === 0, res.status);
  }
  {
    const { d } = deps();
    const res = await makeTranscribe(d)(post(URL_T, 'not a form', true, { 'content-type': 'text/plain' }));
    check('transcribe: not multipart → 400', res.status === 400, res.status);
  }
  {
    const { d, calls } = deps();
    const res = await makeSpeak(d)(post(URL_S, JSON.stringify({ text: 'x'.repeat(8_001) })));
    check('speak: over 8,000 chars → 413, nothing spoken', res.status === 413 && calls.speak === 0, res.status);
    const empty = await makeSpeak(d)(post(URL_S, JSON.stringify({ text: '   ' })));
    check('speak: empty text → 400', empty.status === 400, empty.status);
    const fenceOnly = await makeSpeak(d)(post(URL_S, JSON.stringify({ text: '```kai-ui\n{"a":1}\n```' })));
    check('speak: a reply that is only a machine fence → 400, nothing spoken', fenceOnly.status === 400 && calls.speak === 0, fenceOnly.status);
  }
  {
    const { d } = deps({ available: () => false });
    const t = await makeTranscribe(d)(post(URL_T, audioForm()));
    const s = await makeSpeak(d)(post(URL_S, JSON.stringify({ text: 'hi' })));
    check('voice switched off → 503 on both doors', t.status === 503 && s.status === 503, [t.status, s.status]);
    const g = await body(await makeVoiceSettings(d).GET(new Request('http://x/api/v1/kai/voice', { headers: { authorization: 'Bearer good' } })));
    check('voice switched off → settings say available:false and replies:false', g.available === false && g.replies === false, g);
  }
  {
    let n = 0;
    const { d } = deps({
      limit: (key) => {
        n += 1;
        rateLimit({ key, limit: 2, windowMs: 60_000, messagePlain: 'slow down' });
      },
    });
    resetRateLimits();
    const a = await makeTranscribe(d)(post(URL_T, audioForm()));
    const b = await makeTranscribe(d)(post(URL_T, audioForm()));
    const c = await makeTranscribe(d)(post(URL_T, audioForm()));
    check('rate limit: third call in the window → 429', a.status === 200 && b.status === 200 && c.status === 429 && n === 3, [a.status, b.status, c.status]);
    resetRateLimits();
  }
}

/* ------------------------------------------------------------------ */
/* 3. credits                                                           */
/* ------------------------------------------------------------------ */
{
  const refusal = 'You have used today’s credits. There are more tomorrow morning.';
  const { d, calls } = deps({
    gate: async () => {
      throw new ApiError('ENTITLEMENT_REQUIRED', refusal, { status: 402 });
    },
  });
  const res = await makeTranscribe(d)(post(URL_T, audioForm()));
  const b = await body(res);
  check('out of credits → 402 with Kai’s own sentence', res.status === 402 && b.error?.message_plain === refusal, b);
  check('out of credits → OpenAI never called', calls.transcribe === 0);
  const s = await makeSpeak(d)(post(URL_S, JSON.stringify({ text: 'Nvidia is up two percent.' })));
  check('out of credits → speak also 402, nothing spoken', s.status === 402 && calls.speak === 0, s.status);
}
{
  const { d, calls } = deps();
  const res = await makeTranscribe(d)(post(URL_T, audioForm({ ms: '3200' })));
  const b = await body(res);
  check('transcribe: happy path → 200 with the words', res.status === 200 && b.text === 'what is Nvidia doing today' && b.heard === true, b);
  const rec = calls.record[0] as { feature: string; costUsd: number; durationMs: number; model: string };
  check('transcribe: usage recorded as voice_in at the real per-minute cost', rec?.feature === 'voice_in' && rec.durationMs === 3200 && Math.abs(rec.costUsd - 0.00016) < 1e-6, rec);
  check('transcribe: credits settled after the answer', calls.settle === 1 && calls.gate === 1);
}
{
  const { d, calls } = deps({ transcribe: async () => ({ text: '', model: 'gpt-4o-mini-transcribe', duration_ms: 2000 }) });
  const b = await body(await makeTranscribe(d)(post(URL_T, audioForm())));
  check('transcribe: silence → 200, heard:false, a sentence, still recorded', b.heard === false && typeof b.plain === 'string' && calls.record.length === 1, b);
}
{
  const { d, calls } = deps();
  const res = await makeSpeak(d)(post(URL_S, JSON.stringify({ text: '**Nvidia** is up. [Chart](https://x.y)' })));
  const b = await body(res);
  const rec = calls.record[0] as { feature: string; costUsd: number };
  check('speak: happy path → audio_url', res.status === 200 && b.audio_url === 'https://x/a.mp3', b);
  check('speak: recorded as voice_out, 4 s at $0.015/min = $0.001', rec?.feature === 'voice_out' && Math.abs(rec.costUsd - 0.001) < 1e-9, rec);
}
{
  const { d, calls } = deps({ speak: async () => ({ audio_url: 'https://x/c.mp3', duration_ms: 0, state: 'estimated', cached: true }) });
  const res = await makeSpeak(d)(post(URL_S, JSON.stringify({ text: 'Said before.' })));
  check('speak: a cached line costs nothing (no usage row, no settle)', res.status === 200 && calls.record.length === 0 && calls.settle === 0);
}
{
  const { d } = deps({ speak: async () => ({ audio_url: null, duration_ms: 900, state: 'estimated', cached: false }) });
  const res = await makeSpeak(d)(post(URL_S, JSON.stringify({ text: 'Hello.' })));
  const b = await body(res);
  check('speak: provider gave no audio → 503 with a sentence', res.status === 503 && /screen/.test(b.error?.message_plain ?? ''), b);
}

/* ------------------------------------------------------------------ */
/* 4. provider failures                                                 */
/* ------------------------------------------------------------------ */
{
  const map: [VoiceProviderError, number][] = [
    [new VoiceProviderError('rejected', 'Invalid file format', 400), 422],
    [new VoiceProviderError('unavailable', 'upstream 500', 500), 503],
    [new VoiceProviderError('unconfigured', 'no key'), 503],
  ];
  for (const [err, status] of map) {
    const { d } = deps({
      transcribe: async () => {
        throw err;
      },
    });
    const res = await makeTranscribe(d)(post(URL_T, audioForm()));
    const b = await body(res);
    check(`provider ${err.kind} → ${status}, OpenAI text not leaked`, res.status === status && !b.error?.message_plain.includes(err.message), b);
  }
}
{
  process.env.OPENAI_API_KEY = 'test-key-not-real';
  delete process.env.KAI_VOICE;
  const blob = new Blob([new Uint8Array(5000)], { type: 'audio/webm' });
  const seen: string[] = [];
  const fake = (responses: Response[]) =>
    (async (_url: unknown, init?: RequestInit) => {
      seen.push(String((init?.body as FormData).get('model')));
      return responses.shift()!;
    }) as typeof fetch;

  seen.length = 0;
  const ok = await transcribe({
    audio: blob, filename: 'voice.webm', declaredMs: 2500, requestId: 't',
    fetcher: fake([new Response(JSON.stringify({ text: ' what is Nvidia doing today ' }), { status: 200 })]),
  });
  check('client: primary model, trimmed text, phone duration when provider gives none', ok.text === 'what is Nvidia doing today' && ok.duration_ms === 2500 && seen.join() === 'gpt-4o-mini-transcribe', { ok, seen });

  seen.length = 0;
  const fb = await transcribe({
    audio: blob, filename: 'voice.webm', declaredMs: 2500, requestId: 't',
    fetcher: fake([
      new Response(JSON.stringify({ error: { message: 'The model `gpt-4o-mini-transcribe` does not exist' } }), { status: 404 }),
      new Response(JSON.stringify({ text: 'hi', usage: { type: 'duration', seconds: 3.4 } }), { status: 200 }),
    ]),
  });
  check('client: model refused → falls back to whisper-1, provider duration used', fb.model === 'whisper-1' && fb.duration_ms === 3400 && seen.join() === 'gpt-4o-mini-transcribe,whisper-1', { fb, seen });

  seen.length = 0;
  let kind = '';
  try {
    await transcribe({ audio: blob, filename: 'voice.webm', declaredMs: 2500, requestId: 't', fetcher: fake([new Response('boom', { status: 503 })]) });
  } catch (e) {
    kind = (e as VoiceProviderError).kind;
  }
  check('client: outage → unavailable, and NO second model tried', kind === 'unavailable' && seen.length === 1, { kind, seen });

  seen.length = 0;
  kind = '';
  try {
    await transcribe({
      audio: blob, filename: 'voice.webm', declaredMs: 2500, requestId: 't',
      fetcher: fake([new Response(JSON.stringify({ error: { message: 'Audio file might be corrupted' } }), { status: 400 })]),
    });
  } catch (e) {
    kind = (e as VoiceProviderError).kind;
  }
  check('client: unreadable audio → rejected, no fallback', kind === 'rejected' && seen.length === 1, { kind, seen });

  kind = '';
  try {
    await transcribe({
      audio: blob, filename: 'voice.webm', declaredMs: 2500, requestId: 't',
      fetcher: (async () => { throw new Error('network down'); }) as unknown as typeof fetch,
    });
  } catch (e) {
    kind = (e as VoiceProviderError).kind;
  }
  check('client: network throw → unavailable', kind === 'unavailable', kind);

  delete process.env.OPENAI_API_KEY;
  kind = '';
  try {
    await transcribe({ audio: blob, filename: 'voice.webm', declaredMs: 2500, requestId: 't' });
  } catch (e) {
    kind = (e as VoiceProviderError).kind;
  }
  check('client: no key → unconfigured', kind === 'unconfigured', kind);
}

/* ------------------------------------------------------------------ */
/* settings                                                             */
/* ------------------------------------------------------------------ */
{
  const { d, calls } = deps();
  const { GET, PUT } = makeVoiceSettings(d);
  const auth = { authorization: 'Bearer good' };
  const g = await body(await GET(new Request('http://x/api/v1/kai/voice', { headers: auth })));
  check('settings GET → available, replies, max_seconds', g.available === true && g.replies === true && g.max_seconds === 60, g);
  const p = await PUT(new Request('http://x/api/v1/kai/voice', { method: 'PUT', headers: auth, body: JSON.stringify({ replies: false }) }));
  check('settings PUT {replies:false} → saved', p.status === 200 && calls.pref === false, p.status);
  const bad = await PUT(new Request('http://x/api/v1/kai/voice', { method: 'PUT', headers: auth, body: JSON.stringify({ replies: 'yes' }) }));
  check('settings PUT non-boolean → 400', bad.status === 400, bad.status);
}

/* ------------------------------------------------------------------ */
/* 5. math + cleaning                                                   */
/* ------------------------------------------------------------------ */
check('rate: $0.0152 / 4000 = $0.0000038 a unit', Math.abs(USD_PER_UNIT - 0.0000038) < 1e-12, USD_PER_UNIT);
check('a minute of listening ≈ 789 units ≈ 0.2 credit', Math.round(unitsForUsd(voiceCostUsd('gpt-4o-mini-transcribe', 60_000)!)) === 789);
check('a minute of Kai talking ≈ 3,947 units', Math.round(unitsForUsd(voiceCostUsd('gpt-4o-mini-tts', 60_000)!)) === 3947);
check('whole credits round the user’s way: $0.0151 → 0, $0.0152 → 1, $0.0455 → 2', wholeCreditsFor(0.0151) === 0 && wholeCreditsFor(0.0152) === 1 && wholeCreditsFor(0.0455) === 2);
check('unknown model is unpriced (null), not free', voiceCostUsd('some-new-model', 60_000) === null);
check('charge ids are deterministic per user/day/n', voiceChargeId('u', '2026-09-21', 3) === 'voice:u:2026-09-21:3');
check('extension: webm with codecs', extensionFor('audio/webm;codecs=opus') === 'webm');
check('extension: iOS m4a', extensionFor('audio/m4a') === 'm4a' && extensionFor('audio/x-m4a') === 'm4a');
check('extension: png refused', extensionFor('image/png') === null);

const cleaned = spokenText('## Nvidia today\n- **Up 2.1%** at $182\n- Watch [the chart](https://x.y/z)\n```kai-ui\n{"open":"NVDA"}\n```\nThat is the *read*.');
check('spoken text: no markdown, no fence, no url', !/[#*`\[\]]|https?:|kai-ui|open/.test(cleaned.text), cleaned.text);
check('spoken text: keeps the words and numbers', /Nvidia today/.test(cleaned.text) && /2\.1%/.test(cleaned.text) && /the chart/.test(cleaned.text), cleaned.text);
const long = spokenText('This is one sentence about the market. '.repeat(80));
check('spoken text: long reply cut at a sentence and says the rest is on screen', long.truncated && long.text.length <= 1200 && long.text.endsWith('The rest is on your screen.') && !/sentence about the$/.test(long.text), long.text.slice(-80));

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
