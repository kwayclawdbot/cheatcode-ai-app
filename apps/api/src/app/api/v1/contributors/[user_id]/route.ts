/**
 * GET /api/v1/contributors/:user_id
 *
 * Evidence-based profile context — role labels, contribution counts, the
 * disclosures attached to recent posts, and (new) the member's record: their
 * belt, their points, the calls they published and the trades they chose to
 * show.
 *
 * =====================================================================
 * `rankings` USED TO BE A NULL LITERAL. THAT RULE WAS REVERSED BY THE OWNER.
 * =====================================================================
 * This route carried, and enforced, the opposite of what it now returns. The
 * comment that stood here said:
 *
 *   "NO RANKINGS. `rankings` is a null literal in the response type, on
 *    purpose: 08 §8 prohibits points, streaks, leaderboards and profit
 *    contests, and the cleanest way to keep a future contributor from adding
 *    one is to make the contract refuse to carry it."
 *
 * That was a deliberate tripwire and it is being removed deliberately, in the
 * open, rather than quietly deleted. THE OWNER ASKED FOR THE OPPOSITE on
 * 2026-09-06, in these words: "add belt system in there where users gain points
 * for making good calls and also taking good kai trades.. then they level up
 * and also rank on leaderboard." He is the authority on the product and the
 * rule was his to change. Migration 0039's header records the same reversal
 * against the database, and this file is edited in the same lane rather than
 * left to contradict it.
 *
 * WHAT SURVIVES THE REVERSAL, because it was the good half of the old rule:
 * nothing is scored that did not RESOLVE — no points for posting, for streaks,
 * for logging in — and there is NO PROFIT CONTEST. Not one number below is
 * denominated in money; the ranking is by accuracy-weighted resolved calls, so
 * the biggest account cannot buy a place on the board.
 *
 * WHAT DID NOT CHANGE: A PROFILE NEVER WIDENS WHAT YOU CAN SEE. `recent_posts`
 * is still scoped to rooms the CALLER is in, and the shared trades below come
 * through the one helper that joins `profiles.share_trades` — so a member who
 * switched sharing off shows no trades here to anybody, including somebody who
 * saw them yesterday.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CommunityCall, ContributorResponse, FollowState, SharedTrade, SocialRecord } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { loadAuthor } from '@/lib/social/authors';
import { socialRecord } from '@/lib/social/board';
import { listCalls } from '@/lib/social/calls';
import { followState } from '@/lib/social/follows';
import { readSharedTrades, shapeSharedTrade } from '@/lib/social/shares';

export const dynamic = 'force-dynamic';

const RECENT = 10;
/** A profile is a sample of somebody's record, not their whole history. */
const RECENT_SOCIAL = 20;

/**
 * The response, extended on top of the shared contract.
 *
 * `ContributorResponse.rankings` is still typed `z.null()` in
 * `packages/shared/api.ts`, which this lane does not own — so the field is
 * replaced here with the real record rather than left lying. `.omit()` before
 * `.extend()` because a zod object cannot widen a field in place, and because
 * doing it in two visible steps says out loud that a type is being changed.
 * When the shared contract carries `SocialRecord` itself this whole block can
 * be deleted and the import used directly.
 */
const ContributorSocialResponse = ContributorResponse.omit({ rankings: true }).extend({
  /** Null when the member has never resolved anything. Never a fake zero row. */
  rankings: SocialRecord.nullable(),
  follow: FollowState,
  shared_trades: z.array(SharedTrade),
  calls: z.array(CommunityCall),
});

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

    /**
     * The social half. All of these are independent reads, so they go together.
     *
     * NOTE `readSharedTrades` APPLIES THE SWITCH TO THE AUTHOR EVEN WHEN THE
     * AUTHOR IS THE CALLER. Somebody looking at their own profile with sharing
     * off sees no trades, which is the honest answer to "what does everyone
     * else see" and is the one place the setting's effect is visible without
     * asking a second person to look. There is deliberately no "unless it is
     * you" branch in the helper: the moment that exists, the join has a bypass.
     */
    const [follow, record, calls, shares, author] = await Promise.all([
      followState(ctx.user.id, ctx.params.user_id),
      socialRecord(ctx.params.user_id, ctx.requestId),
      listCalls({ authorId: ctx.params.user_id, viewerId: ctx.user.id, limit: RECENT_SOCIAL }),
      readSharedTrades({ authorIds: [ctx.params.user_id], limit: RECENT_SOCIAL }),
      loadAuthor(ctx.params.user_id, ctx.requestId),
    ]);

    const s = (stats.data as Record<string, unknown> | null) ?? {};
    const ideas = Number(s.ideas_posted ?? 0);
    const disclosed = Number(s.outcomes_disclosed ?? 0);
    const labels = (p.role_labels as string[]) ?? [];

    return ok(
      ContributorSocialResponse.parse({
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
        // A member who has never resolved anything gets null, not a row of
        // zeroes: "no record yet" and "a record of nothing" read differently on
        // a profile, and only one of them is true.
        rankings: record.resolved > 0 ? record : null,
        follow,
        shared_trades: author ? shares.map((row) => shapeSharedTrade(row, author)) : [],
        calls,
        actions: [
          {
            action: 'save_contributor',
            label: 'Save',
            enabled: true,
            hint: 'Saved on your device only.',
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
