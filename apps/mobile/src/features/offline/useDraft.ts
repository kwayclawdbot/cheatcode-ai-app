/**
 * "DRAFT SAVED" — the words in the composer survive the app closing.
 *
 * The recovery board shows a member offline, mid-question, with "Draft saved"
 * beside the send button. That is not decoration: the moment worth protecting
 * is somebody typing a real question, losing signal, and backgrounding the app.
 * Today those words live in React state on a screen that is about to unmount.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT USES THE CHANNEL THAT ALREADY EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * `Composer` gained `draft` / `draftNonce` in the Kai lane, for putting a failed
 * turn's words back in the field. A saved draft is the same event — text
 * arriving from outside, once, on purpose — so it rides the same two props
 * rather than a second mechanism that would fight the first for the same input.
 * That is why this hook hands back `{ draft, draftNonce }` shaped exactly for
 * them, and why the caller passes ONE source into the composer at a time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CAN AND CANNOT SEE, AND WHY THAT IS HONEST
 * ─────────────────────────────────────────────────────────────────────────────
 * `Composer` owns its own `value` and exposes no `onChangeText`, and this lane
 * does not own that file — so nothing here can watch a member type. What it CAN
 * see is the moment that actually matters: a turn that was sent and did not
 * reach the server. `useKaiWall` hands those words back (`failed.restore`), and
 * they are what gets written here. So the promise this makes is the one it can
 * keep — *the question you tried to ask is saved* — rather than a keystroke
 * mirror it cannot implement. Widening it to every keystroke is one prop on
 * `Composer` away and is noted for whoever owns that file next.
 *
 * `restored` says whether what is in the field came out of storage, which is
 * what earns the "Draft saved" mark. A member who has typed nothing sees no
 * mark — claiming to have saved an empty draft is a claim about nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = (scope: string, name: string) => `cc.draft.v1.${scope}.${name}`;

/** Long enough to survive a commute; short enough that last week's half-thought is gone. */
export const DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

type Stored = { text: string; at: number };

export type Draft = {
  /** The stored text, for `Composer`'s `draft` prop. '' when there is none. */
  draft: string;
  /** Bumps once when a stored draft is restored — `Composer`'s `draftNonce`. */
  draftNonce: number;
  /** True when the field currently holds words that came out of storage. */
  restored: boolean;
  /** Remember these words. Empty text clears the record instead. */
  save: (text: string) => void;
  /** The words were sent or abandoned. */
  clear: () => void;
};

export function useDraft(scope: string, name: string): Draft {
  const [draft, setDraft] = useState('');
  const [draftNonce, setDraftNonce] = useState(0);
  const [restored, setRestored] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY(scope, name));
        if (!raw || !ok || !alive.current) return;
        const parsed = JSON.parse(raw) as Stored;
        if (!parsed?.text?.trim()) return;
        // An expired draft is removed rather than restored: putting words a
        // member wrote two days ago back in the field reads as the app talking.
        if (!Number.isFinite(parsed.at) || Date.now() - parsed.at > DRAFT_MAX_AGE_MS) {
          void AsyncStorage.removeItem(KEY(scope, name)).catch(() => {});
          return;
        }
        setDraft(parsed.text);
        setDraftNonce((n) => n + 1);
        setRestored(true);
      } catch {
        /* no store, no draft. The composer starts empty, as it always did. */
      }
    })();
    return () => { ok = false; };
  }, [scope, name]);

  const save = useCallback((text: string) => {
    if (!text.trim()) {
      void AsyncStorage.removeItem(KEY(scope, name)).catch(() => {});
      return;
    }
    setDraft(text);
    setRestored(true);
    void AsyncStorage.setItem(KEY(scope, name), JSON.stringify({ text, at: Date.now() } satisfies Stored)).catch(() => {});
  }, [scope, name]);

  const clear = useCallback(() => {
    setRestored(false);
    setDraft('');
    void AsyncStorage.removeItem(KEY(scope, name)).catch(() => {});
  }, [scope, name]);

  return { draft, draftNonce, restored, save, clear };
}
