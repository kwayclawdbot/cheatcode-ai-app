LOCKED UX DIRECTION
Actionable Alerts & Chart-First Trade Portal
The elevated successor to Cheat Code SMS alerts, connected directly to chart analysis, Kai and brokerage execution
PRODUCT DECISION  Alerts are complete trade objects—not notifications. Every card explains the opportunity, displays the plan and routes directly into the relevant Trade Portal.

Purpose
This specification defines the final Alerts experience and its integration with the chart-first Trade Portal. It converts the immediacy of the original Cheat Code SMS alert into a richer, visual and continuously monitored decision object without turning the app into a dense trading terminal.
Locked relationship
Surface
Single responsibility
Home
Kai identifies the user’s most important current decision.
Alerts
Kai delivers complete actionable opportunities and monitored trade developments.
Trade
The user works the live chart with Kai and prepares or manages execution.
Community
Members discuss the asset while Kai verifies relevant claims.
Account
The user controls brokerage, risk, delivery and explanation preferences.

Core principles
One standard alert-card grammar across Active, Watching and History.
Grade quality, market direction, risk and action colors retain separate meanings.
The alert is understandable without opening the chart.
Opening an alert preserves ticker, timeframe, levels, trigger event, thesis and Kai context.
No generic alert-detail destination sits between the card and Trade Portal.
Kai advises and prepares; the user confirms every financial action.
Visual source of truth
The approved mockup demonstrates the intended hierarchy: rich Active and Watching cards followed by a direct transition into a persistent chart workspace with Kai beneath it.

Figure 1. Active alert, Watching alert and chart-first Trade Portal.
INTERPRETATION  The card contains the decision summary. The Trade Portal contains the working environment. Kai connects the two without resetting context.


1. Alerts information architecture
Alerts contains exactly three top-level states. Notification delivery status, alert type and trading mode are filters—not additional permanent sections.
Section
Meaning
Typical contents
Active
A material event occurred and may require a decision.
Ready setup, entry reached, grade change, stop/target approach, thesis change, exit event.
Watching
Kai is monitoring a complete idea whose condition has not triggered.
Waiting for price, volume, confirmation, catalyst, thesis change or position event.
History
The object is no longer active but remains auditable.
Executed, closed, missed, expired, invalidated, dismissed or cancelled.

State rules
A card moves to Active only after a verified event, not because monitoring is enabled.
Watching cards remain complete trade ideas, including preliminary entry, stop, targets and expiration.
History preserves the original alert snapshot plus outcome and event timeline.
A position-related event may appear in Active, but position management remains inside Trade.
Opening any card routes to Trade Portal with the alert context loaded.
Sorting
Section
Default order
Active
Required action, severity, freshness and personalized relevance.
Watching
Distance to condition, quality grade and expiration.
History
Most recently resolved first.

2. Standard actionable alert card
Every alert uses the same underlying component. Sections may collapse responsively, but data semantics and action placement remain consistent.
Card region
Required content
Identity
Company logo, ticker, company name, mode, direction and instrument type.
Quality
Oversized letter grade, supporting numerical score and grade-family border treatment.
Event
Plain-language headline, what changed and trigger timestamp.
Company summary
One or two beginner-friendly sentences describing the business and relevant context.
Trade plan
Current price, entry, stop, targets, risk/reward, hold expectation and expiration.
Scorecard
Mode-specific components, points earned, maximum points and total.
Kai interpretation
Why the trade matters, what confirms it and what could invalidate it.
Personal fit
Estimated risk, rule fit, concentration, limits and material conflicts.
Community
Sample size, common level, sentiment and verification status; always secondary.
Action
One state-driven primary action plus restrained secondary controls.


3. Card content specification
Header
Ticker and company name are primary; the logo is supporting identity.
Show Day Trade, Swing or Invest as the mode.
Show equity, call, put, ETF or other instrument explicitly.
Display grade and 0–100 score together.
Display Triggered, Watching, Invalidated, Position active or Closed as a separate state.
Always include source timestamp and market-data freshness.
Company summary
The default summary is two sentences maximum. It explains what the company does and why it is relevant to the current event. Market cap, sector, earnings and catalysts expand on request.
EXAMPLE  Meta Platforms owns Facebook, Instagram and WhatsApp. Its shares are trading with elevated volume after buyers reclaimed a major intraday level.

Alert message
The message must stand alone like a premium SMS alert: ticker, event, price condition, confirmation and next action are understandable without opening the chart.
EXAMPLE  META reclaimed $504 with 1.6× volume. Three five-minute candles held above the trigger, making the setup actionable.

Trade information
Field
Requirement
Direction
Long, short, call, put, accumulate, reduce or rebalance.
Current price
Include timestamp and freshness.
Entry
Condition plus numeric area or limit.
Stop
Numeric level and plain-language invalidation.
Targets
At least first target; additional targets optional.
Risk/reward
Calculated using intended entry and primary stop/target.
Expected hold
Intraday range, days/weeks or long-term horizon.
Expiration
When the setup or monitoring condition becomes stale.

