# THE KAI WORKSPACE — 11 September 2026

Kai talks, and the workspace responds. One agent, one command protocol, and more
than one place able to render it.

---

## THE SHAPE

```
                    KAI AGENT
                       │
        ┌──────────────┴──────────────┐
        │                             │
    DATA TOOLS                    UI ACTIONS
  (14 of them)                  open_chart
  search_setups                 show_setup
  look_up_price(s)              show_alert
  read_chart_levels             show_community
  read_watchlist                show_news
  read_positions                show_web
  read_plans                    focus_surface
  read_alerts                   close_surface
  read_trade_reviews                 │
  read_community_messages            │
  read_setup_discussion              │
  read_news · open_web_page           │
        │                             │
        └──────────────┬──────────────┘
                       ↓
              KAI WORKSPACE BUS
                       ↓
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
     HOME            TRADE        (anywhere else)
```

**A tool gets information. An action shows information.** They are never merged.
Fold them together and every lookup becomes a layout decision, and every layout
change costs a round trip to fetch something nobody asked for.

---

## WHAT WAS BUILT, IN THE ORDER IT WAS ASKED FOR

### 1 · The chart left `/trade/[symbol]`

`features/kai-workspace/chart-runtime.ts` — the portal payload, the candles, the
annotation set, the timeframe, the focus bar, the reveal set, and the forty-line
`applyCommand` that turns one of Kai's chart commands into a performance.

All of it was inside `TradePortalV2`, which meant a chart could only exist on
that route. It is **moved, not rewritten** — including the ordering that matters
most: React state is committed **after** the choreography, so levels do not snap
into existence before Kai's pointer reaches them.

**The ~40 chart verbs are untouched.** `mark_level`, `mark_zone`, `fib`,
`anchored_vwap`, `trendline`, `show_invalidation` — the vocabulary, the
server-side resolver and `ChartCommandFrame` are exactly as they were. This
changed *where* those commands can render, not one of them.

### 2 · `ChartSurface`, and the host

`ChartSurface` = `SymbolChart` (already data-free) + the runtime. That is the
whole file. `WorkspaceHost` renders whichever surface is active and nothing else.

**On a phone, one surface takes the canvas.** The old War Room was a desktop with
tabs beside the conversation; on 390 points that is four things too small to read
and a chart the size of a stamp. So the active surface owns the canvas and the
rest wait in a strip one tap away — the panel row, translated rather than copied.

**The host never navigates.** Opening a chart does not leave Home. The
conversation that asked for it is still underneath, still scrolled where it was.
A workspace that pushed a route would be the app it replaced.

### 3 · Trade proves parity

`TradePortalV2` now mounts `useChartRuntime`. There is **one chart
implementation in this app**, not a Trade chart and a Home chart that drift apart
on the first bug fix.

`onRoute` is a callback rather than a decision, and that is the difference
between the two hosts: in Trade a plan command is a `router.push` onto the
chart's own stack; on Home the same command must not throw somebody out of the
conversation they are having.

**Trade is not going anywhere.** Some people will say *I don't want to talk, just
give me the chart.* Home is the AI entrance to everything; Trade is the direct
entrance to the trading workspace. Two entrances, one machine.

### 4 · The contract

`packages/shared/api.ts` — `KaiWorkspaceAction`, `KaiFrameWorkspaceAction`,
`WorkspaceState`, `WorkspaceSurfaceKind`.

Chart verbs stay in their own frame and are **not** duplicated into this union.
Two vocabularies — one for the furniture, one for the drawing — is what stops
this becoming a flat list of ninety special cases.

**Nothing in the union acts.** No `submit_order`, no `arm_alert`, no
`create_plan`. Adding one would move the execution boundary while looking like a
vocabulary extension. The proof asserts it against the array rather than against
the prompt that promises it.

### 5 · Kai emits them

`apps/api/src/lib/kai/workspace.ts`. An action is a **fenced block**, not a tool:

> A tool call is a STOP — the model ends its turn, the server answers, the whole
> prompt goes back up. That is right for "go and find out" and completely wrong
> for "put it on screen": there is nothing to come back with, and the chart would
> appear a beat after the sentence that promised it.

So it is split out of the reply as it streams — a fourth `FenceSplitter`
alongside the three that already exist — and sent as its own frame **while Kai is
still talking**. The chart materialises under the words.

Three rules, enforced rather than trusted to the prompt:

- **One per reply.** The first that *resolves* wins, not the first that parses —
  so a valid-looking action with a dead id does not consume the budget and
  silence a good one behind it.
- **Every id is checked against a real row owned by this user.** A `show_alert`
  with a hallucinated uuid produces a panel that flashes and says nothing; it is
  dropped instead, exactly as an unresolvable chart command is.
- **`show_web` goes through the same allowlist `open_web_page` does.** The tool
  and the surface cannot disagree about what is readable.

