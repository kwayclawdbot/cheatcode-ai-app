# Can Kai run on Haiku 4.5 instead of Sonnet 5?

Measured 5 September 2026. Eighteen real questions, each asked **three times** to each
model, on the owner's own account, through the app's own prompt, tools and tool loop.
No source code was changed. Every answer is in
`HAIKU-VS-SONNET-2026-09-05-TRANSCRIPTS.txt` — nothing is edited or summarised there.

---

## THE ANSWER: DON'T SWITCH

Haiku 4.5 is genuinely cheaper — **59% cheaper**, $5.74 against $14.10 for a heavy user's
month — and it does **not** take more passes to answer, which was the real risk. On the one
test the owner cared most about, **it never invented a price. Not once in 60 answers.**

But it breaks the product in three other places, and two of them are things the user sees.

| | Sonnet 5 | Haiku 4.5 |
|---|---|---|
| Said a price nobody gave it | **0 of 60** | **0 of 60** |
| Blank replies (user sees an error) | **0 of 60** | **5 of 60** — all on chart questions |
| Chart questions where it actually drew something | **12 of 12** | **6 of 12** |
| Made up a dollar risk figure | **0** | **4** — three different answers to the same question |
| Got a reward-to-risk sum wrong | **0** | **2** |
| Said a position 3× over the limit was inside the limit | **0** | **1** |
| Told the owner the wrong time of day | **0** | **~12** |
| Extra lookups per question | 0.52 | 0.55 |
| Share of the prompt served from cache | 94.7% | 89.9% |
| Cost per message (**both measured with caching on**) | $0.0094 | $0.0038 |

The saving is about **$8 per heavy user per month**. The price of it is a Kai who returns a
blank screen on one chart question in four, and who tells you a $3,016 position is "well
under your $1,000 position limit."

---

## BEFORE ANY OF THAT: THE SWITCH DOES NOT WORK AS AN ENVIRONMENT VARIABLE TODAY

`KAI_MODEL` is config, not code — but setting it to `claude-haiku-4-5` right now makes
**every single Kai reply fail instantly.**

`apps/api/src/lib/kai/stream.ts` sends `output_config: { effort: 'low' }` on every call, in
both `messageStream` and `completeOnce`. Haiku 4.5 rejects that parameter:

```
400 invalid_request_error: This model does not support the effort parameter.
```

Verified directly against the API. Sonnet 5 accepts it; Haiku 4.5 does not.

That failure looks exactly like the revoked-key outage the code comments describe: every
turn fails in under a second, every reply is written as an empty stub, and the owner
reports "Kai stopped replying." **If anyone ever flips `KAI_MODEL` to Haiku without a code
change first, that is what happens.** Two lines — make `effort` conditional on the model —
would fix it. Nothing in this test needed that change; the measurement harness sends the
parameter for Sonnet and omits it for Haiku, which is what production would have to do.

---

## 1. DOES HAIKU EVER INVENT A NUMBER? No.

This is the test that was supposed to decide it, and Haiku passes it cleanly.

Every number in all 120 answers (60 per model) was checked automatically against two
sources: the facts block the prompt carried, and every tool result handed back during that
answer. Every unmatched number was then read by hand.

**No price in either model's answers came from anywhere but a tool or the context.** Every
one of these matched exactly: SPY $769.69, AAPL $319.97, NVDA $230.36, the 200-day at
$200.19, GTLB's $50.27 / $45.33 / $65.10, VRNS's $47.33 / $43.04 / $60.20, SLB's $58.34 /
$55.61 / $63.80.

The bait questions all held:

- **SPY, AAPL, NVDA** — the tickers a model has the strongest priors about. Both models
  called `look_up_price` or `read_chart_levels` every single time. Neither ever answered
  from memory.
- **ZZZZQ (no such ticker)** — 3/3 each: "I could not get a price for ZZZZQ." Neither
  invented one.
- **"Where is the 200-day average on this chart?" asked on SPY**, which has no 200-day
  average stored — 3/3 each refused and said why. Haiku's answer was actually the more
  precise: *"The data I have covers only 129 daily bars — less than half the bars needed."*
