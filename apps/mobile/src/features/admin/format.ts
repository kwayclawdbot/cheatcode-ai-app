import { color } from '../../ui/tokens';
import { CRM_STATUS_LABEL } from '../../lib/adapters';
import type { AdminMetric, CrmStatus } from '../../lib/types';

/**
 * How the operator's board says things.
 *
 * TWO RULES, BOTH FROM THE BRIEF, BOTH ENFORCED HERE SO A SCREEN CANNOT MISS
 * THEM:
 *
 *   1. A metric with no data source renders "not tracked yet", never 0 (§8).
 *      `metricValue()` returns `null` for that case and every caller passes it
 *      straight to `<Figure value={…}>`, which draws the sentence.
 *   2. green / red / gold are FINANCIAL SEMANTICS ONLY (§9). `metricTone()`
 *      hands out a colour for money and nothing else: a status is expressed in
 *      type weight and `muted`/`dim`, because "blocked" is not a loss and
 *      "active" is not a gain.
 */

export const money = (cents: number | null | undefined): string | null =>
  cents == null ? null : `$${Math.round(cents / 100).toLocaleString('en-US')}`;

export const count = (n: number | null | undefined): string | null =>
  n == null ? null : n.toLocaleString('en-US');

/** Already-formatted, or null when the app does not measure it yet. */
export function metricValue(m: AdminMetric): string | null {
  if (!m.tracked || m.value == null) return null;
  if (m.unit === 'cents') return money(m.value);
  if (m.unit === 'percent') return `${Math.round(m.value)}%`;
  return count(m.value);
}

/** Money gets gold. Everything else gets the text colour, which is not a colour. */
export const metricTone = (m: AdminMetric): string | undefined =>
  m.unit === 'cents' ? color.gold : undefined;

/** `2026-08-29T17:04:11Z` → `2026-08-29 17:04`. Mono at every call site. */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** `2026-08-29` — a date with no false precision about the minute. */
export function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : new Date(t).toISOString().slice(0, 10);
}

export function when(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export const statusLabel = (s: CrmStatus): string => CRM_STATUS_LABEL[s];

/**
 * STATE IS TYPE, NOT COLOUR. `paying` is the only status that reads at full
 * strength because it is the only one the whole funnel points at; the two that
 * are over read dim; the rest sit at `muted`. No pill borrows green or red.
 */
export function statusTone(s: CrmStatus): { c: string; weight: 'regular' | 'semibold' | 'bold' } {
  if (s === 'paying') return { c: color.text, weight: 'bold' };
  if (s === 'churned' || s === 'blocked') return { c: color.dim, weight: 'regular' };
  if (s === 'activated' || s === 'onboarded') return { c: color.muted, weight: 'semibold' };
  return { c: color.muted, weight: 'regular' };
}

/** The funnel in the order it happens, so a missing status still holds its place. */
export const FUNNEL_ORDER: CrmStatus[] = [
  'lead', 'invited', 'signed_up', 'onboarded', 'activated', 'paying', 'churned', 'blocked',
];

export const IDENTITY_LABEL: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  app_user: 'App account',
  stripe_customer: 'Stripe customer',
  kai_user: 'K.AI SMS user',
  os_user: 'Cheat Code OS user',
  invite_code: 'Invite code',
};

export const SOURCE_LABEL: Record<string, string> = {
  app: 'This app',
  kai_sms: 'K.AI SMS',
  stripe: 'Stripe',
  admin: 'Staff',
  import: 'Import',
  invite: 'An invite',
};

/** An unattributed row says so rather than showing an empty cell. */
export const sourceLabel = (s: string | null | undefined): string =>
  s ? (SOURCE_LABEL[s] ?? s) : 'Not attributed';

/** A person with no name is their email, then their phone, then their id. */
export function personName(p: {
  display_name: string | null; primary_email: string | null;
  primary_phone_e164: string | null; id: string;
}): string {
  return p.display_name || p.primary_email || p.primary_phone_e164 || `${p.id.slice(0, 8)}…`;
}
