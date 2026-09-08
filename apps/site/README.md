# apps/site — cheatcode.com

The marketing site, built as the product demo it is meant to be: the visitor
picks one of three doors, walks a clickable simulation of the app surfaces that
serve that door, and only then sees a price.

Spec: `docs/SITE-FUNNEL-SPEC.md`.
Handoff contract into the app: `docs/SITE-APP-PARAM-CONTRACT.md`.

Live: **https://cheatcode-ai-site.vercel.app** (the owner points cheatcode.com
at this when DNS is ready).

## The split

`src/app/page.tsx` renders both experiences and lets CSS choose, so a phone
never sees a flash of the wrong one and crawlers still get the full landing
copy:

- **< 900px** — `Funnel`: selector → walkthrough → plan. It behaves like the
  app. There is deliberately no marketing scroll.
- **≥ 900px** — `Landing`: the full brand story, with the same walkthrough
  available inside a phone frame from the "Find your path" section.

## Layout

```
src/sim/personas.ts   the three doors, their beats, and their plan
src/sim/handoff.ts    the ?path= contract and the app deep link
src/components/       Walkthrough (beat machine), PathSelector, PlanReveal, Landing
src/components/surfaces/
    kit.tsx           shared app primitives — ticker mark, belt chip, Kai orb,
                      grade gauge, the two speech bubbles
    learn|swing|pro   the beats, one exported component per beat
    registry.tsx      beat id → surface
```

Everything on screen is a **web rendition of a real app surface**, not a
screenshot. The tokens in `src/app/globals.css` are ported verbatim from
`apps/mobile/src/ui/tokens.ts`, including the grammar that governs them:

```
volt   = the user acting        violet = Kai
cyan   = market data            green / red / gold = financial semantics only
```

All data is staged and every walkthrough says so on screen. Nothing on this
site is a live quote, a real member, or a claim about trading results.

## Develop

```sh
npm install
npm run dev
```

## Deploy

Its own Vercel project, `cheatcode-ai-site`, with Root Directory `apps/site`.
Unlike `apps/api` it imports nothing from `packages/shared`, so it deploys from
its own directory:

```sh
cd apps/site
npx vercel deploy --prod --yes
```

## Verify

Walks all three simulations at both breakpoints against the deployed URL and
writes screenshots to `proof/`:

```sh
node scripts/walk.mjs [url]
```

## Curiosity-led funnel

`Walkthrough.tsx` now controls the cinematic reveal, three interactive feature
chapters, two branching checkpoints, and personalized plan. The branch definitions
are in `src/sim/journey.ts`; compact visual surfaces and motion are in
`JourneySurfaces.tsx` and `Journey.module.css`. Desktop embeds the same journey.
The ownership lesson uses a fictional company with exactly 100 shares, so selecting
10 shares accurately demonstrates 10% ownership. All examples remain illustrative.
Reduced-motion settings disable the reveal and drawing animations.

The old `scripts/walk.mjs` linear screenshot harness and existing proof images
predate this redesign; they are not validation of the new branching journey.
