/**
 * Circles — time-boxed setup rooms (round-4 brief §8; `rooms.type='setup'` with
 * `expires_at`).
 *
 * A circle is a room with a clock. It is opened automatically for a ready A–B
 * setup, or by a member with the `circles_create` entitlement, and it closes
 * itself at expiry. The ring on the Community board is that clock.
 */
export type Circle = {
  id: string;
  symbol: string;
  /** "META Breakout" — the room's own name. */
  name: string;
  pattern: string | null;
  /** "2d left" / "8h left" — computed from expires_at, never a raw timestamp. */
  time_left_plain: string;
  /** 0–1, how much of the circle's life is spent. Drives the ring. */
  progress: number;
  expires_at: string | null;
  members: number;
  unread: number;
  /** setups.id the circle was opened for, when there is one. */
  setup_id: string | null;
  grade_display: string | null;
  last_activity_plain: string | null;
  closed: boolean;
};

export type CircleTtl = '24h' | '3d' | '7d';

export const TTL_OPTIONS: { key: CircleTtl; label: string; plain: string }[] = [
  { key: '24h', label: '24 hours', plain: 'Closes tomorrow.' },
  { key: '3d', label: '3 days', plain: 'Closes in three days.' },
  { key: '7d', label: '7 days', plain: 'Closes in a week.' },
];

/** One member/Kai message inside a circle. */
export type CircleMessage = {
  id: string;
  author: string;
  initial: string;
  role: string | null;
  at: string | null;
  body: string;
  is_kai: boolean;
  /** Kai's verification object, when the message IS one. */
  verification: { title: string; result_plain: string; body: string } | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
};

export type CircleDetail = {
  circle: Circle;
  /**
   * A circle you are not in. `/rooms/:id/join` refuses setup rooms by design —
   * membership comes from opening the setup the circle belongs to — so the room
   * says so instead of showing an empty thread.
   */
  locked: { plain: string } | null;
  /** the live levels drawn at the top of the room */
  levels: { label: string; price: number; kind: 'entry' | 'stop' | 'target' | 'trigger' }[];
  quote: { price: number | null; change_pct: number | null; freshness: string } | null;
  watching: number | null;
  kai_read: string | null;
  messages: CircleMessage[];
};
