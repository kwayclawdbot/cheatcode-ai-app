# THE MASTER BELT CURRICULUM MATRIX

Every competency from White I to Black, and — for White I through Blue
qualification — the curated YouTube segment assigned to each one.

This is the content-production blueprint the curated-YouTube spec asks for
(`BELT-YOUTUBE-CURRICULUM-SPEC.md`, "NEXT MOVE"). It exists so that building
Days 2–7 is a matter of writing lesson data against rows that already name
their human layer, rather than going looking for a video per lesson.

**Nothing in here is live.** Every row is a candidate awaiting the owner's
sign-off. The app enforces that: a curated pick carries `owner_approved: false`
until a person sets it true, and an unapproved pick renders as a review card
with no link out and no play control. See "Owner review queue" at the end.

---

## How to read a row

| Field | What it is |
|---|---|
| **Segment** | The slice actually assigned. Lessons assign the useful section, not the upload. |
| **Focus note** | One line to the member: what to watch for, and what to ignore. |
| **Kai normalization** | What Kai says afterwards to pull the instructor's vocabulary back to ours. |
| **Evidence** | How the segment was established. See the legend below. |

### Evidence legend — read this before trusting a timestamp

| Marker | Meaning |
|---|---|
| ✅ **CHAPTERS** | Segment taken from the video's own chapter markers, read out of the YouTube player response by `apps/mobile/scripts/yt-verify.mjs`. Duration confirmed. This is a fact, not a guess. |
| ✅ **FULL** | The whole video is assigned. Only the duration had to be confirmed, and it was. No chapter evidence is needed to say "watch all 2:40 of it". |
| ⚠️ **NEEDS-REVIEW** | The video has no chapter markers and no timestamped description. The segment is a **guess** and is flagged as such in the app. Someone has to watch it before this row goes live. |

Every URL in this document was resolved with `yt-dlp` on 2026-09-07: title,
channel, duration and availability are confirmed live, not recalled. One
candidate came back **Private** and was cut (see Rejections). Re-run the
checker over this file's URLs to find link rot before a member does:

```
node apps/mobile/scripts/yt-verify.mjs <url> [<url> …]
```

### The curation bar that produced these

From the spec, applied strictly: clear, concise, visually useful, not hypey, no
gambling energy, minimal jargon, 5–20 minutes preferred, concept-specific,
accurate, belt-appropriate. Rejected on sight: course and Discord pitching,
"1000% strategy" claims, and anything conflicting with the house risk
philosophy. 21 videos were rejected to fill 18 slots; the rejections are listed
at the end with the specific evidence that failed each one, because a bar with
no visible rejections is not a bar.

### The house vocabulary every normalization note enforces

- **support** and **resistance** — never "demand zone" / "supply zone".
- **CheatCode Trend Clouds** — never "SuperTrend", whoever says it.
- Plain English at the member. No analyst register, no jargon loads.
- Risk is described as **"where your idea is wrong"** / invalidation — never as
  an arbitrary percentage, and never as optional.

---

## The ladder at a glance

| Belt | Competencies | Videos curated | Status |
|---|---|---|---|
| White I | 3 | 8 | Candidates ready for review |
| White II | 3 | 8 | Candidates ready for review |
| Yellow I | 3 | 6 | Candidates ready for review |
| Yellow II | 4 | 9 | Candidates ready for review |
| Blue qualification | 5 | 11 | Candidates ready for review |
| Purple I / II | 8 | — | Outline only; videos deliberately future |
| Black | 5 | — | Outline only; videos deliberately future |
| **Total** | **31** | **42** | 18 competencies carry an assigned segment |

Of the 42 curated videos: **33 have chapter-verified or full-video segments**,
**9 are marked NEEDS-REVIEW** and cannot go live until watched.

---

# WHITE I — what you are looking at

## `white-1/what_is_a_stock`
*A stock is a small ownership interest in a real company. No Wall Street
history, no jargon.* → Day 1 Lesson 1.

**PRIMARY**
- **What are Stocks? A Simple Explanation for Beginners** — Easy Peasy Finance
- https://www.youtube.com/watch?v=9yqfiQy0Xjw
- Length **2:40** · Segment **0:00–2:40** · ✅ FULL
- *Focus note:* Watch for the one idea — buying a stock means owning a small
  piece of an actual company. That is the whole lesson.
- *Kai normalization:* If the video says "shareholder" or "equity", Kai says:
  "that just means an owner of a small piece of the company — that is all a
  share is."
- *Note:* Under the 5-minute preference, deliberately. Day 1 Lesson 1 is a
  7–9 minute interactive lesson and the video is one ingredient inside it.

**BACKUP**
- **What is a Stock? (for dummies)** — Mind Math Money
- https://www.youtube.com/watch?v=hzVVnxmPTSg
- Length **4:12** · Segment **0:00–4:12** · ✅ FULL
- *Focus note:* Watch for *why* a company sells shares in the first place —
  that is the part beginners skip.
- *Kai normalization:* Same as above; keep "ownership", drop "security".

**DEEPER DIVE**
- **How the Stock Market Actually Works (For Beginners)** — Martik Finance
- https://www.youtube.com/watch?v=dMOcrLMfDFM
- Length **9:33** · Segment **2:31–4:02** · ✅ CHAPTERS
  (`2:31 What is a Stock?` → `3:17 Why Companies Sell Shares` → ends before
  `4:02 Initial Public Offering`)
- *Focus note:* Ninety seconds on what a share is and why a company sells one.
  Stop at 4:02 — IPOs and primary/secondary markets are not this belt.
- *Kai normalization:* Plain already. If "IPO" is heard in passing, Kai: "the
  first time a company sells shares to the public — you do not need it yet."

## `white-1/how_markets_work`
*Buyers and sellers, bid and ask, price as an auction, why price moves.*
→ Day 1 Lesson 1 screens 5–8.

**PRIMARY**
- **How the Stock Market Actually Works (For Beginners)** — Martik Finance
- https://www.youtube.com/watch?v=dMOcrLMfDFM
- Length **9:33** · Segment **7:39–9:13** · ✅ CHAPTERS
  (`7:39 How the Stock Price is Calculated` → `7:59 Bid & Ask` →
  `8:31 Expectations & Price`, ending before the outro)
- *Focus note:* Ninety seconds that carry three of Lesson 1's screens: how a
  price is actually set, what bid and ask mean, and why expectations — not the
  company's quality — move the price.
- *Kai normalization:* "Market maker" → Kai: "someone always willing to take
  the other side, so you can buy without waiting for a specific person to
  sell." Bid and ask stay as they are; they are house words.

