/**
 * Local mirrors of docs/02_API_CONTRACTS.md shapes.
 * packages/shared did not exist when this lane ran (empty dir) — these are the
 * reconciliation point once the SCHEMA lane publishes db.types.ts / zod schemas.
 */

export type Freshness = 'live' | 'delayed' | 'stale' | 'closed' | 'unknown';

export type Quote = {
  symbol?: string;
  occ_symbol?: string;
  price?: number | null;
  source_ts?: string | null;
  received_ts?: string | null;
  freshness?: Freshness;
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
  | { kind: 'notice'; id: string; text: string };
