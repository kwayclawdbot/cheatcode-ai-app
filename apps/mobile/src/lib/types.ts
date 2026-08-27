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
  onboarding?: { completed?: boolean } | null;
};

export type RiskPolicy = { daily_loss_cap: number; max_position_pct: number; involvement: Involvement };

export type WallItem =
  | { kind: 'kai_text'; id: string; text: string; streaming?: boolean }
  | { kind: 'user_text'; id: string; text: string }
  | { kind: 'briefing'; id: string; briefing: Briefing }
  | { kind: 'setup'; id: string; setup: GradedSetup }
  | { kind: 'typing'; id: string }
  | { kind: 'action'; id: string; action: KaiActionPreview }
  | { kind: 'notice'; id: string; text: string };

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
};

export type Me = {
  profile: Profile;
  risk_policy: RiskPolicy;
  paper: PaperAccount | null;
  subscription: Subscription;
  entitlements: EntitlementFlag[];
  memory_enabled: boolean;
  settings: AppSettings;
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
