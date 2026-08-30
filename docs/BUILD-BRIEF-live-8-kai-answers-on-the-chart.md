# LIVE-8 — Kai answers on the chart

**Owner's ask, verbatim:** *"it can be called as a tool in kai chat where kai takes over
chart to answer user questions by controlling and narrating chart to respond."*

A user is looking at a chart in the Trade Portal and asks Kai a question. Kai does not
reply with a paragraph. He works the chart — moves the camera, marks the level he is
talking about, rings the candle, points at what he names — and narrates it. The answer
IS the chart moving.

The button version ("Kai Live" in the trade area) falls out of this for free: it is the
same tool with a fixed question. Build the tool; the button is one call site.

---

## 1. The single most important thing about this lane

**Most of it already exists. The work is joining two halves that were built apart.**

Do not write a new chart-command path. Do not write a new anti-invention rule. Read this
section before touching anything.

### Already shipped — the chat half

| file | what it already does |
|---|---|
| `apps/api/src/lib/kai/chart-commands.ts` | Kai emits `{"command":"mark_level","args":{"level":"trigger"}}` — a SYMBOLIC reference, never a price. This file resolves it against the real setup/alert/plan/position/community rows. An unresolvable reference is **dropped, not filled in with a plausible number**. Every resolved frame carries `provenance` and `narration`. |
| `apps/api/src/app/api/v1/kai/conversations/[id]/messages/route.ts` | Injects `chartCommandProtocol({...})` into the system prompt when the conversation is attached to a chart (`conv.context.chart`), via `loadChartContext`. |
| `apps/mobile/src/features/portal/useKaiPortal.ts` | Consumes `chart_command` frames, applies them **in place** on the portal's chart, and narrates. Already tolerates a server that has not shipped `chart_command` yet. |
| `apps/mobile/src/features/chart/apply.ts` + `choreography.ts` | Executes every one of the 16 `ChartCommandName`s with real staging: pointer travel, two-pulse flashes, eased camera moves, staged plan marks. **Interruption already works** — a sequence answers `interrupted` and abandons the rest. |

### Already shipped — the show half

| file | what it already does |
|---|---|
| `workers/kai-live/src/cue.ts` | **The director.** Reads finished prose and calls the chart actions. This is the piece the chat half is missing. See §3. |
| `workers/kai-live/src/resolve.ts` | Turns markers into `ResolvedAction`s against real rows; builds shape geometry (`shapeRow`); scrubs untraceable numbers (`pass 1b`); unwraps invented brackets (`pass 0`). |
| `packages/shared/live.ts` | The marker grammar: `MARK ZOOM TF COMPARE NOTE POINT FLASH CAM ZONE CIRCLE ARROW SLIDE`, plus `LIVE_MARK_TARGETS`, `LIVE_CAM_MOVES`, `LIVE_ZONE_TARGETS`. |

### What the chat half is missing

Chat emits **one-shot commands with no choreography and no coordination**. It has no
camera-plus-draw pairing, no cursor following what is named, no circles/arrows/zones, and
no voice. Everything in that list was built for the show and is measured working.

**So: route the chat answer through the director.** One director, two callers.

---

## 2. What to build

### 2a. Extract the director so both callers can reach it

`cue.ts` currently lives in `workers/kai-live/` and imports worker-local types (`Budget`,
`MarketBundle`, `LevelEntry`, `ask` from `analyze.ts`). The API cannot import from the
worker.

Move the *pure* half — the marker grammar prompt, `sentencesOf`, `normaliseCue`,
`cueIsSane`, and the four deterministic injectors — into `packages/shared/director/`.
Leave the LLM call and the budget behind an injected interface:

```ts
export type DirectorAsk = (opts: { user: string; system: string; maxTokens: number })
  => Promise<{ cues: Cue[] } | null>;
```

The worker passes its budgeted `ask`; the API passes its own. Neither knows about the
other. **Do not duplicate the injectors** — they are the part that took the most iteration
to get right and the part most likely to drift if copied.

### 2b. A short-form mode

The director's density rules are tuned to a 5-minute segment of ~800-character beats. An
answer is 15–30 seconds. Add a mode to the director options:

```ts
{ form: 'segment' | 'answer' }
```

What changes in `answer` form:

- **One beat, not seven.** No intro, no per-timeframe walk, no thesis.
- **The floor stays but scales.** `PER_ACTION_CHARS = 170` is right — it is a rate, not a
  total. A 400-character answer earns ~2 actions. Do not special-case it.
- **`STALE_CHARS = 350` stays.** It is what stops the cursor pointing at something nobody
  has mentioned for four sentences.
- **At most one shape.** The guaranteed `ZONE` and `ARROW` injections (rules 4 and 5) are
  right for a segment and too much for a sentence. In `answer` form, inject at most one,
  and only when the answer actually discusses a band or a distance.
- **No `SLIDE`.** Panels are a broadcast device. A chat answer already has the chat.

### 2c. The tool itself

Kai's chat gets a tool the model can call — name it `show_me` or `answer_on_chart`. When
the conversation is attached to a chart and the question is about *this* chart, the model
calls it with its answer as prose. The route then:

1. runs the director over that prose in `answer` form,
2. resolves the markers through the existing `chart-commands.ts` resolver (NOT a new one),
3. streams the resulting frames to `useKaiPortal` in the order and at the offsets the
   director produced.

