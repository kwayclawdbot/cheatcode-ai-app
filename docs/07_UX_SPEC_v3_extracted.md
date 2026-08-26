CHEAT CODE AI
Beginner-First Product UX Specification
A complete Claude Design handoff for Day Trade, Swing, and Managed Investing modes
PRODUCT PROMISE
DESIGN STANDARD
One AI, three ways to build wealth
Plain English first; technical depth on demand
Kai is already working when the app opens
One dominant next action per screen
Live intelligence with education built in
Calm, trustworthy, accessible, auditable

Executive directive
The frontend experience is the product. The existing backend already scans markets, detects and grades opportunities, personalizes alerts, maintains live market streams, supports conversation, connects brokerages, parses orders, and tracks outcomes. Design must convert that intelligence into an intuitive operating system for people who may have never used trading software.
A successful interface allows a beginner to understand what is happening, what Kai is doing, the next appropriate action, and the primary risk within five seconds.

1. Product model and experience principles
Product promise
Cheat Code AI is a beginner-first AI wealth companion that helps a person trade today, hold opportunities for days or weeks, or build a long-term portfolio without requiring them to understand professional trading software.
The interface must always answer four questions within five seconds:
Experience principles
Plain English first. Show “buyers are taking control” before “VWAP reclaim with 2× relative volume.”
One clear next action. Every primary screen has one dominant action.
Progressive disclosure. Advanced indicators, contract data, and scanner configuration remain available but collapsed.
Calm, not casino-like. Motion communicates state change; it never manufactures urgency.
Kai is already working. The app opens on prioritized work, not an empty chat box.
Same intelligence, adapted presentation. Beginner, intermediate, advanced, and family explanations share one underlying trade plan.
Trust through receipts. Every recommendation has reasoning, risk, timestamps, changes, and a post-outcome debrief.
Mode-specific focus. Day Trade, Swing, and Managed Investing never compete for attention on the same home screen.
The central product model
One AI, three ways to build wealth:
Day Trade: opportunities entered and exited today.
Swing: opportunities held for several days or weeks.
Managed Investing: guided long-term portfolio construction, contributions, and rebalancing.
The user selects a primary mode during onboarding. A discreet mode selector allows switching later. Mode changes priorities, language, data density, time horizon, risk framing, notifications, and primary actions—not just scanner filters.
Non-goals
Do not recreate Bloomberg, TradingView, Discord, or a broker terminal.
Do not lead with scanner settings or technical indicators.
Do not show dozens of equally weighted opportunities.
Do not imply certainty, guaranteed outcomes, or effortless profits.
Do not place autonomous execution ahead of comprehension, consent, and risk controls.
Mode comparison
MODE
USER GOAL
DEFAULT EXPERIENCE
Day Trade
Enter and exit opportunities today
Live setup state, confirmation, daily risk, active management
Swing
Hold positions for days or weeks
Thesis, entry window, catalysts, position updates
Managed Investing
Build long-term wealth with less involvement
Goals, contributions, allocation, rebalancing

2. Information architecture
	•	Home — live Kai conversation, research, charts and actions
	•	Alerts — monitoring, active trades, triggers and history
	•	Positions — open risk, pending orders, closed and paper trades
	•	Markets — discovery, scans, watchlists and research
	•	Account — portfolio, brokerage, risk, permissions and preferences
Navigation remains stable. The selected mode changes priority, density, language, objects, notifications, and actions.
3. Golden user flows
Beginner onboarding
	•	Choose desired outcome
	•	Set starting amount or connect later
	•	Select comfortable risk through examples
	•	Choose involvement level
	•	Select experience level
	•	Review how Kai will work
	•	Land in the Kai Home workspace
Day Trade
	•	Open lead setup
	•	Watch state progression
	•	Set ready alert
	•	Review plan
	•	Prepare and confirm order
	•	Monitor position
	•	Exit
	•	Review debrief and lesson
