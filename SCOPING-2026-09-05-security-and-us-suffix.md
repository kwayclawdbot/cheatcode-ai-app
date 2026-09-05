# SCOPING — 5 September 2026

The two things left open in yesterday's handoff, items #6 and #7. Both are now measured.
Nothing was changed. No key was rotated, no lock was touched, no file was edited.
Two decisions are waiting for you at the end of each part.

Plain English throughout. No key, password or token value appears anywhere in this
document — only where they live and a short fingerprint so you can tell two apart.

---
---

# PART 1 — The database key

## The one-line version

The handoff said this key "is one mistake from emptying the watchlist and the research."

That is true, and it is also much too small. **The key is not a secret at all — it is the
public kind, and it has already been published.** It sits in a file on GitHub and inside
two finished website builds. And the database it opens is not just the brain's seven
tables: **the same key reads and can delete all 309 customer records** — every phone
number, 243 email addresses, 257 Stripe customer IDs, and 2 stored brokerage
connections.

I proved the reading part live, from outside, using nothing but the published key. The
deleting part I confirmed by reading the database's own rules rather than by deleting
anything.

The research is the smaller half of this problem.

---

## 1. What the key actually is — and the correction to the handoff

The handoff describes `KAI_SUPABASE_KEY` as a key with "full write and delete". That is
the right conclusion but the wrong reason, and the wrong reason changes the fix.

Supabase issues two kinds of key:

- a **public** key, meant to be handed out — put in a phone app, in a web page, in
  anyone's browser. It is not supposed to be protected. It carries no power of its own.
  Its whole design assumes the database has locks on it.
- a **private** key, which bypasses every lock and must never leave a server.

`KAI_SUPABASE_KEY` is **the public kind**. Its name begins `sb_publishable`.
Fingerprint `829f4e58ca03`.

So it was never really a secret. What gives it "full write and delete" is not the key —
it is that **the database has almost no locks on it.** The key is doing exactly what a
public key does; the database is the part that is wrong.

This matters for the fix: rotating the key achieves nothing on its own, because the
replacement public key would have the same powers the moment it was issued. **The lock
is the thing to change, not the key.**

There *are* two genuinely private keys for this database. Both are properly contained —
see section 3.

---

## 2. Everywhere the key lives

I searched the whole laptop, all 15 Railway projects, and the git history of every repo
that mentions this database.

### On the laptop — 15 files

| Where | What it is |
|---|---|
| `~/projects/kai-brain/.env` | the brain itself, as `SUPABASE_KEY` |
| `~/projects/kai-brain/.env.bak-2026-09-04` | yesterday's backup copy of the same |
| `~/projects/cheatcode-ai-sdk57/apps/api/.env.local` | the app, as `KAI_SUPABASE_KEY` |
| `~/projects/cheatcode-ai-sdk57/apps/api/.env.prod` | same, hosted settings |
| `~/projects/cheatcode-ai/apps/api/.env.local` | the original app checkout |
| `~/projects/cheatcode-ai/apps/api/.env.prod` | same |
| `~/projects/kai-desk-blog/.env.local` | the new blog |
| `~/projects/kai-mobile/.env.local` | old mobile app |
| `~/projects/kai-warroom/.env.local` | war room |
| `~/projects/trading-stream/.env` | retired live-show project |
| `~/projects/cheatcode-os/.env` and `.env.local` | CheatCode OS |
| `~/breakout-alert-system/.env` | the SMS alert system |
| `~/breakout-alert-system/affiliate-dashboard/.env.local` | affiliate dashboard |
| `~/.openclaw/secrets/supabase_kai.env` | the intended secrets store |

That is the pattern you already know from the Anthropic key audit: one value pasted into
a dozen files.

### On Railway — 35 of 36 services

Every service in the `cheatcode-kai` project except one (`cron-earnings-ingest`, which
has the address but no key) carries it — 31 services. Plus four more outside that
project:

- `kai-mobile-agent / agent`
- `kai-mobile-api / api`
- `cheatcode-os-api / cheatcode-os-api`
- (`grateful-dream` holds the address only; it was shut down on 4 September)

### The part that matters most — it is already published

Three places put this key somewhere the public can read it:

1. **`~/projects/kai-mobile/app.json` — committed to GitHub** at
   `kwayclawdbot/kai-mobile`. Anyone who can see that repository has the key.
