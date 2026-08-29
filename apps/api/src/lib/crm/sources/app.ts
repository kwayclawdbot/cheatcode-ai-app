/**
 * THE `app` SOURCE — this database telling the truth about its own users.
 *
 * Brief §5: "This is not an 'import' — it is the app telling the truth about
 * its own users, and it is what makes the dashboard real and testable on day
 * one instead of an empty shell."
 *
 * It is also the source that PROVES the guarantees the other two will rely on.
 * `unique (source, external_id)` makes a second run create zero rows; the
 * resolution order and the conflict refusal are exercised against real data;
 * the cursor resumes. When `kai_sms` and `stripe` are switched on, they inherit
 * all of that by construction rather than by their own care.
 *
 * THE FUNNEL IS DERIVED, NEVER STORED TWICE (brief §5):
 *
 *   signed_up   a profile exists
 *   onboarded   `profiles.onboarding->>'completed_at'` is set
 *   activated   they armed an alert or placed a paper order
 *   paying       a premium subscription that is active or trialing
 *
 * `churned` IS NOT DERIVED HERE, on purpose. There is no churn timestamp in
 * this schema and no agreed vocabulary for one — that belongs to the `stripe`
 * connector (SCHEMA-NOTES gap 2.36). Guessing it from a cancelled row would be
 * inventing the exact metric §8 says must render "not tracked yet" instead.
 *
 * WHAT IT DOES NOT COPY: message bodies, of any kind. `conversation_messages`
 * is read for a COUNT on the person detail page and never here. There is no
 * body column in `crm_people` and there is not going to be one.
 */
import type { CrmStatus } from '@shared/api';
import { serviceClient } from './../../db';
import { log } from './../../log';
import type { EventUpsert, PersonUpsert, Source, SourcePage, SourcePlan } from './../source';
import { normaliseEmail } from './../identity';

/** People per page. Small enough that the per-page fan-out stays a handful of
 *  queries with short `in` lists, large enough that 2,507 people is 13 pages. */
const PAGE = 200;
/** PostgREST's own ceiling per request; the loops below page under it. */
const CHUNK = 1000;

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  onboarding: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

