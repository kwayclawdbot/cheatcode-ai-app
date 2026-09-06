/**
 * Saying a member's name once.
 *
 * THE BUG THIS EXISTS TO STOP, found by publishing a real call against a real
 * stack: a member who has picked a handle but never set a display name comes
 * back from the API with `display_name` = "@proofcaller", because
 * `displayNameFor()` falls back to the handle rather than leaking an email or a
 * raw uuid — which is the right fallback. But every author line then rendered
 * the name AND the handle underneath it, so the card read:
 *
 *     @proofcaller
 *     @proofcaller
 *
 * That is the exact thing `features/community/ui/Message.tsx` already refuses
 * to do, in a comment that is worth repeating here because this is the second
 * place it came up: the handle line "never repeats the display name with an @
 * in front of it, because that would be a mention nobody can type."
 *
 * The fix belongs on the phone and not in the API. `display_name` being the
 * handle is CORRECT for a fan-out sentence — "@proofcaller went long NVDA" is
 * exactly right — and only wrong when something puts the two on top of each
 * other. So the server keeps its honest fallback and the surfaces that stack
 * the two lines ask this first.
 */

/** The handle to print BELOW a name, or null when it would just repeat it. */
export function secondaryHandle(
  displayName: string | null | undefined,
  handle: string | null | undefined
): string | null {
  const h = typeof handle === 'string' ? handle.trim() : '';
  if (!h) return null;
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  // Compared case-insensitively because handles are unique case-insensitively
  // (0034's `lower(handle)` index) while display is not, so "@Dee" and "@dee"
  // are one person and stacking them would still be the same word twice.
  //
  // ONLY THE @-PREFIXED FORM COUNTS AS A REPEAT, and an earlier version of this
  // function got that wrong: it also suppressed the handle when the name merely
  // MATCHED it, which hid "@jordan" under the name "Jordan". Those are not the
  // same string doing the same job. "Jordan" is what he is called and "@jordan"
  // is how you type him into a room, and the second is the only place a member
  // learns the first can be mentioned at all. The proof run caught it.
  if (name.toLowerCase() === `@${h}`.toLowerCase()) return null;
  return `@${h}`;
}
