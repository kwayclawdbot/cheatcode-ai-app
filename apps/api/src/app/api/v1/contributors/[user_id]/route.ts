/**
 * GET /api/v1/contributors/:user_id
 *
 * Evidence-based profile context — role labels, contribution counts, and the
 * disclosures attached to recent posts.
 *
 * NO RANKINGS. `rankings` is a null literal in the response type, on purpose:
 * 08 §8 prohibits points, streaks, leaderboards and profit contests, and the
 * cleanest way to keep a future contributor from adding one is to make the
 * contract refuse to carry it. Usefulness and clarity are shown as they are
 * recorded, never as a position in a list.
 */
import type { NextRequest } from 'next/server';
import { ContributorResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

const RECENT = 10;

export const GET = authedParams<{ user_id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { user_id: string } }) => {
    const db = serviceClient();
    const profile = await db
      .from('profiles_public')
      .select('user_id,handle,display_name,avatar_url,role_labels')
      .eq('user_id', ctx.params.user_id)
      .maybeSingle();
    const p = profile.data as Record<string, unknown> | null;
    if (!p) throw new ApiError('NOT_FOUND', 'I could not find that member.');

    // Only rooms the CALLER is in — a profile must never widen what you can see.
    const myRooms = await db.from('room_members').select('room_id').eq('user_id', ctx.user.id);
    const roomIds = ((myRooms.data ?? []) as Record<string, unknown>[]).map((r) => String(r.room_id));

    const [stats, messages] = await Promise.all([
      db
        .from('contributor_stats')
        .select('ideas_posted,theses_updated,outcomes_disclosed,defined_risk_rate,usefulness_score')
        .eq('user_id', ctx.params.user_id)
        .maybeSingle(),
      roomIds.length
        ? db
            .from('messages_public')
            .select('id,room_id,body,position_disclosure,created_at')
            .eq('user_id', ctx.params.user_id)
            .in('room_id', roomIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(RECENT)
        : Promise.resolve({ data: [] }),
    ]);

    const msgRows = (messages.data ?? []) as Record<string, unknown>[];
    const roomNames = new Map<string, string>();
    if (msgRows.length) {
      const { data } = await db
        .from('rooms')
        .select('id,name')
        .in('id', [...new Set(msgRows.map((m) => String(m.room_id)))]);
      for (const r of (data ?? []) as Record<string, unknown>[]) roomNames.set(String(r.id), String(r.name));
    }

    const s = (stats.data as Record<string, unknown> | null) ?? {};
    const ideas = Number(s.ideas_posted ?? 0);
    const disclosed = Number(s.outcomes_disclosed ?? 0);
    const labels = (p.role_labels as string[]) ?? [];

    return ok(
      ContributorResponse.parse({
        user_id: String(p.user_id),
        handle: (p.handle as string) ?? null,
        display_name: (p.display_name as string) ?? null,
        avatar_url: (p.avatar_url as string) ?? null,
        role_labels: labels,
        contribution: {
          ideas_posted: ideas,
          theses_updated: Number(s.theses_updated ?? 0),
          outcomes_disclosed: disclosed,
          defined_risk_rate: s.defined_risk_rate === null || s.defined_risk_rate === undefined ? null : Number(s.defined_risk_rate),
          usefulness_score: s.usefulness_score === null || s.usefulness_score === undefined ? null : Number(s.usefulness_score),
          plain: ideas
            ? `${ideas} idea${ideas === 1 ? '' : 's'} posted, ${disclosed} with the outcome disclosed afterwards.`
            : 'No posted ideas yet. What someone says matters more than how much they say.',
        },
        recent_messages: msgRows.map((m) => ({
          id: String(m.id),
          room_id: String(m.room_id),
          room_name: roomNames.get(String(m.room_id)) ?? 'a room',
          created_at: String(m.created_at),
          excerpt: String(m.body ?? '').slice(0, 240),
          position_disclosure: (m.position_disclosure as Record<string, unknown>) ?? null,
        })),
        rankings: null,
        actions: [
          {
            action: 'save_contributor',
            label: 'Save',
            enabled: true,
            hint: 'Saved on your device only — there is no follow system here.',
            primary: false,
            route: null,
          },
          { action: 'mute', label: 'Mute', enabled: true, hint: null, primary: false, route: null },
          { action: 'report', label: 'Report', enabled: true, hint: null, primary: false, route: null },
        ],
      })
    );
  }
);
