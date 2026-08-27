/**
 * Cheat Code AI — shared API contract (zod schemas + TS types).
 *
 * Owned by the API lane. Imported by apps/api (server) and apps/mobile (client).
 * Plain .ts, no build step. Only dependency: zod.
 *
 * Canonical sources: docs/02_API_CONTRACTS.md, docs/01_DATA_MODEL.md,
 * docs/BUILD-BRIEF-v1-slice.md ("Data + API subset").
 *
 * RULE: the backend never sends colours. Every visual state is a semantic
 * enum (state / freshness / grade_band / semantic) that the client maps to
 * the Volt & Violet palette. See docs/14_PALETTE_LOCK_VOLT_VIOLET.md.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Enums (mirror the Postgres types in 01 §1)                          */
/* ------------------------------------------------------------------ */

export const AppMode = z.enum(['day_trade', 'swing', 'invest']);
export type AppMode = z.infer<typeof AppMode>;

export const ExperienceLevel = z.enum(['beginner', 'intermediate', 'advanced']);
export type ExperienceLevel = z.infer<typeof ExperienceLevel>;

export const Involvement = z.enum(['hands_on', 'guided']);
export type Involvement = z.infer<typeof Involvement>;

export const SetupState = z.enum([
  'discovered',
  'watching',
  'forming',
  'ready',
  'invalidated',
  'expired',
]);
export type SetupState = z.infer<typeof SetupState>;

export const GradeBand = z.enum(['A', 'B', 'C']);
export type GradeBand = z.infer<typeof GradeBand>;

export const PositionEffect = z.enum([
  'buy_to_open',
  'sell_to_close',
  'sell_short',
  'buy_to_cover',
]);
export type PositionEffect = z.infer<typeof PositionEffect>;

export const Freshness = z.enum(['live', 'delayed', 'stale']);
export type Freshness = z.infer<typeof Freshness>;

export const AlertStatus = z.enum([
  'draft',
  'active',
  'triggered',
  'paused',
  'expired',
  'cancelled',
]);
export type AlertStatus = z.infer<typeof AlertStatus>;

export const KaiObjectType = z.enum([
  'briefing',
  'graded_setup',
  'comparison',
  'research_report',
  'verification_card',
  'room_summary',
  'community_intel',
  'alert_preview',
  'chart_response',
  'position_update',
  'action_preview',
  'debrief',
  'thesis_change',
]);
export type KaiObjectType = z.infer<typeof KaiObjectType>;

/** Market session status, computed from the America/New_York clock. */
export const MarketStatus = z.enum(['pre', 'open', 'after', 'closed']);
export type MarketStatus = z.infer<typeof MarketStatus>;

/* ------------------------------------------------------------------ */
/* Errors (02 §12 canonical set + validation)                          */
/* ------------------------------------------------------------------ */