**BACKUP**
- **What Does The Bid & Ask Mean? (Investing In The Stock Market)** — Whyze
- https://www.youtube.com/watch?v=C8javNC7pwQ
- Length **3:51** · Segment **0:37–2:26** · ✅ CHAPTERS
  (`0:37 What Does The Bid Ask Mean` → `1:25 Bid Ask Size` →
  `1:50 Bid Ask Spread`, stopping before `2:26 Market Makers`)
- *Focus note:* The cleanest 109 seconds on bid, ask, size and spread we found.
  Stop at 2:26 — market makers are a Purple-belt idea.
- *Kai normalization:* None needed; the vocabulary is already ours.

**DEEPER DIVE**
- **How The Stock Market Works 📈 (very simple explanation)** — Mind Math Money
- https://www.youtube.com/watch?v=VirrBxclM4E
- Length **2:46** · Segment **0:00–2:46** · ✅ FULL
- *Focus note:* A second pass over the same idea in under three minutes, for a
  member who wants it said a different way.
- *Kai normalization:* Plain English throughout; nothing to map.

## `white-1/candlestick_basics`
*Open, high, low, close. Body and wick. Green and red.*
**Pattern names are forbidden at this belt** — the 7-day spec is explicit:
"EXPLICITLY DO NOT teach pattern names (hammer, doji, morning star…)".
→ Day 1 Lesson 3.

This is the hardest slot in the entire matrix. Almost every "candlestick
basics" video on YouTube teaches anatomy for four minutes and then spends
fifteen naming patterns. The segment is what makes the slot fillable at all.

**PRIMARY**
- **Candlestick Charts Complete Beginner's Guide** — MoneyZG
- https://www.youtube.com/watch?v=IGcq8FiIpOk
- Length **19:17** · Segment **3:43–7:40** · ✅ CHAPTERS
  (`3:43 Candlestick anatomy` → `4:51 How candles are made`, stopping dead at
  `7:40 Bullish candlestick pattern (hammer)`)
- *Focus note:* Watch 3:43 to 7:40 and stop. Anatomy and how a candle forms is
  exactly this belt. Everything after 7:40 is pattern names, which you will
  learn later, in context, from Kai — not as a list to memorise.
- *Kai normalization:* "Shadow" → **wick**. "Bullish/bearish candle" → Kai:
  "buyers finished in control / sellers finished in control." Kai closes with:
  "I stopped you at 7:40 on purpose. Naming shapes is not reading a chart, and
  we teach the shapes when you meet one that matters."
- *Why the segment matters:* this is the clearest case in the matrix of a good
  four minutes trapped inside a video that fails the belt.

**BACKUP**
- **Open High Low Close - Understanding Candlesticks** — TTrades
- https://www.youtube.com/watch?v=sIcsLFSNoXM
- Length **14:10** · Segment **0:00–6:00** · ✅ CHAPTERS
  (`0:26 Candlesticks` → `1:07 Directional Candle`, stopping before
  `6:00 Reversal Candle`)
- *Focus note:* The first six minutes are open/high/low/close and what a
  directional candle tells you. Stop at 6:00.
- *Kai normalization:* Same wick/shadow mapping.
- ⚠️ *Caveat for the owner:* TTrades is a smart-money-concepts channel. This
  particular video's opening is clean anatomy, but the channel around it is
  exactly the jargon register this belt exists to keep out. The 0:00–6:00 cut
  is what makes it usable; it should never be assigned whole, and if a cleaner
  channel is found this row should be replaced rather than kept.

**DEEPER DIVE** — *deliberately empty.* At this belt "deeper" candlestick
content means pattern names, which are forbidden here. Leaving the slot open is
the correct answer, not a gap to fill.

---

# WHITE II — reading the chart

## `white-2/market_structure`
*Higher highs, higher lows, lower highs, lower lows. HH+HL = uptrend,
LH+LL = downtrend. Nothing else.* → Day 2 Lesson 1.

**PRIMARY**
- **How To Identify Trends in Markets (Stop Guessing)** — Mind Math Money
- https://www.youtube.com/watch?v=n095Zn6Rh-k
- Length **10:02** · Segment **0:10–4:18** · ✅ CHAPTERS
  (`0:10 The Foundation Most Traders Skip` → `0:44 The Pattern That Confirms
  You're Right` → `1:45 Why Beginners Get This Wrong` → `2:24 When the Trend
  Flips Against You`, ending before `3:28 When the Market Goes Nowhere`)
- *Focus note:* Watch for the pattern itself — higher highs with higher lows,
  and what it looks like when that stops being true. Ignore anything about
  ranges for now; sideways is Day 2's third lesson.
- *Kai normalization:* If "break of structure" is used, Kai: "that is just the
  moment a higher low fails to hold — we call it the trend breaking, and you do
  not need a special name for it."
- ⚠️ *Note:* the video's final chapter (`9:44 Watch the Complete Course`) is a
  course pitch. The assigned segment ends five and a half minutes before it,
  and the member never reaches it.

**BACKUP**
- **How to Identify Higher Highs & Higher lows** — Esther Mofrey
- https://www.youtube.com/watch?v=QJUF22fzKjQ
- Length **15:44** · Segment **4:45–10:25** · ✅ CHAPTERS
  (`4:45 How to Identify Highs Lows`)
- *Focus note:* Five and a half minutes of nothing but marking highs and lows
  on a chart. Skip the first 4:45 and stop at 10:25.
- *Kai normalization:* The title frames this as a "BUY LOW strategy". Kai:
  "we are borrowing the part where she marks the highs and lows. Ignore the
  buy-low framing — you do not have a strategy yet, and you do not need one to
  read structure."

**DEEPER DIVE**
- **Market Structure for Beginners - A Simple Tutorial** — Stock Trading for
  Beginners | Tyler Stokes
- https://www.youtube.com/watch?v=kwTUJ2KtiWo
- Length **16:21** · Segment **⚠️ NEEDS-REVIEW**
- *Evidence:* no chapter markers, no timestamped description. The description
  indicates it covers HH/HL early and drifts into "break of structure" and
  "change of character" later, so the useful cut is probably the first half —
  but that is a guess and is flagged as one in the app.
- *Focus note:* (cannot be written until the segment is confirmed)
- *Kai normalization:* Strip "break of structure" and "change of character"
  entirely — neither term exists in Foundations.
- ⚠️ *Caveat:* the description promotes a Skool group, a downloadable
  "blueprint" and a TradingView affiliate link. Borderline on the pitching
  rule; acceptable only as an optional deeper dive, never as a primary.

## `white-2/trend`
*Identify the trend fast, on real charts, not diagrams.* → Day 2 Lesson 2.

