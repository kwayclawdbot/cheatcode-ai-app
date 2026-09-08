# Moving the app onto the trade UI kit

`packages/trade-ui` landed in commit "The trade object gets one home". Nothing in
the app imports it yet, and that is on purpose — this document is the plan for
what moves onto it, in what order, and what each surface needs first.

The point of the kit is not new pixels. It is that a setup drawn on an alert
card, quoted into a room and opened on its own page should be one piece of code
with one set of rules, instead of three that currently agree by coincidence.
They agree until somebody edits one of them.

## The two blockers, and how they were settled

The first adoption was meant to be `PinnedTradePreview` and `ConversationPreview`
in the community room, because those two are the smallest surfaces and the kit
was built with them in mind. On inspection neither was a drop-in. Both blockers
went to the owner and both are now resolved — one by fixing the kit, one by the
owner relaxing the rule. They are written up in full below because the reasoning
is what a later reader will need, not the verdict.

> **Owner ruling, 8 September 2026.** The belt conflict is fixed in the kit: the
> house law wins and `ConversationPreview` now dyes the name. The freshness
> requirement is **relaxed for kit surfaces** — the live-data lane ships 15-second
> focused polling, so the owner deems quotes live and does not want freshness
> plumbing gating adoption. Spec §10's "mandatory next to every price" therefore
> does not block a kit surface. This is a deliberate exception, not an oversight,
> and it is his call to reverse.

### Blocker 1 — the kit has no idea how old a price is — *owner-relaxed*

`src/ui/FreshnessMark.tsx` opens with the rule: *"Freshness is mandatory next to
every price (UX spec §10)."* Status is a label plus a **shape** plus a colour,
never colour alone — a filled cyan dot for live, a gold ring for delayed, a red
square for stale, a muted bar for market closed.

`RoomSetup`, the type the pinned setup in a room actually receives, carries the
four fields that make that possible:

```ts
freshness: 'live' | 'delayed' | 'stale' | 'closed' | 'unknown';
quote_at: string | null;
delay_reason: DelayReason | null;
```

`TradeIdea` in `packages/trade-ui/model.ts` has none of them. It has a single
free-text `dataLabel`. Swapping `PinnedTradePreview` in where `PinnedSetup` is
today would take a surface that tells a member their price is fifteen minutes old
and quietly replace it with one that does not. That is not a visual regression,
it is the app making a claim it cannot support.

`PinnedSetup` is also honest about a second thing worth preserving: its header
records that it deliberately refuses to draw the artboard's intraday price line,
because this lane has no candles endpoint and inventing a squiggle would be fake
market data. The kit draws real candles from `idea.candles`, which is better —
but only once a caller actually has bars to give it.

**Settled:** not fixed, and deliberately so. The owner's position is that the
live-data lane's 15-second focused polling makes the quote live, so a freshness
mark on a kit surface would be furniture reporting a state that no longer varies.
`TradeIdea` gains no freshness fields in this pass and `dataLabel` carries the
source line on its own.

What that costs, recorded honestly so nobody has to rediscover it: the mark is
also what says *market closed* and *stale*, which are real states polling cannot
argue away. If a kit surface ever shows a price outside a live session, this
decision is the first thing to revisit — the four `RoomSetup` fields are still on
the wire and still correct, so reversing it is additive rather than a rewrite.

### Blocker 2 — the kit draws belts the opposite way round from the app — *fixed*

`src/features/social/belts.ts` states the house law: **SIGNAL IS LIT, BELT IS
DYED.** A belt colour is allowed in exactly two places — a member's *name*
(`beltInk`) and the *edge* of what they wrote (`beltEdge`). Never a fill, never a
control, never a chart series. The reasoning is a real collision: violet is Kai's
and cyan is market data, so belts sit at 15–61% saturation to stay legible as
rank rather than as meaning.

Every shipping community surface obeys it. `MessageRow` and `ClubMessage` both
pass the belt to `MemberName` and get a belt-coloured *name*; neither draws a
chip. `BeltChip` is reserved for call and trade cards.

`ConversationPreview` does the reverse: the name is plain `color.text` and the
belt becomes a bordered chip beside it. On its own that reads fine, which is
exactly the danger — dropped into a room it puts a second belt convention on the
app's most social screen, and the two would then disagree forever about what a
belt looks like.

**Settled:** fixed in the kit, both twins. `ConversationPreview` now colours the
name with `belt[m.belt ?? 'white']` and the chip is gone; the web twin does the
same through `var(--belt-*)`, and its `.belt` rule became `.aiTag`, which is all
it was still being used for. `belt.white` is `#FFF7E8`, the same ivory the name
already was, so an unranked member renders exactly as before.

The kit reads the ladder from `src/ui/tokens.ts` rather than importing
`beltInk` from `features/social/belts.ts`. The two are the same values — `BELT_INK`
is built from those tokens — and `src/ui/*` importing from `src/features/*` would
be a back-edge in the layering. The palette still has exactly one source.

### The smaller gap underneath both

