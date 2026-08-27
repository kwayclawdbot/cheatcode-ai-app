-- 0015_views
-- Source: docs/01_DATA_MODEL.md §2 ⚙ (profiles_public), §10 ⚙ (message view +
-- moderation security-definer view), §14 (deleted messages: body nulled in
-- surfaces; market-claim originals retained in moderation audit only).

-- ⚙ public view for community: identity fields only, never financial fields.
-- Runs with the view owner's rights (security_invoker off) so the owner-only
-- RLS on `profiles` does not hide other members' display identity.
create view profiles_public as
  select p.user_id,
         p.handle,
         p.display_name,
         p.avatar_url,
         coalesce(cs.role_labels, '{}'::text[]) as role_labels
  from profiles p
  left join contributor_stats cs on cs.user_id = p.user_id;

grant select on profiles_public to authenticated;

-- Member-facing message surface: deleted rows keep their place in the thread
-- but their body is nulled. security_invoker = true so `messages` RLS
-- (room membership) still decides which rows the caller sees.
create view messages_public
with (security_invoker = true) as
  select m.id, m.room_id, m.user_id, m.seq, m.kind,
         case when m.deleted_at is null then m.body end as body,
         m.parent_id, m.refs, m.structured_idea, m.position_disclosure,
         m.edited_at, m.deleted_at,
         (m.deleted_at is not null) as deleted,
         m.flags, m.created_at
  from messages m;

grant select on messages_public to authenticated;

-- Moderation-only security-definer view: exposes retained originals for
-- market-claim audit. Never granted to anon or authenticated.
create view messages_moderation as
  select m.*, r.slug as room_slug, r.name as room_name
  from messages m
  join rooms r on r.id = m.room_id;

revoke all on messages_moderation from anon, authenticated;
grant select on messages_moderation to service_role;
