/**
 * WHICH CONVERSATION IS THIS, ACTUALLY. (audit F04, P0 — with F05 riding on it)
 * ===========================================================================
 *
 * THE BUG THIS EXISTS TO MAKE IMPOSSIBLE. `useKaiWall` used to take `(mode,
 * seed)` and keep its own `convoId` in a ref. Home stored the selected
 * `ConversationRow` and changed the SEED TEXT — nothing else. So opening
 * "NVIDIA Earnings Research" printed "Picking up NVIDIA Earnings Research" and
 * then sent the next turn to whatever conversation the ref happened to be
 * holding, which was usually the one created when Home first loaded. "New
 * conversation" changed the seed too, and reset nothing. The screen named one
 * thread and talked to another, and the saved messages were never fetched at
 * all, so nobody could see the mismatch.
 *
 * The fix is not "remember to reset the ref". It is to make the thread an
 * INPUT, and to make every write to the screen carry the identity of the thread
 * it was started for. That is what this file is: the identity, and the gate.
 *
 * A GENERATION IS A THREAD-SITTING. Pointing the wall somewhere else bumps it.
 * Work started under generation 7 may only touch the screen while the wall is
 * still on generation 7 — checked at the moment of writing, not the moment of
 * starting. A reply that arrives late is therefore not "unlikely" to land in
 * the wrong conversation; it has nowhere to land. The same gate covers a
 * conversation id that the server returns after the user has already moved on
 * (`adopt` refuses it) and a failed turn that is still offering a retry
 * (`retryableTurn` refuses it).
 *
 * WHY THIS IS A SEPARATE FILE AND NOT PART OF `useKai.ts`. Everything here is
 * pure — no React, no fetch, no react-native — so `scripts/kai-continuity-test.mts`
 * can drive it directly. `useKai.ts` cannot even be imported by a node script:
 * it reaches react-native through the API client.
 */
import type { WallItem } from './types';

/* ==================================================================== */
/* What the wall is pointed at                                           */
/* ==================================================================== */

/**
 * `today` is the conversation Kai woke into — created lazily on the first turn
 * and kept for the life of the mount. `new` is a deliberate fresh start, and
 * the nonce is what makes a SECOND "new" a different thread from the first.
 * `saved` is a row from the drawer, and it is bound to that server id from the
 * instant it is chosen — before a single word is sent.
 */
export type ThreadTarget =
  | { kind: 'today' }
  | { kind: 'new'; nonce: number }
  | { kind: 'saved'; id: string };

/** A stable string for a target, so a re-render is not a thread switch. */
export function targetKey(t: ThreadTarget): string {
  if (t.kind === 'saved') return `saved:${t.id}`;
  if (t.kind === 'new') return `new:${t.nonce}`;
  return 'today';
}

export function sameTarget(a: ThreadTarget, b: ThreadTarget): boolean {
  return targetKey(a) === targetKey(b);
}

/** What pointing the wall somewhere else asks the caller to do, in order. */
export type Retarget = {
  /** False when this was a re-render, not a switch. Nothing may be reset. */
  changed: boolean;
  /** The generation everything started from here must be stamped with. */
  generation: number;
  /** There was a stream running for the old thread. Abandon it FIRST. */
  abort: boolean;
  /** A saved conversation whose transcript should be fetched, or null. */
  load: string | null;
};

export type ThreadBinding = {
  generation(): number;
  conversationId(): string | null;
  target(): ThreadTarget;
  key(): string;
  /** Point the wall at another thread. `streaming` is the caller's own state. */
  point(next: ThreadTarget, streaming?: boolean): Retarget;
  /** Record a conversation the server just made. Refused once the wall moved. */
  adopt(generation: number, id: string): boolean;
  /** May work stamped `generation` still write to the screen? */
  owns(generation: number): boolean;
};

/**
 * Always starts on `today` at generation 0 and knows no conversation. A wall
 * that mounts pointed at a saved thread therefore performs a real switch on its
 * first effect — which is exactly what loads the transcript.
 */
export function createThreadBinding(): ThreadBinding {
  let generation = 0;
  let target: ThreadTarget = { kind: 'today' };
  let conversationId: string | null = null;

  return {
    generation: () => generation,
    conversationId: () => conversationId,
    target: () => target,
    key: () => targetKey(target),
    owns: (g) => g === generation,

    point(next, streaming = false) {
      if (sameTarget(target, next)) {
        return { changed: false, generation, abort: false, load: null };
      }
      generation += 1;
      target = next;
      // A saved thread IS its server id. Everything else earns one on first use.
      conversationId = next.kind === 'saved' ? next.id : null;
      return {
        changed: true,
        generation,
        abort: streaming,
        load: next.kind === 'saved' ? next.id : null,
      };
    },

    adopt(g, id) {
      if (g !== generation) return false;
      conversationId = id;
      return true;
    },
  };
}

