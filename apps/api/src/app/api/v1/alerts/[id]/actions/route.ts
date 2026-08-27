/**
 * POST /api/v1/alerts/:id/actions  {action, natural_language?}
 *
 * pause · resume · cancel · edit. `edit` never mutates a live watch in place:
 * it cancels the old one and hands back a fresh DRAFT built from the new
 * sentence, so the user always sees what will be watched before it is armed
 * (02 §6: "edit(→ new draft)").
 */
import type { NextRequest } from 'next/server';
import {
  AlertActionRequest,
  AlertActionResponse,
  AlertPreviewPayload,
  type AlertStatus,
} from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { log } from '@/lib/log';
import { loadProfile } from '@/lib/kai/context';
import { buildSystemPrompt } from '@/lib/kai/system-prompt';
import { anthropicConfigured, completeOnce, FenceSplitter, parseFenced } from '@/lib/kai/stream';
import { persistKaiObject, DETERMINISTIC_MODEL } from '@/lib/kai/objects';
import { alertRow, monitoringFor } from '../../shape';

export const dynamic = 'force-dynamic';

const COLUMNS =
  'id,status,natural_language,condition,data_dependency,frequency,expires_at,refs,created_at';

const ALLOWED_FROM: Record<string, AlertStatus[]> = {
  pause: ['active'],
  resume: ['paused', 'draft'],
  cancel: ['draft', 'active', 'paused', 'triggered'],
  edit: ['draft', 'active', 'paused', 'triggered', 'expired', 'cancelled'],
};

const NEXT_STATUS: Record<string, AlertStatus> = {
  pause: 'paused',
  resume: 'active',
  cancel: 'cancelled',
};

const DONE_PLAIN: Record<string, string> = {
  pause: 'Paused. I am not watching this until you start it again.',
  resume: 'Watching again.',
  cancel: 'Called off. Nothing is watching this now.',
};

export const POST = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const body = await parseBody(req, AlertActionRequest);
  const db = serviceClient();

  const found = await db
    .from('alerts')
    .select(COLUMNS)
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  if (found.error) {
    throw new ApiError('INTERNAL', 'We could not open that watch. Please try again.', {
      detail: found.error.message,
    });
  }
  const row = found.data as Record<string, unknown> | null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that watch.');

  const status = String(row.status) as AlertStatus;
  if (!ALLOWED_FROM[body.action].includes(status)) {
    throw new ApiError('STATE_CONFLICT', `That watch is ${status}, so there is nothing to ${body.action}.`);
  }

  /* ------------------------------ edit → new draft ------------------------ */
  if (body.action === 'edit') {
    if (!body.natural_language) {
      throw new ApiError('VALIDATION_FAILED', 'Tell me what you want watched instead.');
    }
    const refs = (row.refs as Record<string, unknown>) ?? {};
    const payload = await reparse(body.natural_language, refs, ctx.user.id, ctx.requestId);

    if (status === 'active' || status === 'paused' || status === 'draft') {
      await db.from('alerts').update({ status: 'cancelled' }).eq('id', ctx.params.id).eq('user_id', ctx.user.id);
    }

    const inserted = await db
      .from('alerts')
      .insert({
        user_id: ctx.user.id,
        status: 'draft',
        natural_language: body.natural_language,
        condition: payload.condition as never,
        data_dependency: payload.data_dependency as never,
        frequency: payload.frequency,
        expires_at: payload.expires_at,
        refs: { ...refs, replaces: ctx.params.id } as never,
      })
      .select(COLUMNS)
      .single();
    if (inserted.error || !inserted.data) {
      throw new ApiError('INTERNAL', 'We could not save that change. Please try again.', {
        detail: inserted.error?.message,
      });
    }

    const newRow = inserted.data as Record<string, unknown>;
    const preview = await persistKaiObject({
      type: 'alert_preview',
      payload,
      userId: ctx.user.id,
      refs: { alert_id: newRow.id, replaces: ctx.params.id, user_id: ctx.user.id, ...refs },
      model: payload.risk_plain?.includes('only watches') ? undefined : DETERMINISTIC_MODEL,
      requestId: ctx.requestId,
    });

    await emitUserEvent(
      ctx.user.id,
      'system',
      'alert',
      String(newRow.id),
      { event: 'alert_edited', replaces: ctx.params.id, summary_plain: payload.summary_plain },
      ctx.requestId
    );

    const m = monitoringFor('draft');
    return ok(
      AlertActionResponse.parse({
        alert: alertRow(newRow, payload.summary_plain),
        monitoring: m.monitoring,
        monitoring_plain: m.plain,
        preview,
        plain: 'Here is the new version. It is a draft until you arm it.',
      })
    );
  }

  /* ------------------------ pause / resume / cancel ----------------------- */
  const next = NEXT_STATUS[body.action];
  const updated = await db
    .from('alerts')
    .update({ status: next })
    .eq('id', ctx.params.id)
    .eq('user_id', ctx.user.id)
    .select(COLUMNS)
    .single();
  if (updated.error || !updated.data) {
    throw new ApiError('INTERNAL', 'We could not change that watch. Please try again.', {
      detail: updated.error?.message,
    });
  }

  await emitUserEvent(
    ctx.user.id,
    'system',
    'alert',
    ctx.params.id,
    { event: `alert_${body.action}d`.replace('canceld', 'cancelled'), from: status, to: next },
    ctx.requestId
  );

  const m = monitoringFor(next);
  return ok(
    AlertActionResponse.parse({
      alert: alertRow(updated.data as Record<string, unknown>),
      monitoring: m.monitoring,
      monitoring_plain: m.plain,
      preview: null,
      plain: DONE_PLAIN[body.action],
    })
  );
});

