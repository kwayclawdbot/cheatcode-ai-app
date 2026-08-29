/**
 * One question, handed from the portal's search field to the portal's Kai thread.
 *
 * The top-bar search opens the ticker switcher. Typing something that is not a
 * symbol there is not a dead end — spec 10 §7 keeps search and Kai on the same
 * input, so "NVDA into earnings" becomes a question rather than "Nothing
 * matched that." The sheet cannot send it itself: the conversation belongs to
 * `useKaiPortal`, which is mounted by the screen underneath.
 *
 * So the sheet publishes and the thread subscribes. A bus rather than a prop
 * because the two live on opposite sides of the screen's render tree, and a
 * question that arrives while the sheet is closing must still be delivered.
 */
type Listener = (question: string) => void;

const listeners = new Set<Listener>();
let pending: string | null = null;

/** Ask the portal's Kai thread a question. Held until a thread is listening. */
export function publishAsk(question: string): void {
  const q = question.trim();
  if (!q) return;
  if (!listeners.size) { pending = q; return; }
  listeners.forEach((l) => l(q));
}

/** Subscribe the mounted thread. A question published moments ago is replayed. */
export function subscribeAsk(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const q = pending;
    pending = null;
    listener(q);
  }
  return () => { listeners.delete(listener); };
}