Options extension
Show the underlying plan first. Contract details expand beneath it: expiration, strike, type, bid/ask, open interest, volume, spread quality, estimated premium and maximum contract risk. Never let contract selection obscure the underlying invalidation.
4. Grade and qualitative scorecard system
The grade is the immediate quality signal. Its numerical score is supporting detail, while the scorecard explains the grade through qualitative, glanceable evidence rather than competing point fractions.
GRADE HIERARCHY  Display the grade in a 72–88 px mobile medallion or equivalent dominant object. The letter grade is large; the 0–100 score is small. A user should recognize A-, B+ or another grade before reading the headline.

Mode
Five default components
Day Trade
Trend; price structure; volume; risk/reward; market alignment.
Swing
Trend; entry quality; catalyst risk; risk/reward; market alignment.
Invest
Business quality; valuation; financial strength; growth outlook; portfolio fit.

Component visualization
Element
User-facing treatment
Label
Trend, Structure, Volume, Risk / Reward and Market.
Status
Strong, Confirmed, Healthy, Forming, Waiting, Favorable, Supportive or Neutral.
Signal
Three-to-five segments, a check state, dots or a short meter—whichever best matches the evidence.
Evidence
Expandable explanation and sources. Internal points remain part of the grading engine only.

Never display component fractions such as 18/20 or 19/20. Internal weights may calculate the overall grade and 0–100 score, but component assessment is presented as visual strength plus plain-language status.
Grade bands
Score
Grade family
Treatment
90–100
A+ / A
Gold gradient border; highest emphasis.
85–89
A-
Gold gradient border; slightly restrained.
80–84
B+
Violet gradient border.
70–79
B / B-
Violet-to-graphite border.
60–69
C family
Amber-to-graphite border.
<60
Unqualified
Neutral treatment; not promoted as actionable.

Grade borders express setup quality only. Gold never means profit; green/red never express grade. Bearish A-grade setups still receive gold treatment.

5. Visual and interaction system
Semantic role
Color
Use
Primary action
Volt #C8FF00
CTA, selected navigation and explicit user action.
Kai intelligence
Violet #8B5CF6
Kai messages, analysis, tools and chart control.
Market information
Cyan #32D6FF
Price levels, data context and neutral annotations.
A-grade quality
Gold #FFC857
Oversized grade medallion and restrained gradient perimeter.
Positive
Green #35D07F
Confirmed positive movement, targets and gains.
Risk
Coral #FF5A5F
Stops, invalidation, loss and destructive action.
Foundation
Carbon / Graphite
Canvas and elevated surfaces.

Collapsed mobile card
Identity and mode with an oversized, instantly legible letter grade; the numerical score is secondary.
Alert headline and what changed.
Short company summary.
Entry, stop, target and risk/reward strip.
Qualitative scorecard indicators with visual strength states—never /20 fractions.
One short Kai interpretation.
One primary CTA.
Expandable detail
Full scorecard evidence.
Technical and beginner explanations.
Complete thesis and scenarios.
Contract information.
Personal risk-fit calculations.
Community intelligence.
Sources, event history and delivery log.
Primary actions by state
State
Primary action
Destination
Watching
Open chart
Trade Portal with monitored condition marked.
Forming
Keep watching
Remain monitored; show edit/pause controls.
Ready
Review trade
Trade Portal with Alert or Plan context.
Entry reached
Open Trade Portal
Chart centered on trigger event.
Planned
Prepare order
Order ticket prefilled from reviewed plan.
Order pending
Manage order
Order state and chart.
Position active
Manage trade
Position context with stop/target events.
Invalidated
See what changed
Chart replay and Kai explanation.
Closed
Review outcome
Debrief and original alert comparison.

6. Alert-to-Trade Portal routing
There is no generic alert-detail screen. Selecting an alert opens the canonical asset workspace inside Trade and restores the exact event context.
Preserved context
Requirement
Identity
alert_id, setup_id, symbol, instrument and mode.
Chart
timeframe, visible range, trigger candle and trigger timestamp.
Levels
entry, stop, invalidation, targets and community-mentioned levels.
Reasoning
original thesis, grade snapshot, score components and Kai explanation.
Monitoring
condition, progress, state history and last evaluation.
Execution
plan, brokerage capability, account, order and position references.
Community
related room/thread, verified claims and sentiment snapshot.

OPENING MESSAGE  This is the META alert you opened. I marked the trigger, entry area, stop and first target on the chart.


