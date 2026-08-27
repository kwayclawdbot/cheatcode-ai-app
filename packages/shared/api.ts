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

export const Quote = z.object({
  symbol: z.string(),
  occ_symbol: z.string().nullable().optional(),
  price: z.number().nullable(),
  source_ts: z.string().nullable(),
  received_ts: z.string().nullable(),
  freshness: Freshness,
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
