-- =====================================================================
-- 0032 — DELETING AN ACCOUNT, AND MEANING IT
-- =====================================================================
--
-- WHY THIS EXISTS. Apple has required an in-app way to delete your account
-- since June 2022 (App Review guideline 5.1.1(v)), and this app has never had
-- one. It is a hard rejection, not a note.
--
-- BUT THE REJECTION IS THE SMALLER PROBLEM. The larger one is that a screen
-- saying "your account has been deleted" over a server that only signed you
-- out is a lie told to a person about their own data, and in most of the places
-- this app ships, a legal one. So this file is written the other way round:
-- work out what CAN honestly be deleted, delete exactly that, and make the
-- confirmation screen describe this function rather than an intention.
--
-- ---------------------------------------------------------------------
-- WHY A SECURITY DEFINER FUNCTION AND NOT A ROUTE FULL OF DELETES
-- ---------------------------------------------------------------------
-- Three reasons, and each one on its own would be enough:
--
--   1. THE SERVICE ROLE CANNOT DELETE FROM THE APPEND-ONLY TABLES. 0014 and
--      0026 revoke UPDATE, DELETE and TRUNCATE on `risk_policy_events`,
--      `user_events`, `plan_events`, `order_events`, `fills` and
--      `moderation_log` from `service_role` itself. A Node route holding the
--      service key is refused. That guard exists to stop the API mutating a
--      journal by accident; it was never meant to stop the database's owner
--      erasing a person on request, and a definer function is the documented
--      way to say which of those two is happening.
--
--   2. FOREIGN KEYS WOULD BLOCK IT ANYWAY. `messages.user_id` references
--      `profiles` with no ON DELETE action, so a single post — one, ever —
--      makes `delete from auth.users` fail outright with a constraint
--      violation. The same is true of `allocation_models.approved_by`,
--      `legacy_imports.claimed_by`, `positions.account_id`,
--      `alert_triggers.alert_id` and `invest_recommendations.goal_id`. The
--      order below is not decoration; it is the order that works.
--
--   3. IT HAS TO BE ONE TRANSACTION. A deletion that fails halfway leaves a
--      person who cannot sign in and whose data is still there, which is the
--      worst of both. A function either completes or changes nothing.
--
-- ---------------------------------------------------------------------
-- THE THREE OUTCOMES, AND WHY EACH ROW GETS THE ONE IT GETS
-- ---------------------------------------------------------------------
-- DELETED    Anything that is only ever about this person and that nobody
--            else's record depends on. Their profile, trades, positions,
--            plans, alerts, watchlists, chart markup, every Kai conversation
--            and everything Kai remembered about them, their devices, their
--            notifications, their settings.
--
-- ANONYMISED Content other people can still see, and records that exist to
--            protect somebody else. A room post is not only the poster's — it
--            sits in a conversation other members took part in and replied to.
--            So the CONTENT GOES and the AUTHORSHIP IS SEVERED, and the row
--            keeps its place in the thread as a removed message. Deleting the
--            rows outright would break other people's replies; leaving them
--            intact would not be a deletion.
--
-- RETAINED   Money, and other people's audit trails. What was paid has to
--            survive for accounting and for a chargeback that arrives four
--            months later, and a moderator's record of an action they took is
--            theirs, not the deleted person's. These rows keep no name, no
--            email, no phone number and no device — only an account id that no
--            longer resolves to a person anywhere in this database.
--
-- The confirmation screen in the app says all three of those in plain words
-- before anything happens. It is generated from this list, not from a wish.
--
-- ---------------------------------------------------------------------
-- WHAT THIS FUNCTION DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------
-- It does not touch `auth.users`. The API route deletes that afterwards, with
-- the admin client, once this function has removed everything that pointed at
-- it. Splitting it that way means the FK-heavy half runs in one transaction in
-- the database and the auth half — which is a separate service and cannot join
-- that transaction — runs last, when it can no longer fail on a constraint.
--
-- It does not cancel a Stripe subscription. That is real money moving and it
-- belongs to a system this database does not own. The API route says so, in
-- writing, on the confirmation screen: a subscription bought on the website is
-- cancelled on the website. Silently cancelling it here, or silently NOT
-- cancelling it while implying otherwise, are both worse than saying it.

