/**
 * Local mirrors of docs/02_API_CONTRACTS.md shapes.
 * packages/shared did not exist when this lane ran (empty dir) — these are the
 * reconciliation point once the SCHEMA lane publishes db.types.ts / zod schemas.
 */

export type Freshness = 'live' | 'delayed' | 'stale' | 'closed' | 'unknown';

/**
 * Why a price is not live. `entitlement` = the plan only permits delayed data;
 * round-2 rule: that renders as "Delayed 15m", never "Stale", and never
 * disables an action.
 */
export type DelayReason = 'entitlement' | 'feed' | 'feed_gap' | 'session' | 'seed' | 'unknown';

export type Quote = {
  symbol?: string;
  occ_symbol?: string;
  price?: number | null;
  change?: number | null;
  change_pct?: number | null;
  source_ts?: string | null;
  received_ts?: string | null;
  freshness?: Freshness;
  delay_reason?: DelayReason | null;
};

export type SetupState = 'forming' | 'ready' | 'confirmed' | 'triggered' | 'invalidated' | 'expired' | 'watching';

export type GradedSetup = {
  id: string;
  symbol: string;
  grade_display: string;      // "B+"
  state: SetupState;
  state_label?: string;       // "Forming"
  direction?: 'long' | 'short';
  entry?: string | null;      // "> 504"
  target?: string | null;     // "540"
  invalid?: string | null;    // "< 460"
  risk_line?: string | null;  // "Waiting for volume · risk $58 if wrong"
  next_action?: string | null;
  quote?: Quote | null;
};

export type BriefingLine = { tone: 'market' | 'attention' | 'quiet'; text: string; action?: string | null };
export type Briefing = {
  id: string;
  title: string;              // "MORNING REPORT · 9:41"
  lines: BriefingLine[];
  headline?: string | null;   // the Kai bubble above the report
};

export type MarketStatus = {
  status: 'open' | 'closed' | 'pre' | 'post' | 'holiday';
  label: string;              // "Market open · 9:41 ET"
  session_ts?: string | null;
  freshness: Freshness;
};

export type WatchingItem = { id: string; symbol: string; label: string; value?: string | null; kind: 'level' | 'event'; quote?: Quote | null };

export type HomePayload = {
  market: MarketStatus;
  briefing: Briefing | null;
  lead_setup: GradedSetup | null;
  watching: WatchingItem[];
  daily_risk: { cap: number; used: number; remaining: number };
  degraded?: boolean;
  degraded_reason?: string | null;
  invest_notice?: string | null;
};

export type AlertRow = {
  id: string;
  symbol: string;
  title: string;
  detail?: string | null;
  entry_label?: string | null;   // "Entry 902"
  status: 'draft' | 'active' | 'paused' | 'triggered' | 'resolved' | 'cancelled';
  condition_label?: string | null;   // "> 504"
  value?: string | null;             // "508.40"
  meta?: string | null;              // "9 days"
  grade_change?: string | null;      // "B → B−"
  age?: string | null;               // "4m ago"
  quote?: Quote | null;
  /** Round 2: how the alert is being watched. No worker yet → 'armed_no_feed'. */
  monitoring?: AlertMonitoring | null;
  /** The server's own sentence about monitoring; always preferred when present. */
  monitoring_plain?: string | null;
};
export type AlertsPayload = { needs_attention: AlertRow[]; watching: AlertRow[]; resolved: AlertRow[] };

export type RoomRow = { id: string; slug: string; name: string; topic?: string | null; mode?: string | null; member_hint?: string | null };

export type Instrument = { symbol: string; name: string; last?: number | null; change_pct?: number | null; quote?: Quote | null };

export type GoalMode = 'day_trade' | 'swing' | 'invest';
export type Involvement = 'hands_on' | 'guided';
export type RiskAnswer = 'careful' | 'balanced' | 'aggressive';
export type FundingChoice = 'paper' | 'broker' | 'later';

export type Profile = {
  user_id: string;
  display_name?: string | null;
  handle?: string | null;
  primary_mode?: GoalMode | null;
  involvement?: Involvement | null;
  experience?: string | null;
  memory_enabled?: boolean | null;
  /** `completed_at` is the server's stamp (0016 complete_onboarding); the
   *  boolean is the pre-round-4 client flag, still read, never written. */
  onboarding?: { completed?: boolean; completed_at?: string; focus?: string[]; experience?: string } | null;
};

