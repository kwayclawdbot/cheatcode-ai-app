/**
 * THE SOURCE INTERFACE — three methods, and the same three for every connector.
 *
 * Brief §5: `plan()` → `pull(cursor)` → `resolve()`. This round implements ONE
 * source for real (`app`, this database) and registers two as stubs
 * (`kai_sms`, `stripe`) that answer `configured: false` with the exact reason.
 *
 * WHY BUILD THE INTERFACE FOR SOURCES THAT ARE SWITCHED OFF. Because the shape
 * of an ingest is the part that is expensive to retrofit, and retrofitting it
 * is what makes CRMs untrustworthy. The idempotency key, the resumable cursor,
 * the identity resolution, the conflict refusal and the dry run all exist NOW,
 * proven against the `app` source. When the owner returns to Stripe and to the
 * K.AI database, the work is writing two `pull()` bodies — nothing structural.
 *
 * THE PRIVACY RULE SURVIVES THE DEFERRAL. A `PersonUpsert` has counts and
 * timestamps and no message body, because there is nowhere in `crm_people` to
 * put one and there is not going to be. When the SMS source is switched on it
 * copies `inbound_count`, `outbound_count`, `last_inbound_at`,
 * `last_outbound_at` — never the text of `conversation_history`. 19,100 private
 * messages do not get duplicated into a marketing tool (brief §3).
 */
import type { CrmEventSource, CrmIdentityKind, CrmStatus, SyncSourceName } from '@shared/api';

/** What a run did. Reported by the admin button and by the internal driver. */
export type SyncCounts = {
  /** Rows the source looked at. */
  scanned: number;
  /** Rows this run actually INSERTED. A second run must make this zero. */
  created: number;
  /** People an existing identity already pointed at. */
  resolved: number;
  /** Candidate matches refused because two strong identities disagreed. */
  conflicted: number;
  /** Looked at and deliberately left alone (already identical, or unusable). */
  skipped: number;
};

export const ZERO_COUNTS: SyncCounts = {
  scanned: 0,
  created: 0,
  resolved: 0,
  conflicted: 0,
  skipped: 0,
};

/**
 * One person as a source sees them. Every field is optional except the
 * identities, because a source that only knows a phone number still knows a
 * person, and a null must never overwrite something another source knew.
 */
export type PersonUpsert = {
  identities: { kind: CrmIdentityKind; value: string; verified?: boolean }[];
  display_name?: string | null;
  primary_email?: string | null;
  primary_phone_e164?: string | null;
  /** The DERIVED funnel state (brief §5). Never a stored second copy. */
  status?: CrmStatus;
  primary_tier?: string | null;
  source?: string | null;
  source_detail?: Record<string, unknown>;
  first_seen_at?: string | null;
  last_active_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  inbound_count?: number;
  outbound_count?: number;
  total_paid_cents?: number | null;
  current_mrr_cents?: number | null;
  ltv_cents?: number | null;
  app_user_id?: string | null;
};

/**
 * One timeline row. `external_id` is the IDEMPOTENCY KEY and is not optional in
 * practice: `unique (source, external_id)` only dedups keyed rows, and null is
 * distinct from null in Postgres, so an unkeyed event would be re-created on
 * every run. A connector that cannot key a row must not emit it.
 */
export type EventUpsert = {
  external_id: string;
  type: string;
  category?: string | null;
  payload?: Record<string, unknown>;
  value_cents?: number | null;
  occurred_at: string;
};

/** What one `pull()` page returned. */
export type SourcePage = {
  people: { person: PersonUpsert; events: EventUpsert[] }[];
  /** Opaque resume point. Null means the source is exhausted. */
  cursor: Record<string, unknown> | null;
  /** How many rows the source READ to produce this page. */
  scanned: number;
};

export type SourcePlan =
  | { configured: true; reason: null; plain: string }
  | { configured: false; reason: string; plain: string };

export type Source = {
  name: SyncSourceName;
  /** Which `crm_events.source` this connector writes. */
  eventSource: CrmEventSource;
  /**
   * CAN THIS RUN AT ALL, and if not, exactly why. Called by `GET /admin/sync`
   * on every load, so the Sources screen states today's truth rather than a
   * deploy-time constant.
   */
  plan(): Promise<SourcePlan>;
  /**
   * One page. `cursor` is whatever this connector last returned; null starts
   * from the beginning. The runner persists it to `sync_runs.cursor` so an
   * interrupted run resumes instead of restarting.
   */
  pull(cursor: Record<string, unknown> | null): Promise<SourcePage>;
};

const registry = new Map<SyncSourceName, Source>();

export function registerSource(s: Source): void {
  registry.set(s.name, s);
}

export function getSource(name: SyncSourceName): Source | null {
  return registry.get(name) ?? null;
}

/** Registration order is display order: real first, then the two that are off. */
export function allSources(): Source[] {
  return ['app', 'kai_sms', 'stripe']
    .map((n) => registry.get(n as SyncSourceName))
    .filter((s): s is Source => Boolean(s));
}
