/**
 * THE KEYBOARD DOCK'S ARITHMETIC, CHECKED WITHOUT A KEYBOARD.
 *
 * The bug this guards is physical — the iPhone keyboard sliding over a
 * composer — and no browser can reproduce it, because on web there IS no
 * software keyboard covering the viewport. A Playwright screenshot of the
 * composer proves the bar still renders; it cannot prove the bar moves.
 *
 * What CAN be checked here is the part that was actually wrong, which is
 * arithmetic: what bottom padding the dock resolves in each of the four states
 * it can be in. Every regression in this area is one of these four numbers
 * being wrong — a floor that fails to collapse (the dead band under the
 * composer), or a safe-area inset counted on a screen where the tab bar has
 * already counted it (the gap that opened above the tab bar).
 *
 * The final check is a thumb on a real phone. This narrows what that thumb has
 * to look for; it does not replace it.
 */

/** The dock's rule, lifted verbatim from src/ui/KeyboardDock.tsx. */
const padding = (o: { floor: number; insetBottom: number; keyboardShown: boolean; safeArea: boolean }) =>
  o.keyboardShown || !o.safeArea ? o.floor : Math.max(o.insetBottom, o.floor);

let failures = 0;
const eq = (name: string, got: number, want: number) => {
  if (got === want) { console.log(`  ok   ${name} → ${got}`); return; }
  failures += 1;
  console.log(`  FAIL ${name} → got ${got}, want ${want}`);
};

console.log('keyboard dock');

/* A notched iPhone: 34pt of home indicator. */
const NOTCH = 34;

/* ── a STACK screen owns the indicator ────────────────────────────────── */
// Keyboard down: the bar must clear the home indicator.
eq('stack, keyboard down, clears the indicator', padding({ floor: 14, insetBottom: NOTCH, keyboardShown: false, safeArea: true }), 34);
// Keyboard up: the keyboard is ON the indicator, so clearing it again is a
// dead band between the composer and the keys. THIS is the original bug.
eq('stack, keyboard up, floor collapses', padding({ floor: 14, insetBottom: NOTCH, keyboardShown: true, safeArea: true }), 14);

/* ── a TAB screen does not: TabBar already cleared it ─────────────────── */
// The regression that safeArea={false} exists for: without it this is 34,
// opening ~26pt of dead space between the composer and the tab bar.
eq('tab, keyboard down, no double-pad above the tab bar', padding({ floor: 8, insetBottom: NOTCH, keyboardShown: false, safeArea: false }), 8);
eq('tab, keyboard up, unchanged', padding({ floor: 8, insetBottom: NOTCH, keyboardShown: true, safeArea: false }), 8);

/* ── a phone with no home indicator ───────────────────────────────────── */
eq('no notch, the floor still applies', padding({ floor: 14, insetBottom: 0, keyboardShown: false, safeArea: true }), 14);

/* ── the sheet, whose height shrinks rather than translating ──────────── */
const sheetHeight = (screenH: number, kb: number, insetTop: number) =>
  Math.min(Math.round(screenH * 0.53), screenH - kb - Math.max(insetTop, 24) - 12);

// Keyboard down on a 844pt iPhone: the artboard's 53%.
eq('kai sheet, keyboard down, keeps the artboard height', sheetHeight(844, 0, 47), 447);
// Keyboard up: 336pt of keyboard leaves 844-336-47-12 = 449 > 447, so the
// artboard height still fits and nothing needs to give.
eq('kai sheet, ordinary keyboard, still fits', sheetHeight(844, 336, 47), 447);
// A tall keyboard (predictive bar + emoji row) on a small phone is the case
// that used to push the sheet's own header off the top of the screen.
eq('kai sheet, tall keyboard on a small phone, shrinks instead of overflowing', sheetHeight(667, 400, 20), 231);
// And it never goes negative or off the top: the top edge is at
// screenH - kb - height, which must stay >= 0.
const top = 667 - 400 - sheetHeight(667, 400, 20);
eq('kai sheet, its own top edge stays on screen', top >= 0 ? 1 : 0, 1);

console.log(failures ? `\nkeyboard dock FAILED (${failures})` : '\nkeyboard dock OK');
process.exit(failures ? 1 : 0);