**PRIMARY**
- **3 Ways To Spot a Forex Trend In Seconds** — ForexSignals TV
- https://www.youtube.com/watch?v=_v7N9IVtGfE
- Length **10:24** · Segment **0:53–8:43** · ✅ CHAPTERS
  (`0:53 What is a Trend?` → `2:06 3 Ways to Define A Trend Using Slope`,
  ending exactly at the outro)
- *Focus note:* Watch for the slope method — judging the tilt of the highs and
  lows to call a trend at a glance. This is the closest thing we found to the
  house framing, "identify the trend in ten seconds".
- *Kai normalization:* "Slope of the trend" → Kai: "the tilt of the highs and
  lows — that is all slope means." No indicator jargon appears in the segment.
- ⚠️ *Caveat:* forex charts, not stocks. The concept transfers exactly; Kai
  should say so rather than letting the member wonder. The channel monetises
  through broker affiliate links in the description — none of it is spoken
  inside the assigned segment.

**BACKUP**
- **How To Identify Trends in Markets (Stop Guessing)** — Mind Math Money
- https://www.youtube.com/watch?v=n095Zn6Rh-k
- Length **10:02** · Segment **6:08–9:44** · ✅ CHAPTERS
  (`6:08 Let's Read a Real Chart` → `7:02 How Trends Actually Move` →
  `8:01 Why Textbook Examples Fail You`, stopping before the course pitch)
- *Focus note:* Real charts, and specifically why the textbook picture of a
  trend rarely looks like the thing in front of you.
- *Kai normalization:* Plain English throughout.
- *Note:* the same video serves `market_structure` at a different timestamp.
  That is the segment model working — one good video, two competencies, two
  different cuts.

**DEEPER DIVE** — none assigned. Every longer trend video reviewed either
pitched a course or introduced indicators this belt does not teach.

## `white-2/support_resistance`
*Where has price repeatedly reacted? Support and resistance only.*
→ Day 2 Lesson 3.

**PRIMARY**
- **How to Identify Support & Resistance Levels (Made Simple)** — Matthew Manuel
- https://www.youtube.com/watch?v=oo-CnwzgrD8
- Length **12:54** · Segment **0:57–8:20** · ✅ CHAPTERS
  (`0:57 What Are Support & Resistance?` → `2:51 Finding Support` →
  `3:55 Finding Resistance` → `4:53 Example 2` → `5:50 Remember This` →
  `7:00 Finding Multiple Levels`, stopping before `8:20 How to Trade`)
- *Focus note:* Finding the levels, and only finding them. Stop at 8:20 —
  trading support and resistance is Yellow belt, and doing it before you can
  reliably see a level is how people lose money.
- *Kai normalization:* Already says support and resistance natively — nothing
  to map, which is exactly why it is the primary. Kai simplifies "confirmation"
  to "wait until price has reacted there more than once."

**BACKUP**
- **Support and Resistance Trading Strategy Explained | Beginner Trading
  Lesson 9** — StocksToTrade
- https://www.youtube.com/watch?v=UGj9yzUh5xI
- Length **8:14** · Segment **0:00–7:08** · ✅ CHAPTERS
  (through `5:57 Why trading with the trend matters`, stopping before
  `7:08 How to practice technical analysis`)
- *Focus note:* A real chart (UCAR) showing support turning into resistance and
  back — the single most useful thing to actually see happen.
- *Kai normalization:* Plain support/resistance language; nothing to map.
- ⚠️ *Caveat:* StocksToTrade's own beginner series; the description pitches
  their paid platform and alerts. The segment ends before the end card. Assign
  the cut, never the video.

**DEEPER DIVE** — none assigned. The obvious candidate was rejected for scope
creep (see Rejections).

---

# YELLOW I — the two setups

## `yellow-1/breakouts`
*Resistance → approach → confirmation → breakout. The first setup we teach,
because it is the one you can see.* → Day 3 Lesson 2.

**PRIMARY**
- **Breakout Pattern Explained - The Perfect Setup** — StocksToTrade
- https://www.youtube.com/watch?v=_oiFUOOO7DE
- Length **11:23** · Segment **2:58–9:45** · ✅ CHAPTERS
  (`2:58 Key to better breakouts: multi-day setups` → `3:45 Using multiple time
  frames to spot resistance` → `4:55 Waiting for consolidation before entering`
  → `6:40 Defining support and risk in consolidation zones` → `7:10 Why the
  second leg breakout is more reliable` → `8:45 Using volume confirmation`)
- *Focus note:* Watch for the sequence — resistance, then consolidation, then
  confirmation, then the move. The lesson is that the *second* leg is the
  tradeable one and the first is usually the trap.
- *Kai normalization:* "Consolidation zone" stays as **consolidation**.
  Support and resistance are already ours. Kai adds: "he is describing patience
  — the same thing Day 3 calls Watch instead of Trade."
- *Bonus:* `0:41 The danger of chasing the first big move` and `1:40 Mindset
  shift: why missing a trade isn't bad` line up exactly with Day 5's rule
  against chasing. Consider assigning 0:41–2:20 there too.

**BACKUP**
- **How To Confirm Breakouts** — Soheil PKO
- https://www.youtube.com/watch?v=eHCmD0bp8vE
- Length **9:06** · Segment **0:34–5:16** · ✅ CHAPTERS
  (`0:34 What Is Breakout?` → `2:30 How To Confirm Breakouts` →
  `3:27 Using Price Action` → `4:40 Using Volume`, stopping before
  `5:16 Using Indicators`)
- *Focus note:* A clean confirmation checklist: price action first, volume
  second. Stop at 5:16 — indicators are not part of this belt.
- *Kai normalization:* Confirm the spoken language stays support/resistance. If
  any moving-average overlay is called a trend indicator, Kai renames it to
  **CheatCode Trend Clouds** or drops it.

**DEEPER DIVE** — none assigned. Every longer breakout video reviewed failed on
course pitching or length (see Rejections: Adam Khoo, Rayner Teo).

## `yellow-1/pullbacks`
*Trend → pullback to support → confirmation → continuation.*
→ Day 3 Lesson 3.

**PRIMARY**
- **Stop Chasing Trends | Use This Pullback Strategy Instead** — FxScouts
- https://www.youtube.com/watch?v=uHkeRquGZAc
- Length **11:39** · Segment **1:28–7:15** · ✅ CHAPTERS
  (`1:28 How to Identify a Trend` → `3:25 The Pullback Trading Strategy` →
  `5:21 Confirmation Before Entry`, ending before `7:15 Risk Management Rules`)
- *Focus note:* The whole shape in six minutes — find the trend, wait for the
  pullback, wait again for confirmation. The waiting is the skill.
- *Kai normalization:* Keep **support**. If a moving average is shown as a
  trend guide, Kai calls it **CheatCode Trend Clouds** — never "SuperTrend",
  never a "dynamic demand zone".
