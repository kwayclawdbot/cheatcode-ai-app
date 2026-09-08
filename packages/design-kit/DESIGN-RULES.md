# Visual system

## The composition

The trade itself is the hero. Start with a compact company identity, then the price story, then a clear action. An A grade is a small badge, not a gauge. The eye should find entry, stop and target without opening another panel.

A screen has a quiet header, a scrolling task surface, and—where conversation is useful—a docked composer above navigation. Content never scrolls beneath an opaque floating disclaimer. Utilities do not receive a decorative Kai composer.

## Palette and semantic meaning

All runtime colors come from `apps/mobile/src/ui/tokens.ts`. The gallery's ivory exterior is presentation chrome, not a second app theme.

| Token | Meaning |
|---|---|
| `color.bg` | Warm near-black ground |
| `color.text` | Primary ivory text |
| `color.muted` | Readable secondary text; do not use the older dim token for explanatory copy |
| `color.volt` | User action or selection |
| `color.violet` / `violetLight` | Kai intelligence and annotation |
| `color.cyan` | Market price and entry |
| `color.red` | Planned downside / stop |
| `color.green` | Planned upside / target |
| `color.gold` | Compact grade cue |
| `belt.*` | Human rank identity; never financial status |

Do not put every accent on every screen. Neutral surfaces carry conversation and content. Color earns its place by conveying meaning.

## Geometry

- Horizontal gutter: 20. Main section gap: 24. Object gap: 16. Tight supporting gap: 6–8.
- Controls: 48px minimum touch target; primary action 52px minimum.
- Buttons: 14px radius. A contained trade preview: 16px. Hairline surface borders. A whole screen has no outer card.
- Screen content max width: 560. The gallery uses 320 / 390 / 430 device widths.
- Header stays compact. Main task scrolls; composer and five-tab navigation stay in the dock. The host owns safe areas.
- Enlarged price text switches the price strip to vertical layout rather than clipping numbers.

## Typography

- Keep the existing four Space Grotesk font faces. Use family names, not synthetic `fontWeight` for a custom face.
- Use JetBrains Mono for prices, balances and explicit numeric quantities.
- Screen heading: 28/32, bold. Body: 16/~22. Supporting copy: 13/~18. Small metadata: 11–12.
- Avoid long all-caps prose. Eyebrows are short orientation labels.
- `KitText` applies the saved in-app text multiplier; native OS font scaling remains enabled. Test both together on device.

## Product objects

**TradeChart** uses actual OHLC values and shared geometry. Target and stop zones have proportional vertical position. Labels use leaders to separate nearby levels. Essential numeric values remain readable in `PriceLevels`, independent of the chart SVG. Missing data never becomes invented candles.

**RiskRewardBar** computes long and short geometry from the supplied levels. The visual is proportional; a missing or invalid plan displays unavailable.

**OwnershipGrid** represents an explicitly hypothetical 100-share company. The 48px increment/decrement controls are the accessible way to select ownership. Small tiles communicate the result; they are not tiny mandatory tap targets.

**CircleStories** uses circular identity and a remaining-lifetime ring. Permanent rooms should be distinguished from expiring topical circles in the host's room data.

**BeltEmblem** is an actual woven-belt vector. **SkillChecklist** carries the evidence: knowledge, chart interpretation, planning and verified process. Profit does not automatically advance rank.

**MessageComposer** distinguishes Kai from community, keeps its draft on failure, and prevents duplicate concurrent sends. The host must return a rejected promise for failed delivery.

## Motion

Only the product reveal uses staged entrance motion. It is brief, does not block the next action, and is disabled by OS or in-app reduced-motion preference. No ambient pulsing cards, animated P&L numbers or endless shimmering panels.

## Acceptance at integration

A compiler cannot certify visual quality. Compare an actual device/browser rendering to the approved board. Check the task hierarchy, font loading, chart labels, price strip, composer, scroll boundaries and safe areas. Inspect empty/loading/error data, the software keyboard, 320px width and enlarged text. Record deliberate differences instead of silently calling a different design a match.