export const appSource: Source = {
  name: 'app',
  eventSource: 'app',

  async plan(): Promise<SourcePlan> {
    // The one source that can never be unconfigured: it reads the database this
    // API is already holding open. If that is down, nothing else works either.
    return {
      configured: true,
      reason: null,
      plain: 'Reads this app’s own users. No credentials needed — it is this database.',
    };
  },

  async pull(cursor): Promise<SourcePage> {
    const db = serviceClient();

    // Keyset over `profiles` by (created_at, user_id). Stable under inserts:
    // a user created mid-run lands after the cursor and is picked up by this
    // run or the next one, and never causes a skip the way an offset would.
    const afterAt = typeof cursor?.after_created_at === 'string' ? cursor.after_created_at : null;
    const afterId = typeof cursor?.after_user_id === 'string' ? cursor.after_user_id : null;

    let q = db
      .from('profiles')
      .select('user_id,display_name,onboarding,created_at,updated_at')
      .order('created_at', { ascending: true })
      .order('user_id', { ascending: true })
      .limit(PAGE);
    if (afterAt && afterId) {
      q = q.or(`created_at.gt.${afterAt},and(created_at.eq.${afterAt},user_id.gt.${afterId})`);
    }
    const { data, error } = await q;
    if (error) throw error;

    const profiles = (data ?? []) as ProfileRow[];
    if (profiles.length === 0) {
      return { people: [], cursor: null, scanned: 0 };
    }

    const ids = profiles.map((p) => p.user_id);
    const [emails, subs, activatedByAlert, activatedByOrder, events] = await Promise.all([
      emailMap(),
      subscriptionMap(ids),
      usersPresentIn('alerts', ids),
      usersPresentIn('orders', ids),
      eventsFor(ids),
    ]);

    const people = profiles.map((p) => {
      const email = emails.get(p.user_id) ?? null;
      const sub = subs.get(p.user_id) ?? null;
      const paying = sub?.tier === 'premium' && (sub.status === 'active' || sub.status === 'trialing');
      const onboarded = typeof p.onboarding?.completed_at === 'string' && p.onboarding.completed_at !== '';
      const activated = activatedByAlert.has(p.user_id) || activatedByOrder.has(p.user_id);

      const status: CrmStatus = paying
        ? 'paying'
        : activated
          ? 'activated'
          : onboarded
            ? 'onboarded'
            : 'signed_up';

      const mine = events.get(p.user_id) ?? [];
      const lastEvent = mine.length ? mine[mine.length - 1].occurred_at : null;

      const person: PersonUpsert = {
        identities: [
          { kind: 'app_user', value: p.user_id, verified: true },
          ...(email ? [{ kind: 'email' as const, value: email, verified: true }] : []),
          // The app's OWN Stripe customer id, when billing has issued one. This
          // is what lets `crm_mrr_v` — which counts only people carrying a
          // `stripe_customer` identity — ever have anybody in it, and it is a
          // fact this database holds rather than one imported from Stripe.
          ...(sub?.stripe_customer_id
            ? [{ kind: 'stripe_customer' as const, value: sub.stripe_customer_id, verified: true }]
            : []),
        ],
        display_name: p.display_name,
        primary_email: email,
        status,
        // The app's own vocabulary, and only ever 'free' or 'premium' — no
        // invented Pro/VIP tiers (brief §8).
        primary_tier: sub?.tier ?? 'free',
        source: 'app',
        source_detail: { onboarded, activated, subscription_status: sub?.status ?? 'none' },
        first_seen_at: p.created_at,
        last_active_at: lastEvent ?? p.updated_at ?? p.created_at,
        app_user_id: p.user_id,
        // MONEY IS LEFT NULL. This database knows a tier; it does not know what
        // anybody paid. Writing a zero here would put a fabricated number in
        // front of a revenue screen — the `stripe` connector owns these three.
        total_paid_cents: null,
        current_mrr_cents: null,
        ltv_cents: null,
      };

      return { person, events: mine };
    });

    const last = profiles[profiles.length - 1];
    return {
      people,
      // A short page means the table is exhausted; null retires the cursor so
      // the next run starts from the top and picks up everything that changed.
      cursor:
        profiles.length < PAGE
          ? null
          : { after_created_at: last.created_at, after_user_id: last.user_id },
      scanned: profiles.length,
    };
  },
};

/* ------------------------------------------------------------------ */

type SubRow = { user_id: string; tier: string; status: string; stripe_customer_id: string | null };

async function subscriptionMap(ids: string[]): Promise<Map<string, SubRow>> {
  const db = serviceClient();
  const { data, error } = await db
    .from('subscriptions')
    .select('user_id,tier,status,stripe_customer_id')
    .in('user_id', ids);
  if (error) throw error;
  const m = new Map<string, SubRow>();
  for (const r of (data ?? []) as SubRow[]) m.set(r.user_id, r);
  return m;
}

/**
 * "Has this user any row in this table at all" — exactly, with no truncation.
 *
 * A plain `.in(...).limit(n)` would answer WRONGLY once a page's users have
 * more than `n` rows between them: the tail is silently missing and a user who
 * really did arm an alert never reaches `activated`. So this pages on
 * `user_id` itself and, because it only needs EXISTENCE, uses `gt` to skip the
 * rest of a user's rows the moment one of them is seen.
 */
async function usersPresentIn(table: 'alerts' | 'orders', ids: string[]): Promise<Set<string>> {
  const db = serviceClient();
  const found = new Set<string>();
  let after: string | null = null;
  for (let guard = 0; guard < 200; guard += 1) {
    let q = db
      .from(table)
      .select('user_id')
      .in('user_id', ids)
      .order('user_id', { ascending: true })
      .limit(CHUNK);
    if (after) q = q.gt('user_id', after);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as { user_id: string }[];
    for (const r of rows) found.add(r.user_id);
    if (rows.length < CHUNK) break;
    after = rows[rows.length - 1].user_id;
  }
  return found;
}