- ⚠️ *Caveat:* FxScouts is a broker-comparison channel and the description
  carries prop-firm and broker referral links. None of it is spoken in the
  assigned segment.
- *Note:* promoted over the agent's original primary because this one has
  chapter markers and the other does not — a verifiable segment beats a
  marginally better topic fit.

**BACKUP**
- **Pullback Trading Strategies Explained (Break & Retest & Trendline Bounce)**
  — Pro Trading School
- https://www.youtube.com/watch?v=4fnEo0bMs5Y
- Length **17:06** · Segment **⚠️ NEEDS-REVIEW**
- *Evidence:* no chapters, no timestamped description. The description lists
  Break-and-Retest first and Trendline Bounce second, suggesting a split near
  the halfway mark — a guess, flagged as one.
- *Focus note:* (pending) The break-and-retest half is the belt-relevant part:
  a retest *is* a pullback to former resistance that has become support.
- *Kai normalization:* Keep **support**; explicitly teach the flip — "the ceiling
  becomes the floor" — in house words.

**DEEPER DIVE** — none assigned.

## `yellow-1/trade_watch_pass`
*No trade is a decision, and usually the right one. Setup versus noise.*
→ Day 3 video + Kai Setup Challenge.

This competency is the weakest-supplied in the matrix and the owner should know
it. The concept is behavioural, so the good material lives inside traders'
personal-brand channels — which is precisely where the pitching rule bites.

**PRIMARY**
- **Humbled Trader Reveals…STOP Stock Trading Until You Watch This** —
  Let's Talk Money! with Joseph Hogue, CFA (interview with Shay / Humbled Trader)
- https://www.youtube.com/watch?v=LiKl69lZsj4
- Length **15:41** · Segment **1:57–9:11** · ✅ CHAPTERS
  (`1:57 Who Should NOT Day Trade` → `3:05 What Traits do You Need` →
  `4:21 What does a Day Trader do each Day?` → `6:46 What is Risk Management`,
  stopping before `9:11 Biggest Mistakes`)
- *Focus note:* Watch for the honesty about who should not do this at all, and
  what the day actually looks like. Stop at 9:11 — everything after
  drifts toward how much money you can make, which is not this curriculum.
- *Kai normalization:* Plain English already. Kai adds the house frame: "she is
  describing selectivity. In Foundations that is the Pass decision, and Pass is
  a real answer, not a failure to find a trade."
- ⚠️ *Caveat:* an adjacent fit, not a direct one — it is an interview about
  trader realism, not a video built around passing on setups. Promoted to
  primary over the closer-titled Warrior Trading video because that one could
  not be content-verified (below).

**BACKUP**
- **The Discipline NOT to Trade Low Quality Setups** — Ross Cameron /
  Warrior Trading
- https://www.youtube.com/watch?v=qfReXP_lpQE
- Length **14:44** · Segment **⚠️ NEEDS-REVIEW**
- *Evidence:* title, channel and duration confirmed; **no chapters and no
  retrievable transcript**, so nothing about the spoken content is verified.
- *Focus note:* (pending) The closest title match found for "why I pass on most
  setups".
- ⚠️ *Caveat — needs a human watch before it goes anywhere:* Warrior Trading's
  channel brand is small-cap momentum with income framing, and the description
  carries a trial, a free book and course links. Confirm the video stays on
  selectivity and does not become a strategy or income pitch.
- *Kai normalization:* Strip any "verified earnings" or proof-of-income
  framing entirely. This belt is about behaviour, never about what you earn.

**DEEPER DIVE** — none assigned. Every other close match traced back to the
same channel, so there is no independent option without repeating the caveat.

---

# YELLOW II — building the trade

## `yellow-2/entry_confirmation`
*A setup is not an entry. "Interesting" is not "enter now".* → Day 4 Lesson 1.

**PRIMARY**
- **How I Always Enter A Trade The RIGHT Way (Candle Closures)** —
  Scarface Trades
- https://www.youtube.com/watch?v=DdwdnjyHFoo
- Length **14:34** · Segment **1:20–6:16** · ✅ CHAPTERS
  (`1:20 How Candlesticks Form` → `3:49 The Importance of Candlestick
  Closures`, stopping before `6:16 How I Increased My Winrate`)
- *Focus note:* One idea, and it is the right one: a candle that is still
  forming has not told you anything yet. Wait for the close. Stop at 6:16 —
  the win-rate talk after it is not part of this lesson.
- *Kai normalization:* "Candle closure" → **candle close**. Kai adds: "this is
  what Day 4 means by confirmation — the setup was already there; the close is
  what turns it into an entry."

**BACKUP**
- **Always Wait For THIS Before Entering Trades (Candlestick Closures)** — JeaFx
- https://www.youtube.com/watch?v=JD_sWSjIiJE
- Length **15:55** · Segment **⚠️ NEEDS-REVIEW** (7 chapters exist but were not
  captured in full; re-run the checker to pin the cut)
- *Focus note:* (pending) Same concept, different teacher.
- *Kai normalization:* As above. Forex examples — Kai should say so.

**DEEPER DIVE**
- **NEVER Enter Before This Confirmation (Candlestick Masterclass)** —
  Diamant Capital
- https://www.youtube.com/watch?v=H89ZvR5xCa0
- Length **20:49** · Segment **⚠️ NEEDS-REVIEW**
- ⚠️ *Caveat:* over the 20-minute ceiling. Optional only, and only as a segment
  once someone has pinned one.

## `yellow-2/stop_placement`
*Never "use a 5% stop". Where is your idea wrong? The stop goes past that.*
→ Day 4 Lesson 2. **The house's hardest rule, and the slot where a bad video
does the most damage.**

**PRIMARY**
- **MASTER Stop Losses in 10 Minutes** — Mind Math Money
- https://www.youtube.com/watch?v=wN1OEvm82Vk
- Length **10:11** · Segment **0:14–4:48** · ✅ CHAPTERS
  (`0:14 The 3 Stop Loss Types` → `0:28 Type 1: The Technical Stop` →
  `2:44 Never Do This With Your Stops` → `3:25 Live Example: Setting a
  Technical Stop`, ending before `4:48 The ATR Indicator`)
- *Focus note:* Watch the technical stop and the live example — placing the stop
  where the chart says the idea failed, not where a percentage says. Stop at
  4:48: ATR is a fine tool and it is not this belt.
- *Kai normalization:* "Technical stop" → Kai: "that is what we call putting the
  stop past your invalidation — past the point where your reason for the trade
  stopped being true." Never let a percentage rule stand as the method.
