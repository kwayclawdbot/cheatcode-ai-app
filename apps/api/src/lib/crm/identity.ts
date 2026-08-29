/**
 * IDENTITY RESOLUTION — the one algorithm every connector shares.
 *
 * Brief §5 fixes the order and it is fixed here rather than in each source,
 * because a connector that gets it wrong does not fail loudly: it makes a
 * second person, and a CRM with two rows for one human is a CRM nobody trusts
 * six months later.
 *
 *   stripe_customer → app_user → normalised email → E.164 phone
 *
 * NEVER ON A NAME. Two people called James Smith are two people. The order runs
 * strongest-first and STOPS AT THE FIRST HIT: a stripe customer id was issued
 * by Stripe to exactly one payer, an app_user is a row in `auth.users`, an
 * email is one mailbox, a phone is one handset — and confidence falls off
 * across that list, so the first match is the best one available.
 *
 * NORMALISATION IS THIS FILE'S JOB, NOT THE DATABASE'S (0025 §3).
 * `crm_identities.unique(kind, value)` cannot lowercase an email, because
 * `value` holds seven different kinds of thing. What the constraint guarantees
 * is that the normalisation here is the ONLY question: get it right and two
 * people cannot share an identity, get it wrong and you get a duplicate person
 * — never a silently shared one.
 *
 * THE CONFLICT CASE, which is the part that must refuse. When a candidate match
 * would join two people who BOTH already carry a different strong identity, we
 * do not merge. We write a `merge_conflict` event and surface it for a human
 * (brief §5). Automatic merging is how a CRM welds two strangers together, and
 * the undo for that is an afternoon.
 */
import type { CrmIdentityKind } from '@shared/api';
import { serviceClient } from './../db';

export type IdentityInput = { kind: CrmIdentityKind; value: string; verified?: boolean };

/** The order. Index 0 is the strongest claim. */
export const RESOLUTION_ORDER: CrmIdentityKind[] = [
  'stripe_customer',
  'app_user',
  'email',
  'phone',
];

/** Anything at or above this rank is a STRONG identity for the conflict rule. */
const STRONG: ReadonlySet<CrmIdentityKind> = new Set<CrmIdentityKind>([
  'stripe_customer',
  'app_user',
]);

export function isStrong(kind: CrmIdentityKind): boolean {
  return STRONG.has(kind);
}

/**
 * Lowercased and trimmed, and NOTHING ELSE. No plus-address stripping, no dot
 * folding: `a.b+crm@gmail.com` and `ab@gmail.com` are the same Gmail inbox and
 * are NOT the same identity anywhere else, and a CRM that assumes Gmail's rules
 * apply everywhere merges two different people at some other provider. Returns
 * null for anything without an `@` and a dot after it — a non-address must not
 * become an identity that another non-address can collide with.
 */
export function normaliseEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v || v.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

/**
 * E.164, and only when we can be sure. A bare 10-digit string is assumed +1 —
 * this is a US-market product and every phone in the K.AI source is US — and
 * anything else must already carry its country code. A guess in the other
 * direction (prefixing +1 onto an 11-digit foreign number) invents an identity
 * that could collide with a real US one, so it is refused instead.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const digits = v.replace(/[^\d]/g, '');
  if (v.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Codes are stored uppercase; the SQL compares on `lower()` regardless. */
export function normaliseIdentity(kind: CrmIdentityKind, raw: string): string | null {
  switch (kind) {
    case 'email':
      return normaliseEmail(raw);
    case 'phone':
      return normalisePhone(raw);
    case 'invite_code':
      return raw.trim().toUpperCase() || null;
    default:
      return raw.trim() || null;
  }
}

export type ResolveOutcome =
  | { kind: 'matched'; personId: string; on: CrmIdentityKind }
  | { kind: 'none' }
  | {
      kind: 'conflict';
      /** The person the weaker identity would have joined. */
      personId: string;
      /** The person the strong identity says this is. */
      otherPersonId: string;
      on: CrmIdentityKind;
      strongOn: CrmIdentityKind;
    };

/**
 * Look up a candidate person from a bag of identities, in the fixed order.
 *
 * The conflict test: after the first (strongest) hit, every OTHER identity in
 * the bag that already belongs to a DIFFERENT person is checked. If either the
 * matched identity or the disagreeing one is strong, this is a conflict and the
 * caller must not merge them. Two people sharing only a weak identity (the same
 * household email, a recycled phone) is a normal, boring thing and resolves to
 * the first hit.
 */
export async function resolvePerson(identities: IdentityInput[]): Promise<ResolveOutcome> {
  const db = serviceClient();

  const normalised: { kind: CrmIdentityKind; value: string }[] = [];
  for (const i of identities) {
    const value = normaliseIdentity(i.kind, i.value);
    if (value) normalised.push({ kind: i.kind, value });
  }
  if (normalised.length === 0) return { kind: 'none' };

  // One round trip. `or` across (kind,value) pairs, then rank in memory: the
  // set is at most a handful of rows and a per-kind query loop would be four.
  const clauses = normalised.map((n) => `and(kind.eq.${n.kind},value.eq.${quote(n.value)})`);
  const { data, error } = await db
    .from('crm_identities')
    .select('person_id,kind,value')
    .or(clauses.join(','));
  if (error) throw error;

  const rows = (data ?? []) as { person_id: string; kind: CrmIdentityKind }[];
  if (rows.length === 0) return { kind: 'none' };

  const rank = (k: CrmIdentityKind) => {
    const i = RESOLUTION_ORDER.indexOf(k);
    return i === -1 ? RESOLUTION_ORDER.length : i;
  };
  rows.sort((a, b) => rank(a.kind) - rank(b.kind));
  const best = rows[0];

  const disagreeing = rows.find((r) => r.person_id !== best.person_id);
  if (disagreeing && (isStrong(best.kind) || isStrong(disagreeing.kind))) {
    return {
      kind: 'conflict',
      personId: disagreeing.person_id,
      otherPersonId: best.person_id,
      on: disagreeing.kind,
      strongOn: best.kind,
    };
  }

  return { kind: 'matched', personId: best.person_id, on: best.kind };
}

/** PostgREST `or=` values need quoting when they can contain a comma or a dot. */
function quote(v: string): string {
  return `"${v.replace(/"/g, '\\"')}"`;
}
