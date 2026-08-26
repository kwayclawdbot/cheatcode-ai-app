# Cheat Code AI — v1 slice build brief (2026-08-26)

Owner (Kway) asked for: **foundation + sign up/login + onboarding walkthrough + primary screen (Home).** This brief is binding for every build lane. Read the referenced docs before writing code.

## Governing documents (in `docs/`)
- `00_BACKEND_OVERVIEW.md` … `05_DECISIONS_REGISTER.md` — canonical backend (v2). Nav L6, four units, write paths, freshness, security boundary.
- `01_DATA_MODEL.md` — THE schema. Phase 0 generates migrations from it verbatim (extensions → enums → tables in dependency order → indexes → triggers → RLS → grants → seeds). ⚙ marks are instructions.
- `02_API_CONTRACTS.md` — REST under `/api/v1`, error envelope `{error:{code,message_plain,detail?}}`, every price-bearing payload carries `quote:{…,source_ts,received_ts,freshness}`.
- `14_PALETTE_LOCK_VOLT_VIOLET.md` — locked palette + type + grammar (volt = user action, violet = Kai, cyan = market data, green/red/gold = financial semantics only).
- `07_UX_SPEC_v3_extracted.md` — beginner-first rules: four questions in five seconds, plain English first, one dominant action, no gamification, freshness on every price, accepted ≠ filled.
- `06_TRADE_PAGE_SPEC_extracted.md`, `08_COMMUNITY_SPEC_extracted.md` — context only for this slice.

