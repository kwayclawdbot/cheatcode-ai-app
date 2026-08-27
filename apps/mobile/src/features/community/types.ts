/**
 * Community view-model types (lane MOBILE-B).
 *
 * `packages/shared/api.ts` had no community schemas when this lane ran, so the
 * shapes below are the reconciliation point: `community-api.ts` maps whatever
 * the API returns onto these, and nothing else in the feature knows the wire
 * format. Enum values follow the Postgres enums in
 * supabase/migrations/0001_extensions_enums.sql.
 */

export type RoomType = 'core' | 'setup' | 'announcement';
export type MemberRole = 'member' | 'moderator' | 'educator' | 'expert';
export type MessageKind = 'text' | 'chart' | 'voice_note' | 'kai_object' | 'position_update' | 'system';

/** 01 §10 rooms.pinned — Kai briefing, warnings, moderator notes. */
export type PinnedItem = {
  kind: 'kai' | 'moderator' | 'warning' | 'session';
  text: string;
};

/** The setup a `type:'setup'` room is attached to (08 §4). */
export type RoomSetup = {
  id: string;
  symbol: string;
  grade_display: string | null;
  state: string;
  entry: string | null;
  target: string | null;
  invalid: string | null;
  /** delayed/live/stale/closed — a price never renders without it. */
  freshness: 'live' | 'delayed' | 'stale' | 'closed' | 'unknown';
  price: string | null;
  change_pct: string | null;
  headline: string | null;
};

export type Room = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  mode: string | null;
  type: RoomType;
  /** Members with the room joined. Never a leaderboard number. */
  member_count: number | null;
  /** Distinct posters in the current window — "28 discussing". */
  discussing_count: number | null;
  /** messages.seq beyond room_members.last_read_seq. */
  unread: number;
  last_read_seq: number;
  joined: boolean;
  muted_until: string | null;
  config: { slow_mode_s?: number; posting_restricted?: boolean; intel_eligible?: boolean };
  pinned: PinnedItem[];
  /** setups.id when this is a setup room — the screen resolves the object. */
  setup_id: string | null;
  setup: RoomSetup | null;
  /** "Kai: volume confirmed 1.6×" / "Jordan: catalyst thread updated" */
  preview: { who: string | null; text: string; by_kai: boolean } | null;
};

export type Author = {
  user_id: string;
  display_name: string;
  handle: string | null;
  initial: string;
  role_labels: string[];
  is_kai: boolean;
};

/** 08 §10 — required on structured trade-idea posts. */
export type PositionDisclosure = {
  holds: boolean;
  symbol: string | null;
  /** "Holds META" / "No position" */
  label: string;
};

export type StructuredIdea = {
  direction_thesis: string;
  entry_condition: string;
  invalidation: string;
  risk_size: string;
  target_horizon: string;
  evidence: string[];
};

export const STRUCTURED_FIELDS: {
  key: keyof Omit<StructuredIdea, 'evidence'>;
  label: string;
  placeholder: string;
}[] = [
  { key: 'direction_thesis', label: 'Direction & thesis', placeholder: 'What you expect and why…' },
  { key: 'entry_condition', label: 'Entry condition', placeholder: 'What must happen before this is actionable…' },
  { key: 'invalidation', label: 'Invalidation', placeholder: 'What would prove you wrong…' },
  { key: 'risk_size', label: 'Risk & size', placeholder: 'What is at risk at your planned size…' },
  { key: 'target_horizon', label: 'Target & horizon', placeholder: 'Where you expect price to go, and by when…' },
];

/* ------------------------------------------------------------------ */
/* Kai objects rendered IN a room — objects, never text walls (08 §5)  */
/* ------------------------------------------------------------------ */

