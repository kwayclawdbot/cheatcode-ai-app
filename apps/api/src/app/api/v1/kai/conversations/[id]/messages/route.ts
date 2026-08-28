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
  type ChartCommandFrame,
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
  CHART_COMMAND_FENCE,
  FenceSplitter,
  SseWriter,
  SSE_HEADERS,
  anthropicConfigured,
  gateAndPersist,
  messageStream,
  completeOnce,
  type KaiTurn,
} from '@/lib/kai/stream';
import {
  ChartCommandRequest,
  CHART_LEVEL_KEYS,
  chartCommandProtocol,
  executeChartCommand,
  type ChartContext,
} from '@/lib/kai/chart-commands';
import { containsGlossaryNote, experienceOf, termsUsed, voicePromptBlock } from '@/lib/kai/voice';
import { autoTitle, touchConversation } from '@/lib/round4/conversations';
import { loadChartContext } from '@/lib/round4/chart-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type ConversationRow = {
  id: string;
  user_id: string;
  mode: AppMode | null;
  context: {
    pinned?: { setup_ids?: string[] };
    sheet?: KaiSheetContext | null;
    /** Round 4: set by the Trade Portal. Chart commands resolve against it. */
    chart?: {
      symbol?: string;
      timeframe?: string;
      setup_id?: string | null;
      alert_id?: string | null;
      plan_id?: string | null;
      trigger_ts?: string | null;
    } | null;
    /** Glossary terms already spent, so a definition is given once (voice.ts). */
    explained?: string[];
  } | null;
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

    // Round 4. Two additions to the prompt, both about HOW Kai talks and what
    // it may touch, never about what it may claim:
    //   voice   — new / some / pro, with the glossary for `new` and the terms
    //             already spent in this conversation so a definition is given
    //             once and then the word is used plainly (spec + prototype).
    //   chart   — when this conversation is attached to a chart, the list of
    //             commands and the hard rule that Kai names a LEVEL and the
    //             server resolves the number.
    const experience = experienceOf(
      (kctx.profile.onboarding as Record<string, unknown>)?.experience ?? kctx.profile.experience
    );
    const alreadyExplained = Array.isArray(conv.context?.explained) ? (conv.context?.explained as string[]) : [];
    const chartCtx = await loadChartContext(user.id, conv.context?.chart ?? null);

    const system = `${buildSystemPrompt({
      displayName: kctx.profile.display_name,
      experience: kctx.profile.experience,
      involvement: kctx.profile.involvement,
      explanationLevel: kctx.profile.explanation_level,
      mode,
    })}${sheet.prompt_block ? `\n\n${SHEET_ACTION_PROTOCOL}` : ''}

${voicePromptBlock(experience, alreadyExplained)}${
      chartCtx
        ? `\n\n${chartCommandProtocol({
            symbol: chartCtx.symbol,
            timeframe: chartCtx.timeframe,
            available: [...CHART_LEVEL_KEYS],
          })}`
        : ''
    }

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
        // A SECOND fence, for chart commands. It runs on the text the object
        // splitter already cleared, so one reply can carry both and neither
        // marker is ever leaked to the user as visible text.
        const chartSplitter = new FenceSplitter(CHART_COMMAND_FENCE);
        let narrative = '';
        const emitted: KaiObjectEnvelope[] = [];
        const chartFrames: ChartCommandFrame[] = [];
        const failedBodies: string[] = [];
        let degraded = false;

        /**
         * Resolve one command body against the real objects and emit it. A body
         * that names a level nothing in the context defines produces NOTHING —
         * the chart is left alone rather than drawn on with a guess.
         */
        const handleChartCommands = async (bodies: string[]) => {
          if (!chartCtx) return;
          for (const body of bodies) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(body.trim());
            } catch {
              log('warn', requestId, 'chart_command.bad_json', {});
              continue;
            }
            const req_ = ChartCommandRequest.safeParse(parsed);
            if (!req_.success) {
              log('warn', requestId, 'chart_command.shape_failed', {
                issues: req_.error.issues.map((i) => i.path.join('.')),
              });
              continue;
            }
            const frame = await executeChartCommand(chartCtx, req_.data, requestId);
            if (frame) {
              chartFrames.push(frame);
              sse.chartCommand(frame);
            } else {
              log('warn', requestId, 'chart_command.unresolved', { command: req_.data.command });
            }
          }
        };

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
              const chart = chartSplitter.push(text);
              if (chart.text) {
                narrative += chart.text;
                sse.textDelta(chart.text);
              }
              if (objects.length) await handleObjects(objects);
              if (chart.objects.length) await handleChartCommands(chart.objects);
            }
          }
          const tail = splitter.flush();
          const chartTail = chartSplitter.push(tail.text);
          const chartFlush = chartSplitter.flush();
          const trailing = chartTail.text + chartFlush.text;
          if (trailing) {
            narrative += trailing;
            sse.textDelta(trailing);
          }
          if (tail.objects.length) await handleObjects(tail.objects);
          const trailingCommands = [...chartTail.objects, ...chartFlush.objects];
          if (trailingCommands.length) await handleChartCommands(trailingCommands);

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

        // --- one recovery pass for a missed chart change ---------------------
        // The user asked for the chart to change, the model answered in prose
        // and forgot the block. Rather than a keyword matcher in front of the
        // model, this is a SECOND, cheap model call BEHIND it: given the same
        // command list, decide whether that turn was a chart request and which
        // command it was. It still cannot produce a price — the payload is
        // resolved from the same real objects — so the worst case is that
        // nothing is drawn.
        if (chartCtx && chartFrames.length === 0 && !degraded) {
          try {
            const out = await completeOnce({
              system: `You classify one turn of a conversation that is happening under a live ${chartCtx.symbol} chart.
