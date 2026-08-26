# Cheat Code AI — Decisions Register (v2, canonical authority table)

## Changes from review (2026-08-26 normalization pass)

| # | Change | Status |
|---|---|---|
| R1 | **Robinhood is read-only via SnapTrade** (verified against SnapTrade docs). L21 amended: Webull = execution broker (v1.1); Robinhood = aggregation/monitoring only, with ≈5-min trade-detection lag labeled as delayed data. Per-connection capability discovery mandatory; no universal submit button. | Applied |
| R2 | Scope re-staged into release trains: v1.0 core loop → v1.1 execution/options/invest → v1.2 intelligence/LMS/migration. All locked features retained, none cut. | **Awaiting Kway sign-off** |
| R3 | One canonical schema + contract set; amendment layers eliminated; partial-index syntax corrected; migration generation instructions embedded (⚙ marks) | Applied |
| R4 | Grades: `score numeric` + `grade_band` + `grade_display` (supports A−/B+ etc., recalibration without enum migrations) | Applied |
| R5 | Order intent: `position_effect` (buy_to_open / sell_to_close / sell_short / buy_to_cover) replaces bare buy/sell everywhere — orders, setups, plans, prefs, matching | Applied |
| R6 | Unified replay: `user_events` outbox, per-user seq, written transactionally with every domain event | Applied |
| R7 | Write paths tightened: client-direct Supabase for low-risk personal data only; all community posting + financial mutations via api-app; Realtime = delivery only | Applied |
| R8 | Backend consolidated to 4 deployable units (api-app, market-intelligence, kai, execution); notifications/schedulers as internal queues | Applied |
| R9 | Polygon licensing gate (G1) moved before Phase 1 production architecture; delayed-display fallback specified | Applied |
| R10 | Live exits: broker-native bracket/OCO only, else alert-assisted with explicit non-protection copy; **no server-managed live contingents in v1.x** (paper simulates fully) | Applied |
| R11 | Kai security boundary specified: untrusted-content delimiting, output scanning, allowlisted research proxy + SSRF controls, per-user isolation, citation preservation, red-team fixtures in Phase 2 acceptance | Applied |
| R12 | Memory governance split: audit records vs user-controllable personalization memory (view/delete-one/delete-all/disable, embedding cascade, portfolio-detail exclusion, 30-day raw prompt retention) | Applied |
| R13 | Contract inconsistencies removed: no SMS anywhere; no Twilio; live-session endpoints out of v1 contracts; involvement = hands_on/guided only (mostly_auto reserved, not modeled); thesis_change in kai_object_type enum; unit naming unified ("execution worker"); Trade landing brokerage-first | Applied |
| R14 | Build order: community in v1.0 core (Phase 6); Stripe/entitlements in Phase 0 | Applied |

## Locked product decisions (Kway)

| # | Decision |
|---|---|
| L1 | Full scope: 3 modes + Community + options + broker connect — delivered across the v1.x trains (see R2) |
| L2 | Paper by default; broker connect optional (read v1.0; Webull trade v1.1) |
| L3 | Options: long calls/puts only; multi-leg Phase 2 |
| L4 | Extended hours display-only |
| L5 | React Native (Expo) first; desktop web Phase 2 |
| L6 | Nav: Home · Alerts · Community · Trade · Account |
| L7 | Greenfield; Supabase + Railway + Vercel |
| L8 | Day-trade universe: curated highest-liquidity names |
| L9 | Setup types per mode as specced (day 4, swing 3, invest fundamental screens + portfolio-manager guidance) |
| L10 | No gamma/order-flow in v1 (plugin slot reserved) |
| L11 | Grade thresholds specced by Claude, tuned in admin |
| L12 | Long and short setups |
| L13 | Caps: 5 day / 3 swing |
| L14 | Longitudinal market memory via daily vector ingest |
| L15 | Proactive: unsolicited A/B setup alerts per prefs + briefings + position warnings |
| L16 | Persistent per-user Kai memory (now with full user controls, R12) |
| L17 | Four explanation levels incl. family |
| L18 | Fit = risk policy + min R/R in v1 |
| L19 | Paper: $1k–$100k start, one reset/month |
| L20 | Bracket confirmed as one unit; guided=auto / hands_on=alert-assisted; per-plan override (live constrained by R10) |
| L21 | **Amended (R1):** Webull execution; Robinhood read-only aggregation |
| L22 | Push + in-app only; no SMS |
| L23 | Legacy K.AI SMS subscribers migrate (v1.2) |
| L24 | Model portfolios Kai-generated, admin-approved |
| L25 | Greenfield community; 3 staff; manual verification |
| L26 | Live sessions Phase 2 (schema in Phase-2 annex, not v1 migrations) |
| L27 | Voice notes v1; polls + DMs Phase 2 |
| L28 | Free + Premium $99/mo |
| L29 | Education = owner-uploaded classroom LMS; Kai limited to explanation modals |

## Applied defaults (redline to change)

| # | Default | Where |
|---|---|---|
| D1 | Freshness 3s/60s; tolerance 25/50bps; preview expiry 60s/10m | 03 |
| D2 | Swing universe filter >$5, >1M avg vol, no OTC | 03 |
| D3 | Bands A≥80/B≥65/C≥50; decile → +/− display; monthly admin-approved recalibration | 03 |
| D4 | Research sources: allowlisted financial press + SEC/EDGAR + Polygon news | 03 |
| D5 | Paper fill models (equity slippage/partials; options mid±25% spread; free short locates, labeled) | 03 |
| D6 | Alert limits free 5 / premium unlimited; 10bps hysteresis | 03 |
| D7 | Tier gate placement (all flag-editable) | 02 §11 |
| D8 | Proactive budget; default max 5 setup alerts/day | 03 |
| D9 | Market-memory 24-month retention + monthly compaction | 03 |
| D10 | Minimal admin in api-app | 03 |
| D11 | PostHog | 02 §13 |
| D12 | Kai model tiering + per-user token budgets | 03 |
| D13 | Raw prompt/tool-result retention 30 days | 00 §8 |
| D14 | Community rate limits 10/min; spam precheck heuristics + model screen on structured ideas | 03 |

## Open items (owner: Kway unless noted)

| # | Item | Blocks |
|---|---|---|
| O1 | **Polygon licensing** — plan, real-time display/redistribution rights, per-user agreements, OPRA path | Gate G1, before Phase 1 production architecture |
| O2 | SnapTrade account + Webull test accounts; confirm current broker capability matrix at build time (it changes) | Gate G2 / Phase 8 |
| O3 | Legal engagement — disclosures, education/recommendation boundary, store requirements | Gate G3 now; sign-off blocks Phase 8 |
| O4 | Stripe products + trial policy | Phase 0 |
| O5 | Legacy subscriber export (phones/emails + plan metadata) | Phase 12 |
| O6 | LMS launch content | Phase 12 |
| O7 | Community guidelines/terms incl. community-intelligence disclosure (rooms stay `intel_eligible=false` until published) | Phase 6 |
| O8 | **R2 sign-off** — confirm the v1.0 / v1.1 / v1.2 staging | Before Phase 0 |
