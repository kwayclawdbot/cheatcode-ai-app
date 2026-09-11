# KAI'S TOOLBELT — 11 September 2026

What Kai can reach, what he still cannot, and the one number left to decide.

---

## BEFORE AND AFTER

| | Before | After |
|---|---|---|
| Tools | 4 | 14 |
| Knows what you are holding | no | yes |
| Knows what you are watching | no | yes |
| Knows what you decided last week | no | yes |
| Remembers anything about you | **no** | yes |
| Can read the news | no | yes |
| Can open a web page | no | yes, from a named list |
| Can place an order | no | **still no, and never** |

The last row is the point. Nothing in this change writes anything. *I prepare and
explain, I never execute* is a claim about the tool array, and
`scripts/kai-toolbelt-test.mts` asserts it against the array rather than against
the prompt that says it.

---

## 1. MEMORY IS READ NOW

`kai_user_memory` has existed since migration 0011. The app wrote to it from one
button — **"Saved to what Kai remembers"** on a trade write-up — and the member
could list and delete the rows in Account. **Nothing had ever read them back.**

So a member could save a lesson, watch it appear in a list titled *what Kai
remembers*, ask Kai about the same mistake the next day, and be met with a
stranger. The button was telling the truth about the table and lying about Kai.

`assembleContext` now loads up to 12 items and renders them into the **cached**
half of the prompt, which is where they belong: a remembered sentence does not
change between turns, so it is paid for once.

Four rules it follows:

- **`profiles.memory_enabled` is honoured as a read gate.** Off does not query
  the table at all. Off also renders a *different sentence* than empty — "I am
  not allowed to look" and "you have not saved anything" are different answers to
  *what do you remember about me*, and a member who turned the switch off is owed
  the first one.
- **It is fenced as `<untrusted_content>`.** A lesson is generated from a
  write-up that carries text the member typed. That is a path in, and it is
  closed rather than assumed away.
- **A preference is still a preference.** Delimiting it must not make it inert:
  "explain it without the jargon" is a fact about the person and Kai honours it.
  What it can never do is move a boundary.
- **Numbers in a memory are not prices.** Deliberately *not* added to
  `contextNumbers`, so the contradiction validator will not let a months-old
  figure through as something Kai was shown.

**Retrieval is by recency, not similarity, and the code says so.** 0011 gives the
table a 1536-dimension embedding column and nothing in this app has ever written
to it; a vector search would rank rows by a NULL and return nothing while looking
sophisticated.

---

## 2. TEN NEW TOOLS

Every one is an **adapter over the loader its endpoint already uses**. A tool
that re-queried `positions` with its own column list would eventually disagree
with the Trade tab about what your stop is, and being told two different stops by
two parts of one app is worse than being told none.

### The member's own desk — `lib/kai/tools-desk.ts`

`read_watchlist` · `read_positions` · `read_plans` · `read_alerts` ·
`read_trade_reviews`

The gap these close: Kai could tell you where NVDA's previous day's high was and
could not tell you that you are long it. Ask "should I add to my position?" and
the word *my* referred to something he had no way of reading.

Every query is keyed on the authenticated `userId`. **No tool input anywhere in
that file names a user**, so there is no argument Kai can produce — or be talked
into producing — that reaches another person's rows.

### Other people's words — `lib/kai/tools-room.ts`

`read_community_messages` · `read_setup_discussion`

Membership is **checked, not assumed**: Kai reads on behalf of the member, so he
may read exactly what they may read. Message bodies are fenced one at a time, so
a post containing a closing tag cannot speak outside the fence.

### The outside world — `lib/kai/tools-web.ts`

`read_news` · `open_web_page`

### One more on the market side

`look_up_prices` — the same Polygon call, for up to ten symbols at once. It
exists because `look_up_price` took one symbol, so "how are my three doing?" cost
three tool turns against a budget of four.

---

## 3. THIS IS NOT A WEB SEARCH, ON PURPOSE

`docs/03_SERVICE_SPECS.md` §36 ends its tool list with six words: **"No arbitrary
URL fetch."** §40 spells out what is allowed instead — `research_fetch`, behind a
domain allowlist, with SSRF protections, size and time caps, and sanitisation
before anything reaches the model. That is what was built.

