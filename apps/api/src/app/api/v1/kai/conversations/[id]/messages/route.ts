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
  type ChartAnswerFrame,
  type ChartCommandFrame,
  type KaiObjectEnvelope,
  type KaiSheetContext,
} from '@shared/api';
import { requireUser } from '@/lib/auth';
import { serviceClient } from '@/lib/db';
import { ApiError, errorResponse } from '@/lib/errors';
import { log, newRequestId } from '@/lib/log';
import { emitUserEvent } from '@/lib/events';
import { assembleContext, contextNumbers, renderContext, renderMarketLine } from '@/lib/kai/context';
import { buildSystemPrompt } from '@/lib/kai/system-prompt';
import { SHEET_ACTION_PROTOCOL, loadSheetContext } from '@/lib/kai/sheet-context';
import {
  CHART_ANSWER_FENCE,
  readChartAnswer,
  CHART_COMMAND_FENCE,
  FenceSplitter,
  SseWriter,
  SSE_HEADERS,
  anthropicConfigured,
  cached,
  gateAndPersist,
  messageStream,
  completeOnce,
  type KaiTurn,
} from '@/lib/kai/stream';
import {
  ChartCommandRequest,
  availableDrawings,
  availableLevels,
  chartAnswerProtocol,
  chartCommandProtocol,
  executeChartCommand,
  type ChartContext,
} from '@/lib/kai/chart-commands';
import { containsGlossaryNote, experienceOf, termsUsed, voicePromptBlock } from '@/lib/kai/voice';
import { autoTitle, touchConversation } from '@/lib/round4/conversations';
import { loadChartContext } from '@/lib/round4/chart-context';
import { answerOnChart, levelTableFor } from '@/lib/kai/chart-answer';
import { KAI_TOOLS, TOOL_PROTOCOL, runKaiTool } from '@/lib/kai/tools';
import { chargeQuestion, creditBlock, creditState } from '@/lib/kai/credits';
import type Anthropic from '@anthropic-ai/sdk';

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

    /**
     * --- THE CREDIT CHECK ------------------------------------------------
     *
     * BEFORE the model runs, and at the ROUTE rather than inside the call,
     * because ONE QUESTION IS ONE CHARGE and one question makes up to five
     * model calls. See lib/kai/credits.ts for the whole rule set; the two that
     * matter here are that it fails OPEN — a credit system that cannot be read
     * lets the message through and shouts in the log — and that the charge
     * happens after the answer, never before.
     */
    const credits = await creditState(user.id, requestId);

    // --- persist the user turn -------------------------------------------
    // The question is written down even when there are no credits for it. It
    // was asked; a conversation that silently drops what someone typed reads
    // like the app lost it.
    const userSeq = await nextSeq(conversationId);
    await db.from('conversation_messages').insert({
      conversation_id: conversationId,
      seq: userSeq,
      role: 'user',
      content: { text: parsed.data.content },
    });

    /**
     * OUT OF CREDITS IS SOMETHING KAI SAYS, NOT AN ERROR THE APP CATCHES.
     *
     * It comes back as a normal stream carrying a normal Kai turn, in his own
     * voice, saying which limit it was and what to do about it — so it lands in
     * the conversation like any other answer instead of as a toast over the top
     * of one. The two reasons are DIFFERENT SENTENCES on purpose: "come back
     * tomorrow" and "this month has cost more than the plan covers" ask
     * different things of the person.
     *
     * No model call is made, so this costs nothing to serve.
     */
    if (credits.verdict !== 'allow' && credits.refusal_plain) {
      const plain = credits.refusal_plain;
      const blockedSeq = userSeq + 1;
      await db.from('conversation_messages').insert({
        conversation_id: conversationId,
        seq: blockedSeq,
        role: 'kai',
        content: { text: plain, blocked: credits.verdict },
      });
      log('info', requestId, 'credits.blocked', {
        user_id: user.id,
        plan: credits.plan.key,
        reason: credits.verdict,
        available: credits.available,
        spent_usd: credits.spent_usd,
      });
      const blockedStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const sse = new SseWriter(controller);
          sse.textDelta(plain);
          sse.frame('credits', { type: 'credits', credits: creditBlock(credits) });
          sse.done({ conversation_id: conversationId, message_id: '', seq: blockedSeq, degraded: false });
          sse.close();
        },
      });
      return new Response(blockedStream, { headers: { ...SSE_HEADERS, 'x-request-id': requestId } });
    }

    // --- context assembly -------------------------------------------------
    const mode = (conv.mode ?? 'day_trade') as AppMode;

    /**
     * THE CHART IS LOADED FIRST, because what is on it decides what goes into
     * the context.
     *
     * `rankedSetups` gives Kai the top few setups in the current mode. The chart
     * the user has open is not chosen that way — they navigated to it. So a
     * setup that exists but ranks below the cap used to be absent from the
     * prompt while its own chart was on screen, and Kai answered "I have no
     * graded setup on it" about a setup he demonstrably had. Pinning it is the
     * fix and is also what pinning MEANS: this is the one they are looking at,
     * talk about it first.
     */
    const chartCtx = await loadChartContext(user.id, conv.context?.chart ?? null);

    const pinnedSetupIds: string[] = [...(conv.context?.pinned?.setup_ids ?? [])];
    if (chartCtx?.setup?.id && !pinnedSetupIds.includes(chartCtx.setup.id)) {
      pinnedSetupIds.push(chartCtx.setup.id);
    }

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

    /**
     * WHICH LEVELS THIS CHART ACTUALLY HAS.
     *
     * The protocol blocks used to advertise the whole vocabulary — all ten level
     * names — on every chart, regardless of what resolved. On a ticker with no
     * setup that is eight names Kai can say and nothing will be drawn for: the
     * commands come back unresolved and dropped, so the chart sits still while
     * he narrates marking things. Telling him what is really there costs one
     * function call and is the difference between a silent failure and an honest
     * answer about support and resistance.
     */
    /**
     * TWO LISTS, BECAUSE THE TWO PATHS CAN DRAW DIFFERENT THINGS.
     *
     * `chartLevels` is everything `resolveLevel` answers to on this chart — the
     * setup levels when there is a setup, plus every level computed off the
     * stored bars, which exist whether there is a setup or not. That is what a
     * chart_command may name.
     *
     * `answerLevels` is the subset the DIRECTOR may cue in an answer, which is
     * narrower by construction: its marker grammar is a closed vocabulary and it
     * only accepts kinds that name a level. Telling the model the command list
     * when it is writing an answer would advertise names its markers cannot
     * carry, and the cue would be dropped after the sentence was already written
     * around it.
     */
    const chartLevels = chartCtx ? availableLevels(chartCtx) : [];
    const chartDrawings = chartCtx ? availableDrawings(chartCtx) : [];
    const answerLevels = chartCtx ? [...levelTableFor(chartCtx).keys()] : [];
    const chartOnScreen = chartCtx
      ? { symbol: chartCtx.symbol, timeframe: chartCtx.timeframe, levels: chartLevels }
      : null;

    /**
     * THE PROMPT, ORDERED BY HOW OFTEN EACH PART CHANGES.
     *
     * WHY THE ORDER IS NOW THE POINT. The provider caches a prompt by its
     * bytes, from the front, up to each marker. One byte that differs early
     * makes every byte after it new again — so the ONLY layout that gets any
     * money back is: what never changes first, what changes daily next, what
     * changes every single request last.
     *
     * Before this, the whole thing was one string with a fresh timestamp
     * buried in the middle of it, which meant nothing was ever re-used. About
     * nine thousand of the twelve thousand tokens sent per call were the same
     * nine thousand as last time, and every one of them was paid for at full
     * price — up to five times over for a single question, because a question
     * that uses a tool sends the whole prompt again on each round trip.
     *
     * Three blocks, three markers, in this order:
     *
     *   1. WHO KAI IS AND WHO HE IS TALKING TO. Changes when this person
     *      changes their settings. Effectively never.
     *   2. HOW HE MAY ACT — the tool protocol, the voice register, the sheet
     *      and chart command vocabularies. Changes when they open a different
     *      chart, or the first time a beginner is taught a word.
     *   3. THE FACTS — risk policy, account, the ranked setups. Changes when
     *      the scanner publishes, which is a few times a day.
     *
     * The market timestamp is deliberately NOT here. It moves every request,
     * so it goes at the end of the conversation instead (see `marketLine`
     * below), where it invalidates nothing.
     *
     * The tool definitions are rendered by the provider BEFORE any of this, so
     * the marker on block 1 covers them too.
     */
    const systemIdentity = buildSystemPrompt({
      displayName: kctx.profile.display_name,
      experience: kctx.profile.experience,
      involvement: kctx.profile.involvement,
      explanationLevel: kctx.profile.explanation_level,
      mode,
    });

    const systemProtocols = [
      sheet.prompt_block ? SHEET_ACTION_PROTOCOL : null,
      voicePromptBlock(experience, alreadyExplained),
      TOOL_PROTOCOL,
      chartCtx
        ? chartCommandProtocol({
            symbol: chartCtx.symbol,
            timeframe: chartCtx.timeframe,
            available: chartLevels,
            drawings: chartDrawings,
          })
        : null,
      chartCtx
        ? chartAnswerProtocol({
            symbol: chartCtx.symbol,
            timeframe: chartCtx.timeframe,
            available: answerLevels,
          })
        : null,
    ]
      .filter((s): s is string => Boolean(s))
      .join('\n\n');

    const systemFacts = `CONTEXT (facts you may use — nothing outside this is known to you)
${renderContext(kctx, chartOnScreen, { market: false })}${sheet.prompt_block ? `\n\n${sheet.prompt_block}` : ''}`;

    const system = [cached(systemIdentity), cached(systemProtocols), cached(systemFacts)];

    /**
     * The one fact that is different every time, sent last.
     *
     * It is attached to the user's own turn rather than to the system prompt
     * because that is the only place a value that moves can sit without
     * throwing away everything cached in front of it.
     */
    const marketLine = `${renderMarketLine(kctx)}\nUse this as the current market state and time when you answer.`;

    const history: KaiTurn[] = kctx.turns
      .filter((t) => t.seq !== userSeq)
      .map((t) => ({ role: t.role === 'kai' ? ('assistant' as const) : ('user' as const), content: t.content?.text ?? '' }))
      .filter((t) => t.content.length > 0);
    const turns: KaiTurn[] = [
      ...history,
      { role: 'user', content: `${parsed.data.content}\n\n${marketLine}` },
    ];
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
        // A THIRD fence (LIVE-8), for a whole answer rather than one action. It
        // runs on the text the other two have already cleared, so a reply can
        // carry any of the three and no marker is ever leaked as visible text.
        const answerSplitter = new FenceSplitter(CHART_ANSWER_FENCE);
        let narrative = '';
        const emitted: KaiObjectEnvelope[] = [];
        const chartFrames: ChartCommandFrame[] = [];
        const chartAnswers: ChartAnswerFrame[] = [];
        const answerBodies: string[] = [];
        const failedBodies: string[] = [];
        let degraded = false;
        /**
         * WHY THIS TURN HAS NO ANSWER IN IT.
         *
         * THE BUG THIS EXISTS TO KILL: when the model call threw, this handler
         * logged the exception, sent one generic error frame, and then went on
         * to write the Kai turn with `text: ''` and `object_ids: []` — a row
         * that is indistinguishable from an answer that happened to be empty.
         * On the hosted database EVERY Kai reply written on 4-5 September is
         * that stub, each one persisted under a second after the question,
         * because the deployed Anthropic key answers `401 authentication_error`
         * and every call fails instantly.
         *
         * From the outside that is two complaints and one fault: "Kai stopped
         * replying after the morning message" (empty text) and "the chart moves
         * but nothing happens" (no annotations were ever created, while the
         * camera work the client does on its own still runs).
         *
         * So a turn with nothing in it is now written with the REASON in it,
         * in Kai's own plain words, and the row is stamped `failed` so the
         * client never mistakes it for an answer. Silence is not an answer.
         */
        let failurePlain: string | null = null;

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

        /**
         * A whole answer, directed (LIVE-8).
         *
         * The model wrote prose and nothing else; everything visual about the
         * reply is decided here — which levels get drawn, where the camera goes,
         * and when each gesture fires relative to the words. `answerOnChart`
         * never throws and an answer that resolves to nothing still produces its
         * prose, so the worst case is a reply the chart did not illustrate.
         *
         * THE PROSE IS THE REPLY. It is pushed into `narrative` and streamed as
         * text, so the user reads the same words the chart is performing and the
         * persisted turn is the answer they actually got.
         */
        const handleChartAnswer = async (bodies: string[]) => {
          if (!chartCtx) return;
          for (const body of bodies) {
            // The prose is read out of the block even when the model wrote the
            // words and forgot the JSON around them — see `readChartAnswer`.
            // A complete answer used to be binned over its punctuation and the
            // user was told "I came back with nothing that time".
            const read = readChartAnswer(body);
            if (!read) {
              log('warn', requestId, 'chart_answer.bad_json', {});
              continue;
            }
            if (read.how !== 'json') {
              log('warn', requestId, 'chart_answer.salvaged', { how: read.how });
            }
            const answer = read.answer;

            const directed = await answerOnChart(chartCtx, { answer, requestId });
            if (!directed.spoken) continue;

            const frame: ChartAnswerFrame = {
              type: 'chart_answer',
              symbol: chartCtx.symbol,
              timeframe: chartCtx.timeframe,
              spoken: directed.spoken,
              duration_ms: directed.duration_ms,
              audio_url: directed.audio_url,
              audio_state: directed.audio_state,
              actions: directed.actions,
            };
            chartAnswers.push(frame);
            sse.chartAnswer(frame);
            // The prose is NOT also sent as `text_delta`. The frame carries it,
            // and the client renders it there — streaming it twice would print
            // the answer twice under a chart that only performed it once. It is
            // still appended to `narrative`, which is what gets persisted, so
            // the turn the user comes back to is the answer they were given.
            narrative += `${narrative.trim() ? '\n\n' : ''}${directed.spoken}`;
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
          /**
           * THE TOOL LOOP.
           *
           * Kai used to get exactly one model turn, and his whole world was the
           * string assembled above — the user's profile, their risk policy, a
           * handful of ranked scanner rows and a market block that says only
           * whether the market is open. NO PRICES. Ask him about a ticker the
           * scanner had no opinion about and he had, truthfully, nothing to say,
           * which is what the owner saw: *"kai is not connected to any live
           * polygon data."* Polygon was live in the same process the whole time.
           *
           * So he now gets tools and therefore gets more than one turn: he asks
           * for a price or a chart's levels, the server goes and gets them from
           * the same code the rest of the app uses, and the loop runs again with
           * the answer in hand. It ends when he stops asking.
           *
           * THE SPLITTERS SPAN THE WHOLE LOOP, not one turn. They are declared
           * outside it and only flushed after it, so a fenced block that begins
           * in one turn and finishes in the next is still one block. Flushing per
           * turn would cut a chart answer in half.
           *
           * `MAX_TOOL_TURNS` is a stop, not a target. Tools cost a round trip
           * each and a model that keeps looking things up is a model that has
           * stopped answering; the cap ends the loop and the reply is whatever
           * he has said by then, which is still an answer.
           */
          const MAX_TOOL_TURNS = 4;
          const convo: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));

          for (let turn = 0; turn <= MAX_TOOL_TURNS; turn += 1) {
            const ms = messageStream({
              system,
              messages: convo,
              // The last permitted turn runs WITHOUT tools, so it cannot end on
              // another request to look something up that nothing will answer.
              tools: turn < MAX_TOOL_TURNS ? KAI_TOOLS : undefined,
              // Mark the end of the conversation as well as the three system
              // blocks. This is what makes the second and later round trips of
              // one question cheap: everything said so far — including the tool
              // results just handed back — is re-read from cache instead of
              // being re-sent at full price.
              cacheTail: true,
              usage: {
                feature: 'chat',
                requestId,
                userId: user.id,
                conversationId,
                turnIndex: turn,
              },
            });
            for await (const event of ms) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                const { text, objects } = splitter.push(event.delta.text);
                const chart = chartSplitter.push(text);
                const ans = answerSplitter.push(chart.text);
                if (ans.text) {
                  narrative += ans.text;
                  sse.textDelta(ans.text);
                }
                if (objects.length) await handleObjects(objects);
                if (chart.objects.length) await handleChartCommands(chart.objects);
                // Directed at the flush, not here: an answer is one performance
                // and the whole body has to be in hand before it can be timed.
                if (ans.objects.length) answerBodies.push(...ans.objects);
              }
            }

            const finished = await ms.finalMessage();
            if (finished.stop_reason !== 'tool_use') break;

            const calls = finished.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
            );
            if (!calls.length) break;

            // The assistant turn goes back UNCHANGED — the tool_use blocks in it
            // are what each result is answering.
            convo.push({ role: 'assistant', content: finished.content });
            const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
              calls.map(async (c) => ({
                type: 'tool_result' as const,
                tool_use_id: c.id,
                content: JSON.stringify(
                  await runKaiTool(c.name, (c.input ?? {}) as Record<string, unknown>, {
                    userId: user.id, mode, requestId,
                  }),
                ),
              })),
            );
            // EVERY result in ONE user message. Splitting them across messages
            // silently teaches the model to stop asking for things in parallel.
            convo.push({ role: 'user', content: results });
          }
          const tail = splitter.flush();
          const chartTail = chartSplitter.push(tail.text);
          const chartFlush = chartSplitter.flush();
          const answerTail = answerSplitter.push(chartTail.text + chartFlush.text);
          const answerFlush = answerSplitter.flush();
          const trailing = answerTail.text + answerFlush.text;
          if (trailing) {
            narrative += trailing;
            sse.textDelta(trailing);
          }
          if (tail.objects.length) await handleObjects(tail.objects);
          const trailingCommands = [...chartTail.objects, ...chartFlush.objects];
          if (trailingCommands.length) await handleChartCommands(trailingCommands);
          answerBodies.push(...answerTail.objects, ...answerFlush.objects);
          if (answerBodies.length) await handleChartAnswer(answerBodies);

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
                // The SAME system blocks the loop just used, so this second
                // call reads all three of them back from cache rather than
                // paying for nine thousand tokens twice.
                usage: { feature: 'chat_object_retry', requestId, userId: user.id, conversationId },
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
          const detail = e instanceof Error ? e.message : String(e);
          log('error', requestId, 'kai.stream_failed', { message: detail });
          /**
           * THE REASON IS NAMED, THE CREDENTIAL IS NOT.
           *
           * A failure the owner cannot act on is a failure he will report as
           * "it just does nothing". The one distinction worth drawing on screen
           * is between "my side is misconfigured, this will not fix itself" and
           * "that was a blip, try again" — so a sign-in rejection from the model
           * provider says so in plain words. The key, the provider and the
           * status code stay in the server log where they belong.
           */
          failurePlain = /\b401\b|authentication_error|invalid x-api-key|API key/i.test(detail)
            ? 'I could not sign in to the service I think with, so I have not answered. That is a setting on my side, not something you did — it needs fixing before I can read a chart or mark anything on it.'
            : narrative.trim()
              ? 'I stopped part way through that answer. Nothing was drawn on the chart and nothing was acted on.'
              : 'Something went wrong on my side and I could not answer at all. Nothing was drawn on the chart and nothing was acted on.';
          sse.error('KAI_UNAVAILABLE', failurePlain);
        }

        /**
         * A REPLY WITH NOTHING IN IT IS ALSO A FAILURE, and it used to be a
         * silent one — no error frame, no text, and a stub row. The user asked
         * a question and got a blank screen back with no explanation either way.
         */
        if (!failurePlain && !narrative.trim() && !emitted.length && !chartFrames.length && !chartAnswers.length) {
          degraded = true;
          failurePlain = 'I came back with nothing that time — no words and nothing to put on the chart. Ask me again, or ask it a different way.';
          log('warn', requestId, 'kai.empty_answer', { symbol: chartCtx?.symbol ?? null });
          sse.error('KAI_EMPTY', failurePlain);
        }

        // --- one recovery pass for a missed chart change ---------------------
        // The user asked for the chart to change, the model answered in prose
        // and forgot the block. Rather than a keyword matcher in front of the
        // model, this is a SECOND, cheap model call BEHIND it: given the same
        // command list, decide whether that turn was a chart request and which
        // command it was. It still cannot produce a price — the payload is
        // resolved from the same real objects — so the worst case is that
        // nothing is drawn.
        // An answer that produced no action is not a missed chart request — the
        // director already read that turn and decided the chart had nothing to
        // show. Running the recovery classifier behind it would draw a level
        // nobody asked about, on top of the answer.
        if (chartCtx && chartFrames.length === 0 && chartAnswers.length === 0 && !degraded) {
          try {
            const out = await completeOnce({
              system: `You classify one turn of a conversation that is happening under a live ${chartCtx.symbol} chart.
Answer with ONE line of JSON and nothing else.
If the person asked for the chart to change, answer {"command":"<name>","args":{...}}.
If they did not, answer {"command":"none"}.
Commands: mark_level (args.level one of ${chartLevels.join(', ') || 'none — this chart has no level that resolves'}) · set_timeframe (args.timeframe one of 1m,5m,15m,1h,4h,1d) · show_invalidation · mark_plan · zoom_trigger (args.level) · compare_prior · highlight_community · alert_from_level (args.level) · prepare_trade${
              chartDrawings.length ? ` · mark_level with args.shape one of ${chartDrawings.join(', ')}` : ''
            }.
Never include a price. Never invent a command they did not ask for.`,
              messages: [
                { role: 'user', content: `Person: ${parsed.data.content}\n\nKai answered: ${narrative.slice(0, 600)}` },
              ],
              maxTokens: 120,
              usage: {
                feature: 'chat_command_recovery',
                requestId,
                userId: user.id,
                conversationId,
              },
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
                // `narrative || failurePlain` and never `''`. A turn the user
                // comes back to must say what happened, and a blank one says
                // nothing at all — see `failurePlain` above.
                text: narrative.trim() ? narrative : (failurePlain ?? ''),
                object_ids: emitted.map((o) => o.id),
                model: emitted[0]?.model ?? undefined,
                // Stamped so the history renders it as a problem rather than as
                // something Kai decided to say.
                ...(narrative.trim() ? null : failurePlain ? { failed: true } : null),
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

        /**
         * --- THE CHARGE ------------------------------------------------
         *
         * AFTER the answer, so nothing here can take it away — the person has
         * already read it. The cost comes from the rows `usage.ts` wrote for
         * THIS request id, so a question that made four model calls is one
         * charge computed from all four.
         *
         * AN ANSWER THAT FAILED IS NOT CHARGED FOR. `degraded` is set when the
         * stream broke or came back with nothing at all; the model calls behind
         * it still cost real money, and that is exactly what the plan's dollar
         * ceiling is there to catch. Billing someone a credit for a blank reply
         * is not.
         */
        const delivered = Boolean(narrative.trim()) || emitted.length > 0
          || chartFrames.length > 0 || chartAnswers.length > 0;
        if (delivered) {
          await chargeQuestion({ userId: user.id, state: credits, requestId, conversationId });
        } else {
          log('info', requestId, 'credits.not_charged', { user_id: user.id, reason: 'nothing_delivered' });
        }

        /**
         * The balance goes out with the reply so the strip above the composer
         * is right the moment the answer lands, without a second round trip.
         * It is re-read rather than adjusted in memory: the charge is the only
         * thing that knows what the question actually came to.
         */
        try {
          sse.frame('credits', { type: 'credits', credits: creditBlock(await creditState(user.id, requestId)) });
        } catch {
          /* the balance strip can wait for the next read; the answer cannot */
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