- **"Give me an entry, a stop and a target for SPY"** (SPY is ungraded) — 3/3 each refused.
  Haiku's refusal was the better-written one: *"Without that grade, any prices I offered you
  would be a guess, and guesses have no business in your plan."*

The tools were independently checked against Polygon with a different key from a different
project. The app's prices and levels agree with Polygon to within a penny on every symbol
tested, so the ground truth above is sound. (One unrelated wrinkle worth a look later: the
app's SPY price is $769.69 while its own last daily bar closes at $770.19 — a 50 cent gap
that exists on SPY and not on the other six symbols.)

**On the question that was meant to decide this, Haiku wins on the merits.** What follows
is why it still loses.

---

## 2. WHERE HAIKU FAILS

### a) One chart question in four comes back blank — this is the worst of it

When Kai answers about a chart, he is supposed to send a block containing
`{ "answer": "…the prose…" }`. The server reads the prose out of that JSON, directs it, and
that prose **is** the reply the user sees.

**Haiku wrote the prose but left off the JSON wrapper on 5 of the 11 chart answers it
produced.** The server's handler does exactly what it should with a malformed body — logs
`chart_answer.bad_json` and drops it. The prose is thrown away. The user gets:

> *"I came back with nothing that time — no words and nothing to put on the chart."*

Sonnet did this **0 times in 12**.

The five losses were real, complete, correct answers. This one was binned:

> *"The invalidation is a daily close below $45.33. That is the price that proves the idea
> wrong — not just that you are losing, but that the reason for owning this in the first
> place is gone."*

Broken down by question, over three runs each:

| Question (chart open) | Sonnet drew | Haiku drew | Haiku blanks |
|---|---|---|---|
| "Mark what is on this chart" (SPY, ungraded) | 3/3 | **3/3** | 0 |
| "Why is this only an A minus?" (GTLB) | 3/3 | 1/3 | 2 |
| "What are the three levels on this one?" (GTLB) | 3/3 | 1/3 | 0 |
| "What would prove this idea wrong?" (GTLB) | 3/3 | 1/3 | 2 |

**Today's fix does not regress:** on the ungraded symbol, Haiku marked the chart 3 times out
of 3, same as Sonnet. That specific worry is unfounded. The problem is everywhere else.

On the two GTLB questions where Haiku did not go blank, it answered in plain prose with the
prices typed into the text and **drew nothing at all** — which is the original complaint
("the chart moves but nothing happens") coming back.

Related: the chart-answer rules say never write a price in that prose, because the server
draws it. Sonnet broke that rule in 1 of 12 answers. **Haiku broke it in 8 of 11.**

### b) It makes up dollar risk figures out of a position size it never worked out

No invented *prices* — but Haiku invents *amounts*. Asked "is there a setup on VRNS?" three
times, it gave three different answers to the same arithmetic:

> run 1: "$4.29 per share, or about **$430** on a full position"
> run 2: "$4.29 per share, or about **$214** on a standard position"
> run 3: "$4.29 per share, or about **$215** on a full-size position"

A full position for this owner is $1,000, which at $47.33 is 21 shares — **$90 of risk**.
There is no reading on which $430, $214 or $215 is right. It did the same on SLB: *"that
would cost you $267 on a full-sized position"* (the real figure is $46).

Sonnet never once quoted a dollar risk without first stating the share count it came from.

### c) It told the owner a position three times over his limit was inside his limit

The sizing question — "if I took this at the trigger with the engine stop, how many shares
and how much would I be risking?" — was answered correctly by Sonnet all three times, with
identical arithmetic: 19 shares, $955 committed, $93.86 at risk.

Haiku got it right once. The other two:

- **Run 2** sized off the *daily loss cap* instead of the position limit — $300 ÷ $4.94 = 60
  shares — then wrote:
  > *"Position cost: 60 × $50.27 = **$3,016.20** — well under your $1,000 position limit"*

  That is a breach of the risk policy, stated as compliance with it. It is the single worst
  line in the whole test.
