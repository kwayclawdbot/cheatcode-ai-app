/**
 * A CALL SOMEBODY MADE THEMSELVES.
 *
 * 0038 §4 makes a member's call an OBJECT rather than a sentence: it has an
 * entry, levels, a lifecycle and a resolution, so it can be checked against a
 * price later and the person can be held to it. `scoreable` is a GENERATED
 * column — entry, plus a stop or a target — so this file cannot set it, and
 * therefore cannot award itself points by claiming a call was checkable when it
 * was not.
 *
 * WHAT THIS FILE OWES THE READER. The database refuses a long whose stop sits
 * above its entry, and it refuses it by raising `stop_not_below_entry` — which
 * is a condition name, not a sentence, and must never reach a person. Every
 * write below translates those four codes into the sentence the composer should
 * show. See `plainForLevelError`.
 */
import type { CommunityCall, SocialAuthor } from '@shared/api';
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { log } from '../log';
import { agePlain } from '../moderation';
import { loadAuthors } from './authors';
import { outcomeLabel } from './outcomes';

export const CALL_COLUMNS =
  'id,user_id,symbol,direction,entry,stop,target,thesis,scoreable,status,result_pct,published_at,resolved_at,expires_at';

export type CallRow = {
  id: string;
  user_id: string;
  symbol: string;
  direction: 'long' | 'short';
  entry: number | null;
  stop: number | null;
  target: number | null;
  thesis: string;
  scoreable: boolean;
  status: 'open' | 'target' | 'stop' | 'expired' | 'withdrawn';
  result_pct: number | null;
  published_at: string;
  resolved_at: string | null;
  expires_at: string | null;
};

export function toCallRow(r: Record<string, unknown>): CallRow {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    symbol: String(r.symbol),
    direction: String(r.direction) === 'short' ? 'short' : 'long',
    entry: n(r.entry),
    stop: n(r.stop),
    target: n(r.target),
    thesis: String(r.thesis ?? ''),
    scoreable: r.scoreable === true,
    status: String(r.status ?? 'open') as CallRow['status'],
    result_pct: n(r.result_pct),
    published_at: String(r.published_at),
    resolved_at: (r.resolved_at as string) ?? null,
    expires_at: (r.expires_at as string) ?? null,
  };
}

/**
 * The wire shape. `graded: false` is not a field here because there is none —
 * nothing graded this. A member's call carries no letter and no score bar,
 * which is the difference between it and a setup Kai published.
 */
export function shapeCall(row: CallRow, author: SocialAuthor): CommunityCall {
  return {
    id: row.id,
    author,
    symbol: row.symbol,
    direction: row.direction,
    entry: row.entry,
    stop: row.stop,
    target: row.target,
    thesis: row.thesis,
    scoreable: row.scoreable,
    status: row.status,
    result_pct: row.result_pct,
    outcome_label: outcomeLabel(row.status),
    published_at: row.published_at,
    time_label: agePlain(row.published_at),
    resolved_at: row.resolved_at,
  };
}

/* ------------------------------------------------------------------ */
/* The level guard, in English                                          */
/* ------------------------------------------------------------------ */

/**
 * `social_levels_coherent()` (0038 §5) raises a snake_case condition name so a
 * route can translate it. This is that translation. Anything unrecognised falls
 * through to a sentence that still tells the member what to look at, because
 * showing them `22023` would tell them nothing at all.
 */
export function plainForLevelError(message: string): string | null {
  if (/stop_not_below_entry/.test(message)) return 'On a long, the stop goes below the entry. Move it under your entry price and try again.';
  if (/target_not_above_entry/.test(message)) return 'On a long, the target goes above the entry. Move it over your entry price and try again.';
  if (/stop_not_above_entry/.test(message)) return 'On a short, the stop goes above the entry. Move it over your entry price and try again.';
  if (/target_not_below_entry/.test(message)) return 'On a short, the target goes below the entry. Move it under your entry price and try again.';
  return null;
}

/* ------------------------------------------------------------------ */
/* Reading                                                              */
/* ------------------------------------------------------------------ */

