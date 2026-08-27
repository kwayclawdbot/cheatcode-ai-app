/**
 * Community + debrief API client (lane MOBILE-B).
 *
 * `src/lib/api.ts` belongs to lane MOBILE-A and does not export its request
 * helper, so this file carries its own — same auth header, same error envelope,
 * same plain-English failures.
 *
 * The API-2 endpoints are being built in parallel. Every call here is written
 * against docs/BUILD-BRIEF-round-2.md §"API-2 endpoints" and degrades in three
 * honest steps:
 *   1. real endpoint
 *   2. direct Supabase read under RLS where 00 §4 allows a client read
 *   3. fixtures (EXPO_PUBLIC_FIXTURES=1 or nothing else is reachable)
 * `source` on each result says which one you are looking at, and the screens
 * surface it rather than pretending.
 */
import { env, offlineMode } from './env';
import { supabase } from './supabase';
import { getAccessToken, recoverSession, SESSION_EXPIRED_COPY } from './auth-token';
import type {
  ContributorProfile, KaiCommand, KaiRoomObject, PositionDisclosure, Room,
  RoomMessage, RoomSetup, StructuredIdea,
} from '../features/community/types';
import {
  fixtureAssist, fixtureContributor, fixtureMessages, fixtureRooms,
} from '../features/community/fixtures';
import type { ClosedPosition, Debrief } from '../features/debrief/types';
import { fixtureClosedPositions, fixtureDebriefs } from '../features/debrief/fixtures';

export class CommunityApiError extends Error {
  code: string;
  constructor(code: string, messagePlain: string) {
    super(messagePlain);
    this.code = code;
  }
}

export type Source = 'api' | 'supabase' | 'fixtures';

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const t = await getAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  if (!env.hasApi) throw new CommunityApiError('NO_API', 'The service is not connected yet.');
  const res = await fetch(`${env.apiBase}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (res.status === 401 && !retried && supabase) {
    const fresh = await recoverSession();
    if (fresh) return request<T>(path, init, true);
    throw new CommunityApiError('UNAUTHENTICATED', SESSION_EXPIRED_COPY);
  }
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new CommunityApiError(
      err.code ?? (res.status === 404 ? 'NOT_FOUND' : 'INTERNAL'),
      err.message_plain ?? 'Something went wrong. Please try again.',
    );
  }
  return json as T;
}

const live = () => !offlineMode && env.hasApi;

/* ------------------------------------------------------------------ */
/* Small formatters                                                     */
/* ------------------------------------------------------------------ */

const two = (n: number) => String(n).padStart(2, '0');

export function timeLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today at ${hm}`;
  const yest = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === yest.toDateString()) return `Yesterday at ${hm}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${hm}`;
}

export function relativeLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const initialOf = (name: string | null | undefined) =>
  (name ?? '?').trim().charAt(0).toUpperCase() || '?';

const asNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

const price = (v: unknown): string | null => {
  const n = asNum(v);
  return n == null ? null : n.toFixed(2);
};

const level = (v: unknown): string | null => {
  const n = asNum(v);
  return n == null ? null : String(Number.isInteger(n) ? n : Number(n.toFixed(2)));
};

const FRESH = ['live', 'delayed', 'stale', 'closed'] as const;
const freshnessOf = (v: unknown): RoomSetup['freshness'] =>
  (FRESH as readonly string[]).includes(String(v)) ? (v as RoomSetup['freshness']) : 'unknown';

/* ------------------------------------------------------------------ */
/* Mappers — wire shape (unknown until API-2 lands) -> view model       */
/* ------------------------------------------------------------------ */

function mapSetup(raw: any): RoomSetup | null {
  if (!raw) return null;
  const q = raw.quote ?? raw.quote_snapshot ?? {};
  const targets = Array.isArray(raw.targets) ? raw.targets : [];
  const firstTarget = targets.length ? (typeof targets[0] === 'object' ? targets[0].price : targets[0]) : null;
  return {
    id: String(raw.id ?? raw.setup_id ?? ''),
    symbol: String(raw.symbol ?? ''),
    grade_display: raw.grade_display ?? null,
    state: String(raw.state ?? 'watching'),
    entry: level(raw.entry ?? raw.entry_condition?.level),
    target: level(firstTarget),
    invalid: level(raw.stop ?? raw.invalidation?.level),
    freshness: freshnessOf(q.freshness),
    price: price(q.price),
    change_pct: raw.change_pct != null ? `${asNum(raw.change_pct)! >= 0 ? '+' : ''}${asNum(raw.change_pct)!.toFixed(2)}%` : null,
    headline: raw.thesis_plain ?? raw.headline ?? null,
  };
}

