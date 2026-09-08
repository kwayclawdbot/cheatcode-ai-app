/**
 * IS THIS APP ACTUALLY IN FRONT OF SOMEBODY.
 *
 * The cost rule for live data is "only poll what is visible", and that has two
 * halves. Navigation focus is one (a blurred tab is not visible) and this file
 * is the other: an app in the background, or a browser tab nobody is looking
 * at, must issue zero requests no matter which screen it happens to be on.
 *
 * ── WHY NOT JUST AppState ────────────────────────────────────────────────────
 * react-native-web does implement `AppState`, but it derives its value from the
 * page's own visibility handling and has historically reported `active` for a
 * hidden tab depending on how the document was mounted. `document.visibilityState`
 * is the fact the browser itself guarantees, so on web we ask the document and
 * on native we ask AppState. Both answer the same question; neither is trusted
 * on the other's platform.
 */
import { AppState, Platform } from 'react-native';

const isWeb = Platform.OS === 'web';
const hasDocument = () => typeof document !== 'undefined' && document != null;

/** True when a person could plausibly be looking at this. */
export function isForeground(): boolean {
  if (isWeb) {
    // No document (SSR / a static render) is not a hidden tab; it is no tab.
    if (!hasDocument()) return true;
    return document.visibilityState !== 'hidden';
  }
  return AppState.currentState === 'active';
}

/**
 * Calls back with the new answer whenever it changes. Returns the unsubscribe.
 * Never fires on subscribe — read `isForeground()` for the current value.
 */
export function subscribeForeground(fn: (foreground: boolean) => void): () => void {
  if (isWeb) {
    if (!hasDocument()) return () => {};
    const handler = () => fn(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }
  const sub = AppState.addEventListener('change', (state) => fn(state === 'active'));
  return () => sub.remove();
}