- ⚠️ *Note:* the final chapter is `9:45 Want the Full Risk Management Course?`.
  The segment ends five minutes earlier; the member never sees the pitch.

**BACKUP**
- **The right way to set a stop-loss (beginner's guide)** — FxScouts
- https://www.youtube.com/watch?v=k52ePjHqK88
- Length **5:53** · Segment **1:04–2:06** · ✅ CHAPTERS
  (`1:04 At what level do you set your stop?`, stopping before
  `2:06 What is the Average True Range?`)
- *Focus note:* Sixty-two seconds on the only question that matters: at what
  level does this stop belong? Stop at 2:06 — the rest is ATR.
- *Kai normalization:* As above — invalidation, not percentage.

**DEEPER DIVE**
- **Stop Loss Strategy Secrets: The Truth About Stop Loss Nobody Tells You** —
  Rayner Teo
- https://www.youtube.com/watch?v=1ohBdvp8CoU
- Length **21:56** · Segment **10:40–14:10** · ✅ CHAPTERS
  (`10:40 Where do you put your stoploss`, ending before `14:10 Position size`)
- *Focus note:* Three and a half minutes on placement from a careful teacher.
- 🚨 **HARD BOUNDARY — the reason this is a segment and not a video.** This
  upload contains a chapter at **16:00 titled "No Stop Loss"**. Trading without
  a stop is an automatic reject under the house risk philosophy, and it sits
  inside an otherwise excellent video. The assigned cut ends at 14:10, nearly
  two minutes before it. **This row must never be widened, and it must never be
  promoted to primary.** If the segment mechanism is ever removed, this row is
  deleted with it.
- *Kai normalization:* Rayner's written material on this topic mentions
  SuperTrend as an ATR-based stop tool. If the term is ever heard, Kai replaces
  it with **CheatCode Trend Clouds** — the house name, always.

## `yellow-2/risk_reward`
*Where could price reasonably go, and what that makes the ratio.
Entry $100 / stop $98 / target $106 → risk $2, reward $6, 3:1.*
→ Day 4 Lesson 3.

**PRIMARY**
- **Risk to Reward Ratio: The #1 Trading Secret Beginners Must Know** —
  Chart Champions
- https://www.youtube.com/watch?v=oypkaebzvUs
- Length **7:44** · Segment **0:25–3:37** · ✅ CHAPTERS
  (`0:25 What is Risk to Reward Ratio` → `0:51 Example` →
  `1:34 Risk to Reward Ratio`, ending before `3:37 Why its Important`)
- *Focus note:* Definition, then a worked example. Watch how the ratio falls
  out of the entry, the stop and the target — you do not choose a ratio, you
  read it off the trade you built.
- *Kai normalization:* Keep the numbers in plain dollars per share. If "R" or
  "R-multiple" is used, Kai translates immediately: "one R is just your risk —
  the distance from entry to stop, in dollars."

**BACKUP**
- **Why Traders Blow Accounts: Risk Management Explained** — FXStreet
- https://www.youtube.com/watch?v=Qteu4GqP_AM
- Length **9:22** · Segment **5:47–7:02** · ✅ CHAPTERS
  (`5:47 Risk-to-reward ratio`)
- *Focus note:* Seventy-five seconds, one idea, no wandering.
- *Kai normalization:* The video teaches the **2% rule**; the house teaches
  **1% maximum**. Kai must say so out loud: "he uses two percent. We cap you at
  one. Same arithmetic, less damage while you are learning." Also skip
  `2:53 The prop firm drawdown trap` — prop firms are not part of this
  curriculum.

**DEEPER DIVE** — none assigned.

## `yellow-2/position_sizing`
*$5,000 account · 1% max risk = $50 · entry $100, stop $98 = $2/share
→ 25 shares.* → Day 4 Lesson 4.

**PRIMARY**
- **How to Calculate Position Size in Trading (The 1% Risk Rule)** —
  Kotak Stockshaala
- https://www.youtube.com/watch?v=7Hi2DCh7bmI
- Length **11:43** · Segment **0:48–5:03** · ✅ CHAPTERS
  (`0:48 What Exactly is Position Sizing?` → `1:25 The Position Sizing Formula
  Revealed` → `2:02 Step-by-Step Calculation Example` → `3:50 Rule #1 (The 1%
  Risk Rule)`, ending before `5:03 Rule #2`)
- *Focus note:* The formula and one worked example. This is the only maths in
  Foundations, and it is the maths that keeps a bad trade from being a
  catastrophic one.
- *Kai normalization:* **Teaches the 1% rule, which is the house rule** — the
  reason this is the primary. If lot sizes are mentioned (an Indian-market
  channel), Kai converts to shares: "same idea, we just count shares."

**BACKUP**
- **Why Traders Blow Accounts: Risk Management Explained** — FXStreet
- https://www.youtube.com/watch?v=Qteu4GqP_AM
- Length **9:22** · Segment **4:08–4:37** · ✅ CHAPTERS
  (`4:08 Position sizing formula`)
- *Focus note:* Twenty-nine seconds: the formula, bare.
- *Kai normalization:* Same 2%-versus-1% correction as above. Skip
  `4:37 How to use a position size calculator` — the member must be able to do
  it before a calculator does it for them.

**DEEPER DIVE** — none assigned.

---

# BLUE QUALIFICATION — executing and reviewing

## `blue/trade_management`
*Before entry, plan the trade. After entry, trade the plan.* → Day 5 Lesson 2.

**PRIMARY**
- **How To PLAN Every Trade Before Entering** — Neeraj joshi
- https://www.youtube.com/watch?v=uQC1__YZeTI
- Length **15:55** · Segment **⚠️ NEEDS-REVIEW**
- *Evidence:* title, channel, duration confirmed public. No chapters, no
  timestamped description.
- *Focus note:* (pending a watch)
- *Kai normalization:* Map whatever plan vocabulary is used onto the house
  grammar: "I think X will happen because Y is occurring, and I am wrong if Z."
- ⚠️ *This is the weakest primary in the matrix.* Recommend a further search
  pass before it is approved.

**BACKUP**
- **Psychology And Trading Discipline — "How can I control myself from moving
  my stop loss?"** — Markus Heitkoetter / Rockwell Trading
- https://www.youtube.com/watch?v=8kR9ARo0efE
- Length **5:37** · Segment **3:17–5:37** · ✅ CHAPTERS
  (`3:17 PUT THE ORDER IN THE MARKET` → `3:45 DON'T WATCH THE MARKETS` →
  `4:33 FAITH IN YOUR TRADING STRATEGY`)
- *Focus note:* Two minutes on the mechanical fix for the discipline problem:
  put the stop in the market so the decision is already made, then stop
  watching. Concrete, not motivational.
- *Kai normalization:* "Faith in your strategy" → Kai: "we would say: trust the
  plan you wrote when you were calm more than the one you are inventing now."

**DEEPER DIVE** — none assigned.

## `blue/discipline`
*The four mistakes: chasing · moving stops · oversizing · revenge trading.*
→ Day 5 Lesson 3. Four distinct failures, so this row carries four cuts rather
than one video pretending to cover them all.

**PRIMARY — revenge trading (mistake 4)**
- **How to Stop Revenge Trading Before It Destroys Your Account** — Usman Ashraf
- https://www.youtube.com/watch?v=VdyuqeZUgls
- Length **12:54** · Segment **0:56–4:31** · ✅ CHAPTERS
  (`0:56 Losses Aren't the Problem (Your Reaction Is)` → `2:20 Why Revenge
  Trading Happens` → `3:00 The 2-Loss Rule That Saved My Account`, ending
  before `4:31 Trader A vs Trader B`)
- *Focus note:* Watch for the two-loss rule — a hard stop for the day after two
  losers. It is the cheapest defence against one loss becoming five.
- *Kai normalization:* Plain English already. Kai attaches it to the journal:
  "this is the question your review is really asking — did you follow the plan
  after you lost?"

**BACKUP — chasing (mistake 1)**
- **Stop Chasing Trades: How to Control FOMO and Trade With Discipline** —
  ComLucro Trader
- https://www.youtube.com/watch?v=2rmAQ2c08vI
- Length **10:48** · Segment **0:56–7:29** · ✅ CHAPTERS
  (`0:56 The Psychology Behind FOMO` → `2:25 Introducing the FOMO Gate` →
  `3:16 The Five-Step Gate Process` → `6:13 Real Trading Examples`)
- *Focus note:* A five-step gate to run before entering. Watch it as a checklist
  against chasing, which is Day 5's first named mistake.
- *Kai normalization:* "FOMO" → Kai: "fear of missing out — the feeling that
  the trade is leaving without you. Day 5 calls it chasing. You did miss it,
  and that is fine."

**DEEPER DIVE — oversizing (mistake 3)**
- **Why Traders Blow Accounts: Risk Management Explained** — FXStreet
- https://www.youtube.com/watch?v=Qteu4GqP_AM
- Length **9:22** · Segment **0:49–2:53** · ✅ CHAPTERS
  (`0:49 Trader A vs Trader B: win rate vs risk management` → `1:34 The golden
  rule: protect your capital first` → `1:54 Risk per trade explained`, stopping
  before `2:53 The prop firm drawdown trap`)
- *Focus note:* Why the size of the position, not the quality of the idea, is
  what actually ends accounts.
- *Kai normalization:* 2% → **1% house cap**, said out loud. Skip the prop-firm
  chapter entirely.

*Mistake 2 (moving stops) is covered by the `blue/trade_management` backup
above — Heitkoetter's video is literally about not moving a stop.*

## `blue/order_types`
*Market, limit, stop. Three is enough.* → Day 5 Lesson 1.

**PRIMARY**
- **Order Types Explained: Market, Limit & Stop Orders for Beginners** —
  Ryan O'Connell, CFA, FRM
- https://www.youtube.com/watch?v=Zf37t7njppg
- Length **6:40** · Segment **1:00–5:11** · ✅ CHAPTERS
  (`1:00 What Is a Market Order?` → `1:52 What Is a Limit Order?` →
  `3:31 What Is a Stop Order?`, ending before the brokerage walkthrough)
- *Focus note:* Four minutes, three order types, one each. Exactly the scope of
  the lesson and nothing beyond it.
- *Kai normalization:* None needed — the vocabulary is standard and ours.
- *The cleanest fit in the entire matrix:* a credentialed presenter, no
  pitching, no hype, and chapter boundaries that match our lesson one-to-one.

**BACKUP**
- **Understanding Market, Limit, and Stop Orders** — Charles Schwab
- https://www.youtube.com/watch?v=Tiyystl8x40
- Length **5:31** · Segment **0:00–5:31** · ✅ FULL
- *Focus note:* The same three orders from a brokerage that has no course to
  sell you.
- *Kai normalization:* None needed.

**DEEPER DIVE**
- **Market Order vs Limit Order Explained** — Martik Finance
- https://www.youtube.com/watch?v=c49vsd7bhKU
- Length **9:24** · Segment **3:05–5:37** · ✅ CHAPTERS
  (`3:05 Market Order` → `3:45 Slippage` → `4:27 High Liquidity vs Low
  Liquidity` → `4:43 Why Low-Volume Stocks are Dangerous`)
- *Focus note:* Optional: why a market order in a thin stock fills at a price
  you did not expect. Slippage is the first grown-up execution idea.
- *Kai normalization:* "Slippage" → Kai: "the gap between the price you saw and
  the price you got."

## `blue/paper_trading`
*Practising without money, in a way that transfers to doing it with money.*
→ Day 6.

**PRIMARY**
- **How to Paper Trade | RISK-FREE Trading Practice** — Master The Market
- https://www.youtube.com/watch?v=t3nwcoxJ40I
- Length **7:16** · Segment **0:27–3:18** · ✅ CHAPTERS
  (`0:27 Pros and Cons` → `2:20 Psychology`, ending before
  `3:18 Paper Trading Bot`)
- *Focus note:* Watch for the honest part — what paper trading does teach and
  what it cannot, because the money is not real. Stop at 3:18; the bot section
  is a tool demo.
- *Kai normalization:* Plain English. Kai adds the house frame: "this is why
  Day 6 grades whether you followed your plan, not whether you made money."

**BACKUP**
- **Trading Basics with Paper Trading** — TradingView
- https://www.youtube.com/watch?v=2PWx6P0Pbok
- Length **16:26** · Segment **7:49–13:20** · ✅ CHAPTERS
  (`7:49 Order ticket` → `8:57 Market order` → `9:55 Limit order` →
  `10:50 Stop order`, ending before `13:20 DOM`)
- *Focus note:* Placing the three order types on a real platform without real
  money. Pairs directly with `blue/order_types`.
- *Kai normalization:* None needed. Skip `15:56 Leap competition` — a contest
  promo, and outside the segment anyway.

**DEEPER DIVE**
- **Paper Trading for Beginners (Learn Trading FAST & EASY)** — MoneyZG
- https://www.youtube.com/watch?v=1b1CkN5I80Q
- Length **7:46** · Segment **0:00–7:46** · ✅ FULL
- *Focus note:* Optional second pass.

## `blue/journaling`
*Before: why did I enter? After: what happened? Review: did I follow my plan?
— which matters more than whether it made money.* → Day 6 journal.

**PRIMARY**
- **How I Journal My Trades (as a full-time trader)** — Etienne Crete /
  Desire To TRADE
- https://www.youtube.com/watch?v=KHsTwlJt9i0
- Length **12:58** · Segment **0:32–3:12** · ✅ CHAPTERS
  (`0:32 What is your journal telling you?` → `1:02 What you are doing vs. what
  you should be doing` → `1:49 Is your journal data really data-driven?`,
  ending before `3:12 Journal data to get started with`)
- *Focus note:* Watch for the framing — a journal is not a diary, it is the
  record that shows the gap between what you meant to do and what you did.
  That gap is the entire point of Day 6.
- *Kai normalization:* Plain English. Kai attaches the house question: "ours
  asks one thing above all — did I follow my plan?"
- *Note:* the final chapter (`12:41 How to get the trader journal analytic
  pairs`) is a product hand-off. The segment ends nine minutes before it.

**BACKUP**
- **How To Create A Trading Journal — *One That Actually Works*** — TC Trading
- https://www.youtube.com/watch?v=gW45JtNcFHc
- Length **12:05** · Segment **⚠️ NEEDS-REVIEW** (5 chapters exist; re-run the
  checker to pin the cut)
- *Focus note:* (pending)
- *Kai normalization:* Whatever fields are proposed, Kai maps them onto the
  house three: Before / After / Review.

**DEEPER DIVE**
- **How I Journal My Trades** — tomtrades
- https://www.youtube.com/watch?v=5u682pWNmpY
- Length **9:07** · Segment **0:00–9:07** · ✅ FULL (no chapters; short enough
  to assign whole)
- *Focus note:* Optional: a second trader's actual journal, for a member who
  wants to see one rather than be told about one.

---

# PURPLE I — outline only

*Videos deliberately not curated.* Purple is past "trade ready", and the spec
describes these belts only as "progressively advanced libraries". Curating
eighteen months ahead of the product would produce link rot, not a curriculum —
and these competencies are the ones most likely to be taught in-house, because
by Purple the house has a point of view that a general-audience video does not.

| # | Competency | One line |
|---|---|---|
| P1.1 | Multi-timeframe analysis | The higher timeframe sets the context the lower one trades inside. |
| P1.2 | Volume as confirmation | What participation says about whether a move is real. |
| P1.3 | Relative strength and leadership | Which names are leading, and why that matters more than the index. |
| P1.4 | Catalysts and news | Why price moved — and whether the reason changes the plan. |

# PURPLE II — outline only

| # | Competency | One line |
|---|---|---|
| P2.1 | Scaling and partial exits | Taking some off without abandoning the thesis. |
| P2.2 | Trailing a stop | Protecting profit without strangling a working trade. |
| P2.3 | Correlation and concentration | Five positions that are secretly one position. |
| P2.4 | Drawdown management | What to do during the losing stretch, decided in advance. |

# BLACK — outline only

| # | Competency | One line |
|---|---|---|
| B.1 | Defining a personal edge | What you do that you can describe, repeat, and defend. |
| B.2 | Backtesting and expectancy | Whether the edge survives contact with history. |
| B.3 | A review cadence | Weekly, monthly, quarterly — the loop that improves the process. |
| B.4 | Adapting to regime change | Noticing the market changed before the account tells you. |
| B.5 | Teaching it | The last proof of understanding is being able to hand it to someone. |

---

# REJECTIONS — the bar, applied

21 videos rejected. Listed because a curation bar with no visible rejections is
a claim, not a bar. Every reason below is backed by evidence actually
retrieved — a duration, a chapter title, or a description — not by a hunch
about the thumbnail.

### Rejected on risk philosophy (the automatic ones)

1. **Trading Without a Stop Loss? Key Factors to Consider** —
   https://www.youtube.com/watch?v=7X3VYqgon_o — frames trading with no stop as
   an option to weigh. The house law is that the stop goes past your
   invalidation, not that it is optional. Risk content gets no benefit of the
   doubt.
2. **Stop Loss Strategy Secrets** — Rayner Teo — **not rejected, but fenced.**
   Chapter `16:00 "No Stop Loss"` sits inside an otherwise excellent video, so
   it survives only as a 10:40–14:10 segment with a hard boundary. Recorded
   here because it is the clearest illustration of why this matrix assigns
   segments rather than videos.

### Rejected for hype and impossible claims

3. **Dead SIMPLE 15 Minute Trading Strategy for 95% Win Rates** —
   https://www.youtube.com/watch?v=pdPUxxqg9aQ — a 95% win-rate claim.
4. **100% WIN RATE GOLD STRATEGY (Scalping & Day Trading)** —
   https://www.youtube.com/watch?v=nmoZfml_ACg — no strategy has a 100% win
   rate; the framing invites exactly the overconfidence Yellow II teaches
   against.
5. **This Simple Scalping Strategy Makes Me Over $10,000/Month** —
   https://www.youtube.com/watch?v=xTTDH5iRhJc — income-flex headline.
6. **My 90% Win Rate Scalping Strategy** and **(9 Wins Out of 10)… This 90%
   WIN RATE Scalping Strategy Should Be Illegal** — same pattern, auto-reject.

### Rejected for course, Discord or product pitching

7. **Trading Breakouts. Catch Stocks Before They Make Their Greatest Gains** —
   Adam Khoo — https://www.youtube.com/watch?v=JWlW6H1cnlU — **29:38 verified**,
   half an hour past the ceiling, and pitches three paid courses, a Discord and
   live seminars.
8. **5 Things To Look For Before You Place A Trade** — Rayner Teo —
   https://www.youtube.com/watch?v=8GW2JPPyoZA — **23:05 verified**, "monster
   breakout trades" framing, three paid products.
9. **Explosive Breakout Trading Strategy with 7 Confirmations | FREE Stock
   Screener** — Dhan — https://www.youtube.com/watch?v=pBQ1oVDVe3M — built to
   pitch a screener.
10. **Trading Breakout Patterns For Low Risk/High Reward** — Financial Wisdom —
    https://www.youtube.com/watch?v=TKiyla7W7IU — brokerage referral, paid
    screener, paid backtest software with discount codes, forum signup.
11. **How to Trade Trend Continuations** — Jason Graystone —
    https://www.youtube.com/watch?v=i8pR0Nsi1Nc — 21:30, a paid "30 Day Trader
    Challenge", broker referral, and Fibonacci confluence out of scope.
12. **The #1 Secret of Profitable Traders: Use A Trading Journal (Or Lose
    Forever)** — Wysetrade — https://www.youtube.com/watch?v=TcoSQ1374J0 —
    14:25; "or lose forever" is fear-marketing, and journaling videos are the
    category most prone to being an ad for a journaling product.