Swing
	•	Review weekly outlook
	•	Open thesis
	•	Wait for entry window
	•	Confirm position
	•	Monitor catalyst and thesis
	•	Exit or adjust
	•	Debrief
Managed Investing
	•	Set goal and horizon
	•	Review allocation
	•	Review contribution recommendation
	•	Preview what changes
	•	Confirm
	•	Track progress
	•	Review rebalance
4. Mode specifications
Day Trade
Monitor, narrow attention, confirm, explain, and manage intraday risk.
PRIMARY METRICS
GUARDRAILS
Daily risk remaining; live setup state; open exposure; current P/L; session status.
Daily loss cap; PDT warning; stale-price blocking; emergency stop; market-hours clarity.

Swing
Find multi-day opportunities and monitor whether the original thesis remains valid.
PRIMARY METRICS
GUARDRAILS
Capital allocated; open risk; catalyst dates; holding period; sector exposure.
Earnings and gap warnings; concentration; correlations; time stops; stale thesis.

Managed Investing
Build and maintain a goal-aligned portfolio through guided contributions and rebalancing.
PRIMARY METRICS
GUARDRAILS
Goal progress; allocation drift; contribution status; diversification; projected range.
Suitability; concentration; affordability; fees/taxes where available; legal gating for discretion.

5. Screen inventory
ID
SCREEN
S00
Splash and session restore
S01
Goal selection
S02
Risk and involvement
S03
Setup summary
S10
Home / Kai workspace
S20
Markets
S30
Rich Kai response
S31
Live chart in conversation
S32
Research browser
S40
Alerts control center
S41
Alert detail
S50
Positions
S21
Opportunity detail
S22
Live trade
S23
Trade plan
S24
Trade management
S25
Debrief
S60
Learn
S70
Account and portfolio
S71
Brokerage connection
S72
Notifications
S73
Settings

Detailed behavior for every screen is contained in 05_SCREEN_SPECIFICATIONS.md in the handoff package.
6. Central opportunity-detail experience
Trading opportunities use three views without leaving the object:
VIEW
BEGINNER QUESTION
DEFAULT CONTENT
Live
What is changing right now?
Price, readiness, confirmation, narration, freshness
Plan
Exactly what would make this actionable?
Entry condition, invalidation, stop, targets, size, scenarios
Learn
Why does this setup work or fail?
Plain explanation, chart annotation, similar example, quiz

7. Design and content system
Premium, calm, decisive, human, and educational
One dominant object and action per screen
Meaning before numbers; plain English before technical language
Green and red used semantically, never decoratively
No flashing price treatment or manufactured urgency
Status always includes text and non-color cues
Body text at least 16px on mobile; touch targets at least 44×44
WCAG 2.2 AA, screen-reader equivalents for charts, reduced motion
Copy pattern
	•	Meaning: Buyers are taking control.
	•	Decision: Kai is waiting for stronger volume.
	•	Risk: The setup fails below $772.80.
	•	Optional detail: Price reclaimed VWAP; relative volume is 1.4×.
8. Component and state requirements
Every financial component must specify loading, empty, partial-data, live, delayed, stale, offline, error, market-closed, permission-blocked, accepted, filled, partial, rejected, and cancelled states where relevant.
COMPONENT GROUP
KEY COMPONENTS
Navigation
BottomNavigation, ModeSelector, MarketStatus, ContextHeader
Intelligence
KaiBrief, PlainEnglishSummary, TechnicalDisclosure, StateStepper, Freshness
Live trading
LiveChart, KeyLevels, NarrationFeed, PositionStatus, OrderPreview, Confirmation
Managed investing
GoalProgress, AllocationChart, ChangePreview, ContributionCard, DriftAlert
Education
ExplainThis, LevelSelector, AnnotatedConcept, SimilarSetup, QuickQuiz