function mapRoom(raw: any): Room {
  const config = raw.config ?? {};
  const pinnedRaw = Array.isArray(raw.pinned) ? raw.pinned : [];
  return {
    id: String(raw.id),
    slug: String(raw.slug ?? raw.name ?? raw.id),
    name: String(raw.name ?? raw.slug ?? 'Room'),
    description: raw.description ?? null,
    mode: raw.mode ?? null,
    type: raw.type === 'setup' || raw.type === 'announcement' ? raw.type : 'core',
    member_count: asNum(raw.member_count ?? raw.members),
    discussing_count: asNum(raw.discussing_count ?? raw.active_count ?? raw.message_count),
    setup_id: raw.setup_id ?? raw.setup?.id ?? null,
    unread: asNum(raw.unread) ?? 0,
    last_read_seq: asNum(raw.last_read_seq) ?? 0,
    joined: raw.joined === true || raw.is_member === true,
    muted_until: raw.muted_until ?? null,
    config: {
      slow_mode_s: asNum(config.slow_mode_s) ?? undefined,
      posting_restricted: config.posting_restricted === true,
      intel_eligible: config.intel_eligible === true,
    },
    pinned: pinnedRaw.map((p: any) =>
      typeof p === 'string'
        ? { kind: 'moderator' as const, text: p }
        : { kind: (p.kind ?? 'kai') as 'kai' | 'moderator' | 'warning' | 'session', text: String(p.text ?? p.body ?? '') },
    ).filter((p: any) => p.text),
    setup: mapSetup(raw.setup),
    preview: raw.preview
      ? { who: raw.preview.who ?? null, text: String(raw.preview.text ?? ''), by_kai: raw.preview.by_kai === true }
      : null,
  };
}

function mapDisclosure(raw: any): PositionDisclosure | null {
  if (!raw) return null;
  const holds = raw.holds === true || raw.has_position === true;
  const symbol = raw.symbol ?? null;
  return {
    holds,
    symbol,
    label: raw.label ?? raw.plain ?? (holds ? `Holds ${symbol ?? 'a position'}` : 'No position'),
  };
}

/**
 * The API's StructuredIdea (packages/shared/api.ts) splits direction from
 * thesis and keeps evidence as one string; the composer edits one field per
 * question. Both directions of that translation live here.
 */
function mapStructured(raw: any): StructuredIdea | null {
  if (!raw) return null;
  const direction = raw.direction === 'long' || raw.direction === 'short' ? raw.direction : null;
  const thesis = raw.thesis ?? raw.direction_thesis ?? '';
  return {
    direction_thesis: direction && !String(thesis).toLowerCase().startsWith(direction)
      ? `${direction === 'long' ? 'Long' : 'Short'} — ${thesis}`
      : String(thesis),
    entry_condition: String(raw.entry_condition ?? ''),
    invalidation: String(raw.invalidation ?? ''),
    risk_size: String(raw.risk_and_size ?? raw.risk_size ?? raw.risk ?? ''),
    target_horizon: String(raw.target_and_horizon ?? raw.target_horizon ?? raw.target ?? ''),
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.map(String)
      : raw.evidence ? String(raw.evidence).split(' · ').filter(Boolean) : [],
  };
}

/** Composer draft -> the wire shape POST /rooms/:id/messages validates. */
function toWireIdea(idea: StructuredIdea, symbol: string | null) {
  const text = idea.direction_thesis;
  const direction: 'long' | 'short' = /\bshort\b/i.test(text) ? 'short' : 'long';
  return {
    direction,
    thesis: text,
    entry_condition: idea.entry_condition || null,
    invalidation: idea.invalidation || null,
    risk_and_size: idea.risk_size || null,
    target_and_horizon: idea.target_horizon || null,
    evidence: idea.evidence.length ? idea.evidence.join(' · ') : null,
    symbol,
  };
}

