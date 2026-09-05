-- 0029 — kai_model_usage: what every call to the model cost.
--
-- THE GAP THIS CLOSES. Until now this app recorded nothing about what it spends
-- on Kai. Not a token count, not a dollar, nowhere. The owner could not answer
-- "what did this user cost me" or "which part of Kai is expensive" from his own
-- data, and the only number available was the total on the monthly invoice.
-- One row per model call fixes that, and the two queries at the bottom of this
-- file are the answers he asked for.
--
-- ONE ROW PER CALL, NOT PER QUESTION. A question that makes Kai look something
-- up costs several round trips, and each is charged separately. Rows sharing a
-- `request_id` are one question; `turn_index` orders them. Counting rows per
-- request is how many round trips that question actually took.
--
-- NULL IS NOT ZERO. Every token column is nullable. A provider response that
-- carried no counts is stored as NULL, and `cost_usd` is NULL too. Storing 0
-- would silently understate every total built on this table. `where cost_usd is
-- null` is the honest gap, and the last query below reports its size.
--
-- WHERE THE PRICES LIVE. Nowhere in this file. `cost_usd` is computed in
-- `apps/api/src/lib/kai/pricing.ts`, which is the single place rates are
-- written down, so a price change is a one-line edit there. The token columns
-- are kept alongside the dollars precisely so a past row can be re-priced from
-- raw counts if a rate is ever found to have been wrong.
--
-- SECURITY. This table is SERVICE-ROLE ONLY: RLS on, and ZERO policies. That is
-- the same decision 0025 made for the CRM tables and for the same reason — this
-- is business data about spend, not a user's own record, and the question "may
-- you read this row" is not answerable from the row. The API is the only door.
-- A table with RLS enabled and no policy means a wrong route is the ONLY way
-- in, rather than one of two. `anon` and `authenticated` are granted nothing.

create table if not exists kai_model_usage (
  id                          bigserial primary key,
  created_at                  timestamptz  not null default now(),

  -- One question = one request_id. Several rows may share it.
  request_id                  text         not null,
  turn_index                  integer      not null default 0,

  -- Which part of Kai spent the money. Mirrors `UsageFeature` in
  -- apps/api/src/lib/kai/usage.ts. Deliberately NOT a check constraint or an
  -- enum: a new feature must never be able to make a reply fail because the
  -- ledger rejected its label. Unknown labels show up in the per-feature query
  -- and get added to the type.
  feature                     text         not null,
  model                       text         not null,

  -- Who it was for. Nullable because some calls are not on behalf of anyone
  -- (a background job), and NOT a foreign key so that deleting a user can
  -- never fail on, or silently erase, the record of what they cost.
  user_id                     uuid,
  conversation_id             uuid,

  -- Exactly what the provider reported. NULL means "not reported".
  input_tokens                integer,
  output_tokens               integer,
  cache_read_input_tokens     integer,
  cache_creation_input_tokens integer,

  -- US dollars, six decimal places (a ten-thousandth of a cent). NULL when the
  -- model has no known rate or the provider reported no counts.
  cost_usd                    numeric(14, 6),

  duration_ms                 integer,
  stop_reason                 text
);

comment on table kai_model_usage is
  'One row per Anthropic model call: tokens, cache hits, and dollars. Written by apps/api/src/lib/kai/usage.ts. Service role only.';
comment on column kai_model_usage.cache_read_input_tokens is
  'Input tokens served from the prompt cache at a tenth of the input price. Zero across repeated requests means caching has broken.';
comment on column kai_model_usage.cost_usd is
  'Computed at write time from apps/api/src/lib/kai/pricing.ts. NULL when it cannot be computed honestly; never a guess.';

-- The three shapes every reading query uses.
create index if not exists kai_model_usage_created_idx  on kai_model_usage (created_at desc);
create index if not exists kai_model_usage_user_idx     on kai_model_usage (user_id, created_at desc);
create index if not exists kai_model_usage_feature_idx  on kai_model_usage (feature, created_at desc);
create index if not exists kai_model_usage_request_idx  on kai_model_usage (request_id);

alter table kai_model_usage enable row level security;
-- Intentionally no policies. See the SECURITY note above.
revoke all on kai_model_usage from anon, authenticated;
revoke all on sequence kai_model_usage_id_seq from anon, authenticated;
grant all on kai_model_usage to service_role;
grant usage, select on sequence kai_model_usage_id_seq to service_role;

-- =====================================================================
-- HOW TO READ IT
-- =====================================================================
--
-- These are not views on purpose: a view on a service-role-only table is one
-- careless grant away from being a door. Run them as the service role, from
-- the SQL editor or from the admin route.
--
-- 1. COST PER USER PER DAY — the question the owner actually asked.
--
--   select date_trunc('day', created_at at time zone 'UTC')::date as day,
--          user_id,
--          count(*)                                  as model_calls,
--          count(distinct request_id)                as questions,
--          sum(input_tokens)                         as input_tokens,
--          sum(cache_read_input_tokens)              as cached_tokens,
--          sum(output_tokens)                        as output_tokens,
--          round(sum(cost_usd), 4)                   as cost_usd
--   from kai_model_usage
--   where created_at >= now() - interval '30 days'
--   group by 1, 2
--   order by day desc, cost_usd desc nulls last;
--
-- 2. COST PER FEATURE — which part of Kai is expensive.
--
--   select feature,
--          count(*)                                  as model_calls,
--          count(distinct request_id)                as questions,
--          round(sum(cost_usd), 4)                   as cost_usd,
--          round(avg(cost_usd), 6)                   as cost_per_call,
--          round(sum(cost_usd) / nullif(count(distinct request_id), 0), 5)
--                                                    as cost_per_question
--   from kai_model_usage
--   where created_at >= now() - interval '30 days'
--   group by 1
--   order by cost_usd desc nulls last;
--
-- 3. IS CACHING STILL WORKING — the check that must never be skipped after a
--    change to how the prompt is built. A cache that stops hitting is silent:
--    the replies keep working and only the bill moves. Expect the hit rate to
--    sit well above zero; a run of days at 0% means something upstream started
--    changing the front of the prompt again.
--
--   select date_trunc('day', created_at at time zone 'UTC')::date as day,
--          sum(cache_read_input_tokens)                          as cached,
--          sum(input_tokens)                                     as uncached,
--          sum(cache_creation_input_tokens)                      as written,
--          round(100.0 * sum(cache_read_input_tokens)
--                / nullif(sum(cache_read_input_tokens) + sum(input_tokens)
--                         + sum(cache_creation_input_tokens), 0), 1)
--                                                                as pct_from_cache
--   from kai_model_usage
--   where created_at >= now() - interval '14 days'
--   group by 1 order by 1 desc;
--
-- 4. WHAT WE COULD NOT PRICE — the honest gap. If this is not zero, either a
--    model was used that has no rate in pricing.ts, or the provider returned no
--    counts. Both are worth knowing rather than papering over with a zero.
--
--   select model, count(*) as unpriced_calls
--   from kai_model_usage where cost_usd is null
--   group by 1 order by 2 desc;