2. **`~/breakout-alert-system/webhook-vercel/api/webhook.js` — committed to GitHub** at
   `kwayclawdbot/cheatcode-kai`, typed directly into the source code, and repeated in
   that repo's `ARCHITECTURE.md`.
3. **Two finished website builds contain it in plain text** —
   `~/projects/kai-mobile/dist/_expo/static/js/web/entry-8731f760302c37c16a05b7877f418797.js`
   and `~/projects/cheatcode-os/dist/public/assets/index-DuQrE7aL.js`. Both projects are
   linked to Vercel (`kai-mobile` and `cheatcode-os-app`). If either of those builds was
   ever put online, the key was served to every visitor's browser.

I could not check whether those GitHub repositories are public or private — the `gh`
command on this machine is not signed in. **That is the single fastest thing you can
check yourself, and it decides how urgent the rest of this is.** If either repo is
public, treat everything below as already happened.

The key also appears in old assistant session logs (`~/.claude/history.jsonl`, several
files under `~/.hermes/`). Those are local only.

---

## 3. The two genuinely private keys — these are fine

For completeness, because they came up in the search and they are the ones that *would*
be a real emergency:

- **The private key** (fingerprint `1a427b9675e7`) exists in exactly one file:
  `~/.openclaw/secrets/supabase_kai.env`. Nowhere else. Not on Railway. Not in git.
- **The older private key** (fingerprint `7b0c23f99080`) is in five places:
  `~/.openclaw/secrets/supabase_kai.env`, `~/projects/cheatcode-os/scripts/.env`,
  `~/projects/trading-stream/.env`, a disabled startup file
  (`~/Library/LaunchAgents/_disabled-2026-05-06-hermes-migration/ai.openclaw.gateway.plist`)
  and its backup. It is also on Railway in four services: `kai-swing-watchlist`,
  `kai-v4-weekly-scan`, `kai-swing-trigger` and `cheatcode-os-api`.

Neither is committed to git. Neither is in a website build. **Both are contained.** No
action needed on these beyond not spreading them.

---

## 4. What the key can actually do — measured, not assumed

I read the database's real rules directly, connecting as the owner.

The way this database is supposed to work: each table has a lock, and each lock has a
list of who may do what. A table with the lock **off** is simply open — whoever can
reach it can do anything the table permits. A table with the lock **on but no list** is
shut to everyone but the private keys.

Here is the truth for the seven tables the handoff named:

| Table | Rows today | Lock | Who can read | Who can change or delete |
|---|---|---|---|---|
| `vault_store` | 3,661 | **on, but the list says "everyone"** | anyone with the public key | anyone with the public key |
| `brain_picks` | **33** (was 57) | **off** | anyone | anyone |
| `brain_articles` | 3 | **off** | anyone | anyone |
| `watchlist_status` | 8 | **off** | anyone | anyone |
| `theme_nominations` | 109 | **off** | anyone | anyone |
| `theme_history` | 52 | **off** | anyone | anyone |
| `themes` | 6 | **on, correctly** | anyone (read only) | **private key only** ✅ |

Two things to notice.

**`themes` is the one table set up correctly.** Its rules say the world may read it and
only a private key may write to it. Somebody did that deliberately. It is the template
for everything else.

**`vault_store` has a rule that does the opposite of what its name says.** The rule is
literally named *"Allow all for service role"* — but it is written for `public`, and it
permits every operation with no condition at all. The name says "only the trusted
server". The rule says "anyone at all". Whoever wrote it believed they had locked it.

### And then the part the handoff did not reach

The brain's seven tables are not a separate database. They share
`ryprohqthwflinadqotj` with the SMS alert business. **57 tables in that database are
open to this same published key.** The full list is at the end of this document. The
ones that matter:

| Table | Rows | What is in it |
|---|---|---|
| `users` | **309** | every customer: phone, email, membership tier, Stripe ID, brokerage link |
| `sms_inbound_log` | 5,608 | every text message customers have sent in |
| `sent_alerts` | 2,328 | every alert ever sent |
| `alert_performance` | — | the scoring history |
| `insider_transactions`, `earnings_*`, `shadow_*`, `regime_state` | — | research data |
| `brokerage_accounts`, `brokerage_positions` | 0 each | empty today, but wide open for when they are not |

The rule on `users` is named **"Allow all users"**. It applies to `public`, covers every
operation, and has no condition. So does the one on `sent_alerts`, named **"Allow all"**.

