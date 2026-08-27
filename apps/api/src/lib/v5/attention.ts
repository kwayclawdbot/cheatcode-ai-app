/**
 * What actually needs the user — derived ONCE, consumed by both Home's priority
 * object and the Alerts "Attention" section.
 *
 * The rule this file exists to enforce: if something is Home's priority because
 * the USER has skin in it, the same thing is in Alerts → Attention. Two surfaces
 * that answer "what needs me" from two different queries will eventually
 * disagree, and when they do the user has to decide which screen is lying.
 *
 * "Skin in it" is not a feeling — it is a row: an open position, a trade plan,
 * or a watch the user set. A setup nobody ever touched going invalid is NOT an
 * event about the user; it is housekeeping, and it belongs in "also watching"
 * with the honest "off the table" note, never in the one slot that claims the
 * screen.
 */
import type { AttentionRow, OpenPositionRow, PlainAction } from '@shared/api';
import { serviceClient } from '../db';
import { levels } from '../setups';
import type { SetupRow } from '../kai/context';

/* ------------------------------------------------------------------ */
/* Who is followed                                                      */
/* ------------------------------------------------------------------ */

export type FollowMarks = { symbols: Set<string>; setupIds: Set<string> };

export const NO_MARKS: FollowMarks = { symbols: new Set(), setupIds: new Set() };

/**
 * Every symbol and setup the user has put something of their own against.
 * Cancelled and expired watches do not count — the user let those go.
 */
export async function loadFollowMarks(userId: string, positions: OpenPositionRow[]): Promise<FollowMarks> {
  const db = serviceClient();
  const [alerts, plans] = await Promise.all([
    db.from('alerts').select('refs').eq('user_id', userId).in('status', ['draft', 'active', 'paused', 'triggered']),
    db.from('trade_plans').select('symbol').eq('user_id', userId).neq('status', 'cancelled'),
  ]);

  const symbols = new Set<string>();
  const setupIds = new Set<string>();

  for (const p of positions) {
    symbols.add(p.symbol.toUpperCase());
    if (p.origin_setup_id) setupIds.add(p.origin_setup_id);
  }
  for (const r of (alerts.data ?? []) as Record<string, unknown>[]) {
    const refs = (r.refs as Record<string, unknown>) ?? {};
    if (typeof refs.symbol === 'string') symbols.add(refs.symbol.toUpperCase());
    if (typeof refs.setup_id === 'string') setupIds.add(refs.setup_id);
  }
  for (const r of (plans.data ?? []) as Record<string, unknown>[]) {
    if (typeof r.symbol === 'string') symbols.add(r.symbol.toUpperCase());
  }

  return { symbols, setupIds };
}

export function isFollowed(setup: SetupRow, marks: FollowMarks): boolean {
  return marks.setupIds.has(setup.id) || marks.symbols.has(setup.symbol.toUpperCase());
}

export function isDead(state: string): boolean {
  return state === 'invalidated' || state === 'expired';
}

/** Positions sitting on the level the user already said they were wrong at. */
export function atRiskPositions(positions: OpenPositionRow[]): OpenPositionRow[] {
  return positions.filter((p) => p.health === 'at_risk');
}

/** Theses that died on the user — not every thesis that died. */
export function deadFollowedSetups(setups: SetupRow[], marks: FollowMarks): SetupRow[] {
  return setups.filter((s) => isDead(String(s.state)) && isFollowed(s, marks));
}

/* ------------------------------------------------------------------ */
/* Copy — headline says WHAT changed, detail says WHY and WHAT NOW      */
/* ------------------------------------------------------------------ */

/** Trailing punctuation, so two clauses never collide into one run-on. */
function sentence(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

export function setupHeadline(row: SetupRow, state: string): string {
  if (state === 'ready') return `${row.symbol} has met every condition`;
  if (isDead(state)) return `${row.symbol} is off — the level failed`;
  return `${row.symbol} is building`;
}

/**
 * The detail must never restate the headline, and never restate a level the
 * thesis already named. `thesis_plain` is written by the scanner and already
 * carries the numbers, so appending a second copy of them produced the
 * "…gave way. — the level it leaned on gave way…" stutter this replaces.
 */
export function setupDetail(row: SetupRow, state: string): string {
  const { entry, stop } = levels(row);
  const why = row.thesis_plain ? sentence(row.thesis_plain) : null;
  const said = (n: number | null) => n !== null && (why ?? '').includes(String(n));

  if (isDead(state)) {
    const lead = why ?? `The ${row.symbol} idea leaned on a level that has now given way.`;
    const next =
      stop === null
        ? 'There is nothing to do here except understand why it failed.'
        : said(stop)
          ? 'Until it reclaims that level and holds it, there is nothing here to act on.'
          : `Until it reclaims $${stop} and holds it, there is nothing here to act on.`;
    return `${lead} ${next}`;
  }

  if (state === 'ready') {
    const lead = why ?? `${row.symbol} has done everything I asked of it.`;
    const next =
      entry === null || said(entry)
        ? 'Every condition I defined has happened. Your move.'
        : `Every condition I defined has happened at $${entry}. Your move.`;
    return `${lead} ${next}`;
  }

  const lead = why ?? `${row.symbol} is on my list.`;
  if (entry === null || said(entry)) return `${lead} Not there yet.`;
  const fails = stop === null || said(stop) ? '' : ` and fails at $${stop}`;
  return `${lead} It triggers at $${entry}${fails}. Not there yet.`;
}

/* ------------------------------------------------------------------ */
/* Attention rows (Alerts A1) for the non-alert events                  */
/* ------------------------------------------------------------------ */

function act(label: string, route: string | null, action: string, primary = false): PlainAction {
  return { action, label, route, primary, enabled: true, hint: null };
}

export function positionAttentionRow(p: OpenPositionRow): AttentionRow {
  return {
    id: p.id,
    kind: 'position',
    type: 'position',
    symbol: p.symbol,
    headline: `${p.symbol} is testing your exit level`,
    detail_plain: p.health_plain,
    at: p.opened_at,
    primary_action: act('Manage', p.route, 'manage_position', true),
    secondary_actions: [act('Exit now', `${p.route}?close=1`, 'exit_now'), act('Ask Kai', null, 'ask_kai')],
    alert: null,
  };
}

export function deadThesisAttentionRow(s: SetupRow): AttentionRow {
  const state = String(s.state);
  const invalidatedAt = (s.invalidation ?? {}).invalidated_at;
  return {
    id: s.id,
    kind: 'alert',
    type: 'thesis',
    symbol: s.symbol,
    headline: setupHeadline(s, state),
    detail_plain: setupDetail(s, state),
    at: typeof invalidatedAt === 'string' ? invalidatedAt : (s.valid_until ?? new Date().toISOString()),
    primary_action: act('Review what changed', `/symbol/${s.symbol}?tab=overview&setup=${s.id}`, 'review_change', true),
    secondary_actions: [
      act('See why', `/symbol/${s.symbol}?tab=kai&setup=${s.id}`, 'see_why'),
      act('Ask Kai', null, 'ask_kai'),
    ],
    alert: null,
  };
}
