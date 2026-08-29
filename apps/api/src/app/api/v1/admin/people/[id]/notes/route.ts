/**
 * POST /api/v1/admin/people/[id]/notes — staff writing about a user.
 *
 * `support` may do this: reading and leaving notes is the whole of that role.
 *
 * A note is never shown to the person it is about, which is exactly why it
 * lives behind the same service-role-only wall as the rest of the CRM. It is
 * also audited with its own body in `after`, so "who wrote that" has an answer
 * even after the note is edited or the author's account is gone.
 */
import type { NextRequest } from 'next/server';
import { AdminCreateNoteRequest, AdminNoteResponse } from '@shared/api';
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/admin/audit';
import { withAuthorNames } from '@/lib/admin/people';

export const dynamic = 'force-dynamic';

export const POST = staffedParams<{ id: string }>(async (req, ctx: StaffCtx & { params: { id: string } }) => {
  const body = await parseBody(req as NextRequest, AdminCreateNoteRequest);
  const db = serviceClient();

  const { data: person, error: pErr } = await db
    .from('crm_people')
    .select('id')
    .eq('id', ctx.params.id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!person) throw new ApiError('NOT_FOUND', 'We could not find that person.');

  const { data, error } = await db
    .from('crm_notes')
    .insert({ person_id: ctx.params.id, author_user_id: ctx.user.id, body: body.body })
    .select('id,body,author_user_id,created_at')
    .single();
  if (error) throw error;

  const [note] = await withAuthorNames([data as never]);

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'crm.note.create',
    targetKind: 'crm_person',
    targetId: ctx.params.id,
    after: { note_id: note.id, body: note.body },
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  return ok(AdminNoteResponse.parse({ note, plain: 'Saved. Only staff can see this.' }), { status: 201 });
});