const RESULT_LABEL: Record<string, string> = {
  verified: 'Confirmed',
  partially_verified: 'Partly confirmed',
  unverified: 'Not verified',
  false: 'Not true',
  unverifiable: "Can't be checked",
};

/** Kai object envelope (02 §7) -> the object the room draws. */
export function mapKaiObject(raw: any): KaiRoomObject | null {
  if (!raw) return null;
  const type = raw.type ?? raw.kind;
  const p = raw.payload ?? raw;
  switch (type) {
    case 'room_summary': {
      const sample = asNum(p.sample_size);
      return {
        type: 'room_summary',
        title: p.title ?? "Kai's room summary",
        window_label: p.window_label ?? relativeLabel(raw.created_at) ?? '',
        bull_case: String(p.bull_case ?? p.bull ?? ''),
        bear_case: String(p.bear_case ?? p.bear ?? ''),
        // The API's room_summary carries no sentiment split — community
        // sentiment lives in community_signals (v1.2). No split, no bar.
        sentiment:
          p.sentiment && asNum(p.sentiment.bull_pct ?? p.sentiment.bullish_pct) != null
            ? { bull_pct: Math.round(asNum(p.sentiment.bull_pct ?? p.sentiment.bullish_pct)!), sample: asNum(p.sentiment.sample ?? p.sentiment.sample_size) ?? 0 }
            : null,
        take: p.take ?? p.kai_take ?? p.kai_conclusion_plain ?? null,
        grade_display: p.grade_display ?? null,
        themes: Array.isArray(p.themes)
          ? p.themes.map((t: any) => (typeof t === 'string' ? t : [t.label, t.plain].filter(Boolean).join(' — ')))
          : [],
        claims: Array.isArray(p.claims)
          ? p.claims.map((c: any) => ({
              claim: String(c.claim ?? ''),
              verified: RESULT_LABEL[c.verified] ? c.verified : 'unverified',
              plain: String(c.plain ?? ''),
            }))
          : [],
        disagreements: Array.isArray(p.disagreements) ? p.disagreements.map(String) : [],
        assets: Array.isArray(p.assets) ? p.assets.map(String) : [],
        missed: Array.isArray(p.missed ?? p.missed_updates) ? (p.missed ?? p.missed_updates).map(String) : [],
        footnote: p.confidence_limits ?? p.footnote ?? (sample != null ? `Sample ${sample} · sentiment never changes the grade` : 'Sentiment never changes the grade.'),
      };
    }
    case 'verification_card':
      return {
        type: 'verification_card',
        title: p.title ?? 'Kai · Verification',
        claim: String(p.claim ?? ''),
        result: (RESULT_LABEL[p.result] ? p.result : 'unverified'),
        result_label: RESULT_LABEL[p.result] ?? 'Not verified',
        detail: String(p.detail ?? p.summary_plain ?? p.plain ?? ''),
        sources: Array.isArray(p.sources)
          ? p.sources.map((s: any) => (typeof s === 'string'
              ? { label: s, at: null }
              : { label: String(s.label ?? s.name ?? 'Source'), at: s.at ?? s.ts ?? s.timestamp ?? null }))
          : [],
        as_of: p.as_of ?? p.timestamp ?? null,
        uncertainty: p.uncertainty ?? null,
        effect_on_setup: p.effect_on_setup ?? null,
        message_id: p.message_id ?? raw.refs?.message_id ?? null,
      };
    case 'alert_preview':
      return {
        type: 'alert_preview',
        title: p.title ?? 'Alert preview',
        natural_language: String(p.natural_language ?? ''),
        condition_lines: Array.isArray(p.condition?.atoms)
          ? p.condition.atoms.map((a: any) =>
              [a.symbol, a.atom?.replace(/_/g, ' '), a.operator?.replace(/_/g, ' '), a.value].filter(Boolean).join(' '))
          : Array.isArray(p.condition_lines) ? p.condition_lines.map(String) : [],
        data_dependency: Array.isArray(p.data_dependency?.symbols)
          ? `${p.data_dependency.symbols.join(', ')} · ${(p.data_dependency.feeds ?? []).join(', ') || 'market data'}`
          : String(p.data_dependency ?? 'market data'),
        frequency: String(p.frequency ?? 'once'),
        expires_label: p.expires_at ? `Expires ${timeLabel(p.expires_at)}` : 'No expiry set',
        summary_plain: String(p.summary_plain ?? ''),
        monitoring_note: p.monitoring === 'armed_no_feed'
          ? 'Armed · live evaluation starts when market data goes live.'
          : p.monitoring_note ?? null,
      };
    case 'comparison':
      return {
        type: 'comparison',
        title: p.title ?? (p.subject ? `Bull vs bear · ${p.subject}` : 'Bull vs bear'),
        bull: Array.isArray(p.bull) ? p.bull.map(String) : Array.isArray(p.bull?.points) ? p.bull.points.map(String) : [],
        bear: Array.isArray(p.bear) ? p.bear.map(String) : Array.isArray(p.bear?.points) ? p.bear.points.map(String) : [],
        bull_plain: typeof p.bull?.plain === 'string' ? p.bull.plain : null,
        bear_plain: typeof p.bear?.plain === 'string' ? p.bear.plain : null,
        conclusion: String(p.conclusion ?? p.kai_conclusion_plain ?? ''),
        footnote: p.confidence_limits ?? p.footnote ?? 'Counting posts is not evidence.',
      };
    case 'briefing':
    case 'explain':
      return {
        type: 'explain',
        title: p.title ?? p.headline ?? 'Explained for a beginner',
        lines: Array.isArray(p.lines)
          ? p.lines.map((l: any) => (typeof l === 'string' ? { label: null, text: l } : { label: l.label ?? null, text: String(l.text ?? '') }))
          : [],
        footnote: p.footnote ?? p.closing_plain ?? null,
      };
    default:
      return null;
  }
}