export type KaiRoomObject =
  | {
      type: 'room_summary';
      title: string;
      window_label: string;
      /** Present when Kai framed the window as two cases; often null live. */
      bull_case: string;
      bear_case: string;
      /** Sentiment is a sample, never evidence — rendered colour-free. */
      sentiment: { bull_pct: number; sample: number } | null;
      take: string | null;
      grade_display: string | null;
      themes: string[];
      /** Claims carry their own verification state (08 §10). */
      claims: { claim: string; verified: KaiVerificationResult; plain: string }[];
      disagreements: string[];
      assets: string[];
      missed: string[];
      footnote: string;
    }
  | {
      type: 'verification_card';
      title: string;
      claim: string;
      /** Postgres `verification_result`. */
      result: 'verified' | 'partially_verified' | 'unverified' | 'false' | 'unverifiable';
      result_label: string;
      detail: string;
      sources: { label: string; at: string | null }[];
      as_of: string | null;
      uncertainty: string | null;
      effect_on_setup: string | null;
      /** The member message this verifies, if any. */
      message_id: string | null;
    }
  | {
      type: 'alert_preview';
      title: string;
      natural_language: string;
      condition_lines: string[];
      data_dependency: string;
      frequency: string;
      expires_label: string;
      summary_plain: string;
      /** Alerts do not evaluate until the market-data worker ships. */
      monitoring_note: string | null;
    }
  | {
      type: 'comparison';
      title: string;
      bull: string[];
      bear: string[];
      bull_plain: string | null;
      bear_plain: string | null;
      conclusion: string;
      footnote: string;
    }
  | {
      type: 'explain';
      title: string;
      lines: { label: string | null; text: string }[];
      footnote: string | null;
    };

export type RoomMessage = {
  id: string;
  seq: number;
  kind: MessageKind;
  created_at: string;
  /** "Today at 9:41" */
  time_label: string;
  author: Author;
  body: string | null;
  refs: Record<string, unknown> | null;
  structured_idea: StructuredIdea | null;
  position_disclosure: PositionDisclosure | null;
  kai_object: KaiRoomObject | null;
  deleted: boolean;
  /**
   * A market claim from a member. Renders "Unverified" until a
   * verification_card in the room names this message id (08 §10).
   */
  is_claim: boolean;
  /** Filled in by the room screen from the verification cards present. */
  verified_by?: { result: KaiVerificationResult; label: string } | null;
  reactions: { label: string; count: number; tone: 'neutral' | 'kai' | 'market' }[];
};

export type KaiVerificationResult = 'verified' | 'partially_verified' | 'unverified' | 'false' | 'unverifiable';

export type KaiCommand = 'summarize' | 'verify' | 'to_alert' | 'compare' | 'explain' | 'mark_levels';

export const KAI_COMMANDS: {
  id: KaiCommand;
  label: string;
  hint: string;
  /** true = the sheet needs a message selected first. */
  needs_message: boolean;
}[] = [
  { id: 'summarize', label: 'Summarise since I left', hint: 'Themes, claims, disagreements — with timestamps.', needs_message: false },
  { id: 'verify', label: 'Verify this claim', hint: 'Pick a message first. Kai checks it against market data.', needs_message: true },
  { id: 'mark_levels', label: 'Mark the levels people mention', hint: 'The prices this room keeps coming back to.', needs_message: false },
  { id: 'to_alert', label: 'Turn this into an alert', hint: 'Pick a message. You still approve before it arms.', needs_message: true },
  { id: 'compare', label: 'Compare bull vs bear', hint: 'Both sides of the argument, side by side.', needs_message: false },
  { id: 'explain', label: 'Explain this to a beginner', hint: 'Plain English, no jargon.', needs_message: false },
];

export type ContributorProfile = {
  user_id: string;
  display_name: string;
  handle: string | null;
  initial: string;
  role_labels: string[];
  verified_identity: boolean;
  /** Contribution history — counts, never a rank (08 §8). */
  history: { label: string; value: string }[];
  feedback: { label: string; score: number; out_of: number }[];
  feedback_note: string;
  /** Disclosures on recent posts. */
  recent: { id: string; room_name: string; time_label: string; body: string; disclosure: PositionDisclosure | null }[];
  muted: boolean;
};
