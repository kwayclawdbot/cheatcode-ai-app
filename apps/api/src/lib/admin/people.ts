/**
 * The People list and one person's file.
 *
 * TWO RULES SHAPE EVERY QUERY HERE.
 *
 * 1. NEVER AN UNBOUNDED LIST (brief §7). Every read is cursor-paged with a hard
 *    ceiling on `limit`, including the timeline on a person's own page. There
 *    is no parameter anywhere that a client can raise to fetch 2,507 rows, and
 *    there is no offset to abuse.
 *
 * 2. NEVER A MESSAGE BODY (brief §3). `kaiActivity` returns a conversation
 *    count, a message count and a last-message timestamp. It does not select
 *    `conversation_messages.content`, and the person detail route has no path
 *    that does. Reading somebody's words is `POST …/transcript`: a separate
 *    call, with a required reason, that writes its own audit row.
 *
 * Merged and soft-deleted people are excluded everywhere, matching the three
 * views. A merged row still exists so that foreign ids resolve to somebody;
 * showing it in a list would show one human twice.
 */
import type {
  AdminIdentityRow,
  AdminNoteRow,
  AdminPersonDetail,
  AdminPersonRow,
  AdminRedemptionRow,
  AdminScores,
  AdminSegmentFilter,
  AdminTimelineRow,
  CrmStatus,
} from '@shared/api';
import { serviceClient } from './../db';
import { afterFilter, decodeCursor, encodeCursor } from './cursor';

/** What the `q` box really searches, echoed to the UI so it cannot overclaim. */
export const SEARCH_FIELDS = ['display_name', 'primary_email', 'primary_phone_e164', 'tags'];

const PERSON_COLUMNS =
  'id,display_name,primary_email,primary_phone_e164,status,primary_tier,source,tags,first_seen_at,last_active_at,app_user_id';

const DETAIL_COLUMNS = `${PERSON_COLUMNS},source_detail,custom_fields,inbound_count,outbound_count,last_inbound_at,last_outbound_at,total_paid_cents,total_refunded_cents,current_mrr_cents,ltv_cents,merged_into,created_at,updated_at,score_engagement,score_buy_propensity,score_churn_risk,score_upsell_propensity,score_crosssell_propensity,score_responsiveness,score_predicted_ltv_cents,score_predicted_days_to_churn,scores_updated_at`;

export type PeopleFilter = AdminSegmentFilter;

/** Filter keys the API knows. A stored segment naming anything else is IGNORED,
 *  never executed — `crm_segments.filter` is a saved filter, not a query
 *  language (0025 §5), and nothing here evaluates jsonb as SQL. */
export const KNOWN_FILTER_KEYS = ['status', 'tier', 'source', 'tag', 'q'];

export function unknownFilterKeys(filter: Record<string, unknown>): string[] {
  return Object.keys(filter ?? {}).filter((k) => !KNOWN_FILTER_KEYS.includes(k));
}