### Proof, run just now, read-only

Using nothing but the published public key, from outside, over the ordinary internet:

- `users` → returned a live count of **309**
- `vault_store` → **3,661**
- `brain_picks` → **33**
- the column holding brokerage secrets → **returned** (I asked for one row; that
  particular row was empty, but the column is readable)

And the same 309 customer records contain, right now:

- **309 phone numbers**
- **243 email addresses**
- **257 Stripe customer IDs**
- **2 stored brokerage connection secrets**
- 0 TradeStation tokens (that column is empty)

I did not write, change or delete anything. The ability to delete is established from
the database's own rules, which grant DELETE to the public role on all 57 tables and
place no condition on it.

---

## 5. What would actually be lost

### Recoverable — the vault

`vault_store` is 3,661 rows and looks like the biggest number, but it is **the safest
thing in the database.** It is a copy of the Obsidian vault on this laptop.

I checked all 3,661 rows against the disk: **every single one exists as a file at
`~/.openclaw/vault`.** I then compared the 300 most recently changed rows byte for byte:
**299 identical, 1 drifted** (`Kai/Watchlist/2026-09-04-swing-state.json`).

If `vault_store` were emptied tomorrow, one command puts it back
(`sync_local_to_supabase` in `vault_storage.py`), and you would lose one file's worth of
recent change. **This is not the thing to worry about.**

### Not recoverable — the research

`brain_picks` is the opposite. It holds the analyst write-ups — the 4,000-to-11,000
character theses, the reasoning, the grades, the falsifiers. I checked: **nothing writes
those to a file.** There is no vault copy, no export, no local dump. The table is the
only place they exist. `publish_picks.py` turns them into a web page but reads *from* the
table; it is not a backup.

Same for `watchlist_status` (8 names and the conditions built for them yesterday),
`theme_nominations` (109), `theme_history` (52) and `brain_articles` (the 3 drafts you
still owe a read).

If those went, the only way back is re-running the brain — which costs Anthropic credits,
produces different text, and by your own note from yesterday the 4 September run was
already spoiled by the truncation problem.

**One thing you should look at while you are here.** The handoff recorded `brain_picks`
at 57 rows. It is at **33** now: 31 dated 3 September, 1 dated the 4th, 1 dated the 5th.
Roughly 24 rows are gone since yesterday afternoon. That is almost certainly the brain
rewriting a date on a re-run rather than anyone doing harm — but it is worth confirming,
because it is exactly the shape of the accident everyone is worried about, and nobody
would have noticed.

### The real loss — customer data

309 phone numbers and 243 email addresses is a customer list. 257 Stripe IDs tie those
people to payments. 5,608 inbound text messages are private conversations. None of that
is recoverable if deleted, and all of it is a problem if merely *read* by the wrong
person. Losing the research would cost you weeks. Losing or leaking the customer table
is a different category of problem entirely.

---

## 6. Backups

**I could not confirm that any backup of this database exists.**

- There is no local export anywhere on the laptop — I searched for `.dump`, `.sql.gz`
  and any file named for this project. Nothing.
- There is no Supabase management token stored anywhere on this machine, so I could not
  ask Supabase what backup plan this project is on. The `supabase` command is
  half-signed-in and returns an empty project list.
- The database is **584 MB**.

Supabase's own behaviour depends entirely on the plan: on the free plan there are
effectively no restorable backups; on the paid plan there are daily ones held for a
week; point-in-time recovery is a separate paid extra. **You can settle this in about
thirty seconds** — Supabase dashboard → project `ryprohqthwflinadqotj` → Database →
Backups. If that page is empty, then right now a deletion is permanent.

Until you have checked that, treat everything in `brain_picks`, `watchlist_status`,
`theme_*`, `users` and `sms_inbound_log` as having no safety net.

---

## 7. Where the app stands — the handoff's claim holds

The handoff says the key stays server-side and no route hands it out. **I checked and
that is correct.** In `apps/api/src/lib/swing/source.ts` and
`apps/api/src/lib/desk/source.ts` the key is read from the environment on the server and
used there. Nothing in `apps/mobile` mentions the brain's address or key. The desk makes
exactly one write, `addManualWatch`, and it is scoped so it cannot touch a row the brain
argued for.

