-- 0014_rls_grants
-- Source: docs/01_DATA_MODEL.md §13 (RLS & grants matrix) verbatim.
--
-- Model: grants decide WHICH VERBS a client role may attempt; RLS decides WHICH ROWS.
-- Baseline = deny everything to anon + authenticated, then grant back exactly the
-- matrix rows. anon gets no table access at all (this app has no anonymous surface).

revoke all on all tables in schema public from anon, authenticated;

--------------------------------------------------------------------- helpers
create or replace function is_room_member(p_room uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from room_members m
    where m.room_id = p_room and m.user_id = auth.uid() and coalesce(m.banned,false) = false
  );
$$;
revoke all on function is_room_member(uuid) from public;
grant execute on function is_room_member(uuid) to authenticated, service_role;

------------------------------------------------------------- enable RLS: all
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- =========================================================================
-- ROW 1: owner select + owner write (client direct)
-- profiles, notification_prefs, setup_alert_prefs, lesson_progress
-- (01 §13 also names "watchlist tables" - no watchlist table exists in the v2
--  model; see docs/SCHEMA-NOTES.md)
-- =========================================================================
grant select, insert, update, delete on
  profiles, notification_prefs, setup_alert_prefs, lesson_progress to authenticated;

create policy profiles_owner_all on profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_prefs_owner_all on notification_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy setup_alert_prefs_owner_all on setup_alert_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy lesson_progress_owner_all on lesson_progress
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- ROW 2: owner read, NO client write (api-app writes)
-- =========================================================================
grant select on risk_policies to authenticated;
create policy risk_policies_owner_select on risk_policies
  for select to authenticated using (user_id = auth.uid());

grant select on risk_policy_events to authenticated;         -- append-only journal
create policy risk_policy_events_owner_select on risk_policy_events
  for select to authenticated using (user_id = auth.uid());

-- =========================================================================
-- ROW 3: authenticated select, NO client write (workers write)
-- =========================================================================
grant select on
  setups, setup_events, theses, verifications, community_signals,
  instruments, option_contracts, candles, market_sessions,
  contributor_stats, entitlement_flags, disclosure_templates, system_status,
  kai_explanations, kai_objects, courses, course_modules, lessons,
  allocation_models
to authenticated;

create policy setups_read on setups for select to authenticated using (true);
create policy setup_events_read on setup_events for select to authenticated using (true);
create policy theses_read on theses for select to authenticated using (true);
create policy verifications_read on verifications for select to authenticated using (true);
create policy community_signals_read on community_signals for select to authenticated using (true);
create policy instruments_read on instruments for select to authenticated using (true);
create policy option_contracts_read on option_contracts for select to authenticated using (true);
create policy candles_read on candles for select to authenticated using (true);
create policy market_sessions_read on market_sessions for select to authenticated using (true);
create policy contributor_stats_read on contributor_stats for select to authenticated using (true);
create policy entitlement_flags_read on entitlement_flags for select to authenticated using (true);
create policy disclosure_templates_read on disclosure_templates for select to authenticated using (active);
create policy system_status_read on system_status for select to authenticated using (true);
create policy kai_explanations_read on kai_explanations for select to authenticated using (true);

-- kai_objects(public): global objects are readable by any authenticated user;
-- user-scoped objects (briefings, previews) only by their owner.
create policy kai_objects_read on kai_objects
  for select to authenticated using (user_id is null or user_id = auth.uid());

-- published courseware only
create policy courses_read on courses for select to authenticated using (published);
create policy course_modules_read on course_modules for select to authenticated
  using (exists (select 1 from courses c where c.id = course_modules.course_id and c.published));
create policy lessons_read on lessons for select to authenticated using (published);

-- allocation_models: serving requires approved AND active (01 §9 ⚙)
create policy allocation_models_read on allocation_models
  for select to authenticated using (active and approved_at is not null);

-- =========================================================================
-- ROW 4: owner select only; execution worker / api-app writes
-- =========================================================================
grant select on
  trade_plans, plan_events, orders, order_events, fills, positions, debriefs,
  accounts, broker_connections, alerts, alert_triggers, user_events,
  notifications, invest_goals, invest_recommendations, subscriptions
