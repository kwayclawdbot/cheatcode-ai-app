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

/**
 * NOTE: the chart bridge (LIVE-1) lives in `./chart-bridge.ts` and is NOT
 * re-exported here on purpose. It is a client↔page protocol, not a
 * client↔server one — no endpoint speaks it — and keeping this file free of
 * relative imports is what lets the contract tests load it in bare Node.
 * Import it as `@cheatcode/shared/chart-bridge` (mobile) or
 * `@shared/chart-bridge` (api).
 */

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
export type SetupTarget = z.infer<typeof SetupTarget>;

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
  /**
   * Round 3 adds the three plain-language kinds the Kai contextual sheet may
   * propose — `watch` · `alert` · `plan`. The client routes them to the real
   * endpoints; Kai still has no execution path of its own (02 §7).
   */
  action: z.enum([
    'draft_alert',
    'open_setup',
    'build_plan',
    'compare',
    'explain',
    'watch',
    'alert',
    'plan',
  ]),
  label: z.string(),
  summary_plain: z.string(),
  args: z.record(z.string(), z.unknown()),
  /** Where the client should send the tap, when the server knows it. */
  route: z.string().nullable().optional(),
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
  /**
   * Polygon's own read on the article, per ticker.
   *
   * Carried through rather than computed here, and that is the point: a
   * sentiment with a named article, a publisher and a stated reason behind it
   * is a sourced claim. One this app worked out for itself would be a number
   * nobody can account for — the thing the whole show is built to avoid.
   */
  sentiment: z.enum(['positive', 'neutral', 'negative']).nullable().default(null),
  sentiment_reasoning: z.string().nullable().default(null),
});
export type NewsItem = z.infer<typeof NewsItem>;

/**
 * One reported quarter, as filed.
 *
 * Only the figures a person actually talks about on a show. The full statement
 * is enormous, most of it never reaches a viewer, and a bundle that carries it
 * all costs tokens on every segment to say nothing.
 */
export const FinancialQuarter = z.object({
  fiscal_period: z.string(),
  fiscal_year: z.string(),
  end_date: z.string(),
  filing_date: z.string().nullable(),
  revenue: z.number().nullable(),
  gross_profit: z.number().nullable(),
  operating_income: z.number().nullable(),
  net_income: z.number().nullable(),
  eps_basic: z.number().nullable(),
  eps_diluted: z.number().nullable(),
});
export type FinancialQuarter = z.infer<typeof FinancialQuarter>;

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
  /**
   * From room_members.last_read_seq — drives the "N new since you left" pill.
   * `count` NEVER counts the caller's own posts: you did not miss your own
   * writing, and a pill that says you did is just wrong.
   */
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

export const RoomKaiCommand = z.enum([
  'summarize',
  'verify',
  'to_alert',
  'compare',
  'explain',
  /** 08 §5: the prices this room keeps coming back to, read out of the text. */
  'mark_levels',
]);
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

/**
 * chart_response payload — 02 §7.
 *
 * `mark_levels` produces one of these from a room: the prices MEMBERS named,
 * never a price Kai worked out. Annotations carry semantics only; the client
 * maps them to the Volt & Violet tokens (14).
 */
export const ChartResponsePayload = z.object({
  /** Null when the room has not settled on a symbol this system follows. */
  symbol: z.string().nullable(),
  timeframe: z.string(),
  annotations: z.array(ChartAnnotation),
  rationale_plain: z.string(),
  /** How far this reading reaches, in plain English. Levels go stale. */
  validity: z.string(),
});
export type ChartResponsePayload = z.infer<typeof ChartResponsePayload>;

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

/**
 * POST /rooms/:id/structured-assist — the SAME review, before anything exists.
 *
 * The message-scoped route reviews a draft that has already been posted. 08 §7
 * puts Kai's review BEFORE publication, so the room-scoped route takes the
 * draft itself and posts nothing at all — there is no message to point at yet.
 */
export const RoomStructuredAssistBody = z.object({
  structured_idea: StructuredIdea,
  /** The composer's free text, when it says more than the fields do. */
  body: z.string().max(4000).nullable().optional(),
});
export type RoomStructuredAssistBody = z.infer<typeof RoomStructuredAssistBody>;

/**
 * Same shape as `StructuredAssistResponse`, plus the three names the room
 * composer reads. `improved_draft`/`feedback_plain` are aliases of
 * `improved`/`plain` — one payload, so neither client has to guess — and
 * `gaps` names the fields still missing rather than making one up.
 */
export const RoomStructuredAssistResponse = StructuredAssistResponse.extend({
  improved_draft: StructuredIdea,
  feedback_plain: z.string(),
  gaps: z.array(z.string()),
});
export type RoomStructuredAssistResponse = z.infer<typeof RoomStructuredAssistResponse>;

/** POST /rooms/:id/read — advance room_members.last_read_seq. */
export const RoomReadBody = z.object({
  seq: z.number().int().min(0),
});
export type RoomReadBody = z.infer<typeof RoomReadBody>;

export const RoomReadResponse = z.object({
  room_id: z.string(),
  last_read_seq: z.number(),
  /** Recomputed after the advance, and never counting your own posts. */
  unread: z.number(),
  plain: z.string(),
});
export type RoomReadResponse = z.infer<typeof RoomReadResponse>;

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

/**
 * `start`/`end` are wall-clock `HH:MM` in `timezone` (IANA). The window may
 * wrap past midnight — 22:00→07:00 is the ordinary case, not the edge one.
 * `timezone` null means "use the profile's timezone".
 */
export const QuietHours = z.object({
  start: z.string().nullable(),
  end: z.string().nullable(),
  timezone: z.string().nullable(),
});
export type QuietHours = z.infer<typeof QuietHours>;

/**
 * What a user can switch off (round 5 §4.5). Each `NotifyKind` maps to exactly
 * one of these; the map itself lives server-side in `lib/push/policy.ts`,
 * because it is a policy decision and not a wire shape.
 *
 * An ABSENT key means ON. `notification_prefs.categories` starts `{}` and a
 * user who has never opened the switches gets everything — the default is the
 * absence of a decision, not a row of `true`s to keep in sync.
 */
export const NotificationCategory = z.enum([
  'trade_alerts',
  'order_status',
  'community',
  'coaching',
  'system',
]);
export type NotificationCategory = z.infer<typeof NotificationCategory>;

/**
 * `partialRecord`, not `record`: a `z.record` keyed by an enum is EXHAUSTIVE in
 * zod 4 — it demands every category be present — and the whole point of this
 * map is that an absent key means on. `{}` must parse.
 */
export const NotificationCategoryMap = z.partialRecord(NotificationCategory, z.boolean());
export type NotificationCategoryMap = z.infer<typeof NotificationCategoryMap>;

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
    /** Round 5: the master push switch. Separate from OS permission. */
    push_enabled: z.boolean(),
    /** Round 5: absent key = on. */
    notification_categories: NotificationCategoryMap,
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
    /** Round 5: the master push switch. Separate from OS permission. */
    push_enabled: z.boolean(),
    /** Round 5: absent key = on. */
    notification_categories: NotificationCategoryMap,
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

/* ================================================================== */
/* ROUND 3 — V5 consolidation + paper execution                        */
/*                                                                     */
/* Everything below is ADDITIVE. No round-1/round-2 export changed its */
/* name or was removed; the restructured payloads (home, symbol        */
/* workspace, alerts, trade landing) are supersets, so a client built  */
/* against round 2 still parses while MOBILE-A/B read the new blocks.  */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* Shared V5 primitives                                                 */
/* ------------------------------------------------------------------ */

/**
 * Plain-language action labels (audit §8). The taxonomy word never reaches the
 * button; `action` is the machine key, `label` is what a person reads.
 */
export const PlainAction = z.object({
  action: z.string(),
  label: z.string(),
  route: z.string().nullable().default(null),
  primary: z.boolean().default(false),
  enabled: z.boolean().default(true),
  hint: z.string().nullable().default(null),
});
export type PlainAction = z.infer<typeof PlainAction>;

/** One link in the decision chain: discovery → research → alert → plan → order → position → review. */
export const HistoryEvent = z.object({
  kind: z.enum(['setup', 'alert', 'plan', 'order', 'position', 'debrief', 'room', 'kai']),
  id: z.string().nullable(),
  at: z.string(),
  plain: z.string(),
  route: z.string().nullable().default(null),
});
export type HistoryEvent = z.infer<typeof HistoryEvent>;

/* ------------------------------------------------------------------ */
/* GET /home — V5 H1 (one priority, one action)                         */
/* ------------------------------------------------------------------ */

export const PriorityKind = z.enum(['setup', 'alert', 'position', 'portfolio']);
export type PriorityKind = z.infer<typeof PriorityKind>;

/**
 * The single dominant object on Home. `primary_action.label` is STATE-DRIVEN
 * (Forming → Watch this · Ready → Review setup · Planned → Buy · Active →
 * Manage · Invalidated → Review what changed) — the client never re-derives it.
 */
export const HomePriority = z.object({
  kind: PriorityKind,
  id: z.string().nullable(),
  symbol: z.string().nullable(),
  state: z.string().nullable(),
  headline: z.string(),
  subhead: z.string().nullable(),
  detail_plain: z.string(),
  quote: Quote.nullable().default(null),
  grade_display: z.string().nullable().default(null),
  object: KaiObjectEnvelope.nullable().default(null),
  primary_action: PlainAction,
  secondary_actions: z.array(PlainAction).default([]),
});
export type HomePriority = z.infer<typeof HomePriority>;

export const AlsoWatchingRow = z.object({
  kind: z.enum(['setup', 'alert', 'position']),
  id: z.string().nullable(),
  symbol: z.string(),
  plain: z.string(),
  quote: Quote.nullable().default(null),
  route: z.string(),
});
export type AlsoWatchingRow = z.infer<typeof AlsoWatchingRow>;

/** Superset of round-2 `HomeResponse`. */
export const HomeV5Response = HomeResponse.extend({
  /** Kai's one-line opening: what changed and why it matters. */
  opening_line: z.string(),
  priority: HomePriority.nullable(),
  also_watching: z.array(AlsoWatchingRow),
  /** Copy for the paper strip — same sentence everywhere in the app. */
  paper_plain: z.string(),
});
export type HomeV5Response = z.infer<typeof HomeV5Response>;

/* ------------------------------------------------------------------ */
/* GET /symbols/:symbol — V5 W1 asset workspace                         */
/* ------------------------------------------------------------------ */

export const WorkspaceIdentity = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  watchlisted: z.boolean(),
  /** "Watching · no position" / "Long 10 · up $58" — the one status line. */
  status_line: z.string(),
  room_id: z.string().nullable(),
});
export type WorkspaceIdentity = z.infer<typeof WorkspaceIdentity>;

/** The setup as a MODULE inside the workspace, never its own destination. */
export const SetupModule = z.object({
  setup_id: z.string(),
  state: SetupState,
  grade_display: z.string().nullable(),
  entry: z.number().nullable(),
  stop: z.number().nullable(),
  targets: z.array(SetupTarget),
  headline_plain: z.string(),
  why_plain: z.string(),
  confirmations: z.array(Confirmation),
  actions: z.array(PlainAction),
});
export type SetupModule = z.infer<typeof SetupModule>;

export const PositionModule = z.object({
  position_id: z.string(),
  direction: z.enum(['long', 'short']),
  qty: z.number(),
  avg_cost: z.number(),
  mark_price: z.number().nullable(),
  mark_ts: z.string().nullable(),
  unrealized_pnl: z.number().nullable(),
  stop: z.number().nullable(),
  target: z.number().nullable(),
  health: z.enum(['healthy', 'at_risk', 'unknown']),
  plain: z.string(),
  actions: z.array(PlainAction),
  route: z.string(),
});
export type PositionModule = z.infer<typeof PositionModule>;

export const WhatChanged = z.object({
  at: z.string(),
  plain: z.string(),
  semantic: z.enum(['positive', 'neutral', 'risk']),
});
export type WhatChanged = z.infer<typeof WhatChanged>;

export const KeyLevel = z.object({
  label: z.string(),
  price: z.number(),
  semantic: z.enum(['entry', 'stop', 'target', 'invalidation', 'note']),
});
export type KeyLevel = z.infer<typeof KeyLevel>;

export const WorkspaceOverview = z.object({
  setup_module: SetupModule.nullable(),
  position: PositionModule.nullable(),
  watchlist: z.boolean(),
  key_levels: z.array(KeyLevel),
  what_changed: z.array(WhatChanged),
});
export type WorkspaceOverview = z.infer<typeof WorkspaceOverview>;

export const WorkspaceKai = z.object({
  interpretation: KaiInterpretation,
  grade: z.string().nullable(),
  scenarios: z.array(Scenario),
  research_refs: z.array(
    z.object({ label: z.string(), detail_plain: z.string().nullable(), at: z.string().nullable(), url: z.string().nullable() })
  ),
  conversation_id: z.string().nullable(),
  ask_action: PlainAction,
});
export type WorkspaceKai = z.infer<typeof WorkspaceKai>;

export const SuggestedPlan = z.object({
  entry: z.number().nullable(),
  stop: z.number().nullable(),
  targets: z.array(SetupTarget),
  size: SizeSuggestion,
  rr: z.number().nullable(),
  rr_plain: z.string(),
  scenarios: z.array(Scenario),
  stop_attaches_plain: z.string(),
});
export type SuggestedPlan = z.infer<typeof SuggestedPlan>;

export const WorkspacePlan = z.object({
  existing_plan: z.unknown().nullable(),
  suggested: SuggestedPlan,
  order_state: z.object({
    open_orders: z.number(),
    last_order_id: z.string().nullable(),
    plain: z.string(),
  }),
  daily_risk: DailyRisk,
  actions: z.array(PlainAction),
});
export type WorkspacePlan = z.infer<typeof WorkspacePlan>;

