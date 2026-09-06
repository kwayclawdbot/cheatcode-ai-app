/**
 * PICK, UPLOAD, ATTACH — the composer's half of posting a picture, in one hook
 * so the room and a thread behave identically.
 *
 * THE UPLOAD STARTS WHEN THE PICTURE IS PICKED, not when Send is tapped. By the
 * time somebody has typed a sentence the bytes are usually already there, so
 * posting is a small JSON call and feels instant. It also means a failure
 * surfaces while there is still something to do about it — swapping a picture
 * that would not upload is easy; being told after tapping Send that the post
 * did not go is not.
 *
 * NOTHING IS EVER PRETENDED. A thumbnail is the local file, so it draws with no
 * round trip; the row underneath carries the SERVER'S sentence — what it
 * removed from the file, or why it would not take it — and never a rewritten
 * version of it. A picture that failed stays visible with its reason attached
 * rather than vanishing.
 */
import { useCallback, useState } from 'react';
import { communityApi } from '../../lib/community-api';
import { MAX_PER_POST, pickPhotos } from './pick';
import type { Attachment } from '../../ui/AttachmentTray';

export type AttachmentsController = {
  attachments: Attachment[];
  /** The ids to send with the post. Only the ones that actually landed. */
  readyIds: string[];
  /** True while anything is still going up. */
  busy: boolean;
  /** A picker-level message — permission refused, or nothing could be opened. */
  notice: string | null;
  pick: () => Promise<void>;
  remove: (key: string) => void;
  clear: () => void;
  dismissNotice: () => void;
};

export function useAttachments(limit = MAX_PER_POST): AttachmentsController {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const pick = useCallback(async () => {
    setNotice(null);
    const remaining = limit - attachments.length;
    const outcome = await pickPhotos(remaining);

    if (!outcome.ok) {
      // Cancelling is a normal thing to do and says nothing.
      if (outcome.reason !== 'cancelled') setNotice(outcome.plain);
      return;
    }

    const started: Attachment[] = outcome.photos.map((p, i) => ({
      key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      uri: p.uri,
      assetId: null,
      state: 'uploading',
      note: null,
    }));
    setAttachments((prev) => [...prev, ...started]);

    // One at a time. Four concurrent multipart uploads off a phone on a train
    // is how you get four timeouts instead of two pictures.
    for (let i = 0; i < outcome.photos.length; i++) {
      const photo = outcome.photos[i];
      const key = started[i].key;
      try {
        const res = await communityApi.uploadPhoto(photo);
        setAttachments((prev) =>
          prev.map((a) =>
            a.key === key
              ? {
                  ...a,
                  assetId: res.id,
                  state: 'ready',
                  // Only worth saying when something was actually taken out.
                  note: /removed/i.test(res.plain) ? res.plain.replace(/^Added\.\s*/, '') : null,
                }
              : a
          )
        );
      } catch (e) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.key === key
              ? { ...a, state: 'failed', note: e instanceof Error ? e.message : 'That would not upload.' }
              : a
          )
        );
      }
    }
  }, [attachments.length, limit]);

  const remove = useCallback((key: string) => {
    // The row goes; the uploaded object is left for the server's orphan sweep
    // an hour later. Deleting it from here would need a delete endpoint that
    // takes an asset id, which is a surface worth not having for something a
    // scheduled job already handles.
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  }, []);

  const clear = useCallback(() => setAttachments([]), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    attachments,
    readyIds: attachments.filter((a) => a.state === 'ready' && a.assetId).map((a) => a.assetId as string),
    busy: attachments.some((a) => a.state === 'uploading'),
    notice,
    pick,
    remove,
    clear,
    dismissNotice,
  };
}
