/**
 * POST /api/v1/rooms/:id/kai   {command, message_id?, args?}
 *
 * Commands (08 §5): summarize · verify · to_alert · compare · explain ·
 * mark_levels.
 *
 * SYNCHRONOUS in this round. 02 §9 specifies these as async with `kai_status`
 * events; there is no kai worker yet, so the model runs inline and the finished
 * object comes back in the response — and is also posted into the room as a
 * `kai_object` message so everyone else sees it too.
 *
 * The security boundary is the point of this endpoint (03 Unit 3, normative):
 * the room's last 50 messages are other people's writing, so they enter the
 * prompt only inside a delimited `<untrusted_content>` block, and the object
 * that comes back is scanned for injected directives before anything is
 * published. Both halves live in lib/kai/guard.ts. A scan hit publishes the
 * deterministic fallback instead and says plainly that a post tried to give Kai
 * instructions.
 */
import type { NextRequest } from 'next/server';
import { RoomKaiRequest, RoomKaiResponse } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { rateLimit } from '@/lib/ratelimit';
import { notify } from '@/lib/notify';
import { callRpc, noteFallback } from '@/lib/rpc';
import { loadProfile } from '@/lib/kai/context';
import { persistKaiObject, DETERMINISTIC_MODEL } from '@/lib/kai/objects';
import { runRoomCommand, type RoomMessageInput } from '@/lib/kai/room';
import { loadRoom, loadMembership, requireMember, authorsFor, toMessageRow } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

/** 08 §5: Kai is "useful on demand, quietly present by default" — never a flood. */
const KAI_LIMIT = 6;
const KAI_WINDOW_MS = 60_000;
const WINDOW_MESSAGES = 50;

export const POST = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const body = await parseBody(req, RoomKaiRequest);
  const room = await loadRoom(ctx.params.id);
  if (!room) throw new ApiError('NOT_FOUND', 'I could not find that room.');

  const membership = await loadMembership(ctx.params.id, ctx.user.id);
  requireMember(membership, String(room.name));

  rateLimit({
    key: `room-kai:${ctx.user.id}`,
    limit: KAI_LIMIT,
    windowMs: KAI_WINDOW_MS,
    messagePlain: 'Give me a moment to catch up with the last one.',
  });

  const db = serviceClient();

  const [recent, profile, setupRow, instruments] = await Promise.all([
    db
      .from('messages_public')
      .select('id,user_id,seq,kind,body,created_at')
      .eq('room_id', ctx.params.id)
      .is('deleted_at', null)
      .order('seq', { ascending: false })
      .limit(WINDOW_MESSAGES),
    loadProfile(ctx.user.id),
    room.setup_id
      ? db.from('setups').select('symbol,grade_display,state,thesis_plain,stop').eq('id', room.setup_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from('instruments').select('symbol').eq('active', true),
  ]);

  const known = new Set(
    ((instruments.data ?? []) as Record<string, unknown>[]).map((r) => String(r.symbol).toUpperCase())
  );
  const rows = ((recent.data ?? []) as Record<string, unknown>[]).reverse();
  const authors = await authorsFor(rows.map((r) => String(r.user_id ?? '')));

  const messages: RoomMessageInput[] = rows
    .filter((r) => r.kind !== 'kai_object')
    .map((r) => {
      const author = r.user_id ? authors.get(String(r.user_id)) : null;
      return {
        id: String(r.id),
        seq: Number(r.seq),
        author: author?.display_name ?? author?.handle ?? 'A member',
        author_id: r.user_id ? String(r.user_id) : null,
        at: String(r.created_at),
        text: String(r.body ?? ''),
        kind: String(r.kind),
      };
    });

  const target = body.message_id ? (messages.find((m) => m.id === body.message_id) ?? null) : null;
  if (body.message_id && !target) {
    throw new ApiError('NOT_FOUND', 'I could not find that message in the last part of the conversation.');
  }

  const s = setupRow.data as Record<string, unknown> | null;

  const result = await runRoomCommand({
    command: body.command,
    room: {
      id: String(room.id),
      name: String(room.name),
      mode: (room.mode as string) ?? null,
      setup_summary: s
        ? `${s.symbol} · ${s.grade_display ?? '—'} · ${s.state}${s.thesis_plain ? ` — ${s.thesis_plain}` : ''}`
        : null,
      symbol: s?.symbol ? String(s.symbol) : null,
      known_symbols: known,
    },
    messages,
    target,
    profile,
    args: body.args ?? {},
    requestId: ctx.requestId,
  });

  const object = await persistKaiObject({
    type: result.type,
    payload: result.payload,
    userId: null, // room objects belong to the room, not to one member
    refs: {
      room_id: String(room.id),
      command: body.command,
      requested_by: ctx.user.id,
      message_id: target?.id ?? null,
      sample_size: messages.length,
    },
    // `mark_levels` derives its object rather than generating one, so it names
    // the deterministic model even though nothing about it is degraded.
    model: result.model ?? (result.degraded ? DETERMINISTIC_MODEL : undefined),
    requestId: ctx.requestId,
  });
  if (!object) throw new ApiError('INTERNAL', 'We could not save that answer. Please try again.');

  /* -------------------------- post it into the room ---------------------- */
  let inserted: Record<string, unknown> | null = null;
  const rpc = await callRpc<Record<string, unknown> | Record<string, unknown>[]>(
    'post_kai_message',
    { p_room_id: ctx.params.id, p_kai_object_id: object.id, p_body: result.body_plain },
    ctx.requestId
  );
  if (rpc.ok) {
    inserted = Array.isArray(rpc.data) ? ((rpc.data[0] as Record<string, unknown>) ?? null) : (rpc.data ?? null);
  } else if (!rpc.missing) {
    throw new ApiError('INTERNAL', 'We could not post that answer. Please try again.');
  }

  if (!inserted) {
    // FALLBACK (documented in README): read-then-write seq, same caveat as
    // post_room_message.
    noteFallback(ctx.requestId, 'post_kai_message');
    const top = await db
      .from('messages')
      .select('seq')
      .eq('room_id', ctx.params.id)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    const seq = Number((top.data as Record<string, unknown> | null)?.seq ?? 0) + 1;

    const res = await db
      .from('messages')
      .insert({
        room_id: ctx.params.id,
        user_id: null,
        seq,
        kind: 'kai_object',
        body: result.body_plain,
        refs: { kai_object_id: object.id, command: body.command, requested_by: ctx.user.id } as never,
      })
      .select('id,room_id,user_id,seq,kind,body,parent_id,refs,structured_idea,position_disclosure,deleted_at,created_at')
      .single();
    if (res.error || !res.data) {
      throw new ApiError('INTERNAL', 'We could not post that answer. Please try again.', {
        detail: res.error?.message,
      });
    }
    inserted = res.data as Record<string, unknown>;
  }

  await emitUserEvent(
    ctx.user.id,
    'kai_result',
    'message',
    String(inserted.id),
    { event: 'room_kai_reply', room_id: ctx.params.id, command: body.command, object_type: result.type },
    ctx.requestId
  );
  await notify({
    userId: ctx.user.id,
    kind: 'kai_room_reply',
    titlePlain: `Kai answered in ${room.name}`,
    bodyPlain: result.body_plain,
    route: `/room/${room.id}`,
    payload: { room_id: room.id, message_id: inserted.id, command: body.command },
    requestId: ctx.requestId,
  });

  const objects = new Map([[object.id, object]]);
  return ok(
    RoomKaiResponse.parse({
      message: toMessageRow(inserted, new Map(), objects),
      object,
      degraded: result.degraded,
    }),
    { status: 201 }
  );
});
