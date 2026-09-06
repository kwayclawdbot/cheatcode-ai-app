# Financial Disclaimers — Cheat Code AI

> ## ⚠ THIS IS A DRAFT, NOT A LEGAL DOCUMENT
> Written by an AI agent, not a lawyer. **Of the four documents in this folder, this
> is the one I would most want a lawyer to read**, because this app discusses
> entries, stops, targets and position sizes, and the line between education and
> regulated investment advice is drawn differently in every country the App Store
> operates in. The bottom section says exactly where.

**Last updated:** [DATE OF PUBLICATION]

---

## 1. The short version, in normal words

**Cheat Code AI is education and preparation. It is not investment advice.**

Kai is a computer program. He is not a financial adviser, not a broker, and not
regulated by anybody. He does not know your circumstances, your tax position, your
debts, or what you can afford to lose. Nothing he says is a recommendation, and
nothing in this app should be treated as one.

**He can be wrong, and sometimes he will be.**

Trading and investing involve risk, including the loss of everything you put in.
Every decision you make is yours, and so is every outcome.

---

## 2. Kai is a generated system

Kai's answers are produced by a large language model. That has consequences you
should know about rather than discover:

- **He can state something confidently that is not true.** Confidence in the writing
  is not evidence about the world.
- **He does not know what happened after his information ends**, and market data
  reaches him with a delay unless the screen says otherwise.
- **He never invents a price.** The app is deliberately built so that Kai names
  *which* level he means and the server looks up the number — he does not produce
  prices himself. That removes one category of error. It does not make his reasoning
  correct.
- **He has no memory of your circumstances beyond what you have told him**, and what
  you have told him is not a suitability assessment.

Treat what Kai writes the way you would treat a well-read friend's opinion: worth
hearing, worth checking, and not a substitute for your own work.

## 3. Alerts and setups are not recommendations

The app publishes **setups** — a symbol, a thesis, a grade, an entry condition, a
stop, and targets — and **alerts** when a condition it is watching is met.

**An alert is a thing the system noticed. It is not a recommendation to buy or sell.**

- A grade (A, B, C and so on) is our own internal opinion of a pattern. It is not a
  rating, not a forecast, and not a probability. It carries no assurance of anything.
- An entry, a stop and a target are **illustrations of how the idea could be
  structured**, not instructions and not a plan we are recommending for you.
- A published history of past setups shows what happened. **Past results say nothing
  about future ones.** The history is there so that the record is visible rather than
  claimed, not as evidence that the next one will work.
- We do not know your situation. A position size that is sensible for one person is
  reckless for another.

## 4. Position sizing and risk numbers

The app will calculate a maximum position size and a daily risk figure from the
balance of your **practice** account and the limits you set yourself.

**These are arithmetic, not advice.** They tell you what your own stated rules imply.
They do not tell you whether your rules are sensible, and they take no account of
anything outside the app — your other holdings, your income, your obligations, or
your tolerance for a bad month.

## 5. Paper trading

Every trade in this app is simulated.

- **No real money is involved.** No order is sent to a market. No broker is
  connected. There is no connected brokerage account in this release.
- **The fills are not real either.** Practice fills use delayed prices. A real order,
  placed at the same moment, would very likely have filled at a different price — or
  not at all. In a fast market the difference can be large.
- Practice results are therefore **better than reality, systematically**, not by
  accident. Slippage, partial fills, spread, queue position, halts and outages are
  not simulated.
- A profitable practice record is evidence you understand the mechanics. It is not
  evidence you would have made that money.

## 6. Market data

Prices in the app are **delayed** unless the screen explicitly says they are live.
Every price the app shows carries a label saying what it is and when it is from. If
a price has no label, do not trust it — tell us.

Market data comes from third parties. It can be wrong, late, or missing. We do not
warrant it.

## 7. No relationship, no suitability, no jurisdiction

