# Cheat Code AI — mobile (Expo + expo-router)

The client for the v1 slice: sign up/in, the Kai onboarding walkthrough, and the
Home Kai workspace behind the L6 tab bar (Home · Alerts · Community · Trade ·
Account).

Design truth is `design/artboards/*.html` — the DOM and inline styles, not the
PNGs. Tokens are lifted from those files into `src/ui/tokens.ts`; when the
artboard and `docs/14_PALETTE_LOCK_VOLT_VIOLET.md` disagree, the artboard wins.

Colour grammar, enforced throughout: **volt = you**, **violet = Kai**,
**cyan = the market**, green/red/gold = financial semantics only.

## Layout

```
src/app/                 expo-router routes
  (auth)/                welcome · sign-up · sign-in
  (onboarding)/          kai · goal · risk · summary · learn
  (tabs)/                home · alerts · community · trade · account
src/ui/                  tokens, fonts, and every primitive the artboards use
src/lib/                 supabase client, session gate, api client, SSE, fixtures
scripts/proof.mjs        Playwright gate (fixtures)
scripts/proof-live.mjs   Playwright gate (real session + real Kai)
proof/                   screenshots + artboard comparisons
```

`packages/shared/api.ts` is imported **type-only** — zod stays server-side and
the import is erased at build, so Metro never resolves outside `apps/mobile`.
All contract → view-model mapping lives in `src/lib/adapters.ts`.

## Running

```bash
npm start                      # phone via Expo Go
npm run web                    # browser
EXPO_PUBLIC_FIXTURES=1 npm run web   # every screen from local fixtures, no network
```

Env (`.env`, git-ignored — copy from `supabase/.env.local.example`):
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE`.
On a physical phone use the Mac's LAN IP, not `127.0.0.1`.

## Verification

```bash
npx tsc --noEmit
npx expo export --platform web

# fixtures gate
EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8081
node scripts/proof.mjs

# live gate (needs supabase start + apps/api on :3000)
npx expo start --web --port 8082
node scripts/proof-live.mjs
```

`proof/compare-home.png` and `proof/compare-onboarding-kai.png` put the artboard
and the build side by side at 390×844. Element-level match is the bar.