/* ==================================================================== */
/* Saved messages                                                        */
/* ==================================================================== */

export type SavedTurn = { seq: number; role: 'user' | 'kai'; text: string };

/**
 * `conversation_messages` rows, whatever shape they arrive in. `content` is
 * jsonb written by the API as `{text}`; older rows and hand-written ones can be
 * a bare string. A row with nothing readable in it is DROPPED rather than
 * rendered as an empty bubble — a gap in the transcript is honest, a blank
 * speech bubble is a bug wearing a costume.
 */
export function readTranscript(rows: unknown): SavedTurn[] {
  if (!Array.isArray(rows)) return [];
  const out: SavedTurn[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as { seq?: unknown; role?: unknown; content?: unknown };
    const seq = typeof row.seq === 'number' ? row.seq : Number(row.seq);
    if (!Number.isFinite(seq)) continue;
    const content = row.content;
    const text =
      typeof content === 'string'
        ? content
        : content && typeof content === 'object' && typeof (content as { text?: unknown }).text === 'string'
          ? (content as { text: string }).text
          : '';
    if (!text.trim()) continue;
    out.push({ seq, role: row.role === 'user' ? 'user' : 'kai', text });
  }
  return out.sort((a, b) => a.seq - b.seq);
}

/**
 * Saved turns as wall items. The ids are derived from the conversation and the
 * sequence, so loading the same transcript twice cannot duplicate it and an id
 * from one thread can never collide with an id from another.
 */
export function transcriptItems(conversationId: string, turns: SavedTurn[]): WallItem[] {
  return turns.map((t) =>
    t.role === 'user'
      ? { kind: 'user_text', id: `h:${conversationId}:${t.seq}`, text: t.text }
      : { kind: 'kai_text', id: `h:${conversationId}:${t.seq}`, text: t.text },
  );
}

/* ==================================================================== */
/* Recovery (F05)                                                        */
/* ==================================================================== */

/**
 * A turn that did not happen. `restore` is true when NOTHING streamed back —
 * the turn is then lifted out of the wall entirely and the words go back into
 * the composer, because a half-turn sitting above an error line is work the
 * member has to reconstruct. When something did stream, the partial answer
 * stays and the question stays with it; retry is still offered, but the
 * composer is left alone so a retry cannot silently double the question.
 */
export type FailedTurn = {
  generation: number;
  text: string;
  plain: string;
  restore: boolean;
};

/** A failure belongs to the thread it happened in, and to no other. */
export function retryableTurn(failed: FailedTurn | null, generation: number): FailedTurn | null {
  return failed && failed.generation === generation ? failed : null;
}

/* ==================================================================== */
/* Short suggested questions (F05)                                       */
/* ==================================================================== */

export type SuggestionSubject =
  | { kind: 'today' }
  | { kind: 'new' }
  | { kind: 'saved' }
  | { kind: 'symbol'; symbol: string }
  | { kind: 'setup'; symbol?: string | null };

/**
 * Three at most, short enough to read as a row of pills, and tied to whatever
 * object is on screen.
 *
 * THEY CONTAIN NO NUMBERS, EVER. A suggestion is a question the member could
 * have typed, not a claim: the moment one says "is 504 still the level" the app
 * has invented a price and put it in the member's mouth. The test asserts the
 * absence of digits for exactly that reason.
 */
export function suggestedQuestions(subject: SuggestionSubject): string[] {
  if (subject.kind === 'symbol') {
    const s = subject.symbol.toUpperCase();
    return [`What changed in ${s} today?`, `Is there a setup in ${s}?`, `Where would it fail?`];
  }
  if (subject.kind === 'setup') {
    const s = subject.symbol ? subject.symbol.toUpperCase() : null;
    return [
      s ? `Why is ${s} graded this way?` : 'Why is it graded this way?',
      'Where does this idea fail?',
      'How much should I risk?',
    ];
  }
  if (subject.kind === 'saved') {
    return ['Where did we leave this?', 'What has changed since?', 'What should I do next?'];
  }
  if (subject.kind === 'new') {
    return ['What is worth watching today?', 'Check a symbol for me', 'Review my rules'];
  }
  return ['What should I look at first?', 'What changed overnight?', 'How did I do this week?'];
}