type UserEventRow = {
  user_id: string;
  seq: number;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown> | null;
  occurred_at: string;
};

/**
 * Every `user_events` row for the page's users, oldest first, as timeline rows.
 *
 * THE IDEMPOTENCY KEY IS `user_event:<user>:<seq>`, and it is what the whole
 * "a second run creates zero rows" claim rests on: `(user_id, seq)` is the
 * table's primary key, so the key is unique, deterministic, and reproducible
 * from the row itself rather than from any bookkeeping this run keeps.
 *
 * Paged with a composite keyset on `(user_id, seq)` for the same reason as
 * `usersPresentIn`: a flat limit would drop the tail, and a dropped event is a
 * hole in somebody's timeline that no later run would ever fill.
 */
async function eventsFor(ids: string[]): Promise<Map<string, EventUpsert[]>> {
  const db = serviceClient();
  const out = new Map<string, EventUpsert[]>();
  let afterUser: string | null = null;
  let afterSeq: number | null = null;

  for (let guard = 0; guard < 500; guard += 1) {
    let q = db
      .from('user_events')
      .select('user_id,seq,event_type,entity_type,entity_id,payload,occurred_at')
      .in('user_id', ids)
      .order('user_id', { ascending: true })
      .order('seq', { ascending: true })
      .limit(CHUNK);
    if (afterUser && afterSeq !== null) {
      q = q.or(`user_id.gt.${afterUser},and(user_id.eq.${afterUser},seq.gt.${afterSeq})`);
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as UserEventRow[];
    for (const r of rows) {
      const list = out.get(r.user_id) ?? [];
      list.push({
        external_id: `user_event:${r.user_id}:${r.seq}`,
        type: r.event_type,
        category: r.entity_type,
        payload: { ...(r.payload ?? {}), entity_type: r.entity_type, entity_id: r.entity_id },
        occurred_at: r.occurred_at,
      });
      out.set(r.user_id, list);
    }
    if (rows.length < CHUNK) break;
    const last = rows[rows.length - 1];
    afterUser = last.user_id;
    afterSeq = last.seq;
  }
  return out;
}

/**
 * user_id → email, from GoTrue.
 *
 * WHY A SWEEP AND A CACHE. `auth.users` is not in a PostgREST-exposed schema,
 * so the only way to read an email is the admin API, and that is paged by page
 * NUMBER — there is no per-id batch call. One `getUserById` per profile would
 * be 2,507 round trips. So the map is built once and memoised for the length of
 * a run (60 seconds), which is the shape of the problem: an ingest reads every
 * user anyway.
 *
 * A user created DURING a run can therefore be missing an email for that run
 * and get one on the next. That is a deliberate, self-correcting staleness —
 * the alternative is a per-row lookup that makes the sync unusable.
 */
let emailCache: { at: number; map: Map<string, string> } | null = null;
const EMAIL_TTL_MS = 60_000;

async function emailMap(): Promise<Map<string, string>> {
  if (emailCache && Date.now() - emailCache.at < EMAIL_TTL_MS) return emailCache.map;
  const db = serviceClient();
  const map = new Map<string, string>();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: CHUNK });
    if (error) {
      log('warn', 'no-request-id', 'crm.app_source.email_sweep_failed', { message: error.message });
      break;
    }
    const users = data?.users ?? [];
    for (const u of users) {
      const e = normaliseEmail(u.email ?? null);
      if (e) map.set(u.id, e);
    }
    if (users.length < CHUNK) break;
  }
  emailCache = { at: Date.now(), map };
  return map;
}

/** Test seam: the sweep above is memoised and a test must be able to drop it. */
export function resetAppSourceCaches(): void {
  emailCache = null;
}