The two type systems describe the same object in different words. `TradeIdea`
levels are `number | null` named `entry / stop / target`. `RoomSetup` levels are
`string | null` named `entry / target / invalid`. `ConversationMessage.belt`
re-declares the five belts as an inline union instead of using `Belt` from
`src/lib/types.ts`.

The belt duplication cannot be fixed by importing, because `packages/trade-ui` is
shared with the site and the site cannot reach into `apps/mobile`. The honest fix
is for `Belt` to move down into the shared package and for both apps to import it
from there — the same move `packages/shared` already exists to make.

## The order things should move, and why

Each step is worth shipping alone, and each one makes the next smaller.

~~**Step 1 — teach the kit about freshness.**~~ **Dropped** by the owner ruling
above. The kit stays freshness-free.

~~**Step 2 — settle the belt question.**~~ **Done.** The house law won and both
twins conform.

**Step 3 — the pinned setup in a room. DONE.** `PinnedSetup` →
`PinnedTradePreview` at `app/room/[id]/index.tsx`, via
`src/features/community/trade-adapter.ts`, which maps `RoomSetup` to `TradeIdea`
(`invalid` → `stop`, wire strings parsed to numbers, `state` mapped to
`TradeStatus`). Done here first because a room's pinned setup was one component
with one caller, so the blast radius was a single screen. **The adapter is the
real deliverable** — it is the piece every later step reuses, and it is the only
place the two vocabularies are allowed to meet.

**Step 4 — the conversation. DECISION MADE: it does not move.** `RoomMessage`
carries twenty-odd fields — reactions, reply counts, media, Kai verification,
structured ideas, position disclosure, community calls, deleted-author states.
`ConversationMessage` has eight. Putting `ConversationPreview` where `MessageRow`
is today, across `app/room/[id]`, `app/thread/[id]` and `app/(tabs)/community`,
would delete a dozen shipped features from three screens to gain a shared shell.

So the kit stays the *preview* component its name promises, and the full room row
keeps its own code. `ConversationPreview` is conformed to the belt law and lives
in the lab; if a surface ever needs a short conversation excerpt — a room list's
last message, a setup page's "what the room is saying" — that is where it goes.

This is the decision the earlier draft of this document said had to be made
before starting, and the reason it is written down as a decision rather than a
step is that "we will extend it as we go" is how the third parallel chat
implementation gets built.

*The original wording of this step, kept because it is the case for reversing it:*
`MessageRow` and `ClubMessage` onto
`ConversationPreview`. Bigger than it looks: `RoomMessage` carries reactions,
reply counts, structured ideas, position disclosure, media, verification and
deleted-author states that the kit's `ConversationMessage` has never heard of.
Either the kit grows those or it stays the preview component its name promises
and the full row keeps its own code. **Decide which before starting**, because
"we will extend it as we go" is how the third parallel implementation gets built.

**Step 5 — the alert card. DONE, 8 September.** `StandardAlertCard` is
`SetupPreview` collapsed and `TradeDetail` expanded, via
`src/features/alerts/trade-adapter.ts` — the alerts twin of the room's adapter,
and the piece that made this a day's work rather than a rewrite. Driven by
audit F06: entry, stop, target, the risk/reward and the lifecycle are all above
the fold now; the score, the bars and the story are behind the expander.

Four things are worth carrying forward, because each was found by looking at
the rendered card rather than at a green test:

- **The alert wire has no bars.** `useAlertCandles` fetches them per symbol from
  `/market/candles` and caches above the hook. It is a subscription, not an
  `alive` flag in the effect: React's development double-invoke runs the
  cleanup between the two passes, so the flag version filled the cache and
  re-rendered nothing.
- **Levels are display strings and some are ZONES.** `'504–507'` is a real
  value. Strip the dash and it becomes `504507`. One number is a price, two are
  a zone, the chart draws the near edge and the cell prints the wire's words.
- **A card with a zone shows the server's ratio, not a computed one.** A ratio
  measured off one edge of a range is a best case dressed as the case.
- **A level with no number is not drawn.** That rule lived in the alert card;
  it lives in `TradeMap` now, so it outlives the next component that draws a
  level.

**Step 5b — the ticker page.** Not moved. `/symbol/[symbol]` is a company page
with its own chart lane (`features/chart`, `usePortalCandles`) and its own
sections; it is a different object from a trade idea, and folding it onto the
kit is its own decision rather than a leftover from this one.

**Step 6 — the quoted post.** `QuoteBlock` is the one place in chat where a
member's identity is flat muted text, because `MessageQuote` carries no
`user_id` and no belt. Fixing that is a backend field, not a component change,
so it is listed last and is genuinely optional.

## The rule that keeps this from fragmenting again

`packages/trade-ui/model.ts` is the only place trade geometry, level validation
and risk/reward maths are allowed to live. The site's `model.generated.ts` and
`fixtures.generated.ts` are copies that exist solely because the site deploys
from its own folder and cannot import upward; `node packages/trade-ui/sync-site.mjs
--check` fails the moment they drift, and it should stay in the pre-deploy path.

Fixtures are for the lab. If a screen ever renders `DEMO_TRADE` because an API
call failed, that is a bug — the empty state is the honest answer.

New trade surfaces start on the kit. That is the whole point of it being here.
