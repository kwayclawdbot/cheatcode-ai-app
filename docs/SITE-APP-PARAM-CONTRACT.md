# The website → app handoff (`?path=`)

The marketing site asks exactly one question, and the answer has to survive the
jump into the app so that onboarding's "Where are you right now?" is already
answered rather than asked twice.

Source of truth for the site half: `apps/site/src/sim/handoff.ts`.

## The wire format

```
?path=learn | swing | pro
```

Three values, and only three. They are the site's own vocabulary — the three
doors on the selector — not the app's answer values.

### Why not send `start_answer` directly

The app's `StartAnswer` has four values; the site offers three doors. `investor`
("I invest but don't really trade") has no door of its own, because a visitor
who does not trade yet is served by the Learn walkthrough. Sending the site's
vocabulary keeps the site free to re-word or re-order its doors without
needing a coordinated app release.

## The mapping

| site `path` | door on the site | app `start_answer` | `goal_mode` | server placement (`START_PLACEMENT`) |
|---|---|---|---|---|
| `learn` | Learn investing and trading | `brand_new` | `invest` | stage `beginner`, mode `invest`, room `beginners` |
| `swing` | Find better swing trades | `swing` | `swing` | stage `developing`, mode `swing`, room `swing` |
| `pro` | Trade with an AI copilot | `active` | `day_trade` | stage `trade_ready`, mode `day_trade`, room `day-trade` |

`investor` is never produced by the site. It remains reachable by answering the
question inside the app, which the visitor can still do — see "It must stay
changeable" below.

Anything absent, misspelled or unrecognised means **no pre-selection**. Do not
guess a default; an unanswered question is correct, a wrong pre-filled answer
is not.

## Where the site puts it

- Every CTA at the end of a walkthrough links to `/get-the-app?path=<id>`.
- That page is the current terminus, because the app has no public signup URL
  yet. It states plainly that the app is in private testing, and shows the deep
  link `cheatcodeai://start?path=<id>` for anyone already on TestFlight.
- **When the app gets a signup URL**, the two buttons on that page become that
  URL with `?path=` appended. Nothing else on the site changes.

## What the app has to do to consume it — NOT YET WIRED

This was left as a documented contract rather than shipped, because it is not
a one-line change. `apps/mobile/src/app/(onboarding)/start.tsx` does not read
route params today, and — more importantly — **the three places that route to
`/start` all drop the query string**:

- `apps/mobile/src/app/index.tsx` — `<Redirect href="/start" />`
- `apps/mobile/src/app/_layout.tsx` — `router.replace('/start')`
- `apps/mobile/src/app/(auth)/sign-up.tsx` — `router.replace('/start')`

So a `path` arriving on a cold deep link is lost before `start.tsx` mounts. The
work is therefore:

1. Capture `path` where the app first receives the URL (the deep-link handler),
   and hold it on the onboarding draft in `apps/mobile/src/lib/session.tsx` —
   not on the route.
2. In `start.tsx`, on mount, if nothing has been chosen yet and a captured
   `path` exists, call the existing
   `set({ start_answer: key, goal_mode: MODE_FOR[key] })` with the mapped value.
3. Carry the value through the three redirect sites above, or persist it before
   the first redirect fires.

### It must stay changeable

`start.tsx` deliberately ships with **no pre-selection** — `selected` is
`draft.start_answer` with no default and Continue is disabled until the person
chooses. Pre-filling from a URL weakens that on purpose, so two things are
required if this is wired:

- The pre-filled answer must be visibly selected, not silently applied, so the
  visitor sees what was assumed and can change it before continuing.
- The screen's own promise stays true: "This changes as you learn — it is not a
  label you are stuck with."

## Pricing note (open product decision)

The site shows **Beginner $29 · Intermediate $59 · Pro $99** after each
walkthrough, per `docs/SITE-FUNNEL-SPEC.md`.

`apps/api/src/lib/kai/plans.ts` has `free $0 · pro $59 · vip $99`. So:

- $59 and $99 line up with `pro` and `vip`.
- **$29 has no plan behind it.** It is advertised on the website and cannot be
  bought anywhere.

Every CTA on the site therefore routes to the app handoff, never to a checkout.
Until the $29 tier exists in `plans.ts` (or the site's number changes), the
Beginner price is a marketing claim without a product — an owner decision, not
a build gap.

Related: `apps/api/src/lib/storefront.ts` enforces App Store rule 3.1.3(b) — the
*app* may show no price and no route to buy. The website is the intended
storefront, which is why prices live here and not in the app. If the site ever
calls the storefront API directly it must send `X-CheatCode-Client: web`, and
its origin must be added to `ALLOWED_ORIGINS` on the API project.