export type RiskPolicy = { daily_loss_cap: number; max_position_pct: number; involvement: Involvement };

export type WallItem =
  | { kind: 'kai_text'; id: string; text: string; streaming?: boolean }
  | { kind: 'user_text'; id: string; text: string }
  | { kind: 'briefing'; id: string; briefing: Briefing }
  | { kind: 'setup'; id: string; setup: GradedSetup }
  | { kind: 'typing'; id: string }
  | { kind: 'action'; id: string; action: KaiActionPreview }
  | { kind: 'notice'; id: string; text: string }
  /** The "also watching" rows, revealed on request rather than stacked on open. */
  | { kind: 'watching'; id: string; rows: AlsoWatchingRow[] };

/**
 * action_preview frame (packages/shared ActionPreviewPayload) — a Kai-proposed
 * action awaiting a user tap. Kai never executes: the client owns the call.
 * Labels here are plain language (audit §8): Watch this / Set an alert /
 * Build a plan / See why.
 */
export type KaiActionKind = 'draft_alert' | 'open_setup' | 'build_plan' | 'compare' | 'explain' | 'watch_setup';
export type KaiActionPreview = {
  action: KaiActionKind;
  label: string;
  summary_plain?: string | null;
  args: Record<string, unknown>;
};

/* ==================================================================== */
/* Round 2 — setup detail · alerts lifecycle · trade · account          */
/* Shapes follow docs/BUILD-BRIEF-round-2.md. Everything is optional-    */
/* tolerant: the API-2 lane is landing these endpoints in parallel and   */
/* the adapters must never throw on a missing branch.                    */
/* ==================================================================== */

/** One OHLC bar from GET /market/candles. */
export type Candle = { t: string; o: number; h: number; l: number; c: number; v?: number | null };
export type Timeframe = '1D' | '5D' | '1M' | '3M' | 'YTD' | '1Y';

export type StepState = 'done' | 'active' | 'todo' | 'failed';
export type StepperStep = { label: string; state: StepState };
export type Confirmation = { label: string; ok: boolean; detail?: string | null };
export type NarrationLine = { text: string; time?: string | null };
export type ScenarioTone = 'good' | 'bad' | 'neutral';
export type Scenario = { label: string; amount?: string | null; plain: string; tone: ScenarioTone };
export type Evidence = { label: string; ok: boolean };
export type Quiz = { q: string; options: string[]; answer_idx: number; explanation?: string | null };
export type ExplainLevel = 'beginner' | 'intermediate' | 'advanced' | 'family';
export type Explain = Record<ExplainLevel, string>;

export type SetupDetail = {
  id: string;
  symbol: string;
  name?: string | null;
  grade_display: string;
  state: SetupState;
  state_label: string;
  direction: 'long' | 'short';
  quote: Quote | null;
  live: {
    stepper: StepperStep[];
    narration: NarrationLine[];
    confirmations: Confirmation[];
    technical?: string | null;
  };
  plan: {
    entry_condition?: string | null;
    entry_zone?: string | null;
    entry?: number | null;
    stop?: number | null;
    invalidation?: string | null;
    targets: { price: number; label?: string | null }[];
    size_suggestion?: string | null;
    scenarios: Scenario[];
    risk_reward?: string | null;
  };
  learn: {
    why_plain: string;
    evidence: Evidence[];
    similar_example?: string | null;
    quiz?: Quiz | null;
  };
  explain: Explain;
  fit: { ok: boolean; reasons: string[] };
  next_action?: string | null;
  discussion_room_id?: string | null;
};

/* ---------------- Alerts ---------------- */

export type AlertGroupKey = 'needs_attention' | 'watching' | 'active_trades' | 'triggered' | 'history';

export type AlertLifecycle = {
  needs_attention: AlertRow[];
  watching: AlertRow[];
  active_trades: AlertRow[];
  triggered: AlertRow[];
  history: AlertRow[];
  empty_copy: string;
};

/** "armed_no_feed" until the market-data worker exists (round-2 §API-2). */
export type AlertMonitoring = 'not_armed' | 'armed_no_feed' | 'armed' | 'evaluating' | 'off';

export type AlertHistoryEntry = { at: string; label: string };
export type AlertTraceChip = { label: string; route?: string | null };

