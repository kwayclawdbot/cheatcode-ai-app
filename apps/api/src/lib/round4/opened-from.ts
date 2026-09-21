/**
 * WHAT A TRADE PORTAL LINK WAS OPENED FROM, READ ONCE.
 *
 * THE BUG THIS EXISTS FOR (owner audit, 21 September): the AMD card on the
 * Alerts board said "A setup", and tapping it opened Trade on "NOT GRADED — I
 * have no graded setup on AMD". The card was a SETUP card — its id is
 * `setup:<uuid>` and it has no alert row behind it at all — and the app passed
 * that card id through as `?alert=`. The portal then looked for a row in
 * `alerts` whose id was `setup:3ed7…`, found nothing, treated the link as a
 * stale alert, and deliberately skipped the "find the card for this symbol"
 * fallback because an alert id HAD been given. The grade and the levels were
 * sitting in the feed the whole time; nothing asked for them by the right name.
 *
 * So every link is read here, into the three names a card can be found by:
 *
 *   cardId   the card's own id as the board drew it — `setup:<uuid>`,
 *            `alert:<uuid>`, `position:<uuid>`. This is the one that always
 *            finds the card the member tapped, whatever family it is.
 *   alertId  a real `alerts` row id (a uuid), or null. Only this may be written
 *            into a column that references `alerts` — a `setup:` string there
 *            is a foreign-key error waiting to happen.
 *   setupId  a real `setups` row id (a uuid), or null.
 *
 * Old links keep working: a bare uuid in `?alert=` is still an alert row, which
 * is what every link built before this file meant by it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OpenedFrom = {
  cardId: string | null;
  alertId: string | null;
  setupId: string | null;
};

const uuidOrNull = (v: string | null | undefined): string | null =>
  v && UUID.test(v.trim()) ? v.trim().toLowerCase() : null;

export function openedFrom(q: { alert?: string | null; setup?: string | null }): OpenedFrom {
  const raw = (q.alert ?? '').trim();
  let cardId: string | null = null;
  let alertId: string | null = null;
  let setupId = uuidOrNull(q.setup);

  if (raw) {
    const colon = raw.indexOf(':');
    if (colon > 0) {
      const kind = raw.slice(0, colon).toLowerCase();
      const id = uuidOrNull(raw.slice(colon + 1));
      if (id) {
        cardId = `${kind}:${id}`;
        if (kind === 'alert') alertId = id;
        if (kind === 'setup') setupId = setupId ?? id;
      }
    } else {
      const id = uuidOrNull(raw);
      if (id) {
        alertId = id;
        cardId = `alert:${id}`;
      }
    }
  }
  return { cardId, alertId, setupId };
}

/** The minimum a feed card carries that this lookup needs. */
type CardKeys = { id: string; alert_id?: string | null; setup_id?: string | null };

/**
 * The card the member tapped, by the most specific name the link carries.
 *
 * The card's own id first — it is exactly what the board drew. Then the alert
 * row, then the setup, each only when the link actually named one. A link that
 * named nothing finds nothing here; the caller's symbol fallback is for that.
 */
export function findOpenedCard<C extends CardKeys>(cards: readonly C[], from: OpenedFrom): C | null {
  if (from.cardId) {
    const byCard = cards.find((c) => c.id === from.cardId);
    if (byCard) return byCard;
  }
  if (from.alertId) {
    const byAlert = cards.find((c) => c.alert_id === from.alertId);
    if (byAlert) return byAlert;
  }
  if (from.setupId) {
    const bySetup = cards.find((c) => c.setup_id === from.setupId);
    if (bySetup) return bySetup;
  }
  return null;
}
