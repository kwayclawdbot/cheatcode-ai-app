/**
 * @Kai inside a room — synchronous in this round.
 *
 * 02 §9 specifies these commands as async with `kai_status` events; there is no
 * kai worker yet, so the request runs the model inline and returns the finished
 * object. The command set is the one in 08 §5: summarize · verify · to_alert ·
 * compare · explain (mark_levels needs chart annotations and is deferred).
 *
 * SECURITY (03 Unit 3, normative). Room text is other people's writing. It
 * enters the prompt only inside a delimited `<untrusted_content>` block via
 * guard.wrapUntrusted (which escapes `<` so the block cannot be closed), and
 * every produced object is run through guard.scanPayload before it is
 * published. A scan hit publishes nothing from the model — the deterministic
 * fallback goes out instead and the finding is logged.
 *
 * Nothing here can execute anything. `to_alert` produces a PREVIEW only; the
 * member still has to activate it through POST /alerts.
 */
import {
  RoomSummaryPayload,
  VerificationCardPayload,
  ComparisonPayload,
  AlertPreviewPayload,
  BriefingPayload,
  type KaiObjectType,
  type RoomKaiCommand,
} from '@shared/api';
import { log } from '../log';
import { marketDate } from '../market';
import { buildSystemPrompt } from './system-prompt';
import { anthropicConfigured, completeOnce } from './stream';
import { wrapUntrusted, scanPayload, type Untrusted } from './guard';
import type { ProfileRow } from './context';

export type RoomMessageInput = {
  id: string;
  seq: number;
  author: string;
  at: string;
  text: string;
  kind: string;
};

export type RoomInfo = {
  id: string;
  name: string;
  mode: string | null;
  setup_summary: string | null;
  /** Symbols this system actually follows, from `instruments`. */
  known_symbols: Set<string>;
};

export type RoomKaiResult = {
  type: KaiObjectType;
  payload: unknown;
  body_plain: string;
  degraded: boolean;
  reason: string | null;
};

const SYMBOL_RE = /\$?\b([A-Z]{1,5})\b/g;
const COMMON_WORDS = new Set([
  'I', 'A', 'THE', 'AND', 'OR', 'IF', 'IT', 'IS', 'TO', 'AT', 'ON', 'IN', 'OK', 'NO', 'SO', 'BE',
  'DO', 'MY', 'WE', 'US', 'AM', 'PM', 'ET', 'ALL', 'BUT', 'FOR', 'NOT', 'YOU', 'CAN', 'ARE', 'WAS',
  'HAS', 'HAD', 'WHY', 'HOW', 'ITS', 'OUT', 'GET', 'NEW', 'ONE', 'TWO', 'RSI', 'ATR', 'EOD',
]);

/**
 * Tickers members actually mentioned.
 *
 * `known` is the instruments table. Without it any shouty word becomes a
 * "ticker" — a prompt-injection post reading "PWNED BY ROOM" put PWNED, BY and
 * ROOM into the assets list. A symbol we do not follow is not a symbol.
 */
