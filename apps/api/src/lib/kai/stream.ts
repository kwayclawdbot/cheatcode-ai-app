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
import {
  KaiEmittedObject,
  type ChartAnswerFrame,
  type ChartCommandFrame,
  type KaiObjectEnvelope,
  type GradedSetupPayload,
} from '@shared/api';
import { env } from '../env';
import { log } from '../log';
import { KAI_OBJECT_FENCE } from './system-prompt';
import { validateGradedSetup } from './contradiction';
import { persistKaiObject } from './objects';
import { recordModelUsage, type UsageMeta, type UsageFeature } from './usage';
import { isEffortRejection, modelFor, noteEffortRejected, supportsEffort } from './models';

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
  return client;
}
export function anthropicConfigured(): boolean {
  return Boolean(env('ANTHROPIC_API_KEY'));
}

/**
 * DOES THE KEY ACTUALLY WORK — not "is one set".
 *
 * THE REASON THIS EXISTS. On 4-5 September the deployed key was revoked. Every
 * Kai turn failed in under a second, every reply was written to the database as
 * an empty stub, and the owner spent two days reporting "Kai stopped replying"
 * and "the chart moves but nothing happens" — while `/api/v1/health` answered
 * `{"ok":true,"anthropic":true}` the whole time, because it only ever checked
 * that the environment variable was non-empty. A health check that cannot fail
 * is not a health check.
 *
 * It asks the provider to list models: no tokens, no cost, and it is the one
 * question that distinguishes a key that is present from a key that is accepted.
 *
 * ONLY AN EXPLICIT REJECTION COUNTS AS UNHEALTHY. A timeout or a network blip
 * means we do not know, and flapping the whole service red on a dropped packet
 * would train everyone to ignore this line — which is how the real failure got
 * missed. A 401 or 403 is the provider telling us plainly, and that is the
 * failure worth reporting.
 */
let reachable: { at: number; ok: boolean } | null = null;
const REACHABLE_TTL_MS = 60_000;

export async function anthropicReachable(): Promise<boolean> {
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return false;
  const now = Date.now();
  if (reachable && now - reachable.at < REACHABLE_TTL_MS) return reachable.ok;
  let ok = true;
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 401 || res.status === 403) {
      ok = false;
      log('error', 'health', 'anthropic.key_rejected', { status: res.status });
    }
  } catch (e) {
    // Unknown, not rejected. Say nothing is wrong and log that we could not ask.
    log('warn', 'health', 'anthropic.reachability_unknown', {
      message: e instanceof Error ? e.message : String(e),
    });
  }
  reachable = { at: now, ok };
  return ok;
}

export const CHART_COMMAND_FENCE = 'chart_command';
/**
 * LIVE-8. A third fence, for the whole answer rather than one action. Its body
 * is `{ "answer": "<prose>" }` and the server directs it — see
 * `chartAnswerProtocol` in `./chart-commands.ts` for why the model writes only
 * the words.
 */
export const CHART_ANSWER_FENCE = 'answer_on_chart';
const CLOSE = '```';

/**
 * THE PROSE OUT OF AN `answer_on_chart` BLOCK, EVEN WHEN THE WRAPPER IS WRONG.
 *
 * THE FAILURE THIS ENDS. The contract is `{ "answer": "<prose>" }` and the
 * server reads the prose out of it, directs it, and shows it — that prose IS
 * the reply. Measured on 5 September, Haiku 4.5 wrote the prose and left the
 * JSON off on 5 of 11 chart answers; Sonnet 5 broke the same rule once in
 * twelve. The old handler did the textbook thing with a malformed body — logged
 * it and dropped it — and the user got *"I came back with nothing that time"*
 * on top of an answer that was written, complete and correct.
 *
 * A REPLY THAT EXISTS IS NOT THROWN AWAY OVER ITS PUNCTUATION. Three readings,
 * in order of how much they trust the model:
 *
 *   1. The contract: valid JSON with a string `answer`.
 *   2. A wrapper that started and did not finish — `{"answer": "…` cut off at
 *      the token limit. The string is read as far as it goes.
 *   3. No wrapper at all: the body is the prose. This is the Haiku failure.
 *
 * A body that looks like JSON and cannot be read either way is still dropped —
 * showing a user a half-parsed brace is worse than saying nothing.
 *
 * NO HONESTY RULE IS RELAXED BY THIS. The prose is handed to the same director
 * either way, every number it draws is still resolved server-side from a real
 * row, and a level that does not resolve is still not drawn. The only thing
 * that changes is whether words the model actually wrote reach the person who
 * asked for them.
 */
