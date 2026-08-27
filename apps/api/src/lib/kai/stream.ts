/**
 * Anthropic streaming → SSE frames.
 *
 * Frames (event names): `text_delta` · `object` · `done` · `error`.
 * Text before and after the fenced object streams as deltas; the fence itself
 * never reaches the user as text. Objects are produced by asking the model for
 * a ```kai_object block, which we parse, zod-validate, run through the
 * contradiction validator, persist to `kai_objects`, and emit as an envelope.
 */
import Anthropic from '@anthropic-ai/sdk';
import { KaiEmittedObject, type KaiObjectEnvelope, type GradedSetupPayload } from '@shared/api';
import { env, KAI_MODEL } from '../env';
import { log } from '../log';
import { KAI_OBJECT_FENCE } from './system-prompt';
import { validateGradedSetup } from './contradiction';
import { persistKaiObject } from './objects';

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
  return client;
}
export function anthropicConfigured(): boolean {
  return Boolean(env('ANTHROPIC_API_KEY'));
}

const OPEN = '```' + KAI_OBJECT_FENCE;
const CLOSE = '```';

/**
 * Splits a token stream into visible text and fenced kai_object bodies.
 * Holds back up to OPEN.length-1 characters so a fence marker split across two
 * deltas is never leaked as text.
 */
export class FenceSplitter {
  private buf = '';
  private inFence = false;
  private fence = '';

  push(chunk: string): { text: string; objects: string[] } {
    this.buf += chunk;
    return this.drain(false);
  }

  flush(): { text: string; objects: string[] } {
    const out = this.drain(true);
    if (this.inFence && this.fence.trim()) {
      // Unterminated fence: keep the body, drop nothing silently.
      out.objects.push(this.fence);
      this.fence = '';
      this.inFence = false;
    }
    return out;
  }

  private drain(final: boolean): { text: string; objects: string[] } {
    let text = '';
    const objects: string[] = [];
    for (;;) {
      if (!this.inFence) {
        const i = this.buf.indexOf(OPEN);
        if (i >= 0) {
          text += this.buf.slice(0, i);
          let rest = this.buf.slice(i + OPEN.length);
          if (rest.startsWith('\r\n')) rest = rest.slice(2);
          else if (rest.startsWith('\n')) rest = rest.slice(1);
          this.buf = rest;
          this.inFence = true;
          continue;
        }
        const hold = final ? 0 : OPEN.length - 1;
        if (this.buf.length > hold) {
          text += this.buf.slice(0, this.buf.length - hold);
          this.buf = this.buf.slice(this.buf.length - hold);
        }
        break;
      }
      const j = this.buf.indexOf(CLOSE);
      if (j >= 0) {
        this.fence += this.buf.slice(0, j);
        this.buf = this.buf.slice(j + CLOSE.length);
        objects.push(this.fence);
        this.fence = '';
        this.inFence = false;
        continue;
      }
      const hold = final ? 0 : CLOSE.length - 1;
      if (this.buf.length > hold) {
        this.fence += this.buf.slice(0, this.buf.length - hold);
        this.buf = this.buf.slice(this.buf.length - hold);
      }
      break;
    }
    return { text, objects };
  }
}

/* ------------------------------------------------------------------ */
/* SSE writer                                                           */
/* ------------------------------------------------------------------ */

export class SseWriter {
  private encoder = new TextEncoder();
  constructor(private controller: ReadableStreamDefaultController<Uint8Array>) {}

  frame(event: string, data: unknown) {
    const payload = JSON.stringify(data);
    this.controller.enqueue(this.encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
  }
  textDelta(text: string) {
    if (text.length) this.frame('text_delta', { type: 'text_delta', text });
  }
  object(obj: KaiObjectEnvelope) {
    this.frame('object', { type: 'object', object: obj });
  }
  done(d: { conversation_id: string; message_id: string; seq: number; degraded: boolean }) {
    this.frame('done', { type: 'done', ...d });
  }
  error(code: string, messagePlain: string) {
    this.frame('error', { type: 'error', code, message_plain: messagePlain });
  }
  close() {
    try {
      this.controller.close();
    } catch {
      /* already closed */
    }
  }
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/* ------------------------------------------------------------------ */
/* Object parsing + validation                                          */
/* ------------------------------------------------------------------ */

export type ParsedObject =
  | { ok: true; type: 'graded_setup' | 'alert_preview' | 'action_preview' | 'briefing'; payload: unknown }
  | { ok: false; reason: string };

export function parseFenced(body: string): ParsedObject {
  let json: unknown;
  try {
    json = JSON.parse(body.trim());
  } catch {
    return { ok: false, reason: 'object block was not valid JSON' };
  }
  const parsed = KaiEmittedObject.safeParse(json);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { ok: true, type: parsed.data.type, payload: parsed.data.payload };
}

/**
 * Full gate for a model-produced object: shape → contradiction → persist.
 * Returns null when the object must be dropped (caller decides whether to
 * regenerate first).
 */
export async function gateAndPersist(opts: {
  body: string;
  narrative: string;
  userId: string;
  refs: Record<string, unknown>;
  requestId: string;
  /** Numbers Kai was actually shown — see context.contextNumbers(). */
  allowedNumbers?: number[];
}): Promise<{ envelope: KaiObjectEnvelope | null; failures: string[] }> {
  const parsed = parseFenced(opts.body);
  if (!parsed.ok) {
    log('warn', opts.requestId, 'kai_object.shape_failed', { reason: parsed.reason });
    return { envelope: null, failures: [parsed.reason] };
  }
  if (parsed.type === 'graded_setup') {
    const v = validateGradedSetup(parsed.payload as GradedSetupPayload, opts.narrative, opts.allowedNumbers ?? []);
    if (!v.ok) {
      // VALIDATION_INCOHERENT is internal-only — it never reaches the client.
      log('warn', opts.requestId, 'kai_object.VALIDATION_INCOHERENT', { failures: v.failures });
      return { envelope: null, failures: v.failures };
    }
  }
  const env_ = await persistKaiObject({
    type: parsed.type,
    payload: parsed.payload,
    userId: opts.userId,
    refs: opts.refs,
    requestId: opts.requestId,
  });
  return { envelope: env_, failures: [] };
}

/* ------------------------------------------------------------------ */
/* Model call                                                           */
/* ------------------------------------------------------------------ */

export type KaiTurn = { role: 'user' | 'assistant'; content: string };

export function messageStream(opts: {
  system: string;
  messages: KaiTurn[];
  maxTokens?: number;
}) {
  return anthropic().messages.stream({
    model: KAI_MODEL(),
    max_tokens: opts.maxTokens ?? 4000,
    output_config: { effort: 'low' },
    system: opts.system,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

/** Non-streaming completion used by the briefing job. */
export async function completeOnce(opts: {
  system: string;
  messages: KaiTurn[];
  maxTokens?: number;
}): Promise<string> {
  const res = await anthropic().messages.create({
    model: KAI_MODEL(),
    max_tokens: opts.maxTokens ?? 2000,
    output_config: { effort: 'low' },
    system: opts.system,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
