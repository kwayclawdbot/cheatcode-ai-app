/**
 * THE OVERVIEW NUMBERS, AND THE ONES THAT REFUSE TO BE NUMBERS.
 *
 * Brief §8: "Overview shows only what is computed from real rows … No projected
 * revenue, no invented tiers … A metric with no data source renders as 'not
 * tracked yet', never as zero."
 *
 * That last rule is the reason `AdminMetric` carries `tracked` next to `value`
 * instead of just a number. Zero and unknown look identical on a dashboard and
 * mean opposite things: "nobody churned this month" is a result, "we do not
 * measure churn" is a gap, and a screen that renders both as `0` teaches its
 * operator to trust a number that is not there. So an untracked metric carries
 * `value: null` and a sentence saying which source would have to be switched on
 * to make it real.
 *
 * WHAT IS TRACKED TODAY, and by what:
 *   people by status      `crm_funnel_v`      — real, from `crm_people`
 *   signups per day       `crm_daily_signups_v`
 *   activation rate       `crm_funnel_v`, as a ratio of funnel ranks
 *   invites out/redeemed  `invites`
 *   source mix            `crm_people.source`
 *   paying + MRR          `crm_mrr_v` — ONLY once the `stripe` source has run
 *   churn (30d)           nothing. Not tracked, and not faked as 0.
 *
 * THE MRR CASE IS THE INTERESTING ONE. `crm_mrr_v` counts only people carrying
 * a `stripe_customer` identity, so on this database it returns real zeros. A
 * zero from a view nobody has fed is not a measurement — it is an empty table
 * wearing a number. So MRR and paying-count report `tracked: false` until the
 * `stripe` connector has completed at least one real run, and become live
 * numbers the moment it has, with no code change.
 */
import type {
  AdminDailyRow,
  AdminFunnelRow,
  AdminInviteTotals,
  AdminMetric,
  AdminSourceMixRow,
  CrmStatus,
} from '@shared/api';
import { serviceClient } from './../db';
import { hasSucceeded } from './sources';

/** Funnel order, matching `crm_funnel_v.position`. */
const RANK: Record<string, number> = {
  lead: 1,
  invited: 2,
  signed_up: 3,
  onboarded: 4,
  activated: 5,
  paying: 6,
};

export async function funnel(): Promise<AdminFunnelRow[]> {
  const db = serviceClient();
  const { data, error } = await db.from('crm_funnel_v').select('status,position,people');
  if (error) throw error;
  return ((data ?? []) as { status: CrmStatus; position: number; people: number }[])
    .map((r) => ({ status: r.status, position: Number(r.position), people: Number(r.people) }))
    .sort((a, b) => a.position - b.position);
}

export async function dailySignups(days = 30): Promise<AdminDailyRow[]> {
  const db = serviceClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from('crm_daily_signups_v')
    .select('day,signups,leads')
    .gte('day', since)
    .order('day', { ascending: false })
    .limit(days);
  if (error) throw error;
  return ((data ?? []) as { day: string; signups: number; leads: number }[]).map((r) => ({
    day: r.day,
    signups: Number(r.signups),
    leads: Number(r.leads),
  }));
}

/**
 * Source mix. Paged, because `crm_people.source` has no aggregate view and
 * PostgREST has no `group by` — so this reads the column and counts in memory.
 * At 2,507 rows that is one round trip of a single short text column; the day
 * it is not, the fix is a fourth view, not a bigger limit here.
 */
export async function sourceMix(): Promise<AdminSourceMixRow[]> {
  const db = serviceClient();
  const counts = new Map<string | null, number>();
  const PAGE = 1000;
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await db
      .from('crm_people')
      .select('source')
      .is('merged_into', null)
      .is('deleted_at', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { source: string | null }[];
    for (const r of rows) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
    if (rows.length < PAGE) break;
  }
  return [...counts.entries()]
    .map(([source, people]) => ({ source, people }))
    .sort((a, b) => b.people - a.people);
}

/**
 * Invites. `outstanding` is what a person could still redeem RIGHT NOW —
 * neither revoked, nor past its expiry, nor at its cap — which is the only
 * count worth putting on a dashboard. `expired` and `revoked` are separate
 * because they are different mistakes.
 */
