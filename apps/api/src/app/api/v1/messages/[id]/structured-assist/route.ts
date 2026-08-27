/**
 * POST /api/v1/messages/:id/structured-assist
 *
 * Kai reads a member's draft idea and hands back an improved version across the
 * six fields in 08 §7 — direction & thesis, entry condition, invalidation, risk
 * & size, target & horizon, evidence.
 *
 * NOTHING IS PUBLISHED. `published:false` is a literal in the response type,
 * not a flag, because 08 §7 is explicit: Kai "never silently rewrites a member,
 * claims endorsement, or converts a post into a trade without explicit action."
 * The member's own words come back untouched alongside the suggestion so they
 * can keep theirs.
 *
 * The draft is the member's own text, but it still enters the prompt inside the
 * untrusted-content block and the answer is still scanned — a member can be
 * injected against just as easily as anyone else.
 */
import type { NextRequest } from 'next/server';
import { StructuredAssistResponse, StructuredIdea } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { log } from '@/lib/log';
import { loadProfile } from '@/lib/kai/context';
import { buildSystemPrompt } from '@/lib/kai/system-prompt';
import { anthropicConfigured, completeOnce } from '@/lib/kai/stream';
import { wrapUntrusted, scanPayload } from '@/lib/kai/guard';
import { loadMembership, requireMember, loadRoom } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const db = serviceClient();
  const found = await db
    .from('messages')
    .select('id,room_id,user_id,body,structured_idea')
    .eq('id', ctx.params.id)
    .maybeSingle();
  const row = found.data as Record<string, unknown> | null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that draft.');

  const room = await loadRoom(String(row.room_id));
  const membership = await loadMembership(String(row.room_id), ctx.user.id);
  requireMember(membership, String(room?.name ?? 'that room'));
  if (String(row.user_id) !== ctx.user.id) {
    throw new ApiError('FORBIDDEN', 'I only rework your own drafts.');
  }

  rateLimit({
    key: `assist:${ctx.user.id}`,
    limit: 6,
    windowMs: 60_000,
    messagePlain: 'Give me a moment to catch up with the last one.',
  });

  const original = ((row.structured_idea as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const draftText = String(row.body ?? '');

  const floor = StructuredIdea.parse({
    direction: (original.direction as 'long' | 'short') ?? 'long',
    thesis: (original.thesis as string) ?? (draftText.slice(0, 2000) || 'No thesis written yet.'),
    entry_condition: (original.entry_condition as string) ?? null,
    invalidation: (original.invalidation as string) ?? null,
    risk_and_size: (original.risk_and_size as string) ?? null,
    target_and_horizon: (original.target_and_horizon as string) ?? null,
    evidence: (original.evidence as string) ?? null,
    symbol: (original.symbol as string) ?? null,
  });

  if (!anthropicConfigured()) {
    return ok(
      StructuredAssistResponse.parse({
        original,
        improved: floor,
        notes: ['Kai is offline right now, so this is your draft unchanged.'],
        plain: 'I could not look at this just now. Your draft is untouched.',
        published: false,
        degraded: true,
      })
    );
  }

  const profile = await loadProfile(ctx.user.id);
  const block = wrapUntrusted('member draft', [
    { id: String(row.id), author: 'the member', at: new Date().toISOString(), text: draftText },
  ]);

  try {
    const text = await completeOnce({
      system: buildSystemPrompt({
        displayName: profile.display_name,
        experience: profile.experience,
        involvement: profile.involvement,
        explanationLevel: profile.explanation_level,
        mode: (room?.mode as string) ?? profile.primary_mode,
      }),
      messages: [
        {
          role: 'user',
          content: `A member wrote this trade idea and asked you to make it decision-ready before they post it.

${block}

Their structured fields so far: ${JSON.stringify(original)}

Return ONLY JSON, no fence:
{
  "direction": "long|short",
  "thesis": "what they expect and why, in their voice, tightened",
  "entry_condition": "what must happen before this is actionable, or null",
  "invalidation": "what would prove it wrong, or null",
  "risk_and_size": "what is at risk, or null",
  "target_and_horizon": "where it is going and over what period, or null",
  "evidence": "the chart, catalyst or source they named, or null",
  "symbol": "TICKER or null",
  "notes": ["what you changed and why — one short line each"]
}

Rules: keep their idea, do not replace it with yours. Never invent a price, a level or a catalyst they did not write — if a field is missing, say so in notes and leave it null. Do not endorse the idea. Do not tell them to trade it.`,
        },
      ],
      maxTokens: 900,
    });

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('no json');
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;

    const improved = StructuredIdea.safeParse({
      direction: parsed.direction ?? floor.direction,
      thesis: parsed.thesis ?? floor.thesis,
      entry_condition: parsed.entry_condition ?? null,
      invalidation: parsed.invalidation ?? null,
      risk_and_size: parsed.risk_and_size ?? null,
      target_and_horizon: parsed.target_and_horizon ?? null,
      evidence: parsed.evidence ?? null,
      symbol: parsed.symbol ?? null,
    });
    if (!improved.success) throw new Error('shape');

    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((n): n is string => typeof n === 'string').slice(0, 6)
      : [];

    const scan = scanPayload({ ...improved.data, notes });
    if (!scan.ok) {
      log('warn', ctx.requestId, 'structured_assist.INJECTION_SCAN_BLOCKED', { findings: scan.findings });
      throw new Error('scan');
    }

    return ok(
      StructuredAssistResponse.parse({
        original,
        improved: improved.data,
        notes,
        plain: 'Here is a tighter version. Nothing is posted — keep yours or take this one.',
        published: false,
        degraded: false,
      })
    );
  } catch (e) {
    log('warn', ctx.requestId, 'structured_assist.failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    return ok(
      StructuredAssistResponse.parse({
        original,
        improved: floor,
        notes: ['I could not rework this one just now.'],
        plain: 'I could not look at this just now. Your draft is untouched.',
        published: false,
        degraded: true,
      })
    );
  }
});