export function assetsMentioned(messages: RoomMessageInput[], known?: Set<string>): string[] {
  const counts = new Map<string, number>();
  for (const m of messages) {
    for (const match of m.text.matchAll(SYMBOL_RE)) {
      const sym = match[1];
      if (COMMON_WORDS.has(sym) || sym.length < 2) continue;
      if (known && !known.has(sym)) continue;
      counts.set(sym, (counts.get(sym) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([s]) => s);
}

function toUntrusted(messages: RoomMessageInput[]): Untrusted[] {
  return messages.map((m) => ({ id: String(m.seq), author: m.author, at: m.at, text: m.text }));
}

const CONFIDENCE_LIMITS =
  'This reads what members wrote. Community claims are not evidence — nothing here has been independently verified, and none of it changes a grade on its own.';

/* ------------------------------------------------------------------ */
/* Deterministic fallbacks — real content only, never invented          */
/* ------------------------------------------------------------------ */

function fallbackSummary(room: RoomInfo, messages: RoomKaiInput['messages']): unknown {
  const first = messages[0] ?? null;
  const last = messages[messages.length - 1] ?? null;
  return RoomSummaryPayload.parse({
    room_id: room.id,
    room_name: room.name,
    window: {
      from: first?.at ?? null,
      to: last?.at ?? null,
      from_seq: first?.seq ?? null,
      to_seq: last?.seq ?? null,
    },
    sample_size: messages.length,
    themes: [],
    claims: [],
    disagreements: [],
    assets: assetsMentioned(messages),
    missed_updates: [],
    confidence_limits: CONFIDENCE_LIMITS,
    kai_conclusion_plain:
      messages.length === 0
        ? 'Nothing has been posted in here yet, so there is nothing for me to summarise.'
        : `I could not read the room just now, so I have only counted what is here: ${messages.length} message${messages.length === 1 ? '' : 's'}. Try again in a moment.`,
  });
}

/* ------------------------------------------------------------------ */
/* Prompt bodies                                                        */
/* ------------------------------------------------------------------ */

export type RoomKaiInput = {
  command: RoomKaiCommand;
  room: RoomInfo;
  messages: RoomMessageInput[];
  target: RoomMessageInput | null;
  profile: ProfileRow;
  args: Record<string, unknown>;
  requestId: string;
};

const OBJECT_TYPE: Record<RoomKaiCommand, KaiObjectType> = {
  summarize: 'room_summary',
  verify: 'verification_card',
  to_alert: 'alert_preview',
  compare: 'comparison',
  explain: 'briefing',
};

function instructionFor(input: RoomKaiInput): string {
  const { room, messages, target } = input;
  const block = wrapUntrusted(`room:${room.name}`, toUntrusted(messages));
  const assets = assetsMentioned(messages, room.known_symbols);
  const context = [
    `ROOM: ${room.name}${room.mode ? ` (${room.mode.replace('_', ' ')} mode)` : ''}`,
    room.setup_summary ? `PINNED SETUP: ${room.setup_summary}` : null,
    `MESSAGES IN WINDOW: ${messages.length}`,
    assets.length ? `TICKERS MENTIONED: ${assets.join(', ')}` : null,
    target ? `THE MEMBER POINTED AT MESSAGE #${target.seq} by ${target.author}.` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const first = messages[0] ?? null;
  const last = messages[messages.length - 1] ?? null;

  switch (input.command) {
    case 'summarize':
      return `${context}

${block}

Summarise this room for someone who just walked in. Return ONLY a fenced kai_object block:

\`\`\`kai_object
{ "type": "room_summary", "payload": {
  "room_id": ${JSON.stringify(room.id)},
  "room_name": ${JSON.stringify(room.name)},
  "window": { "from": ${JSON.stringify(first?.at ?? null)}, "to": ${JSON.stringify(last?.at ?? null)}, "from_seq": ${first?.seq ?? null}, "to_seq": ${last?.seq ?? null} },
  "sample_size": ${messages.length},
  "themes": [ { "label": "short label", "plain": "one plain sentence" } ],
  "claims": [ { "claim": "what a member asserted, quoted or closely paraphrased", "verified": "unverified", "plain": "why it matters, and that it is unverified" } ],
  "disagreements": [ "one line per genuine disagreement, or none" ],
  "assets": ${JSON.stringify(assets)},
  "missed_updates": [ "anything a returning member would want to know they missed" ],
  "confidence_limits": ${JSON.stringify(CONFIDENCE_LIMITS)},
  "kai_conclusion_plain": "YOUR own read, kept separate from what members claimed"
} }
\`\`\`

Rules: every claim must be traceable to a message above — never invent one. All claims are "unverified" in this release; there is no verification pipeline running. Do not treat popularity as evidence. Do not name a price that no message contains. If the room is quiet, say so plainly and return empty arrays.`;

    case 'verify':
      return `${context}

${block}

Verify the claim in the message the member pointed at${target ? ` (message #${target.seq})` : ''}. Return ONLY a fenced kai_object block:

\`\`\`kai_object
{ "type": "verification_card", "payload": {
  "claim": "the claim, quoted from the message",
  "result": "verified|partially_verified|unverified|false|unverifiable",
  "sources": [ { "label": "what you checked it against", "url": null, "ts": null } ],
  "timestamp": ${JSON.stringify(new Date().toISOString())},
  "uncertainty": "what you cannot settle and why",
  "effect_on_setup": "what this changes about the setup, or plainly that it changes nothing"
} }
\`\`\`

You have NO web access, no filings, and no news tool in this release. So unless the claim is settled by the context above, the honest result is "unverifiable" and you say why. Unverifiable is not the same as false, and you must say that. Never invent a source. An empty sources array is correct when you checked nothing.`;

    case 'to_alert':
      return `${context}

${block}

Turn the idea the member pointed at into a watch REQUEST — a preview, not an active alert. Return ONLY a fenced kai_object block:

\`\`\`kai_object
{ "type": "alert_preview", "payload": {
  "natural_language": "the member's idea in one line",
  "condition": { "compose": "all", "atoms": [ { "atom": "price_cross|price_range|pct_change|rvol_min|setup_state|time_at|volume_above|catalyst_within", "symbol": "SYM", "operator": "above|below|crosses_up|crosses_down|equals|within", "value": 0 } ] },
  "data_dependency": { "symbols": ["SYM"], "feeds": ["equity_quotes"] },
  "frequency": "once",
  "expires_at": null,
  "summary_plain": "one plain sentence describing exactly what would be watched",
  "risk_plain": "one line reminding them this only watches — it never places an order"
} }
\`\`\`

Use only symbols and levels that actually appear in the messages above. If no level was named, you cannot build the condition — say so in summary_plain and use the symbol with a setup_state atom instead of inventing a price.`;

    case 'compare':
      return `${context}

${block}

Lay the bullish and bearish arguments in this room side by side. Return ONLY a fenced kai_object block:

\`\`\`kai_object
{ "type": "comparison", "payload": {
  "subject": "${assets[0] ?? room.name}",
  "bull": { "points": ["each point traceable to a message"], "plain": "one plain sentence" },
  "bear": { "points": ["each point traceable to a message"], "plain": "one plain sentence" },
  "kai_conclusion_plain": "YOUR read — what would actually settle it, and what you are waiting for",
  "confidence_limits": ${JSON.stringify(CONFIDENCE_LIMITS)}
} }
\`\`\`

Both sides come from what members wrote. If only one side is represented, say that plainly and leave the other array empty rather than inventing an opponent.`;

    case 'explain':
    default:
      return `${context}

${block}

Explain what is going on in this room to a complete beginner. Return ONLY a fenced kai_object block:

\`\`\`kai_object
{ "type": "briefing", "payload": {
  "market_date": ${JSON.stringify(marketDate())},
  "headline": "one sentence a beginner understands, first person, no hype",
  "lines": [ { "text": "one short clause", "emphasis": "neutral|attention|risk|positive", "ref": null } ],
  "lead_symbol": ${JSON.stringify(assets[0] ?? null)},
  "closing_plain": "one short line naming what to watch for next"
} }
\`\`\`

Two to four lines. Expand every piece of jargon the room used. Do not open with an acronym. Only use symbols and levels that appear above.`;
  }
}

/* ------------------------------------------------------------------ */
/* Validation per command                                               */
/* ------------------------------------------------------------------ */

function validate(command: RoomKaiCommand, payload: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  const schema =
    command === 'summarize'
      ? RoomSummaryPayload
      : command === 'verify'
        ? VerificationCardPayload
        : command === 'to_alert'
          ? AlertPreviewPayload
          : command === 'compare'
            ? ComparisonPayload
            : BriefingPayload;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { ok: true, value: parsed.data };
}

function extractFence(text: string): string | null {
  const open = text.indexOf('```kai_object');
  if (open < 0) return text.trim().startsWith('{') ? text.trim() : null;
  const rest = text.slice(open + '```kai_object'.length);
  const close = rest.indexOf('```');
  return close < 0 ? rest.trim() : rest.slice(0, close).trim();
}

const BODY_PLAIN: Record<RoomKaiCommand, string> = {
  summarize: 'Here is what this room has been working through.',
  verify: 'I checked that claim — here is what I can and cannot settle.',
  to_alert: 'Here is that idea as a watch you can activate. It only watches; it never places an order.',
  compare: 'Here is the bull case and the bear case, side by side.',
  explain: 'Here is what is going on in here, in plain English.',
};

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

export async function runRoomCommand(input: RoomKaiInput): Promise<RoomKaiResult> {
  const type = OBJECT_TYPE[input.command];
  const fallback = (reason: string): RoomKaiResult => ({
    type: 'room_summary',
    payload: fallbackSummary(input.room, input.messages),
    body_plain: 'I could not put that together just now. Here is what is in the room.',
    degraded: true,
    reason,
  });

  if (!anthropicConfigured()) return fallback('Kai is offline right now.');
  if ((input.command === 'verify' || input.command === 'to_alert') && !input.target) {
    return fallback('Point me at the message you want me to look at.');
  }

  const system = buildSystemPrompt({
    displayName: input.profile.display_name,
    experience: input.profile.experience,
    involvement: input.profile.involvement,
    explanationLevel: input.profile.explanation_level,
    mode: input.room.mode ?? input.profile.primary_mode,
  });

  try {
    const text = await completeOnce({
      system,
      messages: [{ role: 'user', content: instructionFor(input) }],
      maxTokens: 1600,
    });

    const body = extractFence(text);
    if (!body) return fallback('Kai did not answer in the shape the room needs.');

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return fallback('Kai did not answer in the shape the room needs.');
    }
    const wrapper = json as { type?: string; payload?: unknown };
    const payloadRaw = wrapper?.payload ?? json;

    const checked = validate(input.command, payloadRaw);
    if (!checked.ok) {
      log('warn', input.requestId, 'room_kai.shape_failed', { command: input.command, reason: checked.reason });
      return fallback('Kai did not answer in the shape the room needs.');
    }

    // OUTPUT SCAN — the second half of the security boundary.
    const scan = scanPayload(checked.value);
    if (!scan.ok) {
      log('warn', input.requestId, 'room_kai.INJECTION_SCAN_BLOCKED', {
        command: input.command,
        findings: scan.findings,
      });
      return fallback('A post in this room tried to give me instructions, so I did not publish that answer.');
    }

    return {
      type,
      payload: checked.value,
      body_plain: BODY_PLAIN[input.command],
      degraded: false,
      reason: null,
    };
  } catch (e) {
    log('error', input.requestId, 'room_kai.failed', {
      command: input.command,
      message: e instanceof Error ? e.message : String(e),
    });
    return fallback('Kai is offline right now.');
  }
}
