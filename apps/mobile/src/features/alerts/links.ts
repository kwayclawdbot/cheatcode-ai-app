import type { AlertCard } from '../../lib/types';

/**
 * WHERE A CARD GOES, BY THE NAMES IT ACTUALLY HAS.
 *
 * The AMD "A setup" opened Trade on "NOT GRADED" (owner audit, 21 September)
 * because every card was linked as `?alert=<something>`, and for a SETUP card
 * that something was the card's own id, `setup:<uuid>` — which the portal then
 * looked for among the member's alert rows and did not find. A setup card has
 * no alert row. It has a setup.
 *
 * So a card is linked by what it is:
 *   - an alert row, when there is one           → `?alert=<uuid>`
 *   - the setup it was built from, when there is → `&setup=<uuid>`
 *   - neither (a position card, an old payload)  → `?alert=<card id>`
 *
 * `?setup=` on its own is understood by every generation of the portal route:
 * the old one finds the card for the symbol, the new one finds it by setup.
 */
export function tradeHref(alert: Pick<AlertCard, 'id' | 'symbol' | 'alert_id' | 'setup_id'>): string {
  const q: string[] = [];
  if (alert.alert_id) q.push(`alert=${encodeURIComponent(alert.alert_id)}`);
  if (alert.setup_id) q.push(`setup=${encodeURIComponent(alert.setup_id)}`);
  if (!q.length) q.push(`alert=${encodeURIComponent(alert.id)}`);
  q.push('ctx=alert');
  return `/trade/${encodeURIComponent(alert.symbol)}?${q.join('&')}`;
}

/** What Kai is asked about from a card — the alert row, else the setup, else the symbol. */
export function kaiContextFor(alert: Pick<AlertCard, 'symbol' | 'alert_id' | 'setup_id'>):
  { kind: 'alert' | 'setup' | 'symbol'; id?: string; symbol: string } {
  if (alert.alert_id) return { kind: 'alert', id: alert.alert_id, symbol: alert.symbol };
  if (alert.setup_id) return { kind: 'setup', id: alert.setup_id, symbol: alert.symbol };
  return { kind: 'symbol', symbol: alert.symbol };
}