## Decisions for this slice (owner-confirmed tonight)
- **Nav (L6):** Home · Alerts · Community · Trade · Account. Home is Kai-led and is the primary screen. Other tabs ship as honest, designed empty/stub states — never a blank screen.
- **Supabase:** new project `cheatcode-ai` (org Kway Clawd, us-west-2). Ref/keys in `apps/api/.env.local` and `apps/mobile/.env` once created (see `docs/ENV.md`).
- **Client:** Expo (SDK from scaffold) + expo-router + TypeScript. Web target ENABLED for browser verification (Playwright). Phone testing via Expo Go.
- **API:** `apps/api` Next.js (App Router) = the api-app unit. Local dev on :3000; deploy to Vercel at the end of the slice.
- **Kai:** Anthropic API via `@anthropic-ai/sdk`. Model `claude-sonnet-5` for conversation + briefing. Key: `ANTHROPIC_API_KEY` in `apps/api/.env.local` (copied from the owner's fta-dashboard env — never commit).
- **Paper only.** No broker connect, no orders, no Stripe checkout in this slice (tables + entitlement flags exist; checkout is a later phase).
- **No SMS, no gamification, no fake status bar in the app (the mockups' iOS chrome is presentation only).**

## Repo layout
```
apps/mobile      Expo app (expo-router)            — lane MOBILE
apps/api         Next.js api-app                    — lane API
packages/shared  generated DB types + zod schemas   — lane SCHEMA writes, both apps import (relative path, no workspaces)
supabase/        migrations + seed (supabase CLI layout) — lane SCHEMA
design/artboards Standalone HTML of the approved artboards (DOM + inline styles = pixel truth)
design/*.png     Overview screenshots
docs/            Specs + this brief + ENV.md
```
No npm workspaces (Expo + Metro hoisting pain). Each app installs its own deps. `packages/shared` is consumed via `tsconfig` paths / relative imports and has no build step (plain .ts).

## Screen → artboard mapping (translate the DOM near-verbatim; lift exact px/colour values from the artboard source, never round)
| Screen | Artboard file (`design/artboards/`) | Notes |
|---|---|---|
| Welcome / first run | `V2-O1-First-run.html` | pre-auth entry; primary "Get started" → sign up; secondary "I have an account" |
| Sign up / Sign in | (no artboard) compose from the O0/S0x vocabulary: same header rhythm, volt primary, violet Kai orb absent | email + password; magic-link option; error states in plain English |
| O0 Conversational onboarding | `V3-O0-Conversational-onboarding.html` | Kai asks "What are you here to do first?" → three mode choices → involvement → paper/broker/decide later |
| S01 Goal | `S01-Goal.html` | Trade Today / Trade Over Time / Build My Portfolio. **Invest is v1.1 in the backend**: show it, but selecting it sets mode=invest and lands on Home with the Invest-mode "coming in a later release — here's what works today" state; do not dead-end. |
| S02 Risk by example | `S02-Risk.html` | $2,000 account examples; daily loss cap derived; involvement hands_on/guided (backend enum: `involvement` has ONLY hands_on, guided) |
| S03 Setup summary | `S03-Summary.html` | "Here's how we'll work together" → primary "Start with Kai" → `POST /api/v1/onboarding/complete` |
| O1 Tap to learn | `V3-O1-Tap-to-learn.html` | interactive: tap the level that would confirm the setup (504 on META) → Kai confirms → "Watch 504 for me" creates a draft alert (status `draft`) |
| **Home (primary)** | `V3-H1-Glance-home.html` | Kai chat wall: mode chip + market status + freshness; morning report object; graded setup object (META B+ Forming; Entry/Target/Invalid; "Waiting for volume · risk $58 if wrong"; "Open setup →", "Why?"); user bubble; typing indicator; composer "Ask Kai…" + mic (mic = visual only in this slice, disabled with tooltip). Streams real Kai replies. |
| Alerts (stub) | `V3-A1-Alerts.html` | header + Needs attention / Watching / Resolved sections; renders real `alerts` rows for the user (the O1 draft alert appears under Watching as "draft — activate"); empty state copy: "Kai isn't watching anything for you yet." |
| Community (stub) | `V3-C0-Community-home.html` | header + rooms list from `rooms` seed (core rooms per mode), NO live session block (live is Phase 2); tapping a room shows "Rooms open in the next release" sheet |
| Trade (stub) | `V4-TR1-Trade-landing.html` | header + search + watchlist from seed instruments + "Kai opportunities" from ranked `setups`; NO portfolio value strip unless a paper account exists (then show paper equity, labeled PAPER); no Buy/Sell |
| Account | `V3-AC1-Account.html` | rules (daily loss cap, max risk per trade, involvement, paper trading toggle), "Connected: none — add a broker (later release)", Kai memory switch (`profiles.memory_enabled`), sign out |

The mockups' `9:41` status bar, notch and home indicator are NOT app UI. Use safe-area insets.

## Tokens (from `14_PALETTE_LOCK_VOLT_VIOLET.md`; verify against artboard inline styles and prefer the artboard value on conflict)
bg `#0B0B0E` · surface `#1C1C22` / `#17171C` / `#111117` · text `#FFF7E8` · muted `#B9B0A8` · dim `#6E675F` · volt `#C8FF00` (hover `#D6FF3D`) · violet `#8B4DFF` / light `#CBB2FF` / deep `#3B1685` · cyan `#32D6FF` (tint `#0F2733`) · green `#35D07F` (tint `#122A1E`) · red `#FF5A5F` (tint `#2E1517`) · gold `#FFC857` · danger `#B00020`.
Fonts: Space Grotesk 400/500/600/700 (`@expo-google-fonts/space-grotesk`) + IBM Plex Mono 400/500/600 (`@expo-google-fonts/ibm-plex-mono`); prices/times always mono + tabular. Body ≥16, targets ≥44. **Font gate gotcha (owner memory):** never `if (!fontsLoaded) return null` on web — guard with `Platform.OS !== 'web'` or render with fallback fonts.

## Data + API subset this slice must implement
Schema: FULL `01_DATA_MODEL.md` (all sections) — Phase 0 acceptance is "canonical schema → ordered migrations". Plus:
- ⚙ trigger `on auth.users insert` → `profiles` row + paper `accounts` row (starting_balance 10000 default; onboarding may change within $1k–$100k) + `notification_prefs` + `setup_alert_prefs` + `risk_policies` defaults.
- Seeds: `instruments` (SPY, QQQ, META, NVDA, AAPL, TSLA, AMD, CRM, MSFT, AMZN), `scan_universes.day_trade`, `rooms` core set per mode (from community spec §3; `config.intel_eligible=false`), `entitlement_flags` (free/premium per 02 §11), `disclosure_templates` (v1 `paper_only`, `education_not_advice`), and **4 seed `setups`** clearly marked `scanner_run_id = '00000000-0000-0000-0000-000000000000'` + `score_components.seed=true` (META long forming B+ 504/540/460 with the exact copy from the artboards; NVDA short-side or watching; AMD C; TSLA invalidated) with `quote_snapshot` freshness `delayed` and a `source_ts` — the app must render whatever freshness the data says.
- RLS exactly per 01 §13; append-only grants per ⚙.
- `packages/shared/db.types.ts` generated (`supabase gen types`), plus zod schemas for the API bodies below.

API (`apps/api/src/app/api/v1/...`, Supabase JWT from `Authorization: Bearer`, service-role client server-side, user-scoped everywhere):
- `POST /onboarding/complete` `{goal_mode, starting_balance, risk_answer, involvement, experience}` → updates profiles, risk_policies (+ journal), paper account balance; returns profile. Idempotent.
- `PUT /mode` `{mode}` → returns `{carryover:{open_positions:[],pending_confirmations:[]}}`.
- `GET /home?mode=` → `{market:{status,session_ts,freshness}, briefing:KaiObject(briefing)|null, lead_setup:KaiObject(graded_setup)|null, watching:[…], daily_risk:{cap,used,remaining}}`. Briefing generated once per user per market day by Kai (cache in `kai_objects`, refs `{user_id, market_date}`); if Anthropic fails → `briefing:null` and a `system_status`-style `degraded:true` flag, never a fake briefing.
- `GET /setups?mode=&state=` → ranked, caps 5/3, each with `grade_display, state, risk, fit, next_action`.
- `POST /kai/conversations` `{mode, pinned?}` → `{id}`.
- `POST /kai/conversations/:id/messages` `{content}` → **SSE**: `event: text_delta`, `event: object` (graded_setup / action_preview frames), `event: done`. Persists both turns to `conversation_messages`. Context assembly: profile + risk policy + mode + pinned setups + last 20 turns + the ranked setups for the mode (so Kai talks about real seed data). System prompt encodes the beginner copy pattern (Meaning → Decision → Risk → optional detail), the four questions, no certainty/hype, "Kai prepares and explains, never executes", always name freshness. **Kai has no tools that mutate anything in this slice.**
- `POST /alerts/draft` `{natural_language, refs}` → alert_preview object (Kai-parsed structured condition) persisted as `alerts` row status `draft`. Used by O1 "Watch 504 for me".
- `GET /alerts` → grouped `{needs_attention, watching, resolved}` for the user.
- Every handler: zod-validate, return the error envelope, log with request id.

## Verification gate (hard)
- `supabase db push`/migrations applied to the new project with zero errors; RLS test: user A cannot select user B's profile/accounts (write a small script using two anon-signed users).
- `apps/api`: `npm run build` clean; curl smoke for every endpoint (auth'd with a real JWT from a test user).
- `apps/mobile`: `npx expo export --platform web` clean; Playwright against `npx expo start --web`: screenshots of Welcome, Sign up, O0, S01, S02, S03, O1, Home (with a streamed Kai reply visible), Alerts, Community, Trade, Account at 390×844 saved to `proof/`. Side-by-side vs the artboard PNG for Home and O0 — element-level match is the bar (same order, same sizes, same colours), not "inspired by".
- `git commit` at every lane boundary with a clear message. No secrets committed (`.env*` in .gitignore).

## Non-negotiables (from the specs)
No XP/streaks/badges/confetti. No price without freshness. Accepted ≠ filled (n/a here). Kai never claims certainty. Status = label + shape + colour. Plain English before technical. One dominant action per screen. Volt only for user actions; violet only for Kai.