7. Chart-first Trade Portal
Trade opens as a working chart—not a portfolio dashboard. Account, watchlist, positions and search remain accessible through compact header controls, drawers or sheets.
Mobile hierarchy
Layer
Content
Top bar
Ticker switcher, current price, market state, paper/live account, search and drawers.
Chart
TradingView-style chart occupying the dominant portion of the screen.
Context switcher
Kai, Alert, Plan and Community; Kai selected by default.
Working panel
Conversation or selected context while the chart remains visible.
Composer
Persistent “Ask Kai about this chart…” input.
Execution
State-driven CTA or order ticket opened intentionally.

Kai chart-control commands
Mark the level that triggered this alert.
Switch to the daily or five-minute chart.
Show what invalidates the setup.
Mark entry, stop and targets.
Zoom into the trigger candle.
Compare with the prior session.
Highlight the community’s most-mentioned level.
Remove, hide or explain an annotation.
Create or modify an alert from a drawn level.
Prepare the trade from the reviewed plan.
Annotation requirements
Field
Required value
Identity
Unique annotation ID and associated symbol.
Geometry
Price, time range, coordinates and chart timeframe.
Meaning
Trigger, entry, support, resistance, stop, invalidation, target or note.
Reason
Plain-language explanation of why Kai placed it.
Provenance
Kai, user, community or imported plan.
Lifecycle
Created, updated, valid, invalidated, hidden or deleted.
Control
User can inspect, edit, hide and delete every Kai annotation.

Desktop adaptation
Desktop uses a watchlist/positions/alerts drawer on the left, persistent chart in the center and Kai conversation with rich artifacts on the right. The order ticket opens intentionally without replacing the chart.
8. Kai behavior and rich artifacts
Kai chat is the default panel beneath the chart. Rich objects appear inside the conversation only when relevant, preventing permanent stacks of setup, evidence, news, plan and community cards.
Answers remain concise before expandable evidence.
Chart changes occur in place and are narrated.
Kai clearly distinguishes market data, independent analysis and community sentiment.
Kai never claims an order was accepted, filled or monitored before confirmation.
Kai’s assessment is labeled as analysis, not a guarantee.
Order preparation never equals order submission.

9. Data, API and state requirements
Object
Minimum contract
Alert card
identity, company_summary, mode, direction, grade, score, score_components, state, event, thesis, quote, trade_plan, fit, community, timestamps.
Score component
key, label, qualitative_status, signal_strength, internal_weight, explanation and evidence references.
Trade plan
entry condition/zone, stop, invalidation, targets, expected hold, expiration, risk/reward and sizing suggestion.
Route context
alert_id, symbol, timeframe, focus timestamp, annotation set and selected context panel.
Chart annotation
geometry, semantic type, provenance, reason, lifecycle and user visibility.
Event history
state transition, timestamp, source, data snapshot and user/Kai action.

Lifecycle
Transition
Rule
Watching → Active
Verified condition or material change creates an actionable event.
Active → Watching
User defers action and condition remains valid.
Active → Planned
User reviews and saves a complete plan.
Planned → Order pending
User confirms brokerage submission.
Order pending → Position active
Broker confirms fill; partial fills remain explicit.
Any live state → Invalidated
Defined invalidation condition is verified.
Resolved → History
Execution, expiry, dismissal, cancellation, invalidation or close is recorded.

Freshness and evidence
Every quote and trigger includes source timestamp, received timestamp and freshness.
Score evidence retains the market snapshot used at scoring time.
A later grade change creates a new version rather than rewriting history.
Community observations remain labeled and do not automatically alter grade.
Trading actions are disabled or qualified when required data is unavailable—not silently inferred.
10. Accessibility and safety
Grade and state are never communicated by border color alone.
Text and numerals meet accessible contrast requirements.
Reduced-motion mode removes glow animation and chart pulses.
Screen readers announce ticker, state, grade, action and trade levels in decision order.
Risk information precedes final execution confirmation.
The user can pause monitoring and hide community context.
Broker capability is verified before presenting “Submit to broker.”
Paper and live trading states remain unmistakable throughout the flow.
11. Acceptance criteria
Users can understand an alert’s company, event, grade, entry, stop and target without opening another screen.
The letter grade is visually dominant and recognizable before the user reads the alert headline.
The 0–100 score is supporting information and never competes with the letter grade.
Scorecard components use qualitative labels and glanceable signals; no /20 fractions appear in the interface.
Active, Watching and History are the only permanent Alerts sections.
Every displayed grade has an inspectable scorecard.
Selecting any alert opens the correct ticker, timeframe and event in Trade Portal.
The chart remains visible while the user talks to Kai.
Kai can add, explain, modify and remove chart annotations.
The primary action always matches alert and execution state.
No generic alert-detail page interrupts the Alert-to-Trade flow.
History preserves the original alert and complete outcome trail.
A connected broker is never presented as execution-enabled unless the integration confirms that capability.
Final product statement
NORTH STAR  Alerts are the elevated successor to Cheat Code SMS: complete, graded and actionable trade intelligence. Trade is the live chart workspace where the user and Kai investigate, plan and execute without losing context.

