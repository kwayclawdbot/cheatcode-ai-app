/**
 * THE `stripe` SOURCE — registered, switched off, and honest about why.
 *
 * Same deferral as `kai_sms` (brief §5), and the same reason for existing as a
 * real registration rather than a comment: the Sources screen must show a
 * connector that is off, not a hole where one should be.
 *
 * WHAT IT WOULD OWN, and why nothing else may write it. `crm_mrr_v` counts a
 * person only if they carry a `stripe_customer` identity, so
 * `total_paid_cents`, `total_refunded_cents`, `current_mrr_cents` and
 * `ltv_cents` are this connector's columns alone. Every other writer in this
 * app leaves them null — the `app` source explicitly does — which is what makes
 * "MRR from Stripe only" (brief §8) structural rather than a convention. A
 * number typed in by an importer cannot get into that view.
 *
 * IT ALSO OWNS THE CHURN VOCABULARY. §8 asks for churn in the last 30 days,
 * there is no churn timestamp in this schema, and no view invents one
 * (SCHEMA-NOTES gap 2.36) — so `GET /admin/overview` reports churn as "not
 * tracked yet" until this connector lands and picks a `crm_events.type` for it.
 *
 * ============================================================
 * THE KEY THIS MUST NOT BE GIVEN (brief §11.1)
 * ============================================================
 * A `sk_live_` full-access key exists in `~/breakout-alert-system/.env`. It
 * must NOT be reused here. What this connector needs is a RESTRICTED READ-ONLY
 * key — customers, subscriptions, charges: read — created at
 * dashboard.stripe.com → Developers → API keys → restricted.
 *
 * A CRM never needs write access to money. The whole value of this surface is
 * that an operator can look at everything; the whole risk is that the same
 * credential could also move something. Those two must not be one key.
 *
 * The event key when it lands: the Stripe object id itself (`evt_…`, `sub_…`,
 * `ch_…`), which Stripe already guarantees unique — so a replayed webhook or a
 * re-listed page creates zero rows.
 */
import { env } from './../../env';
import type { Source, SourcePage, SourcePlan } from './../source';

/** Deliberately its OWN variable, never `STRIPE_SECRET_KEY`: the CRM's key is a
 *  different, weaker key from the one billing uses, and sharing the name is how
 *  a full-access key ends up in a read-only place. */
const KEY_VAR = 'STRIPE_CRM_READONLY_KEY';

export const stripeSource: Source = {
  name: 'stripe',
  eventSource: 'stripe',

  async plan(): Promise<SourcePlan> {
    const key = env(KEY_VAR);
    if (!key) {
      return {
        configured: false,
        reason: 'no read-only Stripe key — create a RESTRICTED key (customers, subscriptions, charges: read)',
        plain:
          'Stripe is not being read yet. It needs a restricted, read-only key — a CRM never needs write access to money.',
      };
    }
    if (key.startsWith('sk_')) {
      // A full-access key in this slot is a configuration MISTAKE, and reporting
      // it as configured would hide it behind a green tick forever.
      return {
        configured: false,
        reason: 'the key in STRIPE_CRM_READONLY_KEY is a full-access secret key (sk_…), not a restricted one (rk_…)',
        plain:
          'The Stripe key set here is a full-access key. Replace it with a restricted, read-only key before this source is switched on.',
      };
    }
    return {
      configured: false,
      reason: 'restricted key present but the connector body is not written (deferred by the owner)',
      plain:
        'A restricted Stripe key is set, but this connector has not been written yet. It stays off until it is.',
    };
  },

  async pull(): Promise<SourcePage> {
    throw new Error(
      'the stripe connector is registered but not implemented — it is deferred, not broken'
    );
  },
};
