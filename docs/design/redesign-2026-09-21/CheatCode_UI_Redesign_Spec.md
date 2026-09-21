# CheatCode AI — Mobile UI Redesign Specification

## Product direction

CheatCode AI should feel like a premium market-intelligence product: decisive, fast, clear, and human. It should not resemble a neon trading terminal or a generic AI dashboard.

The interface has four visual rules:

1. Orange owns the CheatCode brand and primary actions.
2. Violet appears only when Kai is speaking, thinking, or taking an AI action.
3. Green and red are reserved for market meaning.
4. Every screen has one obvious focal point and one primary action.

## Foundation tokens

### Colors

| Token | Value | Use |
|---|---:|---|
| Canvas | `#0C0C0F` | Primary app background |
| Surface | `#151518` | Cards and navigation |
| Surface raised | `#1C1C20` | Selected and modal surfaces |
| Border | `rgba(242,242,240,.12)` | Quiet separation |
| Text primary | `#F2F2F0` | Headlines and key values |
| Text secondary | `#9A9892` | Supporting information |
| Brand orange | `#FF5A1F` | Active navigation and actions |
| Orange light | `#FF8A3D` | Gradient highlight only |
| Kai violet | `#7B45F5` | AI states only |
| Market positive | `#12A150` | Targets, gains and confirmations |
| Market negative | `#E5484D` | Stops, losses and warnings |
| Grade gold | `#D7A93A` | A/A+ setup accent only |

### Typography

- Interface: Geist Sans.
- Prices, tickers, timestamps, percentages and R multiples: Geist Mono.
- Screen title: 32px/38px, 700.
- Section title: 20px/26px, 650.
- Card title: 17px/22px, 650.
- Body: 15px/22px, 400.
- Meta: 12px/16px, 500.
- Key price: 26px/30px, 650 mono.

### Geometry

- Base spacing unit: 8px.
- Screen gutters: 20px.
- Card spacing: 12px.
- Card radius: 18px.
- Control radius: 14px.
- Pill radius: 999px.
- Minimum touch target: 44×44px.
- Default border: 1px `Border`.
- Card shadow: `0 10px 30px rgba(0,0,0,.24)`.

## Global shell

- Remove the floating blue settings gear from every screen.
- Use the orange circle/diamond mark in the top app bar.
- Replace the lime accent with orange throughout.
- Use a five-item bottom dock: Home, Alerts, Community, Trade, Account.
- Active navigation is orange; inactive navigation is secondary text.
- Keep icons on one consistent 22px optical grid with 1.75px strokes.
- Use translucent blur only for persistent navigation and composers.

## Kai Home

- Lead with a single Kai briefing card, not a decorative control panel.
- Greeting: “Good morning, Kway.”
- Primary insight: “PURR is the one worth watching — entry plan is ready.”
- Context chips: Watchlist, News, Technicals.
- Primary action: Review setup.
- Secondary action: Morning briefing.
- Keep Learning Path below the briefing as a compact progress card.
- Composer stays persistent; voice control is violet because it invokes Kai.

## Alerts

- Use one segmented selector for Day Trade, Swing and Invest.
- Follow with Active, Community and History tabs.
- Alert card order: ticker/mode → status → current price and R → entry/stop/target.
- Do not tint the whole card by grade.
- Grade appears as a compact badge plus a subtle left-edge indicator.
- A/A+ may use restrained gold; B uses neutral/violet; pass uses gray.
- Values use semantic colors only: entry neutral/off-white, stop red, target green.

## Community

- Replace raw long usernames with display names and optional handles.
- Add a compact Live Rooms strip before the feed.
- Convert calls into structured trade cards with ticker, direction, entry, stop and target.
- Keep reactions, reply and overflow controls close to each message.
- Composer contains attachment, message field, `@Kai` shortcut and orange send action.

## Trade Detail

- Top section: ticker, direction, grade and current R multiple.
- Chart uses entry, stop and target levels with matching semantic colors.
- Follow with a compact setup summary.
- Kai thesis receives a violet outline/glow; all ordinary analysis remains neutral.
- Checklist: Trend, Catalyst, Volume, Risk.
- One primary action: Add to watchlist.

## Component inventory

- App bar
- Brand mark button
- Market-mode segmented control
- Section tabs
- Alert/setup card
- Setup-grade badge
- Price triplet
- Status chip
- Kai briefing card
- Context chip
- Learning-progress card
- Live-room card
- Structured trade-call message
- Chat composer
- Candlestick chart panel
- Kai thesis card
- Setup checklist
- Floating bottom navigation dock

## Remove from the current UI

- Floating blue gear
- Lime primary accent
- Cyan price styling
- Full-card grade gradients
- Multiple competing font personalities
- Decorative terminal brackets and HUD ornament
- Excessive uppercase mono text
- Long raw usernames
- Duplicated labels and explanatory sentences
- More than one dominant CTA per screen

## Acceptance checklist

- Every screen is readable in a five-second scan.
- Kai violet never appears on ordinary controls.
- Orange consistently indicates brand and action.
- Green/red only communicate market state.
- Every interactive control meets a 44px touch target.
- All prices align on a consistent numeric grid.
- Cards use the same padding, radius and border system.
- The bottom dock stays identical across all primary screens.
- No floating settings control overlaps content.

## V2 interaction upgrade

### Kai is an agent, not a dashboard

- Kai initiates the conversation before the user asks a question.
- The opening message summarizes relevant watchlist, position and calendar changes.
- Messages may contain interactive tools: daily briefs, setup cards, comparisons, alerts and checklists.
- Kai exposes follow-up actions beneath each response instead of forcing users to formulate every prompt.
- The composer accepts questions and delegated tasks: “Ask Kai or give Kai a task…”
- Kai confirms what it will monitor next: “Kai will update you if volume confirms.”
- Maintain conversation history so each session feels continuous rather than reset.

### Alert cards are market instruments

- Add a microchart to every expanded alert card.
- Featured cards contain a stop–entry–target range visualization.
- Show current price, daily change, grade and R multiple before supporting metadata.
- State labels use verbs: Entry triggered, Watching resistance, Target 1 hit.
- Secondary analytics may include volume, pattern, confidence, support and resistance.
- Use the orange edge glow only on the single highest-priority alert.
- Support two densities: expanded priority card and compact supporting card.
- Entire card opens detail; bookmark remains the only separate trailing control.

### Community combines rooms and a social feed

- The top rail contains live rooms/channels with active rings and participant counts.
- Suggested rooms: War Room, Swing Desk, Investors, Wins and Ask Kai.
- Feed tabs: For You, Following, Trade Calls and Media.
- Standard posts include display name, handle, time, text and reply/repost/like/bookmark actions.
- Trade calls are embedded structured objects inside posts, not the entire post format.
- Chart previews and result cards are first-class media.
- Threads display reply count and participant avatars.
- Live-room invitations appear inside the feed with a clear Join live action.
- Composer supports media, chart attachment and @Kai assistance.

### Recommended data objects

```text
KaiMessage
  author, timestamp, body, context_cards[], actions[], follow_up

AlertCard
  symbol, mode, direction, grade, state, current_price, day_change,
  entry, stop, targets[], r_multiple, sparkline[], analytics[], priority

CommunityPost
  author, handle, timestamp, body, media[], trade_call?, result?,
  reply_count, repost_count, like_count, bookmarked

LiveRoom
  name, topic, live, listener_count, speaker_avatars[]
```