So the app is not the leak. **The app was never the leak.** The key was already public
in a GitHub file and two website builds before the app existed. The comment in
`desk/source.ts` warning the next person is accurate as far as it goes; it just aims at
the wrong door.

---

## 8. What you can do — five options, cheapest first

One thing to know before choosing: **the brain itself writes with this same public key.**
`kai-brain/.env` uses fingerprint `829f4e58ca03` for `SUPABASE_KEY`, and so do 31 Railway
services. So any fix that turns the locks on has to move those services onto a private
key at the same time, or the alerts stop.

Also, from your own history: Supabase and Anthropic have both rejected organisation-wide
keys here. Anything you create must be scoped to the one workspace.

---

### Option A — Check the two GitHub repositories. 5 minutes. Do this first.

Are `kwayclawdbot/kai-mobile` and `kwayclawdbot/cheatcode-kai` public or private?

If either is **public**, the key has been readable by anyone for months and everything
below becomes urgent today. If both are **private**, you have time to do this properly.

**Cost:** none. **Breaks:** nothing. **This is not optional — it decides the schedule.**

---

### Option B — Lock the customer table. About 1 hour. Biggest single win.

Delete the two rules named "Allow all users" and "Allow all", and turn on the lock for
`users`, `sms_inbound_log`, `sent_alerts`, `alert_performance`, `brokerage_accounts` and
`brokerage_positions`. Then give the Railway services that genuinely need to write to
them the private key instead.

This is the change that stops a published key from reading 309 customers.

**Cost:** an hour, plus care. **Breaks:** any service still using the public key against
those tables — you must move them to the private key in the same sitting, and the SMS
system reads `users` constantly, so this needs a quiet window and a check afterwards
that the morning alert run still works. **Risk removed: most of it.**

---

### Option C — Lock the brain's tables the way `themes` already is. About 1 hour.

Copy what `themes` already does — world may read, only a private key may write — onto
`brain_picks`, `brain_articles`, `watchlist_status`, `theme_nominations` and
`theme_history`. Rewrite the mislabelled `vault_store` rule so it means what its name
says.

After this, the app and the blog keep working unchanged (they only read). The brain and
the desk-writing crons move to the private key.

**Cost:** an hour. **Breaks:** the brain's own writes until it is given the private key —
so change `kai-brain/.env` and the Railway services in the same sitting. **Risk removed:**
the research can no longer be deleted by anyone holding the public key.

---

### Option D — Make a read-only key for the read-only jobs. Half a day.

Several things only ever read: the app's desk and swing pages, the blog, the published
picks page. Supabase can issue a public key that is scoped to reading. Give those a
read-only key and stop handing the general one around.

Do this **after** B and C, not instead of them — with the locks fixed, a read-only key is
polish. With the locks broken, it is decoration, because the general key is already out
there.

**Cost:** half a day across three repos. **Breaks:** nothing if done in the right order.

---

### Option E — Replace the key everywhere. A full day. Only worth it after B and C.

Issue a new public key, update 15 files and 35 Railway services, rebuild the two website
bundles, and remove the key from `kai-mobile/app.json` and
`breakout-alert-system/webhook-vercel/api/webhook.js` — including from the git history,
or it stays readable in old commits.

**Cost:** a full day, and it is the change most likely to break something quietly,
because a service you forget just stops working the next morning.

**Do not do this first.** On its own it buys almost nothing: the new key would have the
same powers the old one has. Once B and C are done, the published key is worth very
little and replacing it becomes housekeeping rather than an emergency.

---

### The order I would put to you

1. **A** — check the repos today, 5 minutes.
2. **B** — lock the customer table. This is the one that matters.
3. **Check the Supabase backup page** while you are in there, 30 seconds.
4. **C** — lock the brain's tables.
5. **D**, then **E**, when there is a quiet day.

And separately, whatever you decide: **`brain_picks` has no backup at all.** A single
scheduled export of those six brain tables to a file would take under an hour and would
survive any mistake, whoever made it. That is the cheapest insurance on this whole list.

---
---

# PART 2 — The `.US` suffix

## The short version

The bug is real, and the two line numbers in the handoff are exactly right. But three
things about it were not known yesterday:

1. **The files are not in `kai-brain`.** They are in `~/breakout-alert-system`.
   `kai-brain` has no code that adds `.US` to anything.
2. **Removing `.US` does not fix either one.** There is a second fault stacked behind it.
   Fixing only the suffix would make one of them *worse*.
