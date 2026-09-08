# CheatCode UI design kit — v2

**Actual React Native components and 36 complete screen compositions.** The browser gallery renders the same source through React Native Web. It is not a second HTML implementation or a folder of mockup images.

Start with **[CLAUDE.md](CLAUDE.md)** before integrating. The existing app routes have not been replaced by this delivery.

## Included

- 44 reusable UI components, plus a preferences provider and a screen renderer.
- 36 named screen compositions spanning onboarding, Home, investing, trading, learning, progression, community, Kai and settings.
- 30 standalone SVG assets exported from the same component code: 24 icons, five belt emblems and Kai's orb.
- Twelve approved mockup boards with their corrected versions only.
- A browser gallery with working local interactions, width/text controls and data/error states.
- Strict typed data/action contracts, integration example, screen-to-component map and design rules.
- Native typecheck, server-render checks and an executable browser screenshot/interaction check.

## Open the gallery

From the repository root, with the existing mobile dependencies installed:

```sh
node packages/design-kit/scripts/build-gallery.mjs
python3 -m http.server 4179 --directory packages/design-kit/dist
```

Open `http://localhost:4179`. The packaged `dist` is prebuilt and can also be opened with `dist/index.html` in a local browser. Serving it is recommended for automated checks.

The gallery contains three views: **Screens**, **Components**, **References**. The state selector includes loading, load failure, empty data, missing candles, short setup, expired setup and failed message delivery. Data is illustrative. Messages, account creation, orders and notifications are local previews.

## Import into the app

```tsx
import {
  DesignKitProvider,
  AlertsScreen,
  SetupDetailScreen,
  TradeIdeaPreview,
  TradeChart,
  PriceLevels,
  MessageComposer,
} from '@/ui/design-kit';
```

Use a screen composition when replacing a full screen. Use its exported component objects when embedding a setup inside Kai, a room or an existing route. **Do not copy the visual hierarchy into a new pile of panels.**

See [INTEGRATION.md](INTEGRATION.md) for the host contract and safe-area/navigation ownership.

## Sources

| Path | Purpose |
|---|---|
| `apps/mobile/src/ui/design-kit/` | Native components and screen source |
| `apps/mobile/src/ui/tokens.ts` | Existing authoritative palette; no duplicate color theme |
| `apps/mobile/src/ui/fontFamilies.ts` | Pure font family names, shared by native typography and gallery |
| `packages/trade-ui/model.ts` | Shared OHLC geometry, price formatting and risk/reward math |
| `packages/design-kit/gallery/` | Browser host and isolated illustrative fixtures |
| `packages/design-kit/assets/` | Generated SVG assets and provenance manifest |
| `packages/design-kit/references/` | Approved image boards; visual direction, not runtime assets |
| `packages/design-kit/scripts/` | Build, render checks, asset export and browser proof runner |

## Verification

```sh
cd apps/mobile
./node_modules/.bin/tsc -p tsconfig.design-kit.json
cd ../..
node packages/design-kit/scripts/check-render.mjs
node --import ./apps/mobile/node_modules/tsx/dist/loader.mjs packages/trade-ui/model.test.ts
```

Export the vector assets again after changing their components:

```sh
node packages/design-kit/scripts/check-render.mjs --assets
```

Browser proof on a machine with Playwright Chromium installed, while the gallery server is running:

```sh
node packages/design-kit/scripts/verify-gallery.mjs
```

**Verified in this delivery:** native TypeScript; all 36 screen compositions render at default and enlarged typography; geometry renders with missing prices/candles, short setups and near-overlapping levels; shared financial-model tests; theme-generator consistency; gallery builds; SVG files parse.

**Not verified:** browser screenshot fidelity, real iOS/Android layout, device keyboard and screen reader behavior. The authoring browser blocked access to the preview; there are no fabricated screenshot proofs. `proof/STATUS.md` records the limit. Run the browser script and device review before declaring a pixel-level match.

## Runtime boundaries

The kit supplies UI, interaction state plumbing and display math. Your app supplies authentication, market prices, Kai responses, room membership/messages, video URLs/transcripts, assessment results, verified belt evidence, order execution, notification delivery and plan entitlements. No fixtures are imported by the native kit. No live services or production routes were changed.

The font-map extraction also updates `apps/mobile/scripts/gen-theme.mts`; include that small compatibility change when integrating.

The kit preserves Space Grotesk and JetBrains Mono, the five-tab model, and the existing palette source. It improves hierarchy and composition without installing another visual component framework.