export type ChartAnswerRead = { answer: string; how: 'json' | 'truncated_json' | 'bare_prose' } | null;

export function readChartAnswer(body: string): ChartAnswerRead {
  const raw = body.trim();
  if (!raw) return null;

  try {
    const v = JSON.parse(raw) as { answer?: unknown };
    if (typeof v.answer === 'string' && v.answer.trim()) return { answer: v.answer, how: 'json' };
    return null;
  } catch {
    /* fall through to the two salvages */
  }

  // 2. A wrapper that began. Read the JSON string after `"answer":` by hand,
  //    honouring escapes, and accept it unterminated.
  const key = raw.match(/"answer"\s*:\s*"/);
  if (key && key.index !== undefined) {
    let out = '';
    let i = key.index + key[0].length;
    let closed = false;
    for (; i < raw.length; i += 1) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if (n === 'n') out += '\n';
        else if (n === 't') out += '\t';
        else if (n === 'r') out += '\r';
        else if (n !== undefined) out += n;
        i += 1;
        continue;
      }
      if (c === '"') {
        closed = true;
        break;
      }
      out += c;
    }
    if (out.trim()) return { answer: out, how: closed ? 'json' : 'truncated_json' };
    return null;
  }

  // 3. No wrapper anywhere. If nothing in it looks like the JSON that was asked
  //    for, it is the prose that was asked for.
  if (!raw.includes('{') && !raw.includes('"answer"')) {
    return { answer: raw, how: 'bare_prose' };
  }
  return null;
}

/**
 * Splits a token stream into visible text and fenced kai_object bodies.
 * Holds back up to (fence marker length - 1) characters so a fence marker split across two
 * deltas is never leaked as text.
 */
export class FenceSplitter {
  private buf = '';
  private inFence = false;
  private fence = '';
  private readonly open: string;

