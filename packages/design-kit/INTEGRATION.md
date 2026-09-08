# Integration without visual drift

## Use the composition as the screen

This is the missing layer between a mockup and a real app. `AlertsScreen` includes the page heading, category rail, setup object, secondary rows, source text, composer and navigation ownership. Importing only `TradeChart` into the old oversized alert card will retain the old look.

```tsx
import {
  AlertsScreen,
  DesignKitProvider,
  type KitData,
  type KitState,
  type KitAction,
} from '@/ui/design-kit';

// Props come from your authenticated app controller, never the gallery fixtures.
export function AlertsRouteView(props: {
  data: KitData;
  state: KitState;
  insets: { top: number; bottom: number };
  onAction: (action: KitAction) => void;
  onSend: (text: string, context: {
    screen: string; roomId: string; threadId?: string; ideaId: string;
  }) => Promise<void>;
}) {
  return (
    <DesignKitProvider
      textScale={props.state.textScale}
      reducedMotion={props.state.reducedMotion}
    >
      <AlertsScreen
        {...props}
        showNavigation={false}
      />
    </DesignKitProvider>
  );
}
```

Keep your existing tab navigator and set `showNavigation={false}`. Hide its duplicate header when using `ScreenFrame`. Pass a bottom inset of zero if the parent navigator already applies it. If using the kit's standalone `BottomNavigation`, the outer shell owns the actual safe-area bottom inset. The kit does not draw a fake system status bar; only the gallery does.

Keep `useAppFonts()` in the app root. The pure `fontFamilies.ts` extraction changes no font names or font loading behavior. The browser build copies the existing installed font files for a network-independent preview.

## Choose the right level of reuse

| Need | Import |
|---|---|
| Replace Alerts entirely | `AlertsScreen` |
| Replace expanded setup | `SetupDetailScreen` |
| Embed a setup in a Home conversation | `TradeIdeaPreview` |
| Price story with selectable explanations | `TradeChart`, `PriceLevels`, `KaiMessage` |
| Community room UI | `CommunityScreen` or `CircleStories`, `ConversationThread`, `MessageComposer` |
| Beginner teaching mechanic | `OwnershipGrid`, `CandleAnatomy` |
| Full lesson / progression screen | `OwnershipLessonScreen`, `TrainingPathScreen`, `BeltProfileScreen` |
| Existing app shell, customized content | `ScreenFrame`, primitive objects and host-owned navigation |

## Host view models

`contracts.ts` defines `KitData`, `KitState` and the discriminated `KitAction` union. `KitData` is the gallery/composition host's shared view model, so complete compositions receive the whole model. If your route loads only one domain, compose the exported objects directly using their narrower props instead of fetching unrelated domains to satisfy the reference host.

Do not assume gallery fixtures describe the current subscription, order, company, lesson availability or market. They demonstrate appearance only.

### Trade adapter

Map the app's setup identifier, ticker, company name, title, brief thesis, direction, grade, selected target, stop, entry, lifecycle status and real OHLC candles into `TradeIdea`. Choose an actual target when the service has several. Pass a visible source/as-of label. Missing prices are `null`; missing candles are `[]`. Do not substitute sample bars.

The kit reuses the existing ticker logo API through `TickerMark`. Production normally leaves `noLogo` false. The isolated gallery explicitly sets it true to demonstrate the branded ticker-letter fallback without network dependencies. It does not bundle unlicensed company-logo downloads.

### Chat adapter

`onSend` receives text and `{ screen, roomId, threadId, ideaId }`. Route to the current room or Kai thread. Resolve only after the send was accepted; reject on failure. The composer clears the submitted draft after success, retains it on failure, and ignores duplicate concurrent sends. The host owns cross-screen/account draft persistence; the component retains a draft only while mounted.

Use `open-thread` and `new-thread` to update the actual backend conversation ID and message list. Switching a room must update only the room context. The caller provides message identities, belt rank and timestamps.

### Learning adapter

Map authored availability into `Lesson.state`: `available`, `complete`, `locked`, `coming`. Coming lessons cannot be opened. `complete-lesson` requests assessment from the host; the view does not award competence or increment server progress. `play-video` and `open-transcript` receive the lesson ID; resolve them against the approved YouTube library. Pass real assessment evidence into `SkillChecklist`.

### Order adapter

`submit-order` carries `{ ideaId, quantity, execution }`. The app must perform authoritative validation, confirmation where appropriate and service submission. The UI calculates display math only. Route to `order-pending` after submission, then use the real order events to move to position or failure. Do not manufacture a fill after a timer.

Keep live/paper explicit. The fixture host is paper-only by default. A visible planned stop is not a guaranteed execution price.

### Account adapter

Persist `state` changes through the existing preference store. Provide device delivery status from the notification service, not the toggle alone. Entitlements drive both membership lists. Route privacy, sign-out, signup and early access through existing services. The gallery creates no real accounts or messages.

## Loading and failures

- Set `loadState="loading"` while a view model is unavailable.
- Set `loadState="error"` and `errorMessage` for a load failure. Bind `retry` to a real refresh.
- Empty arrays produce empty Alerts or conversation content; use `FeedbackState` for host-specific empty contexts.
- Pass `busy` during submissions; the action disables while pending.
- Keep stale data visibly labeled on the offline screen. Disable actions that require current market/account data in the host.

## Web use

The preview compiles **these native files** using `react-native-web` and `react-native-svg`'s web entry. There is no maintained second set of v2 React DOM components. The existing Next site can either embed a built gallery as a design-only reference, or adopt a React Native Web module boundary intentionally. Do not add the entire gallery or its fixtures to the public funnel bundle.

For marketing walkthroughs, a dedicated host should retain persona/interests and route the same demo objects through curiosity checkpoints before the plan. Keep pre-signup navigation separate from the authenticated app's five tabs. `ProductReveal`, `PersonalPlan` and the onboarding screen compositions can be reused without changing the app's authenticated routing.

## Review before merging

1. Inspect `references/` and the corresponding gallery screen.
2. Connect the route using the composition, then test with its real data.
3. Use the included browser proof runner at 320, 390 and 430 widths. Review screenshots; absence of overflow is not visual sign-off.
4. Check larger text, keyboard opening, safe areas and VoiceOver/TalkBack on devices.
5. Compare the rendered result to the approved hierarchy. Resolve deliberate differences with the owner; do not relabel a generic card treatment as the same design.
