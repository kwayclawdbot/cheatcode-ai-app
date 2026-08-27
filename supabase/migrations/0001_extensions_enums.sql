-- 0001_extensions_enums
-- Source: docs/01_DATA_MODEL.md §1 (verbatim), plus extensions required by the ⚙ notes.

create extension if not exists pgcrypto with schema extensions;   -- gen_random_uuid()
create extension if not exists vector with schema extensions;      -- market_memory / kai_user_memory embeddings

create type app_mode as enum ('day_trade','swing','invest');
create type experience_level as enum ('beginner','intermediate','advanced');
create type involvement as enum ('hands_on','guided');            -- v1: two values; 'mostly_auto' reserved for a future Invest automation tier, not in this enum until it exists
create type setup_state as enum ('discovered','watching','forming','ready','invalidated','expired');
create type grade_band as enum ('A','B','C');                     -- band for logic/filters
-- display grades (A+, A, A-, B+ ...) live in setups.grade_display text, derived from score
create type plan_status as enum ('draft','planned','active','exiting','closed','cancelled','invalidated');
create type order_status as enum ('draft','previewed','submitted','accepted','partially_filled','filled','rejected','cancelled');
create type position_effect as enum ('buy_to_open','sell_to_close','sell_short','buy_to_cover');
-- options orders reuse these four; instrument_kind distinguishes the asset. v1 permits only buy_to_open/sell_to_close on options.
create type order_type as enum ('market','limit','stop','stop_limit');
create type instrument_kind as enum ('equity','etf','option');
create type account_kind as enum ('paper','broker');
create type broker_conn_status as enum ('disconnected','connecting','connected','expired','permission_missing','error');
create type connection_access as enum ('read','trade');
create type alert_status as enum ('draft','active','triggered','paused','expired','cancelled');
create type freshness as enum ('live','delayed','stale');
create type room_type as enum ('core','setup','announcement');    -- 'live' rooms are Phase 2
create type member_role as enum ('member','moderator','educator','expert');
create type message_kind as enum ('text','chart','voice_note','kai_object','position_update','system');
create type kai_object_type as enum ('briefing','graded_setup','comparison','research_report','verification_card','room_summary','community_intel','alert_preview','chart_response','position_update','action_preview','debrief','thesis_change');
create type verification_result as enum ('verified','partially_verified','unverified','false','unverifiable');
create type moderation_action as enum ('remove','restrict','warn','mute','ban','lockdown','restore','label');
create type rebalance_status as enum ('proposed','previewed','confirmed','applied','dismissed');
create type notif_channel as enum ('push','in_app');
