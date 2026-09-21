-- =====================================================================
-- 0055 — An alert card can be saved.
-- =====================================================================
-- Written, NOT applied — the owner applies it. Safe to run more than once.
--
-- WHY A TABLE OF ITS OWN
-- The V2 alert card (docs/design/redesign-2026-09-21, "Alert cards are market
-- instruments") has exactly one control besides the card itself: a bookmark.
-- The two existing "keep this" mechanisms both mean something else:
--   * watchlists (0017) are per SYMBOL, and a symbol can have several alerts;
--   * following a setup (POST /setups/:id/follow) adds to the watchlist AND
--     drafts an alert — far more than a bookmark may do behind a member's back.
-- So a bookmark is one row per member per CARD. `card_id` is the card's own id
-- as the API serves it ("setup:<uuid>", "alert:<uuid>", "position:<uuid>"),
-- which is stable for the life of the card; `symbol` is kept so a saved list
-- can be drawn without re-deriving a card that has since resolved.
--
-- RLS POSTURE: RLS ON, ZERO POLICIES, service role only — the same reading
-- 0050 made for post_bookmarks. A bookmark is private by definition, and the
-- only reader and writer is GET/PUT /api/v1/alerts/bookmarks for ctx.user.
-- =====================================================================

create table if not exists alert_bookmarks (
  user_id    uuid not null references profiles on delete cascade,
  card_id    text not null check (char_length(card_id) between 1 and 200),
  symbol     text not null check (char_length(symbol) between 1 and 12),
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index if not exists alert_bookmarks_user_recent_idx
  on alert_bookmarks (user_id, created_at desc);

alter table alert_bookmarks enable row level security;

-- Supabase's default privileges hand anon/authenticated write grants on every
-- new public table; 0033 §10 / 0050 (b) assert no client write grant exists
-- outside a short allowlist, and this table is not on it.
revoke all on alert_bookmarks from anon, authenticated;
grant select, insert, delete on alert_bookmarks to service_role;

comment on table alert_bookmarks is
  'A member''s saved alert cards (V2 Alerts bookmark). Private: RLS on, no '
  'policies, read/written only by /api/v1/alerts/bookmarks with the service role.';
