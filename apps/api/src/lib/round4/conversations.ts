/**
 * The conversations drawer: titles, pinning, search, and auto-titling.
 *
 * AUTO-TITLING. After the first exchange a conversation gets a name, because
 * "Conversation 4f2a…" is not something a person can find again. Two paths:
 *
 *   - the daily briefing conversation is named deterministically,
 *     "Morning Briefing · Aug 28". It is the same object every day and no model
 *     needs to be asked what to call it;
 *   - anything else is titled by ONE short, cheap completion over the first
 *     user turn and the first Kai turn, capped at six words. If that call fails
 *     the title falls back to a derived one ("META Day Trade") rather than
 *     leaving the row untitled — the drawer must never show a UUID.
 *
 * SEARCH is `ilike` over the title plus the first message, which is what a
 * person actually remembers. Trigram indexing is SCHEMA-4's; this works either
 * way, and on a personal conversation list the difference is not measurable.
 *
 * PINNING lives in `conversations.pinned` when SCHEMA-4 has landed and in
 * `conversations.context.round4.pinned` until then — both are written, one is
 * preferred on read (see schema-probe.ts).
 */
import type { AppMode, ConversationSummary } from '@shared/api';
import { serviceClient } from '../db';
import { log } from '../log';
import { completeOnce, anthropicConfigured } from '../kai/stream';
import { hasConversationColumns } from './schema-probe';

const BASE_COLUMNS = 'id,user_id,mode,title,context,created_at,updated_at';

export type ConversationRecord = {
  id: string;
  mode: AppMode | null;
  title: string | null;
  pinned: boolean;
  last_message_at: string | null;
  message_count: number;
  context: Record<string, unknown> | null;
  created_at: string;
};

function pinnedOf(row: Record<string, unknown>): boolean {
  if (typeof row.pinned === 'boolean') return row.pinned;
  const ctx = (row.context as Record<string, unknown>) ?? {};
  const r4 = (ctx.round4 as Record<string, unknown>) ?? {};
  return Boolean(r4.pinned);
}

export function briefingTitle(date = new Date()): string {
  return `Morning Briefing · ${date.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}`;
}

function kindOf(row: ConversationRecord): ConversationSummary['kind'] {
  const ctx = row.context ?? {};
  if ((ctx.kind as string) === 'briefing' || /morning briefing/i.test(row.title ?? '')) return 'briefing';
  const sheet = (ctx.sheet as Record<string, unknown>) ?? {};
  const pinnedCtx = (ctx.pinned as Record<string, unknown>) ?? {};
  if (sheet.symbol || (Array.isArray(pinnedCtx.symbols) && pinnedCtx.symbols.length)) return 'symbol';
  return 'general';
}

const MODE_WORD: Record<string, string> = { day_trade: 'Day Trade', swing: 'Swing', invest: 'Invest' };

/** A title derived from what the conversation is about. No model involved. */
export function derivedTitle(row: ConversationRecord, firstUserText: string | null): string {
  const ctx = row.context ?? {};
  const sheet = (ctx.sheet as Record<string, unknown>) ?? {};
  const pinnedCtx = (ctx.pinned as Record<string, unknown>) ?? {};
  const symbol =
    (typeof sheet.symbol === 'string' ? sheet.symbol : null) ??
    (Array.isArray(pinnedCtx.symbols) && typeof pinnedCtx.symbols[0] === 'string' ? (pinnedCtx.symbols[0] as string) : null);
  if (symbol) return `${symbol.toUpperCase()} ${MODE_WORD[String(row.mode)] ?? 'Notes'}`;
  if (firstUserText) {
    const words = firstUserText.trim().split(/\s+/).slice(0, 6).join(' ');
    return words.length > 3 ? words.charAt(0).toUpperCase() + words.slice(1) : 'New conversation';
  }
  return 'New conversation';
}

export function toSummary(row: ConversationRecord, firstUserText: string | null = null): ConversationSummary {
  const title = row.title?.trim() || derivedTitle(row, firstUserText);
  const kind = kindOf(row);
  const when = row.last_message_at ?? row.created_at;
  const subtitle =
    row.message_count === 0
      ? 'Nothing said yet'
      : `${row.message_count} message${row.message_count === 1 ? '' : 's'} · ${new Date(when).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}`;
  return {
    id: row.id,
    title,
    mode: row.mode,
    pinned: row.pinned,
    subtitle,
    last_message_at: row.last_message_at,
    message_count: row.message_count,
    route: `/?conversation=${row.id}`,
    kind,
  };
}

/* ------------------------------------------------------------------ */
/* Loading                                                              */
/* ------------------------------------------------------------------ */