export const CommunitySentiment = z.object({
  sample: z.number(),
  split: z.object({ bullish: z.number(), bearish: z.number(), neutral: z.number() }),
  label: z.string(),
  /** Community opinion is context, never evidence (08 §6). */
  caveat_plain: z.string(),
});
export type CommunitySentiment = z.infer<typeof CommunitySentiment>;

export const WorkspaceCommunity = z.object({
  thread_summary: z.string().nullable(),
  sentiment: CommunitySentiment.nullable(),
  verified_claims: z.array(
    z.object({ claim: z.string(), result: z.string(), plain: z.string(), at: z.string().nullable() })
  ),
  room_id: z.string().nullable(),
  line_plain: z.string(),
  actions: z.array(PlainAction),
});
export type WorkspaceCommunity = z.infer<typeof WorkspaceCommunity>;

/**
 * Superset of round-2 `SymbolDetailResponse`.
 * `lenses` is kept for shape stability but is ALWAYS `[]` from round 3: mode is
 * global context now, and per-asset mode lenses are removed (audit §10).
 */
export const SymbolWorkspaceResponse = SymbolDetailResponse.omit({ community: true }).extend({
  identity: WorkspaceIdentity,
  chart_config: ChartConfig,
  overview: WorkspaceOverview,
  kai: WorkspaceKai,
  plan: WorkspacePlan,
  community: WorkspaceCommunity,
  history: z.array(HistoryEvent),
  /** Persistent Buy / Sell + state-driven workspace actions. */
  actions: z.array(PlainAction),
  paper_plain: z.string(),
});
export type SymbolWorkspaceResponse = z.infer<typeof SymbolWorkspaceResponse>;

/* ------------------------------------------------------------------ */
/* GET /alerts — V5 A1 (Attention · Monitoring · History)               */
/* ------------------------------------------------------------------ */

export const AlertTypeFilter = z.enum(['all', 'price', 'setup', 'position', 'news', 'thesis', 'community']);
export type AlertTypeFilter = z.infer<typeof AlertTypeFilter>;

export const AlertsV5Query = z.object({
  filter: AlertTypeFilter.default('all'),
});
export type AlertsV5Query = z.infer<typeof AlertsV5Query>;

export const AttentionRow = z.object({
  id: z.string(),
  kind: z.enum(['alert', 'position']),
  type: AlertTypeFilter,
  symbol: z.string().nullable(),
  headline: z.string(),
  detail_plain: z.string(),
  at: z.string(),
  primary_action: PlainAction,
  secondary_actions: z.array(PlainAction).default([]),
  alert: AlertRow.nullable().default(null),
});
export type AttentionRow = z.infer<typeof AttentionRow>;

/**
 * A monitoring row is "what Kai is watching". Position-attached conditions
 * (stop / target legs) appear here — "Active Trades" is gone, positions live
 * in Trade and only their monitoring event surfaces in Alerts (audit §6).
 */
export const MonitoringRow = z.object({
  id: z.string(),
  kind: z.enum(['alert', 'position']),
  type: AlertTypeFilter,
  symbol: z.string().nullable(),
  condition_plain: z.string(),
  value_plain: z.string(),
  route: z.string(),
  position_id: z.string().nullable().default(null),
  alert_id: z.string().nullable().default(null),
  monitoring: z.enum(['armed_no_feed', 'not_armed', 'resolved', 'armed_delayed']),
  monitoring_plain: z.string(),
});
export type MonitoringRow = z.infer<typeof MonitoringRow>;

export const HistoryRow = z.object({
  id: z.string(),
  kind: z.enum(['alert', 'position']),
  type: AlertTypeFilter,
  symbol: z.string().nullable(),
  headline: z.string(),
  detail_plain: z.string(),
  at: z.string(),
  route: z.string(),
});
export type HistoryRow = z.infer<typeof HistoryRow>;

export const AlertFilterChip = z.object({
  key: AlertTypeFilter,
  label: z.string(),
  count: z.number(),
});
export type AlertFilterChip = z.infer<typeof AlertFilterChip>;

/** Superset of round-2 `AlertsResponse`. */
export const AlertsV5Response = AlertsResponse.extend({
  attention: z.array(AttentionRow),
  monitoring: z.array(MonitoringRow),
  history: z.array(HistoryRow),
  filters: z.array(AlertFilterChip),
  filter: AlertTypeFilter,
  composer: z.object({ placeholder: z.string(), examples: z.array(z.string()) }),
});
export type AlertsV5Response = z.infer<typeof AlertsV5Response>;

/* ------------------------------------------------------------------ */
/* Paper execution — plans                                              */
/* ------------------------------------------------------------------ */

export const ExitStyle = z.enum(['auto', 'alert_assisted']);
export type ExitStyle = z.infer<typeof ExitStyle>;

export const PlanStatus = z.enum(['draft', 'planned', 'active', 'exiting', 'closed', 'cancelled', 'invalidated']);
export type PlanStatus = z.infer<typeof PlanStatus>;

export const CreatePlanRequest = z
  .object({
    setup_id: z.string().optional(),
    symbol: z.string().min(1).max(12).optional(),
    side: PositionEffect.optional(),
    entry: z.number().positive().optional(),
    stop: z.number().positive().optional(),
    targets: z.array(z.union([z.number().positive(), SetupTarget])).optional(),
    size: z.number().int().positive().optional(),
    mode: AppMode.optional(),
    exit_style: ExitStyle.optional(),
  })
  .refine((v) => Boolean(v.setup_id) || Boolean(v.symbol), {
    message: 'Tell me which setup this is from, or which symbol it is for.',
  });
export type CreatePlanRequest = z.infer<typeof CreatePlanRequest>;

export const PlanRow = z.object({
  id: z.string(),
  status: PlanStatus,
  symbol: z.string(),
  mode: AppMode,
  intent: PositionEffect,
  setup_id: z.string().nullable(),
  entry: z.number().nullable(),
  entry_condition: z.record(z.string(), z.unknown()).nullable(),
  stop: z.number().nullable(),
  targets: z.array(SetupTarget),
  size: SizeSuggestion,
  rr: z.number().nullable(),
  rr_plain: z.string(),
  scenarios: z.array(Scenario),
  exit_style: ExitStyle,
  exit_style_plain: z.string(),
  created_at: z.string(),
  plain: z.string(),
});
export type PlanRow = z.infer<typeof PlanRow>;

export const PlanEventRow = z.object({
  seq: z.number(),
  type: z.string(),
  at: z.string(),
  plain: z.string(),
});
export type PlanEventRow = z.infer<typeof PlanEventRow>;

export const PlanResponse = z.object({
  plan: PlanRow,
  daily_risk: DailyRisk,
  events: z.array(PlanEventRow),
  history: z.array(HistoryEvent),
  actions: z.array(PlainAction),
  stop_attaches_plain: z.string(),
  paper_plain: z.string(),
  quote: MarketQuote.nullable(),
});
export type PlanResponse = z.infer<typeof PlanResponse>;

export const PlanActionRequest = z.object({
  action: z.enum(['activate', 'cancel', 'adjust_stop', 'adjust_target', 'set_exit_style']),
  stop: z.number().positive().optional(),
  targets: z.array(z.union([z.number().positive(), SetupTarget])).optional(),
  exit_style: ExitStyle.optional(),
});
export type PlanActionRequest = z.infer<typeof PlanActionRequest>;

/* ------------------------------------------------------------------ */
/* Paper execution — orders                                             */
/* ------------------------------------------------------------------ */

export const OrderType = z.enum(['market', 'limit', 'stop', 'stop_limit']);
export type OrderType = z.infer<typeof OrderType>;

export const OrderStatus = z.enum([
  'draft',
  'previewed',
  'submitted',
  'accepted',
  'partially_filled',
  'filled',
  'rejected',
  'cancelled',
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const RiskCheck = z.object({
  key: z.string(),
  label: z.string(),
  /**
   * `ok` is the ONLY status the client may render as a pass. A sector-exposure
   * or reward:risk problem is `advisory` and must read as a caution, never as
   * "Passes" (round-3 brief).
   */
  status: z.enum(['ok', 'advisory', 'blocker', 'unknown']),
  plain: z.string(),
  code: ErrorCode.nullable().default(null),
  dismissible: z.boolean().default(false),
});
export type RiskCheck = z.infer<typeof RiskCheck>;

export const OrderPreviewRequest = z.object({
  account_id: z.string().optional(),
  symbol: z.string().min(1).max(12),
  side: PositionEffect,
  type: OrderType.default('market'),
  qty: z.number().positive().optional(),
  notional: z.number().positive().optional(),
  limit_price: z.number().positive().nullable().optional(),
  stop_price: z.number().positive().nullable().optional(),
  duration: z.enum(['day', 'gtc']).default('day'),
  plan_id: z.string().optional(),
  setup_id: z.string().optional(),
  mode: AppMode.optional(),
  /** Dev/test seam: force the freshness gate to see a stale quote. */
  force_stale: z.boolean().optional(),
});
export type OrderPreviewRequest = z.infer<typeof OrderPreviewRequest>;

export const BracketBlock = z.object({
  exit_style: ExitStyle,
  stop: z.number().nullable(),
  targets: z.array(SetupTarget),
  plain: z.string(),
});
export type BracketBlock = z.infer<typeof BracketBlock>;

export const OrderPreviewResponse = z.object({
  preview_id: z.string(),
  order_id: z.string(),
  account_id: z.string(),
  plan_id: z.string().nullable(),
  symbol: z.string(),
  side: PositionEffect,
  side_label: z.string(),
  type: OrderType,
  qty: z.number(),
  limit_price: z.number().nullable(),
  stop_price: z.number().nullable(),
  duration: z.string(),
  mode: AppMode,
  quote: MarketQuote,
  estimate: z.object({
    fill_price: z.number().nullable(),
    fills_immediately: z.boolean(),
    notional: z.number().nullable(),
    fees: z.number(),
    total: z.number().nullable(),
    buying_power: z.number().nullable(),
    buying_power_after: z.number().nullable(),
    plain: z.string(),
  }),
  risk: z.object({
    stop: z.number().nullable(),
    target: z.number().nullable(),
    per_share_risk: z.number().nullable(),
    max_loss_usd: z.number().nullable(),
    rr: z.number().nullable(),
    daily_cap: z.number().nullable(),
    daily_used: z.number(),
    daily_remaining: z.number().nullable(),
    /** "You can lose up to $X on this order if the stop executes." */
    hard_stop_plain: z.string(),
    plain: z.string(),
  }),
  checks: z.array(RiskCheck),
  advisories: z.array(RiskCheck),
  blockers: z.array(RiskCheck),
  can_submit: z.boolean(),
  bracket: BracketBlock.nullable(),
  expires_at: z.string(),
  expires_in_s: z.number(),
  tolerance_bps: z.number(),
  disclosures: z.array(z.string()),
  confirm_label: z.string(),
  footer_plain: z.string(),
  paper_plain: z.string(),
});
export type OrderPreviewResponse = z.infer<typeof OrderPreviewResponse>;

export const OrderSubmitRequest = z.object({
  preview_id: z.string().min(1),
  idempotency_key: z.string().min(8).max(200),
});
export type OrderSubmitRequest = z.infer<typeof OrderSubmitRequest>;

export const FillRow = z.object({
  qty: z.number(),
  price: z.number(),
  ts: z.string(),
  liquidity: z.string().nullable(),
});
export type FillRow = z.infer<typeof FillRow>;

export const OrderEventRow = z.object({
  from_status: OrderStatus.nullable(),
  to_status: OrderStatus.nullable(),
  at: z.string(),
  plain: z.string(),
});
export type OrderEventRow = z.infer<typeof OrderEventRow>;

export const OrderRow = z.object({
  id: z.string(),
  status: OrderStatus,
  /** Accepted is not filled. Both surfaces render from these two stamps. */
  accepted_at: z.string().nullable(),
  filled_at: z.string().nullable(),
  symbol: z.string(),
  side: PositionEffect,
  side_label: z.string(),
  type: OrderType,
  qty: z.number(),
  filled_qty: z.number(),
  avg_fill_price: z.number().nullable(),
  limit_price: z.number().nullable(),
  stop_price: z.number().nullable(),
  duration: z.string(),
  plan_id: z.string().nullable(),
  bracket_group: z.string().nullable(),
  bracket_role: z.enum(['entry', 'stop', 'target']).nullable(),
  resting: z.boolean(),
  driver: z.literal('paper'),
  reject_reason: z.string().nullable(),
  created_at: z.string(),
  status_plain: z.string(),
  plain: z.string(),
});
export type OrderRow = z.infer<typeof OrderRow>;

export const OrderSubmitResponse = z.object({
  order: OrderRow,
  legs: z.array(OrderRow),
  fills: z.array(FillRow),
  events: z.array(OrderEventRow),
  position_id: z.string().nullable(),
  deduplicated: z.boolean(),
  accepted_plain: z.string(),
  fill_plain: z.string(),
  paper_plain: z.string(),
  next_action: PlainAction,
});
export type OrderSubmitResponse = z.infer<typeof OrderSubmitResponse>;

export const OrdersQuery = z.object({
  status: z.enum(['open', 'filled', 'cancelled', 'all']).default('all'),
  symbol: z.string().max(12).optional(),
});
export type OrdersQuery = z.infer<typeof OrdersQuery>;

export const OrdersResponse = z.object({
  orders: z.array(OrderRow),
  empty_copy: z.string(),
  paper_plain: z.string(),
});
export type OrdersResponse = z.infer<typeof OrdersResponse>;

export const OrderDetailResponse = z.object({
  order: OrderRow,
  legs: z.array(OrderRow),
  fills: z.array(FillRow),
  events: z.array(OrderEventRow),
  position_id: z.string().nullable(),
  history: z.array(HistoryEvent),
  actions: z.array(PlainAction),
  paper_plain: z.string(),
});
export type OrderDetailResponse = z.infer<typeof OrderDetailResponse>;

export const OrderCancelResponse = z.object({
  order: OrderRow,
  cancelled_legs: z.array(OrderRow),
  plain: z.string(),
});
export type OrderCancelResponse = z.infer<typeof OrderCancelResponse>;

/* ------------------------------------------------------------------ */
/* Paper execution — positions                                          */
/* ------------------------------------------------------------------ */

export const OpenPositionRow = z.object({
  id: z.string(),
  symbol: z.string(),
  direction: z.enum(['long', 'short']),
  qty: z.number(),
  avg_cost: z.number(),
  mark_price: z.number().nullable(),
  mark_ts: z.string().nullable(),
  mark_freshness: Freshness,
  unrealized_pnl: z.number().nullable(),
  unrealized_pct: z.number().nullable(),
  day_pnl: z.number().nullable(),
  stop: z.number().nullable(),
  target: z.number().nullable(),
  health: z.enum(['healthy', 'at_risk', 'unknown']),
  health_plain: z.string(),
  exit_style: ExitStyle,
  opened_at: z.string(),
  mode: AppMode,
  origin_plan_id: z.string().nullable(),
  origin_setup_id: z.string().nullable(),
  origin_room_id: z.string().nullable(),
  simulated: z.boolean(),
  plain: z.string(),
  route: z.string(),
  actions: z.array(PlainAction),
});
export type OpenPositionRow = z.infer<typeof OpenPositionRow>;

export const PositionsV5Query = z.object({
  status: z.enum(['open', 'closed', 'all']).default('closed'),
});
export type PositionsV5Query = z.infer<typeof PositionsV5Query>;

/** Superset of round-2 `PositionsResponse`. */
export const PositionsV5Response = PositionsResponse.extend({
  open: z.array(OpenPositionRow),
  daily_risk: DailyRisk,
  totals: z.object({
    open_count: z.number(),
    unrealized_pnl: z.number(),
    realized_today: z.number(),
    plain: z.string(),
  }),
  paper_plain: z.string(),
});
export type PositionsV5Response = z.infer<typeof PositionsV5Response>;

export const PositionDetailResponse = z.object({
  position: OpenPositionRow,
  closed: z.boolean(),
  realized_pnl: z.number().nullable(),
  closed_at: z.string().nullable(),
  plan: PlanRow.nullable(),
  plan_vs_now: z.array(
    z.object({ label: z.string(), planned: z.string(), now: z.string(), semantic: z.enum(['positive', 'neutral', 'risk']) })
  ),
  orders: z.array(OrderRow),
  monitoring: z.array(MonitoringRow),
  history: z.array(HistoryEvent),
  debrief_id: z.string().nullable(),
  actions: z.array(PlainAction),
  quote: MarketQuote.nullable(),
  paper_plain: z.string(),
});
export type PositionDetailResponse = z.infer<typeof PositionDetailResponse>;

export const PositionCloseRequest = z.object({
  qty: z.number().positive().optional(),
  /** Two-step by default: preview first, then confirm. */
  confirm: z.boolean().default(false),
  idempotency_key: z.string().min(8).max(200).optional(),
});
export type PositionCloseRequest = z.infer<typeof PositionCloseRequest>;

export const PositionCloseResponse = z.object({
  stage: z.enum(['preview', 'submitted']),
  preview: OrderPreviewResponse.nullable(),
  result: OrderSubmitResponse.nullable(),
  plain: z.string(),
});
export type PositionCloseResponse = z.infer<typeof PositionCloseResponse>;

/* ------------------------------------------------------------------ */
/* GET /trade/landing — audit §7 hierarchy                              */
/* ------------------------------------------------------------------ */

export const NeedsActionItem = z.object({
  kind: z.enum(['order', 'position', 'alert', 'plan', 'debrief']),
  id: z.string(),
  symbol: z.string().nullable(),
  headline: z.string(),
  plain: z.string(),
  route: z.string(),
  action_label: z.string(),
});
export type NeedsActionItem = z.infer<typeof NeedsActionItem>;

export const RecentSymbol = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  quote: Quote.nullable(),
  reason_plain: z.string(),
  route: z.string(),
});
export type RecentSymbol = z.infer<typeof RecentSymbol>;