3. **One of the two is dead code. The other one sits directly in front of placing real
   money orders**, and its being broken is currently the only thing stopping a text
   message from becoming a live trade.

---

## The first call site — the content writer

`~/breakout-alert-system/content_engine.py`, line 92:

```python
def get_market_context(self) -> str:
    """Broad market snapshot via EODHD bulk quotes."""
    try:
        quotes = self.eodhd.get_quotes_bulk(['SPY.US', 'QQQ.US', 'IWM.US', 'VIX.INDX'])
        if not quotes:
            return "Market data temporarily unavailable."
```

**What it is for:** it fetches how the market did today and pastes that into the prompt
that writes social content — the premarket, midday, recap and weekly posts.

**What happens today:** Polygon does not recognise `SPY.US`, so nothing comes back, and
the function returns the sentence *"Market data temporarily unavailable."* That sentence
is then handed to the writer as if it were the market data. No error is raised. Nothing
is logged. Every piece of content this file has generated since 24 April has been written
without knowing what the market did.

---

## The second call site — the trade executor

`~/breakout-alert-system/trade_executor.py`, line 135:

```python
def _get_current_price(self, ticker: str) -> Optional[float]:
    """Fetch last price via EODHD."""
    try:
        from polygon_client import PolygonClient as EODHDClient
        eodhd = EODHDClient()
        quotes = eodhd.get_quotes_bulk([f"{ticker}.US"])
```

**What it is for:** working out how many shares to buy when someone texts a dollar
amount — "buy $500 of NVDA". It fetches the price so it can divide.

**What happens today:** the price comes back empty, the function returns nothing, and the
customer gets *"Couldn't resolve quantity for NVDA. Try specifying shares or a dollar
amount."*

**It is only reached on the dollar-amount path.** Someone texting "buy 10 shares of NVDA"
never touches this line and their order goes through normally.

---

## Neither one falls back, and neither one complains

The Polygon client passes the symbol straight through without cleaning it
(`polygon_client.py:127`), and when the request comes back empty it returns an empty list
(`:129-131`). If Polygon returns an error it is logged and swallowed after two retries
(`:66-73`). If Polygon returns "OK, nothing matched" — which is the usual answer for an
unknown symbol — **nothing is logged at all.**

There is a yfinance fallback in this codebase, but it only covers earnings dates, insider
trades and institutional holders. **It does not cover prices.** So there is no second
route. Both call sites just quietly get nothing.

---

## Where the `.US` comes from

**It is typed into both lines by hand.** It does not come from a database column and no
ticker arrives already carrying it. In `trade_executor.py` the ticker is plain everywhere
else in the same file — the position lookup uses it plain, the broker call uses it plain
— and only this one line glues `.US` on the end.

**It is leftover from a job that was half finished.** On 24 April, commit `3f256dc`
("migrate EODHD → Polygon + yfinance across Railway services") switched these files to
Polygon by changing one import line:

```python
from polygon_client import PolygonClient as EODHDClient
```

The new client was given the old client's name, and everything else was left alone: the
`.US` symbols, the field names, the comments that still say "via EODHD", the variable
still called `eodhd`. So this is not EODHD code leaking across the estate boundary from
`breakout-alert-system` into somewhere it shouldn't be — it is EODHD code that never
finished leaving `breakout-alert-system`.

Everywhere else in that repo gets away with it, because the news function strips the
suffix off before use (`polygon_client.py:844`). The price function is the only one that
does not — which is exactly why these two lines are the only two broken.

---

## The part that changes the recommendation

**Removing `.US` does not make either of these work.** Behind the suffix is a second
mismatch: the Polygon client returns fields called `ticker`, `price`, `change`,
`change_pct`, `volume` — but both call sites ask for the *EODHD* field names.

`content_engine.py` asks for `code`, `close`, `previousClose` and `change_p`
(lines 98-100). None exist. So with the suffix fixed, the function would stop saying
*"Market data temporarily unavailable"* and start producing four lines that read:

```
  : $0.00 (down 0.00%)
```

...and hand *those* to the writer as the market snapshot. **That is worse than the bug.**
Right now it fails honestly. A half-fix would make it lie confidently — which is exactly
the thing this project has a standing rule against.

`trade_executor.py` asks for `close` and `previousClose` (line 138). Neither exists, so
it would still return nothing and the customer would still get the same message. **The
half-fix changes nothing at all there.**