export async function loadConversations(opts: {
  userId: string;
  q?: string | null;
  limit?: number;
}): Promise<{ rows: ConversationRecord[]; firstText: Map<string, string> }> {
  const db = serviceClient();
  const hasCols = await hasConversationColumns();
  const cols = hasCols ? `${BASE_COLUMNS},pinned,last_message_at` : BASE_COLUMNS;
  const limit = opts.limit ?? 40;

  // The whole list is read and then filtered in memory. A personal conversation
  // list is tens of rows, and searching the FIRST MESSAGE as well as the title
  // is what a person expects "search conversations" to do — "the one where I
  // asked about volume" has no matching title at all.
  let q = db.from('conversations').select(cols).eq('user_id', opts.userId).limit(200);
  q = hasCols
    ? q.order('last_message_at', { ascending: false, nullsFirst: false })
    : q.order('updated_at', { ascending: false, nullsFirst: false });

  const { data, error } = await q;
  if (error) {
    log('warn', '-', 'conversations.list_failed', { message: error.message });
    return { rows: [], firstText: new Map() };
  }

  const raw = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = raw.map((r) => String(r.id));
  const firstText = new Map<string, string>();
  const counts = new Map<string, number>();
  const lastAt = new Map<string, string>();

  if (ids.length) {
    const msgs = await db
      .from('conversation_messages')
      .select('conversation_id,seq,role,content,created_at')
      .in('conversation_id', ids)
      .order('seq', { ascending: true });
    for (const m of ((msgs.data ?? []) as Record<string, unknown>[])) {
      const cid = String(m.conversation_id);
      counts.set(cid, (counts.get(cid) ?? 0) + 1);
      const at = String(m.created_at);
      if (!lastAt.has(cid) || at > (lastAt.get(cid) as string)) lastAt.set(cid, at);
      if (m.role === 'user' && !firstText.has(cid)) {
        const text = ((m.content as Record<string, unknown>) ?? {}).text;
        if (typeof text === 'string') firstText.set(cid, text);
      }
    }
  }

  let rows: ConversationRecord[] = raw.map((r) => ({
    id: String(r.id),
    mode: (r.mode as AppMode) ?? null,
    title: (r.title as string) ?? null,
    pinned: pinnedOf(r),
    last_message_at: (r.last_message_at as string) ?? lastAt.get(String(r.id)) ?? null,
    message_count: counts.get(String(r.id)) ?? 0,
    context: (r.context as Record<string, unknown>) ?? null,
    created_at: String(r.created_at),
  }));

  if (opts.q) {
    const needle = opts.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.title ?? '').toLowerCase().includes(needle) ||
        (firstText.get(r.id) ?? '').toLowerCase().includes(needle) ||
        derivedTitle(r, firstText.get(r.id) ?? null).toLowerCase().includes(needle)
    );
  }

  rows.sort((a, b) => {
    const at = (r: ConversationRecord) => new Date(r.last_message_at ?? r.created_at).getTime();
    return at(b) - at(a);
  });

  return { rows: rows.slice(0, limit), firstText };
}

/* ------------------------------------------------------------------ */
/* Writing                                                              */
/* ------------------------------------------------------------------ */

export async function setPinned(userId: string, id: string, pinned: boolean): Promise<void> {
  const db = serviceClient();
  const hasCols = await hasConversationColumns();
  const { data } = await db.from('conversations').select('context').eq('id', id).eq('user_id', userId).maybeSingle();
  const ctx = ((data as Record<string, unknown> | null)?.context as Record<string, unknown>) ?? {};
  const round4 = { ...((ctx.round4 as Record<string, unknown>) ?? {}), pinned };
  const patch: Record<string, unknown> = { context: { ...ctx, round4 } };
  if (hasCols) patch.pinned = pinned;
  await db.from('conversations').update(patch).eq('id', id).eq('user_id', userId);
}

export async function setTitle(userId: string, id: string, title: string): Promise<void> {
  const db = serviceClient();
  await db.from('conversations').update({ title }).eq('id', id).eq('user_id', userId);
}

/**
 * Keep the drawer's ordering honest after a turn.
 *
 * 0021 maintains `conversations.last_message_at` with a trigger on
 * `conversation_messages`, so when the column exists this is a NO-OP: writing
 * it by hand would be a second author for one value, and the trigger is the
 * one that cannot be forgotten. Before that migration the drawer falls back to
 * `updated_at`, which this touch keeps moving.
 */
export async function touchConversation(id: string): Promise<void> {
  if (await hasConversationColumns()) return;
  try {
    await serviceClient().from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', id);
  } catch {
    /* a missed timestamp is not worth failing a reply over */
  }
}

/**
 * Title a conversation after its first exchange.
 *
 * Idempotent: a row that already has a title is left alone, so a user's own
 * rename is never overwritten by a later turn.
 */
export async function autoTitle(opts: {
  userId: string;
  conversationId: string;
  firstUserText: string;
  firstKaiText: string;
  requestId?: string;
}): Promise<string | null> {
  const db = serviceClient();
  const { data } = await db
    .from('conversations')
    .select(BASE_COLUMNS)
    .eq('id', opts.conversationId)
    .eq('user_id', opts.userId)
    .maybeSingle();
  const row = (data as Record<string, unknown> | null) ?? null;
  if (!row) return null;
  if (typeof row.title === 'string' && row.title.trim()) return row.title;

  const ctx = (row.context as Record<string, unknown>) ?? {};
  if ((ctx.kind as string) === 'briefing') {
    const t = briefingTitle();
    await setTitle(opts.userId, opts.conversationId, t);
    return t;
  }

  const record: ConversationRecord = {
    id: String(row.id),
    mode: (row.mode as AppMode) ?? null,
    title: null,
    pinned: false,
    last_message_at: null,
    message_count: 2,
    context: ctx,
    created_at: String(row.created_at),
  };
  let title = derivedTitle(record, opts.firstUserText);

  if (anthropicConfigured()) {
    try {
      const out = await completeOnce({
        system:
          'You name conversations. Reply with a title of at most six words, in title case, naming the subject. ' +
          'No quotes, no punctuation at the end, no preamble, no explanation. If a ticker symbol is discussed, ' +
          'start with it in capitals. Never invent a subject that is not in the text.',
        messages: [
          {
            role: 'user',
            content: `Person: ${opts.firstUserText.slice(0, 600)}\n\nKai: ${opts.firstKaiText.slice(0, 600)}`,
          },
        ],
        maxTokens: 40,
      });
      const cleaned = out.replace(/["'`\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (cleaned.length >= 3) title = cleaned;
    } catch (e) {
      log('warn', opts.requestId ?? '-', 'conversation.autotitle_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await setTitle(opts.userId, opts.conversationId, title);
  return title;
}

export const CONVERSATIONS_EMPTY_COPY = 'No conversations yet. Ask me anything and this fills up.';