export type AlertDetail = {
  id: string;
  symbol: string;
  natural_language: string;
  summary_plain: string;
  status: AlertRow['status'];
  monitoring?: AlertMonitoring | null;
  monitoring_plain?: string | null;
  condition_label?: string | null;
  structured: { label: string; value: string }[];
  data_dependency: { label: string; value: string }[];
  history: AlertHistoryEntry[];
  trace: AlertTraceChip[];
  quote?: Quote | null;
  created_at?: string | null;
  expires_at?: string | null;
};

export type AlertDraftPreview = {
  alert_id: string;
  natural_language: string;
  summary_plain: string;
  structured: { label: string; value: string }[];
  symbol: string;
  degraded?: boolean;
};

/* ---------------- Trade ---------------- */

export type ContinueItem = {
  id: string;
  title: string;
  detail?: string | null;
  cta: string;
  route?: string | null;
};

export type AccountStrip = {
  equity: number;
  buying_power?: number | null;
  change_pct?: number | null;
  label: string; // always "PAPER" this round
};

export type Mover = { symbol: string; name?: string | null; last?: number | null; change_pct?: number | null; quote?: Quote | null };

export type TradeLanding = {
  account_strip: AccountStrip | null;
  continue_items: ContinueItem[];
  kai_opportunities: GradedSetup[];
  watchlist: Instrument[];
  movers: Mover[];
  catalysts: { label: string; when: string }[];
};

export type SearchResult =
  | { kind: 'instrument'; symbol: string; name: string; exchange?: string | null }
  | { kind: 'kai_question'; text: string };

export type NewsItem = { id: string; title: string; source?: string | null; published_utc?: string | null; url?: string | null };

export type ModeLens = { mode: GoalMode; label: string; text: string };

export type SymbolDetail = {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  quote: Quote | null;
  setup: GradedSetup | null;
  levels: { entry?: number | null; target?: number | null; invalid?: number | null; support?: number | null };
  kai_interpretation: { text: string; grade?: string | null; last_updated?: string | null } | null;
  your_context: { watchlisted: boolean; alerts: { id: string; label: string }[]; plans: string[] };
  evidence: { news: NewsItem[] };
  community: { room_id: string | null; thread_summary: string | null };
  lenses: ModeLens[];
  candles: Candle[];
};

/* ---------------- Account ---------------- */

export type PaperAccount = {
  equity: number;
  cash?: number | null;
  buying_power?: number | null;
  starting_balance?: number | null;
  reset_count?: number | null;
  last_reset_at?: string | null;
  can_reset?: boolean;
};

export type Subscription = {
  tier: 'free' | 'premium';
  status?: string | null;
  renews_at?: string | null;
  /** The server's own one-liner about the plan. */
  plain?: string | null;
};

/**
 * One capability of the plan. `entitlement_flags` mixes booleans (a lock) with
 * limits (a number or a scope), so a flag carries both what it is called and
 * what it currently allows.
 */
export type EntitlementFlag = {
  key: string;
  label: string;
  /** "5 at a time", "Beginner rooms", "Included" — never a raw value. */
  value_plain: string;
  /** False = the free plan does not have it at all. */
  included: boolean;
};

export type QuietHours = { start?: string | null; end?: string | null; enabled?: boolean };

export type AppSettings = {
  explanation_level: ExplainLevel;
  quiet_hours: QuietHours;
  notifications: { per_mode?: Record<string, boolean> } & Record<string, unknown>;
  accessibility: { reduced_motion: boolean; text_scale: number };
  /** Round 5: the master push switch. The user's INTENT — a different question
   *  from whether the OS or the browser has granted permission. */
  push_enabled: boolean;
  /** Round 5: an ABSENT key means on. `{}` is a user who never touched them. */
  notification_categories: NotificationCategoryMap;
};

export type Me = {
  profile: Profile;
  risk_policy: RiskPolicy;
  paper: PaperAccount | null;
  subscription: Subscription;
  entitlements: EntitlementFlag[];
  memory_enabled: boolean;
  settings: AppSettings;
  /**
   * Round 6. Whether to DRAW the operator's row in Account — a courtesy, not a
   * control (brief §3). It is re-derived by the server on every `/me`, and it
   * unlocks nothing: every admin byte still comes from a `staffed()` route that
   * asks `staff_members` again. An API that predates 0025 answers `false`.
   */
  staff: StaffBlock;
};

export type NotificationGroup = 'action_required' | 'changes' | 'fyi';

export type NotificationRow = {
  id: string;
  group: NotificationGroup;
  title: string;
  body?: string | null;
  route?: string | null;
  created_at?: string | null;
  read_at?: string | null;
};