to authenticated;

create policy trade_plans_owner_select on trade_plans
  for select to authenticated using (user_id = auth.uid());
create policy plan_events_owner_select on plan_events
  for select to authenticated using (user_id = auth.uid());
create policy orders_owner_select on orders
  for select to authenticated using (user_id = auth.uid());
create policy order_events_owner_select on order_events
  for select to authenticated using (exists (
    select 1 from orders o where o.id = order_events.order_id and o.user_id = auth.uid()));
create policy fills_owner_select on fills
  for select to authenticated using (exists (
    select 1 from orders o where o.id = fills.order_id and o.user_id = auth.uid()));
create policy positions_owner_select on positions
  for select to authenticated using (user_id = auth.uid());
create policy debriefs_owner_select on debriefs
  for select to authenticated using (user_id = auth.uid());
create policy accounts_owner_select on accounts
  for select to authenticated using (user_id = auth.uid());
create policy broker_connections_owner_select on broker_connections
  for select to authenticated using (user_id = auth.uid());
create policy alerts_owner_select on alerts
  for select to authenticated using (user_id = auth.uid());
create policy alert_triggers_owner_select on alert_triggers
  for select to authenticated using (exists (
    select 1 from alerts a where a.id = alert_triggers.alert_id and a.user_id = auth.uid()));
create policy user_events_owner_select on user_events
  for select to authenticated using (user_id = auth.uid());
create policy notifications_owner_select on notifications
  for select to authenticated using (user_id = auth.uid());
create policy invest_goals_owner_select on invest_goals
  for select to authenticated using (user_id = auth.uid());
create policy invest_recommendations_owner_select on invest_recommendations
  for select to authenticated using (user_id = auth.uid());
create policy subscriptions_owner_select on subscriptions
  for select to authenticated using (user_id = auth.uid());

-- =========================================================================
-- ROW 5: rooms / room_members / messages - members select, api-app writes
-- =========================================================================
grant select on rooms, room_members, messages to authenticated;

-- core rooms are the in-app directory (Community tab lists them); setup and
-- announcement rooms are member-scoped. See docs/SCHEMA-NOTES.md.
create policy rooms_member_or_core_select on rooms
  for select to authenticated using (type = 'core' or is_room_member(id));
create policy room_members_self_or_comember_select on room_members
  for select to authenticated using (user_id = auth.uid() or is_room_member(room_id));
create policy messages_member_select on messages
  for select to authenticated using (is_room_member(room_id));

-- =========================================================================
-- ROW 6: staff-only tables - no client grants, no client policies.
-- moderation_log, reports (+ admin surfaces). Reached through api-app (admin)
-- with the service role until a staff role claim exists.
-- ROW 7 back-office/worker-only: scan_universes, market_memory,
-- legacy_imports, user_event_counters.
-- =========================================================================

-- =========================================================================
-- ROW 7: kai_user_memory, conversations - owner select, delete via API
-- =========================================================================
grant select on kai_user_memory, conversations, conversation_messages to authenticated;
create policy kai_user_memory_owner_select on kai_user_memory
  for select to authenticated using (user_id = auth.uid());
create policy conversations_owner_select on conversations
  for select to authenticated using (user_id = auth.uid());
create policy conversation_messages_owner_select on conversation_messages
  for select to authenticated using (exists (
    select 1 from conversations c
    where c.id = conversation_messages.conversation_id and c.user_id = auth.uid()));

-- =========================================================================
-- APPEND-ONLY (01 §13 ⚙): "revoke UPDATE/DELETE from every role including
-- service paths". INSERT stays granted to service_role so writers still work;
-- only mutation/erasure of history is removed. The table owner (postgres /
-- supabase_admin) is unaffected, which is what makes `supabase db reset`,
-- migrations and legal-hold operations still possible.
-- =========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'risk_policy_events','user_events','setup_events','plan_events',
    'order_events','fills','moderation_log'
  ]
  loop
    execute format('revoke update, delete on public.%I from anon, authenticated, service_role', t);
  end loop;
end;
$$;