Answer with ONE line of JSON and nothing else.
If the person asked for the chart to change, answer {"command":"<name>","args":{...}}.
If they did not, answer {"command":"none"}.
Commands: mark_level (args.level one of ${[...CHART_LEVEL_KEYS].join(', ')}) · set_timeframe (args.timeframe one of 1m,5m,15m,1h,4h,1d) · show_invalidation · mark_plan · zoom_trigger · compare_prior · highlight_community · alert_from_level (args.level) · prepare_trade.
Never include a price. Never invent a command they did not ask for.`,
              messages: [
                { role: 'user', content: `Person: ${parsed.data.content}\n\nKai answered: ${narrative.slice(0, 600)}` },
              ],
              maxTokens: 120,
            });
            const match = out.match(/\{[\s\S]*\}/);
            if (match) {
              const candidate = JSON.parse(match[0]) as { command?: string };
              if (candidate.command && candidate.command !== 'none') {
                const req_ = ChartCommandRequest.safeParse(candidate);
                if (req_.success) {
                  const frame = await executeChartCommand(chartCtx, req_.data, requestId);
                  if (frame) {
                    chartFrames.push(frame);
                    sse.chartCommand(frame);
                    // The chart changed, so it is narrated (spec §8). Nothing
                    // moves silently.
                    narrative += `\n\n${frame.narration}`;
                    sse.textDelta(`\n\n${frame.narration}`);
                  }
                }
              }
            }
          } catch (e) {
            log('warn', requestId, 'chart_command.recovery_failed', {
              message: e instanceof Error ? e.message : String(e),
            });
          }
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
        if (chartFrames.length) {
          await emitUserEvent(
            user.id,
            'kai_result',
            'conversation',
            conversationId,
            {
              event: 'chart_command',
              commands: chartFrames.map((f) => f.command),
              annotation_ids: chartFrames.flatMap((f) => f.annotations.map((a) => a.id)),
            },
            requestId
          );
        }

        // --- glossary memory + auto-title ------------------------------------
        // FIRST USE means first use across the whole conversation, so the terms
        // this reply actually explained are remembered on the row. Without this
        // a beginner is re-taught "volume" in every single answer.
        try {
          if (experience === 'new' && containsGlossaryNote(narrative)) {
            const spent = [...new Set([...alreadyExplained, ...termsUsed(narrative)])];
            await db
              .from('conversations')
              .update({ context: { ...(conv.context ?? {}), explained: spent } })
              .eq('id', conversationId)
              .eq('user_id', user.id);
          }
          await touchConversation(conversationId);
          // Two turns in means the conversation now has a subject worth naming.
          if (userSeq <= 1 && narrative.trim()) {
            await autoTitle({
              userId: user.id,
              conversationId,
              firstUserText: parsed.data.content,
              firstKaiText: narrative,
              requestId,
            });
          }
        } catch (e) {
          log('warn', requestId, 'conversation.post_turn_failed', {
            message: e instanceof Error ? e.message : String(e),
          });
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