/** Superset of round-2 `TradeLandingResponse`, re-ordered by the audit. */
export const TradeLandingV5Response = TradeLandingResponse.extend({
  account: z.object({
    account_id: z.string().nullable(),
    kind: z.literal('paper'),
    label: z.string(),
    value: z.number().nullable(),
    day_change: z.number().nullable(),
    day_change_pct: z.number().nullable(),
    buying_power: z.number().nullable(),
    cash: z.number().nullable(),
    currency: z.string(),
    plain: z.string(),
  }),
  positions: z.array(OpenPositionRow),
  open_orders: z.array(OrderRow),
  needs_action: z.array(NeedsActionItem),
  watchlist: z.array(WatchlistItem),
  recent: z.array(RecentSymbol),
  discovery: z.object({ movers: z.array(Mover), catalysts: z.array(z.unknown()) }),
  daily_risk: DailyRisk,
  paper_plain: z.string(),
});
export type TradeLandingV5Response = z.infer<typeof TradeLandingV5Response>;

/* ------------------------------------------------------------------ */
/* POST /internal/paper/tick                                            */
/* ------------------------------------------------------------------ */

export const PaperTickRequest = z.object({
  /** DEV_TOOLS=1 only: synthetic prices so tests can cross a level on demand. */
  quotes: z.record(z.string(), z.number().positive()).optional(),
  user_id: z.string().optional(),
});
export type PaperTickRequest = z.infer<typeof PaperTickRequest>;

export const PaperTickResponse = z.object({
  ticked_at: z.string(),
  symbols: z.array(z.string()),
  quote_source: z.enum(['polygon', 'override', 'none']),
  positions_marked: z.number(),
  orders_filled: z.number(),
  legs_fired: z.number(),
  alerts_created: z.number(),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
  plain: z.string(),
});
export type PaperTickResponse = z.infer<typeof PaperTickResponse>;

/* ------------------------------------------------------------------ */
/* POST /kai/conversations — contextual sheet                           */
/* ------------------------------------------------------------------ */

export const KaiContextKind = z.enum(['symbol', 'setup', 'alert', 'order', 'position', 'room', 'home']);
export type KaiContextKind = z.infer<typeof KaiContextKind>;

export const KaiSheetContext = z.object({
  kind: KaiContextKind,
  id: z.string().optional(),
  symbol: z.string().max(12).optional(),
});
export type KaiSheetContext = z.infer<typeof KaiSheetContext>;

/** Superset of round-1 `CreateConversationRequest`. */
export const CreateContextConversationRequest = CreateConversationRequest.extend({
  context: KaiSheetContext.optional(),
});
export type CreateContextConversationRequest = z.infer<typeof CreateContextConversationRequest>;

export const CreateContextConversationResponse = CreateConversationResponse.extend({
  context: KaiSheetContext.nullable(),
  /** "Kai · about META" — the sheet header, server-composed. */
  header_plain: z.string(),
  context_plain: z.string(),
  /** What the sheet may propose. Kai never executes (02 §7). */
  available_actions: z.array(PlainAction),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type CreateContextConversationResponse = z.infer<typeof CreateContextConversationResponse>;

/* ------------------------------------------------------------------ */
/* Copy constants used across every execution surface                   */
/* ------------------------------------------------------------------ */

/** One sentence, everywhere a paper price or fill appears. */
export const PAPER_FILL_PLAIN = 'Paper fills use delayed prices.';
export const PAPER_ACCOUNT_PLAIN = 'Practice money only. Nothing here touches a real account.';
export const PLACE_ORDER_LABEL = 'Place paper order';
export const NOT_A_GUARANTEE_PLAIN = "Kai's assessment — not a guarantee.";
export const STOP_ATTACHES_PLAIN =
  'Your stop is submitted with the order, so the exit is in place from the moment you are filled.';
export const STOP_ALERT_ASSISTED_PLAIN =
  'Your exits arrive as notifications with one-tap close. They are not automatic protection.';

/** State-driven primary labels (V5 H1 + SOURCE_OF_TRUTH). */
export const STATE_ACTION_LABEL: Record<string, string> = {
  discovered: 'Watch this',
  watching: 'Watch this',
  forming: 'Watch this',
  approaching: 'Review setup',
  ready: 'Review setup',
  planned: 'Buy',
  active: 'Manage',
  invalidated: 'Review what changed',
  expired: 'Review what changed',
};

/* ================================================================== */
/* ROUND 4 — Actionable Alerts & the chart-first Trade Portal          */
/*                                                                     */
/* Binding source: docs/10_ALERTS_TRADE_PORTAL_SPEC_extracted.md.      */
/* Everything below is APPENDED. No round-1..3 export changed meaning. */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* Experience + focus (onboarding "Personalize")                        */
/* ------------------------------------------------------------------ */

/**
 * The onboarding word, not the database word. `experience_level` in the schema
 * stays beginner/intermediate/advanced; this is what the user actually chose,
 * and it is what decides Kai's VOICE.
 */
export const Experience = z.enum(['new', 'some', 'pro']);
export type Experience = z.infer<typeof Experience>;

export const EXPERIENCE_TO_LEVEL: Record<Experience, ExperienceLevel> = {
  new: 'beginner',
  some: 'intermediate',
  pro: 'advanced',
};

export const LEVEL_TO_EXPERIENCE: Record<ExperienceLevel, Experience> = {
  beginner: 'new',
  intermediate: 'some',
  advanced: 'pro',
};

/** The one-line consequence shown under each choice, and Kai's voice line. */
export const EXPERIENCE_VOICE_LINE: Record<Experience, string> = {
  new: 'I explain every term the first time it appears.',
  some: 'I keep it plain but skip the basics.',
  pro: 'I lead with levels and numbers, no preamble.',
};

export const FocusKey = z.enum(['tech', 'ai', 'energy', 'etf', 'crypto', 'earnings']);
export type FocusKey = z.infer<typeof FocusKey>;

export const FOCUS_LABELS: Record<FocusKey, string> = {
  tech: 'big tech',
  ai: 'AI & semis',
  energy: 'energy',
  etf: 'index ETFs',
  crypto: 'crypto-linked names',
  earnings: 'earnings plays',
};

/** The symbols each focus chip actually scans, from the seeded universe. */
export const FOCUS_SYMBOLS: Record<FocusKey, string[]> = {
  tech: ['META', 'AAPL', 'MSFT', 'AMZN'],
  ai: ['NVDA', 'AMD'],
  energy: [],
  etf: ['SPY', 'QQQ'],
  crypto: ['TSLA'],
  earnings: ['CRM'],
};

/** "Kai will scan big tech and AI & semis first." — composed server-side. */
export const FocusSummary = z.object({
  keys: z.array(FocusKey),
  labels: z.array(z.string()),
  plain: z.string(),
  symbols: z.array(z.string()),
});
export type FocusSummary = z.infer<typeof FocusSummary>;

/**
 * Superset of `OnboardingCompleteRequest`. `experience` still accepts the three
 * database levels so an older client keeps working; the prototype's three words
 * are accepted on the same field and mapped.
 */
export const OnboardingExperience = z.preprocess(
  (v) => (v === 'beginner' ? 'new' : v === 'intermediate' ? 'some' : v === 'advanced' ? 'pro' : v),
  Experience
);

export const OnboardingCompleteRound4Request = OnboardingCompleteRequest.extend({
  experience: OnboardingExperience,
  focus: z.array(FocusKey).max(6).optional(),
});
export type OnboardingCompleteRound4Request = z.infer<typeof OnboardingCompleteRound4Request>;

export const SettingsRound4Request = z
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
    /** Round 4: the Account tab's "Your Kai profile" rows. */
    experience: OnboardingExperience.optional(),
    focus: z.array(FocusKey).max(6).optional(),
    mode: AppMode.optional(),
    /**
     * Round 5. `push_enabled` is the priming screen's master switch — the
     * user's INTENT, which is a different question from whether the OS has
     * granted permission. It survives a reinstall; permission does not.
     *
     * `notification_categories` is a PATCH, not a replacement: sending
     * `{community:false}` switches that one off and leaves the rest alone, so
     * two switches flipped from two screens cannot clobber each other.
     */
    push_enabled: z.boolean().optional(),
    notification_categories: NotificationCategoryMap.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change here yet.' });
export type SettingsRound4Request = z.infer<typeof SettingsRound4Request>;

/* ------------------------------------------------------------------ */
/* /me additions                                                        */
/* ------------------------------------------------------------------ */

export const KaiProfile = z.object({
  mode: AppMode,
  mode_label: z.string(),
  experience: Experience,
  experience_label: z.string(),
  focus: FocusSummary,
  /** "I explain every term the first time it appears." */
  voice_line: z.string(),
});
export type KaiProfile = z.infer<typeof KaiProfile>;

/**
 * "You've followed your rules 4 of the last 6 sessions." A session is one
 * debrief; followed means every receipt item in `process_review` came back ok.
 * `show:false` under three sessions — a ratio out of one or two is noise.
 */
export const RuleAdherence = z.object({
  sessions: z.number(),
  followed: z.number(),
  show: z.boolean(),
  plain: z.string(),
  route: z.string().nullable(),
});
export type RuleAdherence = z.infer<typeof RuleAdherence>;

export const MeRound4Response = MeResponse.extend({
  rule_adherence: RuleAdherence,
  kai_profile: KaiProfile,
});
export type MeRound4Response = z.infer<typeof MeRound4Response>;

/* ------------------------------------------------------------------ */
/* Company profile (Polygon /v3/reference/tickers)                      */
/* ------------------------------------------------------------------ */

export const CompanyProfile = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  /** Two sentences maximum (spec §3 "Company summary"). */
  summary: z.string().nullable(),
  sector: z.string().nullable(),
  market_cap: z.number().nullable(),
  market_cap_plain: z.string().nullable(),
  next_earnings: z.string().nullable(),
  pe: z.number().nullable(),
  employees: z.number().nullable(),
  homepage: z.string().nullable(),
  logo_url: z.string().nullable(),
  /** 'polygon' | 'seed' | 'none' — the app never presents seed copy as live. */
  source: z.enum(['polygon', 'seed', 'none']),
  refreshed_at: z.string().nullable(),
});
export type CompanyProfile = z.infer<typeof CompanyProfile>;