9. Frontend–backend contract
Core entities: UserProfile, TradePlan, PlanEvent, Position, InvestmentRecommendation, EducationObject. State transitions are server-authoritative; every price includes source time and freshness; financial writes use idempotency keys; missed events replay after reconnect.
EXISTING SYSTEM
FRONTEND ROLE
kai_stream.py / market_stream.py
Normalized realtime event source
Scanners and scoring
Opportunity creation and grading
Supabase
Plans, events, users, positions, realtime subscriptions
Kai conversation
Context-aware explanation and intent routing
Trade parser/executor + SnapTrade
Preview, confirmation, submission, order state
Education coach
Contextual Learn content
Performance tracking
Debriefs, process receipts, outcomes

10. Acceptance criteria
Beginner comprehension
A first-time user identifies market state, Kai’s current action, next step, and primary risk in five seconds during moderated testing.
Default trading cards contain no unexplained indicator acronyms.
Advanced detail is available within one interaction but not forced.
Mode integrity
Day Trade, Swing, and Managed Investing each have distinct Today priorities and opportunity objects.
Switching mode never hides an open position or pending confirmation.
Existing plans retain their originating mode.
Live reliability
Every live value exposes freshness.
Reconnect restores missed plan events in order.
Stale data disables actions that require current pricing.
Trade state is server-authoritative and auditable.
Financial action safety
Preview precedes confirmation.
Accepted, filled, partial, rejected, and cancelled are distinct.
Duplicate submission is prevented.
Material price or plan change invalidates preview.
User can identify account, amount, direction, and risk before confirming.
Accessibility
WCAG 2.2 AA contrast.
44×44 minimum touch targets.
Full screen-reader labels and logical focus order.
Charts have equivalent text summaries.
Reduced Motion supported.
Text remains usable at 200% scaling.
Handoff completeness
Conversational workspace
Home supports direct text and voice conversation with persistent mode, market, account, and position context.
Kai can open sourced browser research and live annotated chart objects without losing the conversation.
Rich responses include market briefings, graded setups, research reports, comparisons, position updates, alert previews, and action previews.
Alert conditions created from natural language are previewed as structured logic before activation.
Alerts and Positions preserve traceability back to the originating research, chart, grade, plan, and conversation.
The product contains no XP, streaks, missions, levels, badges, confetti, or artificial rewards.
Kai conversational workspace
Home provides direct text and voice conversation with Kai and never opens as an empty generic chat.
Kai can present live browser research, sourced evidence, interactive charts, and chart markup inside the conversation.
Important answers use rich objects: briefings, graded setups, research reports, comparisons, position updates, alerts, and action previews.
Alerts contains Needs Attention, Watching, Active Trades, Triggered, and History.
Positions retain the chain from research and annotations through alerts, execution, management, exit, and review.
No gamification, streaks, XP, missions, levels, badges, confetti, or rewards tied to financial behavior.

11. Trade Helper benchmark and design implications
Trade Helper demonstrates an effective guided onboarding but an intimidating post-onboarding complexity cliff. Cheat Code should borrow the setup clarity and plan reveal while preserving that simplicity throughout the product.
BORROW
REJECT
Guided setup ceremony
Ambiguous “Managed” terminology
One primary decision per step
Aggressive risk defaults softened by polish
Explain risk and automation first
Terminal-like dashboard density
Concrete generated-plan reveal
Static account value as the main focal point
Paper practice in the real workflow
Long prose before ranked, actionable cards
Persistent AI guide
Beginner exposure to implementation logic

Cheat Code translation
Use outcome-first labels: Trade Today, Trade Over Time, and Build My Portfolio.
Make the live Kai conversation, current work, and next decision the primary focus of Home.
Keep Home, Alerts, Positions, Markets, and Account as the stable navigation; Kai operates across all five.
Use a live rhythm for Day Trade, a calmer thesis rhythm for Swing, and a clear conversational investing rhythm for Invest.
Lead scan results with ranked cards, status, risk, and action; keep narrative depth available on demand.
Use deep charcoal/navy, warm ivory, code green, and restrained gold with stronger contrast and fewer borders.
Governing principle: Keep the simplicity of onboarding after onboarding.
Kai workspace directive
Home is a tool-using conversation. Kai can research with visible sources, open browser and chart surfaces, modify and annotate live charts, return structured graded setups, create alerts, and preserve the full path from discovery through position review. Anything Kai explains is inspectable; anything Kai discovers is actionable; anything acted on remains monitored.

