/**
 * Which symbol the Trade tab reopens.
 *
 * Spec 10 §7: "Trade opens as a working chart", so the tab needs a symbol before
 * the user has picked one. Order of preference: the last symbol worked in this
 * session → the priority symbol the server named → the first watchlist row.
 * This is a UI preference, not data, so it lives in memory only.
 */
let last: string | null = null;

export const rememberSymbol = (s: string) => { last = s.toUpperCase(); };
export const lastPortalSymbol = () => last;
