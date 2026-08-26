# Cheat Code AI — Build Plan (v2, canonical — release trains)

Monorepo: `apps/mobile` (Expo) · `apps/api` (Next.js api-app incl. admin) · `workers/{market-intelligence,kai,execution}` · `packages/shared` (generated DB types + zod + event/object schemas). Each phase's acceptance checks must pass before the next begins.

## Pre-Phase gates (resolve before Phase 1 production architecture)

- **G1 — Polygon licensing (register O1):** plan level, real-time display/redistribution rights for app users, per-user market-data agreements if required, OPRA path for v1.1. Fallback if delayed-only: delayed display + real-time reserved for entitled contexts.
- **G2 — SnapTrade:** account, sandbox, broker-capability verification (Robinhood read-only confirmed; Webull trade path + requirements), launch checklist review.
- **G3 — Legal kickoff:** disclosure templates, education/recommendation boundary, app-store trading-app requirements — engaged now, sign-off required before v1.1 execution ships.

## v1.0 — Core loop

**Phase 0 — Foundation, auth, billing flags, navigation.** Monorepo + CI; canonical schema → ordered migrations (extensions, enums, tables, indexes incl. partial unique thesis index, triggers, RLS policies, grants, seeds); Supabase Auth + onboarding; Expo shell with locked five-tab nav + Volt & Violet tokens; **Stripe checkout/portal/webhooks + entitlement flags live from day one** (everything gated correctly even while free); PostHog + Sentry; user_events outbox + replay endpoint skeleton.
*Accept:* onboard → Home; RLS policy tests green (A cannot read B anywhere); upgrade to premium flips flags without deploy; replay returns empty stream correctly.

**Phase 1 — Market data + brokerage-style Trade.** Market-intelligence worker: Polygon WS/REST, Redis, fan-out, freshness, session engine, candles, gap backfill. Trade tab in brokerage-first hierarchy: search, symbol page (quote header + freshness, interactive chart), watchlists, movers, extended-hours labeling.
*Accept:* live quote with visible freshness; feed kill-test → degraded label + backfill recovery; a Robinhood/Webull user can navigate search→chart→watchlist with zero instruction.

**Phase 2 — Kai chat, research, chart tools.** Kai worker: conversations (SSE), tool suite behind the security boundary (allowlisted research proxy, untrusted-content delimiting, output scanning), structured objects, contradiction validator, explanation levels, user memory + controls UI, market-memory daily ingest + retrieval. Home becomes the Kai workspace with morning briefing.
*Accept:* five-second comprehension content on Home; seeded prompt-injection page and hostile community text fail to steer Kai (red-team fixture suite); validator blocks seeded incoherent card; memory view/delete/disable works end-to-end incl. embedding cascade; "what happened this week" answered with dated provenance.

**Phase 3 — Scanner + setup model.** All day/swing detectors + invest screens, V5 scoring, score/band/display grades, state machine + setup_events, ranked caps, setup cards with Live/Plan/Learn, proactive A/B push alerts per prefs, outcome recorder.
*Accept:* historical-day replay produces coherent discovered→ready narration; ready A-grade push arrives per prefs, deep-links correctly; reconnect replays missed setup_events in order.

**Phase 4 — Alerts.** NL → alert_preview → activation; evaluator + hysteresis; triggers with eval trace; late-trigger labeling on gap backfill; deep links to changed evidence; Alerts tab groups; tier limits.
*Accept:* NL alert previews as structured logic before activation; simulated feed gap yields `late:true` trigger, never a silent miss.

**Phase 5 — Paper execution, positions, debriefs.** Execution worker paper driver: preview gates, advisories/blockers with hard-stop R/R copy, idempotent submit, equity fills long/short, brackets with exit_style behavior, positions, P&L, plan lifecycle, debriefs, monthly reset.
*Accept:* duplicate submit dedups; preview invalidates on tolerance breach and plan edit; auto vs alert-assisted exits behave per exit_style; accepted≠filled end-to-end; daily-loss-cap blocks day-mode previews when spent; transactional user_events verified (kill worker mid-write → no orphan events).

**Phase 6 — Core Community.** Rooms (core set + auto setup-rooms), api-app posting pipeline (validation, rate limits, spam precheck, disclosure prompts, seq), voice notes, presence, pinned intelligence, @Kai commands, structured-assist with explicit approval, contributor labels, reports + moderation console, continuity chain.
*Accept:* idea → @Kai verify → research → alert → plan retains provenance; deleted market-claim persists only in moderation audit; direct-to-Supabase message insert attempt fails (RLS); nothing in community can alter a grade (negative test).

**Phase 7 — v1.0 hardening + launch.** Read-only SnapTrade connect (portfolio context, Robinhood aggregation with delayed labeling); load test market-open burst; chaos (Polygon outage, Realtime drop) with degradation labels + replay everywhere; RLS/privacy audit vs 01 §13–14; accessibility pass (WCAG AA, chart/order screen-reader labels, reduced motion, dynamic type); analytics funnel verified; store submission (trading-app requirements, disclosure screens); runbook for 3-person team.
*Accept:* every required system state behind a chaos test; moderated beginner passes five-second test on Home, setup card, order preview; production billing live.

## v1.1 — Execution

**Phase 8 — Webull live execution.** Trade-enabled connections, capability discovery, broker-native previews + reject translation, webhooks, broker-native bracket/OCO or forced alert-assisted exits, reconciliation job, auth-expiry + disconnect-mid-flow states, G3 legal sign-off.
*Accept:* guided path setup→plan→broker preview→confirm→ack→fill→monitored position on Webull test account; read-only connection shows zero order actions; kill connection mid-flow → draft preserved, submission blocked; reconciliation catches a seeded mismatch.

**Phase 9 — Options.** OPRA integration (demand-driven), contract reference sync, chains UI, options paper fills, long calls/puts on Webull per account level, premium-at-risk in risk checks.
*Accept:* chain freshness; wide-spread warning; `OPTIONS_LEVEL_INSUFFICIENT` on under-permissioned live account; sell_to_close only exit path enforced.

**Phase 10 — Managed Investing.** Goals, Kai-generated allocation models + admin approval gate, contributions, ChangePreview, rebalance via paper pipeline, Invest lens completion.
*Accept:* recommendation→preview→confirm produces paper orders; unapproved model never serves; drift math vs fixtures; disclosures on every recommendation.

## v1.2 — Depth

**Phase 11 — Community intelligence.** Extraction, contributor weighting, manipulation down-weighting, verification-gated signals, intel cards (sample size + window + limitations always).
*Accept:* seeded coordinated-promotion fixture down-weighted + flagged; scanner provably has no read path to community tables.

**Phase 12 — LMS + migration + memory depth.** Courses/modules/lessons authoring + upload, progress, explanation-modal cache; legacy K.AI import + claim flow with seeded prefs + tenure grant; monthly market-memory compaction/synthesis; add_on_pullback / trim_at_high guidance.
*Accept:* published course gated by tier; legacy claim links account + seeds prefs; compaction preserves retrieval quality on eval set.

## Sequencing notes

- Billing/entitlements live in Phase 0 by design — every later gate (alerts limits, broker, options, LMS) is a flag flip, not new infra.
- Community lands inside v1.0 (Phase 6) — a primary tab is never empty at launch.
- Design package (.dc.html) is visual truth; `packages/shared` schemas are data truth; disagreements get flagged, never silently reconciled.
- Feature flags throughout; TestFlight/internal builds ship continuously from Phase 1.
