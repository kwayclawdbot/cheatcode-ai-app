# Cheat Code AI — Backend Unit Specifications (v2, canonical)

Four deployable units. Tunables marked **[tune]** live in config.

## Unit 1 — api-app (Next.js, Vercel)

Authenticated command surface (02), entitlements/Stripe, community posting pipeline (validation → rate limit → spam precheck → disclosure prompts → seq assignment → insert → Realtime delivery → audit), moderation + admin, replay endpoint, webhooks. Community message rate limits **[tune: 10/min member, burst 20]**; spam precheck = heuristics + efficient-model screen on structured ideas only. Admin (minimal): moderation console, grade-calibration approvals, allocation-model approvals, LMS authoring (v1.2), disclosure editing, entitlement flags, system_status board, memory inspection.

## Unit 2 — market-intelligence worker (Python, Railway)

### Market data
Polygon stocks WS → normalize → stamp `{source_ts, received_ts}` → Redis → throttled Realtime fan-out (≤1/s/symbol). REST candles cache (1m base, derived TFs), session engine, gap backfill after WS drops with `data:degraded` labeling. OPRA (v1.1): demand-driven subscriptions (chains in view + open option positions). Freshness authority for all units. **Distribution note:** fan-out design is contingent on the Polygon licensing gate (register O1); until confirmed, real-time display rights per user are assumed unresolved and the delayed-display fallback stands ready.

### Scanner
Universes: `day_trade` curated high-liquidity list (SPY/QQQ/IWM/mega-caps + weekly top-volume refresh, ~60–100 names [tune]); `swing` US equities+ETFs >$5, 20-day avg vol >1M, no OTC; `invest` S&P 1500 + curated ETFs.

Detectors (long + short mirrors), all emitting `intent` as position_effect:
- **Day:** opening range breakout (15m range [tune], break+hold, RVOL ≥1.5, spread ≤0.05%); VWAP reclaim (reclaim + N-bar hold, RVOL ≥1.3); consolidation breakout (≥30m base, ATR compression, volume expansion); gap-and-go (gap ≥2% on catalyst, holds pre-market high).
- **Swing:** pattern breakout (≥10-session base/flag/wedge, volume ≥1.5× avg); resistance break **with confirmation** (≥2-touch level; stays `forming` until retest-hold or follow-through close); catalyst/earnings play (drift or scheduled catalyst + technical alignment, earnings-proximity warnings auto-attached).
- **Invest:** fundamental screens (growth, margin trend, valuation vs 5-yr range, quality gates) → research-first setups.

**Scoring & grades.** V5 composite (weights [tune]): ATR contraction, pivot proximity, volume accumulation, relative strength, liquidity quality, regime/sector context, mode confirmations. `score numeric` is truth; `grade_band` A ≥80 / B ≥65 / C ≥50 [tune]; `grade_display` maps score deciles within bands to +/− (e.g. 80–84 A−, 85–92 A, 93+ A+). Monthly recalibration against outcomes, admin-approved, no enum migrations ever. Caps: 5 day / 3 swing surfaced; the rest stay discovered/watching in exploration surfaces.

**State machine:** discovered → watching → forming → ready; any → invalidated (reason + level recorded); ready → expired. Transitions write setup_events (per-setup seq) with beginner narration templates, pass contradiction validation, and on `ready` with grade_band ≥ user threshold fan out proactive push per setup_alert_prefs (dedup per user per setup, max_per_day, quiet hours). Post-close outcome recorder feeds market_memory + calibration.

### Alerts engine
Condition compiler → evaluator DAG over Redis stream + setup_events + time ticks; `price_cross` hysteresis re-arm band 10bps [tune]. Trigger → alert_triggers (+ eval trace) + user_events + notification queue, deep link to changed evidence. Feed-gap policy: back-evaluate on backfill, deliver with `late:true` — never silently missed. Degraded dependencies surface `monitoring: degraded` on affected alerts. Tier limits from entitlement_flags.

### Notification queue
Expo push + in-app twin for every push. Resolution order: entitlements → prefs → quiet hours → per-day proactive budget [tune]. Receipts, token pruning, backoff retries. Categories: setup_alert, alert_trigger, position_warning, briefing, order_status, community_mention, thesis_change, system.

## Unit 3 — kai worker (Python, Railway)

**Context assembly:** profile + risk policy + mode → pinned context → conversation history → kai_user_memory retrieval (if memory_enabled) → market_memory retrieval (top-k, recency decay, entity match) → live data via tools. Four explanation levels render from one computed analysis.

**Tools (least-privilege, user-scoped by request):** get_snapshot, get_candles, get_options_chain, get_setup, list_setups, get_user_context, search_market_memory, research_fetch (allowlisted proxy), get_filings, get_news, draft_alert, build_chart_annotations, query_room, verify_claim, build_plan_draft, explain_concept. **No execution tool. No arbitrary URL fetch.**