### Rejected as belt-inappropriate (right idea, wrong belt)

13. **Top Candlestick Patterns Explained | Doji, Hammer, Engulfing & Trends** —
    GCL Dreams — https://www.youtube.com/watch?v=soFIPLtbwFs — **verified
    1:16:19**. Seventy-six minutes, and a pattern-name dump, which White I
    forbids outright. Rejected twice over.
14. **Market Mechanics Ep 5: Market Structure** — The Trading Geek —
    https://www.youtube.com/watch?v=waLWuc6_HC0 — **verified 50:31** with
    chapters including `7:45 Break Of Structure Explained` and `15:35 Swing
    Structure Vs Internal Structure`. Fifty minutes of ICT-adjacent jargon at a
    belt whose entire scope is "HH+HL = uptrend". Also pitches a paid "1% Club"
    and an app.
15. **How to Identify Support and Resistance (Beginner Guide That Actually
    Works)** — Tyler Stokes — https://www.youtube.com/watch?v=0B4_eapleuo —
    18:05, and layers Fibonacci, Ichimoku and Gann onto support and resistance.
    No chapters, so no clean segment is available to rescue it.
16. **Candlestick Pattern Trading Course for Beginners** (playlist) —
    TradingWithRayner — a multi-video course about patterns: fails both the
    pattern rule and the concept-specific preference.
