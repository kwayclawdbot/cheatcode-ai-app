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
  const [profiles, points] = await Promise.all([
    db.from('profiles_public').select('user_id,handle,display_name,avatar_url').in('user_id', ids),
    db.from('user_points').select('user_id,belt').in('user_id', ids),
  ]);

  const belts = new Map<string, Belt>();
  for (const r of (points.data ?? []) as Record<string, unknown>[]) {
    belts.set(String(r.user_id), (String(r.belt ?? 'white') as Belt) ?? 'white');
  }

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
    });
  }
  return out;
}

/** One author, for the routes that only ever need the one. */
export async function loadAuthor(userId: string, requestId = '-'): Promise<SocialAuthor | null> {
  return (await loadAuthors([userId], requestId)).get(userId) ?? null;
}
