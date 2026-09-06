/**
 * DELETE /api/v1/account/delete — the person removes their own account.
 *
 * ===========================================================================
 * WHY IT EXISTS, AND WHY IT HAS TO ACTUALLY WORK
 * ===========================================================================
 * Apple has required an in-app route to account deletion since June 2022 (App
 * Review guideline 5.1.1(v)). Not having one is a rejection. But the reason to
 * build it properly is the other one: a route that signs somebody out and
 * returns "deleted" is a false statement made to a person about their own
 * data, and in most of the places this app ships, a legally actionable one.
 *
 * SO THE SERVER DOES EVERYTHING THE SCREEN PROMISES, AND THE SCREEN PROMISES
 * ONLY WHAT THE SERVER DOES. The full list — what is deleted, what is
 * anonymised, what is retained and why — is written out at the top of
 * `supabase/migrations/0032_account_deletion.sql`, and the confirmation screen
 * in the app is a plain-English rendering of that same list.
 *
 * ---------------------------------------------------------------------------
 * TWO STEPS, IN THIS ORDER, AND THE ORDER IS THE WHOLE DESIGN
 * ---------------------------------------------------------------------------
 *   1. `delete_account(user_id)` — one transaction inside the database. It
 *      anonymises what other people depend on, deletes what is private, and
 *      removes the `profiles` row, which cascades the rest.
 *
 *   2. `auth.admin.deleteUser(user_id)` — the login itself.
 *
 * Step 2 cannot run first: `messages.user_id` and five other foreign keys
 * reference `profiles` with no ON DELETE action, so deleting the auth row while
 * any of them stand fails on a constraint violation. Running step 1 first means
 * that by the time the auth row goes, nothing points at it.
 *
 * IF STEP 2 FAILS AFTER STEP 1 SUCCEEDED, that is reported as a partial and the
 * person is told the truth: their data is gone and their login is not, with the
 * request id to quote. It is the one outcome that cannot be made atomic — the
 * auth service is a different system and cannot join the database transaction —
 * so it is named rather than papered over. Re-running the endpoint finishes the
 * job: `delete_account` is idempotent and returns `already_gone` on a second
 * pass rather than failing.
 *
 * ---------------------------------------------------------------------------
 * WHO IT CAN DELETE: ONLY THE CALLER
 * ---------------------------------------------------------------------------
 * The user id comes from `ctx.user.id`, which `authed()` derived from the
 * bearer token. Nothing in the request body is read, and there is no way to
 * name a different account. The database function is likewise granted to
 * `service_role` only, never to `authenticated`.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT DO: CANCEL A SUBSCRIPTION
 * ---------------------------------------------------------------------------
 * Deleting the account does not stop a recurring charge. That money moves in
 * Stripe, through a subscription bought on the website, and this route does not
 * reach into it — cancelling somebody's billing as a side effect of a different
 * request is not a thing a server should do quietly. So the app says so, in
 * plain words, on the confirmation screen BEFORE the person confirms, and this
 * route repeats it in the response. Saying it is the honest half; saying it
 * beforehand is the useful half.
 */
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authed, ok, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { requireEnv } from '@/lib/env';
import { ApiError } from '@/lib/errors';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * A second client, with auth admin powers, built here rather than shared.
 *
 * `serviceClient()` is deliberately configured for table work. Deleting a login
 * is the single most destructive call this codebase can make, and it is built
 * at the one call site that needs it so that it cannot be picked up casually by
 * something else.
 */
function authAdminClient() {
  // The same two variables `lib/db.ts` reads. `requireEnv` throws a clear
  // startup-shaped error when either is missing, which is the right failure:
  // an API deployed without a service key must not answer this route at all.
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const DELETE = authed(async (_req: NextRequest, ctx: Ctx) => {
  const userId = ctx.user.id;
  const db = serviceClient();

  /* ---- step 1: the data --------------------------------------------- */
  const { data, error } = await db.rpc('delete_account', { p_user_id: userId });

  if (error) {
    // NOTHING HAS CHANGED AT THIS POINT. The function is one transaction, so a
    // failure rolled all of it back — which is worth saying out loud to the
    // person, because "it failed" and "it half-happened" need very different
    // reactions from them.
    log('error', ctx.requestId, 'account.delete.data_failed', {
      user_id: userId,
      code: error.code,
      message: error.message,
    });
    throw new ApiError(
      'INTERNAL',
      'I could not delete the account, and nothing has been changed — it is all still exactly as it was. Please try again, and if it fails a second time send us the reference on this screen.'
    );
  }

  const result = (data ?? {}) as {
    already_gone?: boolean;
    messages_anonymised?: number;
    crm_person_anonymised?: boolean;
  };

  log('info', ctx.requestId, 'account.delete.data_done', {
    user_id: userId,
    already_gone: result.already_gone ?? false,
    messages_anonymised: result.messages_anonymised ?? 0,
  });

  /* ---- step 2: the login -------------------------------------------- */
  const admin = authAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(userId);

  if (authError) {
    /**
     * THE ONE OUTCOME THAT CANNOT BE ROLLED BACK, REPORTED AS WHAT IT IS.
     *
     * The data is gone and the login is not. Answering 200 here would be a lie
     * of the exact kind this route exists to avoid, and answering a bare 500
     * would leave the person believing nothing happened when in fact
     * everything did. So it is its own message: what went, what did not, and
     * that trying again finishes it.
     */
    log('error', ctx.requestId, 'account.delete.auth_failed', {
      user_id: userId,
      message: authError.message,
    });
    throw new ApiError(
      'INTERNAL',
      'Your data has been deleted, but the sign-in itself could not be removed just now. Nothing of yours is left in the app. Try again in a minute to finish it, or send us the reference on this screen and we will.'
    );
  }

  log('info', ctx.requestId, 'account.delete.done', { user_id: userId });

  return ok({
    deleted: true,
    /**
     * WHAT THE APP SHOWS AFTERWARDS. It repeats the subscription point because
     * this is the last screen the person will ever see in this app, and a
     * recurring charge they did not expect is the one consequence they cannot
     * come back and fix from in here.
     */
    plain:
      'Your account is gone. Your profile, your paper account and its whole history, every conversation with Kai and everything he remembered about you, your alerts, your watchlists and your devices have all been deleted. Anything you posted in a room has had its text removed and no longer carries your name. If you pay for a subscription, that is billed separately and is not cancelled by this — cancel it where you bought it.',
    messages_anonymised: result.messages_anonymised ?? 0,
  });
});