/* ------------------------------------------------------------------ */
/* Technicals — computed from candles, never generated                  */
/* ------------------------------------------------------------------ */

export const MeterStatus = z.enum([
  'Strong',
  'Confirmed',
  'Healthy',
  'Forming',
  'Waiting',
  'Favorable',
  'Supportive',
  'Neutral',
  'Weak',
  'Elevated',
  'Unknown',
]);
export type MeterStatus = z.infer<typeof MeterStatus>;

/**
 * Qualitative signal ONLY (spec §4). `strength` is 0–5 segments for a meter —
 * it is not a score and it is never rendered as a fraction of anything.
 */
export const QualitativeMeter = z.object({
  key: z.string(),
  label: z.string(),
  status: MeterStatus,
  strength: z.number().int().min(0).max(5),
  plain: z.string(),
  /** What the number behind it actually was, for the expandable evidence. */
  evidence_plain: z.string().nullable(),
});
export type QualitativeMeter = z.infer<typeof QualitativeMeter>;

export const PriceLevel = z.object({
  price: z.number(),
  label: z.string(),
  /** How many times the swing was tested in the window we measured. */
  touches: z.number(),
  plain: z.string(),
});
export type PriceLevel = z.infer<typeof PriceLevel>;

export const Technicals = z.object({
  trend: QualitativeMeter,
  momentum: QualitativeMeter,
  volatility: QualitativeMeter,
  support: z.array(PriceLevel),
  resistance: z.array(PriceLevel),
  /** Bars used, timeframe, and the last bar's timestamp. Freshness, always. */
  computed_from: z.object({
    timeframe: z.string(),
    bars: z.number(),
    last_bar_ts: z.string().nullable(),
    freshness: Freshness,
    plain: z.string(),
  }),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type Technicals = z.infer<typeof Technicals>;

/* ------------------------------------------------------------------ */
/* Grades and the qualitative scorecard (spec §4)                       */
/* ------------------------------------------------------------------ */

/**
 * The border treatment family. Grade colour expresses SETUP QUALITY only —
 * gold never means profit, green/red never express grade (spec §4).
 */
export const GradeFamily = z.enum(['gold', 'gold_restrained', 'violet', 'violet_graphite', 'amber', 'neutral']);
export type GradeFamily = z.infer<typeof GradeFamily>;

export const GradeMedallion = z.object({
  /** "A−" — the large letter. */
  display: z.string().nullable(),
  band: GradeBand.nullable(),
  /** 0–100, small and supporting. Never competes with the letter (§11). */
  score: z.number().nullable(),
  family: GradeFamily,
  /** Screen readers announce this, so colour is never the only channel (§10). */
  plain: z.string(),
});
export type GradeMedallion = z.infer<typeof GradeMedallion>;

/**
 * One scorecard row. NO FRACTIONS EVER cross this wire: `internal_weight` is
 * omitted deliberately — the grading engine keeps its points, the interface
 * gets a status and a 0–5 signal (spec §4 "Never display component fractions").
 */
export const ScoreComponent = z.object({
  key: z.string(),
  label: z.string(),
  status: MeterStatus,
  strength: z.number().int().min(0).max(5),
  explanation: z.string(),
  evidence: z.array(z.string()),
});
export type ScoreComponent = z.infer<typeof ScoreComponent>;

/* ------------------------------------------------------------------ */
/* Alerts as complete trade objects (spec §1–§5, §9)                    */
/* ------------------------------------------------------------------ */

export const AlertTab = z.enum(['active', 'watching', 'history']);
export type AlertTab = z.infer<typeof AlertTab>;

/** The card's own state machine (spec §5 + §9), distinct from `alerts.status`. */
export const AlertCardState = z.enum([
  'watching',
  'forming',
  'ready',
  'entry_reached',
  'planned',
  'order_pending',
  'position_active',
  'invalidated',
  'closed',
]);
export type AlertCardState = z.infer<typeof AlertCardState>;

/** Spec §5 "Primary actions by state" — the ONE primary action, verbatim. */
export const ALERT_STATE_ACTION: Record<AlertCardState, { label: string; action: string; destination: string }> = {
  watching: { label: 'Open chart', action: 'open_chart', destination: 'Trade Portal with the monitored condition marked.' },
  forming: { label: 'Keep watching', action: 'keep_watching', destination: 'Stays monitored — edit or pause it.' },
  ready: { label: 'Review trade', action: 'review_trade', destination: 'Trade Portal with the Alert or Plan context.' },
  entry_reached: { label: 'Open Trade Portal', action: 'open_portal', destination: 'Chart centred on the trigger event.' },
  planned: { label: 'Prepare order', action: 'prepare_order', destination: 'Order ticket prefilled from the reviewed plan.' },
  order_pending: { label: 'Manage order', action: 'manage_order', destination: 'Order state and chart.' },
  position_active: { label: 'Manage trade', action: 'manage_trade', destination: 'Position context with stop and target events.' },
  invalidated: { label: 'See what changed', action: 'see_what_changed', destination: 'Chart replay and Kai explanation.' },
  closed: { label: 'Review outcome', action: 'review_outcome', destination: 'Debrief against the original alert.' },
};

/**
 * Which tab a state lives in (spec §1). Invalidated is HISTORY — spec §1's
 * History row lists it by name, and 0021's generated `alerts.tab` column agrees,
 * so the client, the API and the database cannot disagree about it.
 */
export const ALERT_STATE_TAB: Record<AlertCardState, AlertTab> = {
  watching: 'watching',
  forming: 'watching',
  ready: 'active',
  entry_reached: 'active',
  planned: 'active',
  order_pending: 'active',
  position_active: 'active',
  invalidated: 'history',
  closed: 'history',
};

/**
 * The card state → 0021's `alerts.lifecycle_state` check constraint. The two
 * vocabularies differ on purpose: the card distinguishes forming from watching
 * and ready from entry-reached because the USER acts differently on each, while
 * the column keeps the smaller set the database indexes and generates `tab`
 * from. This is the one place the mapping is written down.
 */
export const ALERT_LIFECYCLE_STATE: Record<AlertCardState, string> = {
  watching: 'watching',
  forming: 'watching',
  ready: 'active',
  entry_reached: 'active',
  planned: 'planned',
  order_pending: 'order_pending',
  position_active: 'position_active',
  invalidated: 'invalidated',
  closed: 'closed',
};

export const AlertTradePlan = z.object({
  direction: z.string(),
  direction_plain: z.string(),
  entry: z.number().nullable(),
  entry_condition_plain: z.string(),
  stop: z.number().nullable(),
  invalidation_plain: z.string(),
  targets: z.array(SetupTarget),
  rr: z.number().nullable(),
  rr_plain: z.string(),
  expected_hold: z.string(),
  expires_at: z.string().nullable(),
  expires_plain: z.string(),
  size: SizeSuggestion.nullable(),
});
export type AlertTradePlan = z.infer<typeof AlertTradePlan>;

export const AlertFit = z.object({
  est_risk_usd: z.number().nullable(),
  fits_cap: z.boolean().nullable(),
  concentration_plain: z.string().nullable(),
  conflicts: z.array(z.string()),
  plain: z.string(),
});
export type AlertFit = z.infer<typeof AlertFit>;

/** Always secondary, always labelled, never changes the grade (spec §9). */
export const AlertCommunity = z.object({
  sample_size: z.number(),
  common_level: z.number().nullable(),
  sentiment: z.string().nullable(),
  verified: z.boolean().nullable(),
  room_id: z.string().nullable(),
  plain: z.string(),
});
export type AlertCommunity = z.infer<typeof AlertCommunity>;

export const AlertEvent = z.object({
  at: z.string(),
  from_state: AlertCardState.nullable(),
  to_state: AlertCardState,
  source: z.string(),
  plain: z.string(),
});
export type AlertEvent = z.infer<typeof AlertEvent>;

/**
 * How the family this setup came from has ACTUALLY resolved — SWING-1 §4.
 *
 * It is a RECORD, never a forecast, and it is kept structurally apart from the
 * medallion for the reason the medallion exists: the grade is a setup-quality
 * mark and says nothing about whether a trade made money. This number never
 * enters the score, the band or the colour. It always carries its n.
 */
export const FamilyPerformance = z.object({
  /** e.g. "Swing · long · Kai scanner". */
  family: z.string(),
  /** Picks graded. The sample size travels with the number, always. */
  n: z.number(),
  wins: z.number(),
  win_pct: z.number(),
  /** e.g. "5 sessions". */
  horizon: z.string(),
  /** The last pick that has actually resolved, not the wall clock. */
  as_of: z.string().nullable(),
  plain: z.string(),
});
export type FamilyPerformance = z.infer<typeof FamilyPerformance>;

/**
 * What one alert actually did, on a History row.
 *
 * ONLY WHERE IT EXISTS. An alert still inside its window has no outcome and the
 * field is null — the row then says nothing rather than showing a zero, which is
 * the same rule `grade.ts` applies to a component the scanner never measured.
 *
 * `plain` carries the disclosure the number needs. For the Kai scanner family
 * that is: close to close from the published trigger, held the whole way, with
 * no stop and no target — not the result of a trade anyone managed.
 */
export const AlertCardOutcome = z.object({
  label: z.string(),
  value: z.string().nullable(),
  tone: z.enum(['good', 'bad', 'neutral']),
  plain: z.string(),
});
export type AlertCardOutcome = z.infer<typeof AlertCardOutcome>;

/**
 * THE standard alert card (spec §2). One component across Active, Watching and
 * History; sections may collapse but the semantics never change.
 */
export const AlertCard = z.object({
  id: z.string(),
  /** Which underlying object this card is. */
  kind: z.enum(['alert', 'setup', 'position']),
  alert_id: z.string().nullable(),
  setup_id: z.string().nullable(),
  plan_id: z.string().nullable(),
  order_id: z.string().nullable(),
  position_id: z.string().nullable(),

  identity: z.object({
    symbol: z.string(),
    company_name: z.string().nullable(),
    logo_url: z.string().nullable(),
    mode: AppMode,
    mode_label: z.string(),
    direction: z.string(),
    instrument: z.string(),
  }),

  grade: GradeMedallion,
  /** Qualitative only. Assert on this in tests: no "/20" may ever appear. */
  score_components: z.array(ScoreComponent),
  /**
   * SWING-1 §4. Present only where the engine that produced the setup has a
   * graded live record; null everywhere else. Additive — a payload written
   * before SWING-1 still parses.
   */
  family_performance: FamilyPerformance.nullable().default(null),

  state: AlertCardState,
  state_label: z.string(),
  tab: AlertTab,

  event: z.object({
    headline: z.string(),
    what_changed: z.string(),
    triggered_at: z.string().nullable(),
    at_plain: z.string(),
  }),

  /** Two sentences maximum. */
  company_summary: z.string().nullable(),

  quote: Quote.extend({ label_plain: z.string() }),
  trade_plan: AlertTradePlan,

  /** One line. Labelled as analysis, never as a guarantee (spec §8). */
  kai_interpretation: z.string(),
  kai_disclosure: z.string(),

  fit: AlertFit,
  community: AlertCommunity,

  /** History only. Null while the alert is still live, and null when unmeasured. */
  outcome: AlertCardOutcome.nullable().default(null),
  /** History only — "Yesterday", "12 Aug". Null on a live card. */
  resolved_label: z.string().nullable().default(null),

  primary_action: PlainAction,
  secondary_actions: z.array(PlainAction),

  detail: z.object({
    thesis_plain: z.string().nullable(),
    thesis_technical: z.string().nullable(),
    scenarios: z.array(Scenario),
    evidence: z.array(z.string()),
    sources: z.array(z.object({ label: z.string(), at: z.string().nullable(), url: z.string().nullable() })),
    event_history: z.array(AlertEvent),
  }),

  /** A grade change makes a NEW version rather than rewriting history (§9). */
  version: z.number(),
  graded_at: z.string().nullable(),
  created_at: z.string(),
});
export type AlertCard = z.infer<typeof AlertCard>;

export const AlertsRound4Query = z.object({
  tab: AlertTab.optional(),
  filter: AlertTypeFilter.default('all'),
});
export type AlertsRound4Query = z.infer<typeof AlertsRound4Query>;

export const AlertTabChip = z.object({
  key: AlertTab,
  label: z.string(),
  count: z.number(),
  plain: z.string(),
});
export type AlertTabChip = z.infer<typeof AlertTabChip>;

/** Superset of the V5 payload: every round-2 and round-3 key still present. */
export const AlertsRound4Response = AlertsV5Response.extend({
  tab: AlertTab,
  tabs: z.array(AlertTabChip),
  cards: z.array(AlertCard),
  card_empty_copy: z.string(),
});
export type AlertsRound4Response = z.infer<typeof AlertsRound4Response>;

/* ------------------------------------------------------------------ */
/* Chart annotations (spec §7 "Annotation requirements")                */
/* ------------------------------------------------------------------ */

/**
 * APPEND-ONLY. Every value below `note` was added by LIVE-1 and every existing
 * value keeps its meaning and its position — a stored row written by round 4
 * still parses, and a client that has not shipped LIVE-1 yet simply never
 * receives the new three.
 *
 * The first eight are SEMANTIC (what the level means). The last three are
 * SHAPES the chart can draw that have no single semantic (`trendline` between
 * two anchors, `box` over a time × price region for an FVG or an order block,
 * `vertical` marking a moment). Mixing the two in one enum is the honest
 * modelling: the drawing layer keys off `kind` plus which coordinates are
 * present, and nothing has to send a shape name twice.
 */
export const AnnotationKind = z.enum([
  'trigger',
  'entry',
  'stop',
  'invalidation',
  'target',
  'support',
  'resistance',
  'note',
  'trendline',
  'box',
  'vertical',
  /**
   * Two shapes with no financial meaning of their own, added so Kai can do what
   * a person at a whiteboard does: ring the candle he is talking about, and
   * show the distance price still has to travel. Both are anchored to stored
   * bars and stored levels — a circle has a centre, never a freehand loop.
   */
  'circle',
  'arrow',
]);
export type AnnotationKind = z.infer<typeof AnnotationKind>;

export const AnnotationProvenance = z.enum(['kai', 'user', 'community', 'plan']);
export type AnnotationProvenance = z.infer<typeof AnnotationProvenance>;

export const AnnotationStatus = z.enum(['valid', 'invalidated', 'hidden', 'deleted']);
export type AnnotationStatus = z.infer<typeof AnnotationStatus>;

export const AnnotationRow = z.object({
  id: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  kind: AnnotationKind,
  price: z.number().nullable(),
  price2: z.number().nullable(),
  ts_from: z.string().nullable(),
  ts_to: z.string().nullable(),
  text: z.string().nullable(),
  /** Why Kai put it there. Required on every Kai annotation. */
  reason: z.string().nullable(),
  provenance: AnnotationProvenance,
  status: AnnotationStatus,
  source_alert_id: z.string().nullable(),
  source_setup_id: z.string().nullable(),
  source_plan_id: z.string().nullable(),
  /** Semantics only — the client maps it to the palette. */
  semantic: z.enum(['entry', 'stop', 'target', 'invalidation', 'note', 'level']),
  editable: z.boolean(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});
export type AnnotationRow = z.infer<typeof AnnotationRow>;

export const AnnotationsQuery = z.object({
  symbol: z.string().min(1).max(12),
  timeframe: z.string().max(8).optional(),
  include_hidden: z.enum(['0', '1']).optional(),
});
export type AnnotationsQuery = z.infer<typeof AnnotationsQuery>;

export const AnnotationsResponse = z.object({
  symbol: z.string(),
  annotations: z.array(AnnotationRow),
  plain: z.string(),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type AnnotationsResponse = z.infer<typeof AnnotationsResponse>;

export const CreateAnnotationRequest = z.object({
  symbol: z.string().min(1).max(12),
  timeframe: z.string().max(8).default('1d'),
  kind: AnnotationKind,
  price: z.number().nullable().optional(),
  price2: z.number().nullable().optional(),
  ts_from: z.string().nullable().optional(),
  ts_to: z.string().nullable().optional(),
  text: z.string().max(400).nullable().optional(),
  reason: z.string().max(400).nullable().optional(),
  provenance: AnnotationProvenance.default('user'),
  source_alert_id: z.string().nullable().optional(),
  source_setup_id: z.string().nullable().optional(),
  source_plan_id: z.string().nullable().optional(),
});
export type CreateAnnotationRequest = z.infer<typeof CreateAnnotationRequest>;

/** Hide, delete or retitle. The user controls every Kai annotation (spec §7). */
export const PatchAnnotationRequest = z
  .object({
    status: z.enum(['valid', 'hidden', 'deleted']).optional(),
    text: z.string().max(400).nullable().optional(),
    price: z.number().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change on that mark.' });
export type PatchAnnotationRequest = z.infer<typeof PatchAnnotationRequest>;

export const AnnotationResponse = z.object({
  annotation: AnnotationRow,
  plain: z.string(),
});
export type AnnotationResponse = z.infer<typeof AnnotationResponse>;

/* ------------------------------------------------------------------ */
/* Kai chart-control commands (spec §7)                                 */
/* ------------------------------------------------------------------ */

/**
 * APPEND-ONLY (v2, LIVE-1). The first eleven are round 4's and are unchanged.
 *
 * The five new ones are CAMERA commands. Round 4's vocabulary could only say
 * "mark this" and "switch to that"; it had no way to say "look over here" — so
 * Kai could draw a level 400 bars off screen and narrate it as though the user
 * could see it. These five give the camera the same first-class standing the
 * annotations already had, which is what "Kai is working the chart" needs to be
 * true rather than a figure of speech.
 */
export const ChartCommandName = z.enum([
  'mark_level',
  'set_timeframe',
  'show_invalidation',
  'mark_plan',
  'zoom_trigger',
  'compare_prior',
  'highlight_community',
  'annotation_remove',
  'annotation_explain',
  'alert_from_level',
  'prepare_trade',
  'zoom_range',
  'scroll_bars',
  'scroll_to_now',
  'flash_annotation',
  'pointer_hint',
]);
export type ChartCommandName = z.infer<typeof ChartCommandName>;

/* ---- Chart commands v2: the payload of each new command (02 §7) ---- */

/**
 * Zoom to a span of time that already exists on a real object — a setup's
 * formation window, the session an alert triggered in. Both ends are
 * timestamps, never "N bars ago", so the command survives a timeframe switch.
 */
export const ZoomRangePayload = z.object({
  from: z.string(),
  to: z.string(),
  /** Share of the span left as breathing room either side. Default 0.12. */
  padding: z.number().min(0).max(1).optional(),
  duration_ms: z.number().min(0).max(4000).optional(),
});
export type ZoomRangePayload = z.infer<typeof ZoomRangePayload>;

/** Move the view by whole bars. Negative is back in time. */
export const ScrollBarsPayload = z.object({
  bars: z.number().min(-2000).max(2000),
  duration_ms: z.number().min(0).max(4000).optional(),
});
export type ScrollBarsPayload = z.infer<typeof ScrollBarsPayload>;

/** Back to the live edge after a look at history. */
export const ScrollToNowPayload = z.object({
  duration_ms: z.number().min(0).max(4000).optional(),
});
export type ScrollToNowPayload = z.infer<typeof ScrollToNowPayload>;

/**
 * Pulse an annotation that is ALREADY on the chart. Two pulses, no movement:
 * the price line must never move to draw attention to itself, because a moving
 * price line is a lie about the price.
 */
export const FlashAnnotationPayload = z.object({
  annotation_id: z.string(),
  pulses: z.number().min(1).max(6).optional(),
});
export type FlashAnnotationPayload = z.infer<typeof FlashAnnotationPayload>;

/**
 * Send Kai's pointer somewhere without changing anything. The one command in
 * the set that alters no state at all — it exists so narration and attention can
 * be aligned ("look at what happens here…") before the thing being described
 * has been drawn.
 */
export const PointerHintPayload = z.object({
  price: z.number().nullable().optional(),
  ts: z.string().nullable().optional(),
  /** Park on a timeframe button instead of on the plot. */
  rail: z.enum(['1m', '5m', '15m', '1h', '4h', 'D']).nullable().optional(),
  duration_ms: z.number().min(0).max(4000).optional(),
  /** Leave it there rather than fading it out when the move finishes. */
  linger: z.boolean().optional(),
});
export type PointerHintPayload = z.infer<typeof PointerHintPayload>;

/** Every v2 payload, keyed by command. Commands not listed keep free-form args. */
export const ChartCommandPayloadV2 = {
  zoom_range: ZoomRangePayload,
  scroll_bars: ScrollBarsPayload,
  scroll_to_now: ScrollToNowPayload,
  flash_annotation: FlashAnnotationPayload,
  pointer_hint: PointerHintPayload,
} as const;

/**
 * A frame the client applies to the chart IN PLACE and narrates (spec §8).
 * Payloads are resolved server-side from the setup / alert / plan / community
 * objects — Kai names WHICH level, never the number. A command whose level
 * cannot be resolved from a real object is dropped rather than invented.
 */
export const ChartCommandFrame = z.object({
  type: z.literal('chart_command'),
  command: ChartCommandName,
  payload: z.record(z.string(), z.unknown()),
  /** Annotations created or changed by this command, already persisted. */
  annotations: z.array(AnnotationRow),
  /** The sentence Kai says while the chart changes. */
  narration: z.string(),
  /** Where each number came from. Never empty when a number is present. */
  provenance: z.string(),
});
export type ChartCommandFrame = z.infer<typeof ChartCommandFrame>;

/* ---- LIVE-8: Kai answering a question ON the chart ---- */

/**
 * One chart action, and when in the answer it fires.
 *
 * `t_offset_ms` is measured from the first word of `spoken`, so an action and
 * the words it belongs to are described in one coordinate system — the client
 * does not have to guess which sentence a gesture was for, and the acceptance
 * checker can invert the mapping to prove it landed on the right one.
 */
export const ChartAnswerAction = z.object({
  t_offset_ms: z.number().int().min(0),
  frame: ChartCommandFrame,
});
export type ChartAnswerAction = z.infer<typeof ChartAnswerAction>;

/**
 * Kai's answer to a question about the chart the user is looking at.
 *
 * NOT A MESSAGE WITH SOME COMMANDS ATTACHED. The prose and the actions are one
 * performance: he moves the camera, marks the level he is naming and rings the
 * candle he is pointing at, in time with the words. Sending them as one frame is
 * what lets the client run them as one — a stream of loose `chart_command`
 * frames would arrive in order and play with no timing at all.
 *
 * `spoken` carries no markers and no invented numbers: every price in it came
 * out of the same resolver every other chart command goes through, and an action
 * that could not be resolved is absent rather than approximated.
 */
export const ChartAnswerFrame = z.object({
  type: z.literal('chart_answer'),
  symbol: z.string(),
  timeframe: z.string(),
  /** What Kai says. Markers removed; this is the text the chat renders. */
  spoken: z.string(),
  /**
   * How long the whole answer takes, so a client can pace a late join.
   *
   * MEASURED off the audio when there is audio, estimated from the words when
   * there is not — and `audio_state` says which, because every action's offset
   * is a fraction of this and the difference between measured and estimated is
   * the difference between a gesture landing ON its word and near it.
   */
  duration_ms: z.number().int().min(0),
  /**
   * Kai speaking the answer, as a WAV the client plays alongside the actions.
   *
   * NULLABLE, AND THAT IS THE DEGRADE, NOT AN ERROR. Voice is a switch over the
   * top of a feature that has always worked silently: with no key, no credits or
   * the provider down, the chart still performs and the words are still on
   * screen. A credit outage costs the audio, not the answer.
   */
  audio_url: z.string().nullable().default(null),
  audio_state: z.enum(['ready', 'estimated', 'failed']).default('estimated'),
  actions: z.array(ChartAnswerAction),
});
export type ChartAnswerFrame = z.infer<typeof ChartAnswerFrame>;

/* ------------------------------------------------------------------ */
/* GET /symbols/:symbol — the ticker research page (brief item 4)       */
/* ------------------------------------------------------------------ */

export const TickerKaiView = z.object({
  take: z.string(),
  disclosure: z.string(),
  actions: z.array(PlainAction),
});
export type TickerKaiView = z.infer<typeof TickerKaiView>;

export const TickerOverview = z.object({
  summary: z.string().nullable(),
  market_cap: z.number().nullable(),
  market_cap_plain: z.string().nullable(),
  next_earnings: z.string().nullable(),
  pe: z.number().nullable(),
  sector: z.string().nullable(),
  source: z.enum(['polygon', 'seed', 'none']),
  plain: z.string(),
});
export type TickerOverview = z.infer<typeof TickerOverview>;

export const TickerCommunityBlock = z.object({
  most_mentioned_level: z.number().nullable(),
  posts_today: z.number(),
  sentiment: z.string().nullable(),
  circle: z
    .object({ id: z.string(), name: z.string(), route: z.string(), expires_at: z.string().nullable() })
    .nullable(),
  room_id: z.string().nullable(),
  plain: z.string(),
});
export type TickerCommunityBlock = z.infer<typeof TickerCommunityBlock>;

/** The "A− One active alert · triggered 9:38 · View" row. */
export const TickerAlertRow = z.object({
  alert_id: z.string().nullable(),
  card_id: z.string(),
  grade: GradeMedallion,
  state: AlertCardState,
  plain: z.string(),
  triggered_at: z.string().nullable(),
  route: z.string(),
});
export type TickerAlertRow = z.infer<typeof TickerAlertRow>;

/** Superset of the V5 workspace payload. Nothing was removed. */
export const SymbolTickerResponse = SymbolWorkspaceResponse.extend({
  company: CompanyProfile,
  ticker_overview: TickerOverview,
  technicals: Technicals,
  kai_view: TickerKaiView,
  ticker_community: TickerCommunityBlock,
  active_alert: TickerAlertRow.nullable(),
  chart_timeframes: z.array(z.object({ key: z.string(), label: z.string() })),
  open_in_trade: PlainAction,
});
export type SymbolTickerResponse = z.infer<typeof SymbolTickerResponse>;

/* ------------------------------------------------------------------ */
/* GET /trade/portal/:symbol — the chart-first workspace (spec §6, §7)  */
/* ------------------------------------------------------------------ */

export const PortalContextKey = z.enum(['kai', 'alert', 'plan', 'community']);
export type PortalContextKey = z.infer<typeof PortalContextKey>;

export const PortalQuery = z.object({
  alert: z.string().optional(),
  setup: z.string().optional(),
  ctx: PortalContextKey.optional(),
  timeframe: z.string().max(8).optional(),
});
export type PortalQuery = z.infer<typeof PortalQuery>;

/**
 * The exact opening line spec §6 requires when the Portal is opened FROM an
 * alert. `{SYMBOL}` is the only substitution.
 */
export const PORTAL_OPENING_MESSAGE_TEMPLATE =
  'This is the {SYMBOL} alert you opened. I marked the trigger, entry area, stop and first target on the chart.';

export function portalOpeningMessage(symbol: string): string {
  return PORTAL_OPENING_MESSAGE_TEMPLATE.replace('{SYMBOL}', symbol.toUpperCase());
}

export const PortalChartConfig = z.object({
  /** The resolution the portal actually resolved to — the series below. */
  timeframe: z.string(),
  /** What was asked for. Differs from `timeframe` only when `exact` is false. */
  requested_timeframe: z.string().default('1d'),
  /** false when a coarser series had to answer; `resolution_plain` says why. */
  exact: z.boolean().default(true),
  resolution_plain: z.string().nullable().default(null),
  timeframes: z.array(z.object({ key: z.string(), label: z.string() })),
  candles_path: z.string(),
  /**
   * The bars the header quote was taken from. `quote.price` IS the close of the
   * last one and `quote.source_ts` its timestamp — the header and the chart are
   * the same array, so they cannot contradict each other (spec §9).
   */
  candles: z.array(Candle).default([]),
  /**
   * The timestamp of the bar the header quote was taken from — always the last
   * element of `candles`. `quote.source_ts` is that same instant, restamped to
   * the session close (4:00 PM ET) when the series is daily, because Polygon
   * stamps a daily bar at the START of its session and a header reading
   * "last close 12:00 AM" would be a lie about a true price.
   */
  quote_bar_ts: z.string().nullable().default(null),
  /** Where the price came from: a chart bar, or the daily snapshot alone. */
  quote_series: z.enum(['intraday', 'daily', 'snapshot']).default('snapshot'),
  /** The trigger candle's timestamp, when the portal was opened from an event. */
  focus_ts: z.string().nullable(),
  range: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
  plain: z.string(),
});
export type PortalChartConfig = z.infer<typeof PortalChartConfig>;

export const PortalKaiContext = z.object({
  conversation_id: z.string().nullable(),
  /** Spec §6's opening message, verbatim, when opened from an alert. */
  opening_message: z.string().nullable(),
  placeholder: z.string(),
  suggestions: z.array(z.string()),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type PortalKaiContext = z.infer<typeof PortalKaiContext>;

export const PortalPlanContext = z.object({
  existing_plan: PlanRow.nullable(),
  suggested: SuggestedPlan.nullable(),
  daily_risk: z.object({ cap: z.number().nullable(), used: z.number(), remaining: z.number().nullable(), currency: z.string() }),
  actions: z.array(PlainAction),
  plain: z.string(),
});
export type PortalPlanContext = z.infer<typeof PortalPlanContext>;

export const PortalCommunityContext = z.object({
  room_id: z.string().nullable(),
  circle: z
    .object({ id: z.string(), name: z.string(), route: z.string(), expires_at: z.string().nullable(), members: z.number() })
    .nullable(),
  sentiment: CommunitySentiment.nullable(),
  verified_claims: z.array(z.object({ claim: z.string(), verdict: z.string(), plain: z.string() })),
  most_mentioned_level: z.number().nullable(),
  /** Community context is labelled and secondary, always (spec §8). */
  label_plain: z.string(),
  plain: z.string(),
  actions: z.array(PlainAction),
});
export type PortalCommunityContext = z.infer<typeof PortalCommunityContext>;

export const PortalExecution = z.object({
  state: AlertCardState.nullable(),
  /**
   * null when there is nothing to execute. Volt is the app's one dominant
   * action; a filled button reading "Nothing to prepare yet" spends it on a
   * non-action, so the portal returns no action at all and the surface renders
   * the reason as text instead. `no_action_plain` carries that sentence.
   */
  primary_action: PlainAction.nullable(),
  no_action_plain: z.string().nullable().default(null),
  /** Never "Submit to broker" on paper (spec §10). */
  capability_plain: z.string(),
  paper: z.boolean(),
});
export type PortalExecution = z.infer<typeof PortalExecution>;

export const PortalDrawers = z.object({
  account: z.object({
    kind: z.literal('paper'),
    equity: z.number().nullable(),
    cash: z.number().nullable(),
    buying_power: z.number().nullable(),
    day_change: z.number().nullable(),
    plain: z.string(),
  }),
  positions: z.array(OpenPositionRow),
  open_orders: z.array(OrderRow),
  watchlist: z.array(z.object({ symbol: z.string(), name: z.string().nullable(), price: z.number().nullable(), route: z.string() })),
  recent: z.array(RecentSymbol),
});
export type PortalDrawers = z.infer<typeof PortalDrawers>;

export const PortalResponse = z.object({
  identity: WorkspaceIdentity.extend({
    company_name: z.string().nullable(),
    logo_url: z.string().nullable(),
    mode: AppMode,
    instrument: z.string(),
  }),
  quote: MarketQuote,
  market: MarketBlock,
  chart_config: PortalChartConfig,
  annotations: z.array(AnnotationRow),
  contexts: z.object({
    selected: PortalContextKey,
    kai: PortalKaiContext,
    alert: AlertCard.nullable(),
    plan: PortalPlanContext,
    community: PortalCommunityContext,
  }),
  /** Spec §6: everything that had to survive the transition, echoed back. */
  restored: z.object({
    alert_id: z.string().nullable(),
    setup_id: z.string().nullable(),
    symbol: z.string(),
    instrument: z.string(),
    mode: AppMode,
    timeframe: z.string(),
    focus_ts: z.string().nullable(),
    levels: z.object({
      entry: z.number().nullable(),
      stop: z.number().nullable(),
      invalidation: z.number().nullable(),
      targets: z.array(z.number()),
      community: z.array(z.number()),
    }),
    grade_snapshot: GradeMedallion.nullable(),
    thesis_plain: z.string().nullable(),
    monitoring: z.object({
      condition_plain: z.string(),
      progress_plain: z.string(),
      last_evaluated_at: z.string().nullable(),
    }),
    execution: z.object({ plan_id: z.string().nullable(), order_id: z.string().nullable(), position_id: z.string().nullable() }),
    community: z.object({ room_id: z.string().nullable(), circle_id: z.string().nullable() }),
    plain: z.string(),
  }),
  execution: PortalExecution,
  drawers: PortalDrawers,
  paper_plain: z.string(),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type PortalResponse = z.infer<typeof PortalResponse>;

/* ------------------------------------------------------------------ */
/* Conversations drawer                                                 */
/* ------------------------------------------------------------------ */

export const ConversationSummary = z.object({
  id: z.string(),
  title: z.string(),
  mode: AppMode.nullable(),
  pinned: z.boolean(),
  /** "Morning Briefing · Aug 28" style rows come back already composed. */
  subtitle: z.string(),
  last_message_at: z.string().nullable(),
  message_count: z.number(),
  route: z.string(),
  kind: z.enum(['briefing', 'symbol', 'general']),
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

export const ConversationsQuery = z.object({
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ConversationsQuery = z.infer<typeof ConversationsQuery>;

export const ConversationsResponse = z.object({
  pinned: z.array(ConversationSummary),
  recent: z.array(ConversationSummary),
  q: z.string().nullable(),
  total: z.number(),
  empty_copy: z.string(),
  new_conversation_label: z.string(),
  search_placeholder: z.string(),
});
export type ConversationsResponse = z.infer<typeof ConversationsResponse>;

export const PatchConversationRequest = z
  .object({
    title: z.string().min(1).max(200).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change on that conversation.' });
export type PatchConversationRequest = z.infer<typeof PatchConversationRequest>;

export const PatchConversationResponse = z.object({
  conversation: ConversationSummary,
  plain: z.string(),
});
export type PatchConversationResponse = z.infer<typeof PatchConversationResponse>;

/** Home tells the drawer which conversation today's workspace is. */
export const HomeConversationMeta = z.object({
  id: z.string().nullable(),
  title: z.string(),
  pinned: z.boolean(),
  last_message_at: z.string().nullable(),
  drawer_route: z.string(),
  plain: z.string(),
});
export type HomeConversationMeta = z.infer<typeof HomeConversationMeta>;

export const HomeRound4Response = HomeV5Response.extend({
  conversation: HomeConversationMeta,
});
export type HomeRound4Response = z.infer<typeof HomeRound4Response>;

/* ------------------------------------------------------------------ */
/* Circles — time-boxed setup rooms                                     */
/* ------------------------------------------------------------------ */

export const CircleRow = z.object({
  id: z.string(),
  symbol: z.string().nullable(),
  name: z.string(),
  setup_id: z.string().nullable(),
  members: z.number(),
  messages: z.number(),
  joined: z.boolean(),
  expires_at: z.string().nullable(),
  /** "2 days left" / "6h left" / "Closed". */
  time_left_plain: z.string(),
  expired: z.boolean(),
  last_activity_at: z.string().nullable(),
  route: z.string(),
  grade: GradeMedallion.nullable(),
});
export type CircleRow = z.infer<typeof CircleRow>;

export const CirclesResponse = z.object({
  circles: z.array(CircleRow),
  can_create: z.boolean(),
  create_hint: z.string(),
  create_label: z.string(),
  ttl_options: z.array(z.object({ key: z.string(), label: z.string(), hours: z.number() })),
  empty_copy: z.string(),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type CirclesResponse = z.infer<typeof CirclesResponse>;

export const CreateCircleRequest = z.object({
  symbol: z.string().min(1).max(12),
  ttl: z.enum(['24h', '3d', '7d']).default('3d'),
});
export type CreateCircleRequest = z.infer<typeof CreateCircleRequest>;

export const CreateCircleResponse = z.object({
  circle: CircleRow,
  plain: z.string(),
});
export type CreateCircleResponse = z.infer<typeof CreateCircleResponse>;

export const CIRCLE_TTL_HOURS: Record<'24h' | '3d' | '7d', number> = { '24h': 24, '3d': 72, '7d': 168 };

/** The entitlement flag that gates circle creation. Missing = false. */
export const CIRCLES_CREATE_FLAG = 'circles_create';

/* ------------------------------------------------------------------ */
/* Round-4 copy constants                                               */
/* ------------------------------------------------------------------ */

export const COMMUNITY_LABEL_PLAIN =
  'Community observation — members, not Kai. It never changes the grade on its own.';
export const PAPER_CAPABILITY_PLAIN =
  'Practice account. There is no broker connected, so nothing here can be sent to one.';
export const ORDER_CONFIRMED_PLAIN =
  'Placed · paper account. Stop and target are attached.';

/**
 * The tick's round-4 additions: armed alerts are now really evaluated (spec §9
 * "Watching → Active" requires a VERIFIED event), and circles open and close on
 * the same pass. Superset of `PaperTickResponse`.
 */
export const PaperTickRound4Response = PaperTickResponse.extend({
  alerts_evaluated: z.number(),
  alerts_triggered: z.number(),
  circles_opened: z.number(),
  circles_closed: z.number(),
});
export type PaperTickRound4Response = z.infer<typeof PaperTickRound4Response>;

/* ------------------------------------------------------------------ */
/* GET /trade/default — which chart the Trade tab opens on              */
/* ------------------------------------------------------------------ */

/**
 * Trade is a working chart, not a search prompt (spec 10 §7). The tab therefore
 * has to know a symbol BEFORE the user has picked one, and it has to know it
 * fast enough that nobody watches a placeholder.
 *
 * This answer is DATABASE ONLY — no quote, no snapshot, no scan. It names the
 * symbol and says, in one plain sentence, why that one. The order is the order
 * of the user's own attention:
 *
 *   alert      an alert of theirs is on the Active tab — that is the thing that
 *              needs a decision, so the portal opens with its context restored.
 *   position   something is open. A position with no exit level comes first,
 *              because that is the one with an unanswered question on it.
 *   watchlist  the first name they put on the list themselves.
 *   recent     the last symbol they actually worked (an order they placed).
 *   fallback   SPY. Not "nothing" — the market itself.
 */
export const TradeDefaultReason = z.enum(['alert', 'position', 'watchlist', 'recent', 'fallback']);
export type TradeDefaultReason = z.infer<typeof TradeDefaultReason>;

/** The symbol Trade opens on when the user has nothing of their own yet. */
export const TRADE_DEFAULT_FALLBACK_SYMBOL = 'SPY';

export const TradeDefaultResponse = z.object({
  symbol: z.string().min(1).max(12),
  reason: TradeDefaultReason,
  /** Set only when `reason` is 'alert': the portal restores that alert. */
  alert_id: z.string().nullable(),
  /** Which context panel the portal should open on. */
  ctx: z.enum(['alert', 'kai']),
  label_plain: z.string(),
});
export type TradeDefaultResponse = z.infer<typeof TradeDefaultResponse>;

/* ------------------------------------------------------------------ */
/* Round 5 — push: the registry, the test, the drain, the health board  */
/* ------------------------------------------------------------------ */

/**
 * ONE NOTIFICATION, TWO TRANSPORTS (round-5 brief §3). Nothing in this section
 * carries a title or a body. The banner says exactly what the inbox row says
 * because it IS the inbox row — `payload.title_plain` / `payload.body_plain`
 * off `NotificationRow`, built once in `lib/push/payload.ts`. A second, punchier
 * copy path for banners is how an app ends up lying to itself about what it
 * told the user.
 */
export const PushTransport = z.enum(['expo', 'web']);
export type PushTransport = z.infer<typeof PushTransport>;

export const PushPlatform = z.enum(['ios', 'android', 'web']);
export type PushPlatform = z.infer<typeof PushPlatform>;

export const PushSubscriptionState = z.enum(['active', 'stale', 'revoked']);
export type PushSubscriptionState = z.infer<typeof PushSubscriptionState>;

/** The browser's own encryption keys. We hold them; we never generate them. */
export const WebPushKeys = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});
export type WebPushKeys = z.infer<typeof WebPushKeys>;

export const PushSubscribeRequest = z.object({
  transport: PushTransport,
  /** `ExponentPushToken[...]` for expo; the endpoint URL for web. */
  handle: z.string().min(1).max(2048),
  /**
   * Web only, and OPTIONAL by contract — which means a web row with no keys is
   * storable and undeliverable. The sender's job is to skip it and mark it
   * stale, not to throw (brief §12.1).
   */
  keys: WebPushKeys.nullable().optional(),
  platform: PushPlatform.optional(),
  /** "iPhone" / "Chrome on macOS" — so the user can turn off the right device. */
  device_label: z.string().max(120).optional(),
});
export type PushSubscribeRequest = z.infer<typeof PushSubscribeRequest>;

/**
 * Never carries `handle` or `keys`. A push token is a capability to buzz a
 * device; there is no screen that needs to render one, so it does not leave
 * the server.
 */
export const PushSubscriptionRow = z.object({
  id: z.string(),
  transport: PushTransport,
  platform: PushPlatform.nullable(),
  device_label: z.string().nullable(),
  state: PushSubscriptionState,
  created_at: z.string(),
  last_success_at: z.string().nullable(),
  /** "This device" when it matches the handle the caller just registered. */
  plain: z.string(),
});
export type PushSubscriptionRow = z.infer<typeof PushSubscriptionRow>;

export const PushSubscribeResponse = z.object({
  subscription: PushSubscriptionRow,
  plain: z.string(),
});
export type PushSubscribeResponse = z.infer<typeof PushSubscribeResponse>;

export const PushSubscriptionsResponse = z.object({
  subscriptions: z.array(PushSubscriptionRow),
  push_enabled: z.boolean(),
  /**
   * Null when the server has no VAPID key pair configured. The web client must
   * read this rather than assume — subscribing against a key the server cannot
   * sign for produces an endpoint that silently never delivers.
   */
  vapid_public_key: z.string().nullable(),
  plain: z.string(),
});
export type PushSubscriptionsResponse = z.infer<typeof PushSubscriptionsResponse>;

export const PushSubscriptionDeleteResponse = z.object({
  revoked: z.number(),
  plain: z.string(),
});
export type PushSubscriptionDeleteResponse = z.infer<typeof PushSubscriptionDeleteResponse>;

export const PushTestRequest = z.object({}).optional();
export type PushTestRequest = z.infer<typeof PushTestRequest>;

/**
 * A suppression is a RECORD, not a drop. This is the shape that lets the UI say
 * "you are in quiet hours right now" instead of appearing broken, which is the
 * entire reason the test route exists.
 */
export const PushSuppression = z.object({
  reason: z.string(),
  plain: z.string(),
  subscription_id: z.string().nullable(),
});
export type PushSuppression = z.infer<typeof PushSuppression>;

export const PushTestResponse = z.object({
  sent: z.number(),
  suppressed: z.array(PushSuppression),
  plain: z.string(),
});
export type PushTestResponse = z.infer<typeof PushTestResponse>;

export const PushHealthResponse = z.object({
  transports: z.object({
    expo: z.object({ configured: z.boolean(), dry_run: z.boolean(), plain: z.string() }),
    web: z.object({ configured: z.boolean(), vapid: z.boolean(), plain: z.string() }),
  }),
  queue: z.object({ queued: z.number(), awaiting_receipt: z.number(), failed_24h: z.number() }),
  last_drain_at: z.string().nullable(),
  dev_drainer: z.object({ on: z.boolean(), interval_s: z.number() }),
  plain: z.string(),
});
export type PushHealthResponse = z.infer<typeof PushHealthResponse>;

export const PushDrainResponse = z.object({
  claimed: z.number(),
  sent: z.number(),
  failed: z.number(),
  retried: z.number(),
  receipts_checked: z.number(),
  delivered: z.number(),
  revoked: z.number(),
  plain: z.string(),
});
export type PushDrainResponse = z.infer<typeof PushDrainResponse>;

/* ------------------------------------------------------------------ */
/* Round 6 — the admin backend and the CRM (brief §§3, 6, 7, 8)         */
/* ------------------------------------------------------------------ */

/**
 * THE ADMIN CONTRACT IS THE SAME CONTRACT. Every shape below is a normal
 * response of this API — same envelope, same `plain` sentences, same enums.
 * There is no second protocol for staff, because a second protocol is a second
 * place for a mistake to live.
 *
 * WHAT IS NOT IN THIS SECTION, deliberately:
 *   * a message body. `AdminKaiActivity` carries counts and timestamps and
 *     nothing else (brief §3). Reading a transcript is `AdminTranscriptRequest`
 *     — a separate call that demands a reason and writes an audit row.
 *   * a push handle, a token, a password, a Stripe key.
 *   * a score that anything in this app computes. `AdminScores` is nine
 *     nullable numbers ported from the source model, and null renders as "not
 *     tracked yet" rather than as zero (brief §8).
 */

export const StaffRole = z.enum(['support', 'admin', 'owner']);
export type StaffRole = z.infer<typeof StaffRole>;

/** The funnel, exactly as `crm_people.status` constrains it. */
export const CrmStatus = z.enum([
  'lead',
  'invited',
  'signed_up',
  'onboarded',
  'activated',
  'paying',
  'churned',
  'blocked',
]);
export type CrmStatus = z.infer<typeof CrmStatus>;

export const CrmIdentityKind = z.enum([
  'email',
  'phone',
  'app_user',
  'stripe_customer',
  'kai_user',
  'os_user',
  'invite_code',
]);
export type CrmIdentityKind = z.infer<typeof CrmIdentityKind>;

export const CrmEventSource = z.enum(['app', 'kai_sms', 'stripe', 'admin', 'import']);
export type CrmEventSource = z.infer<typeof CrmEventSource>;

/** The three connectors. `app` is real this round; the other two are stubs. */
export const SyncSourceName = z.enum(['app', 'kai_sms', 'stripe']);
export type SyncSourceName = z.infer<typeof SyncSourceName>;

/**
 * A METRIC THAT KNOWS WHETHER IT KNOWS. `value: null` with `tracked: false` is
 * the shape brief §8 demands — "a metric with no data source renders as 'not
 * tracked yet', never as zero". The client must not coalesce this to 0; the two
 * fields exist precisely so it cannot do so by accident, and `plain` already
 * says the honest sentence for both cases.
 */
export const AdminMetric = z.object({
  key: z.string(),
  label: z.string(),
  /** Null ONLY when `tracked` is false. A tracked metric with no rows is 0. */
  value: z.number().nullable(),
  tracked: z.boolean(),
  /** 'count' | 'cents' | 'percent' — how to render `value`, not a colour. */
  unit: z.enum(['count', 'cents', 'percent']),
  plain: z.string(),
});
export type AdminMetric = z.infer<typeof AdminMetric>;

export const AdminFunnelRow = z.object({
  status: CrmStatus,
  position: z.number(),
  people: z.number(),
});
export type AdminFunnelRow = z.infer<typeof AdminFunnelRow>;

export const AdminDailyRow = z.object({
  day: z.string(),
  signups: z.number(),
  leads: z.number(),
});
export type AdminDailyRow = z.infer<typeof AdminDailyRow>;

export const AdminSourceMixRow = z.object({
  source: z.string().nullable(),
  people: z.number(),
});
export type AdminSourceMixRow = z.infer<typeof AdminSourceMixRow>;

export const AdminInviteTotals = z.object({
  outstanding: z.number(),
  redeemed: z.number(),
  revoked: z.number(),
  expired: z.number(),
});
export type AdminInviteTotals = z.infer<typeof AdminInviteTotals>;

/** The last run of one connector, or null when it has never run. */
export const AdminSyncRun = z.object({
  id: z.string(),
  source: SyncSourceName,
  state: z.enum(['running', 'ok', 'failed']),
  dry_run: z.boolean(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  counts: z.object({
    scanned: z.number(),
    created: z.number(),
    resolved: z.number(),
    conflicted: z.number(),
    skipped: z.number(),
  }),
  error: z.string().nullable(),
});
export type AdminSyncRun = z.infer<typeof AdminSyncRun>;

/**
 * A SOURCE THAT IS SWITCHED OFF IS STILL A SOURCE (brief §5). `configured:
 * false` plus the exact `reason` is what makes the Sources screen show a
 * connector that exists and is off, rather than a feature that is missing.
 */
export const AdminSourceState = z.object({
  source: SyncSourceName,
  configured: z.boolean(),
  /** Null when configured. The exact sentence when not. */
  reason: z.string().nullable(),
  last_run: AdminSyncRun.nullable(),
  plain: z.string(),
});
export type AdminSourceState = z.infer<typeof AdminSourceState>;

export const AdminOverviewResponse = z.object({
  funnel: z.array(AdminFunnelRow),
  metrics: z.array(AdminMetric),
  /** Newest day first, at most 30. */
  daily: z.array(AdminDailyRow),
  source_mix: z.array(AdminSourceMixRow),
  invites: AdminInviteTotals,
  sources: z.array(AdminSourceState),
  generated_at: z.string(),
  plain: z.string(),
});
export type AdminOverviewResponse = z.infer<typeof AdminOverviewResponse>;

/* ---- people ------------------------------------------------------- */

export const AdminPersonRow = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  primary_email: z.string().nullable(),
  primary_phone_e164: z.string().nullable(),
  status: CrmStatus,
  primary_tier: z.string().nullable(),
  source: z.string().nullable(),
  tags: z.array(z.string()),
  first_seen_at: z.string().nullable(),
  last_active_at: z.string().nullable(),
  app_user_id: z.string().nullable(),
  plain: z.string(),
});
export type AdminPersonRow = z.infer<typeof AdminPersonRow>;

export const AdminPeopleQuery = z.object({
  /** Name, email, phone. Never a ticker — see `AdminPeopleResponse.searched`. */
  q: z.string().max(120).optional(),
  status: CrmStatus.optional(),
  tier: z.string().max(60).optional(),
  source: z.string().max(60).optional(),
  tag: z.string().max(60).optional(),
  segment_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Opaque. Comes back as `next_cursor`; never constructed by the client. */
  cursor: z.string().max(200).optional(),
});
export type AdminPeopleQuery = z.infer<typeof AdminPeopleQuery>;

/**
 * NEVER AN UNBOUNDED LIST (brief §7 — "cursor paged — never an unbounded list
 * of 2,507"). `next_cursor` is null on the last page and is the only way to get
 * the next one; there is no offset parameter to raise.
 */
export const AdminPeopleResponse = z.object({
  people: z.array(AdminPersonRow),
  next_cursor: z.string().nullable(),
  /** Matching rows, capped: null means "more than we counted", not "unknown". */
  total: z.number().nullable(),
  /** Which fields the `q` actually searched, so the UI never claims more. */
  searched: z.array(z.string()),
  plain: z.string(),
});
export type AdminPeopleResponse = z.infer<typeof AdminPeopleResponse>;

/**
 * NINE NUMBERS THIS APP DOES NOT COMPUTE. They are ported so a connector can
 * carry across what the K.AI side already calculated, and they are null until
 * one does. `tracked: false` is the honest render.
 */
export const AdminScores = z.object({
  engagement: z.number().nullable(),
  buy_propensity: z.number().nullable(),
  churn_risk: z.number().nullable(),
  upsell_propensity: z.number().nullable(),
  crosssell_propensity: z.number().nullable(),
  responsiveness: z.number().nullable(),
  predicted_ltv_cents: z.number().nullable(),
  predicted_days_to_churn: z.number().nullable(),
  updated_at: z.string().nullable(),
  tracked: z.boolean(),
  plain: z.string(),
});
export type AdminScores = z.infer<typeof AdminScores>;

export const AdminIdentityRow = z.object({
  id: z.string(),
  kind: CrmIdentityKind,
  value: z.string(),
  source: z.string().nullable(),
  verified: z.boolean(),
  created_at: z.string(),
});
export type AdminIdentityRow = z.infer<typeof AdminIdentityRow>;

export const AdminTimelineRow = z.object({
  id: z.string(),
  type: z.string(),
  category: z.string().nullable(),
  source: CrmEventSource,
  value_cents: z.number().nullable(),
  occurred_at: z.string(),
  payload: z.record(z.string(), z.unknown()),
  plain: z.string(),
});
export type AdminTimelineRow = z.infer<typeof AdminTimelineRow>;

export const AdminNoteRow = z.object({
  id: z.string(),
  body: z.string(),
  author_user_id: z.string().nullable(),
  author_name: z.string().nullable(),
  created_at: z.string(),
});
export type AdminNoteRow = z.infer<typeof AdminNoteRow>;

export const AdminRedemptionRow = z.object({
  id: z.string(),
  invite_id: z.string(),
  code: z.string().nullable(),
  label: z.string().nullable(),
  granted: z.record(z.string(), z.unknown()),
  redeemed_at: z.string(),
});
export type AdminRedemptionRow = z.infer<typeof AdminRedemptionRow>;

/**
 * COUNTS AND TIMESTAMPS. There is no body here and there is not going to be
 * one — brief §3. A staff member who needs the words asks for them by name,
 * with a reason, through `POST /admin/people/[id]/transcript`.
 */
export const AdminKaiActivity = z.object({
  conversations: z.number(),
  messages: z.number(),
  last_message_at: z.string().nullable(),
  plain: z.string(),
});
export type AdminKaiActivity = z.infer<typeof AdminKaiActivity>;

export const AdminPersonDetail = AdminPersonRow.extend({
  source_detail: z.record(z.string(), z.unknown()),
  custom_fields: z.record(z.string(), z.unknown()),
  inbound_count: z.number(),
  outbound_count: z.number(),
  last_inbound_at: z.string().nullable(),
  last_outbound_at: z.string().nullable(),
  total_paid_cents: z.number().nullable(),
  total_refunded_cents: z.number().nullable(),
  current_mrr_cents: z.number().nullable(),
  ltv_cents: z.number().nullable(),
  merged_into: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});
export type AdminPersonDetail = z.infer<typeof AdminPersonDetail>;

export const AdminPersonResponse = z.object({
  person: AdminPersonDetail,
  identities: z.array(AdminIdentityRow),
  timeline: z.array(AdminTimelineRow),
  timeline_next_cursor: z.string().nullable(),
  notes: z.array(AdminNoteRow),
  redemptions: z.array(AdminRedemptionRow),
  /** The app's own subscription row. Null for a lead with no account. */
  subscription: z.object({
    tier: z.enum(['free', 'premium']),
    status: z.string(),
    current_period_end: z.string().nullable(),
    stripe_customer_id: z.string().nullable(),
  }).nullable(),
  /** The flag map the user's tier actually resolves to. */
  entitlements: z.record(z.string(), z.unknown()),
  scores: AdminScores,
  kai: AdminKaiActivity,
  /** People that were merged INTO this one. */
  merged_from: z.array(z.object({ id: z.string(), display_name: z.string().nullable() })),
  /** `merge_conflict` events awaiting a human (brief §5). */
  merge_conflicts: z.array(AdminTimelineRow),
  plain: z.string(),
});
export type AdminPersonResponse = z.infer<typeof AdminPersonResponse>;

export const AdminCreateNoteRequest = z.object({
  body: z.string().min(1).max(4000),
});
export type AdminCreateNoteRequest = z.infer<typeof AdminCreateNoteRequest>;

export const AdminNoteResponse = z.object({
  note: AdminNoteRow,
  plain: z.string(),
});
export type AdminNoteResponse = z.infer<typeof AdminNoteResponse>;

export const AdminTagsRequest = z
  .object({
    add: z.array(z.string().min(1).max(60)).max(20).optional(),
    remove: z.array(z.string().min(1).max(60)).max(20).optional(),
  })
  .refine((v) => (v.add?.length ?? 0) + (v.remove?.length ?? 0) > 0, {
    message: 'Say at least one tag to add or remove.',
  });
export type AdminTagsRequest = z.infer<typeof AdminTagsRequest>;

export const AdminTagsResponse = z.object({
  tags: z.array(z.string()),
  plain: z.string(),
});
export type AdminTagsResponse = z.infer<typeof AdminTagsResponse>;

export const AdminMergeRequest = z.object({
  winner_id: z.string().uuid(),
  loser_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type AdminMergeRequest = z.infer<typeof AdminMergeRequest>;

export const AdminMergeResponse = z.object({
  winner_id: z.string(),
  loser_id: z.string(),
  /** Exactly what moved, which is what makes the undo real. */
  moved: z.object({
    identities: z.number(),
    events: z.number(),
    notes: z.number(),
    redemptions: z.number(),
  }),
  plain: z.string(),
});
export type AdminMergeResponse = z.infer<typeof AdminMergeResponse>;

/**
 * READING SOMEONE'S WORDS IS AN ACT, NOT A VIEW (brief §3). The reason is
 * required by the schema rather than by a route's `if`, and the response is the
 * user's own view, unedited.
 */
export const AdminTranscriptRequest = z.object({
  conversation_id: z.string().uuid(),
  reason: z.string().min(8).max(500),
});
export type AdminTranscriptRequest = z.infer<typeof AdminTranscriptRequest>;

export const AdminTranscriptResponse = z.object({
  conversation: z.object({
    id: z.string(),
    title: z.string().nullable(),
    created_at: z.string(),
    last_message_at: z.string().nullable(),
  }),
  messages: z.array(
    z.object({
      seq: z.number(),
      role: z.enum(['user', 'kai']),
      content: z.record(z.string(), z.unknown()),
      created_at: z.string().nullable(),
    })
  ),
  plain: z.string(),
});
export type AdminTranscriptResponse = z.infer<typeof AdminTranscriptResponse>;

/* ---- invites ------------------------------------------------------ */

/** Derived, never stored: what the code can do RIGHT NOW. */
export const AdminInviteState = z.enum(['open', 'revoked', 'expired', 'exhausted']);
export type AdminInviteState = z.infer<typeof AdminInviteState>;

export const AdminInviteRow = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string().nullable(),
  tier: z.enum(['free', 'premium']),
  entitlements: z.record(z.string(), z.unknown()),
  max_redemptions: z.number().nullable(),
  redeemed_count: z.number(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
  created_by: z.string().nullable(),
  state: AdminInviteState,
  /** `/join/<code>` — a path, not an absolute URL: the host is the client's. */
  link: z.string(),
  plain: z.string(),
});
export type AdminInviteRow = z.infer<typeof AdminInviteRow>;

export const AdminInvitesQuery = z.object({
  state: AdminInviteState.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});
export type AdminInvitesQuery = z.infer<typeof AdminInvitesQuery>;

export const AdminInvitesResponse = z.object({
  invites: z.array(AdminInviteRow),
  next_cursor: z.string().nullable(),
  totals: AdminInviteTotals,
  plain: z.string(),
});
export type AdminInvitesResponse = z.infer<typeof AdminInvitesResponse>;

export const AdminCreateInviteRequest = z.object({
  label: z.string().max(120).optional(),
  tier: z.enum(['free', 'premium']).default('premium'),
  /** Free-form. `duration_days` below is folded in here for the SQL to read. */
  entitlements: z.record(z.string(), z.unknown()).default({}),
  /** How long the granted tier lasts. Absent = open-ended. */
  duration_days: z.number().int().min(1).max(3650).optional(),
  /** Null or absent = uncapped (a public launch link). */
  max_redemptions: z.number().int().min(1).max(100000).nullable().optional(),
  expires_in_days: z.number().int().min(1).max(365).optional(),
  /** A personal invite: the code becomes an identity of this person. */
  person_id: z.string().uuid().optional(),
  /** ≥10 glyphs, from the unambiguous alphabet. The default is 12 (~59 bits). */
  code_length: z.number().int().min(10).max(32).optional(),
});
export type AdminCreateInviteRequest = z.infer<typeof AdminCreateInviteRequest>;

export const AdminInviteResponse = z.object({
  invite: AdminInviteRow,
  plain: z.string(),
});
export type AdminInviteResponse = z.infer<typeof AdminInviteResponse>;

export const AdminRevokeInviteRequest = z.object({
  reason: z.string().max(500).optional(),
});
export type AdminRevokeInviteRequest = z.infer<typeof AdminRevokeInviteRequest>;

/* ---- redeeming (public, brief §6) --------------------------------- */

export const InviteRedeemRequest = z.object({
  code: z.string().min(1).max(64),
});
export type InviteRedeemRequest = z.infer<typeof InviteRedeemRequest>;

/**
 * Only the SUCCESS shape. A refusal is the app's normal error envelope with a
 * `message_plain` that names which refusal it was and a
 * `detail.reason` of `invite_not_found | invite_revoked | invite_expired |
 * invite_exhausted` — brief §6's "says exactly which, in plain words".
 */
export const InviteRedeemResponse = z.object({
  /** True when the same user had already redeemed this code. Never a refusal. */
  already_redeemed: z.boolean(),
  invite_id: z.string(),
  label: z.string().nullable(),
  tier: z.enum(['free', 'premium']),
  granted: z.record(z.string(), z.unknown()),
  /** The caller's entitlements AFTER the grant, read back, not predicted. */
  subscription: SubscriptionBlock,
  entitlements: z.record(z.string(), z.unknown()),
  plain: z.string(),
});
export type InviteRedeemResponse = z.infer<typeof InviteRedeemResponse>;

/* ---- entitlements (staff grant/revoke, reason required) ----------- */

export const AdminEntitlementRequest = z.object({
  action: z.enum(['grant', 'revoke']),
  tier: z.enum(['free', 'premium']).default('premium'),
  duration_days: z.number().int().min(1).max(3650).nullable().optional(),
  /** REQUIRED by brief §3. There is no default and no empty string. */
  reason: z.string().min(8).max(500),
});
export type AdminEntitlementRequest = z.infer<typeof AdminEntitlementRequest>;

export const AdminEntitlementResponse = z.object({
  user_id: z.string(),
  subscription: SubscriptionBlock,
  entitlements: z.record(z.string(), z.unknown()),
  plain: z.string(),
});
export type AdminEntitlementResponse = z.infer<typeof AdminEntitlementResponse>;

/* ---- audit -------------------------------------------------------- */

export const AdminAuditRow = z.object({
  id: z.string(),
  actor_user_id: z.string().nullable(),
  actor_name: z.string().nullable(),
  action: z.string(),
  target_kind: z.string().nullable(),
  target_id: z.string().nullable(),
  reason: z.string().nullable(),
  request_id: z.string().nullable(),
  ip: z.string().nullable(),
  created_at: z.string(),
  plain: z.string(),
});
export type AdminAuditRow = z.infer<typeof AdminAuditRow>;

export const AdminAuditQuery = z.object({
  actor_user_id: z.string().uuid().optional(),
  action: z.string().max(80).optional(),
  target_kind: z.string().max(40).optional(),
  target_id: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});
export type AdminAuditQuery = z.infer<typeof AdminAuditQuery>;

export const AdminAuditResponse = z.object({
  entries: z.array(AdminAuditRow),
  next_cursor: z.string().nullable(),
  plain: z.string(),
});
export type AdminAuditResponse = z.infer<typeof AdminAuditResponse>;

/* ---- sources and sync --------------------------------------------- */

export const AdminSyncResponse = z.object({
  sources: z.array(AdminSourceState),
  plain: z.string(),
});
export type AdminSyncResponse = z.infer<typeof AdminSyncResponse>;

export const AdminSyncRunRequest = z.object({
  source: SyncSourceName,
  /** Report what it WOULD change, and write nothing (brief §5). */
  dry_run: z.boolean().default(false),
});
export type AdminSyncRunRequest = z.infer<typeof AdminSyncRunRequest>;

export const AdminSyncRunResponse = z.object({
  run: AdminSyncRun.nullable(),
  source: AdminSourceState,
  plain: z.string(),
});
export type AdminSyncRunResponse = z.infer<typeof AdminSyncRunResponse>;

/** The internal driver, same body as the admin button. */
export const InternalCrmSyncRequest = z.object({
  source: SyncSourceName.default('app'),
  dry_run: z.boolean().default(false),
});
export type InternalCrmSyncRequest = z.infer<typeof InternalCrmSyncRequest>;

export const InternalCrmSyncResponse = z.object({
  runs: z.array(AdminSyncRun),
  plain: z.string(),
});
export type InternalCrmSyncResponse = z.infer<typeof InternalCrmSyncResponse>;

/* ---- segments ----------------------------------------------------- */

export const AdminSegmentFilter = z.object({
  status: CrmStatus.optional(),
  tier: z.string().max(60).optional(),
  source: z.string().max(60).optional(),
  tag: z.string().max(60).optional(),
  q: z.string().max(120).optional(),
});
export type AdminSegmentFilter = z.infer<typeof AdminSegmentFilter>;

export const AdminSegmentRow = z.object({
  id: z.string(),
  name: z.string(),
  filter: AdminSegmentFilter,
  created_by: z.string().nullable(),
  created_at: z.string(),
  /** Keys in the stored filter the API does not know about — ignored, not run. */
  ignored_keys: z.array(z.string()),
});
export type AdminSegmentRow = z.infer<typeof AdminSegmentRow>;

export const AdminSegmentsResponse = z.object({
  segments: z.array(AdminSegmentRow),
  plain: z.string(),
});
export type AdminSegmentsResponse = z.infer<typeof AdminSegmentsResponse>;

export const AdminCreateSegmentRequest = z.object({
  name: z.string().min(1).max(80),
  filter: AdminSegmentFilter,
});
export type AdminCreateSegmentRequest = z.infer<typeof AdminCreateSegmentRequest>;

export const AdminSegmentResponse = z.object({
  segment: AdminSegmentRow,
  plain: z.string(),
});
export type AdminSegmentResponse = z.infer<typeof AdminSegmentResponse>;

/* ---- /me learns about staff --------------------------------------- */

/**
 * THE UI HIDES ITSELF AS A COURTESY, NOT AS A CONTROL (brief §3). This block is
 * what the Account tab reads to decide whether to draw the operator's row. It
 * is re-derived from `staff_members` on every `/me`, so a revoked role is gone
 * from the next screen the user opens — and it grants nothing: every admin byte
 * still comes from a `staffed()` route that checks the same table again.
 */
export const MeStaffBlock = z.object({
  is_staff: z.boolean(),
  role: StaffRole.nullable(),
  plain: z.string(),
});
export type MeStaffBlock = z.infer<typeof MeStaffBlock>;

export const MeRound6Response = MeRound4Response.extend({
  staff: MeStaffBlock,
});
export type MeRound6Response = z.infer<typeof MeRound6Response>;