function mapMessage(raw: any, kaiObjects?: Record<string, any>): RoomMessage {
  const author = raw.author ?? raw.profile ?? null;
  const isKai = raw.user_id == null || raw.kind === 'kai_object';
  const objRaw = raw.kai_object ?? (raw.refs?.kai_object_id && kaiObjects ? kaiObjects[raw.refs.kai_object_id] : null);
  const structured = mapStructured(raw.structured_idea);
  const refs = raw.refs ?? null;
  return {
    id: String(raw.id),
    seq: asNum(raw.seq) ?? 0,
    kind: raw.kind ?? 'text',
    created_at: raw.created_at ?? new Date().toISOString(),
    time_label: timeLabel(raw.created_at),
    author: isKai
      ? { user_id: 'kai', display_name: 'Kai', handle: null, initial: 'K', role_labels: ['AI'], is_kai: true }
      : {
          user_id: String(raw.user_id ?? author?.user_id ?? ''),
          display_name: author?.display_name ?? author?.handle ?? 'Member',
          handle: author?.handle ?? null,
          initial: initialOf(author?.display_name ?? author?.handle),
          role_labels: Array.isArray(author?.role_labels) ? author.role_labels : [],
          is_kai: false,
        },
    body: raw.deleted ? null : raw.body ?? null,
    refs,
    structured_idea: structured,
    position_disclosure: mapDisclosure(raw.position_disclosure),
    kai_object: mapKaiObject(objRaw),
    deleted: raw.deleted === true || raw.deleted_at != null,
    is_claim:
      raw.flags?.claim === true ||
      structured != null ||
      (Array.isArray(refs?.levels) && refs.levels.length > 0),
    reactions: Array.isArray(raw.reactions)
      ? raw.reactions.map((r: any) => ({ label: String(r.label ?? r.count ?? ''), count: asNum(r.count) ?? 0, tone: r.tone ?? 'neutral' }))
      : [],
  };
}

/* ------------------------------------------------------------------ */
/* Rooms                                                                */
/* ------------------------------------------------------------------ */

export type RoomsResult = { rooms: Room[]; source: Source; note: string | null };

/** Direct Supabase read — 00 §4 allows the client to read rooms under RLS. */
async function roomsFromSupabase(): Promise<Room[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('rooms')
    .select('id, slug, name, description, mode, type, config, pinned, setup_id')
    .order('name');
  if (error || !data) return null;

  const rooms = (data as any[]).map(mapRoom);
  const setupIds = (data as any[]).map((r) => r.setup_id).filter(Boolean);
  if (setupIds.length) {
    const { data: setups } = await supabase
      .from('setups')
      .select('id, symbol, grade_display, state, entry_condition, invalidation, stop, targets, quote_snapshot, thesis_plain')
      .in('id', setupIds);
    const bySetup: Record<string, any> = {};
    for (const s of (setups as any[]) ?? []) bySetup[s.id] = s;
    for (let i = 0; i < rooms.length; i++) {
      const sid = (data as any[])[i].setup_id;
      if (sid && bySetup[sid]) {
        rooms[i].setup = mapSetup({ ...bySetup[sid], quote: bySetup[sid].quote_snapshot });
        rooms[i].type = 'setup';
      }
    }
  }
  return rooms;
}

