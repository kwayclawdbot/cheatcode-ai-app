/**
 * WHO WROTE THIS, ON EVERY SOCIAL SURFACE.
 *
 * One loader, batched, used by the feed, the board, the calls list and the
 * profile. The alternative — a profile read per row — is the classic N+1 that
 * turns a fifty-row board into fifty-one round trips, and it is the reason
 * `lib/round4/alerts-feed.ts` batches its identity the same way.
 *
 * IDENTITY COMES FROM `profiles_public` (0015), NEVER FROM `profiles`. That
 * view exists precisely so one member's display identity is readable by
 * another; reading the base table with the service role would work and would be
 * the first step towards a route that reads a column the view deliberately does
 * not carry. The view holds handle, display name, avatar and role labels, and
 * nothing financial.
 *
 * THE BELT IS PART OF IDENTITY NOW. It comes from `user_points.belt`, which is
 * a high-water mark (0039 §3), and a member with no row there has never
 * resolved anything and is White — which is not an insult and is not an error.
 */
import type { Belt, SocialAuthor } from '@shared/api';
import { serviceClient } from '../db';

/** Everything a card needs to draw a person, and nothing else. */
export type AuthorMap = Map<string, SocialAuthor>;

/**
 * The letter on the avatar when there is no picture. First letter of whatever
 * we are calling them; a bullet when they have given us nothing at all, because
 * a blank circle reads as a broken image and a bullet reads as a person.
 */
function initialFor(name: string): string {
  const ch = [...name].find((c) => /[\p{L}\p{N}]/u.test(c));
  return ch ? ch.toUpperCase() : '·';
}

/**
 * What to call somebody. A display name if they set one, otherwise their
 * handle, otherwise "A member" — never an email address and never a raw uuid,
 * which are the two things a fallback like this usually leaks.
 */
export function displayNameFor(row: { display_name?: unknown; handle?: unknown }): string {
  const name = typeof row.display_name === 'string' ? row.display_name.trim() : '';
  if (name) return name;
  const handle = typeof row.handle === 'string' ? row.handle.trim() : '';
  if (handle) return `@${handle}`;
  return 'A member';
}

/** `@handle` when they have one, otherwise their name. The subject of a fan-out sentence. */
export function mentionFor(author: SocialAuthor): string {
  return author.handle ? `@${author.handle}` : author.display_name;
}

/**
 * WHAT BELT EACH OF THESE PEOPLE IS ON — THE ONLY ANSWER TO THAT QUESTION.
 *
 * There is exactly one derivation of a member's rank in this codebase and this
 * is it: `user_points.belt`, which 0039 §3 maintains as a HIGH-WATER MARK, so
 * it is read and never recomputed from the points beside it. A second copy of
 * this rule — an inline `select` in another loader, a `belt_for()` reimplemented
 * on points in TypeScript — would not fail loudly; it would quietly disagree,
 * and the same member would wear one belt on their call card and a different
 * one on the message that call arrived in.
 *
 * ONE ROUND TRIP FOR A WHOLE PAGE, keyed by user id. Both author loaders call
 * it inside their own `Promise.all`, so it runs beside the profile read rather
 * than after it and costs a query, not a wait.
 *
 * A MEMBER WITH NO ROW IS WHITE, NOT UNKNOWN. `user_points` only gains a row
 * when something resolves, so an absence here means "has never resolved
 * anything", which is precisely what the bottom rung is. Callers who need to
 * say "this thing has no rank at all" — Kai, a deleted account — must not go
 * through this function; they have no user id to ask about in the first place.
 */
export async function beltsFor(userIds: string[]): Promise<Map<string, Belt>> {
  const out = new Map<string, Belt>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return out;

  const db = serviceClient();
  const { data } = await db.from('user_points').select('user_id,belt').in('user_id', ids);
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    // `?? 'white'` rather than `|| 'white'` would keep an empty string, and an
    // empty string is not a rung. A null column and a missing row mean the
    // same thing here and get the same answer.
    out.set(String(r.user_id), (String(r.belt ?? '') || 'white') as Belt);
  }
  return out;
}

/**
 * Load every author in one pair of round trips. Ids that do not resolve are
 * simply absent from the map; callers drop the row rather than render a person
 * who is not there (a deleted account cascades its rows away, but a feed
 * assembled mid-delete can still be holding one).
 */
export async function loadAuthors(userIds: string[], _requestId = '-'): Promise<AuthorMap> {
  const out: AuthorMap = new Map();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return out;

  const db = serviceClient();
  const [profiles, belts] = await Promise.all([
    // `stage` is one more column on a query that was already running - 0044
    // put it on the view precisely so this costs no extra round trip.
    db.from('profiles_public').select('user_id,handle,display_name,avatar_url,stage').in('user_id', ids),
    beltsFor(ids),
  ]);

  for (const r of (profiles.data ?? []) as Record<string, unknown>[]) {
    const id = String(r.user_id);
    const display = displayNameFor(r);
    out.set(id, {
      user_id: id,
      handle: (r.handle as string) ?? null,
      display_name: display,
      avatar_url: (r.avatar_url as string) ?? null,
      initial: initialFor(display),
      belt: belts.get(id) ?? 'white',
      // Null rather than 'beginner' when the column is empty: a profile written
      // before 0042 has no stage, and guessing one is how a veteran ends up
      // wearing a beginner's tag.
      stage: (r.stage as SocialAuthor['stage']) ?? null,
    });
  }
  return out;
}

/** One author, for the routes that only ever need the one. */
export async function loadAuthor(userId: string, requestId = '-'): Promise<SocialAuthor | null> {
  return (await loadAuthors([userId], requestId)).get(userId) ?? null;
}