- Using this app does not create an adviser relationship, a broker relationship, or a
  fiduciary duty between you and us.
- We do not assess whether anything in the app is suitable for you, because we
  cannot.
- Cheat Code AI is offered from the **[COUNTRY]** and is not directed at people in
  any place where doing so would require a licence we do not hold.
  **[LAWYER: this sentence needs to be true, and it interacts with which App Store
  territories the app is listed in. Restricting territories may be simpler than
  qualifying everywhere.]**
- Nothing here is tax advice or legal advice.

## 8. Other members

Members post their own opinions in the community. **Those opinions are theirs, not
ours.** We do not check them, endorse them, or stand behind them. A member telling
you what to do with your money is breaking our Community Policy — report it.

## 9. If you need actual advice

Talk to a licensed financial adviser in your own country who knows your
circumstances. This app is not a substitute for one and does not try to be.

---

## The short strings the app should show, and where

These already exist in `apps/mobile/src/features/legal/disclaimers.ts`, written by
another lane. They are reproduced here so this document and the app cannot drift
apart. **If a lawyer changes the wording, change that file — every screen reads its
sentence from there.**

| Constant | Where it goes | Text |
|---|---|---|
| `NOT_ADVICE_SHORT` | Under Kai's answers | "Kai is not a financial adviser and this is not investment advice. He can be wrong. Every decision, and every loss, is yours." |
| `NOT_ADVICE_ALERTS` | The alerts surface | "An alert is a thing Kai noticed, not a recommendation to buy or sell. It is not investment advice, it can be wrong, and what you do about it is your decision." |
| `NOT_ADVICE_PAPER` | The paper account and order screens | "Paper trading is practice with money that does not exist. Fills use delayed prices, so a real order would not have filled the same way. Nothing here is investment advice." |
| `NOT_ADVICE_LONG` | Account and plan screens | "Cheat Code AI is education and preparation. It is not investment advice and Kai is not a financial adviser. Kai never places a trade, never promises an outcome, and can be wrong. Trading involves risk, including the loss of everything you put in. Every decision is yours." |

**One gap I would close.** There is no short string for the **setup card** itself —
the screen that shows a grade, an entry, a stop and targets. That card is the single
most advice-shaped surface in the app, and it is the one place the current set does
not cover. Suggested wording, for the lawyer to correct:

> "A grade is our opinion of a pattern, not a forecast. The entry, stop and targets
> show how the idea could be structured — they are not a recommendation and not a
> plan for you."

---

## What I most want a lawyer to read

**This whole document, and section 3 first.** But specifically:

1. **Section 3 — the setups.** The app publishes a symbol, a direction, a grade, an
   entry price, a stop and targets, on a schedule, to paying subscribers. In several
   jurisdictions that is the definition of a regulated investment recommendation or a
   regulated financial publication, and a disclaimer saying "this is not advice" does
   not necessarily change what it is. **This is the question that decides whether the
   product needs a licence, a registration, or a change in what it publishes.** It is
   worth real money to get answered properly, before submission and before scale.
2. **Section 4 — position sizing.** The app tells a user, in dollars, how large a
   position their rules allow. That is closer to personalised advice than anything
   else in the product, and the fact that the money is simulated may not save it once
   the same figures are applied to a real account.
3. **Section 7 — jurisdiction.** Whether the "not directed at" sentence is worth
   anything depends on the App Store territories the app is listed in. A lawyer
   should say which territories to exclude, if any.
4. **Section 2 — how much must be said about the AI.** There is emerging regulation
   in several places about disclosing AI-generated content and about AI in financial
   services. A lawyer should say whether section 2 is sufficient, and whether a
   per-message label is required rather than a policy page.
5. **Whether the in-app short strings in the table above are enough on their own**,
   or whether an acknowledged, one-time consent screen is needed at first run.
6. **Section 8 — member content.** Whether the operator carries liability for a
   member's post that reads as advice, in a paid community about money.
