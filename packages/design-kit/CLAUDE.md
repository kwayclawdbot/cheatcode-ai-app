# Claude Code handoff — implement this kit, don't reinterpret it

The owner rejected the oversized gold card / gauge / boxed metric treatment. The approved direction is a visual trade object, quiet framing, readable typography and one clear action.

## Start here

1. Read `README.md`, `DESIGN-RULES.md`, `INTEGRATION.md` and `SCREEN-MAP.md` in this directory.
2. Open the local gallery and inspect the exact target screen. See `references/05-trade-ideas.webp` for the approved Alerts / Setup / Analysis board.
3. Import the corresponding **named screen composition** from `@/ui/design-kit`. Do not build a replacement from generic `Panel`, `Card` or gauge components.
4. Map existing app data into `KitData` and existing state into `KitState`. Bind `onAction` and `onSend` to the real services. Example data lives only in `gallery/fixtures.ts`.
5. Put the composition inside the existing route. Pass `showNavigation={false}` if Expo already supplies its tab bar. Pass safe-area insets exactly once. Include the `fontFamilies.ts`, `Text.tsx`, `fonts.ts` and `scripts/gen-theme.mts` compatibility changes.
6. Apply `DesignKitProvider` with the app's saved text scale / motion settings. Keep `useAppFonts()` in the application root.
7. Run the kit checks, browser proof runner, and device review. Capture the actual rendered screen at the target width. Compare to the approved board. Resolve composition, clipping and action-placement differences before integration is called complete.

## Import examples

- `AlertsScreen`, `SetupDetailScreen`, `ChartAnalysisScreen`: complete layouts.
- `TradeIdeaPreview`, `TradeChart`, `PriceLevels`, `RiskRewardBar`: reusable trade objects.
- `KaiMessage`, `MessageComposer`, `ConversationThread`, `CircleStories`: conversational identity.
- `OwnershipGrid`, `CandleAnatomy`, `LessonPath`, `BeltEmblem`, `SkillChecklist`: learning identity.

## Fidelity rules

- Do not put an entire screen inside a colored panel.
- Do not replace price geometry with a decorative line or a score gauge.
- Do not enlarge the grade beyond the small grade badge.
- Do not wrap each price in its own rounded colored card.
- Do not put a disclaimer over scroll content or hide the primary action behind a fixed overlay.
- Keep body text at 16px baseline; the chart and price strip should explain the setup before the paragraph.
- Keep community messages as conversation, with a visible neutral composer. Violet is for Kai.
- Keep circles circular. Their countdown represents actual remaining room lifetime.
- Keep Home chat-first and preserve real thread identities.
- Do not introduce a sixth Learn tab. Use the existing five-tab structure.
- The older kit in `src/ui/trade` remains for compatibility. The new v2 screen compositions use `src/ui/design-kit`; do not mix old gauge/card styling into them.

## Connect behavior correctly

A watch request is not a trade fill. A submitted order is not an active position. A profitable result is not proof of competence. A room change is not a trading-mode change. A local demo response is not Kai.

- Clear a message draft only after a successful send. Change `threadId` when switching or starting Kai conversations; bind it to the actual backend conversation.
- Preserve in-flight order state until the execution service confirms a fill or rejection.
- Use the approved video library IDs and assessment engine. The kit has player entry / transcript callbacks, not invented videos or completion evidence.
- Use server entitlements for included / excluded lists. Do not substitute generic paid-plan assumptions.
- Route account and billing actions to existing real flows.
- Hide unavailable actions or use the explicit disabled/loading/error state. Do not leave empty callbacks.

## Delivery status

This is a source kit. It is not integrated into production routes or pushed to GitHub by the authoring session. Native typing and server rendering passed; browser visual QA was blocked by the environment. Do not describe the mockups as automatically implemented just because the components compile.