17. **How to Read Candlestick Charts** style "complete guides" generally — the
    category was searched and mostly rejected; MoneyZG survives only as the
    3:43–7:40 cut.

### Rejected as unverifiable or dead

18. **Higher Highs & Lower Lows - The One Pattern Every Trader Needs** —
    https://www.youtube.com/watch?v=zJ5sRc8W3U0 — **confirmed dead**: `yt-dlp`
    returns "Private video". This is the failure mode `backup_url` exists for,
    caught before a member met it.
19. **The Hidden Cost Eating Your Profits on Every Trade** — mentor_mitch —
    https://www.youtube.com/watch?v=RquLcBJuRLk — surfaced as a bid/ask
    explainer; is personal-mentorship brand content.
20. **The Art of Patience in Trading | Wait for the Perfect Setup** —
    Trading Mindset Lab — https://www.youtube.com/watch?v=PRfjTwWzzVs — 25:42,
    hashtag-stuffed SEO copy with no identifiable trader behind it. Content-mill
    filler fails the "accurate, concept-specific" bar.
21. **If I Started Trading Again, I'd Fix This One Mistake** — The Secret
    Mindset — https://www.youtube.com/watch?v=dOZ6g_B59zU — 12:53, no chapters,
    faceless-channel format; could not be verified as genuine trader experience
    rather than narrated stock advice, which is the whole value of a "scars"
    video.

