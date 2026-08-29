/**
 * THE `kai_sms` SOURCE — registered, switched off, and honest about why.
 *
 * Owner, 2026-08-29: "just make the admin and CRM system first, we will worry
 * about the import later." So this is a real registration with a real `plan()`
 * and a `pull()` that refuses, not a TODO comment. The Sources screen shows a
 * connector that EXISTS and is off — which is a different thing from a feature
 * that is missing, and it is what stops somebody rebuilding this next quarter.
 *
 * WHAT SWITCHING IT ON LOOKS LIKE. Two env vars pointing at the K.AI Supabase
 * project `ryprohqthwflinadqotj`, and the body of `pull()`. Nothing structural:
 * the identity resolution, the `unique(source, external_id)` idempotency, the
 * resumable cursor, the conflict refusal and the dry run are all in the runner
 * already and are proven by the `app` source today.
 *
 * ============================================================
 * THE PRIVACY CONTRACT, WRITTEN HERE BEFORE THE CODE EXISTS
 * ============================================================
 * `public.conversation_history` in that project holds 19,100 private SMS turns.
 * When this connector is written it copies COUNTS AND TIMESTAMPS ONLY:
 *
 *     inbound_count, outbound_count, last_inbound_at, last_outbound_at
 *
 * and NEVER the text of a message, into `crm_people` or into a
 * `crm_events.payload`. There is no body column in `crm_people` and there is
 * not going to be one (brief §3). 19,100 private messages do not get quietly
 * duplicated into a marketing tool because a connector found them convenient.
 *
 * The shape to port is already known and already matches: `crm.contacts` in
 * that project is 2,507 rows of exactly the model in 0025 §2, `crm.events` is
 * 3,320 timeline rows, `crm.subscriptions` is 130 Stripe rows, and
 * `public.users` is 309 SMS users carrying `auth_user_id` — which is the
 * `app_user` identity that joins the two systems without a name match.
 *
 * The event key when it lands: `kai:contact:<id>` for a person's own rows and
 * `kai:event:<id>` for the timeline, so a re-ingest of a database that is still
 * being written to creates zero duplicates.
 */
import { env } from './../../env';
import type { Source, SourcePage, SourcePlan } from './../source';

/** The K.AI project's own connection, deliberately NOT this app's Supabase. */
const URL_VAR = 'KAI_SMS_SUPABASE_URL';
const KEY_VAR = 'KAI_SMS_SUPABASE_SERVICE_ROLE_KEY';

export const kaiSmsSource: Source = {
  name: 'kai_sms',
  eventSource: 'kai_sms',

  async plan(): Promise<SourcePlan> {
    // The env check is real, not decorative: the day the owner sets these two
    // variables this reports `configured: true` and the only thing missing is
    // `pull()`, which fails loudly rather than pretending to have synced.
    if (!env(URL_VAR) || !env(KEY_VAR)) {
      return {
        configured: false,
        reason: 'foreign database import not yet authorised — no K.AI Supabase credentials here',
        plain:
          'The K.AI SMS people are not being read yet. Importing another project’s database has not been authorised, and there are no credentials for it in this app.',
      };
    }
    return {
      configured: false,
      reason: 'credentials present but the connector body is not written (deferred by the owner)',
      plain:
        'Credentials for the K.AI database are set, but this connector has not been written yet. It stays off until it is.',
    };
  },

  async pull(): Promise<SourcePage> {
    // A stub that returned an empty page would look like a successful sync of
    // zero people, and the Sources screen would show a green run for a
    // connector that read nothing. It refuses instead, and the runner records
    // the run as `failed` with this sentence.
    throw new Error(
      'the kai_sms connector is registered but not implemented — it is deferred, not broken'
    );
  },
};
