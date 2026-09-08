/**
 * THE THREE CHATS, AND WHICH ONE A DESK OPENS INTO.
 *
 * Owner decision, 8 Sept 2026, in their words: "Just make it traders chat,
 * investors chat and beginners chat." Migration 0045 is the half that lives in
 * the database — it merged Day Trade and Swing into one room and took `mode`
 * off all three rows — and `apps/api/src/lib/social/rooms-bridge.ts` holds the
 * server's copy of the map below. This is the phone's.
 *
 * WHY THE PHONE NEEDS ITS OWN COPY AT ALL, given the server has one: the server
 * uses it to decide where a PUBLISHED CALL lands, which is a write. This one
 * decides which room to OPEN for somebody who has never chosen — a first-run
 * default, before anything is written anywhere. Asking the API "which room
 * would my mode open?" would be a round trip to learn a fact that is three
 * lines long and changes when a migration changes it.
 *
 * IT IS A DEFAULT AND NOTHING MORE. Since the room switcher stopped writing
 * `primary_mode` (audit F13), the mode picks the FIRST room you see and never
 * picks another one again: after that, the room you were last in is the room
 * you get. See `last-room.ts`.
 *
 * SLUGS, NOT IDS. Room ids are `gen_random_uuid()` and differ between local,
 * staging and hosted; the slug is the same everywhere. 0043 §4(ii) states this
 * rule and 0045 keeps it — the three slugs are `traders`, `investors`,
 * `beginners`.
 */
import type { GoalMode } from '../../lib/types';

export type ChatSlug = 'traders' | 'investors' | 'beginners';

/**
 * The order the switcher and the directory read in. Not a horizon scale — two
 * of the three desks share the first room — so it is simply the order the owner
 * said them in, and the API's `ROOM_ORDER` matches.
 */
export const CHAT_ORDER: ChatSlug[] = ['traders', 'investors', 'beginners'];

/**
 * Which chat a desk opens into.
 *
 * `day_trade` and `swing` share Traders because somebody watching an intraday
 * break and somebody holding for three weeks are the same room of people.
 * NOTHING maps to Beginners: that room is a STAGE of the member and not a desk
 * (0043 §1), so it is reached by choosing it, never by having a mode.
 */
export const ROOM_FOR_MODE: Record<GoalMode, ChatSlug> = {
  day_trade: 'traders',
  swing: 'traders',
  invest: 'investors',
};

/** Where the sort puts a room this build has never heard of: last, not hidden. */
export function chatRank(slug: string | null | undefined): number {
  const i = CHAT_ORDER.indexOf(String(slug) as ChatSlug);
  return i === -1 ? CHAT_ORDER.length : i;
}
