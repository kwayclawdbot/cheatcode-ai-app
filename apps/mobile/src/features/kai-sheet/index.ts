/**
 * The global Kai sheet.
 *
 * Cross-lane contract (round-3 brief): any lane may call
 *   openKaiSheet({ context: { kind: 'order'|'position'|'symbol'|…, id, symbol } })
 * from anywhere. The host is mounted once in `src/app/_layout.tsx`; no provider
 * or prop threading is required.
 */
export { openKaiSheet, closeKaiSheet, subscribeKaiSheet, getKaiSheetState, kaiSheetTitle } from './store';
export type { KaiContext, KaiSheetRequest } from './store';
export { KaiSheetHost } from './KaiSheet';