(Also `'VIX.INDX'` is wrong twice over — Polygon writes it `I:VIX`, and it is not served
by the stock endpoint at all.)

---

## Is anything relying on these failing? Yes — one of them.

**`content_engine.py`: no, and it is dead anyway.**

- It is not in the Railway job list. The two content jobs there
  (`cron-content-intel`, `cron-content-alerts`) run a **different file**,
  `kai_content_engine.py`, which has no `.US` in it.
- Its four startup files sit in the repo but are not installed on this machine, and the
  only installed content jobs are disabled and point at the other file.
- No Python file imports it.
- The one live reference is the affiliate dashboard's admin page, which shells out to it
  by path — that only works if the dashboard runs from inside this repo on this laptop.

**`trade_executor.py`: yes, and this is the finding that matters.**

The chain runs: SMS reply handler → `_handle_trade_intent` → confirmation → `execute_order`
→ and eleven lines further on, `trade_executor.py:208`:

```python
resp = st.trading.place_force_order(...)
```

That is SnapTrade's *place the order and skip the checks* call. A real order at a real
broker. It is gated to VIP customers on the live SMS path
(`conversational_onboarding.py:4539-4542`), and both SnapTrade credentials are present
and real in `.env`.

So today a dollar-amount order **fails safely**. It stops at the price lookup and the
customer gets a polite decline.

Make the price lookup work — properly, both layers — and the share count becomes
`dollar_amount ÷ price` and flows straight into that broker call, to six decimal places.
There is a "YES" confirmation step. There is **no dollar ceiling, no sanity check on the
resulting share count, and no paper-trading mode on that path.**

The broken price lookup is, right now, the only thing standing between a text message and
an uncapped live order.

---

## Recommendation

**Leave `content_engine.py` alone.** It is dead code with no scheduler pointing at it,
and a partial fix would replace an honest failure message with fabricated zeros. If
someone ever revives it, fix the suffix and the field names together, or not at all.

**Leave `trade_executor.py` alone for now — and do not treat it as a small fix when you
come back to it.** The one-line change the handoff describes would not actually work.
The change that *does* work quietly opens the live-order path. That is not a bug fix,
it is a product decision about whether customers can text a dollar amount and have real
money spent. When you decide to make it, the same change must add a dollar ceiling and a
price sanity check.

The handoff's instinct — "left alone because fixing it changes behaviour" — was right.
It was righter than it knew.

**What I would actually change today: nothing in the code, one line in the comment.**
Both files claim in their own docstrings to be talking to EODHD. They are not; they have
been talking to Polygon since April. That misleading comment is what will send the next
person down the wrong path, and it is the only genuinely safe edit here.

---
---

## Appendix — the 57 tables open to the published key

`alert_performance`, `alert_performance_honest`, `brain_articles`, `brain_picks`,
`breakout_stocks`, `brokerage_accounts`, `brokerage_activities`, `brokerage_positions`,
`cancellation_events`, `coach_demos`, `content_schedule`, `discord_agents`,
`discord_messages`, `discord_users`, `dojo_completions`, `dojo_track_progress`,
`drip_queue`, `email_drip_queue`, `follows`, `grading_runs`, `insider_transactions`,
`journal_entries`, `kai_baseline_stats`, `kai_conversations`, `kai_market_context`,
`kai_memory_embed_queue`, `kai_memory_embeddings`, `kai_messages`, `kai_muted_tickers`,
`kai_user_alert_prefs`, `kai_user_watchlist`, `kai_warroom_tool_calls`, `playlists`,
`post_interactions`, `reel_render_queue`, `regime_state`, `sent_alerts`, `shadow_alerts`,
`shadow_day_plans`, `shadow_outcomes`, `shortlinks`, `sms_inbound_log`,
`theme_call_outcomes`, `theme_history`, `theme_nominations`, `ticker_cards`,
`user_badges`, `user_bookmarks`, `user_events`, `user_views`, `user_xp_log`, `users`,
`vault_store`, `video_queue`, `warroom_user_prefs`, `watchlist_events`,
`watchlist_status`.

Each is either unlocked entirely, or carries a rule that permits every operation to
everyone. `kai_messages` is on this list only technically — its rule is written correctly
but it is empty, so nothing is exposed today.

Everything in this document was read, not changed. No key was rotated, no rule was
altered, no row was written.