**Security boundary (normative):**
- Retrieved/community/memory content enters prompts only inside delimited untrusted-content blocks; instructions found inside them are ignored by policy and post-checked: outputs are scanned for injected directives, tool-call artifacts, and off-context actions before publication.
- research_fetch: domain allowlist (major financial press, SEC/EDGAR, exchanges, company IR; admin-extendable), SSRF protections (public DNS only, no private ranges/redirect tricks, size + time caps), content sanitization before model exposure.
- Strict per-user isolation: no tool can read another user's rows; community text can never enter another user's private context; market_memory contains only global market content — the ingest pipeline strips user identifiers and portfolio details.
- Citations carry original source + timestamp through every summarization hop; community-derived claims always carry their verification label.

**Contradiction validator** (pre-publication on every financial object + plan preview): direction/target orientation vs `intent`; narrative-vs-structured numeric match; entry status currency (available/approaching/passed/invalidated); one-active-thesis (partial unique index is the backstop); grade/readiness/risk/fit coherence; R/R + size + est-loss recompute on every edit. Fail → regenerate (≤2) → publish nothing on persistent failure.

**Thesis supersession:** interpretation flips write the supersession payload and emit thesis_change to holders/followers; Kai's published analyses live in market_memory, so its prior views are queryable and it must reference them honestly.

**Proactive jobs:** per-user morning briefing; position monitors (thesis weakening/invalidated, stop approaching, catalyst tomorrow); followed-setup narration. Per-user daily proactive budget [tune].

**Market-memory ingest:** post-close daily (news clusters deduped, filings, internals summary, setup outcomes, published Kai analyses; + community_signals digests in v1.2) → summarize (efficient model) → embed → store with provenance; intraday incremental for material news on candidates/holdings; monthly compaction into weekly_synthesis rows (v1.2 deepening). Retention 24 months [tune].

**Memory controls:** implements 02 §1 endpoints — list/delete-one/delete-all/disable, hard-delete cascading to embeddings + derived summaries; extraction policy excludes balances/position sizes/account numbers.

**Verification:** claim → market data + filings + allowlisted web → verification_card (result, sources, uncertainty, effect_on_setup). Unverifiable ≠ false, stated plainly.

**Cost controls:** model tiering per task class [tune], retrieval-before-generation, cached explanations, per-user token budget with graceful capacity state.

## Unit 4 — execution worker (Python, Railway)

**Driver interface:** `preview / submit / cancel / sync`. Drivers: `paper` (v1.0), `snaptrade` (read+sync v1.0; Webull trade v1.1).

**Preview pipeline (all drivers):** freshness gate → entitlement gate → **capability gate** (driver+connection-reported: access type, order types, options level, shortability, bracket support — `CAPABILITY_UNSUPPORTED` returns supported alternatives) → risk checks (daily-loss-cap, max position %, concentration, min R/R with hard-stop advisory copy; PDT counter advisory) → cost/est-fill → advisories vs blockers → persist preview (tolerance 25bps day / 50bps swing [tune]; expiry 60s day / 10m swing-invest [tune]).

**Paper fills:** equities — marketable at NBBO opposite ± slippage (1–3bps scaled by spread + size vs displayed; partials when size >3× displayed [tune]); limits on trade-through with queue haircut; shorts always locatable (labeled simulation difference). Options (v1.1) — mid ± 25% of spread [tune]; spread >15% of mid warns. Regular hours only; queued market orders → opening-auction fills with gap-risk narration. Position matching via `side` position_effect exclusively.

**Brackets & exits:**
- Paper: full OCO simulation; `exit_style='auto'` (guided default) auto-executes stop/target legs; `alert_assisted` (hands_on default) converts exits to push + one-tap close.
- Live (v1.1): broker-native bracket/OCO **only**. Connections without native bracket support force `exit_style='alert_assisted'` with explicit copy that exits are notifications, not automatic protection. **No server-managed live contingent legs in v1.x.**

**SnapTrade:** hosted connect (connection_type per broker support); capability + access discovery persisted per connection; account/position/order sync (poll + webhooks) with `data_lag` labeling (Robinhood ≈5-min trade detection → positions/`broker_sync` trades marked delayed, excluded from realtime position events); v1.1 Webull routing with broker-native preview data, reject translation (plain + raw preserved), auth-expiry and disconnect-mid-flow states (draft preserved, submission blocked); daily reconciliation job (broker state vs mirrors → discrepancy report to system_status). SnapTrade launch-checklist compliance: trade preview with fees, ≤1 trade/sec/account, user connection deletion.

**Invariants:** no fill claimed before driver confirmation; idempotency-key dedup returns the original; every transition → order_events + user_events in one transaction; accepted ≠ filled everywhere.
