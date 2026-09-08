/**
 * THE FUNNEL'S ANSWERS, RECORDED SOMEWHERE THE PRODUCT CAN READ THEM BACK.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS THERE BEFORE
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F21 (P1). `apps/site` runs a persona selector, a cinematic reveal, two
 * branching demos and a personalised recap, and then handed the visitor a
 * `mailto:` link. `getAppHref` carried path, interest and priority into
 * `/get-the-app`, which built an email body out of them and asked the most
 * engaged person in the funnel to send it by hand. No account, no subscription,
 * no record. In a social in-app browser with no configured mail client, the tap
 * did nothing at all and said nothing about it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS WRITES INTO THE CRM THAT ALREADY EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * `crm_people` / `crm_identities` / `crm_events` (0025) is exactly this table:
 * one row per human, an identity index with `unique (kind, value)` that makes
 * double-resolution physically impossible, and a timeline keyed by
 * `unique (source, external_id)` so a retry writes nothing. A `lead` is
 * explicitly a first-class citizen there — "a person may have no app user at
 * all". An early-access request is a lead with three answers attached, which is
 * the shape this schema was built for.
 *
 * Inventing an `early_access_requests` table would have meant a second identity
 * story, a second dedup story and a second thing for the admin surface to learn
 * about, in exchange for nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TOKEN, AND WHAT IT DELIBERATELY CANNOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 * The site hands the visitor an opaque token so that a device which later
 * installs the app can pick the answers back up. The audit's constraint on it
 * is the important line: "An intent token must not be a way to claim someone
 * else's identity; keep it to intent, and let authentication establish who."
 *
 * Three things enforce that, and none of them is a comment:
 *
 *   1. `readIntentByToken` returns `{ path, interest, priority }`. There is no
 *      code path from a token to an email, a name or a person id — the return
 *      type has no field for one.
 *   2. The token is stored HASHED. `crm_events.external_id` holds
 *      `early_access:<sha256>`, so a database read does not yield working
 *      tokens, and the plaintext exists only in the reply to the request that
 *      created it.
 *   3. Linking a CRM person to an app account is a separate function,
 *      `linkAppUser`, and it is driven by the AUTHENTICATED user's own verified
 *      email — never by the token. Presenting a stranger's token gets you their
 *      chosen path. It gets you nothing about them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDEMPOTENCY
 * ─────────────────────────────────────────────────────────────────────────────
 * `unique (source, external_id)` makes a re-POST of the same token a no-op.
 * Re-submitting the FORM makes a new token, which is correct rather than
 * wasteful: somebody who went back and changed their answers has made a second,
 * later request, and the claim resolves the most recent one. The audit asks
 * explicitly to "let people change their answers".
 */
import { createHash, randomBytes } from 'node:crypto';
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { normaliseEmail, resolvePerson } from './identity';

/** The site's three doors. Its vocabulary — see apps/site/src/sim/handoff.ts. */
export const FUNNEL_PATHS = ['learn', 'swing', 'pro'] as const;
export type FunnelPath = (typeof FUNNEL_PATHS)[number];

export function isFunnelPath(v: unknown): v is FunnelPath {
  return typeof v === 'string' && (FUNNEL_PATHS as readonly string[]).includes(v);
}

/**
 * What a completed funnel says. THREE FIELDS, and not one of them identifies
 * anybody — that is what makes it safe to hand back for a bare token.
 */
export type FunnelIntent = {
  path: FunnelPath;
  interest: string | null;
  priority: string | null;
};

const EVENT_TYPE = 'early_access_requested';
const EVENT_SOURCE = 'app';
const PERSON_SOURCE = 'site';

/** Answers are the site's own feature ids. Bounded, never interpreted here. */
function shortTag(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s || s.length > 64) return null;
  return /^[a-z0-9_-]+$/i.test(s) ? s : null;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function externalIdFor(token: string): string {
  return `early_access:${tokenHash(token)}`;
}

export type RecordedIntent = {
  token: string;
  /** True when this email had already asked. The request still succeeds. */
  returning: boolean;
  intent: FunnelIntent;
};

/**
 * Record one early-access request.
 *
 * Refuses an unusable email rather than storing a lead nobody can be told
 * about: `normaliseEmail` returns null for anything without an `@` and a dot
 * after it, and an identity that is not an address is one more thing another
 * non-address can collide with.
 */