export type MemoryRow = { id: string; kind: string; content: string; created_at?: string | null };

/* ==================================================================== */
/* Round 5 — push (docs/BUILD-BRIEF-round-5-push.md)                    */
/*                                                                      */
/* Mirrors of the API-5 contracts in packages/shared/api.ts, kept local  */
/* to the app for the same reason every other view model here is: the   */
/* screen reads THESE, the adapter absorbs whatever the server sends,    */
/* and a server that has not shipped push yet still renders a screen.    */
/* Deliberately NOT imported from @cheatcode/shared — another lane owns  */
/* that file this round.                                                 */
/* ==================================================================== */

/** What a user can switch off. An absent key means ON — never a row of trues. */
export type NotificationCategory =
  | 'trade_alerts'
  | 'order_status'
  | 'community'
  | 'coaching'
  | 'system';

export type NotificationCategoryMap = Partial<Record<NotificationCategory, boolean>>;

export type PushTransport = 'expo' | 'web';
export type PushPlatform = 'ios' | 'android' | 'web';
export type PushSubscriptionState = 'active' | 'stale' | 'revoked';

/**
 * A registered device. It never carries the handle or the browser's keys —
 * the server does not send them and no screen needs one, so a token cannot
 * reach a screenshot, a log or a bug report through here.
 */
export type PushDevice = {
  id: string;
  transport: PushTransport;
  platform: PushPlatform | null;
  device_label: string | null;
  state: PushSubscriptionState;
  created_at: string | null;
  last_success_at: string | null;
  /** The server's own sentence for this row: "Chrome on macOS — On". */
  plain: string;
};

export type PushRegistry = {
  devices: PushDevice[];
  push_enabled: boolean;
  /** Null = this server has no VAPID pair, so no browser can be subscribed. */
  vapid_public_key: string | null;
  plain: string;
};

/** A suppression is a RECORD, not a drop: it is why nothing buzzed. */
export type PushSuppression = { reason: string; plain: string; subscription_id: string | null };

export type PushTestResult = { sent: number; suppressed: PushSuppression[]; plain: string };

/* ==================================================================== */
/* V5 consolidation (docs/BUILD-BRIEF-round-3.md + 09 audit)            */
/*                                                                      */
/* One symbol workspace, one Home priority, three alert buckets.        */
/* Every shape is optional-tolerant: API-3 is landing the restructured  */
/* endpoints in parallel, so the adapters read the new payload when it   */
/* is there and derive the same view model from the round-2 payload      */
/* when it is not. No screen ever waits on the other lane.               */
/* ==================================================================== */

/** A primary action is a LABEL plus where it goes. The label is state-driven
 *  (Forming → "Watch this"; Ready → "Review setup"; Planned → "Buy";
 *  Active → "Manage"; Invalidated → "Review what changed") and never taxonomy. */
export type PrimaryAction = { label: string; route: string; tone?: 'volt' | 'kai' };

export type PriorityKind = 'setup' | 'alert' | 'position' | 'portfolio';

/** The ONE dominant object on Home (audit §4). */
export type HomePriority = {
  kind: PriorityKind;
  id: string;
  symbol?: string | null;
  grade_display?: string | null;
  /** "Approaching entry" / "Needs a decision" / "Open · +$54" */
  state_label?: string | null;
  state_tone?: 'market' | 'attention' | 'positive' | 'risk' | 'neutral';
  /** headline used when there is no symbol (portfolio decisions) */
  title?: string | null;
  /** "Buyers holding 480 · volume 1.6× · risk $58 if wrong" */
  detail?: string | null;
  /** the chart callout: "Entry 504 · 0.4% away" */
  chart_note?: string | null;
  levels: { entry?: number | null; target?: number | null; invalid?: number | null };
  quote?: Quote | null;
  candles: Candle[];
  primary_action: PrimaryAction;
};

/** Compact secondary row under "ALSO WATCHING". */
export type AlsoWatchingRow = {
  id: string;
  symbol: string;
  text: string;
  tone: 'attention' | 'neutral';
  action?: PrimaryAction | null;
};

export type HomeV5 = {
  mode: GoalMode;
  market: MarketStatus;
  /** Kai's short opening statement: what changed and why it matters. */
  opening_line: string;
  priority: HomePriority | null;
  also_watching: AlsoWatchingRow[];
  /** The full morning report — BELOW the priority, in the conversation. */
  briefing: Briefing | null;
  daily_risk: { cap: number; used: number; remaining: number };
  degraded?: boolean;
  degraded_reason?: string | null;
  invest_notice?: string | null;
};