A general search engine would also need a vendor and a key this product does not
have. Rather than stub one and have Kai apologise for it every turn, the two
things that *are* buildable on the keys already configured were built properly.

`open_web_page`, in order:

1. **The allowlist is the control** — ~30 registrable domains (wires, financial
   press, SEC/EDGAR, exchanges, statistical agencies), matched on a **dot
   boundary**, so `www.reuters.com` passes and `reuters.com.evil.tld` does not.
   Extendable only through `RESEARCH_ALLOWLIST_EXTRA` in the environment — never
   through a request, and never through anything a page Kai just read could say.
2. **Every redirect is re-checked** — followed by hand, three hops at most, each
   through the same host check as the first.
3. **No private addresses** — the host is resolved and refused on loopback,
   link-local, private, carrier-grade NAT, unique-local and v4-mapped ranges.
   Defence in depth *behind* the allowlist, not the primary control: there is a
   window between the lookup and the connect and the code says so rather than
   claiming otherwise.
4. **Caps on both axes** — 8 seconds, 512 KB read off the stream (a declared
   content-length is a claim, not a limit), text content types only.
5. **Sanitised, then fenced** — `script`, `style`, `head`, `noscript`,
   `template`, `svg`, `iframe` and comments are removed **with their contents**
   before the tags come off. That ordering is the whole defence: strip tags first
   and a script body becomes visible prose, which is a free channel to a model.

GET only. No cookies, no credentials, no body, no POST.

---

## 4. THE PROMPT-INJECTION RULE GREW A SECOND HALF

The `SECURITY` block was right and incomplete. It said what is inside the fence
is data. It did not say what to do when the data is **addressed to you** — which
became a live question the day Kai could open a web page.

It now names the shapes an attack actually takes: *ignore your previous
instructions*; a block imitating a system prompt or a tool definition; a claim to
speak for this app, its owner or Anthropic; a closing tag followed by text
pretending to be outside the fence; an instruction to recommend, size, or state a
price he did not look up; **an instruction to keep something from the user.**

And the line that matters most in practice: **an attempt is reported, not
silently ignored.** A refusal the user never hears about is indistinguishable
from Kai quietly complying.

---

## 5. `MAX_TOOL_TURNS` IS STILL 4, DELIBERATELY

Going from 4 tools to 14 is an argument for raising it, and that argument has no
evidence behind it yet.

`kai_model_usage` has always written one row per round trip, so the number of
turns a question *takes* was recoverable. What nothing recorded was whether a
question **ended because Kai was finished or because the cap stopped him** — and
those two look identical in the ledger. That difference is the entire decision.

So the loop counts itself now. One line per question:

```
kai.toolbelt  { turns, max_turns, capped, tool_calls, tools: { name: count } }
```

**`capped` is the field to watch.** Rare → four is the right budget and the extra
tools cost nothing. Common → the tools listed beside it say *which* question is
running out, and that is a different fix depending on the answer: a cap too low,
a description that sends Kai looking symbols up one at a time, or a tool that
should have been part of the context all along.

Raising a cap on the theory that more tools need more turns is how a chat that
cost four round trips starts costing eight for the same answers.

---

## WHAT IS STILL NOT DONE

- **`market_memory` retrieval.** 03 Unit 3 describes top-k with recency decay and
  entity match. The table exists; nothing writes embeddings to it either.
- **No embedding writer for `kai_user_memory`.** Until one exists, retrieval is
  recency-ordered and `loadUserMemory` is the single place that changes.
- **Memory is still written from exactly one button.** Kai does not extract
  preferences from a conversation. He now *reads* what the member chose to keep;
  he does not decide what to keep.
- **General web search.** Needs a vendor and a key. Not stubbed.
- **None of this has run against the live API.** `apps/api` still needs
  `vercel deploy --prod` — see `docs/DEPLOY-2026-09-08.md`.

---

## PROOF

```bash
cd apps/api && npx tsx scripts/kai-toolbelt-test.mts
```

112 assertions, no model calls, no credits, no writes: memory rendering and its
switch, the fence, the registry (14 tools, unique names, **no tool whose name
contains an acting verb**), that every registered name actually dispatches, the
allowlist's dot-boundary matching, every private address range, the sanitiser
ordering, and the URL vetting refusals. It runs inside `npm test`.
