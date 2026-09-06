/**
 * Usernames, server side.
 *
 * The RULES are in `@shared/handles` — one copy, shared with the phone so the
 * box can go red as you type without a round trip. This file is the part that
 * needs a database: is it free, what else could you have, and the sentence a
 * member reads when the answer is no.
 *
 * =====================================================================
 * THIS IS NOT THE LAST LOCK, AND IT SHOULD NOT PRETEND TO BE
 * =====================================================================
 * `authenticated` holds INSERT and UPDATE on `profiles` with an owner policy
 * (0014), so the phone can write its own `handle` straight through PostgREST
 * without ever reaching this API. Everything here is therefore a courtesy: it
 * exists so a person gets "that one is kept for the team" instead of
 * `new row for relation "profiles" violates check constraint`.
 *
 * The rule that actually holds is `profiles_identity_guard` (0034), a trigger
 * on `profiles` that runs for every role through every door, plus
 * `profiles_handle_lower_idx` for case-insensitive uniqueness. If you change a
 * rule, change it there first and mirror it here second.
 */
import {
  HANDLE_TAKEN_PLAIN,
  checkHandle,
  handleSuggestions,
  isReservedHandle,
  normaliseHandle,
  suggestFromDisplayName,
} from '@shared/handles';
import type { HandleCheckResponse } from '@shared/api';
import { serviceClient } from './db';
import { ApiError } from './errors';

/**
 * Is this handle free?
 *
 * Compared FOLDED (`lower(handle)`), which is the same comparison the unique
 * index makes — so this and the database can never disagree about whether
 * `Kway` and `kway` are the same name.
 *
 * `exceptUserId` is the person asking. Re-saving your own handle, or changing
 * only its capitalisation, is not a collision with yourself.
 */
export async function handleIsFree(handle: string, exceptUserId?: string): Promise<boolean> {
  const db = serviceClient();
  // 0034's `handle_available()`, NOT `.ilike('handle', wanted)`. In SQL, LIKE
  // reads `_` as "any single character", so an ilike check would tell somebody
  // asking for `kway_x` that an existing `kwayXx` had taken it — and would let
  // `k_______x` collide with almost everybody.
  const { data, error } = await db.rpc('handle_available', {
    p_handle: normaliseHandle(handle),
    p_except: exceptUserId ?? null,
  });
  if (error) {
    // A read that failed is not an answer. Say so, rather than guessing "free"
    // and letting the write fail on the index with a message no member should
    // ever be shown.
    throw new ApiError('INTERNAL', 'I could not check that username just now. Please try again.', {
      detail: error.message,
    });
  }
  return data === true;
}

/** Only suggestions that are actually free are ever returned. */
export async function freeSuggestions(base: string, want = 3): Promise<string[]> {
  const candidates = handleSuggestions(base, want * 3);
  const out: string[] = [];
  for (const c of candidates) {
    if (out.length >= want) break;
    if (await handleIsFree(c)) out.push(c);
  }
  return out;
}

/** The whole answer for `GET /handles/check`. */
export async function describeHandle(raw: string, forUserId?: string): Promise<HandleCheckResponse> {
  const handle = (raw ?? '').trim();
  const verdict = checkHandle(handle);

  if (!verdict.ok) {
    return {
      handle,
      valid: false,
      reserved: verdict.reason === 'reserved',
      available: false,
      plain: verdict.plain,
      /**
       * NO SUGGESTIONS HERE, and the reserved case is the reason.
       *
       * Offering `everyone2` to somebody who asked for `everyone` hands them
       * the next best thing to the name we just refused — a handle that reads
       * as the announcement scope at a glance, which is most of what made
       * `everyone` worth reserving. The same argument applies to `kai2` and
       * `admin2`. A malformed handle gets none either: the fix is to type it
       * differently, not to accept a near-miss of a mistake.
       *
       * Alternatives are for a COLLISION — a real name somebody else got to
       * first — and that is the only place they are offered.
       */
      suggestions: [],
    };
  }

  const free = await handleIsFree(handle, forUserId);
  return {
    handle,
    valid: true,
    reserved: false,
    available: free,
    plain: free ? null : HANDLE_TAKEN_PLAIN,
    suggestions: free ? [] : await freeSuggestions(handle),
  };
}

/**
 * Validate a handle on its way into `profiles`, and throw the sentence a
 * member should read if it cannot go in.
 *
 * Returns the handle to STORE — trimmed, in the case the person typed. It is
 * not lowercased: `MarcusT` is displayed as `MarcusT`. Only the comparison is
 * folded, and that is the index's job.
 */
export async function handleForStorage(raw: string, userId: string): Promise<string> {
  const handle = (raw ?? '').trim();
  const verdict = checkHandle(handle);
  if (!verdict.ok) {
    throw new ApiError('VALIDATION_FAILED', verdict.plain, { detail: { reason: verdict.reason } });
  }
  if (!(await handleIsFree(handle, userId))) {
    const suggestions = await freeSuggestions(handle);
    throw new ApiError(
      'VALIDATION_FAILED',
      suggestions.length
        ? `${HANDLE_TAKEN_PLAIN} ${suggestions.join(', ')} ${suggestions.length === 1 ? 'is' : 'are'} free.`
        : HANDLE_TAKEN_PLAIN,
      { detail: { reason: 'taken', suggestions } }
    );
  }
  return handle;
}

/**
 * What the Account tab reads to decide whether to ask, and what to put in the
 * box when it does.
 *
 * A SUGGESTION IS ONLY EVER A SUGGESTION. `suggested_handle` is pre-filled for
 * the person to accept or overwrite and nothing is stored until they save it.
 * It is derived from their display name and NEVER from their email address —
 * calling somebody by their login is a username wearing a name's clothes.
 */
export async function identityBlock(profile: {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}): Promise<{
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  needs_handle: boolean;
  suggested_handle: string | null;
  plain: string;
  route: string;
}> {
  const needs = !profile.handle;
  let suggested: string | null = null;

  if (needs) {
    const seed = suggestFromDisplayName(profile.display_name);
    if (seed && !isReservedHandle(seed)) {
      suggested = (await handleIsFree(seed, profile.user_id)) ? seed : ((await freeSuggestions(seed, 1))[0] ?? null);
    }
  }

  return {
    handle: profile.handle,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    needs_handle: needs,
    suggested_handle: suggested,
    plain: needs
      ? 'You have not picked a username yet. It is the name your posts are signed with, and the name other members can mention you by.'
      : `You post as ${profile.handle}.`,
    route: '/account/username',
  };
}