- **Run 3** invented *"You'd have **$906** of your position limit remaining after entry —
  room to add if the setup develops."* The real figure is $45. It appears to have subtracted
  the risk from the limit. It also called the reward-to-risk "about 2.8 to 1" when it is
  exactly 3.0.

Haiku got a reward-to-risk sum wrong twice in total (also calling SLB's 2-to-1 "about 1.5 to
1"). Sonnet got it right every time.

### d) It tells you the wrong time

The prompt hands over `2026-09-05T18:52:26.470Z` — a UTC timestamp. Haiku converts it to
"6:52 PM" and labels it ET, or PM UTC, or just PM. In New York it was **2:52 PM**. It did
this in roughly twelve of sixty answers, and once quoted the raw
`2026-09-05T18:51:49.373Z` at the owner verbatim. Sonnet mostly avoided naming a clock time
at all and said "as of 2026-09-05".

This is half the app's fault — the market line is a bare UTC string with no zone guidance,
and the owner's profile says `America/New_York`. Sonnet works around it; Haiku does not.

### e) Small stuff, for completeness

Haiku narrates before it looks something up — *"I'll look up the current price for SPY."* —
and that preamble streams to the user and then runs straight into the answer with no space:
*"…for SPY.The market is closed…"*. Cosmetic, but it is in most of its answers.

It also misread level relationships twice, saying SPY closed "below both moving averages and
below the vwap" when it closed above all three averages.

---

## 3. WHAT EACH ONE HOLDS AND WHAT IT COSTS

### The rules, over three runs each

| Rule | Sonnet 5 | Haiku 4.5 |
|---|---|---|
| Never says a price it was not given | 3/3 on every bait question | 3/3 on every bait question |
| Labels a closed-market price as stale | 3/3 on all five price questions | 3/3 on all five price questions |
| No entry/stop/target on an ungraded symbol | 3/3 | 3/3 |
| Says plainly when it does not know | 3/3 | 3/3 |
| Marks the chart on an ungraded symbol | 3/3 | 3/3 |
| Marks the chart on a graded symbol | 9/9 | 3/9 |
| Answer actually reaches the user | 60/60 | 55/60 |
| Risk limits stated correctly ($300 / 10% / 5 / 1.5) | 3/3 | 3/3 |
| Account stated correctly ($10,000, paper) | 3/3 | 3/3 |
| Position sizing correct | 3/3 | 1/3 |
| Remembers the previous turn | 3/3 | 3/3 |

### Does Haiku actually cache? Two of the three markers never fire — and it does not matter

**Both arms of this test ran with the caching already committed** — the same three marked
system blocks plus the marked conversation tail. So every dollar figure below is *Sonnet with
caching against Haiku with caching*, measured, not two per-token rates multiplied out.

The worry was real and is confirmed: **the shortest prefix a model will cache is 1,024 tokens
on Sonnet 5 and 4,096 on Haiku 4.5**, and a marker under that minimum creates nothing
silently. Measured in each model's own tokens:

| Marker | Sonnet 5 (min 1,024) | Haiku 4.5 (min 4,096) |
|---|---|---|
| after "who Kai is" | 3,425 — **caches** | 2,842 — **never caches** |
| after "how he may act" (no chart) | 4,433 — **caches** | 3,607 — **never caches** |
| after "how he may act" (chart open) | 7,384 — caches | 5,810 — caches |
| after "the facts" (no chart) | 6,295 — caches | 5,048 — caches |

So on Haiku, **two of the three breakpoints do nothing on a no-chart question and one does
nothing on a chart question.** But caching is a *prefix* match, so the last marker still
covers everything in front of it. What is lost is granularity, not caching. Running the same
request three times — cold, again, then with the setups changed as if the scanner had
published:

| | Sonnet 5 | Haiku 4.5 |
|---|---|---|
| Settled: read from cache | 6,220 of 6,304 (**98.7%**) | 4,724 of 5,053 (**93.5%**) |
| Settled: never cached, paid every time | 84 | 329 |
| After the setups change: read from cache | 4,358 (blocks 1 and 2 survive) | **0** |
| After the setups change: rewritten | 1,862 (just the facts) | **4,723 (the whole prompt)** |
| Extra cost of that one call | $0.0043 | $0.0054 |

That is exactly the erosion that was predicted, and on that one call Haiku costs **more** than
Sonnet. Its size: setups publish a few times a day, so a heavy user pays it on maybe three
messages out of fifty. **About ten cents per user per month.** It does not move the verdict.

Across all 60 questions per model, the same picture: Haiku served **89.9%** of its prompt from
cache against Sonnet's **94.7%**, and the share never cached at all was 0.05% against 0.03%.
Haiku's saving survives the coarser caching because two other things run the other way — its
tokenizer is more compact on the same text (6,133 tokens against 7,724 for the identical
prompt) and its answers are shorter (251 output tokens against 391.)

**But there is a cliff, and it is close.** The four tool definitions are worth about 1,250
tokens and are rendered *before* the system prompt. They are the only reason a no-chart
question clears Haiku's 4,096 minimum at all: 5,053 with them, **3,807 without.** Measured
directly:

> **A call with no tools caches nothing whatsoever on Haiku.** 3,807 uncached input tokens on
> the first call, on the second, and on the third — no cache entry ever created, no error, the
> answers all fine. Sonnet cached 4,974 of 4,988 on the same calls.

That is 957 tokens of headroom on the chat path. Trim a tool, or the sheet block, or the
voice block, and Haiku's chat prompt silently stops caching and the bill roughly doubles with
nothing on screen to say so.

### Passes and money

Both models take almost exactly the same number of round trips. **This was the main cost
risk and it did not materialise.**

| | Sonnet 5 | Haiku 4.5 |
|---|---|---|
| Model calls per question | 1.52 | 1.55 |
| Extra lookup passes per question | 0.52 | 0.55 |
| Fresh input tokens | 3 | 6 |
| Read back from cache | 11,298 | 8,897 |
| Written to cache | 1,291 | 1,338 |
| Output tokens | 391 | 251 |
| Seconds per question | 7.3 | 6.3 |
| **Cost per message, cache working** | **$0.00940** | **$0.00382** |
| **Cost per message, no cache** | $0.02909 | $0.01150 |

**Heavy user, 50 messages a day, 30 days:**

| | With the prompt cache | Without it |
|---|---|---|
| Sonnet 5 | **$14.10** | $43.64 |
| Haiku 4.5 | **$5.74** | $17.25 |

Haiku is 59% cheaper. **The saving is $8.36 per heavy user per month.**

Three things to put next to that number:

1. **The caching that just landed saves more than the model switch does.** It takes Sonnet
   from $43.64 a month to $14.10 — a $29.54 saving, three and a half times bigger than
   anything Haiku offers on top. That work is free of risk; this is not.
2. The saving is real *after* accounting for Haiku's coarser caching, because both arms were
   measured with caching on. See the section above: two of three breakpoints never fire on
   Haiku, which costs about ten cents a user a month, and its more compact tokenizer more
   than pays that back.
3. These figures cover the answering model only. The separate call that decides which levels
   get drawn on the chart also reads `KAI_MODEL`, and it was held at Sonnet for both arms so
   the comparison isolated one variable. It cost $0.19 across 30 chart answers — about
   $0.006 each. Switching `KAI_MODEL` would move that call to Haiku too, and **that was not
   tested.** Given that it has to emit clean JSON, and JSON discipline is exactly where
   Haiku failed, it should not be assumed to work.

### Checked against the real ledger

`kai_model_usage` now records every call. It has no Haiku rows — production runs Sonnet — so
it cannot speak to half of this test, but it does corroborate the Sonnet baseline. Its eight
hosted chat calls: **2 uncached tokens, 7,067 read from cache**, against my measured 2-3
uncached and 7,318 read. Within 4%. Model calls per question, 1.60 there against 1.52 here.
The two measurements agree.

### What this test cost

About **$1.00** of credit: $0.56 on the Sonnet arm, $0.23 on the Haiku arm, $0.19 on the
chart director, plus a few cents of probes. 120 answers, 186 model calls.

---

## 4. WHAT TO DO INSTEAD

1. **Leave `KAI_MODEL` on `claude-sonnet-5`.** The $8 a month is not worth a blank screen on
   a quarter of chart questions and a position-size figure that breaks the risk policy while
   claiming to obey it.
2. **Fix the `effort` parameter anyway**, whether or not anyone switches. Right now a
   one-word environment change silently kills the whole product. Making it conditional on
   the model is two lines and removes a live foot-gun.
3. **The real saving already landed.** The prompt caching cut the bill by 68% on Sonnet.
   That is the win here; take it and stop.
4. **Do NOT move the background calls to Haiku either.** I suggested this before measuring
   the caching, and the measurement killed it. The briefing job, the chart director and the
   missed-command classifier all call `completeOnce`, which sends **no tools** — and without
   the tool definitions in front of it the prompt is 3,807 tokens, under Haiku's 4,096
   minimum, so **it caches nothing at all, ever.** Sonnet caches those same calls in full.
   Moving them to Haiku would halve the rate and throw away the whole cache discount on
   them. That is the opposite of the intended trade.
5. **Watch the 957 tokens of headroom.** The chat prompt only clears Haiku's minimum because
   the tool definitions are counted. This matters even if nobody switches models: it is the
   kind of cliff that gets discovered in a bill three months later, and it argues for putting
   a line in the usage reading that flags any model call where `cache_read_input_tokens` is
   zero on a prompt that should have been warm.
6. **Worth fixing regardless of model:** the market line hands Kai a bare UTC timestamp with
   no timezone, while the profile says New York. Sonnet copes; a cheaper model does not.

---

## How this was measured

Scripts are in `apps/api/scripts/haiku-*.mts`. Nothing under `apps/api/src` was touched.

- `haiku-questions.mts` — the fixed set of 18 questions
- `haiku-run.mts` — rebuilds the chat route's exact request (same three cached system
  blocks, same four tools, same 4-turn tool loop) and runs it against a named model
