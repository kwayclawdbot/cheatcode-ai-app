PRODUCT UX AUDIT
Why Cheat Code AI Feels Convoluted
A consolidation plan for Home, Alerts, Community, Trade, Account and Kai
CORE DIAGNOSIS  The product has the right capabilities, but several different product models compete for control of the same user journey.

Executive assessment
The current build is impressively complete, but completeness has become visible complexity. Kai chat, opportunity scanning, brokerage workflows and community each introduce their own objects, labels and navigation patterns. Users must first understand the product architecture before they can act naturally.
The solution is not to remove the core capabilities. It is to consolidate them around one permanent asset workspace and give every primary tab a single, unmistakable responsibility.
Current experience
Required experience
Features appear as separate destinations
Capabilities attach to the user’s current decision
META exists as a symbol, setup, alert, chat and thread
META is one persistent asset workspace
Kai actions often route back to Home
Kai works in context without removing the user from the task
Screens expose internal product taxonomy
Screens use direct, plain-language actions
Most content receives equal card weight
Each screen has one dominant object and one primary action

1. The product has four competing mental models
The interface simultaneously behaves like four different applications:
Model
What users encounter
Where it competes
Kai assistant
Conversation, briefings, rich responses and research
Home and contextual actions
Setup scanner
Grades, confirmations, state, plan and evidence
Home, setup detail, Trade and Alerts
Brokerage
Symbols, charts, watchlists, orders and positions
Trade and symbol detail
Community
Rooms, setup discussions, sentiment and contributor context
Community and symbol detail

None of these models is wrong. The problem is that each behaves like the primary product. The user experiences handoffs between systems instead of one continuous decision environment.
2. The same asset is fragmented across too many objects
A single META idea may appear as a Home setup, a Trade symbol, a setup-detail object, an alert, a Kai conversation, a community discussion and eventually a plan or position. Although these objects are connected in the data model, they do not feel like one continuous place.
CONSOLIDATION RULE  The symbol must become the shared object. Trade is its permanent workspace; Kai is its intelligence layer; Alerts is its monitoring layer; Community is its human context.

Canonical asset workspace
Workspace view
Purpose
Overview
Price, chart, position/watchlist state, key levels and what changed
Kai
Interpretation, research, grade, scenarios and contextual conversation
Plan
Entry, invalidation, size, targets, order review and position state
Community
Relevant discussion, verified claims, sentiment and setup thread

A setup should become a state or module inside the symbol workspace—not a competing destination with its own duplicate chart, plan, evidence and actions.
3. Setup detail and symbol detail duplicate one another
Symbol detail currently contains
Setup detail currently contains
Price and chart
Price and chart
Mode lenses
Setup status and confirmations
Kai interpretation
Kai narration
Watchlist and alerts
Plan and fit
News and community
Evidence and education
Ask Kai / set alert / disabled order actions
Watch / build plan / ask Kai

Users have no intuitive reason to know when they should open “META” versus “the META setup.” The two-screen model introduces backtracking and makes connected information feel duplicated.
Recommendation: retain one symbol workspace. When Kai identifies a setup, surface a prominent setup module within that workspace. Deep setup information expands in place or through workspace tabs, while the symbol identity and chart remain persistent.
4. Home is both briefing and chatbot
Home currently combines mode, market status, timestamps, Kai messages, briefing objects, setup cards, conversation history and the composer. Every element is relevant, but the first screen does not establish a single priority.
HOME RULE  Kai should lead with one personalized priority and one next action. Conversation and secondary context follow.

Recommended Home hierarchy
1
Kai’s short opening statement: what changed and why it matters.
2
One dominant priority object: the setup, alert, position or portfolio decision requiring attention.
3
One primary action: Review, Respond, Watch or Open Trade.
4
A compact “Also watching” section for secondary items.
5
The persistent composer for questions and new tasks.

Example: “Good morning, Kway. One setup needs your attention.” The screen then shows META approaching its entry condition with a single Review setup action. The rest of the briefing remains available below.
5. Kai is visible everywhere but not fully contextual
Kai appears throughout the interface, but several Kai actions route the user back to Home with a prefilled prompt. This makes the user leave the chart, alert or discussion they were examining.
Location
Kai should do in place
Trade / asset
Explain the chart, research evidence, mark levels and compare scenarios
Alert
Explain what changed, revise the condition and show the relevant chart
Community
Summarize, verify claims, structure ideas and create alerts
Order review
Check plan fit, risk, buying power and potential outcomes
Home
Handle broad questions, cross-product tasks and full conversations

On mobile, Kai should open as a contextual sheet over the current screen. On desktop, Kai can occupy a persistent side panel. Home remains the full conversation workspace, but it is no longer the only place where Kai can operate.
6. Alerts exposes too many internal states
Needs Attention, Watching, Active Trades, Triggered and History are logically complete, but they make Alerts feel like another operational dashboard. “Active Trades” also conflicts with the Trade destination.
Simplified section
Contains
Attention
Triggered conditions, invalidations, grade changes and decisions required now
Monitoring
Price, setup, position, news, thesis and community conditions Kai is watching
History
Completed, expired, cancelled, dismissed and previously triggered alerts

