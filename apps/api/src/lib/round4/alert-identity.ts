/**
 * What an alert is ABOUT, derived from the alert itself.
 *
 * THE BUG THIS FILE EXISTS TO CLOSE
 * `POST /alerts/draft` used to store `refs: body.refs` verbatim. The symbol and
 * the level the user actually typed are parsed out of the natural language by
 * Kai and land in `condition.atoms[]` — so a watch created anywhere except a
 * client that happened to pass a `refs` hint had NO symbol on the row at all.
 * The round-4 feed skips an alert with no symbol, so "Tell me when Tesla gets
 * back to 170" produced a row in the database and nothing on the screen.
 *
 * The fix is not to trust the client harder. It is to read the identity out of
 * the PARSED CONDITION, which is the thing the alert is actually evaluated
 * against, and to write it onto the row. A client hint is now a fallback for
 * what the parse could not find, never the source of truth.
 */
import type { AppMode } from '@shared/api';
import { serviceClient } from '../db';

export type AlertIdentity = {
  symbol: string | null;
  level: number | null;
  /** 'price_cross' etc. — what kind of condition this is, for the type filter. */
  condition_kind: string | null;
  /** long when the watch fires on the way up, short on the way down. */
  direction: 'long' | 'short' | null;
};

const ABOVE = new Set(['gte', 'gt', 'above', 'crosses_up', 'crosses_above']);
const BELOW = new Set(['lte', 'lt', 'below', 'crosses_down', 'crosses_below']);

type Atom = Record<string, unknown>;

function atomsOf(condition: unknown): Atom[] {
  const c = (condition ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.atoms)) return c.atoms as Atom[];
  if (Array.isArray(c.all)) return c.all as Atom[];
  if (Array.isArray(c.any)) return c.any as Atom[];
  return [];
}

/**
 * Read the identity out of the condition, then fall back to the client's hint
 * and to the request text. Never the other way round.
 */
export function alertIdentity(opts: {
  condition: unknown;
  dataDependency?: unknown;
  refs?: { symbol?: string; level?: number; setup_id?: string } | null;
}): AlertIdentity {
  const atoms = atomsOf(opts.condition);

  let symbol: string | null = null;
  let level: number | null = null;
  let kind: string | null = null;
  let direction: 'long' | 'short' | null = null;

  for (const a of atoms) {
    if (!symbol && typeof a.symbol === 'string' && a.symbol.trim()) symbol = a.symbol.trim().toUpperCase();
    if (!kind) {
      const k = a.atom ?? a.subject;
      if (typeof k === 'string' && k.trim()) kind = k.trim();
    }
    if (level === null) {
      const n = Number(a.value ?? a.level ?? a.price);
      if (Number.isFinite(n)) level = n;
    }
    if (direction === null) {
      const op = String(a.operator ?? a.op ?? '').toLowerCase();
      if (ABOVE.has(op)) direction = 'long';
      else if (BELOW.has(op)) direction = 'short';
    }
  }

  // `data_dependency.symbols` is the other place the parse names the instrument.
  if (!symbol) {
    const dd = (opts.dataDependency ?? {}) as Record<string, unknown>;
    const syms = Array.isArray(dd.symbols) ? dd.symbols : [];
    const first = syms.find((s) => typeof s === 'string' && s.trim());
    if (typeof first === 'string') symbol = first.trim().toUpperCase();
  }

  if (!symbol && typeof opts.refs?.symbol === 'string') symbol = opts.refs.symbol.trim().toUpperCase();
  if (level === null && typeof opts.refs?.level === 'number') level = opts.refs.level;

  return { symbol, level, condition_kind: kind, direction };
}

/**
 * `alerts.symbol` carries a foreign key to `instruments`, so a symbol the model
 * produced for something we do not follow cannot be written to the column. It
 * still goes into `refs` — losing it entirely would be worse than storing an
 * unjoinable string — and the row simply has no column-level symbol.
 */
export async function knownInstrument(symbol: string | null): Promise<boolean> {
  if (!symbol) return false;
  const { data } = await serviceClient().from('instruments').select('symbol').eq('symbol', symbol).maybeSingle();
  return Boolean(data);
}

/**
 * The refs to store, and the round-4 columns to set alongside them. Returns a
 * patch that is safe to spread into an insert or an update; the column keys are
 * omitted when 0021 has not been applied.
 */
export async function alertWritePatch(opts: {
  identity: AlertIdentity;
  refs?: Record<string, unknown> | null;
  mode: AppMode;
  hasRound4Columns: boolean;
  lifecycleState?: string;
}): Promise<{ refs: Record<string, unknown>; columns: Record<string, unknown> }> {
  const refs: Record<string, unknown> = { ...(opts.refs ?? {}) };
  if (opts.identity.symbol) refs.symbol = opts.identity.symbol;
  if (opts.identity.level !== null) refs.level = opts.identity.level;
  if (opts.identity.condition_kind) refs.condition_kind = opts.identity.condition_kind;
  if (opts.identity.direction) refs.direction = opts.identity.direction;

  const columns: Record<string, unknown> = {};
  if (opts.hasRound4Columns) {
    if (await knownInstrument(opts.identity.symbol)) columns.symbol = opts.identity.symbol;
    columns.mode = opts.mode;
    if (opts.identity.direction) columns.direction = opts.identity.direction;
    if (typeof refs.setup_id === 'string') columns.setup_id = refs.setup_id;
    if (opts.lifecycleState) columns.lifecycle_state = opts.lifecycleState;
  }
  return { refs, columns };
}
