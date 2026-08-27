/**
 * POST /api/v1/kai/conversations/:id/messages  →  SSE
 *
 * Frames: `text_delta` · `object` · `done` · `error`.
 * Persists both turns to `conversation_messages`. Context assembly is
 * profile + risk policy + mode + pinned setups + last 20 turns + the ranked
 * setups for the mode. Kai has no mutating tools in this slice.
 */
import type { NextRequest } from 'next/server';
import {
  PostMessageRequest,
  SETUP_CAPS,
  type AppMode,
  type KaiObjectEnvelope,
  type KaiSheetContext,
} from '@shared/api';
import { requireUser } from '@/lib/auth';
import { serviceClient } from '@/lib/db';
import { ApiError, errorResponse } from '@/lib/errors';
import { log, newRequestId } from '@/lib/log';
import { emitUserEvent } from '@/lib/events';
import { assembleContext, contextNumbers, renderContext } from '@/lib/kai/context';
import { buildSystemPrompt } from '@/lib/kai/system-prompt';
import { SHEET_ACTION_PROTOCOL, loadSheetContext } from '@/lib/kai/sheet-context';
import {
  FenceSplitter,
  SseWriter,
  SSE_HEADERS,
  anthropicConfigured,
  gateAndPersist,
  messageStream,
  completeOnce,
  type KaiTurn,
} from '@/lib/kai/stream';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type ConversationRow = {
  id: string;
  user_id: string;
  mode: AppMode | null;
  context: { pinned?: { setup_ids?: string[] }; sheet?: KaiSheetContext | null } | null;
};

async function nextSeq(conversationId: string): Promise<number> {
  const db = serviceClient();
  const { data } = await db
    .from('conversation_messages')
    .select('seq')
    .eq('conversation_id', conversationId)
    .order('seq', { ascending: false })
    .limit(1);
  const top = data && data.length ? Number((data[0] as Record<string, unknown>).seq) : 0;
  return (Number.isFinite(top) ? top : 0) + 1;
}