export async function inviteTotals(): Promise<AdminInviteTotals> {
  const db = serviceClient();
  const { data, error } = await db
    .from('invites')
    .select('max_redemptions,redeemed_count,expires_at,revoked_at')
    .limit(10_000);
  if (error) throw error;
  const now = Date.now();
  let outstanding = 0;
  let redeemed = 0;
  let revoked = 0;
  let expired = 0;
  for (const r of (data ?? []) as {
    max_redemptions: number | null;
    redeemed_count: number;
    expires_at: string | null;
    revoked_at: string | null;
  }[]) {
    redeemed += Number(r.redeemed_count ?? 0);
    if (r.revoked_at) {
      revoked += 1;
      continue;
    }
    if (r.expires_at && Date.parse(r.expires_at) <= now) {
      expired += 1;
      continue;
    }
    if (r.max_redemptions !== null && r.redeemed_count >= r.max_redemptions) continue;
    outstanding += 1;
  }
  return { outstanding, redeemed, revoked, expired };
}

type MrrRow = {
  paying_people: number;
  mrr_cents: number;
  total_paid_cents: number;
  ltv_cents: number;
};

export async function metrics(rows: AdminFunnelRow[], invites: AdminInviteTotals): Promise<AdminMetric[]> {
  const db = serviceClient();
  const by = new Map(rows.map((r) => [r.status as string, r.people]));
  const atOrAbove = (status: string) =>
    rows.filter((r) => (RANK[r.status] ?? 0) >= (RANK[status] ?? 0)).reduce((n, r) => n + r.people, 0);

  const out: AdminMetric[] = [];

  const people = rows.reduce((n, r) => n + r.people, 0);
  out.push(count('people_total', 'People', people, `${people} people in the CRM.`));

  const leads = by.get('lead') ?? 0;
  out.push(count('leads', 'Leads', leads, `${leads} people we have reached but who have no account.`));

  // ACTIVATION IS A RATIO OF RANKS, NOT OF BUCKETS. `status` holds one value,
  // so a person who is `paying` is not also counted in `signed_up` — dividing
  // the two buckets would report an activation rate that FALLS as people
  // convert. "Everyone who got at least this far" is the only reading that is
  // monotonic and the only one anybody means.
  const signedUp = atOrAbove('signed_up');
  const activated = atOrAbove('activated');
  out.push(
    signedUp === 0
      ? {
          key: 'activation_rate',
          label: 'Activation',
          value: null,
          tracked: false,
          unit: 'percent',
          plain: 'Nobody has signed up yet, so there is no activation rate to report.',
        }
      : {
          key: 'activation_rate',
          label: 'Activation',
          value: Math.round((activated / signedUp) * 1000) / 10,
          tracked: true,
          unit: 'percent',
          plain: `${activated} of ${signedUp} people who signed up went on to arm an alert or place an order.`,
        }
  );

  out.push(
    count(
      'invites_outstanding',
      'Invites out',
      invites.outstanding,
      `${invites.outstanding} codes could still be redeemed right now.`
    )
  );
  out.push(
    count(
      'invites_redeemed',
      'Invites redeemed',
      invites.redeemed,
      `${invites.redeemed} redemptions across every code ever made.`
    )
  );

  // MONEY. Live only when the connector that owns money has really run.
  const stripeRan = await hasSucceeded('stripe');
  if (!stripeRan) {
    const why =
      'Not tracked yet. Paying customers and MRR come from Stripe, and the Stripe source has never completed a run.';
    out.push(untracked('paying_people', 'Paying', 'count', why));
    out.push(untracked('mrr_cents', 'MRR', 'cents', why));
  } else {
    const { data, error } = await db
      .from('crm_mrr_v')
      .select('paying_people,mrr_cents,total_paid_cents,ltv_cents')
      .maybeSingle();
    if (error) throw error;
    const m = (data ?? null) as MrrRow | null;
    const paying = Number(m?.paying_people ?? 0);
    const mrr = Number(m?.mrr_cents ?? 0);
    out.push(count('paying_people', 'Paying', paying, `${paying} people with a Stripe subscription paying today.`));
    out.push({
      key: 'mrr_cents',
      label: 'MRR',
      value: mrr,
      tracked: true,
      unit: 'cents',
      plain: 'Monthly recurring revenue, counted only for people carrying a Stripe customer id.',
    });
  }

  // CHURN. There is no churn timestamp in this schema and no agreed event type
  // for one — that vocabulary belongs to the `stripe` connector (SCHEMA-NOTES
  // gap 2.36). It is absent rather than zero, permanently, until that lands.
  out.push(
    untracked(
      'churn_30d',
      'Churn (30 days)',
      'count',
      'Not tracked yet. There is no churn event in this database — the Stripe source decides what one is, and it has not been written.'
    )
  );

  return out;
}

function count(key: string, label: string, value: number, plain: string): AdminMetric {
  return { key, label, value, tracked: true, unit: 'count', plain };
}

function untracked(
  key: string,
  label: string,
  unit: 'count' | 'cents' | 'percent',
  plain: string
): AdminMetric {
  return { key, label, value: null, tracked: false, unit, plain };
}
