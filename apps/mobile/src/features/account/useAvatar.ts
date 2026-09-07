/**
 * THE MEMBER'S OWN PROFILE PICTURE — pick it, send it, write it down.
 *
 * Owner, 6 Sept: "there's no way to add profile picture after onboarding."
 * There was not. Onboarding never asked for a photo and the Account board drew
 * a row that said the upload "arrives with the next release". Every piece it
 * needed already existed and had only ever been wired up for the admin rooms
 * board, which is why this is a small file.
 *
 * THREE STEPS, IN THIS ORDER, AND EACH ONLY IF THE ONE BEFORE IT WORKED:
 *
 *   1. `pickPhotos(1, …)` — the same picker a post uses, asked for one photo at
 *      avatar size. It handles the permission prompt, the member backing out,
 *      and the iPhone .heic a desktop browser cannot decode.
 *   2. `api.uploadAvatar(photo)` — `POST /api/v1/media` with `purpose=avatar`.
 *      The bytes are stripped of location and camera data on the server and
 *      written to a private bucket. It hands back the STABLE address, which is
 *      an address on our own API that redirects to a freshly signed storage
 *      link on every fetch — never the signed link itself, which expires.
 *   3. `PUT /api/v1/settings` with `{ avatar_url }` — the only thing that
 *      writes `profiles.avatar_url`.
 *
 * WHY THE ORDER MATTERS AND WHY NOTHING IS OPTIMISTIC. A picture has to exist
 * at an address before that address can be written onto the member. And unlike
 * the switches on the same screen, this cannot move first and revert on
 * failure: there is no local copy of the picture to draw, so an optimistic
 * avatar would be a broken image apologising for itself. The row says what it
 * is doing while it does it, and the picture appears when the server has it.
 *
 * EVERY OUTCOME GETS A SENTENCE, AND NONE OF THEM IS A CODE. Refused
 * permission, backed out, too big, a format this browser cannot read, the
 * upload failing, the save failing — six different things happen and a member
 * should be able to tell which one from reading one line. Backing out of the
 * picker is the exception: it is not a failure and it says nothing at all.
 */
import { useCallback, useState } from 'react';
import { api } from '../../lib/api';
import { AVATAR_EDGE, MAX_AVATAR_BYTES, pickPhotos } from '../media/pick';

/** What the row is doing right now, in the words it shows. */
export type AvatarStage = 'idle' | 'uploading' | 'saving' | 'removing';

const STAGE_LABEL: Record<Exclude<AvatarStage, 'idle'>, string> = {
  uploading: 'Sending your picture…',
  saving: 'Almost there…',
  removing: 'Removing…',
};

/**
 * WHY THIS CALLS `api.putSettings` RATHER THAN `useSettingsWriter`.
 *
 * That hook is the right one for the switches on this board and it is used
 * unchanged for them. It is wrong HERE for two reasons, and the second is a
 * bug rather than a preference:
 *
 *   · It keeps its own `error` in React state. Reading `writer.error` straight
 *     after `await writer.save(…)` inside one callback reads the value from the
 *     render that is still on screen — the failure has not been rendered yet —
 *     so the member would always get a generic fallback instead of the server's
 *     own sentence ("A profile picture has to be one you uploaded here.").
 *   · Its errors would land on the board's shared error line, underneath the
 *     trade-sharing toggle, which is a privacy control and not the place to
 *     explain a photo that would not upload.
 *
 * It is the same route and the same client method either way — `PUT /settings`.
 */
async function writeAvatarUrl(url: string | null, reload: () => void): Promise<string | null> {
  try {
    await api.putSettings({ avatar_url: url });
    // Re-read `/me` so the header and the row draw the picture the server
    // actually holds, rather than the one this screen hoped it wrote.
    reload();
    return null;
  } catch (e) {
    return e instanceof Error && e.message ? e.message : null;
  }
}

export function useAvatar(reload: () => void) {
  const [stage, setStage] = useState<AvatarStage>('idle');
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== 'idle';
  const working = busy ? STAGE_LABEL[stage as Exclude<AvatarStage, 'idle'>] : null;

  /**
   * NOT CONNECTED IS A REAL ANSWER, NOT AN ERROR TO HIDE. Run against fixtures
   * there is no server to take the bytes, and a picker that opened and then
   * silently did nothing would look like a bug in the app.
   */
  const offline = () => {
    setError('Pictures are stored on the server, and it is not connected here.');
    return false;
  };

  const choose = useCallback(async () => {
    if (busy) return;
    setError(null);
    if (!api.available()) { offline(); return; }

    const outcome = await pickPhotos(1, {
      maxEdge: AVATAR_EDGE,
      maxBytes: MAX_AVATAR_BYTES,
      what: 'a profile picture',
    });
    if (!outcome.ok) {
      // Closing the picker is a decision, not a problem. Everything else — the
      // permission refusal, the unreadable file, the one that is too big —
      // already carries the sentence explaining itself.
      if (outcome.reason !== 'cancelled') setError(outcome.plain);
      return;
    }
    const photo = outcome.photos[0];
    if (!photo) {
      setError(outcome.skipped[0] ?? 'That picture could not be used. JPEG and PNG always work.');
      return;
    }

    setStage('uploading');
    let url: string;
    try {
      url = await api.uploadAvatar(photo);
    } catch (e) {
      setStage('idle');
      setError(e instanceof Error ? e.message : 'That picture would not upload. Try it again, or try another photo.');
      return;
    }

    // The bytes are up. Only the address is left to write, and saying which
    // half failed is the difference between "try again" and "try another
    // photo" — so the two stages have two messages.
    setStage('saving');
    const failed = await writeAvatarUrl(url, reload);
    setStage('idle');
    if (failed !== null) {
      setError(failed || 'Your picture went up but it did not save to your profile. Try that once more.');
    }
  }, [busy, reload]);

  const remove = useCallback(async () => {
    if (busy) return;
    setError(null);
    if (!api.available()) { offline(); return; }

    // `null`, never an empty string. The settings route reads null as "clear
    // it" and the database guard turns a blank into null anyway; sending the
    // value the API actually documents keeps the two from disagreeing.
    setStage('removing');
    const failed = await writeAvatarUrl(null, reload);
    setStage('idle');
    if (failed !== null) setError(failed || 'That did not save. Try it once more.');
  }, [busy, reload]);

  return { choose, remove, busy, stage, working, error };
}
