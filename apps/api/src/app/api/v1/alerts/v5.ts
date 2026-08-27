/**
 * The V5 Alerts shaping: five internal states collapsed into three sections.
 *
 * Attention   triggered conditions, invalidations, decisions required now
 * Monitoring  everything Kai is watching — INCLUDING the stop and target
 *             conditions attached to open positions
 * History     completed, expired, cancelled, previously triggered
 *
 * "Active Trades" is gone (audit §6). Positions live in Trade; what surfaces
 * here is only the monitoring EVENT attached to them, so there is no second
 * position-management destination competing with the Trade tab.
 *
 * Type is a FILTER, not a section — `filters[]` carries live counts so the pills
 * can render without a second request.
 */
import type {
  AlertFilterChip,
  AlertRow,
  AlertTypeFilter,
  AttentionRow,
  HistoryRow,
  MonitoringRow,
  OpenPositionRow,
  PlainAction,
} from '@shared/api';

/**
 * Which filter a watch belongs to, read from the structured condition rather
 * than from the natural language — the words a person typed are not a schema.
 */
export function alertTypeOf(row: AlertRow): AlertTypeFilter {
  const refs = (row.refs ?? {}) as Record<string, unknown>;
  if (refs.kind === 'position_exit' || refs.order_id) return 'position';
  if (refs.setup_id) return 'setup';
  if (refs.room_id) return 'community';

  const condition = (row.condition ?? {}) as Record<string, unknown>;
  const atoms = Array.isArray(condition.all)
    ? (condition.all as Record<string, unknown>[])
    : Array.isArray(condition.any)
      ? (condition.any as Record<string, unknown>[])
      : [];
  for (const a of atoms) {
    const subject = String(a.subject ?? a.atom ?? '');
    if (/news|headline|catalyst/i.test(subject)) return 'news';
    if (/thesis|invalidat/i.test(subject)) return 'thesis';
    if (/setup|grade/i.test(subject)) return 'setup';
    if (/price|level|cross|range/i.test(subject)) return 'price';
  }
  return 'price';
}

function act(label: string, route: string | null, action: string, primary = false): PlainAction {
  return { action, label, route, primary, enabled: true, hint: null };
}

export function toAttentionRow(row: AlertRow): AttentionRow {
  const refs = (row.refs ?? {}) as Record<string, unknown>;
  const symbol = typeof refs.symbol === 'string' ? refs.symbol : null;
  const isExit = refs.kind === 'position_exit';

  return {
    id: row.id,
    kind: isExit ? 'position' : 'alert',
    type: alertTypeOf(row),
    symbol,
    headline: symbol
      ? isExit
        ? `${symbol} reached your exit level`
        : `${symbol} hit the level you were watching`
      : 'One of your watches hit',
    detail_plain: isExit
      ? `${row.natural_language ?? 'Your exit level was reached'}. You chose to be told rather than exited automatically — nothing has been sold.`
      : `${row.natural_language ?? 'A condition you set'} — this is the moment you asked to be told about.`,
    at: row.created_at,
    primary_action: symbol
      ? act(`Open ${symbol}`, `/symbol/${symbol}`, 'open_symbol', true)
      : act('Open the watch', `/alert/${row.id}`, 'open_alert', true),
    secondary_actions: [act('Ask Kai', null, 'ask_kai'), act('See the watch', `/alert/${row.id}`, 'open_alert')],
    alert: row,
  };
}

export function toMonitoringRow(row: AlertRow, lastPricePlain: string | null): MonitoringRow {
  const refs = (row.refs ?? {}) as Record<string, unknown>;
  const symbol = typeof refs.symbol === 'string' ? refs.symbol : null;
  return {
    id: row.id,
    kind: 'alert',
    type: alertTypeOf(row),
    symbol,
    condition_plain: row.natural_language ?? row.summary_plain,
    value_plain: lastPricePlain ?? 'no current price',
    route: `/alert/${row.id}`,
    position_id: null,
    alert_id: row.id,
    monitoring: row.monitoring ?? 'not_armed',
    monitoring_plain: row.monitoring_plain ?? '',
  };
}

/**
 * A position's stop and target become monitoring rows. `exit_style` decides
 * what the copy promises — `auto` executes, `alert_assisted` notifies — and the
 * two are never described the same way.
 */
export function positionMonitoringRows(positions: OpenPositionRow[]): MonitoringRow[] {
  const out: MonitoringRow[] = [];
  for (const p of positions) {
    const value = p.mark_price === null ? 'no current price' : `now $${p.mark_price}`;
    const monitoringPlain =
      p.exit_style === 'auto'
        ? 'Armed against delayed prices. It executes when the level is reached.'
        : 'Watched against delayed prices. You get a notification with one-tap close — this is not automatic protection.';

    if (p.stop !== null) {
      out.push({
        id: `${p.id}:stop`,
        kind: 'position',
        type: 'position',
        symbol: p.symbol,
        condition_plain: `${p.symbol} ${p.direction === 'long' ? 'falls to' : 'rises to'} $${p.stop}`,
        value_plain: value,
        route: p.route,
        position_id: p.id,
        alert_id: null,
        monitoring: 'armed_delayed',
        monitoring_plain: monitoringPlain,
      });
    }
    if (p.target !== null) {
      out.push({
        id: `${p.id}:target`,
        kind: 'position',
        type: 'position',
        symbol: p.symbol,
        condition_plain: `${p.symbol} ${p.direction === 'long' ? 'reaches' : 'falls to'} $${p.target}`,
        value_plain: value,
        route: p.route,
        position_id: p.id,
        alert_id: null,
        monitoring: 'armed_delayed',
        monitoring_plain: monitoringPlain,
      });
    }
  }
  return out;
}

export function toHistoryRow(row: AlertRow): HistoryRow {
  const refs = (row.refs ?? {}) as Record<string, unknown>;
  const symbol = typeof refs.symbol === 'string' ? refs.symbol : null;
  const headline =
    row.status === 'expired'
      ? 'The window closed before this happened'
      : row.status === 'cancelled'
        ? 'You called this one off'
        : 'This one hit';
  return {
    id: row.id,
    kind: 'alert',
    type: alertTypeOf(row),
    symbol,
    headline: symbol ? `${symbol} — ${headline.toLowerCase()}` : headline,
    detail_plain: row.natural_language ?? row.summary_plain,
    at: row.created_at,
    route: `/alert/${row.id}`,
  };
}

const FILTER_LABELS: Record<AlertTypeFilter, string> = {
  all: 'All',
  price: 'Price',
  setup: 'Setups',
  position: 'Positions',
  news: 'News',
  thesis: 'Thesis',
  community: 'Community',
};

export function buildFilters(types: AlertTypeFilter[]): AlertFilterChip[] {
  const counts = new Map<AlertTypeFilter, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const keys: AlertTypeFilter[] = ['all', 'price', 'setup', 'position', 'news', 'thesis', 'community'];
  return keys
    .map((k) => ({ key: k, label: FILTER_LABELS[k], count: k === 'all' ? types.length : (counts.get(k) ?? 0) }))
    .filter((c) => c.key === 'all' || c.count > 0);
}
