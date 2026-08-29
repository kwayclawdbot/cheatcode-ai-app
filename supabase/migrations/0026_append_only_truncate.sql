-- 0026_append_only_truncate
--
-- 0014 made seven tables append-only by revoking UPDATE and DELETE "from every
-- role including service paths". It did not revoke TRUNCATE, and Supabase's
-- default privileges grant it — so `truncate user_events` was one statement away
-- from erasing the whole audit trail through the same service key every route
-- already holds. Append-only that a single statement can empty is not
-- append-only; it is a comment.
--
-- Found by the ADMIN-1 lane while closing the same hole on admin_audit_log
-- (SCHEMA-NOTES 2.37). This closes it for the original seven.
--
-- The table OWNER (postgres / supabase_admin) keeps truncate, which is what
-- leaves `supabase db reset`, migrations and legal-hold operations working —
-- exactly the carve-out 0014 relied on for update and delete.

do $$
declare t text;
begin
  foreach t in array array[
    'risk_policy_events','user_events','setup_events','plan_events',
    'order_events','fills','moderation_log'
  ]
  loop
    execute format('revoke truncate on public.%I from anon, authenticated, service_role', t);
  end loop;
end $$;