/* ---------------- Asset workspace ---------------- */

export type WorkspaceTab = 'overview' | 'kai' | 'plan' | 'community';

/** The setup as a MODULE inside the symbol workspace — never a destination. */
export type SetupModule = {
  id: string;
  state: SetupState;
  /** "Setup forming" / "Setup ready" / "Setup invalidated" */
  state_label: string;
  grade_display: string;
  /** "0.4% from entry" */
  distance_label?: string | null;
  entry?: string | null;
  target?: string | null;
  invalid?: string | null;
  /** state-driven primary, e.g. { label: 'Watch this' } */
  primary_action: PrimaryAction;
  /** "Setup forming — Kai suggests waiting for confirmation" */
  note?: string | null;
  following?: boolean;
};

/** A position renders as a module on Overview and links to MOBILE-B's route. */
export type PositionModule = {
  id: string;
  qty?: number | null;
  avg_price?: number | null;
  unrealized_pnl?: number | null;
  health_label?: string | null;   // "Healthy" / "At risk"
  stop?: number | null;
  target?: number | null;
  plain?: string | null;          // "Thesis intact — nothing to do"
};

export type ResearchRef = { id: string; title: string; source?: string | null; url?: string | null; published_utc?: string | null };

export type PlanNumbers = {
  entry?: number | null;
  stop?: number | null;
  targets: number[];
  size?: string | null;
  rr?: string | null;
  scenarios: Scenario[];
  /**
   * Why there is no plan, when there is not one. A plan needs an entry AND a
   * level that says it was wrong; the symbol screen prints this instead of
   * three dashes. See `features/orders/plan-read.ts`.
   */
  no_plan_plain?: string | null;
};

export type WorkspaceHistoryItem = { id: string; label: string; at?: string | null; route?: string | null };

export type CommunitySentiment = { sample: number; split: number; label: string };

export type SymbolWorkspace = {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  quote: Quote | null;
  /** "Watching · no position" — plain language, one line under the ticker. */
  context_line: string;
  watchlisted: boolean;
  candles: Candle[];
  overview: {
    setup_module: SetupModule | null;
    position: PositionModule | null;
    key_levels: { entry?: number | null; target?: number | null; invalid?: number | null; support?: number | null };
    what_changed: string[];
    volume_note?: string | null;
  };
  kai: {
    interpretation: string | null;
    grade?: string | null;
    last_updated?: string | null;
    scenarios: Scenario[];
    research_refs: ResearchRef[];
  };
  plan: {
    existing_plan_id: string | null;
    suggested: PlanNumbers | null;
    order_state?: string | null;
    daily_risk?: { cap: number; used: number; remaining: number } | null;
  };
  community: {
    room_id: string | null;
    thread_summary: string | null;
    sentiment: CommunitySentiment | null;
    verified_claims: string[];
    message_count?: number | null;
  };
  history: WorkspaceHistoryItem[];
  /** state-driven Buy / Sell labels + the line that explains them. */
  actions: { buy_label: string; sell_label: string; sell_side: string; buy_side: string; note?: string | null };
};

/* ---------------- Alerts, simplified ---------------- */

export type AlertFilterKey = 'attention' | 'monitoring' | 'history';

/** The one gold card: something needs a decision now. */
export type AttentionAlert = {
  id: string;
  symbol: string;
  message: string;
  grade_change?: string | null;
  age?: string | null;
  quote?: Quote | null;
};

/** A monitoring row: symbol · condition · value. Positions land here too. */
export type MonitoringRow = {
  id: string;
  symbol: string;
  condition: string;
  value?: string | null;
  value_tone?: 'market' | 'positive' | 'risk' | 'attention' | 'neutral';
  route?: string | null;
  quote?: Quote | null;
  status?: AlertRow['status'];
};

export type AlertsSimple = {
  attention: AttentionAlert[];
  monitoring: MonitoringRow[];
  history: AlertRow[];
  empty_copy: string;
};

/* ==================================================================== */
/* Round 4 — prototype boards: personalize onboarding, conversations     */
/* drawer, ticker page, alerts as complete trade objects, Kai profile.   */
/* Contracts: docs/10_ALERTS_TRADE_PORTAL_SPEC_extracted.md §1–§6, §9.   */
/* ==================================================================== */

