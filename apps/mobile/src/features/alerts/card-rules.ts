import type { AlertCard as AlertCardModel } from '../../lib/types';

/**
 * WHEN KAI SAYS "LEAVE THIS ONE", THE CARD DOES NOT WEAR GOLD.
 *
 * THE RULE, read from the grading code rather than invented for the card:
 * a grade is the grading engine's measure of SETUP QUALITY ("a grade is about
 * quality, never about permission to trade" — api `lib/round4/grade.ts`), and
 * gold is its top band. Whether the member should take it is a second,
 * separate verdict: the sizing step (`api lib/setups.ts`, `sizeSuggestion`)
 * checks the plan against the member's OWN rules and returns
 * `within_policy: false` with "I would leave this one" when the reward-to-risk
 * is under their minimum, or "too wide for your rules today" when one share
 * already breaks their risk cap.
 *
 * So: when the server SIZED the plan and still said it is outside the
 * member's rules (`kai_passes`), the letter stays exactly as graded — it is
 * never hidden or lowered, because that would be a fake grade — but it is
 * drawn muted with "I'd pass" beside it, and the card loses the gold frame.
 * A card the server could not size at all (no stop, as every Day Trade card)
 * is not a "pass"; it is simply ungraded or unsized and says so elsewhere.
 * Owner audit, 21 September: a gold "A setup" sat beside "reward 0.65 to 1 …
 * I would leave this one" on the same card.
 */
export function kaiPasses(alert: AlertCardModel): boolean {
  return alert.kai_passes === true;
}

/** "AMD reached $578.75" → "Reached $578.75"; the symbol is already on the row above. */
export function headlineWithoutSymbol(headline: string, symbol: string): string {
  const h = headline.trim();
  const sym = symbol.trim();
  if (!sym || !h.toUpperCase().startsWith(sym.toUpperCase())) return h;
  // "PURR reached …" is not "P" + "URR reached": the symbol must end at a word edge.
  if (/[A-Za-z0-9.]/.test(h.charAt(sym.length))) return h;
  const rest = h.slice(sym.length).replace(/^\s*[—–:-]?\s*/, '');
  if (!rest) return h;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** "Swing · Long" — the kind of idea and which way round, in the member's words. */
export function sideOf(alert: AlertCardModel): string {
  const dir = (alert.direction_label ?? '').trim();
  const cap = dir ? dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase() : '';
  return [alert.mode_label, cap].filter(Boolean).join(' · ');
}