export async function POST(req: NextRequest, route: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const user = await requireUser(req);
    const { id: conversationId } = await route.params;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new ApiError('VALIDATION_FAILED', 'We could not read that message. Please try again.');
    }
    const parsed = PostMessageRequest.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_FAILED', 'Type a message for Kai and try again.');
    }

    const db = serviceClient();
    const { data: convData, error: convErr } = await db
      .from('conversations')
      .select('id,user_id,mode,context')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (convErr || !convData) {
      throw new ApiError('NOT_FOUND', 'We could not find that conversation.');
    }
    const conv = convData as unknown as ConversationRow;

    if (!anthropicConfigured()) {
      throw new ApiError('KAI_UNAVAILABLE', 'Kai is offline right now. Your message was not sent.');
    }

    // --- persist the user turn -------------------------------------------
    const userSeq = await nextSeq(conversationId);
    await db.from('conversation_messages').insert({
      conversation_id: conversationId,
      seq: userSeq,
      role: 'user',
      content: { text: parsed.data.content },
    });

    // --- context assembly -------------------------------------------------
    const mode = (conv.mode ?? 'day_trade') as AppMode;
    const pinnedSetupIds = conv.context?.pinned?.setup_ids ?? [];
    const kctx = await assembleContext({
      userId: user.id,
      mode,
      conversationId,
      pinnedSetupIds,
      cap: SETUP_CAPS[mode],
    });

    // The contextual sheet: the object it was opened over is loaded from the
    // database and put in the prompt as facts, so Kai answers about THAT order,
    // position, alert, setup or room rather than about the symbol in general.
    const sheet = await loadSheetContext(user.id, conv.context?.sheet ?? undefined);

    const system = `${buildSystemPrompt({
      displayName: kctx.profile.display_name,
      experience: kctx.profile.experience,
      involvement: kctx.profile.involvement,
      explanationLevel: kctx.profile.explanation_level,
      mode,
    })}${sheet.prompt_block ? `\n\n${SHEET_ACTION_PROTOCOL}` : ''}

CONTEXT (facts you may use — nothing outside this is known to you)
${renderContext(kctx)}${sheet.prompt_block ? `\n\n${sheet.prompt_block}` : ''}`;

    const history: KaiTurn[] = kctx.turns
      .filter((t) => t.seq !== userSeq)
      .map((t) => ({ role: t.role === 'kai' ? ('assistant' as const) : ('user' as const), content: t.content?.text ?? '' }))
      .filter((t) => t.content.length > 0);
    const turns: KaiTurn[] = [...history, { role: 'user', content: parsed.data.content }];
    const allowedNumbers = contextNumbers(kctx);

    // --- stream ------------------------------------------------------------
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const sse = new SseWriter(controller);
        const splitter = new FenceSplitter();
        let narrative = '';
        const emitted: KaiObjectEnvelope[] = [];
        const failedBodies: string[] = [];
        let degraded = false;

        const handleObjects = async (bodies: string[]) => {
          for (const body of bodies) {
            const { envelope, failures } = await gateAndPersist({
              body,
              narrative,
              userId: user.id,
              refs: { conversation_id: conversationId, user_id: user.id, mode },
              allowedNumbers,
              requestId,
            });
            if (envelope) {
              emitted.push(envelope);
              sse.object(envelope);
            } else {
              failedBodies.push(body);
              log('warn', requestId, 'kai.object_dropped', { failures });
            }
          }
        };

        try {
          const ms = messageStream({ system, messages: turns });
          for await (const event of ms) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const { text, objects } = splitter.push(event.delta.text);
              if (text) {
                narrative += text;
                sse.textDelta(text);
              }
              if (objects.length) await handleObjects(objects);
            }
          }
          const tail = splitter.flush();
          if (tail.text) {
            narrative += tail.text;
            sse.textDelta(tail.text);
          }
          if (tail.objects.length) await handleObjects(tail.objects);

          // One regeneration attempt for a dropped object, then give up (03 Unit 3).
          if (failedBodies.length && emitted.length === 0) {
            try {
              const retry = await completeOnce({
                system,
                messages: [
                  ...turns,
                  { role: 'assistant', content: narrative || '(object only)' },
                  {
                    role: 'user',
                    content: `Your structured object was rejected because it contradicted itself or did not match the required shape. Send ONLY a corrected \`\`\`kai_object block — no prose. Every number must come from the CONTEXT and must be consistent with the narrative you just wrote.`,
                  },
                ],
                maxTokens: 1500,
              });
              const rs = new FenceSplitter();
              const first = rs.push(retry);
              const rest = rs.flush();
              const bodies = [...first.objects, ...rest.objects];
              if (bodies.length) await handleObjectsRetry(bodies);
              else log('warn', requestId, 'kai.object_regenerate_empty', {});
            } catch (e) {
              log('warn', requestId, 'kai.object_regenerate_failed', {
                message: e instanceof Error ? e.message : String(e),
              });
            }
          }

          async function handleObjectsRetry(bodies: string[]) {
            for (const body of bodies) {
              const { envelope, failures } = await gateAndPersist({
                body,
                narrative,
                userId: user.id,
                refs: { conversation_id: conversationId, user_id: user.id, mode, regenerated: true },
                allowedNumbers,
                requestId,
              });
              if (envelope) {
                emitted.push(envelope);
                sse.object(envelope);
              } else {
                log('warn', requestId, 'kai.object_dropped_after_regenerate', { failures });
              }
            }
          }
        } catch (e) {
          degraded = true;
          log('error', requestId, 'kai.stream_failed', { message: e instanceof Error ? e.message : String(e) });
          sse.error('KAI_UNAVAILABLE', 'Kai stopped mid-answer. Nothing was acted on — try asking again.');
        }

        // --- persist the Kai turn -------------------------------------------
        let kaiMessageId = '';
        let kaiSeq = userSeq + 1;
        try {
          kaiSeq = await nextSeq(conversationId);
          const { data } = await db
            .from('conversation_messages')
            .insert({
              conversation_id: conversationId,
              seq: kaiSeq,
              role: 'kai',
              content: {
                text: narrative,
                object_ids: emitted.map((o) => o.id),
                model: emitted[0]?.model ?? undefined,
              },
            })
            .select('id')
            .single();
          kaiMessageId = data ? String((data as Record<string, unknown>).id) : '';
        } catch (e) {
          log('error', requestId, 'kai.persist_turn_failed', {
            message: e instanceof Error ? e.message : String(e),
          });
        }

        if (emitted.length) {
          await emitUserEvent(
            user.id,
            'kai_result',
            'conversation',
            conversationId,
            { object_ids: emitted.map((o) => o.id), types: emitted.map((o) => o.type) },
            requestId
          );
        }

        sse.done({ conversation_id: conversationId, message_id: kaiMessageId, seq: kaiSeq, degraded });
        sse.close();
      },
    });

    return new Response(stream, { headers: { ...SSE_HEADERS, 'x-request-id': requestId } });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('INTERNAL', 'Something went wrong on our side. Please try again.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'kai.request_error', { code: err.code, message: err.message });
    return errorResponse(err, requestId);
  }
}