/** Onboarding "How much have you traded?" — drives Kai's voice. */
export type Experience = 'new' | 'some' | 'pro';

/** "What should Kai watch?" chips. */
export type FocusKey = 'tech' | 'ai' | 'energy' | 'etf' | 'crypto' | 'earnings';

/** Alerts IA — exactly three top-level states (spec §1). */
export type AlertTab = 'active' | 'watching' | 'history';

/** Card lifecycle → the ONE state-driven primary action (spec §5). */
export type AlertCardState =
  | 'watching' | 'forming' | 'ready' | 'entry_reached' | 'planned'
  | 'order_pending' | 'position_active' | 'invalidated' | 'closed';

/**
 * A scorecard component. `strength` is 0–5 SEGMENTS, never points, and the
 * card must never render it as a fraction (spec §4).
 */
export type AlertScoreComponent = {
  key: string;
  label: string;
  status: string;        // Strong · Confirmed · Healthy · Forming · Waiting · Favorable · Supportive · Neutral
  strength: number;      // 0–5
  explanation?: string | null;
};

export type AlertTradePlanStrip = {
  direction?: string | null;        // Long · Short · Call · Put · Accumulate …
  current?: string | null;
  entry?: string | null;
  stop?: string | null;
  target?: string | null;
  rr?: string | null;               // "2.4:1"
  hold?: string | null;             // "intraday"
  expires?: string | null;          // "4:00 PM ET"
  /** Plain sentence shown under the strip when a level has no number yet. */
  note?: string | null;
};

export type AlertFit = {
  risk_amount?: string | null;      // "$58"
  cap_line?: string | null;         // "fits daily cap"
  conflicts?: string | null;        // "No conflicts"
};

export type AlertCommunity = {
  sample?: number | null;
  bullish_pct?: number | null;
  common_level?: string | null;
  verification?: string | null;     // "verified"
};

/**
 * How the family this alert came from has actually resolved (SWING-1 §4).
 * A record with its sample size attached — never a forecast, and deliberately
 * NOT part of the grade. The medallion is a setup-quality mark; this is history.
 */
export type AlertFamilyPerformance = {
  family: string;
  n: number;
  wins: number;
  win_pct: number;
  horizon: string;
  as_of?: string | null;
  plain?: string | null;
};

export type AlertProgress = { pct: number; label: string } | null;

/**
 * What one alert did, on a History row. `plain` is the disclosure the number
 * needs — for the Kai scanner family, that it is a close-to-close hold with no
 * stop and no target, and so not the result of a trade anyone managed.
 */
export type AlertOutcome = {
  label: string;
  value?: string | null;
  tone?: 'good' | 'bad' | 'neutral';
  plain?: string | null;
};

/** The standard actionable alert card (spec §2 / §3 / §9). */
export type AlertCard = {
  id: string;
  /** The underlying alert row. The card id may be "alert:<uuid>". */
  alert_id?: string | null;
  symbol: string;
  company: string;
  mode_label: string;               // "Day Trade"
  direction_label: string;          // "Long"
  instrument_label?: string | null; // "equity" | "call" | "ETF"
  grade: string;                    // "A−"
  /** null when the object has never been graded — the medallion stays blank. */
  score: number | null;             // 0–100
  state: AlertCardState;
  state_label: string;              // "Triggered" · "Watching" · "Grade changed"
  triggered_at_label?: string | null;
  headline: string;
  what_changed: string;
  company_summary?: string | null;  // <= 2 sentences
  trade: AlertTradePlanStrip;
  score_components: AlertScoreComponent[];
  /** Null unless the engine behind this alert has a graded live record. */
  family_performance?: AlertFamilyPerformance | null;
  kai_interpretation?: string | null;
  fit?: AlertFit | null;
  community?: AlertCommunity | null;
  progress?: AlertProgress;
  primary_action: { label: string; kind: AlertCardState };
  freshness_line?: string | null;   // "Quote 9:41:02 ET · live · received 8s ago"
  outcome?: AlertOutcome | null;    // History only
  resolved_label?: string | null;   // History only ("Yesterday")
};

export type AlertsRound4 = {
  active: AlertCard[];
  watching: AlertCard[];
  history: AlertCard[];
  counts: { active: number; watching: number; history: number };
  empty_copy?: string | null;
};

/** Conversations drawer (prototype "Home" board). */
export type ConversationRow = {
  id: string;
  title: string;
  pinned: boolean;
  last_message_at?: string | null;
};