export async function recordEarlyAccessIntent(input: {
  path: FunnelPath;
  interest?: string | null;
  priority?: string | null;
  email: string;
  requestId: string;
}): Promise<RecordedIntent> {
  const email = normaliseEmail(input.email);
  if (!email) {
    throw new ApiError('VALIDATION_FAILED', 'That does not look like an email address. Check it and try again.');
  }

  const db = serviceClient();
  const now = new Date().toISOString();
  const intent: FunnelIntent = {
    path: input.path,
    interest: shortTag(input.interest),
    priority: shortTag(input.priority),
  };

  const outcome = await resolvePerson([{ kind: 'email', value: email }]);

  // A conflict needs two identities disagreeing and we sent one, so this branch
  // is unreachable today. It is written out anyway rather than assumed away:
  // `resolvePerson`'s contract is that a conflict is a refusal, and a caller
  // that silently treated one as "no match" would create the duplicate person
  // that whole module exists to prevent.
  if (outcome.kind === 'conflict') {
    throw new ApiError('STATE_CONFLICT', 'We already have a record that needs a person to look at it. Email support and we will sort it out.');
  }

  let personId: string;
  let returning = false;

  if (outcome.kind === 'none') {
    const { data, error } = await db
      .from('crm_people')
      .insert({
        primary_email: email,
        status: 'lead',
        source: PERSON_SOURCE,
        source_detail: { funnel_path: input.path },
        first_seen_at: now,
        last_active_at: now,
      })
      .select('id')
      .single();
    if (error) throw error;
    personId = (data as { id: string }).id;

    const { error: idErr } = await db
      .from('crm_identities')
      .upsert(
        [{ person_id: personId, kind: 'email', value: email, source: PERSON_SOURCE, verified: false }],
        { onConflict: 'kind,value', ignoreDuplicates: true },
      );
    if (idErr) throw idErr;
  } else {
    returning = true;
    personId = outcome.personId;
    // A merged loser still resolves — that is what merges are for — and the
    // writes belong to the survivor. One hop only, exactly as `run.ts` does it.
    const { data } = await db.from('crm_people').select('merged_into').eq('id', personId).maybeSingle();
    const merged = (data as { merged_into?: string | null } | null)?.merged_into;
    if (typeof merged === 'string') personId = merged;
    // `last_active_at` only. Never `status`: this person may already be paying,
    // and an early-access form must not walk anybody backwards down the funnel.
    await db.from('crm_people').update({ last_active_at: now }).eq('id', personId);
  }

  const token = randomBytes(24).toString('base64url');
  const { error: evErr } = await db.from('crm_events').upsert(
    [
      {
        person_id: personId,
        type: EVENT_TYPE,
        category: 'funnel',
        source: EVENT_SOURCE,
        payload: { ...intent, request_id: input.requestId },
        occurred_at: now,
        external_id: externalIdFor(token),
      },
    ],
    { onConflict: 'source,external_id', ignoreDuplicates: true },
  );
  if (evErr) throw evErr;

  return { token, returning, intent };
}

function intentFromPayload(payload: unknown): FunnelIntent | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (!isFunnelPath(p.path)) return null;
  return {
    path: p.path,
    interest: shortTag(typeof p.interest === 'string' ? p.interest : null),
    priority: shortTag(typeof p.priority === 'string' ? p.priority : null),
  };
}

/**
 * The intent behind a token, and NOTHING ELSE.
 *
 * `person_id` is deliberately not selected. Not because reading it would be
 * expensive, but because a function that has it in hand is one careless line
 * away from returning it, and this is the function a stranger's token reaches.
 */
export async function readIntentByToken(token: string): Promise<FunnelIntent | null> {
  if (!token || token.length > 200) return null;
  const db = serviceClient();
  const { data, error } = await db
    .from('crm_events')
    .select('payload')
    .eq('source', EVENT_SOURCE)
    .eq('external_id', externalIdFor(token))
    .maybeSingle();
  if (error) throw error;
  return intentFromPayload((data as { payload?: unknown } | null)?.payload);
}

/**
 * The intent this AUTHENTICATED person submitted, found by their own email.
 *
 * This is the half the audit's acceptance actually turns on — "onboarding can
 * retrieve the submitted intent for the correct person" — and it is the half
 * that needs no token at all. Somebody who filled the form on a laptop and
 * installed the app on a phone has no token on that phone; what they have is a
 * verified session whose email is the identity the form wrote.
 *
 * Authentication establishes who. The lookup is then an ordinary read of that
 * person's own timeline, newest first.
 */
export async function readIntentForEmail(email: string | null): Promise<FunnelIntent | null> {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;
  const outcome = await resolvePerson([{ kind: 'email', value: normalised }]);
  if (outcome.kind !== 'matched') return null;

  const db = serviceClient();
  const { data, error } = await db
    .from('crm_events')
    .select('payload')
    .eq('person_id', outcome.personId)
    .eq('type', EVENT_TYPE)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return intentFromPayload((data as { payload?: unknown } | null)?.payload);
}

/**
 * Join the CRM person to the app account — ON THE EMAIL, NEVER ON THE TOKEN.
 *
 * The token says what somebody wanted. The session says who they are. Only the
 * second one is allowed to decide that a lead and an account are the same
 * human, which is why this takes a user id AND that user's own email and
 * resolves on the email alone.
 *
 * `crm_people.app_user_id` is unique, and `crm_identities` is unique on
 * `(kind, value)`, so a race or a repeat is a no-op rather than a second claim.
 * A person row that already carries a DIFFERENT app user is left completely
 * alone: two accounts sharing one mailbox is a normal, boring thing, and
 * quietly moving the link is the double-resolution 0025 exists to prevent.
 */
export async function linkAppUser(userId: string, email: string | null): Promise<'linked' | 'already' | 'skipped'> {
  const normalised = normaliseEmail(email);
  if (!normalised) return 'skipped';
  const outcome = await resolvePerson([{ kind: 'email', value: normalised }]);
  if (outcome.kind !== 'matched') return 'skipped';

  const db = serviceClient();
  const { data, error } = await db
    .from('crm_people')
    .select('id,app_user_id,status,merged_into')
    .eq('id', outcome.personId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { id: string; app_user_id: string | null; status: string; merged_into: string | null } | null;
  if (!row) return 'skipped';
  if (row.merged_into) return 'skipped';
  if (row.app_user_id === userId) return 'already';
  if (row.app_user_id) return 'skipped';

  const { error: upErr } = await db
    .from('crm_people')
    .update({
      app_user_id: userId,
      // `signed_up` is derived state and this is the moment it becomes true for
      // a lead. Anybody already further along the funnel keeps where they are.
      ...(row.status === 'lead' || row.status === 'invited' ? { status: 'signed_up' } : {}),
      last_active_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .is('app_user_id', null);
  if (upErr) throw upErr;

  await db
    .from('crm_identities')
    .upsert([{ person_id: row.id, kind: 'app_user', value: userId, source: PERSON_SOURCE, verified: true }], {
      onConflict: 'kind,value',
      ignoreDuplicates: true,
    });

  return 'linked';
}