- `haiku-verify.mts` — rebuilds the numbers the model was shown and flags every number in
  its answer that is not among them
- `haiku-summarise.mts` — costs, using the app's own price table so this report and the
  app's usage rows cannot disagree
- `haiku-polygon-crosscheck.mts` — checks the app's own tools against Polygon directly
- `haiku-transcripts.mts` — writes the transcript file
- `haiku-effort-probe.mts` — the two-model, two-setting probe that found the 400
- `haiku-cache-probe.mts` — where each marker falls against each model's minimum
- `haiku-cache-erosion.mts` — cold / warm / setups-changed, with and without tools
- `haiku-ledger.mts` — reads `kai_model_usage`, local and hosted

**Every run in this report is a clean run.** Another lane restarted the dev server on port
3011 partway through, which is the usual source of unexplained sign-in failures here. It
could not have touched this: none of these scripts goes over HTTP, none signs in, none uses
port 3011 — they run in-process against local Supabase with the service key. Across both
arms: 186 model calls, **0 errors, 0 calls with missing usage data, 0 reruns.**

**Both arms got a byte-identical prompt.** Another lane was committing to
`apps/api/src/lib/kai` while this ran, so the prompt each question was given was recorded and
compared afterwards: all 18 questions, all 6 runs, the same length every time (13,691
characters plus the four tool definitions). Nothing shifted under the test.

Three deliberate departures from production, all stated so the numbers can be read honestly:

- The `effort` parameter is sent for Sonnet and omitted for Haiku, because Haiku rejects it.
- The chart director was held at Sonnet in both arms, so the only thing that differed
  between the two columns was the model that answers and calls the tools.
- **Every question started a fresh conversation.** A real conversation carries up to twenty
  previous turns, so a single call here reads about 6,200 tokens where production reads
  11,000-14,000. The dollar figures above are therefore a **floor**, not a ceiling — the real
  bill is higher for both models. The ratio between them is unaffected, which is what the
  decision rests on.

The market was closed (Saturday afternoon), so every price in this test is a last close and
every answer had to be labelled stale. The live-market wording was not exercised.
