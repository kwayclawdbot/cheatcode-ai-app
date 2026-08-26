# Cheat Code AI — Backend Overview & Architecture (v2, canonical)

**This version supersedes all prior drafts in full. No amendment layers — this is the single current statement.**

## 1. Release trains

All locked product scope ships, staged into three releases so the differentiated loop is validated before financial execution and the heaviest systems go live. **⚠ Requires Kway sign-off — this re-stages (does not cut) the locked v1 scope.**

| Release | Contents |
|---|---|
| **v1.0 — Core loop** | Brokerage-style Trade tab (search, real-time stocks, charts, watchlists) · Kai research + chart markup + structured objects · scanner setups (all modes' detectors, day/swing surfaced) · natural-language alerts · proactive A/B setup push alerts · paper trading (equities, long/short, brackets) · positions + debriefs · core Community rooms + @Kai + voice notes · Stripe free/$99 premium billing · SnapTrade **read-only** portfolio connect (incl. Robinhood aggregation) · minimal admin |
| **v1.1 — Execution** | Webull live execution (trade-enabled SnapTrade connections) · options (long calls/puts, paper + Webull) · full Invest-mode surfaces (goals, allocations, contributions, rebalance on paper) |
| **v1.2 — Depth** | Community intelligence pipeline · LMS (owner-uploaded classroom) · legacy K.AI subscriber migration · deeper market-memory compaction/synthesis · add-on-pullback / trim-at-high portfolio-manager guidance |
| Phase 2 (unchanged) | Live sessions, polls, DMs, voice conversation, desktop multi-panel, multi-leg options, gamma/order-flow plugin, additional trade-enabled brokers |

The core loop v1.0 proves end-to-end: **ask Kai → research → mark chart → create alert → build plan → paper trade → monitor → debrief → discuss.**

## 2. Locked platform decisions

| Decision | Value |
|---|---|
| Navigation | Home · Alerts · Community · Trade · Account. Home Kai-led; Trade brokerage-led with Kai embedded. |
| Client | React Native (Expo, iOS + Android). Desktop web Phase 2; contracts serve it unchanged. |
| Data & auth | Supabase (Postgres + pgvector, Auth, Realtime, Storage) — system of record |
| Backend hosting | **Four deployable units** on Railway (Python/FastAPI) + Next.js API/app layer on Vercel. Redis for quotes, queues, idempotency, locks. |
| Market data | Polygon.io stocks (WS + REST) v1.0; OPRA options v1.1. **Licensing gate: plan level, real-time redistribution/display rights, OPRA entitlement, and per-user market-data agreement requirements must be confirmed with Polygon before v1.0 production architecture is finalized (register O1). Until confirmed, the fallback design is delayed-data display for non-entitled surfaces with real-time reserved for entitled contexts.** |
| AI | Anthropic API (Claude). Persistent per-user Kai memory + longitudinal market memory (daily vector ingest). |
| Broker connectivity | SnapTrade. **Per-connection capability discovery is mandatory — connections carry read vs trade type and broker-specific capabilities; the UI never shows a submit-to-broker action unless the specific connection reports trade capability for that instrument and order type.** Robinhood: read-only aggregation, position data on a sync lag (labeled, never treated as realtime). Webull US: read + trade (v1.1). |
| Notifications | Expo push + in-app only. No SMS. |
| Pricing | Free + Premium $99/mo. Entitlements are config-driven flags. |

## 3. Four backend units

```
 React Native app ── REST /api (Vercel) ──┐            ┌── Supabase (Postgres+pgvector, Auth,
                  ── Supabase Realtime ───┤            │    Realtime, Storage)
                                          ▼            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │ 1. api-app (Next.js, Vercel)                                         │
 │    auth-gated commands · community posting · entitlements/Stripe ·   │
 │    admin · replay endpoint · webhooks (Stripe, SnapTrade)            │
 ├──────────────────────────────────────────────────────────────────────┤
 │ 2. market-intelligence worker (Python, Railway)                      │
 │    Polygon ingest · freshness authority · candles/session · scanner  │
 │    + setup lifecycle · alert evaluation · notification queue         │
 ├──────────────────────────────────────────────────────────────────────┤
 │ 3. kai worker (Python, Railway)                                      │
 │    conversations · research tools · contradiction validation ·       │
 │    thesis supersession · market-memory ingest+retrieval · user memory│
 ├──────────────────────────────────────────────────────────────────────┤
 │ 4. execution worker (Python, Railway)                                │
 │    paper driver · snaptrade driver (read v1.0, Webull trade v1.1) ·  │
 │    orders/positions/P&L · risk gates · reconciliation                │
 └──────────────────────────────────────────────────────────────────────┘
        shared: Redis (quotes, queues, idempotency)   external: Polygon, Anthropic, SnapTrade, Stripe, Expo
```

Notifications and scheduled jobs run as queues inside these units. Services split out later only when load or ownership demands it.

## 4. Write paths

- **Client → Supabase direct (RLS):** low-risk personal data only — watchlists, read receipts, UI preferences, lesson progress.
- **Client → api-app commands:** everything else, including all community posts (schema validation, rate limits, spam prechecks, disclosure enforcement, sequence assignment, audit), structured ideas, any preference affecting financial behavior, and every financial/state-machine mutation.
- Supabase Realtime is a **delivery** layer, never the business-logic layer. Every server-authoritative mutation writes its domain event **and** a `user_events` outbox row in the same transaction (see 01 §3) — the outbox is the unified, replayable user stream.

## 5. Freshness (system-wide)

Every price-bearing payload carries `{source_ts, received_ts, freshness: live|delayed|stale}` (live <3s, delayed 3–60s, stale >60s, config). Execution previews/submissions server-reject stale quotes; previews invalidate on price moves beyond tolerance or plan edits. Broker-position data from lagged sources (Robinhood) is always labeled delayed.

## 6. Live-exit protection policy

- Paper: full bracket/OCO simulation, including auto-exits.
- Live (v1.1): **broker-native bracket/OCO only.** If the broker/connection doesn't support it, exits are **alert-assisted** (push + one-tap close flow). No server-managed contingent legs on live accounts in v1.x, and nothing may present alert-assisted exits as automatic protection. Server-managed live contingents are deferred until uptime, reconciliation, and incident-response maturity justify them.

## 7. Kai security boundary

- All retrieved content — web pages, filings, news, community messages, market-memory rows — is **data, never instructions**. It enters prompts inside delimited untrusted-content blocks; the system prompt instructs Kai to ignore any instructions found within them, and validator checks strip tool-call-like or instruction-like artifacts from outputs.
- Tool permissions are least-privilege per task class; Kai has **no execution, no arbitrary URL fetch** (fetches go through an allowlisted research proxy with SSRF protection: public-DNS-only resolution, no private ranges, size/time caps), and no cross-user reads (every tool is user-scoped by the request context; market memory is global-only content with no user data).
- Community text can never reach another user's private context; personalization memory is strictly per-user; citations preserve original source + timestamp so provenance survives summarization.
- Outputs feeding financial surfaces pass the contradiction validator; outputs quoting community claims must carry the unverified/verified label from the verification pipeline.

## 8. Memory governance

Two regimes, deliberately separate:
- **Audit records** (orders, plan/thesis events, Kai financial outputs with model+prompt version, moderation log): retention per legal/audit policy, not user-deletable.
- **Personalization memory** (`kai_user_memory`): user-controllable — view all, delete individual items, delete all, or disable entirely (Settings). Deletion cascades to embeddings and any derived summaries. Portfolio specifics (balances, position sizes) are excluded from durable conversational memory by extraction policy; Kai reads live portfolio context at request time instead. Raw prompts/tool results retained 30 days for debugging (config), then purged.

## 9. Compliance posture

v1.0 is paper + read-only aggregation: educational. v1.1 introduces live execution, so before it ships: legal review of disclosure templates and the education/recommendation boundary, SnapTrade launch checklist (explicit trade-preview with fees, user consent, connection deletion rights), and app-store trading-app requirements. Kai prepares and explains; only the user's explicit confirmation on a broker-native preview submits; no fill is ever claimed before broker confirmation; disclosures are required data fields on every financial object, template-versioned and editable without deploys.

## 10. Companion documents

01 canonical data model · 02 canonical API/event contracts · 03 unit specs · 04 build plan (release-train ordered) · 05 decisions register (authority table).