export const ErrorCode = z.enum([
  // 02 §12 canonical set
  'FRESHNESS_STALE',
  'PREVIEW_INVALID',
  'PREVIEW_EXPIRED',
  'RISK_LIMIT_DAILY_LOSS',
  'RISK_LIMIT_POSITION_SIZE',
  'RISK_LIMIT_CONCENTRATION',
  'PDT_WARNING',
  'MARKET_CLOSED',
  'IDEMPOTENT_REPLAY',
  'STATE_CONFLICT',
  'CAPABILITY_UNSUPPORTED',
  'BROKER_DISCONNECTED',
  'BROKER_AUTH_EXPIRED',
  'BROKER_PERMISSION_MISSING',
  'OPTIONS_LEVEL_INSUFFICIENT',
  'ENTITLEMENT_REQUIRED',
  'ROOM_RESTRICTED',
  'RATE_LIMITED',
  'CONSENT_REQUIRED',
  'EXTENDED_HOURS_UNSUPPORTED',
  // added for this slice
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INTERNAL',
  'KAI_UNAVAILABLE',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    /** Beginner-readable. Never jargon, never a stack trace. */
    message_plain: z.string(),
    detail: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/* ------------------------------------------------------------------ */
/* Quote + freshness — every price-bearing payload carries this        */
/* ------------------------------------------------------------------ */

/**
 * Why a quote is not live. `entitlement` is the round-2 addition: the plan only
 * permits delayed data, so the number is DELAYED — honest, usable, and actions
 * stay enabled. It is never `stale` (stale means the feed failed).
 */
export const DelayReason = z.enum(['entitlement', 'feed_gap', 'market_closed', 'seed']);
export type DelayReason = z.infer<typeof DelayReason>;

export const Quote = z.object({
  symbol: z.string(),
  occ_symbol: z.string().nullable().optional(),
  price: z.number().nullable(),
  source_ts: z.string().nullable(),
  received_ts: z.string().nullable(),
  freshness: Freshness,
  /** Set whenever freshness is not 'live'. Optional so v1 payloads still parse. */
  delay_reason: DelayReason.nullable().optional(),
});
export type Quote = z.infer<typeof Quote>;

export const MarketBlock = z.object({
  status: MarketStatus,
  session_ts: z.string(),
  freshness: Freshness,
  /** No holidays table in Phase 0 — weekends only. See README known gaps. */
  holidays_known: z.boolean(),
  label_plain: z.string(),
});
export type MarketBlock = z.infer<typeof MarketBlock>;

/* ------------------------------------------------------------------ */
/* Kai object envelope (02 §7)                                         */
/* ------------------------------------------------------------------ */

export const KaiObjectEnvelope = z.object({
  id: z.string(),
  type: KaiObjectType,
  created_at: z.string(),
  model: z.string(),
  prompt_version: z.string(),
  disclosures: z.array(z.string()).default([]),
  refs: z.record(z.string(), z.unknown()).nullable().default(null),
  payload: z.unknown(),
});
export type KaiObjectEnvelope = z.infer<typeof KaiObjectEnvelope>;

/** Four explanation levels render from one computed analysis (03 Unit 3). */
export const ExplainLevels = z.object({
  beginner: z.string(),
  intermediate: z.string(),
  advanced: z.string(),
  family: z.string(),
});
export type ExplainLevels = z.infer<typeof ExplainLevels>;

export const SetupTarget = z.object({
  price: z.number(),
  label: z.string().optional(),
});

/**
 * graded_setup payload — mirrors the `setups` row plus `explain`.
 * `semantic` fields are labels, never colours.
 */
export const GradedSetupPayload = z.object({
  setup_id: z.string().nullable(),
  symbol: z.string(),
  mode: AppMode,
  intent: PositionEffect,
  state: SetupState,
  /** A display grade ("B+") is normalised to its band ("B"). */
  grade_band: z.preprocess(
    (v) => (typeof v === 'string' && v.length > 1 ? v[0].toUpperCase() : v),
    GradeBand.nullable()
  ),
  grade_display: z.string().nullable(),
  score: z.number().nullable(),
  thesis_plain: z.string(),
  thesis_technical: z.string().nullable(),
  entry: z.number().nullable(),
  entry_condition: z.record(z.string(), z.unknown()).nullable(),
  stop: z.number().nullable(),
  invalidation: z.record(z.string(), z.unknown()).nullable(),
  targets: z.array(SetupTarget),
  /** "Waiting for volume · risk $58 if wrong" — the one-line status. */
  next_action: z.string(),
  risk_plain: z.string(),
  est_risk_usd: z.number().nullable(),
  quote: Quote,
  explain: ExplainLevels,
});
export type GradedSetupPayload = z.infer<typeof GradedSetupPayload>;

/** briefing payload — the morning report object on Home. */
export const BriefingPayload = z.object({
  market_date: z.string(),
  headline: z.string(),
  lines: z
    .array(
      z.object({
        text: z.string(),
        /** Semantic weight only — client maps to tokens. */
        emphasis: z.enum(['neutral', 'attention', 'risk', 'positive']),
        /** A bare string (a symbol) is normalised to {symbol}. */
        ref: z
          .preprocess(
            (v) => (typeof v === 'string' ? { symbol: v } : v),
            z.record(z.string(), z.unknown()).nullable()
          )
          .nullable()
          .optional(),
      })
    )
    .min(1),
  lead_symbol: z.string().nullable(),
  closing_plain: z.string(),
});
export type BriefingPayload = z.infer<typeof BriefingPayload>;

/** alert_preview payload — structured logic shown BEFORE activation. */
export const AlertConditionAtom = z.object({
  atom: z.enum([
    'price_cross',
    'price_range',
    'pct_change',
    'rvol_min',
    'setup_state',
    'time_at',
    'volume_above',
    'catalyst_within',
  ]),
  symbol: z.string().nullable().optional(),
  operator: z.enum(['above', 'below', 'crosses_up', 'crosses_down', 'equals', 'within']).optional(),
  value: z.union([z.number(), z.string()]).nullable().optional(),
  value_2: z.union([z.number(), z.string()]).nullable().optional(),
});
export type AlertConditionAtom = z.infer<typeof AlertConditionAtom>;

export const AlertCondition = z.object({
  compose: z.enum(['all', 'any']).default('all'),
  atoms: z.array(AlertConditionAtom).min(1),
});
export type AlertCondition = z.infer<typeof AlertCondition>;

export const AlertPreviewPayload = z.object({
  natural_language: z.string(),
  condition: AlertCondition,
  data_dependency: z.object({
    symbols: z.array(z.string()),
    feeds: z.array(z.string()),
  }),
  frequency: z.enum(['once', 're_arm', 'recurring']),
  expires_at: z.string().nullable(),
  summary_plain: z.string(),
  risk_plain: z.string().nullable(),
});
export type AlertPreviewPayload = z.infer<typeof AlertPreviewPayload>;

/** action_preview payload — a Kai-proposed action awaiting a user tap. */
export const ActionPreviewPayload = z.object({
  action: z.enum(['draft_alert', 'open_setup', 'build_plan', 'compare', 'explain']),
  label: z.string(),
  summary_plain: z.string(),
  args: z.record(z.string(), z.unknown()),
});
export type ActionPreviewPayload = z.infer<typeof ActionPreviewPayload>;

/** The union Kai may emit as a ```json kai_object fenced block in this slice. */
export const KaiEmittedObject = z.discriminatedUnion('type', [
  z.object({ type: z.literal('graded_setup'), payload: GradedSetupPayload }),
  z.object({ type: z.literal('alert_preview'), payload: AlertPreviewPayload }),
  z.object({ type: z.literal('action_preview'), payload: ActionPreviewPayload }),
  z.object({ type: z.literal('briefing'), payload: BriefingPayload }),
]);
export type KaiEmittedObject = z.infer<typeof KaiEmittedObject>;

/* ------------------------------------------------------------------ */
/* Kai SSE frames                                                       */
/* ------------------------------------------------------------------ */

export const KaiFrameTextDelta = z.object({
  type: z.literal('text_delta'),
  text: z.string(),
});
export const KaiFrameObject = z.object({
  type: z.literal('object'),
  object: KaiObjectEnvelope,
});
export const KaiFrameDone = z.object({
  type: z.literal('done'),
  conversation_id: z.string(),
  message_id: z.string(),
  seq: z.number(),
  degraded: z.boolean().default(false),
});
export const KaiFrameError = z.object({
  type: z.literal('error'),
  code: ErrorCode,
  message_plain: z.string(),
});

export const KaiFrame = z.discriminatedUnion('type', [
  KaiFrameTextDelta,
  KaiFrameObject,
  KaiFrameDone,
  KaiFrameError,
]);
export type KaiFrame = z.infer<typeof KaiFrame>;
/** SSE `event:` names, one per frame type. */
export const KAI_SSE_EVENTS = ['text_delta', 'object', 'done', 'error'] as const;

/* ------------------------------------------------------------------ */
/* POST /api/v1/onboarding/complete                                     */
/* ------------------------------------------------------------------ */

export const RiskAnswer = z.enum(['careful', 'balanced', 'aggressive']);
export type RiskAnswer = z.infer<typeof RiskAnswer>;

/** S02 artboard: $2,000 account → $20 / $60 / $140 a bad day. */
export const RISK_ANSWER_DAILY_LOSS_PCT: Record<RiskAnswer, number> = {
  careful: 0.01,
  balanced: 0.03,
  aggressive: 0.07,
};
export const RISK_ANSWER_MAX_POSITION_PCT: Record<RiskAnswer, number> = {
  careful: 5,
  balanced: 10,
  aggressive: 20,
};

export const OnboardingCompleteRequest = z.object({
  goal_mode: AppMode,
  starting_balance: z
    .number()
    .min(1000, 'Paper accounts start between $1,000 and $100,000.')
    .max(100000, 'Paper accounts start between $1,000 and $100,000.'),
  risk_answer: RiskAnswer,
  involvement: Involvement,
  experience: ExperienceLevel,
  practice_choice: z.enum(['paper', 'broker', 'decide_later']).default('paper'),
});
export type OnboardingCompleteRequest = z.infer<typeof OnboardingCompleteRequest>;

export const ProfileResponse = z.object({
  user_id: z.string(),
  handle: z.string().nullable(),
  display_name: z.string().nullable(),
  primary_mode: AppMode,
  experience: ExperienceLevel,
  involvement: Involvement,
  explanation_level: ExperienceLevel,
  memory_enabled: z.boolean(),
  timezone: z.string().nullable(),
  onboarding: z.record(z.string(), z.unknown()),
});
export type ProfileResponse = z.infer<typeof ProfileResponse>;

export const RiskPolicyResponse = z.object({
  daily_loss_cap_usd: z.number().nullable(),
  max_position_pct: z.number().nullable(),
  max_open_positions: z.number().nullable(),
  max_sector_concentration_pct: z.number().nullable(),
  min_reward_risk: z.number().nullable(),
  pdt_warnings: z.boolean().nullable(),
});
export type RiskPolicyResponse = z.infer<typeof RiskPolicyResponse>;

export const OnboardingCompleteResponse = z.object({
  profile: ProfileResponse,
  risk_policy: RiskPolicyResponse,
  account: z.object({
    id: z.string(),
    kind: z.enum(['paper', 'broker']),
    name: z.string(),
    starting_balance: z.number().nullable(),
    cash: z.number().nullable(),
    equity: z.number().nullable(),
  }),
  /** True when the call was a replay of an already-completed onboarding. */
  idempotent_replay: z.boolean(),
});
export type OnboardingCompleteResponse = z.infer<typeof OnboardingCompleteResponse>;

/* ------------------------------------------------------------------ */
/* PUT /api/v1/mode                                                     */
/* ------------------------------------------------------------------ */

export const ModeRequest = z.object({ mode: AppMode });
export type ModeRequest = z.infer<typeof ModeRequest>;

export const ModeResponse = z.object({
  mode: AppMode,
  /** Switching mode never hides an open position or pending confirmation. */
  carryover: z.object({
    open_positions: z.array(
      z.object({
        id: z.string(),
        symbol: z.string(),
        direction: z.enum(['long', 'short']),
        qty: z.number(),
        avg_cost: z.number(),
        mode: AppMode,
      })
    ),
    pending_confirmations: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(['order', 'plan', 'alert']),
        symbol: z.string().nullable(),
        status: z.string(),
        summary_plain: z.string(),
      })
    ),
  }),
});
export type ModeResponse = z.infer<typeof ModeResponse>;