export const communityApi = {
  available: live,

  async rooms(mode?: string): Promise<RoomsResult> {
    if (live()) {
      try {
        const r = await request<any>(`/rooms${mode ? `?mode=${mode}` : ''}`);
        const list = Array.isArray(r)
          ? r
          : [...(r.setup_rooms ?? []), ...(r.core ?? []), ...(r.rooms ?? [])];
        if (list.length) return { rooms: list.map(mapRoom), source: 'api', note: null };
      } catch {
        // GET /rooms may not exist yet — fall through to the direct read
      }
      const direct = await roomsFromSupabase();
      if (direct) return { rooms: direct, source: 'supabase', note: null };
    }
    return {
      rooms: fixtureRooms,
      source: 'fixtures',
      note: offlineMode ? null : 'Showing example rooms — the service is not reachable.',
    };
  },

  async join(roomId: string): Promise<boolean> {
    if (!live()) return true;
    try {
      await request(`/rooms/${roomId}/join`, { method: 'POST' });
      return true;
    } catch (e) {
      if (e instanceof CommunityApiError && e.code === 'NOT_FOUND') return false;
      throw e;
    }
  },

  async messages(
    roomId: string, afterSeq = 0, limit = 50,
  ): Promise<{ messages: RoomMessage[]; room: Room | null; catchUp: { count: number; plain: string } | null; source: Source }> {
    if (live()) {
      try {
        const r = await request<any>(`/rooms/${roomId}/messages?after_seq=${afterSeq}&limit=${limit}`);
        const list = Array.isArray(r) ? r : r.messages ?? [];
        const objects: Record<string, any> = {};
        for (const o of r.kai_objects ?? []) objects[o.id] = o;
        const room = r.room ? mapRoom(r.room) : null;
        if (room && r.catch_up) room.unread = asNum(r.catch_up.count) ?? room.unread;
        return {
          messages: list.map((m: any) => mapMessage(m, objects)).sort((a: RoomMessage, b: RoomMessage) => a.seq - b.seq),
          room,
          catchUp: r.catch_up ? { count: asNum(r.catch_up.count) ?? 0, plain: String(r.catch_up.plain ?? '') } : null,
          source: 'api',
        };
      } catch {
        /* fall through to fixtures */
      }
    }
    return {
      messages: afterSeq > 0 ? [] : fixtureMessages,
      room: null,
      catchUp: null,
      source: 'fixtures',
    };
  },

  /** Resolve the setup behind a setup room (rooms.setup_id -> GET /setups/:id). */
  async roomSetup(setupId: string): Promise<RoomSetup | null> {
    if (!live()) return null;
    try {
      const r = await request<any>(`/setups/${setupId}`);
      const s = r.setup ?? r;
      const live_ = s.live ?? {};
      const plan = s.plan ?? {};
      return mapSetup({
        id: s.id ?? setupId,
        symbol: s.symbol,
        grade_display: s.grade_display,
        state: live_.state ?? s.state,
        entry: plan.entry ?? s.entry,
        entry_condition: plan.entry_condition ?? s.entry_condition,
        invalidation: plan.invalidation ?? s.invalidation,
        stop: plan.stop ?? s.stop,
        targets: plan.targets ?? s.targets,
        quote: live_.quote ?? s.quote ?? s.quote_snapshot,
        thesis_plain: s.thesis_plain,
      });
    } catch {
      return null;
    }
  },

  async postMessage(
    roomId: string,
    payload: { kind?: 'text' | 'chart' | 'position_update'; body: string; refs?: Record<string, unknown>; structured_idea?: StructuredIdea; position_disclosure?: PositionDisclosure },
  ): Promise<RoomMessage> {
    if (live()) {
      const symbol = (payload.refs?.symbol as string | undefined) ?? payload.position_disclosure?.symbol ?? null;
      const r = await request<any>(`/rooms/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          kind: payload.kind ?? 'text',
          body: payload.body,
          refs: payload.refs,
          structured_idea: payload.structured_idea ? toWireIdea(payload.structured_idea, symbol) : undefined,
          position_disclosure: payload.position_disclosure
            ? {
                holds: payload.position_disclosure.holds,
                symbol: payload.position_disclosure.symbol,
                plain: payload.position_disclosure.label,
              }
            : undefined,
        }),
      });
      return mapMessage(r.message ?? r);
    }
    // Fixtures: echo locally so the composer has an honest result to show.
    const now = new Date().toISOString();
    return {
      id: `local-${Date.now()}`,
      seq: 0,
      kind: payload.kind ?? 'text',
      created_at: now,
      time_label: timeLabel(now),
      author: { user_id: 'me', display_name: 'You', handle: null, initial: 'Y', role_labels: [], is_kai: false },
      body: payload.body,
      refs: payload.refs ?? null,
      structured_idea: payload.structured_idea ?? null,
      position_disclosure: payload.position_disclosure ?? null,
      kai_object: null,
      deleted: false,
      is_claim: !!payload.structured_idea,
      reactions: [],
    };
  },

  /** Synchronous in this round — the API runs Kai inline and inserts the object. */
  async kai(roomId: string, command: KaiCommand, args?: Record<string, unknown>, messageId?: string): Promise<KaiRoomObject | null> {
    if (live()) {
      try {
        // The contract's optional fields are `.optional()`, not nullable —
        // sending an explicit null fails validation. Omit instead.
        const payload: Record<string, unknown> = { command };
        if (args && Object.keys(args).length) payload.args = args;
        if (messageId) payload.message_id = messageId;
        const r = await request<any>(`/rooms/${roomId}/kai`, { method: 'POST', body: JSON.stringify(payload) });
        return mapKaiObject(r.object ?? r.kai_object ?? r.message?.kai_object ?? r);
      } catch (e) {
        // `mark_levels` is in the community spec's command list (08 §5) but not
        // in the API's enum yet — say so plainly rather than inventing an
        // object. Any other validation failure keeps the API's own words.
        if (e instanceof CommunityApiError && e.code === 'VALIDATION_FAILED' && command === 'mark_levels') {
          throw new CommunityApiError('VALIDATION_FAILED', "Kai doesn't mark levels from a room yet. Nothing was posted.");
        }
        throw e;
      }
    }
    return null;
  },

  /**
   * Kai's improved draft. The round-2 brief hangs this off a message id, but
   * nothing is published before the explicit Post — so we send the DRAFT and
   * fall back to the room-scoped route, then to a local review in fixtures.
   */
  async structuredAssist(roomId: string, draft: StructuredIdea, messageId?: string): Promise<{ feedback: string; draft: StructuredIdea } | null> {
    if (live()) {
      const body = JSON.stringify({ structured_idea: toWireIdea(draft, null), room_id: roomId });
      // The API hangs assist off a POSTED message (`/messages/:id/...`), but
      // 08 §7 puts Kai's review BEFORE publication — so with no message yet we
      // ask the room-scoped route. If that is not there, we say so and leave
      // the member's words alone rather than posting to get a review.
      for (const path of [
        messageId ? `/messages/${messageId}/structured-assist` : `/rooms/${roomId}/structured-assist`,
      ]) {
        try {
          const r = await request<any>(path, { method: 'POST', body });
          const improved = mapStructured(r.improved ?? r.draft ?? r.structured_idea);
          if (improved) {
            const notes = Array.isArray(r.notes) ? r.notes.join(' ') : '';
            return { feedback: [r.plain, notes].filter(Boolean).join(' ') || 'Kai suggested a tighter draft.', draft: improved };
          }
        } catch (e) {
          if (!(e instanceof CommunityApiError) || e.code !== 'NOT_FOUND') throw e;
        }
      }
      return null;
    }
    return fixtureAssist;
  },

  async report(messageId: string, reason: string): Promise<void> {
    if (!live()) return;
    await request(`/messages/${messageId}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
  },

  async setMute(roomId: string, muted: boolean): Promise<void> {
    if (!live()) return;
    await request(`/rooms/${roomId}/${muted ? 'mute' : 'unmute'}`, { method: 'POST', body: JSON.stringify({}) });
  },

  async contributor(userId: string): Promise<{ profile: ContributorProfile; source: Source }> {
    if (live()) {
      try {
        const r = await request<any>(`/contributors/${userId}`);
        const p = r.profile ?? r;
        const stats = r.contribution ?? r.stats ?? p.stats ?? {};
        const pct = (v: unknown) => (asNum(v) == null ? null : `${Math.round(asNum(v)! <= 1 ? asNum(v)! * 100 : asNum(v)!)}%`);
        return {
          profile: {
            user_id: String(p.user_id ?? userId),
            display_name: p.display_name ?? p.handle ?? 'Member',
            handle: p.handle ?? null,
            initial: initialOf(p.display_name ?? p.handle),
            role_labels: Array.isArray(p.role_labels) ? p.role_labels : Array.isArray(stats.role_labels) ? stats.role_labels : [],
            verified_identity: (p.role_labels ?? stats.role_labels ?? []).some((l: string) => /verified/i.test(l)),
            history: [
              { label: 'Ideas posted', value: String(asNum(stats.ideas_posted) ?? 0) },
              { label: 'Theses updated', value: String(asNum(stats.theses_updated) ?? 0) },
              { label: 'Outcomes disclosed', value: String(asNum(stats.outcomes_disclosed) ?? 0) },
              { label: 'Ideas with defined risk', value: pct(stats.defined_risk_rate) ?? '—' },
            ],
            feedback: asNum(stats.usefulness_score) != null
              ? [{ label: 'Usefulness', score: asNum(stats.usefulness_score)!, out_of: 5 }]
              : [],
            // `rankings: null` is part of the contract — there is nothing to render.
            feedback_note: 'Rated on usefulness and clarity — never on profit claims or P/L screenshots.',
            recent: (r.recent_messages ?? r.recent ?? r.messages ?? []).map((m: any) => ({
              id: String(m.id),
              room_name: m.room_name ?? m.room?.name ?? 'a room',
              time_label: timeLabel(m.created_at),
              body: String(m.excerpt ?? m.body ?? ''),
              disclosure: mapDisclosure(m.position_disclosure),
            })),
            muted: r.muted === true,
          },
          source: 'api',
        };
      } catch {
        /* fall through */
      }
    }
    return { profile: fixtureContributor, source: 'fixtures' };
  },
};

/* ------------------------------------------------------------------ */
/* Debriefs                                                             */
/* ------------------------------------------------------------------ */

const money = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;

/**
 * The API's ProcessReceiptItem is `{label, ok, detail_plain}` — a boolean, not
 * a three-way. A kept step is `ok`; a step that was not kept is a deviation
 * worth naming, which is the artboard's gold "warn", not a red failure. A hard
 * miss only appears when the payload says so explicitly.
 */
const RECEIPT_STATUS = (raw: any): 'ok' | 'warn' | 'miss' => {
  if (raw.status === 'ok' || raw.status === 'warn' || raw.status === 'miss') return raw.status;
  if (raw.ok === true) return 'ok';
  if (raw.ok === false) return 'warn';
  return 'warn';
};

function mapDebrief(raw: any): Debrief {
  // DebriefRow wraps the real content in `payload` (kai_object type 'debrief').
  const p = raw.payload ?? raw;
  const o = p.outcome ?? {};
  const pnl = asNum(o.pnl ?? o.realized_pnl) ?? 0;
  const receipts = p.process_receipt ?? p.process_review ?? [];
  const simulated = raw.simulated === true || p.simulated === true || raw.origin?.simulated === true;
  return {
    id: String(raw.id),
    position_id: String(raw.position_id ?? p.position_id ?? ''),
    outcome: {
      symbol: String(p.symbol ?? raw.symbol ?? o.symbol ?? ''),
      pnl,
      pnl_label: money(pnl),
      exit_reason: String(o.exit_reason ?? ''),
      held: String(o.held ?? o.hold_time ?? ''),
      direction: (p.direction ?? o.direction) === 'short' ? 'short' : 'long',
      closed_at: o.closed_at ?? raw.closed_at ?? null,
    },
    process_receipt: (Array.isArray(receipts) ? receipts : []).map((r: any) => ({
      label: String(r.label ?? ''),
      detail: String(r.detail_plain ?? r.detail ?? r.label ?? ''),
      status: RECEIPT_STATUS(r),
    })),
    lesson_plain: String(p.lesson_plain ?? raw.kai_summary ?? ''),
    lesson_detail: p.lesson_detail ?? (raw.kai_summary && p.lesson_plain && raw.kai_summary !== p.lesson_plain ? raw.kai_summary : null),
    what_worked: Array.isArray(p.what_worked) ? p.what_worked.map(String) : [],
    what_failed: Array.isArray(p.what_failed) ? p.what_failed.map(String) : [],
    timeline: (Array.isArray(p.timeline) ? p.timeline : []).map((t: any) => ({
      at: t.at ?? t.created_at ?? '',
      time_label: t.time_label ?? timeLabel(t.at ?? t.created_at).replace(/^.*at /, ''),
      label: String(t.label ?? t.kind ?? ''),
      detail: t.plain ?? t.detail ?? null,
      kind: ['plan', 'order', 'fill', 'alert', 'exit'].includes(t.kind) ? t.kind : 'plan',
    })),
    simulated,
    lesson_saved: raw.lesson_saved === true,
    created_at: raw.created_at ?? new Date().toISOString(),
  };
}

function mapClosedPosition(raw: any): ClosedPosition {
  const pnl = asNum(raw.realized_pnl ?? raw.pnl) ?? 0;
  const held = raw.opened_at && raw.closed_at
    ? (() => {
        const ms = new Date(raw.closed_at).getTime() - new Date(raw.opened_at).getTime();
        if (!Number.isFinite(ms) || ms <= 0) return '';
        const h = Math.floor(ms / 3_600_000);
        const m = Math.round((ms % 3_600_000) / 60_000);
        return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
      })()
    : String(raw.held ?? '');
  return {
    id: String(raw.id),
    symbol: String(raw.symbol ?? ''),
    pnl,
    pnl_label: money(pnl),
    closed_label: raw.closed_at ? `Closed ${relativeLabel(raw.closed_at)}` : 'Closed',
    held,
    simulated: raw.origin?.simulated === true || raw.simulated === true,
    debrief_id: raw.has_debrief ? raw.debrief_id ?? null : null,
  };
}

export const debriefApi = {
  available: live,

  async list(): Promise<{ debriefs: Debrief[]; closed: ClosedPosition[]; source: Source }> {
    if (live()) {
      try {
        const d = await request<any>('/debriefs');
        const debriefs = (Array.isArray(d) ? d : d.debriefs ?? []).map(mapDebrief);
        // GET /debriefs already returns the closed positions still awaiting one.
        let awaiting = Array.isArray(d.awaiting) ? d.awaiting : null;
        if (!awaiting) {
          const p = await request<any>('/positions?status=closed').catch(() => ({ positions: [] }));
          awaiting = Array.isArray(p) ? p : p.positions ?? [];
        }
        return { debriefs, closed: awaiting.map(mapClosedPosition), source: 'api' };
      } catch {
        /* fall through */
      }
    }
    return { debriefs: fixtureDebriefs, closed: fixtureClosedPositions, source: 'fixtures' };
  },

  async get(id: string): Promise<{ debrief: Debrief | null; source: Source }> {
    if (live()) {
      try {
        const r = await request<any>(`/debriefs/${id}`);
        return { debrief: mapDebrief(r.debrief ?? r), source: 'api' };
      } catch {
        /* fall through */
      }
    }
    return { debrief: fixtureDebriefs.find((d) => d.id === id) ?? fixtureDebriefs[0] ?? null, source: 'fixtures' };
  },

  async create(positionId: string): Promise<Debrief | null> {
    if (!live()) return fixtureDebriefs[0] ?? null;
    const r = await request<any>(`/positions/${positionId}/debrief`, { method: 'POST', body: JSON.stringify({}) });
    return mapDebrief(r.debrief ?? r);
  },

  async saveLesson(id: string): Promise<void> {
    if (!live()) return;
    await request(`/debriefs/${id}/save-lesson`, { method: 'POST', body: JSON.stringify({}) });
  },

  /** dev-only, gated by DEV_TOOLS=1 on the API. */
  async simulateClosedTrade(symbol?: string): Promise<string | null> {
    if (!live()) return null;
    const r = await request<any>('/dev/simulate-closed-trade', { method: 'POST', body: JSON.stringify({ symbol }) });
    return r.position_id ?? r.id ?? null;
  },
};
