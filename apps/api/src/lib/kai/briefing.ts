/**
 * Morning briefing — one per user per market day.
 *
 * Cached in `kai_objects` with refs {user_id, market_date}. Anthropic failure
 * returns null and the caller sets `degraded:true` — Home never shows a fake
 * briefing (BUILD-BRIEF, "Data + API subset").
 */
import { BriefingPayload, type AppMode, type KaiObjectEnvelope } from '@shared/api';
import { log } from '../log';
import { marketBlock, marketDate } from '../market';
import { buildSystemPrompt } from './system-prompt';
import { completeOnce, anthropicConfigured, parseFenced } from './stream';
import { findCachedObject, persistKaiObject } from './objects';
import { renderContext, type KaiContext } from './context';

export type BriefingResult = {
  briefing: KaiObjectEnvelope | null;
  degraded: boolean;
  reason: string | null;
};

export async function getOrCreateBriefing(
  ctx: KaiContext,
  mode: AppMode,
  requestId: string
): Promise<BriefingResult> {
  const market_date = marketDate();
  const refs = { user_id: ctx.profile.user_id, market_date };

  try {
    const cached = await findCachedObject('briefing', refs);
    if (cached) return { briefing: cached, degraded: false, reason: null };
  } catch (e) {
    log('warn', requestId, 'briefing.cache_lookup_failed', {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (!anthropicConfigured()) {
    return { briefing: null, degraded: true, reason: 'Kai is offline right now.' };
  }

  const system = buildSystemPrompt({
    displayName: ctx.profile.display_name,
    experience: ctx.profile.experience,
    involvement: ctx.profile.involvement,
    explanationLevel: ctx.profile.explanation_level,
    mode,
  });

  const mb = marketBlock();
  const instruction = `Write this user's morning report for ${market_date}.

CONTEXT
${renderContext(ctx)}

Return ONLY a fenced kai_object block, no prose around it:

\`\`\`kai_object
{ "type": "briefing", "payload": {
  "market_date": "${market_date}",
  "headline": "one sentence, first person, no hype — e.g. 'Here's your market report — one setup is worth your attention.'",
  "lines": [ { "text": "...", "emphasis": "neutral|attention|risk|positive", "ref": null } ],   // ref is null, or an object like {"symbol":"META"} — never a bare string
  "lead_symbol": "SYMBOL or null",
  "closing_plain": "one short line naming what you are waiting for"
} }
\`\`\`

Rules for the lines: two to four of them, each a single short clause. Only use
symbols, levels, grades and states that appear in the context above. Do not
invent a catalyst, an economic release, a price, or a percentage — if the
context has none, say the watchlist is quiet. Name the market state
(${mb.label_plain}) and the data freshness where it matters. No greetings that
promise anything, no "big day", no urgency.`;

  try {
    const text = await completeOnce({
      system,
      messages: [{ role: 'user', content: instruction }],
      maxTokens: 1200,
    });
    const body = extractFence(text);
    if (!body) return { briefing: null, degraded: true, reason: 'Kai could not put a report together.' };
    const parsed = parseFenced(body);
    if (!parsed.ok || parsed.type !== 'briefing') {
      log('warn', requestId, 'briefing.shape_failed', { reason: parsed.ok ? 'wrong type' : parsed.reason });
      return { briefing: null, degraded: true, reason: 'Kai could not put a report together.' };
    }
    const payload = BriefingPayload.safeParse(parsed.payload);
    if (!payload.success) {
      return { briefing: null, degraded: true, reason: 'Kai could not put a report together.' };
    }
    const saved = await persistKaiObject({
      type: 'briefing',
      payload: payload.data,
      userId: ctx.profile.user_id,
      refs,
      requestId,
    });
    if (!saved) return { briefing: null, degraded: true, reason: 'Kai could not save your report.' };
    return { briefing: saved, degraded: false, reason: null };
  } catch (e) {
    log('error', requestId, 'briefing.generation_failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    return { briefing: null, degraded: true, reason: 'Kai is offline right now.' };
  }
}

function extractFence(text: string): string | null {
  const open = text.indexOf('```kai_object');
  if (open < 0) {
    // Model returned bare JSON — accept it if it parses.
    return text.trim().startsWith('{') ? text.trim() : null;
  }
  const rest = text.slice(open + '```kai_object'.length);
  const close = rest.indexOf('```');
  return close < 0 ? rest.trim() : rest.slice(0, close).trim();
}