/* ------------------------------------------------------------------ */
/* GET /api/v1/home?mode=                                               */
/* ------------------------------------------------------------------ */

export const HomeQuery = z.object({ mode: AppMode.optional() });
export type HomeQuery = z.infer<typeof HomeQuery>;

export const WatchingItem = z.object({
  setup_id: z.string(),
  symbol: z.string(),
  grade_display: z.string().nullable(),
  grade_band: GradeBand.nullable(),
  state: SetupState,
  next_action: z.string(),
  quote: Quote,
});
export type WatchingItem = z.infer<typeof WatchingItem>;

export const DailyRisk = z.object({
  cap: z.number().nullable(),
  used: z.number(),
  remaining: z.number().nullable(),
  currency: z.string().default('USD'),
});
export type DailyRisk = z.infer<typeof DailyRisk>;

export const HomeResponse = z.object({
  mode: AppMode,
  market: MarketBlock,
  /** null + degraded:true when Kai is unavailable — never a fake briefing. */
  briefing: KaiObjectEnvelope.nullable(),
  lead_setup: KaiObjectEnvelope.nullable(),
  watching: z.array(WatchingItem),
  daily_risk: DailyRisk,
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
  invest_mode_notice: z.string().nullable(),
});
export type HomeResponse = z.infer<typeof HomeResponse>;

/* ------------------------------------------------------------------ */
/* GET /api/v1/setups?mode=&state=                                      */
/* ------------------------------------------------------------------ */

export const SetupsQuery = z.object({
  mode: AppMode.optional(),
  state: SetupState.optional(),
});
export type SetupsQuery = z.infer<typeof SetupsQuery>;

/** Caps: 5 day / 3 swing surfaced (03 Unit 2). */
export const SETUP_CAPS: Record<AppMode, number> = {
  day_trade: 5,
  swing: 3,
  invest: 3,
};

export const SetupCard = z.object({
  id: z.string(),
  symbol: z.string(),
  mode: AppMode,
  intent: PositionEffect,
  state: SetupState,
  grade_band: GradeBand.nullable(),
  grade_display: z.string().nullable(),
  score: z.number().nullable(),
  thesis_plain: z.string().nullable(),
  entry: z.number().nullable(),
  stop: z.number().nullable(),
  targets: z.array(SetupTarget),
  /** "risk $58 if wrong" */
  risk: z.object({
    est_risk_usd: z.number().nullable(),
    plain: z.string(),
  }),
  /** How this setup fits the user's mode + risk policy. */
  fit: z.object({
    matches_mode: z.boolean(),
    within_risk_policy: z.boolean(),
    plain: z.string(),
  }),
  next_action: z.object({
    label: z.string(),
    action: z.enum(['open_setup', 'watch', 'ask_kai', 'review']),
  }),
  quote: Quote,
  seeded: z.boolean(),
});
export type SetupCard = z.infer<typeof SetupCard>;

export const SetupsResponse = z.object({
  mode: AppMode,
  cap: z.number(),
  setups: z.array(SetupCard),
  market: MarketBlock,
});
export type SetupsResponse = z.infer<typeof SetupsResponse>;

/* ------------------------------------------------------------------ */
/* Kai conversations                                                    */
/* ------------------------------------------------------------------ */

export const PinnedContext = z.object({
  symbols: z.array(z.string()).optional(),
  setup_ids: z.array(z.string()).optional(),
  position_ids: z.array(z.string()).optional(),
});
export type PinnedContext = z.infer<typeof PinnedContext>;

export const CreateConversationRequest = z.object({
  mode: AppMode,
  pinned: PinnedContext.optional(),
  title: z.string().max(200).optional(),
});
export type CreateConversationRequest = z.infer<typeof CreateConversationRequest>;

export const CreateConversationResponse = z.object({
  id: z.string(),
  mode: AppMode,
  created_at: z.string(),
});
export type CreateConversationResponse = z.infer<typeof CreateConversationResponse>;

export const PostMessageRequest = z.object({
  content: z.string().min(1).max(4000),
});
export type PostMessageRequest = z.infer<typeof PostMessageRequest>;

/** Last N turns fed back into context assembly (03 Unit 3). */
export const KAI_HISTORY_TURNS = 20;

/* ------------------------------------------------------------------ */
/* Alerts                                                               */
/* ------------------------------------------------------------------ */

export const AlertDraftRequest = z.object({
  natural_language: z.string().min(1).max(500),
  refs: z
    .object({
      symbol: z.string().optional(),
      setup_id: z.string().optional(),
      level: z.number().optional(),
    })
    .default({}),
});
export type AlertDraftRequest = z.infer<typeof AlertDraftRequest>;

export const AlertRow = z.object({
  id: z.string(),
  status: AlertStatus,
  natural_language: z.string().nullable(),
  condition: AlertCondition.or(z.record(z.string(), z.unknown())),
  data_dependency: z.record(z.string(), z.unknown()),
  frequency: z.string().nullable(),
  expires_at: z.string().nullable(),
  refs: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  summary_plain: z.string(),
  next_action: z.object({
    label: z.string(),
    action: z.enum(['activate', 'review', 'ask_kai', 'none']),
  }),
  /**
   * Round 2: there is no alert-evaluation worker yet, so an ACTIVE alert is
   * "armed" and the app says so rather than implying tick-by-tick checking.
   * Optional so v1-slice payloads still parse. See AlertMonitoring below.
   */
  monitoring: z.enum(['armed_no_feed', 'not_armed', 'resolved']).optional(),
  monitoring_plain: z.string().optional(),
});
export type AlertRow = z.infer<typeof AlertRow>;

export const AlertDraftResponse = z.object({
  alert: AlertRow,
  preview: KaiObjectEnvelope,
  degraded: z.boolean(),
});
export type AlertDraftResponse = z.infer<typeof AlertDraftResponse>;

export const AlertsResponse = z.object({
  needs_attention: z.array(AlertRow),
  watching: z.array(AlertRow),
  resolved: z.array(AlertRow),
  /** Shown when all three groups are empty. */
  empty_copy: z.string(),
});
export type AlertsResponse = z.infer<typeof AlertsResponse>;

/* ------------------------------------------------------------------ */
/* GET /api/v1/health                                                   */
/* ------------------------------------------------------------------ */