export type ConversationsPayload = { pinned: ConversationRow[]; recent: ConversationRow[] };

/** Ticker page (`/symbol/[symbol]`) — the research overview board. */
export type TickerMeter = { label: string; status: string; strength: number };

export type TickerPage = {
  symbol: string;
  company: string;
  quote: Quote | null;
  market_label: string;             // "market open"
  starred: boolean;
  chart: { points: number[]; timeframes: string[]; selected: string };
  kai_view: { take: string; actions: string[] };
  overview: {
    summary: string;
    market_cap?: string | null;
    next_earnings?: string | null;
    pe?: string | null;
    sector?: string | null;
  };
  technicals: {
    meters: TickerMeter[];
    support?: string | null;
    resistance?: string | null;
  };
  community: {
    common_level?: string | null;
    posts_today?: number | null;
    bullish_pct?: number | null;
    sample?: number | null;
    circle?: { id: string; label: string } | null;
  };
  active_alert?: { id: string; grade: string; score?: number | null; line: string } | null;
};

/** Account board — YOUR KAI PROFILE. */
export type KaiProfile = {
  mode: GoalMode;
  mode_label: string;
  experience: Experience;
  experience_label: string;         // "New to this"
  focus: FocusKey[];
  focus_short: string;              // "big tech and AI & semis"
  voice_line: string;               // "I explain every term the first time it appears."
};

export type RuleAdherence = { sessions: number; followed: number };

/* ==================================================================== */
/* Round 6 — the operator's door (docs/BUILD-BRIEF-round-6-admin-crm.md) */
/*                                                                      */
/* Local mirrors of the ADMIN-2 contracts, for the same reason the       */
/* round-5 push types are local: the screens read THESE, the adapter     */
/* absorbs whatever the server sends, and a build whose API predates     */
/* 0025 still renders a screen that says so. `packages/shared/api.ts` is  */
/* another lane's file this round.                                       */
/*                                                                      */
/* THE HONESTY RULE LIVES IN THE TYPE. `AdminMetric.value` is nullable   */
/* and sits beside `tracked` precisely so no screen can coalesce an      */
/* unmeasured metric to zero by accident (brief §8).                     */
/* ==================================================================== */

export type StaffRole = 'support' | 'admin' | 'owner';

/** What `/me` says about the caller. Grants nothing — the routes re-ask. */
export type StaffBlock = { is_staff: boolean; role: StaffRole | null; plain: string };

export type CrmStatus =
  | 'lead' | 'invited' | 'signed_up' | 'onboarded'
  | 'activated' | 'paying' | 'churned' | 'blocked';

export type CrmIdentityKind =
  | 'email' | 'phone' | 'app_user' | 'stripe_customer'
  | 'kai_user' | 'os_user' | 'invite_code';

export type CrmEventSource = 'app' | 'kai_sms' | 'stripe' | 'admin' | 'import';

export type SyncSourceName = 'app' | 'kai_sms' | 'stripe';

/** `value: null` ALWAYS means `tracked: false`. Render "not tracked yet". */
export type AdminMetric = {
  key: string;
  label: string;
  value: number | null;
  tracked: boolean;
  unit: 'count' | 'cents' | 'percent';
  plain: string;
};

export type AdminFunnelRow = { status: CrmStatus; position: number; people: number };
export type AdminDailyRow = { day: string; signups: number; leads: number };
export type AdminSourceMixRow = { source: string | null; people: number };
export type AdminInviteTotals = { outstanding: number; redeemed: number; revoked: number; expired: number };

export type AdminSyncCounts = {
  scanned: number; created: number; resolved: number; conflicted: number; skipped: number;
};

export type AdminSyncRun = {
  id: string;
  source: SyncSourceName;
  state: 'running' | 'ok' | 'failed';
  dry_run: boolean;
  started_at: string;
  finished_at: string | null;
  counts: AdminSyncCounts;
  error: string | null;
};

/** A source that is switched off is still a source — `reason` says which (§5). */
export type AdminSourceState = {
  source: SyncSourceName;
  configured: boolean;
  reason: string | null;
  last_run: AdminSyncRun | null;
  plain: string;
};

export type AdminOverview = {
  funnel: AdminFunnelRow[];
  metrics: AdminMetric[];
  daily: AdminDailyRow[];
  source_mix: AdminSourceMixRow[];
  invites: AdminInviteTotals;
  sources: AdminSourceState[];
  generated_at: string | null;
  plain: string;
};

