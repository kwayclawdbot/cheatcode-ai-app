/**
 * Community view-model types (lane MOBILE-B).
 *
 * `packages/shared/api.ts` had no community schemas when this lane ran, so the
 * shapes below are the reconciliation point: `community-api.ts` maps whatever
 * the API returns onto these, and nothing else in the feature knows the wire
 * format. Enum values follow the Postgres enums in
 * supabase/migrations/0001_extensions_enums.sql.
 */
import type { Belt, CommunityCall } from '../../lib/types';

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
  /** The username, shown as `@handle`. Null when they have not picked one. */
  handle: string | null;
  /** Null on every account until the media lane's avatar upload lands. */
  avatar_url: string | null;
  initial: string;
  role_labels: string[];
  is_kai: boolean;
  /**
   * The rung this member is on, which is what colours their name.
   *
   * OPTIONAL ON PURPOSE, and the absence is meaningful: a message that arrives
   * from a server that does not yet send the field renders the name in the
   * house ivory — the colour it has always been — rather than in white belt's
   * ivory, which happens to look identical but would be a claim about their
   * rank that nobody made. Kai has no belt and never will; neither does a
   * deleted author.
   */
  belt?: Belt | null;
  /**
   * The author deleted their account. `user_id` is null on these rows and
   * WITHOUT this flag that null reads as "posted by Kai" (migration 0010's
   * meaning, still true for Kai's own posts). A surface must check this before
   * it falls back to Kai — re-attributing a stranger's posts to the assistant
   * is a fabricated record.
   */
  author_deleted: boolean;
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
  /** The room it was posted in. Needed to post a comment back into it. */
  room_id: string | null;
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
  /**
   * The member's call this message carries, resolved by the server from
   * `refs.community_call_id`.
   *
   * IT SITS BESIDE `kai_object` BECAUSE IT IS THE SAME SPECIES OF THING: a
   * first-class object carried by an otherwise ordinary `text` message. When it
   * is present the room draws the volt COMMUNITY TRADE card instead of the
   * body, and because the call arrives as a real message with a real `seq`, the
   * five-second `after_seq` poll already delivers it — there is no second
   * realtime stack anywhere in this feature.
   */
  community_call: CommunityCall | null;
  deleted: boolean;
  /**
   * A market claim from a member. Renders "Unverified" until a
   * verification_card in the room names this message id (08 §10).
   */
  is_claim: boolean;
  /** Filled in by the room screen from the verification cards present. */
  verified_by?: { result: KaiVerificationResult; label: string } | null;
  reactions: MessageReactions;
  /** How many comments this post has. Always 0 on a comment. */
  reply_count: number;
  /** The post this is a comment on, when it is one. */
  parent_id: string | null;
  /**
   * The post this one was written against, drawn as a quote block above the
   * body. Usually the parent, but not always — a comment can quote a SIBLING
   * comment, which is how "replying to @name" works without a second level of
   * nesting existing anywhere.
   */
  quote: MessageQuote | null;
  /** Pictures attached to it, in the order they were picked. */
  media: MessageMedia[];
  /**
   * The author closed their account. `user_id` is null on those rows and
   * without this the null reads as "posted by Kai". Anything that draws an
   * author has to check this first.
   */
  author_deleted: boolean;
};

/* ------------------------------------------------------------------ */
/* Reactions and media                                                  */
/* ------------------------------------------------------------------ */

/**
 * `watching` and `useful` are LEGACY. They were two of the original four and
 * rows carrying them are still in `message_reactions`, so they stay in the type
 * and stay renderable — but the picker no longer offers them (see REACTIONS).
 */
export type ReactionKind =
  | 'agree' | 'disagree' | 'fire' | 'hundred' | 'chart_up' | 'chart_down'
  | 'watching' | 'useful';

export type MessageReactions = {
  /** {kind: count}. A kind nobody used is absent, not present at zero. */
  counts: Partial<Record<ReactionKind, number>>;
  /** The kinds THIS person has given. Never guessed from the counts. */
  mine: ReactionKind[];
};

export type ReactionDef = {
  id: ReactionKind;
  /** What is actually drawn. One glyph, no image, no font to load. */
  emoji: string;
  /** The word a screen reader says, and the word the picker labels it with. */
  label: string;
  /** What tapping it means, used as the accessibility hint. */
  plain: string;
  tone: 'user' | 'market' | 'neutral';
};