export const HealthResponse = z.object({
  ok: z.boolean(),
  supabase: z.boolean(),
  anthropic: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/* ==================================================================== */
/* ROUND 2 — setups detail · alerts lifecycle · trade/symbol/market ·    */
/*           debriefs · community · account                             */
/*                                                                      */
/* Appended, never edited: everything above stays byte-stable so the     */
/* mobile app's type-only imports keep resolving. Canonical sources:     */
/* docs/BUILD-BRIEF-round-2.md, docs/02_API_CONTRACTS.md §§1-3,6,9,11,   */
/* docs/06_TRADE_PAGE_SPEC_extracted.md §§3-5,                          */
/* docs/08_COMMUNITY_SPEC_extracted.md §§5,7,8.                         */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* Market data                                                         */
/* ------------------------------------------------------------------ */

/** A quote with the extra context the Trade surfaces need. */
export const MarketQuote = Quote.extend({
  prev_close: z.number().nullable(),
  change: z.number().nullable(),
  change_pct: z.number().nullable(),
  /** "Delayed 15m · last trade 3:55 PM ET" — the client shows this verbatim. */
  label_plain: z.string(),
  session: MarketStatus,
});
export type MarketQuote = z.infer<typeof MarketQuote>;

export const Timeframe = z.enum(['1d', '5m']);
export type Timeframe = z.infer<typeof Timeframe>;

export const Candle = z.object({
  ts: z.string(),
  o: z.number().nullable(),
  h: z.number().nullable(),
  l: z.number().nullable(),
  c: z.number().nullable(),
  v: z.number().nullable(),
});
export type Candle = z.infer<typeof Candle>;

export const CandlesQuery = z.object({
  symbol: z.string().min(1).max(12),
  tf: Timeframe.default('1d'),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type CandlesQuery = z.infer<typeof CandlesQuery>;

export const CandlesResponse = z.object({
  symbol: z.string(),
  timeframe: Timeframe,
  candles: z.array(Candle),
  /** 'polygon' = fetched this request; 'cache' = served from the candles table. */
  source: z.enum(['polygon', 'cache', 'none']),
  freshness: Freshness,
  delay_reason: DelayReason.nullable(),
  market: MarketBlock,
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type CandlesResponse = z.infer<typeof CandlesResponse>;

export const SnapshotQuery = z.object({ symbols: z.string().min(1).max(400) });
export type SnapshotQuery = z.infer<typeof SnapshotQuery>;

export const SnapshotResponse = z.object({
  quotes: z.array(MarketQuote),
  market: MarketBlock,
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type SnapshotResponse = z.infer<typeof SnapshotResponse>;

export const SessionResponse = z.object({
  market: MarketBlock,
  /** No holidays table yet — the client must say so where it matters. */
  holidays_known: z.boolean(),
  notice_plain: z.string().nullable(),
});
export type SessionResponse = z.infer<typeof SessionResponse>;

/* ------------------------------------------------------------------ */
/* GET /setups/:id — Live / Plan / Learn                               */
/* ------------------------------------------------------------------ */

export const StepStatus = z.enum(['done', 'current', 'pending', 'failed']);
export type StepStatus = z.infer<typeof StepStatus>;

export const SetupStep = z.object({
  key: z.string(),
  label: z.string(),
  status: StepStatus,
});
export const SetupStepper = z.object({
  steps: z.array(SetupStep),
  current_index: z.number(),
  plain: z.string(),
});
export type SetupStepper = z.infer<typeof SetupStepper>;

/** ok:null means "not knowable from the data we have" — never a silent false. */
export const Confirmation = z.object({
  label: z.string(),
  ok: z.boolean().nullable(),
  detail_plain: z.string().nullable(),
});
export type Confirmation = z.infer<typeof Confirmation>;

export const SetupLive = z.object({
  quote: MarketQuote,
  state: SetupState,
  stepper: SetupStepper,
  narration_plain: z.string(),
  confirmations: z.array(Confirmation),
});
export type SetupLive = z.infer<typeof SetupLive>;

export const SizeSuggestion = z.object({
  shares: z.number().nullable(),
  notional: z.number().nullable(),
  max_loss_usd: z.number().nullable(),
  within_policy: z.boolean(),
  plain: z.string(),
});
export type SizeSuggestion = z.infer<typeof SizeSuggestion>;

export const Scenario = z.object({
  name: z.string(),
  plain: z.string(),
  outcome_usd: z.number().nullable(),
  semantic: z.enum(['positive', 'neutral', 'risk']),
});
export type Scenario = z.infer<typeof Scenario>;

export const UiAction = z.object({
  action: z.string(),
  label: z.string(),
  enabled: z.boolean().default(true),
  hint: z.string().nullable().default(null),
  primary: z.boolean().default(false),
  route: z.string().nullable().default(null),
});
export type UiAction = z.infer<typeof UiAction>;

export const SetupPlanBlock = z.object({
  entry: z.number().nullable(),
  entry_condition: z.record(z.string(), z.unknown()).nullable(),
  entry_plain: z.string(),
  invalidation: z.record(z.string(), z.unknown()).nullable(),
  invalidation_plain: z.string(),
  stop: z.number().nullable(),
  targets: z.array(SetupTarget),
  size_suggestion: SizeSuggestion,
  scenarios: z.array(Scenario),
  risk_reward: z.number().nullable(),
  risk_reward_plain: z.string(),
  actions: z.array(UiAction),
});
export type SetupPlanBlock = z.infer<typeof SetupPlanBlock>;

export const EvidenceItem = z.object({
  label: z.string(),
  ok: z.boolean(),
  detail_plain: z.string().nullable(),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

/** One question, answer revealed. No score, no XP, no streak. */
export const Quiz = z.object({
  q: z.string(),
  options: z.array(z.string()).min(2),
  answer_idx: z.number(),
  explanation_plain: z.string().nullable(),
});
export type Quiz = z.infer<typeof Quiz>;

export const SetupLearn = z.object({
  why_plain: z.string(),
  evidence: z.array(EvidenceItem),
  similar_example: z
    .object({ symbol: z.string(), plain: z.string(), when: z.string().nullable() })
    .nullable(),
  quiz: Quiz.nullable(),
});
export type SetupLearn = z.infer<typeof SetupLearn>;

export const SetupDetailQuery = z.object({ mode: AppMode.optional() });

export const SetupDetailResponse = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string().nullable(),
  mode: AppMode,
  intent: PositionEffect,
  state: SetupState,
  grade_band: GradeBand.nullable(),
  grade_display: z.string().nullable(),
  score: z.number().nullable(),
  seeded: z.boolean(),
  /** 'polygon-daily' once refresh-seed-setups has run; null for raw seed rows. */
  source: z.string().nullable(),
  refreshed_at: z.string().nullable(),
  live: SetupLive,
  plan: SetupPlanBlock,
  learn: SetupLearn,
  explain: ExplainLevels,
  fit: z.object({ ok: z.boolean(), reasons: z.array(z.string()) }),
  next_action: UiAction,
  thesis: z
    .object({ id: z.string(), summary_plain: z.string(), status: z.string() })
    .nullable(),
  discussion_room_id: z.string().nullable(),
  market: MarketBlock,
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type SetupDetailResponse = z.infer<typeof SetupDetailResponse>;

export const SetupFollowResponse = z.object({
  setup_id: z.string(),
  symbol: z.string(),
  watchlisted: z.boolean(),
  already_following: z.boolean(),
  alert: AlertRow.nullable(),
  preview: KaiObjectEnvelope.nullable(),
  plain: z.string(),
});
export type SetupFollowResponse = z.infer<typeof SetupFollowResponse>;

/* ------------------------------------------------------------------ */
/* GET /theses?symbol=&mode=                                            */
/* ------------------------------------------------------------------ */

export const ThesesQuery = z.object({
  symbol: z.string().optional(),
  mode: AppMode.optional(),
});

export const ThesisRow = z.object({
  id: z.string(),
  symbol: z.string(),
  mode: AppMode,
  timeframe: z.string(),
  setup_id: z.string().nullable(),
  intent: PositionEffect,
  summary_plain: z.string(),
  evidence: z.record(z.string(), z.unknown()).nullable(),
  status: z.enum(['active', 'superseded', 'expired']),
  superseded_by: z.string().nullable(),
  supersession: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});
export type ThesisRow = z.infer<typeof ThesisRow>;

export const ThesesResponse = z.object({
  active: z.array(ThesisRow),
  superseded: z.array(ThesisRow),
  empty_copy: z.string(),
});
export type ThesesResponse = z.infer<typeof ThesesResponse>;

/* ------------------------------------------------------------------ */
/* Alerts lifecycle                                                     */
/* ------------------------------------------------------------------ */

/**
 * There is no alert-evaluation worker in this round. An active alert is armed
 * and honest about it — the app says "armed · live evaluation starts when
 * market data goes live" rather than implying it is being checked tick by tick.
 */
export const AlertMonitoring = z.enum(['armed_no_feed', 'not_armed', 'resolved']);
export type AlertMonitoring = z.infer<typeof AlertMonitoring>;

export const MONITORING_PLAIN: Record<AlertMonitoring, string> = {
  armed_no_feed: 'Armed · live evaluation starts when market data goes live.',
  not_armed: 'Not armed — Kai is not watching this right now.',
  resolved: 'Finished — nothing left to watch here.',
};

export const AlertActivateRequest = z.object({ draft_id: z.string().min(1) });
export type AlertActivateRequest = z.infer<typeof AlertActivateRequest>;

export const AlertLimit = z.object({
  used: z.number(),
  max: z.number().nullable(),
  tier: z.string(),
  plain: z.string(),
});
export type AlertLimit = z.infer<typeof AlertLimit>;

export const AlertActivateResponse = z.object({
  alert: AlertRow,
  monitoring: AlertMonitoring,
  monitoring_plain: z.string(),
  limit: AlertLimit,
});
export type AlertActivateResponse = z.infer<typeof AlertActivateResponse>;

export const AlertHistoryItem = z.object({
  seq: z.number().nullable(),
  at: z.string(),
  event: z.string(),
  plain: z.string(),
});
export type AlertHistoryItem = z.infer<typeof AlertHistoryItem>;

/** Where the alert came from, already resolved to a label the app can show. */
export const OriginRef = z.object({
  kind: z.enum(['setup', 'symbol', 'room', 'conversation', 'level']),
  label: z.string(),
  route: z.string().nullable(),
});
export type OriginRef = z.infer<typeof OriginRef>;

export const AlertDetailResponse = z.object({
  alert: AlertRow,
  condition_plain: z.string(),
  structured: z.record(z.string(), z.unknown()),
  data_dependency: z.record(z.string(), z.unknown()),
  monitoring: AlertMonitoring,
  monitoring_plain: z.string(),
  history: z.array(AlertHistoryItem),
  origin: z.array(OriginRef),
  actions: z.array(UiAction),
});
export type AlertDetailResponse = z.infer<typeof AlertDetailResponse>;

export const AlertActionRequest = z.object({
  action: z.enum(['pause', 'resume', 'cancel', 'edit']),
  natural_language: z.string().min(1).max(500).optional(),
});
export type AlertActionRequest = z.infer<typeof AlertActionRequest>;

export const AlertActionResponse = z.object({
  alert: AlertRow,
  monitoring: AlertMonitoring,
  monitoring_plain: z.string(),
  /** Present only for `edit`: the re-parsed draft awaiting activation. */
  preview: KaiObjectEnvelope.nullable(),
  plain: z.string(),
});
export type AlertActionResponse = z.infer<typeof AlertActionResponse>;

/* ------------------------------------------------------------------ */
/* Watchlist                                                            */
/* ------------------------------------------------------------------ */

export const WatchlistItem = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  note: z.string().nullable(),
  added_at: z.string().nullable(),
  quote: MarketQuote.nullable(),
  setup_id: z.string().nullable(),
  grade_display: z.string().nullable(),
  state: SetupState.nullable(),
});
export type WatchlistItem = z.infer<typeof WatchlistItem>;

export const WatchlistResponse = z.object({
  id: z.string().nullable(),
  name: z.string(),
  items: z.array(WatchlistItem),
  empty_copy: z.string(),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type WatchlistResponse = z.infer<typeof WatchlistResponse>;

export const WatchlistAddRequest = z.object({
  symbol: z.string().min(1).max(12),
  note: z.string().max(280).optional(),
});
export type WatchlistAddRequest = z.infer<typeof WatchlistAddRequest>;

/* ------------------------------------------------------------------ */
/* GET /trade/landing?mode=  (02 §2 shape)                              */
/* ------------------------------------------------------------------ */

export const AccountStrip = z.object({
  account_id: z.string().nullable(),
  kind: z.literal('paper'),
  label: z.string(),
  equity: z.number().nullable(),
  cash: z.number().nullable(),
  buying_power: z.number().nullable(),
  currency: z.string(),
  plain: z.string(),
});
export type AccountStrip = z.infer<typeof AccountStrip>;

export const Mover = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  quote: MarketQuote,
  direction: z.enum(['up', 'down']),
});
export type Mover = z.infer<typeof Mover>;

export const ContinueItem = z.object({
  kind: z.enum(['alert_draft', 'followed_setup', 'triggered_alert']),
  id: z.string(),
  symbol: z.string().nullable(),
  label: z.string(),
  plain: z.string(),
  route: z.string(),
});
export type ContinueItem = z.infer<typeof ContinueItem>;

export const TradeLandingQuery = z.object({ mode: AppMode.optional() });

export const TradeLandingResponse = z.object({
  mode: AppMode,
  market: MarketBlock,
  account_strip: AccountStrip,
  search_ctx: z.object({ placeholder: z.string(), examples: z.array(z.string()) }),
  watchlists: z.array(
    z.object({ id: z.string().nullable(), name: z.string(), items: z.array(WatchlistItem) })
  ),
  markets: z.object({
    movers: z.array(Mover),
    sectors: z.array(z.unknown()),
    calendar: z.array(z.unknown()),
  }),
  positions_snapshot: z.object({ open: z.array(z.unknown()), plain: z.string() }),
  pending_orders: z.array(z.unknown()),
  continue: z.array(ContinueItem),
  kai_opportunities: z.array(SetupCard),
  catalysts: z.array(z.unknown()),
  /** Honest notices: what is not live yet on this surface. */
  notices: z.array(z.string()),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type TradeLandingResponse = z.infer<typeof TradeLandingResponse>;

export const TradeSearchQuery = z.object({ q: z.string().min(1).max(120) });

export const InstrumentResult = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  exchange: z.string().nullable(),
  kind: z.enum(['equity', 'etf', 'option']),
  route: z.string(),
});
export type InstrumentResult = z.infer<typeof InstrumentResult>;

export const TradeSearchResponse = z.object({
  q: z.string(),
  instruments: z.array(InstrumentResult),
  /** Nothing matched a ticker → offer it to Kai as a question instead. */
  intent: z.object({ kind: z.literal('kai_question'), text: z.string() }).nullable(),
  empty_copy: z.string(),
});
export type TradeSearchResponse = z.infer<typeof TradeSearchResponse>;

/* ------------------------------------------------------------------ */
/* GET /symbols/:symbol?mode=                                           */
/* ------------------------------------------------------------------ */

export const ChartAnnotation = z.object({
  kind: z.enum(['level', 'zone', 'arrow', 'label', 'measure']),
  price: z.number().nullable().optional(),
  range: z.array(z.number()).nullable().optional(),
  ts_range: z.array(z.string()).nullable().optional(),
  text: z.string().nullable().optional(),
  /** Semantics only. The backend never sends colours (14 palette lock). */
  semantic: z.enum(['entry', 'stop', 'target', 'invalidation', 'note']),
});
export type ChartAnnotation = z.infer<typeof ChartAnnotation>;

export const ChartConfig = z.object({
  timeframes: z.array(z.string()),
  default_timeframe: z.string(),
  candles_path: z.string(),
  annotations: z.array(ChartAnnotation),
});
export type ChartConfig = z.infer<typeof ChartConfig>;

export const ModeLens = z.object({
  mode: AppMode,
  has_setup: z.boolean(),
  setup_id: z.string().nullable(),
  state: SetupState.nullable(),
  grade_display: z.string().nullable(),
  headline_plain: z.string(),
  detail_plain: z.string(),
  next_action: UiAction.nullable(),
});
export type ModeLens = z.infer<typeof ModeLens>;

export const KaiInterpretation = z.object({
  conclusion_plain: z.string(),
  state: SetupState.nullable(),
  grade_display: z.string().nullable(),
  risk_plain: z.string(),
  missing_evidence: z.array(z.string()),
  invalidation_plain: z.string().nullable(),
  last_updated: z.string(),
  source: z.enum(['setup', 'kai', 'none']),
  kai_object: KaiObjectEnvelope.nullable(),
  refs: z.record(z.string(), z.unknown()),
});
export type KaiInterpretation = z.infer<typeof KaiInterpretation>;

export const NewsItem = z.object({
  id: z.string(),
  title: z.string(),
  publisher: z.string().nullable(),
  url: z.string().nullable(),
  published_utc: z.string(),
  tickers: z.array(z.string()),
  description: z.string().nullable(),
});
export type NewsItem = z.infer<typeof NewsItem>;

export const SymbolDetailQuery = z.object({ mode: AppMode.optional() });

export const SymbolDetailResponse = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  mode: AppMode,
  quote: MarketQuote,
  market: MarketBlock,
  chart: ChartConfig,
  lenses: z.array(ModeLens),
  kai_interpretation: KaiInterpretation,
  your_context: z.object({
    watchlisted: z.boolean(),
    alerts: z.array(AlertRow),
    plans: z.array(z.unknown()),
    positions: z.array(z.unknown()),
    plain: z.string(),
  }),
  evidence: z.object({ news: z.array(NewsItem), plain: z.string() }),
  /** Placeholder until MOBILE-B's rooms ship; never a fabricated sentiment. */
  community: z.object({
    thread_summary: z.null(),
    sentiment: z.null(),
    room_id: z.string().nullable(),
    plain: z.string(),
  }),
  actions: z.array(UiAction),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type SymbolDetailResponse = z.infer<typeof SymbolDetailResponse>;

/* ------------------------------------------------------------------ */
/* Positions & debriefs                                                 */
/* ------------------------------------------------------------------ */

export const PositionsQuery = z.object({
  status: z.enum(['open', 'closed', 'all']).default('closed'),
});

export const PositionRow = z.object({
  id: z.string(),
  symbol: z.string(),
  direction: z.enum(['long', 'short']),
  qty: z.number(),
  avg_cost: z.number(),
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  realized_pnl: z.number().nullable(),
  mode: AppMode,
  /** From origin/plan origin jsonb: dev-simulated trades are labeled, always. */
  simulated: z.boolean(),
  has_debrief: z.boolean(),
  debrief_id: z.string().nullable(),
  plain: z.string(),
});
export type PositionRow = z.infer<typeof PositionRow>;

export const PositionsResponse = z.object({
  positions: z.array(PositionRow),
  empty_copy: z.string(),
});
export type PositionsResponse = z.infer<typeof PositionsResponse>;

export const DebriefOutcome = z.object({
  pnl: z.number().nullable(),
  pnl_pct: z.number().nullable(),
  held: z.string(),
  held_ms: z.number().nullable(),
  exit_reason: z.string(),
  semantic: z.enum(['positive', 'neutral', 'risk']),
});
export type DebriefOutcome = z.infer<typeof DebriefOutcome>;

export const ProcessReceiptItem = z.object({
  label: z.string(),
  ok: z.boolean(),
  detail_plain: z.string().nullable(),
});
export type ProcessReceiptItem = z.infer<typeof ProcessReceiptItem>;

export const TimelineItem = z.object({
  at: z.string(),
  kind: z.string(),
  label: z.string(),
  plain: z.string(),
});
export type TimelineItem = z.infer<typeof TimelineItem>;

/** kai_object type 'debrief'. */
export const DebriefPayload = z.object({
  position_id: z.string(),
  symbol: z.string(),
  direction: z.enum(['long', 'short']),
  outcome: DebriefOutcome,
  process_receipt: z.array(ProcessReceiptItem),
  what_worked: z.array(z.string()),
  what_failed: z.array(z.string()),
  timeline: z.array(TimelineItem),
  lesson_plain: z.string(),
  simulated: z.boolean(),
});
export type DebriefPayload = z.infer<typeof DebriefPayload>;

export const DebriefRow = z.object({
  id: z.string(),
  position_id: z.string().nullable(),
  symbol: z.string(),
  created_at: z.string(),
  kai_summary: z.string().nullable(),
  payload: DebriefPayload,
  kai_object: KaiObjectEnvelope.nullable(),
  simulated: z.boolean(),
  degraded: z.boolean(),
  actions: z.array(UiAction),
});
export type DebriefRow = z.infer<typeof DebriefRow>;

export const DebriefsResponse = z.object({
  debriefs: z.array(DebriefRow),
  /** Closed positions with no debrief yet → "Get Kai's debrief". */
  awaiting: z.array(PositionRow),
  empty_copy: z.string(),
});
export type DebriefsResponse = z.infer<typeof DebriefsResponse>;

export const SaveLessonResponse = z.object({
  saved: z.boolean(),
  memory_id: z.string().nullable(),
  plain: z.string(),
});
export type SaveLessonResponse = z.infer<typeof SaveLessonResponse>;

export const SimulateClosedTradeRequest = z.object({
  symbol: z.string().min(1).max(12).optional(),
  outcome: z.enum(['win', 'loss']).optional(),
});
export type SimulateClosedTradeRequest = z.infer<typeof SimulateClosedTradeRequest>;

export const SimulateClosedTradeResponse = z.object({
  position_id: z.string(),
  plan_id: z.string().nullable(),
  order_id: z.string().nullable(),
  symbol: z.string(),
  realized_pnl: z.number(),
  simulated: z.literal(true),
  plain: z.string(),
});
export type SimulateClosedTradeResponse = z.infer<typeof SimulateClosedTradeResponse>;

/* ------------------------------------------------------------------ */
/* Community                                                            */
/* ------------------------------------------------------------------ */

export const RoomType = z.enum(['core', 'setup', 'announcement']);
export type RoomType = z.infer<typeof RoomType>;

export const MemberRole = z.enum(['member', 'moderator', 'educator', 'expert']);
export type MemberRole = z.infer<typeof MemberRole>;

export const MessageKind = z.enum([
  'text',
  'chart',
  'voice_note',
  'kai_object',
  'position_update',
  'system',
]);
export type MessageKind = z.infer<typeof MessageKind>;

export const RoomRow = z.object({
  id: z.string(),
  type: RoomType,
  mode: AppMode.nullable(),
  slug: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  setup_id: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
  pinned: z.unknown(),
  member_count: z.number(),
  message_count: z.number(),
  joined: z.boolean(),
  last_read_seq: z.number().nullable(),
  last_seq: z.number(),
  unread: z.number(),
  route: z.string(),
});
export type RoomRow = z.infer<typeof RoomRow>;

export const RoomsQuery = z.object({ mode: AppMode.optional() });

export const RoomsResponse = z.object({
  mode: AppMode,
  core: z.array(RoomRow),
  setup_rooms: z.array(RoomRow),
  /** Live sessions are Phase 2 — the client says so instead of faking a card. */
  live_notice: z.string(),
  empty_copy: z.string(),
});
export type RoomsResponse = z.infer<typeof RoomsResponse>;

export const RoomJoinResponse = z.object({
  room: RoomRow,
  joined: z.boolean(),
  already_member: z.boolean(),
  plain: z.string(),
});
export type RoomJoinResponse = z.infer<typeof RoomJoinResponse>;

export const MessageAuthor = z.object({
  user_id: z.string(),
  handle: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role_labels: z.array(z.string()),
  route: z.string(),
});
export type MessageAuthor = z.infer<typeof MessageAuthor>;

export const PositionDisclosure = z.object({
  holds: z.boolean(),
  symbol: z.string().nullable().optional(),
  direction: z.enum(['long', 'short']).nullable().optional(),
  plain: z.string().nullable().optional(),
});
export type PositionDisclosure = z.infer<typeof PositionDisclosure>;

export const StructuredIdea = z.object({
  direction: z.enum(['long', 'short']),
  thesis: z.string().min(1).max(2000),
  entry_condition: z.string().max(500).nullable().optional(),
  invalidation: z.string().max(500).nullable().optional(),
  risk_and_size: z.string().max(500).nullable().optional(),
  target_and_horizon: z.string().max(500).nullable().optional(),
  evidence: z.string().max(1000).nullable().optional(),
  symbol: z.string().max(12).nullable().optional(),
});
export type StructuredIdea = z.infer<typeof StructuredIdea>;

export const MessageRow = z.object({
  id: z.string(),
  room_id: z.string(),
  user_id: z.string().nullable(),
  seq: z.number(),
  kind: MessageKind,
  body: z.string().nullable(),
  parent_id: z.string().nullable(),
  refs: z.record(z.string(), z.unknown()).nullable(),
  structured_idea: z.record(z.string(), z.unknown()).nullable(),
  position_disclosure: z.record(z.string(), z.unknown()).nullable(),
  deleted: z.boolean(),
  created_at: z.string(),
  author: MessageAuthor.nullable(),
  /** kind='kai_object' → the resolved envelope, so the client renders an object. */
  kai_object: KaiObjectEnvelope.nullable(),
});
export type MessageRow = z.infer<typeof MessageRow>;

export const MessagesQuery = z.object({
  after_seq: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

export const MessagesResponse = z.object({
  room: RoomRow,
  messages: z.array(MessageRow),
  last_seq: z.number(),
  has_more: z.boolean(),
  /** From room_members.last_read_seq — drives the "N new since you left" pill. */
  catch_up: z.object({ since_seq: z.number(), count: z.number(), plain: z.string() }),
});
export type MessagesResponse = z.infer<typeof MessagesResponse>;

export const PostMessageBody = z.object({
  kind: z.enum(['text', 'chart', 'position_update']).default('text'),
  body: z.string().min(1).max(4000),
  refs: z.record(z.string(), z.unknown()).optional(),
  structured_idea: StructuredIdea.optional(),
  position_disclosure: PositionDisclosure.optional(),
  parent_id: z.string().optional(),
});
export type PostMessageBody = z.infer<typeof PostMessageBody>;

export const PostMessageResponse = z.object({
  message: MessageRow,
  plain: z.string(),
});
export type PostMessageResponse = z.infer<typeof PostMessageResponse>;

export const RoomKaiCommand = z.enum(['summarize', 'verify', 'to_alert', 'compare', 'explain']);
export type RoomKaiCommand = z.infer<typeof RoomKaiCommand>;

export const RoomKaiRequest = z.object({
  command: RoomKaiCommand,
  message_id: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
});
export type RoomKaiRequest = z.infer<typeof RoomKaiRequest>;

export const RoomKaiResponse = z.object({
  message: MessageRow,
  object: KaiObjectEnvelope,
  degraded: z.boolean(),
});
export type RoomKaiResponse = z.infer<typeof RoomKaiResponse>;

/** room_summary payload — 08 §5: window, themes, claims, disagreements, assets. */
export const RoomSummaryPayload = z.object({
  room_id: z.string(),
  room_name: z.string(),
  window: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
    from_seq: z.number().nullable(),
    to_seq: z.number().nullable(),
  }),
  sample_size: z.number(),
  themes: z.array(z.object({ label: z.string(), plain: z.string() })),
  claims: z.array(
    z.object({
      claim: z.string(),
      verified: z.enum(['verified', 'partially_verified', 'unverified', 'false', 'unverifiable']),
      plain: z.string(),
    })
  ),
  disagreements: z.array(z.string()),
  assets: z.array(z.string()),
  missed_updates: z.array(z.string()),
  /** Community claims stay labeled and separate from Kai's own conclusion. */
  confidence_limits: z.string(),
  kai_conclusion_plain: z.string(),
});
export type RoomSummaryPayload = z.infer<typeof RoomSummaryPayload>;

export const VerificationCardPayload = z.object({
  claim: z.string(),
  result: z.enum(['verified', 'partially_verified', 'unverified', 'false', 'unverifiable']),
  sources: z.array(
    z.object({ label: z.string(), url: z.string().nullable(), ts: z.string().nullable() })
  ),
  timestamp: z.string(),
  uncertainty: z.string(),
  effect_on_setup: z.string(),
});
export type VerificationCardPayload = z.infer<typeof VerificationCardPayload>;

export const ComparisonPayload = z.object({
  subject: z.string(),
  bull: z.object({ points: z.array(z.string()), plain: z.string() }),
  bear: z.object({ points: z.array(z.string()), plain: z.string() }),
  kai_conclusion_plain: z.string(),
  confidence_limits: z.string(),
});
export type ComparisonPayload = z.infer<typeof ComparisonPayload>;

export const StructuredAssistResponse = z.object({
  original: z.record(z.string(), z.unknown()),
  improved: StructuredIdea,
  notes: z.array(z.string()),
  plain: z.string(),
  /** Nothing is published — the member still has to press Post. */
  published: z.literal(false),
  degraded: z.boolean(),
});
export type StructuredAssistResponse = z.infer<typeof StructuredAssistResponse>;

export const ReportRequest = z.object({
  reason: z.string().min(3).max(500),
});
export type ReportRequest = z.infer<typeof ReportRequest>;

export const ReportResponse = z.object({
  report_id: z.string(),
  plain: z.string(),
});
export type ReportResponse = z.infer<typeof ReportResponse>;

export const MuteRequest = z.object({
  /** Minutes; omitted = until the member unmutes. */
  minutes: z.number().min(1).max(60 * 24 * 30).optional(),
});
export type MuteRequest = z.infer<typeof MuteRequest>;

export const MuteResponse = z.object({
  room_id: z.string(),
  muted_until: z.string().nullable(),
  plain: z.string(),
});
export type MuteResponse = z.infer<typeof MuteResponse>;

export const ContributorResponse = z.object({
  user_id: z.string(),
  handle: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role_labels: z.array(z.string()),
  contribution: z.object({
    ideas_posted: z.number(),
    theses_updated: z.number(),
    outcomes_disclosed: z.number(),
    defined_risk_rate: z.number().nullable(),
    usefulness_score: z.number().nullable(),
    plain: z.string(),
  }),
  recent_messages: z.array(
    z.object({
      id: z.string(),
      room_id: z.string(),
      room_name: z.string(),
      created_at: z.string(),
      excerpt: z.string(),
      position_disclosure: z.record(z.string(), z.unknown()).nullable(),
    })
  ),
  /** 08 §8: no points, streaks, leaderboards or profit contests. Ever. */
  rankings: z.null(),
  actions: z.array(UiAction),
});
export type ContributorResponse = z.infer<typeof ContributorResponse>;

/* ------------------------------------------------------------------ */
/* Account                                                              */
/* ------------------------------------------------------------------ */

export const Accessibility = z.object({
  reduced_motion: z.boolean(),
  text_scale: z.number(),
});
export type Accessibility = z.infer<typeof Accessibility>;

export const QuietHours = z.object({
  start: z.string().nullable(),
  end: z.string().nullable(),
  timezone: z.string().nullable(),
});
export type QuietHours = z.infer<typeof QuietHours>;

export const SubscriptionBlock = z.object({
  tier: z.enum(['free', 'premium']),
  status: z.string(),
  current_period_end: z.string().nullable(),
  plain: z.string(),
});
export type SubscriptionBlock = z.infer<typeof SubscriptionBlock>;

export const MeResponse = z.object({
  profile: ProfileResponse,
  risk_policy: RiskPolicyResponse.nullable(),
  account: z.object({
    id: z.string().nullable(),
    kind: z.enum(['paper', 'broker']),
    name: z.string(),
    starting_balance: z.number().nullable(),
    cash: z.number().nullable(),
    buying_power: z.number().nullable(),
    equity: z.number().nullable(),
    reset_count: z.number(),
    last_reset_at: z.string().nullable(),
    can_reset: z.boolean(),
    reset_plain: z.string(),
  }),
  subscription: SubscriptionBlock,
  /** Flat flag map from entitlement_flags for the user's tier. */
  entitlements: z.record(z.string(), z.unknown()),
  memory_enabled: z.boolean(),
  prefs: z.object({
    explanation_level: ExperienceLevel,
    quiet_hours: QuietHours.nullable(),
    notifications: z.object({ per_mode: z.record(z.string(), z.unknown()) }),
    accessibility: Accessibility,
  }),
  broker: z.object({ connected: z.boolean(), plain: z.string() }),
  dev_tools: z.boolean(),
  counts: z.object({
    active_alerts: z.number(),
    needs_attention: z.number(),
    unread_notifications: z.number(),
    debriefs: z.number(),
  }),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const SettingsRequest = z
  .object({
    explanation_level: ExperienceLevel.optional(),
    quiet_hours: QuietHours.nullable().optional(),
    notifications: z.object({ per_mode: z.record(z.string(), z.unknown()) }).optional(),
    accessibility: z
      .object({
        reduced_motion: z.boolean().optional(),
        text_scale: z.number().min(0.8).max(2).optional(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change here yet.' });
export type SettingsRequest = z.infer<typeof SettingsRequest>;

export const SettingsResponse = z.object({
  profile: ProfileResponse,
  prefs: z.object({
    explanation_level: ExperienceLevel,
    quiet_hours: QuietHours.nullable(),
    notifications: z.object({ per_mode: z.record(z.string(), z.unknown()) }),
    accessibility: Accessibility,
  }),
  plain: z.string(),
});
export type SettingsResponse = z.infer<typeof SettingsResponse>;

export const MemoryItem = z.object({
  id: z.string(),
  kind: z.enum(['preference', 'pattern', 'mistake', 'goal', 'note']),
  content: z.string(),
  refs: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

export const MemoryResponse = z.object({
  enabled: z.boolean(),
  items: z.array(MemoryItem),
  empty_copy: z.string(),
});
export type MemoryResponse = z.infer<typeof MemoryResponse>;

export const MemorySettingsRequest = z.object({ enabled: z.boolean() });
export type MemorySettingsRequest = z.infer<typeof MemorySettingsRequest>;

export const MemoryDeleteResponse = z.object({
  deleted: z.number(),
  plain: z.string(),
});
export type MemoryDeleteResponse = z.infer<typeof MemoryDeleteResponse>;

export const PaperResetResponse = z.object({
  account: z.object({
    id: z.string(),
    cash: z.number().nullable(),
    buying_power: z.number().nullable(),
    equity: z.number().nullable(),
    starting_balance: z.number().nullable(),
    reset_count: z.number(),
    last_reset_at: z.string().nullable(),
  }),
  next_reset_allowed_at: z.string().nullable(),
  plain: z.string(),
});
export type PaperResetResponse = z.infer<typeof PaperResetResponse>;

export const NotificationGroup = z.enum(['action_required', 'changes', 'fyi']);
export type NotificationGroup = z.infer<typeof NotificationGroup>;

export const NotificationsQuery = z.object({ group: NotificationGroup.optional() });

export const NotificationRow = z.object({
  id: z.string(),
  kind: z.string(),
  group: NotificationGroup,
  title_plain: z.string(),
  body_plain: z.string(),
  route: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  read: z.boolean(),
});
export type NotificationRow = z.infer<typeof NotificationRow>;

export const NotificationsResponse = z.object({
  groups: z.object({
    action_required: z.array(NotificationRow),
    changes: z.array(NotificationRow),
    fyi: z.array(NotificationRow),
  }),
  unread_count: z.number(),
  empty_copy: z.string(),
});
export type NotificationsResponse = z.infer<typeof NotificationsResponse>;

export const BillingCheckoutResponse = z.object({
  url: z.string(),
  session_id: z.string(),
  plain: z.string(),
});
export type BillingCheckoutResponse = z.infer<typeof BillingCheckoutResponse>;

/** Kai objects added this round on top of KaiEmittedObject's v1 union. */
export const KaiEmittedObjectRound2 = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room_summary'), payload: RoomSummaryPayload }),
  z.object({ type: z.literal('verification_card'), payload: VerificationCardPayload }),
  z.object({ type: z.literal('comparison'), payload: ComparisonPayload }),
  z.object({ type: z.literal('debrief'), payload: DebriefPayload }),
]);
export type KaiEmittedObjectRound2 = z.infer<typeof KaiEmittedObjectRound2>;