Use filters for alert type rather than permanent top-level sections. Positions remain in Trade; Alerts only shows the monitoring event attached to those positions.
7. Trade does not yet fully satisfy the brokerage expectation
The Trade experience includes brokerage-like elements, but execution is disabled and the asset page is dominated by interpretation, evidence, alerts and community. It therefore reads as another research destination rather than the familiar financial operating layer users expect.
Required Trade hierarchy
1
Account value, daily change, buying power and paper/live status.
2
Positions, open orders and items requiring action.
3
Watchlist and recent symbols.
4
Search and market discovery.
5
Asset detail with price, chart and timeframe controls.
6
Persistent Buy and Sell controls that route through connected brokerage execution.
7
Kai interpretation and community context attached to the asset, not competing with it.

ROLE SEPARATION  Trade handles assets, accounts, charts, orders and positions. Kai handles interpretation, research, planning and feedback.

8. The interface exposes too much taxonomy
Terms such as setup, lens, mode, Live, Plan, Learn, Watching, draft alert, Kai analysis, evidence, fit and monitoring state are individually valid. Together they make beginners learn the application’s internal architecture.
Internal language
User-facing action
Setup evidence / Learn view
See why
Follow setup / draft default alert
Watch this
Monitoring condition
Set an alert
Plan object
Build a plan
Kai analysis object
Ask Kai
Community room association
Join discussion
Execution object
Buy or Sell

Advanced classifications can remain available as secondary detail, but the primary interface should communicate actions and outcomes in plain language.
9. Card saturation flattens hierarchy
Briefings, messages, setups, alerts, explanations, evidence, community, account context and empty states are all presented as cards. When every object has similar weight, the page becomes a stack of boxes and the user loses the main action.
Reserve strong cards for actionable or movable objects.
Render supporting metadata directly on the surface with spacing and typography.
Use dividers and section rhythm instead of wrapping every group in another container.
Give each screen one dominant object and one dominant action.
Move technical depth into progressive disclosure, sheets or expandable sections.
10. Mode creates hidden complexity
Day Trade, Swing and Invest alter Home, Trade, setups, alerts, community rooms, explanations and timeframes. Because the mode is stored in the profile and is not always easily changed, users may not understand why a screen has a particular interpretation.
Mode should become visible global context near the top of Home and Trade. Switching it should clearly update Kai’s briefing, opportunity horizon, default community room, chart timeframe, risk language and expected holding period. Remove independent mode “lenses” from the asset page when they duplicate the global state.
11. Revised responsibility of the five tabs
Tab
Single responsibility
Primary question answered
Home
Personalized Kai workspace and daily priority
What needs my attention?
Alerts
Monitoring and decision notifications
What changed?
Community
Human discussion, rooms and live sessions
What are members seeing?
Trade
Brokerage layer for assets, charts, orders and positions
What do I own, watch or want to trade?
Account
Identity, brokerage, subscription, preferences and safety controls
How is my experience configured?

12. Target user journey
The current journey contains too many intermediate objects and backtracks. The target journey should follow the financial decision itself.
Stage
User experience
Primary surface
Discover
Kai or the community surfaces something relevant
Home
Understand
User sees the chart, evidence, grade and explanation
Trade asset workspace
Decide
User watches it, builds a plan or prepares an order
Trade asset workspace
Execute
User reviews and confirms through the connected brokerage
Trade
Monitor
Kai tracks conditions, the plan and active position
Alerts + Trade
Review
Kai and the community contextualize the outcome
Trade + Community

13. Recommended consolidation decisions
1
Make the symbol the canonical shared object throughout the application.
2
Merge setup detail into the asset workspace as a stateful module.
3
Keep Home focused on one personalized priority and the Kai conversation.
4
Let Kai operate contextually through sheets or panels without routing away.
5
Reduce Alerts to Attention, Monitoring and History.
6
Give Trade the familiar brokerage hierarchy before layering Kai and community context.
7
Replace internal taxonomy with direct user actions.
8
Reduce card saturation and enforce one dominant action per screen.
9
Make Day Trade, Swing and Invest a visible global context.
10
Preserve decision history across discovery, research, alert, order, position and review.

14. UX acceptance criteria
A first-time user can explain the purpose of every primary tab after one session.
Opening META from Home, Alerts or Community leads to the same persistent asset workspace.
The user never has to choose between a symbol screen and a setup screen.
Kai can answer contextual questions without removing the user from the current screen.
Every primary screen presents one unmistakable next action.
Trade remains familiar to users of Robinhood or Webull before Kai-specific features are introduced.
Alerts contains no duplicate position-management destination.
Mode changes are visible and predictably affect the entire product.
Secondary evidence, education and technical information remain available without dominating the default view.
The full decision chain remains connected and auditable from discovery through review.
Final recommendation
Do not redesign the product as five separate destinations. Redesign it as one connected decision system with five clear entry points. The current capabilities should remain, but their visible structure must collapse around the asset and the user’s next decision.
NORTH STAR  Home tells me what matters. Trade lets me understand and act. Alerts monitors what I care about. Community adds human context. Kai connects everything.

