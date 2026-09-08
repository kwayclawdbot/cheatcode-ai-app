# Moving the app onto the trade UI kit

`packages/trade-ui` landed in commit "The trade object gets one home". Nothing in
the app imports it yet, and that is on purpose — this document is the plan for
what moves onto it, in what order, and what each surface needs first.

The point of the kit is not new pixels. It is that a setup drawn on an alert
card, quoted into a room and opened on its own page should be one piece of code
with one set of rules, instead of three that currently agree by coincidence.
They agree until somebody edits one of them.

## Why nothing was migrated in the first pass

The first adoption was meant to be `PinnedTradePreview` and `ConversationPreview`
in the community room, because those two are the smallest surfaces and the kit
was built with them in mind. On inspection neither is a drop-in, and forcing
either one in would have removed something the app currently promises. Both
blockers are contract gaps, not styling disagreements, and both are fixable — but
they have to be fixed in the kit before a single screen changes.

### Blocker 1 — the kit has no idea how old a price is

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

**What the kit needs:** structured freshness on `TradeIdea` (the same four
fields), and the native components rendering it through the app's existing
`FreshnessMark` rather than printing `dataLabel` as text. `dataLabel` stays for
the "illustrative data" case the lab needs.

### Blocker 2 — the kit draws belts the opposite way round from the app

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

**What the kit needs:** `ConversationPreview` inking the name by belt like
`MemberName` does. This is a change to pixels the owner has already approved in
the mockup, so it is an owner decision, not a refactor to be done quietly.

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

**Step 1 — teach the kit about freshness.** Add the freshness fields to
`TradeIdea`, render them through `FreshnessMark` in the native components and
through the site's equivalent on the web. Run `sync-site.mjs` after. Nothing in
the app changes; this is the kit becoming able to tell the truth about a price.
Until this lands, no surface that shows a live price can move at all.

**Step 2 — settle the belt question with the owner.** One decision, one line of
code either way. If the house law wins, `ConversationPreview` inks the name and
drops the chip.

**Step 3 — the pinned setup in a room.** `PinnedSetup` →
`PinnedTradePreview`, via an adapter that maps `RoomSetup` to `TradeIdea`
(`invalid` → `stop`, strings parsed to numbers, freshness passed through). Do it
here first because a room's pinned setup is one component with one caller
(`app/room/[id]/index.tsx:417`), so the blast radius is a single screen. The
adapter is the real deliverable — it is the piece every later step reuses.

**Step 4 — the conversation.** `MessageRow` and `ClubMessage` onto
`ConversationPreview`. Bigger than it looks: `RoomMessage` carries reactions,
reply counts, structured ideas, position disclosure, media, verification and
deleted-author states that the kit's `ConversationMessage` has never heard of.
Either the kit grows those or it stays the preview component its name promises
and the full row keeps its own code. **Decide which before starting**, because
"we will extend it as we go" is how the third parallel implementation gets built.

**Step 5 — the alert card and the ticker page.** These are the surfaces with
signed-off pixels in `apps/mobile/proof/`, so they move last and only with
before/after screenshots against the existing proofs. `SetupPreview` and
`TradeDetail` are the kit's answers here.

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