/**
 * SIX, PICKED BY THE OWNER, AND `disagree` STILL EARNS ITS PLACE. A room where
 * the only cheap gesture is approval reads as unanimous whether or not it is,
 * and in a room about money that is how a bad idea gets amplified. Thumbs down
 * keeps dissent exactly as cheap as agreement.
 *
 * These are the SAME reactions the old four were — a row per person per kind in
 * `message_reactions` — drawn as a glyph instead of a word. `agree` and
 * `disagree` keep their stored names (👍 and 👎 are what those words always
 * meant), so every reaction anybody has already given still counts.
 *
 * Tones follow the app's colour law and nothing else: volt is the USER, cyan is
 * the MARKET. A reaction is the user's own act, so four of them are volt; the
 * two chart ones say something about where an INSTRUMENT is going rather than
 * about the post, which is the same reasoning that made `watching` cyan. Violet
 * is Kai's and appears nowhere here — Kai does not react to anybody.
 */
export const REACTIONS: ReactionDef[] = [
  { id: 'agree',      emoji: '👍', label: 'Agree',      plain: 'You think this is right.',              tone: 'user' },
  { id: 'disagree',   emoji: '👎', label: 'Disagree',   plain: 'You think this is wrong.',              tone: 'user' },
  { id: 'fire',       emoji: '🔥', label: 'Fire',       plain: 'This one stands out.',                  tone: 'user' },
  { id: 'hundred',    emoji: '💯', label: 'Nailed it',  plain: 'Completely right, in your view.',       tone: 'user' },
  { id: 'chart_up',   emoji: '📈', label: 'Going up',   plain: 'You read this as bullish.',             tone: 'market' },
  { id: 'chart_down', emoji: '📉', label: 'Going down', plain: 'You read this as bearish.',             tone: 'market' },
];

/**
 * Kinds nobody can give any more, but which people already gave.
 *
 * A count that exists is drawn. Dropping them would silently delete other
 * members' reactions from the screen while they stayed in the table, which is
 * the kind of quiet lie this app does not tell.
 */
export const LEGACY_REACTIONS: ReactionDef[] = [
  { id: 'watching', emoji: '👀', label: 'Watching', plain: 'Somebody put this on their list.',    tone: 'market' },
  { id: 'useful',   emoji: '🙌', label: 'Useful',   plain: 'Somebody found this helpful.',        tone: 'neutral' },
];

export const ALL_REACTIONS: ReactionDef[] = [...REACTIONS, ...LEGACY_REACTIONS];

export const reactionDef = (kind: ReactionKind): ReactionDef | null =>
  ALL_REACTIONS.find((r) => r.id === kind) ?? null;

export const EMPTY_REACTIONS: MessageReactions = { counts: {}, mine: [] };

/* ------------------------------------------------------------------ */
/* Quoting                                                              */
/* ------------------------------------------------------------------ */

/**
 * The post a reply was written against, carried ON the reply.
 *
 * It is a SNAPSHOT of who and what, not a live join: the quote has to stay
 * readable when the original is scrolled off, in another room, or removed. The
 * `message_id` is the durable handle for tapping through; everything else is
 * what to draw when you cannot reach it.
 *
 * `deleted` is the one state that matters most. A quote of a post a moderator
 * took down must say so rather than keep repeating the words that were removed
 * — otherwise deleting a post would leave copies of it all over the room.
 */
export type MessageQuote = {
  message_id: string;
  author_name: string;
  handle: string | null;
  /** Trimmed at the edge, with an ellipsis. Never the whole essay. */
  text: string;
  deleted: boolean;
};

/** How much of a quoted post is worth showing before it is just noise. */
export const QUOTE_MAX_CHARS = 180;

export function trimQuote(text: string | null | undefined, max = QUOTE_MAX_CHARS): string {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  // Cut at the last word boundary inside the budget so the tail is not a
  // half-word — "the confirmati…" reads as a bug, "the…" reads as a trim.
  const cut = flat.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/**
 * A picture on a message.
 *
 * `url` IS TEMPORARY. The bucket is private, so this is a signature minted for
 * this person after the server checked they are in the room, and it expires. It
 * must never be stored as if it were an address, and it stops resolving the
 * moment a moderator removes the picture — which is the behaviour the whole
 * design is built on. `id` is the durable handle.
 *
 * `aspect` is height ÷ width, so the space can be reserved before the bytes
 * land instead of shoving the conversation down the screen when they do.
 */
export type MessageMedia = {
  id: string;
  url: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  bytes: number;
  aspect: number | null;
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