  /**
   * `name` is the fence tag. Round 4 adds a SECOND tag (`chart_command`), and
   * two splitters chain: the object splitter runs first and its `text` output
   * is fed to the chart-command splitter, so a reply can carry one of each and
   * neither marker is ever leaked as visible text.
   */
  constructor(name: string = KAI_OBJECT_FENCE) {
    this.open = '```' + name;
  }

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
        const i = this.buf.indexOf(this.open);
        if (i >= 0) {
          text += this.buf.slice(0, i);
          let rest = this.buf.slice(i + this.open.length);
          if (rest.startsWith('\r\n')) rest = rest.slice(2);
          else if (rest.startsWith('\n')) rest = rest.slice(1);
          this.buf = rest;
          this.inFence = true;
          continue;
        }
        const hold = final ? 0 : this.open.length - 1;
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
  /**
   * Round 4: a chart change the client applies IN PLACE (spec §7). Its payload
   * was resolved server-side from real rows — see lib/kai/chart-commands.ts.
   */
  chartCommand(frame: ChartCommandFrame) {
    this.frame('chart_command', frame);
  }
  /**
   * LIVE-8: a whole answer, directed. One frame rather than a run of loose
   * `chart_command`s, because the actions carry offsets and only arrive as a
   * performance if the client gets them together.
   */
  chartAnswer(frame: ChartAnswerFrame) {
    this.frame('chart_answer', frame);
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

/**
 * THE SYSTEM PROMPT AS PIECES, NOT AS ONE STRING.
 *
 * Caching is a PREFIX match: the provider keys the cache on the exact bytes up
 * to each marker, so one byte that changes early makes everything after it new
 * again. A system prompt handed over as one string can only ever be all-or-
 * nothing. Handed over as an ordered list of blocks, the stable parts can be
 * marked and re-read while the parts that move stay outside the mark.
 *
 * Callers that do not care still pass a plain string and nothing changes.
 */
export type SystemPrompt = string | Anthropic.TextBlockParam[];

/** A system block that is marked as the end of a cacheable stretch. */
export function cached(text: string): Anthropic.TextBlockParam {
  return { type: 'text', text, cache_control: { type: 'ephemeral' } };
}

/**
 * One model turn, streamed.
 *
 * `messages` takes the SDK's own `MessageParam[]` as well as the plain
 * {role, content:string} turns this app has always used, because a conversation
 * that uses TOOLS is no longer a list of strings: the assistant turn carrying a
 * tool call is a list of content blocks, and the reply to it is a list of
 * `tool_result` blocks. Both have to go back on the next request verbatim.
 *
 * `tools` is optional and off by default. Nothing that does not want tools —
 * the briefing job, the recovery classifier, the director — has its behaviour
 * or its bill changed by their existing.
 *
 * `cacheTail` asks the provider to also mark the END of the conversation so
 * far. In a tool loop that is the whole point: the same twelve thousand tokens
 * were being re-read up to five times for one question, and marking the tail
 * turns calls two through five into cache reads at a tenth of the price.
 *
 * `usage` names who is spending. Given it, the row is written when the stream
 * finishes — see `./usage.ts`. Left out, nothing is recorded, which is how the
 * one-off internal calls that predate this stay silent.
 */
export function messageStream(opts: {
  system: SystemPrompt;
  messages: (KaiTurn | Anthropic.MessageParam)[];
  maxTokens?: number;
  tools?: Anthropic.Tool[];
  cacheTail?: boolean;
  usage?: UsageMeta;
  /**
   * Which part of Kai is asking. It picks the model — see ./models.ts — and it
   * is the SAME word the cost ledger groups by, so the setting and the bill
   * cannot drift apart. Callers that record usage already name it there and
   * need not repeat it.
   */
  feature?: UsageFeature;
}) {
  const feature = opts.feature ?? opts.usage?.feature;
  const model = modelFor(feature);
  const startedAt = Date.now();
  const s = anthropic().messages.stream({
    model,
    max_tokens: opts.maxTokens ?? 4000,
    // NOT every model accepts this. Haiku 4.5 rejects it outright and the whole
    // reply fails in under a second — see `supportsEffort` for why the question
    // is asked of the provider rather than of a list of names.
    ...(supportsEffort(model) ? { output_config: { effort: 'low' as const } } : null),
    system: opts.system,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
    ...(opts.tools?.length ? { tools: opts.tools } : null),
    // Top-level marker: the provider puts it on the last block it can, and
    // moves it forward as the conversation grows. Exactly what a tool loop
    // needs, and it costs one of the four markers rather than bookkeeping.
    ...(opts.cacheTail ? { cache_control: { type: 'ephemeral' as const } } : null),
  });
  const meta = opts.usage;
  if (meta) {
    // Fire and forget, and swallow everything. `finalMessage()` is safe to
    // await twice — the caller awaits its own copy — and a failure here must
    // never surface as a failed answer.
    void s
      .finalMessage()
      .then((m) =>
        recordModelUsage({
          meta,
          model: m.model ?? model,
          usage: m.usage,
          durationMs: Date.now() - startedAt,
          stopReason: m.stop_reason ?? null,
        })
      )
      .catch(() => {
        /* the caller reports the failure; there is no usage to record */
      });
  }
  return s;
}

/** Non-streaming completion used by the briefing job. */
export async function completeOnce(opts: {
  system: SystemPrompt;
  messages: KaiTurn[];
  maxTokens?: number;
  cacheTail?: boolean;
  usage?: UsageMeta;
  /** See `messageStream`. Picks the model and names the row in the ledger. */
  feature?: UsageFeature;
}): Promise<string> {
  const feature = opts.feature ?? opts.usage?.feature;
  const model = modelFor(feature);
  const startedAt = Date.now();
  const send = (effort: boolean) =>
    anthropic().messages.create({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      ...(effort ? { output_config: { effort: 'low' as const } } : null),
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(opts.cacheTail ? { cache_control: { type: 'ephemeral' as const } } : null),
    });
  const wantedEffort = supportsEffort(model);
  let res: Anthropic.Message;
  try {
    res = await send(wantedEffort);
  } catch (e) {
    /**
     * THE PROVIDER GETS THE LAST WORD ON WHAT IT ACCEPTS.
     *
     * If the table and the lookup both said this model takes `effort` and the
     * provider says otherwise, the provider is right. Remember it — every later
     * call in this process, streamed ones included, stops sending it — and
     * answer the question that was asked rather than failing it.
     */
    if (wantedEffort && isEffortRejection(e)) {
      noteEffortRejected(model);
      res = await send(false);
    } else {
      throw e;
    }
  }
  if (opts.usage) {
    await recordModelUsage({
      meta: opts.usage,
      model: res.model ?? model,
      usage: res.usage,
      durationMs: Date.now() - startedAt,
      stopReason: res.stop_reason ?? null,
    });
  }
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