12. Claude Design execution brief
You are the lead product designer for Cheat Code AI. Design a production-ready beginner-first mobile and responsive web experience using every specification in this package.
Product
Cheat Code AI is an AI wealth companion with three primary modes:
	•	Day Trade — enter and exit opportunities today.
	•	Swing — hold opportunities for days or weeks.
	•	Managed Investing — guided long-term portfolio construction and maintenance.
Kai is the intelligence and conversational guide. The product must feel fun, intuitive, tactile, premium, and non-intimidating without gamification. Use Robinhood's interaction simplicity and Duolingo's guided clarity as directional references, but do not use points, streaks, missions, levels, badges, confetti, artificial rewards, or casino mechanics.
Non-negotiable interaction model
Every primary screen must answer:
What is happening?
What is Kai doing?
What should I do next?
What could go wrong?
Use progressive disclosure. Present plain English first, then optional technical depth. Show one dominant next action. Keep five destinations: Home, Alerts, Positions, Markets, Account. Kai is not a separate destination; Kai is directly available on Home and contextually throughout the product.
Home is the central product workspace. Users can talk or type to Kai, ask for research, open live browser and chart views inside the conversation, request chart markup, receive sourced research, compare assets, generate graded setups, create alerts, review positions, and prepare actions. Important responses use structured interactive objects rather than walls of text.
Required work sequence
	•	Synthesize the documents and flag genuine contradictions only.
	•	Produce the mode-aware sitemap.
	•	Produce the three end-to-end golden flows.
	•	Define object/state models for trade plans, positions, recommendations, and education.
	•	Produce low-fidelity mobile wireframes.
	•	Establish design tokens and component variants.
	•	Produce high-fidelity mobile screens for every required screen and critical state.
	•	Produce responsive web variants of Home/Kai workspace, Alerts, Positions, Markets, research browser, live annotated chart, and Account.
	•	Prototype Day Trade from forming setup through debrief.
10. Prototype Swing from opportunity through position monitoring.
11. Prototype Managed Investing from contribution recommendation through confirmation.
12. Annotate accessibility, empty/error/stale/offline states, analytics events, and backend fields.
Required starting screens
Onboarding goal selection; risk/involvement; setup summary; Home/Kai workspace in all three modes; rich market briefing; graded setup; live annotated chart; browser research panel; Alerts center and detail; Positions and position detail; Markets in all modes; Day Trade plan; debrief; Swing thesis; investing recommendation/allocation preview; contextual Learn; Account/portfolio; brokerage connection; notifications; settings.
Deliverable rules
Do not invent autonomous trading claims.
Do not hide risk.
Do not use profit screenshots as the primary trust mechanism.
Never show market data without freshness.
Never combine accepted and filled order states.
Do not add features merely to make screens look full.
Do not add gamification, artificial rewards, streaks, XP, missions, levels, badges, or celebratory treatment around financial actions.
Use realistic content and multiple critical states.
Document all assumptions and unresolved product decisions.
Begin by delivering the sitemap, golden flows, visual direction, and low-fidelity wireframes before high-fidelity execution.
13. Open product decisions
Confirm product naming for Managed Investing at launch versus Guided Investing.
Select production realtime market-data provider and entitlement level.
Define which order types and options workflows appear in v1.
Set legal/compliance boundary between education, recommendation, and discretionary management.
Define free, paid, and premium feature gates without degrading comprehension.
Decide whether voice/video host presence appears inside the Live screen in v1 or a later release.
