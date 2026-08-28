/**
 * POST /api/v1/alerts/draft
 *
 * Natural language (+refs) → Kai-parsed alert_preview object, shown BEFORE
 * activation (02 §6), persisted as an `alerts` row with status `draft`.
 * Used by the O1 onboarding step: "Watch 504 for me".
 */
import type { NextRequest } from 'next/server';
import { AlertDraftRequest, AlertDraftResponse, AlertPreviewPayload, type AlertRow } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { log } from '@/lib/log';
import { emitUserEvent } from '@/lib/events';
import { loadProfile } from '@/lib/kai/context';
import { alertIdentity, alertWritePatch } from '@/lib/round4/alert-identity';
import { hasAlertVersionColumns } from '@/lib/round4/schema-probe';
import { buildSystemPrompt } from '@/lib/kai/system-prompt';
import { anthropicConfigured, completeOnce, FenceSplitter, parseFenced } from '@/lib/kai/stream';
import { persistKaiObject } from '@/lib/kai/objects';
import { alertRow } from '../shape';

export const dynamic = 'force-dynamic';

/** Deterministic fallback so onboarding never dead-ends when Kai is down. */
function fallbackPreview(nl: string, refs: { symbol?: string; level?: number }) {
  if (!refs.symbol || typeof refs.level !== 'number') return null;
  return AlertPreviewPayload.parse({
    natural_language: nl,
    condition: {
      compose: 'all',
      atoms: [{ atom: 'price_cross', symbol: refs.symbol, operator: 'crosses_up', value: refs.level }],
    },
    data_dependency: { symbols: [refs.symbol], feeds: ['equity_quotes'] },
    frequency: 'once',
    expires_at: null,
    summary_plain: `Tell me when ${refs.symbol} trades above $${refs.level}.`,
    risk_plain: 'This only watches. It never places an order.',
  });
}

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, AlertDraftRequest);
  const db = serviceClient();

  let payload: ReturnType<typeof AlertPreviewPayload.parse> | null = null;
  let degraded = false;
  const profile = await loadProfile(ctx.user.id);

  if (anthropicConfigured()) {
    try {
      const system = buildSystemPrompt({
        displayName: profile.display_name,
        experience: profile.experience,
        involvement: profile.involvement,
        explanationLevel: profile.explanation_level,
        mode: profile.primary_mode,
      });
      const text = await completeOnce({
        system,
        messages: [
          {
            role: 'user',
            content: `Turn this watch request into structured alert logic. Do not activate anything — this is a preview the user will confirm.

Request: ${JSON.stringify(body.natural_language)}
Known references: ${JSON.stringify(body.refs)}

Return ONLY a fenced kai_object block:
\`\`\`kai_object
{ "type": "alert_preview", "payload": {
  "natural_language": ${JSON.stringify(body.natural_language)},
  "condition": { "compose": "all", "atoms": [ { "atom": "price_cross|price_range|pct_change|rvol_min|setup_state|time_at|volume_above|catalyst_within", "symbol": "SYM", "operator": "above|below|crosses_up|crosses_down|equals|within", "value": 0 } ] },
  "data_dependency": { "symbols": ["SYM"], "feeds": ["equity_quotes"] },
  "frequency": "once",
  "expires_at": null,
  "summary_plain": "one plain sentence describing exactly what will be watched",
  "risk_plain": "one line reminding the user this only watches, it never places an order"
} }
\`\`\`

Use only levels the user actually gave you. Never invent a price.`,
          },
        ],
        maxTokens: 900,
      });
      const splitter = new FenceSplitter();
      const bodies = [...splitter.push(text).objects, ...splitter.flush().objects];
      const first = bodies[0] ?? (text.trim().startsWith('{') ? text.trim() : null);
      if (first) {
        const parsed = parseFenced(first);
        if (parsed.ok && parsed.type === 'alert_preview') {
          const p = AlertPreviewPayload.safeParse(parsed.payload);
          if (p.success) payload = p.data;
        }
      }
      if (!payload) log('warn', ctx.requestId, 'alert_draft.parse_failed', {});
    } catch (e) {
      log('warn', ctx.requestId, 'alert_draft.kai_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!payload) {
    payload = fallbackPreview(body.natural_language, body.refs);
    degraded = true;
  }
  if (!payload) {
    throw new ApiError('KAI_UNAVAILABLE', 'Kai could not turn that into a watch just now. Try naming the symbol and the level.');
  }

  // WHAT THIS WATCH IS ABOUT comes out of the PARSED CONDITION, not out of the
  // request body. The symbol and level the user typed are extracted by Kai into
  // `condition.atoms[]`; storing only the client's `refs` meant a watch created
  // from plain language anywhere but one screen had no symbol on it at all, and
  // therefore never produced an alert card. The client hint is now a fallback,
  // not the source of truth. See lib/round4/alert-identity.ts.
  const identity = alertIdentity({
    condition: payload.condition,
    dataDependency: payload.data_dependency,
    refs: body.refs,
  });
  const write = await alertWritePatch({
    identity,
    refs: body.refs,
    mode: profile.primary_mode,
    hasRound4Columns: await hasAlertVersionColumns(),
    lifecycleState: 'watching',
  });

  const { data, error } = await db
    .from('alerts')
    .insert({
      user_id: ctx.user.id,
      status: 'draft',
      natural_language: body.natural_language,
      condition: payload.condition as never,
      data_dependency: payload.data_dependency as never,
      frequency: payload.frequency,
      expires_at: payload.expires_at,
      refs: write.refs as never,
      ...write.columns,
    })
    .select('id,status,natural_language,condition,data_dependency,frequency,expires_at,refs,created_at')
    .single();
  if (error || !data) {
    throw new ApiError('INTERNAL', 'We could not save that watch. Please try again.', { detail: error?.message });
  }

  const preview = await persistKaiObject({
    type: 'alert_preview',
    payload,
    userId: ctx.user.id,
    refs: { alert_id: (data as Record<string, unknown>).id, user_id: ctx.user.id, ...write.refs },
    model: degraded ? 'deterministic/v1' : undefined,
    requestId: ctx.requestId,
  });
  if (!preview) throw new ApiError('INTERNAL', 'We could not save that watch. Please try again.');

  await emitUserEvent(
    ctx.user.id,
    'system',
    'alert',
    String((data as Record<string, unknown>).id),
    { event: 'alert_drafted', summary_plain: payload.summary_plain },
    ctx.requestId
  );

  const row: AlertRow = alertRow(data as Record<string, unknown>, payload.summary_plain);
  return ok(AlertDraftResponse.parse({ alert: row, preview, degraded }), { status: 201 });
});
