/**
 * Global Kai sheet — module-level store.
 *
 * Audit §5: "Kai is visible everywhere but not fully contextual". Every
 * "Ask Kai" used to route back to Home with a prefilled prompt, which throws
 * the user off the chart / alert / order they were reading. The sheet opens
 * OVER the current screen with that screen's object pinned.
 *
 * The store is deliberately module-level (not a React context) so any lane can
 * call `openKaiSheet({ context })` from a button handler without threading a
 * provider through its tree. The host is mounted once in `app/_layout.tsx`.
 */

/** What the sheet is pinned to. `symbol` is carried on every kind we can. */
export type KaiContext = {
  kind: 'symbol' | 'setup' | 'alert' | 'order' | 'position' | 'room' | 'home';
  /** id of the object (setup id, alert id, order id, position id, room id) */
  id?: string;
  symbol?: string;
  /** optional override for the header line, e.g. "Kai · about your order" */
  label?: string;
};

export type KaiSheetRequest = {
  context: KaiContext;
  /** asked automatically once the sheet opens */
  question?: string;
};

type State = { open: boolean; request: KaiSheetRequest | null; nonce: number };

let state: State = { open: false, request: null, nonce: 0 };
const listeners = new Set<(s: State) => void>();

function emit() {
  listeners.forEach((l) => l(state));
}

export function subscribeKaiSheet(l: (s: State) => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getKaiSheetState(): State {
  return state;
}

/**
 * Open the contextual Kai sheet. Safe to call from any lane, any screen.
 * Re-opening with a different context resets the thread (nonce bump).
 */
export function openKaiSheet(req?: Partial<KaiSheetRequest> & { context?: KaiContext }): void {
  const context: KaiContext = req?.context ?? { kind: 'home' };
  state = { open: true, request: { context, question: req?.question }, nonce: state.nonce + 1 };
  emit();
}

export function closeKaiSheet(): void {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

/** Header line: "Kai · about META" (artboard V5-W2). */
export function kaiSheetTitle(c: KaiContext): string {
  if (c.label) return c.label;
  if (c.symbol) return `Kai · about ${c.symbol}`;
  switch (c.kind) {
    case 'order': return 'Kai · about your order';
    case 'position': return 'Kai · about your position';
    case 'alert': return 'Kai · about this alert';
    case 'room': return 'Kai · about this discussion';
    case 'setup': return 'Kai · about this setup';
    default: return 'Kai';
  }
}

/** Composer placeholder — plain language, never taxonomy. */
export function kaiSheetPlaceholder(c: KaiContext): string {
  if (c.symbol) return `Ask about ${c.symbol}…`;
  return 'Ask Kai…';
}