/** Same parse path as POST /alerts/draft, including the deterministic floor. */
async function reparse(
  nl: string,
  refs: Record<string, unknown>,
  userId: string,
  requestId: string
): Promise<ReturnType<typeof AlertPreviewPayload.parse>> {
  const symbol = typeof refs.symbol === 'string' ? refs.symbol : undefined;
  const level = typeof refs.level === 'number' ? refs.level : undefined;

  if (anthropicConfigured()) {
    try {
      const profile = await loadProfile(userId);
      const text = await completeOnce({
        system: buildSystemPrompt({
          displayName: profile.display_name,
          experience: profile.experience,
          involvement: profile.involvement,
          explanationLevel: profile.explanation_level,
          mode: profile.primary_mode,
        }),
        messages: [
          {
            role: 'user',
            content: `Turn this changed watch request into structured alert logic. Nothing is activated — this is a preview the user confirms.

Request: ${JSON.stringify(nl)}
Known references: ${JSON.stringify(refs)}

Return ONLY a fenced kai_object block of type "alert_preview" with fields natural_language, condition {compose, atoms[]}, data_dependency {symbols[], feeds[]}, frequency, expires_at, summary_plain, risk_plain. Use only levels the user actually gave you. Never invent a price.`,
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
          if (p.success) return p.data;
        }
      }
    } catch (e) {
      log('warn', requestId, 'alert_edit.kai_failed', { message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!symbol) {
    throw new ApiError(
      'KAI_UNAVAILABLE',
      'I could not turn that into a watch just now. Try naming the symbol and the level.'
    );
  }
  return AlertPreviewPayload.parse({
    natural_language: nl,
    condition:
      level === undefined
        ? { compose: 'all', atoms: [{ atom: 'setup_state', symbol, operator: 'equals', value: 'ready' }] }
        : { compose: 'all', atoms: [{ atom: 'price_cross', symbol, operator: 'crosses_up', value: level }] },
    data_dependency: { symbols: [symbol], feeds: ['equity_quotes'] },
    frequency: 'once',
    expires_at: null,
    summary_plain:
      level === undefined
        ? `Tell me when the ${symbol} setup is ready.`
        : `Tell me when ${symbol} trades above $${level}.`,
    risk_plain: 'This only watches. It never places an order.',
  });
}