/**
 * One member's calls, newest first.
 *
 * A WITHDRAWN CALL IS HIDDEN FROM EVERYBODY BUT ITS AUTHOR. Withdrawing is how
 * somebody says "I no longer stand behind that" before it resolves, and leaving
 * it on their public profile would make the button meaningless. The author
 * keeps seeing it, because their own history should not develop holes.
 */
export async function listCalls(opts: {
  authorId: string;
  viewerId: string;
  limit?: number;
}): Promise<CommunityCall[]> {
  const db = serviceClient();
  let q = db
    .from('community_calls')
    .select(CALL_COLUMNS)
    .eq('user_id', opts.authorId)
    .order('published_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.authorId !== opts.viewerId) q = q.neq('status', 'withdrawn');

  const { data, error } = await q;
  if (error) {
    log('warn', '-', 'social.calls_read_failed', { message: error.message });
    return [];
  }
  const rows = ((data ?? []) as Record<string, unknown>[]).map(toCallRow);
  if (!rows.length) return [];
  const authors = await loadAuthors([opts.authorId]);
  const author = authors.get(opts.authorId);
  if (!author) return [];
  return rows.map((r) => shapeCall(r, author));
}

/* ------------------------------------------------------------------ */
/* Writing                                                              */
/* ------------------------------------------------------------------ */

export async function createCall(opts: {
  userId: string;
  symbol: string;
  direction: 'long' | 'short';
  entry: number | null;
  stop: number | null;
  target: number | null;
  thesis: string;
  requestId: string;
}): Promise<CallRow> {
  const db = serviceClient();
  const { data, error } = await db
    .from('community_calls')
    .insert({
      user_id: opts.userId,
      symbol: opts.symbol.trim().toUpperCase(),
      direction: opts.direction,
      entry: opts.entry,
      stop: opts.stop,
      target: opts.target,
      thesis: opts.thesis.trim(),
    } as never)
    .select(CALL_COLUMNS)
    .single();

  if (error || !data) {
    const plain = plainForLevelError(error?.message ?? '');
    if (plain) throw new ApiError('VALIDATION_FAILED', plain);
    log('warn', opts.requestId, 'social.call_insert_failed', { message: error?.message });
    throw new ApiError('INTERNAL', 'I could not publish that call. Please try again.');
  }
  return toCallRow(data as Record<string, unknown>);
}

/**
 * Withdraw. Only the author, and only while it is still open: a call that has
 * already resolved is a fact, and letting somebody delete their losses would
 * make every remaining record worthless.
 */
export async function withdrawCall(opts: {
  userId: string;
  callId: string;
  requestId: string;
}): Promise<CallRow> {
  const db = serviceClient();
  const found = await db
    .from('community_calls')
    .select(CALL_COLUMNS)
    .eq('id', opts.callId)
    .maybeSingle();
  const row = found.data ? toCallRow(found.data as Record<string, unknown>) : null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that call.');
  // Not FORBIDDEN with a different sentence: somebody else's call is not
  // something this route confirms the existence of.
  if (row.user_id !== opts.userId) throw new ApiError('NOT_FOUND', 'I could not find that call.');
  if (row.status === 'withdrawn') return row;
  if (row.status !== 'open') {
    throw new ApiError(
      'STATE_CONFLICT',
      'That call has already resolved, so it stays on your record. Withdrawing is for a call that is still open.'
    );
  }

  const { data, error } = await db
    .from('community_calls')
    .update({ status: 'withdrawn', resolved_at: new Date().toISOString() })
    .eq('id', opts.callId)
    .eq('user_id', opts.userId)
    .eq('status', 'open')
    .select(CALL_COLUMNS)
    .maybeSingle();
  if (error) {
    log('warn', opts.requestId, 'social.call_withdraw_failed', { message: error.message });
    throw new ApiError('INTERNAL', 'I could not withdraw that call. Please try again.');
  }
  // The row moved out of `open` between the read and the write — the resolver
  // got there first. Its answer stands.
  if (!data) {
    throw new ApiError(
      'STATE_CONFLICT',
      'That call resolved while you were withdrawing it, so it stays on your record.'
    );
  }
  return toCallRow(data as Record<string, unknown>);
}