**The timeframe on screen is the timeframe.** Do not run a top-down analysis. That is what
costs the show 37 of its 41 seconds (§4) and it is the wrong shape for an answer — the
user is looking at one chart and asked about it.

### 2d. Voice is a separate switch

Ship silent first. The frames already carry `narration`; the portal already renders it.
Voice is `workers/kai-live/src/tts.ts` pointed at the same frames, and it is a product
decision (premium?) rather than a technical one. Do not couple them.

---

## 3. The director's rules, and why each one exists

Every one of these was added because a *measured* run was wrong without it. Do not
simplify them away.

| rule | why it exists |
|---|---|
| A level is drawn once; a later `MARK` becomes a `POINT` | A measured segment spent 9 of 23 actions redrawing lines already on screen. Redrawing shows the viewer nothing. |
| A gesture at an undrawn level draws it instead of being dropped | Dropping cost a sentence rewrite for a cue that was right about *what* mattered. |
| The camera moving and something being drawn are ONE gesture | Owner: *"THERE SHOULD ALWAYS BE CAMERA MOVES AND GESTURES WHEN REFERENCING SPECIFIC CANDLES, ZONES, or AREAS OF INTEREST."* Five runs of rephrasing the prompt never produced it; it is enforced in code. |
| A ring only follows a `ZOOM`, using that zoom's level | Rings used to follow any camera move and fall back to the first level in the table — always `trigger`. That is exactly the *"trigger circle randomly appearing when not being discussed"* the owner reported. |
| The cursor moves per MENTION, at the word | Firing once per sentence and taking the first level word put 15 of 21 actions on `trigger` and left 24-second silences. |
| Quiet runs point at the level named most recently, and the subject carries across beats | Without the carry, every beat opened in silence and the worst gap got *worse* (60s). |
| Past `STALE_CHARS`, no gesture is made | Pointing at the trigger during a sentence about last quarter's revenue is not "resting on the subject", it is being stranded. |
| Markers within `MIN_APART` chars are thinned | Three gestures on one instant is a glitch, not emphasis. |

**Verify with the checker, not by eye.** For every chart action: find the say frame owning
its `t_offset`, map the offset to a character position via
`(t - sayStart) / duration * len(text)`, and assert the action's level appears in the
surrounding **sentences**. A fixed ±70-character window gives false positives — it slices
words in half (`…sistance`). Current measured state: **97% of actions mark the level being
spoken.** Anything below ~95% is a regression.

---

## 4. Latency budget

Measured on 2026-08-29:

| stage | show | this lane should be |
|---|---|---|
| Four sequential timeframe analyses | 37s | **skipped** — use the chart on screen |
| Director + repair pass | 4s | 2–4s |
| First line's TTS | 4.3s | 0 (silent) or ~3s |
| **Time to first action** | **~45s** | **~8–12s** |

TTS measured 6.1s for 29.6s of audio, ~5× realtime, so voice is not the bottleneck if you
add it. If you want to go lower, release beat-by-beat rather than preparing the whole
answer first.

---

## 5. Acceptance

1. A user asks *"why is this only a B-plus?"* on a chart in the Trade Portal. Kai's answer
   arrives as chart motion plus narration in **under 12 seconds to first action**.
2. The checker in §3 reports **≥95%** of actions marking the level being spoken.
3. Asking a second question mid-answer abandons the first cleanly — `choreography.ts`
   already answers `interrupted`; prove it end to end.
4. No annotation is created that a user did not ask for and cannot trace: every mark
   carries `provenance` and a `reason`, exactly as the show's do.
5. Zero bracketed fragments in any narration string (`\[[^\]]+\]` must not match). The
   writer invents placeholders like `[LEVEL:stop]`; `pass 0` in `resolve.ts` unwraps them.
6. The "Kai Live" button in the trade area calls the same tool with a fixed question and
   produces the same quality of answer.

---

## 6. Gotchas that cost real time today

- **`live_frames.payload` holds the WHOLE frame.** A command's own payload is nested:
  `payload->'payload'->>'shape'`, not `payload->>'shape'`. Reading the shallow path
  reports "no shapes" while shapes are being emitted correctly.
- **`testID` on `Animated.View` does not surface as `[data-testid]` in RN Web.** Detect
  panels/overlays by content or by known frame seq, not by testID.
- **At `pace=40` a panel is on screen ~275ms** — shorter than a 150ms poll. Capture at
  `pace=1`.
- **Only the marker NAME is case-insensitive.** `railFor()` does not lowercase, so
  uppercasing a whole cue turns `TF:15m` into `TF:15M` and every timeframe cue is dropped.
- **Never let the prose writer emit markers.** It writes them carrying prices
  (`[MARK:resistance:625.66]`), which splice into the middle of numbers and corrupt the
  sentence. The director owns all markers.
- **Keep the closed level list and the "you must not write a price" rule in whatever
  prompt writes narration.** Removing them made the model type raw prices and the
  contradiction check correctly killed whole segments.

---

## 7. Out of scope

- The Phase 3 scanner and `setup_events` (that is what a genuinely live market-hours show
  needs; an answer-on-demand tool does not).
- Pre-emption rules for a broadcast.
- Indicators — `packages/shared/indicators/` still does not exist, so the chart is bare
  candles. It is the biggest remaining visual gap but it is LIVE-1b, not this lane.