export async function searchPeople(opts: {
  filter: PeopleFilter;
  limit: number;
  cursor?: string;
}): Promise<{ people: AdminPersonRow[]; nextCursor: string | null; total: number | null }> {
  const db = serviceClient();

  const base = () => {
    let q = db.from('crm_people').select(PERSON_COLUMNS).is('merged_into', null).is('deleted_at', null);
    if (opts.filter.status) q = q.eq('status', opts.filter.status);
    if (opts.filter.tier) q = q.eq('primary_tier', opts.filter.tier);
    if (opts.filter.source) q = q.eq('source', opts.filter.source);
    if (opts.filter.tag) q = q.contains('tags', [opts.filter.tag]);
    if (opts.filter.q) {
      const like = `%${escapeLike(opts.filter.q)}%`;
      // Name, email, phone. A ticker the person is interested in is NOT here:
      // nothing in this schema stores one against a `crm_people` row, and a
      // search box that silently matches nothing on a field it advertises is
      // worse than one that never claimed it. `AdminPeopleResponse.searched`
      // tells the UI exactly which fields these are.
      q = q.or(
        `display_name.ilike.${like},primary_email.ilike.${like},primary_phone_e164.ilike.${like}`
      );
    }
    return q;
  };

  // One extra row is fetched to learn whether there IS a next page, rather than
  // issuing a second count for it. It is dropped before the response.
  const cursor = decodeCursor(opts.cursor);
  let q = base()
    .order('last_active_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(opts.limit + 1);
  if (cursor) q = q.or(afterFilter('last_active_at', cursor));

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as Record<string, unknown>[];
  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;

  // The count is capped. "More than 5,000" is an honest thing to say; making an
  // operator wait on an exact count of a set they are about to filter is not.
  const { count, error: countErr } = await db
    .from('crm_people')
    .select('id', { count: 'estimated', head: true })
    .is('merged_into', null)
    .is('deleted_at', null);
  if (countErr) throw countErr;

  const last = page[page.length - 1];
  return {
    people: page.map(shapeRow),
    nextCursor:
      hasMore && last
        ? encodeCursor({ at: (last.last_active_at as string | null) ?? null, id: last.id as string })
        : null,
    total: opts.filter.q || opts.filter.status || opts.filter.tier || opts.filter.source || opts.filter.tag
      ? null
      : (count ?? null),
  };
}

export function shapeRow(r: Record<string, unknown>): AdminPersonRow {
  return {
    id: String(r.id),
    display_name: (r.display_name as string) ?? null,
    primary_email: (r.primary_email as string) ?? null,
    primary_phone_e164: (r.primary_phone_e164 as string) ?? null,
    status: r.status as CrmStatus,
    primary_tier: (r.primary_tier as string) ?? null,
    source: (r.source as string) ?? null,
    tags: (r.tags as string[]) ?? [],
    first_seen_at: (r.first_seen_at as string) ?? null,
    last_active_at: (r.last_active_at as string) ?? null,
    app_user_id: (r.app_user_id as string) ?? null,
    plain: rowPlain(r),
  };
}

function rowPlain(r: Record<string, unknown>): string {
  const who = (r.display_name as string) || (r.primary_email as string) || (r.primary_phone_e164 as string) || 'Someone with no name on file';
  const status = String(r.status ?? 'lead').replace('_', ' ');
  const seen = r.last_active_at ? `last seen ${String(r.last_active_at).slice(0, 10)}` : 'never seen active';
  return `${who} — ${status}, ${seen}.`;
}

export async function loadPerson(id: string): Promise<AdminPersonDetail | null> {
  const db = serviceClient();
  const { data, error } = await db.from('crm_people').select(DETAIL_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    ...shapeRow(r),
    source_detail: (r.source_detail as Record<string, unknown>) ?? {},
    custom_fields: (r.custom_fields as Record<string, unknown>) ?? {},
    inbound_count: Number(r.inbound_count ?? 0),
    outbound_count: Number(r.outbound_count ?? 0),
    last_inbound_at: (r.last_inbound_at as string) ?? null,
    last_outbound_at: (r.last_outbound_at as string) ?? null,
    total_paid_cents: numOrNull(r.total_paid_cents),
    total_refunded_cents: numOrNull(r.total_refunded_cents),
    current_mrr_cents: numOrNull(r.current_mrr_cents),
    ltv_cents: numOrNull(r.ltv_cents),
    merged_into: (r.merged_into as string) ?? null,
    created_at: String(r.created_at),
    updated_at: (r.updated_at as string) ?? null,
  };
}

/**
 * NINE NUMBERS, ALL NULL, AND SAYING SO. They were ported so a connector can
 * carry across what the K.AI side already computed; nothing in this app writes
 * one. `tracked: false` is what the UI renders as "not tracked yet" — a zero
 * here would be a fabricated score on a person's file (brief §8, 0025 §2).
 */
export function shapeScores(r: Record<string, unknown>): AdminScores {
  const v = (k: string) => numOrNull(r[k]);
  const scores = {
    engagement: v('score_engagement'),
    buy_propensity: v('score_buy_propensity'),
    churn_risk: v('score_churn_risk'),
    upsell_propensity: v('score_upsell_propensity'),
    crosssell_propensity: v('score_crosssell_propensity'),
    responsiveness: v('score_responsiveness'),
    predicted_ltv_cents: v('score_predicted_ltv_cents'),
    predicted_days_to_churn: v('score_predicted_days_to_churn'),
    updated_at: (r.scores_updated_at as string) ?? null,
  };
  const tracked = Object.values(scores).some((x) => x !== null);
  return {
    ...scores,
    tracked,
    plain: tracked
      ? 'Scores carried across from the source that computed them.'
      : 'Not tracked yet. Nothing in this app computes a score, and no source has carried one across.',
  };
}

export async function identities(personId: string): Promise<AdminIdentityRow[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from('crm_identities')
    .select('id,kind,value,source,verified,created_at')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as AdminIdentityRow[];
}

export async function timeline(
  personId: string,
  limit: number,
  cursorRaw?: string
): Promise<{ rows: AdminTimelineRow[]; nextCursor: string | null }> {
  const db = serviceClient();
  const cursor = decodeCursor(cursorRaw);
  let q = db
    .from('crm_events')
    .select('id,type,category,source,value_cents,occurred_at,payload')
    .eq('person_id', personId)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (cursor) q = q.or(afterFilter('occurred_at', cursor));
  const { data, error } = await q;
  if (error) throw error;
  const all = (data ?? []) as Record<string, unknown>[];
  const hasMore = all.length > limit;
  const page = hasMore ? all.slice(0, limit) : all;
  const last = page[page.length - 1];
  return {
    rows: page.map(shapeEvent),
    nextCursor:
      hasMore && last
        ? encodeCursor({ at: (last.occurred_at as string) ?? null, id: last.id as string })
        : null,
  };
}

export function shapeEvent(r: Record<string, unknown>): AdminTimelineRow {
  const type = String(r.type);
  return {
    id: String(r.id),
    type,
    category: (r.category as string) ?? null,
    source: r.source as AdminTimelineRow['source'],
    value_cents: numOrNull(r.value_cents),
    occurred_at: String(r.occurred_at),
    payload: (r.payload as Record<string, unknown>) ?? {},
    plain: `${type.replace(/_/g, ' ')} — ${String(r.source)}`,
  };
}

export async function mergeConflicts(personId: string): Promise<AdminTimelineRow[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from('crm_events')
    .select('id,type,category,source,value_cents,occurred_at,payload')
    .eq('person_id', personId)
    .eq('type', 'merge_conflict')
    .order('occurred_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(shapeEvent);
}

export async function notes(personId: string): Promise<AdminNoteRow[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from('crm_notes')
    .select('id,body,author_user_id,created_at')
    .eq('person_id', personId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as Omit<AdminNoteRow, 'author_name'>[];
  return withAuthorNames(rows);
}

export async function withAuthorNames(rows: Omit<AdminNoteRow, 'author_name'>[]): Promise<AdminNoteRow[]> {
  const ids = [...new Set(rows.map((r) => r.author_user_id).filter((x): x is string => Boolean(x)))];
  const names = await displayNames(ids);
  return rows.map((r) => ({ ...r, author_name: r.author_user_id ? (names.get(r.author_user_id) ?? null) : null }));
}

export async function displayNames(userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (userIds.length === 0) return out;
  const db = serviceClient();
  const { data, error } = await db.from('profiles').select('user_id,display_name').in('user_id', userIds);
  if (error) throw error;
  for (const r of (data ?? []) as { user_id: string; display_name: string | null }[]) {
    out.set(r.user_id, r.display_name);
  }
  return out;
}

export async function redemptions(personId: string): Promise<AdminRedemptionRow[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from('invite_redemptions')
    .select('id,invite_id,granted,redeemed_at,invites(code,label)')
    .eq('person_id', personId)
    .order('redeemed_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const inv = (Array.isArray(r.invites) ? r.invites[0] : r.invites) as
      | { code?: string; label?: string }
      | null;
    return {
      id: String(r.id),
      invite_id: String(r.invite_id),
      code: inv?.code ?? null,
      label: inv?.label ?? null,
      granted: (r.granted as Record<string, unknown>) ?? {},
      redeemed_at: String(r.redeemed_at),
    };
  });
}

export async function mergedFrom(personId: string): Promise<{ id: string; display_name: string | null }[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from('crm_people')
    .select('id,display_name')
    .eq('merged_into', personId)
    .limit(50);
  if (error) throw error;
  return (data ?? []) as { id: string; display_name: string | null }[];
}

/**
 * COUNTS AND TIMESTAMPS. Note what is NOT selected: `content`. There is no code
 * path from a person's detail page to the words in their conversations, and
 * that is the point — 19,100 private messages do not get quietly duplicated
 * into a marketing tool, and neither does one.
 */
export async function kaiActivity(appUserId: string | null) {
  if (!appUserId) {
    return {
      conversations: 0,
      messages: 0,
      last_message_at: null,
      plain: 'No app account, so there is nothing Kai has been asked here.',
    };
  }
  const db = serviceClient();
  const [convs, recent] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact' }).eq('user_id', appUserId).limit(1000),
    db
      .from('conversations')
      .select('last_message_at')
      .eq('user_id', appUserId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (convs.error) throw convs.error;
  const ids = ((convs.data ?? []) as { id: string }[]).map((r) => r.id);
  let messages = 0;
  if (ids.length > 0) {
    const { count, error } = await db
      .from('conversation_messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', ids);
    if (error) throw error;
    messages = count ?? 0;
  }
  const conversations = convs.count ?? ids.length;
  return {
    conversations,
    messages,
    last_message_at: ((recent.data ?? null) as { last_message_at?: string } | null)?.last_message_at ?? null,
    plain: `${conversations} conversations, ${messages} messages. The words themselves are not in the CRM — opening one is a separate, logged action.`,
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** `%` and `_` are wildcards in `ilike`; a search for "50%" must mean "50%". */
function escapeLike(v: string): string {
  return v.replace(/[%_\\]/g, (m) => `\\${m}`).replace(/[(),]/g, ' ');
}