-- ---------------------------------------------------------------------
-- 1. `messages.user_id = null` HAS TO STOP MEANING "KAI"
-- ---------------------------------------------------------------------
-- 0010 declares `user_id uuid references profiles` with the comment
-- "null = Kai/system". Severing authorship therefore cannot just null the
-- column — it would silently reattribute a stranger's posts to Kai, which is a
-- fabricated record and exactly the class of thing this app refuses to produce.
-- One boolean fixes it: null AND author_deleted means the person who wrote this
-- asked to be removed; null and NOT author_deleted still means Kai.
alter table messages
  add column if not exists author_deleted boolean not null default false;

comment on column messages.author_deleted is
  'True when the author deleted their account. `user_id` is null on these rows, '
  'and WITHOUT this flag that null would read as "posted by Kai" (0010). A '
  'surface rendering an author must check this before falling back to Kai.';

-- ---------------------------------------------------------------------
-- 2. THE FUNCTION
-- ---------------------------------------------------------------------
create or replace function delete_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messages   int := 0;
  v_person_id  uuid;
  v_exists     boolean;
begin
  if p_user_id is null then
    raise exception 'delete_account: no user id';
  end if;

  select true into v_exists from profiles where user_id = p_user_id;
  if v_exists is not true then
    -- Not an error. A retried request, or an account whose profile row was
    -- already gone, should end in the same place as a first attempt: nothing
    -- left. The route then deletes the auth row and reports success honestly.
    return jsonb_build_object('already_gone', true, 'messages_anonymised', 0);
  end if;

  -- =================================================================
  -- 2a. ANONYMISE FIRST — the rows that must survive without the person
  -- =================================================================

  -- COMMUNITY POSTS. Content scrubbed at the base table, not just hidden by
  -- the `messages_public` view: the view nulls the body for a deleted row but
  -- the body is still sitting in `messages`, and "we deleted it" has to be true
  -- of the table and not only of the query. `structured_idea`,
  -- `position_disclosure` and `refs` go with it — a structured idea carries the
  -- person's own reasoning and their disclosed position, which is more personal
  -- than the sentence above it, not less.
  --
  -- `deleted_at` is set so every existing surface already treats these as
  -- removed with no change to any screen, and `author_deleted` is set so the
  -- null author can never be misread as Kai.
  update messages
     set body                 = null,
         structured_idea      = null,
         position_disclosure  = null,
         refs                 = null,
         deleted_at           = coalesce(deleted_at, now()),
         author_deleted       = true,
         user_id              = null
   where user_id = p_user_id;
  get diagnostics v_messages = row_count;

  -- Reports this person FILED. The report protects whoever it was filed
  -- against and the moderator who acted on it, so it stays; who filed it does
  -- not need to. `reporter_id` has no FK and is nullable, so this is a
  -- straightforward severing.
  update reports set reporter_id = null where reporter_id = p_user_id;
  update reports set resolved_by = null where resolved_by = p_user_id;

  -- Staff traces, if this account ever held a role. The ACTION stays in the
  -- log — it happened, and it is the record of a decision taken about somebody
  -- else — but it stops naming an account that no longer exists.
  update moderation_log set actor_id  = null where actor_id  = p_user_id;
  update messages         set deleted_by = null where deleted_by = p_user_id;
  update room_members     set moderation_muted_by = null where moderation_muted_by = p_user_id;
  update rooms            set created_by = null where created_by = p_user_id;

  -- THE FK BLOCKERS. Each of these references `profiles` with no ON DELETE
  -- action, so the profile delete at the end fails on any one of them. Both are
  -- attribution on a row that belongs to the system rather than to the person.
  update allocation_models set approved_by = null where approved_by = p_user_id;
  update legacy_imports    set claimed_by  = null where claimed_by  = p_user_id;

  -- An invite redemption is kept as the receipt for an entitlement that was
  -- granted, and its `user_id` is already ON DELETE SET NULL — but it also
  -- stores the IP address the code was redeemed from, which is personal data
  -- and has no place in a receipt about a person who is gone.
  update invite_redemptions set ip = null where user_id = p_user_id;

  -- =================================================================
  -- 2b. THE CRM RECORD — the money stays, the person does not
  -- =================================================================
  -- `crm_people.app_user_id` is ON DELETE SET NULL, so this row survives the
  -- profile delete by design: it is where the revenue history lives, and
  -- `crm_identities` holds the Stripe customer id that a chargeback four months
  -- from now is looked up by.
  --
  -- What it must NOT keep is the person. Name, email and phone are scrubbed
  -- from the display copies and the matching resolution identities are deleted,
  -- so the row becomes a revenue record with a Stripe id attached and nothing
  -- that identifies a human being. Staff notes ABOUT the person go entirely —
  -- they are somebody's written opinion of a customer who has left.
  select id into v_person_id from crm_people where app_user_id = p_user_id;
  if v_person_id is not null then
    delete from crm_notes where person_id = v_person_id;
    delete from crm_identities
     where person_id = v_person_id
       and kind in ('email', 'phone', 'app_user', 'kai_user', 'os_user');
    update crm_people
       set display_name       = null,
           primary_email      = null,
           primary_phone_e164 = null,
           status             = 'churned',
           source_detail      = '{}'::jsonb
     where id = v_person_id;
  end if;

  -- =================================================================
  -- 2c. DELETE — everything that is only ever about this person
  -- =================================================================
  -- ORDER MATTERS. Each of these either has no FK to `profiles` at all (so the
  -- cascade would strand it) or points at a row the cascade is about to remove
  -- with no ON DELETE action of its own (so the cascade would fail on it).
  -- Children before parents throughout.

  -- Chart annotations key onto alerts/setups/plans with SET NULL, so they can
  -- go first or last; they go first so nothing else has to think about them.
  delete from chart_annotations where user_id = p_user_id;

  -- Alerts: `alert_triggers.alert_id` has NO ON DELETE, so the trigger history
  -- must go before the alerts it points at. (`alert_events` cascades.)
  delete from alert_triggers where alert_id in (select id from alerts where user_id = p_user_id);
  delete from alerts where user_id = p_user_id;

  -- Investing: recommendations carry a bare `user_id` AND a `goal_id` with no
  -- ON DELETE, so they must go before the goals, which cascade from profiles.
  delete from invest_recommendations where user_id = p_user_id;
  delete from invest_goals where user_id = p_user_id;

  -- Trading history. `debriefs` and `positions` both carry a bare `user_id`
  -- with no FK at all — nothing would ever have removed them — and `positions`
  -- additionally holds `account_id` with no ON DELETE, which blocks the
  -- `accounts` cascade. Debriefs first: they reference positions.
  delete from debriefs  where user_id = p_user_id;
  delete from positions where user_id = p_user_id;
  delete from accounts  where user_id = p_user_id;

  -- Everything Kai produced for this person and everything he remembered.
  -- `conversations` cascades and takes `conversation_messages` with it; these
  -- two do not cascade and hold the same kind of content.
  delete from kai_objects     where user_id = p_user_id;
  delete from kai_user_memory where user_id = p_user_id;
  delete from conversations   where user_id = p_user_id;

  -- Notifications: a bare `user_id`, no FK. `notification_deliveries` cascades
  -- from `notifications`, so the delivery receipts go with them.
  delete from notifications where user_id = p_user_id;

  -- The journal of this person's own risk settings. Append-only to the API by
  -- design (0014) — that guard stops the app mutating a journal by accident and
  -- was never about a lawful erasure, which is what this function is and why it
  -- runs as the owner.
  delete from risk_policy_events where user_id = p_user_id;

  -- THE ROOT. Everything still standing comes down with this one:
  --   risk_policies · user_event_counters · user_events · broker_connections ·
  --   trade_plans (+ plan_events, and orders.plan_id -> null) ·
  --   orders (+ order_events, fills) · setup_alert_prefs · notification_prefs ·
  --   room_members · contributor_stats · lesson_progress · subscriptions ·
  --   watchlists (+ watchlist_items) · live_requests · push_subscriptions ·
  --   staff_members
  --
  -- `subscriptions` goes with it, which takes the Stripe customer and
  -- subscription ids off this account. That is intended: the durable copy is in
  -- `crm_identities` as `kind = 'stripe_customer'`, which is deliberately not
  -- deleted above, so the accounting trail survives while the account does not.
  delete from profiles where user_id = p_user_id;

  return jsonb_build_object(
    'already_gone', false,
    'messages_anonymised', v_messages,
    'crm_person_anonymised', v_person_id is not null
  );
end;
$$;

comment on function delete_account(uuid) is
  'Erases one account. Deletes everything private to the person, severs '
  'authorship on community posts and moderation records (keeping the row, '
  'removing the content), and keeps the revenue trail with every identifier '
  'stripped from it. Does NOT touch auth.users - the API route deletes that '
  'afterwards - and does NOT cancel anything in Stripe.';

-- Only the API may run it, and only through the service role. `authenticated`
-- is deliberately not granted: this is a definer function that can delete
-- anything, and it takes a user id as an argument. A phone that could call it
-- directly could pass somebody else''s id. The route establishes WHO is asking
-- from the bearer token and passes only that person''s own id.
revoke all on function delete_account(uuid) from public, anon, authenticated;
grant execute on function delete_account(uuid) to service_role;