export type AdminPersonRow = {
  id: string;
  display_name: string | null;
  primary_email: string | null;
  primary_phone_e164: string | null;
  status: CrmStatus;
  primary_tier: string | null;
  source: string | null;
  tags: string[];
  first_seen_at: string | null;
  last_active_at: string | null;
  app_user_id: string | null;
  plain: string;
};

export type AdminPeopleFilter = {
  q?: string;
  status?: CrmStatus;
  tier?: string;
  source?: string;
  tag?: string;
  segment_id?: string;
  cursor?: string;
};

export type AdminPeoplePage = {
  people: AdminPersonRow[];
  next_cursor: string | null;
  /** Null means "more than we counted", never "unknown". */
  total: number | null;
  /** Exactly which fields the search touched, so the screen claims no more. */
  searched: string[];
  plain: string;
};

/** Nine numbers this app does not compute. `tracked:false` until a connector does. */
export type AdminScores = {
  engagement: number | null;
  buy_propensity: number | null;
  churn_risk: number | null;
  upsell_propensity: number | null;
  crosssell_propensity: number | null;
  responsiveness: number | null;
  predicted_ltv_cents: number | null;
  predicted_days_to_churn: number | null;
  updated_at: string | null;
  tracked: boolean;
  plain: string;
};

export type AdminIdentityRow = {
  id: string;
  kind: CrmIdentityKind;
  value: string;
  source: string | null;
  verified: boolean;
  created_at: string | null;
};

export type AdminTimelineRow = {
  id: string;
  type: string;
  category: string | null;
  source: CrmEventSource;
  value_cents: number | null;
  occurred_at: string | null;
  plain: string;
};

export type AdminNoteRow = {
  id: string;
  body: string;
  author_user_id: string | null;
  author_name: string | null;
  created_at: string | null;
};

export type AdminRedemptionRow = {
  id: string;
  invite_id: string;
  code: string | null;
  label: string | null;
  redeemed_at: string | null;
};

/** Counts and timestamps. There is no message body here, by design (brief §3). */
export type AdminKaiActivity = {
  conversations: number;
  messages: number;
  last_message_at: string | null;
  plain: string;
};

export type AdminPersonDetail = AdminPersonRow & {
  inbound_count: number;
  outbound_count: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  total_paid_cents: number | null;
  total_refunded_cents: number | null;
  current_mrr_cents: number | null;
  ltv_cents: number | null;
  merged_into: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminPerson = {
  person: AdminPersonDetail;
  identities: AdminIdentityRow[];
  timeline: AdminTimelineRow[];
  timeline_next_cursor: string | null;
  notes: AdminNoteRow[];
  redemptions: AdminRedemptionRow[];
  subscription: {
    tier: 'free' | 'premium';
    status: string;
    current_period_end: string | null;
    stripe_customer_id: string | null;
  } | null;
  entitlements: { key: string; value_plain: string }[];
  scores: AdminScores;
  kai: AdminKaiActivity;
  merged_from: { id: string; display_name: string | null }[];
  merge_conflicts: AdminTimelineRow[];
  plain: string;
};

export type AdminInviteState = 'open' | 'revoked' | 'expired' | 'exhausted';

export type AdminInviteRow = {
  id: string;
  code: string;
  label: string | null;
  tier: 'free' | 'premium';
  max_redemptions: number | null;
  redeemed_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string | null;
  state: AdminInviteState;
  /** A PATH — `/join/<code>`. The host belongs to whoever is sharing it. */
  link: string;
  plain: string;
};

export type AdminInvitesPage = {
  invites: AdminInviteRow[];
  next_cursor: string | null;
  totals: AdminInviteTotals;
  plain: string;
};

export type AdminAuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  target_kind: string | null;
  target_id: string | null;
  reason: string | null;
  request_id: string | null;
  ip: string | null;
  created_at: string | null;
  plain: string;
};

export type AdminAuditPage = {
  entries: AdminAuditRow[];
  next_cursor: string | null;
  plain: string;
};

export type AdminSegmentRow = {
  id: string;
  name: string;
  filter: AdminPeopleFilter;
  created_at: string | null;
  /** Keys in the stored filter the API ignores rather than runs. */
  ignored_keys: string[];
};

/** What a redemption gave the person who typed the code. */
export type InviteRedeemResult = {
  already_redeemed: boolean;
  invite_id: string;
  label: string | null;
  tier: 'free' | 'premium';
  subscription_plain: string;
  plain: string;
};
