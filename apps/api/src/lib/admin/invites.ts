/**
 * Invites: making a code, and saying what it can do right now.
 *
 * THE CODE COMES FROM SQL. `new_invite_code()` (0025 §11) draws from a 30-glyph
 * alphabet with no 0/O, 1/I/L and no U, using rejection sampling on
 * `gen_random_bytes` — because `byte % 30` would make the first sixteen glyphs
 * 7% more likely and quietly shorten a 59-bit code for anybody who measured it.
 * None of that is reimplemented here. A `Math.random()` code would be
 * predictable, and a hand-rolled alphabet would eventually contain an O.
 *
 * UNIQUENESS IS THE INDEX, NOT A CHECK-THEN-INSERT. `invites_code_lower_uniq`
 * decides; this file retries on a 23505. Reading first and inserting second
 * would be a race, and at 59 bits it is a race that would essentially never be
 * observed — which is the worst kind, because it would ship.
 */
import type { AdminInviteRow, AdminInviteState } from '@shared/api';
import { serviceClient } from './../db';
import { ApiError } from './../errors';

export type InviteRecord = {
  id: string;
  code: string;
  label: string | null;
  tier: 'free' | 'premium';
  entitlements: Record<string, unknown>;
  max_redemptions: number | null;
  redeemed_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: string | null;
};

export const INVITE_COLUMNS =
  'id,code,label,tier,entitlements,max_redemptions,redeemed_count,expires_at,revoked_at,created_at,created_by';

/** Derived on read, never stored: a code's state is a function of the clock. */
export function inviteState(r: InviteRecord, now = Date.now()): AdminInviteState {
  if (r.revoked_at) return 'revoked';
  if (r.expires_at && Date.parse(r.expires_at) <= now) return 'expired';
  if (r.max_redemptions !== null && r.redeemed_count >= r.max_redemptions) return 'exhausted';
  return 'open';
}

export function shapeInvite(r: InviteRecord): AdminInviteRow {
  const state = inviteState(r);
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    tier: r.tier,
    entitlements: r.entitlements ?? {},
    max_redemptions: r.max_redemptions,
    redeemed_count: r.redeemed_count,
    expires_at: r.expires_at,
    revoked_at: r.revoked_at,
    created_at: r.created_at,
    created_by: r.created_by,
    state,
    // A PATH, NOT A URL. The host belongs to whoever is rendering this — the
    // app, a marketing page, a text message — and baking one in here is how a
    // link ends up pointing at localhost in somebody's inbox.
    link: `/join/${r.code}`,
    plain: invitePlain(r, state),
  };
}

function invitePlain(r: InviteRecord, state: AdminInviteState): string {
  const seats =
    r.max_redemptions === null
      ? `${r.redeemed_count} redeemed, uncapped`
      : `${r.redeemed_count} of ${r.max_redemptions} redeemed`;
  switch (state) {
    case 'revoked':
      return `Revoked. ${seats}.`;
    case 'expired':
      return `Expired ${String(r.expires_at).slice(0, 10)}. ${seats}.`;
    case 'exhausted':
      return `All seats taken. ${seats}.`;
    default:
      return `Open — grants ${r.tier}. ${seats}.`;
  }
}

/**
 * Make a code and insert the row, retrying only the collision. Four attempts is
 * generous past the point of arithmetic: at 59 bits, two collisions in a row
 * would mean the random source is broken, and retrying forever would hide that.
 */
export async function createInvite(input: {
  label?: string;
  tier: 'free' | 'premium';
  entitlements: Record<string, unknown>;
  maxRedemptions: number | null;
  expiresAt: string | null;
  codeLength?: number;
  createdBy: string;
}): Promise<InviteRecord> {
  const db = serviceClient();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: code, error: codeErr } = await db.rpc('new_invite_code', {
      p_length: input.codeLength ?? 12,
    });
    if (codeErr) throw codeErr;
    const { data, error } = await db
      .from('invites')
      .insert({
        code: String(code),
        label: input.label ?? null,
        tier: input.tier,
        entitlements: input.entitlements,
        max_redemptions: input.maxRedemptions,
        expires_at: input.expiresAt,
        created_by: input.createdBy,
      })
      .select(INVITE_COLUMNS)
      .single();
    if (!error) return data as InviteRecord;
    if (error.code !== '23505') throw error;
  }
  throw new ApiError('INTERNAL', 'We could not make a code just now. Please try again.');
}