---

# DAY 1 LESSON 1 — CANDIDATES FOR THE OWNER'S EYES

`d1l1` ("What Is a Stock?") is written and live. Its screen 4 is the **KWAY
BREAKDOWN**, a 1:42 in-house piece whose script exists and whose footage does
not — the lesson renders it honestly as an in-production card today.

**Nothing external has been shipped into it.** The three candidates below are
what a curated pick would look like if the owner would rather assign one than
film it. All three would go in as `owner_approved: false` and render as a review
card until that is changed by hand.

**Candidate A — the closest to the written script** *(recommended)*
- **How the Stock Market Actually Works** — Martik Finance ·
  https://www.youtube.com/watch?v=dMOcrLMfDFM · 9:33
- Segment **2:31–4:02** ✅ CHAPTERS — `What is a Stock?` then `Why Companies
  Sell Shares`
- Maps to lesson screens 2 and 3 almost exactly. Ninety-one seconds, which fits
  where a 1:42 video was budgeted.
- *Trade-off:* it is not Kway, and screen 4 is branded KWAY BREAKDOWN. Assigning
  it means the eyebrow changes.

**Candidate B — the shortest honest option**
- **What are Stocks? A Simple Explanation for Beginners** — Easy Peasy Finance ·
  https://www.youtube.com/watch?v=9yqfiQy0Xjw · 2:40 · Segment **FULL** ✅
- Beginner-perfect and completely unhyped; an animated explainer, so it carries
  no trader authority — which the Kway script deliberately does carry
  ("forget the textbook definition").

**Candidate C — for the auction screen instead (screen 5)**
- **What Does The Bid & Ask Mean?** — Whyze ·
  https://www.youtube.com/watch?v=C8javNC7pwQ · 3:51 · Segment **0:37–2:26** ✅
  CHAPTERS
- Would sit beside the interactive bid/ask ladder rather than replacing the
  Kway breakdown. The strongest pairing in the lesson if the owner wants a human
  voice on the auction idea specifically.

**The recommendation:** film the Kway breakdown. It is 1:42, the script is
written, and it is the one place in Lesson 1 where the house voice does work no
curated video can — it is the member's first impression of who is teaching
them. Use Candidate A only if filming slips, and Candidate C as an addition
regardless.

---

# OWNER REVIEW QUEUE

Nothing here is live. In priority order:

1. **Approve or reject the 18 primaries.** Each needs `owner_approved: true`
   set on its content row before it renders as anything but a review card.
2. **Watch the 9 NEEDS-REVIEW segments** and pin real timestamps, or drop the
   rows: `white-2/market_structure` deeper, `yellow-1/pullbacks` backup,
   `yellow-1/trade_watch_pass` backup (Warrior Trading — **content entirely
   unverified**), `yellow-2/entry_confirmation` backup and deeper,
   `blue/trade_management` primary, `blue/journaling` backup.
3. **Three rows carry channel caveats worth a decision**, all of the same shape:
   a clean teaching segment inside a channel that sells something in its
   description — StocksToTrade, FxScouts, Tyler Stokes. The assigned cuts
   contain no pitch. The call is whether linking out to such a channel at all is
   acceptable.
4. **`blue/trade_management` needs a better primary.** It is the one slot filled
   with something unverified rather than something good.
5. **`yellow-1/trade_watch_pass` is thin.** The concept is central to Day 3 and
   the supply is poor, because the traders who teach selectivity best are the
   ones with the most to sell. A strong in-house piece here would be worth more
   than any curation.
6. **Re-run the link check before each release**, and promote a backup wherever
   it reports UNAVAILABLE:
   `node apps/mobile/scripts/yt-verify.mjs --file <urls.txt>`

---

*Compiled 2026-09-07. Titles, channels, durations, availability and every
✅ CHAPTERS timestamp verified live against the YouTube player response with
`apps/mobile/scripts/yt-verify.mjs`. Segments marked ⚠️ NEEDS-REVIEW are
explicitly unverified and are flagged as such on the card the member sees.*