### 6 · Home hosts it, and stays a conversation

`WorkspaceHost` renders `null` while nothing is open, so **the resting screen is
unchanged to the pixel**: wake-up, conversation, composer, nothing competing
before the first scroll. Only when Kai opens something does the workspace take
the top of the canvas.

### 7 · Workspace state travels back up

This is the half that makes it feel like an assistant rather than a remote
control. Every turn carries:

```json
{ "active_surface": "chart", "symbol": "NVDA", "timeframe": "4h",
  "open_surfaces": ["chart","community","news"],
  "setup_id": "…", "alert_id": null, "room_id": "…" }
```

Now these work:

| you say | what resolves it |
|---|---|
| "Zoom in." | `active_surface: chart` |
| "Show me where I'm wrong." | `symbol` + `timeframe` |
| "What are they saying?" | `room_id`, or the symbol |
| "Build it." | `setup_id` |

It rides on the **message**, not the conversation: a conversation-level context
is stamped at creation and is wrong for the rest of the thread the moment a chart
opens twenty turns in. And it sits **after the last cache marker**, next to the
market line — a value that moves every turn inside the cached blocks would throw
away everything behind it, which is the mistake `session_ts` once made at a cost
of ~9,000 tokens a call.

It also **wins over the conversation's stored chart stamp**, which is what makes
"mark the invalidation" one behaviour instead of two. Without that, chart
commands work in Trade and silently do nothing on Home — and the narration still
arrives, so it reads as Kai marking a chart that never changes.

---

## THE TRAP WORTH NAMING

A directed answer's prose rides **inside** the `chart_answer` frame and is
deliberately not also streamed as `text_delta` — streaming it twice would print
the answer twice under a chart that performed it once.

So a host that handles `text_delta` and ignores `chart_answer` does not get a
degraded answer. **It gets no answer**: a chart that moves and a conversation
that says nothing. That is the exact shape of *"the chart moves but nothing
happens"*, and it is why `features/kai-workspace/bridge.ts` exists rather than a
two-line frame handler on Home.

---

## SURFACES

| Surface | Data behind it | State |
|---|---|---|
| `chart` | the shared runtime | live |
| `setup` | `api.setupDetail` | live |
| `alert` | `api.alertDetail` | live |
| `news` | `api.symbolDetail().evidence.news` | live |
| `community` | `communityApi.messages` | live, read-only |
| `web` | the source + a handoff to the phone's browser | live |
| `watchlist`, `portfolio`, `training`, `plan` | — | **defined, not offered** |

The last row is the rule that keeps this honest: a kind exists in the type so the
client's switch is exhaustive, but it is **absent from `KAI_OFFERED_ACTIONS`**, so
Kai can never say "here it is" about a surface that will not appear. Adding the
surface and adding the action are one commit.

Two deliberate absences:

- **`market_session` is not a tool.** The market line is already in every
  request; a tool that fetched it would cost a round trip to learn something Kai
  was told.
- **The web surface does not render the page.** An in-app WebView would put a
  third party's scripts inside a signed-in session for the sake of a panel, and a
  sanitised copy would be Kai's reading of the page dressed as the page. So the
  surface is the *source*, and the button hands it to the real browser.

**No placeholders anywhere.** A surface that has not loaded says it is loading;
one that failed says so; one that loaded nothing says the thing is empty. A
workspace is where a plausible-looking placeholder would do the most damage — it
opens *because* Kai said it would, so whatever is in it reads as vouched for.

---

## PROOF

```bash
cd apps/mobile && npx tsx scripts/kai-workspace-test.mts   # 46 assertions
cd apps/api   && npx tsx scripts/kai-toolbelt-test.mts     # 137 assertions
```

Both are in `npm test`. No React, no network, no model calls, no credits.

The bus is driven directly: one chart not a row of them, the cap, collapse-is-
not-close, the nonce moving on a subject change *and only then*, and `toState`
matching what is on screen. The source checks are structural — the host never
pushing a route, `ChartSurface` owning no data, Trade no longer holding its own
applier, the bridge handling `chart_answer`.

---

## WHAT IS NOT DONE

- **Phase 2–4 surfaces**: watchlist, portfolio, plan, training, market regime,
  earnings, options. Each is a surface plus one line in `KAI_OFFERED_ACTIONS`.
- **`focus_surface` / `close_surface` take a KIND, not an instance id.** That is
  deliberate for a phone — one chart, one news panel — and would need revisiting
  if a surface ever needs two instances.
- **The strip is capped at 4** and has no reorder.
- **Nothing here has run against the live API.** `apps/api` still needs
  `vercel deploy --prod` before any of it is reachable — see
  `docs/DEPLOY-2026-09-08.md`.
- **`chart-indicators-test.mts` is red (6 of 90)** and was red before this work:
  it renders the chart in a real browser and this container cannot.
