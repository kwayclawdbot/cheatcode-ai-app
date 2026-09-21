/**
 * KAI IS AN AGENT, NOT A DASHBOARD — the rules, with no drawing in them.
 *
 * Redesign V2 (docs/design/redesign-2026-09-21, "Kai is an agent"): Kai opens
 * the conversation before the member asks, summarising what changed on their
 * watchlist, positions and calendar; the summary carries an interactive
 * "Today's Brief"; every Kai response ends in follow-up actions built from what
 * the response was ABOUT; and "Kai will update you …" appears only when an
 * alert the member switched on actually exists.
 *
 * Everything here is built from `GET /home` — no model call — so the opening
 * still renders when Kai himself cannot answer. The module is pure (types
 * only), so `scripts/home-agent-test.mts` checks every sentence under node.
 *
 * WHAT IT WILL NOT DO
 *   - name a thing the payload does not contain (no CPI without a calendar
 *     source — the server has none, so there is never a macro row)
 *   - call a quiet morning quiet unless every read answered
 *   - push a beginner toward a trade: their opening teaches, it never sells
 */
import type {
  AlsoWatchingRow, GoalMode, HomeAgent, HomePriority, HomeV5, KaiComparison, MarketStatus, Stage, WallItem,
} from '../../lib/types';

/* ==================================================================== */
/* Shapes                                                                */
/* ==================================================================== */

/** What tapping a row, a chip or a card does. Every one lands somewhere real. */
export type AgentOpen =
  | { kind: 'route'; route: string }
  /** Open one of the Kai workspace surfaces above the conversation. */
  | { kind: 'surface'; surface: 'earnings' | 'chart' | 'quote'; symbol: string }
  /** Put something Kai already has into the thread — the morning report he wrote. */
  | { kind: 'reveal'; what: 'report' };

export type BriefRowKind = 'setup' | 'alert' | 'position' | 'portfolio' | 'earnings';
/** How the state label is inked — by meaning, never decoration. */
export type BriefTone = 'action' | 'neutral' | 'down';

export type BriefRow = {
  id: string;
  kind: BriefRowKind;
  /** The ticker, or null for a portfolio-level row. */
  symbol: string | null;
  /** What the row is called when there is no ticker. */
  title: string;
  /** "Setup ready" / "Open position" / "Wed · after close". */
  label: string;
  tone: BriefTone;
  /** One short line under it. */
  sub: string | null;
  open: AgentOpen | null;
};

export type TodayBrief = {
  id: string;
  /** "Mon, Sep 21". */
  dateLabel: string;
  rows: BriefRow[];
  /** Said under the rows when part of the read is missing. Null when whole. */
  footnote: string | null;
};

export type FollowUp = {
  id: string;
  label: string;
  icon: 'thesis' | 'compare' | 'alert' | 'chart' | 'question' | 'report';
  /** 'ask' sends `task` to Kai as the member's message; 'open' needs no model. */
  kind: 'ask' | 'open';
  task?: string;
  open?: AgentOpen;
};

/* ==================================================================== */
/* Small words                                                           */
/* ==================================================================== */

const clean = (s: string | null | undefined) => (s ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim();
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string) =>
  !s ? s : s.length > 1 && /[A-Z]/.test(s[1]) ? s : s[0].toLowerCase() + s.slice(1);

export function timeOfDay(now: Date): 'Morning' | 'Afternoon' | 'Evening' {
  const h = now.getHours();
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}

export function greeting(now: Date, name?: string | null): string {
  const who = name && name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : '';
  return `${timeOfDay(now)}${who}.`;
}

/** "Mon, Sep 21" — the brief's date, in the member's own calendar. */
export function dateLabel(now: Date): string {
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()];
  return `${wd}, ${mo} ${now.getDate()}`;
}

/** "9:14 AM". */
export function clockLabel(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A report date as a person says it: "today", "tomorrow", "Wednesday". */
function reportDay(date: string, daysAway: number): string {
  if (daysAway <= 0) return 'today';
  if (daysAway === 1) return 'tomorrow';
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : WEEKDAY[d.getUTCDay()];
}

const WHEN_SHORT: Record<string, string> = { premarket: 'before open', postmarket: 'after close', unknown: '' };
const WHEN_LONG: Record<string, string> = { premarket: ' before the open', postmarket: ' after the close', unknown: '' };

/* ==================================================================== */
/* Status line                                                            */
/* ==================================================================== */

const SESSION_SHORT: Record<MarketStatus['status'], string> = {
  pre: 'Pre-market',
  open: 'Market open',
  post: 'After hours',
  closed: 'Market closed',
  holiday: 'Market holiday',
};

/**
 * The app bar's one line under "Kai". Positions when there are any (that is
 * what Kai is actively watching), else the session. Offline wins: a green dot
 * next to a Kai who cannot answer would be the screen lying about him.
 */
export function statusLine(input: {
  kaiAvailable: boolean;
  online: boolean | null;
  positionsOpen: number | null;
  market: MarketStatus | null;
}): { text: string; live: boolean } {
  if (input.online === false) return { text: 'No connection', live: false };
  if (!input.kaiAvailable) return { text: 'Kai offline', live: false };
  const n = input.positionsOpen;
  if (n && n > 0) return { text: `Monitoring ${n} position${n === 1 ? '' : 's'}`, live: true };
  if (input.market) return { text: SESSION_SHORT[input.market.status] ?? 'Ready', live: input.market.status === 'open' };
  return { text: 'Ready', live: false };
}

/* ==================================================================== */
/* Today's Brief                                                          */
/* ==================================================================== */

/** The one line under a priority row: the chart note, else the first clause of the detail. */
function prioritySub(p: HomePriority): string | null {
  const note = clean(p.chart_note);
  if (note) return note;
  const d = clean(p.detail);
  return d ? d.split(' · ')[0] : null;
}

function priorityLabel(p: HomePriority): string {
  const s = clean(p.state_label);
  if (s) return cap(s);
  switch (p.kind) {
    case 'position': return 'Needs a decision';
    case 'alert': return 'Alert hit';
    case 'portfolio': return 'Portfolio';
    default: return 'Setup';
  }
}

function watchLabel(r: AlsoWatchingRow): string {
  const s = clean(r.state_label);
  if (s) return s;
  if (r.kind === 'position') return 'Open position';
  return r.tone === 'attention' ? 'Needs a look' : 'Watching';
}

const isFailed = (label: string) => /fail|invalid|off the table|stopped/i.test(label);

function watchTone(r: AlsoWatchingRow, label: string): BriefTone {
  if (isFailed(label)) return 'down';
  return r.tone === 'attention' || /ready|decision|hit|triggered/i.test(label) ? 'action' : 'neutral';
}

const MAX_ROWS = 4;

/**
 * The rows of Today's Brief, most pressing first: the one priority, then the
 * rest of the list, then the report dates. At most four — a brief that scrolls
 * is a dashboard again.
 */
export function briefRows(data: Pick<HomeV5, 'priority' | 'also_watching' | 'agent'>): BriefRow[] {
  const rows: BriefRow[] = [];
  const seen = new Set<string>();
  const p = data.priority;
  if (p) {
    const label = priorityLabel(p);
    rows.push({
      id: `p:${p.id}`,
      kind: p.kind,
      symbol: p.symbol ?? null,
      title: p.symbol || clean(p.title) || 'Your portfolio',
      label,
      tone: isFailed(label) ? 'down' : 'action',
      sub: prioritySub(p),
      open: p.primary_action?.route ? { kind: 'route', route: p.primary_action.route } : null,
    });
    if (p.symbol) seen.add(`${p.kind}:${p.symbol}`);
  }

  const events = data.agent?.calendar.events ?? [];
  // Leave room for the nearest report: it is the one thing on the list with a clock on it.
  const reserve = events.length ? 1 : 0;
  for (const r of data.also_watching) {
    if (rows.length >= MAX_ROWS - reserve) break;
    const key = `${r.kind ?? 'setup'}:${r.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = watchLabel(r);
    rows.push({
      id: `w:${r.id}`,
      kind: r.kind === 'position' ? 'position' : r.kind === 'alert' ? 'alert' : 'setup',
      symbol: r.symbol,
      title: r.symbol,
      label,
      tone: watchTone(r, label),
      sub: clean(r.text) || null,
      open: r.route ? { kind: 'route', route: r.route }
        : r.action?.route ? { kind: 'route', route: r.action.route }
        : { kind: 'route', route: `/symbol/${encodeURIComponent(r.symbol)}?tab=overview` },
    });
  }

  for (const e of events) {
    if (rows.length >= MAX_ROWS) break;
    const day = reportDay(e.date, e.days_away);
    const when = WHEN_SHORT[e.when] ?? '';
    rows.push({
      id: `e:${e.symbol}:${e.date}`,
      kind: 'earnings',
      symbol: e.symbol,
      title: e.symbol,
      label: [cap(day.length > 3 && day !== 'today' && day !== 'tomorrow' ? day.slice(0, 3) : day), when].filter(Boolean).join(' · '),
      tone: 'neutral',
      sub: e.confirmed ? 'Earnings · date confirmed' : 'Earnings · date estimated',
      open: { kind: 'surface', surface: 'earnings', symbol: e.symbol },
    });
  }
  return rows.slice(0, MAX_ROWS);
}

/** What the brief cannot vouch for, in one sentence. Null when nothing is missing. */
export function briefFootnote(data: Pick<HomeV5, 'agent'> & { standing?: { state: string; plain: string } | null }): string | null {
  const notes: string[] = [];
  if (data.standing?.state === 'unverified') notes.push(clean(data.standing.plain));
  const cal = data.agent?.calendar;
  if (cal && cal.state !== 'ok') notes.push(clean(cal.plain));
  return notes.length ? notes.join(' ') : null;
}

export function composeBrief(
  data: Pick<HomeV5, 'priority' | 'also_watching' | 'agent'> & { standing?: { state: string; plain: string } | null },
  now: Date,
): TodayBrief | null {
  const rows = briefRows(data);
  const footnote = briefFootnote(data);
  if (!rows.length && !footnote) return null;
  return { id: 'today-brief', dateLabel: dateLabel(now), rows, footnote };
}

/* ==================================================================== */
/* Kai's opening message                                                  */
/* ==================================================================== */

type Standing = { state: 'needs_you' | 'quiet' | 'unverified'; plain: string; checks: { key: string; label: string; ok: boolean; count: number | null }[] };

const WHEN_CHECKED: Record<MarketStatus['status'], string> = {
  pre: ' before the bell',
  open: '',
  post: ' after the close',
  closed: '',
  holiday: '',
};

/** One clause per row, in Kai's voice. The first one gets the stronger words. */
function clauseFor(row: BriefRow, first: boolean): string | null {
  const sym = row.symbol ?? row.title;
  const l = row.label.toLowerCase();
  switch (row.kind) {
    case 'earnings': {
      const [dayPart, whenPart] = row.label.split(' · ');
      const day = dayPart.length === 3 ? WEEKDAY.find((w) => w.startsWith(dayPart)) ?? dayPart : dayPart.toLowerCase();
      const when = whenPart === 'after close' ? WHEN_LONG.postmarket : whenPart === 'before open' ? WHEN_LONG.premarket : '';
      return `${sym} reports ${day}${when}`;
    }
    case 'position':
      return /decision/.test(l) ? `your ${sym} position needs a decision`
        : row.tone === 'action' ? `your ${sym} position needs a look`
        : `your ${sym} position is open`;
    case 'alert':
      return `${sym} did what you were waiting for`;
    case 'portfolio':
      return first ? lowerFirst(row.sub ?? 'your book needs a look') : null;
    default:
      if (isFailed(l)) return `${sym}'s setup failed`;
      if (/ready|approach|entry|triggered|confirmed/.test(l)) return first ? `${sym} has the cleanest setup` : `${sym} is ready too`;
      if (/forming|building/.test(l)) return `${sym} is still forming`;
      if (/resistance/.test(l)) return `${sym} is approaching resistance`;
      if (/support/.test(l)) return `${sym} is sitting on support`;
      return first ? `${sym} is the one to look at` : null;
  }
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]}, and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** "I checked your list and your 2 open positions before the bell." */
function checkedSentence(standing: Standing | null, positionsOpen: number | null, market: MarketStatus | null): string {
  const when = market ? WHEN_CHECKED[market.status] ?? '' : '';
  const pos = positionsOpen && positionsOpen > 0 ? ` and your ${positionsOpen} open position${positionsOpen === 1 ? '' : 's'}` : '';
  if (!standing) return `I checked your list${pos}${when}.`;
  const failed = standing.checks.filter((c) => !c.ok).map((c) => lowerFirst(c.label));
  const base = `I checked your list${pos}${when}.`;
  if (!failed.length) return base;
  return `${base} I could not read ${joinClauses(failed)} just now, so this is not the whole picture.`;
}

export type OpeningInput = {
  now: Date;
  name?: string | null;
  stage: Stage | null | undefined;
  mode: GoalMode;
  /** The payload, live or remembered. Null when nothing ever arrived. */
  data: (Pick<HomeV5, 'priority' | 'also_watching' | 'agent' | 'market'>) | null;
  standing: Standing | null;
  /** The brief the opening introduces (so the words and the rows agree). */
  rows: BriefRow[];
  /** Set when `data` is a remembered payload, not a live one. */
  rememberedAt?: string | null;
  error?: string | null;
};

/**
 * Kai's first message. Greeting, what he checked, what he found — in that
 * order and in plain words — and nothing he did not find.
 */
export function composeOpening(input: OpeningInput): string {
  const hello = greeting(input.now, input.name);
  if (!input.data) {
    return `${hello} I couldn't pull your read just now. Nothing here is made up — your alerts and positions are where you left them.`;
  }
  const data = input.data;
  const positionsOpen = data.agent?.positions_open ?? null;
  const checked = checkedSentence(input.standing, positionsOpen, data.market ?? null);
  const stale = input.rememberedAt ? ` This is what I read at ${clockLabel(new Date(input.rememberedAt))} — I can't reach the market right now.` : '';

  // Three at most, and the calendar gets one of them when it has anything:
  // a report date is the one item on the list with a clock on it.
  const said = input.rows.map((r, i) => ({ r, c: clauseFor(r, i === 0) })).filter((x): x is { r: BriefRow; c: string } => !!x.c);
  const market = said.filter((x) => x.r.kind !== 'earnings').slice(0, 2);
  const dated = said.filter((x) => x.r.kind === 'earnings').slice(0, 1);
  const rest = said.filter((x) => !market.includes(x) && !dated.includes(x));
  const clauses = [...market, ...dated, ...rest].slice(0, 3).map((x) => x.c);

  /**
   * BEGINNERS ARE NEVER SOLD A TRADE. Same facts, different job: Kai names
   * what moved as something to understand, and points at the lesson. No
   * "cleanest setup", no "your move".
   */
  if (input.stage !== 'trade_ready' && input.stage !== 'developing') {
    const names = input.rows.filter((r) => r.symbol).map((r) => r.symbol as string);
    const uniq = [...new Set(names)].slice(0, 3);
    const moved = uniq.length
      ? ` ${joinClauses(uniq)} ${uniq.length === 1 ? 'is' : 'are'} on your list today — tap one and I'll explain what it means in plain words.`
      : ' Nothing on your list needs you today.';
    return `${hello} Nothing here asks you to trade.${moved} Your next lesson is ready when you are.${stale}`;
  }

  if (!clauses.length) {
    const verified = input.standing?.state === 'quiet';
    return verified
      ? `${hello} ${checked} Nothing needs a decision right now — I'm not going to invent one.${stale}`
      : `${hello} ${checked} I didn't find anything that needs you, but I can't promise that's the whole list.${stale}`;
  }
  return `${hello} ${checked} ${cap(joinClauses(clauses))}.${stale}`;
}

/* ==================================================================== */
/* Follow-up actions                                                      */
/* ==================================================================== */

/** What one Kai response was about — read off its objects, never guessed. */
export type ResponseObjects = {
  /** Setups Kai put in the response, in order. */
  setups: { symbol: string; entry?: string | null }[];
  /** A comparison's subject, if there was one. */
  comparison: KaiComparison | null;
  /** The brief, if this response is the opening. */
  brief: TodayBrief | null;
  /** Known tickers named in the response's words. */
  mentioned: string[];
  /** Kai proposed an action (an alert draft): the next step is already on screen. */
  hasAction: boolean;
};

/** Known tickers named as whole words in Kai's text. Only tickers the app already holds count. */
export function mentionedSymbols(text: string, known: readonly string[]): string[] {
  const out: string[] = [];
  for (const k of known) {
    if (!k) continue;
    const re = new RegExp(`(^|[^A-Za-z0-9$])\\$?${k.replace(/[.]/g, '\\.')}(?![A-Za-z0-9])`);
    if (re.test(text) && !out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * Up to three follow-ups for one response. Every one is built from something
 * in the response — a setup, a comparison, the brief's rows, a ticker Kai
 * named — so a reply about nothing gets no chips rather than generic ones.
 * `kaiAvailable:false` drops every chip that needs Kai to answer.
 */
export function followUps(
  obj: ResponseObjects,
  ctx: { stage: Stage | null | undefined; kaiAvailable: boolean; others: readonly string[]; hasReport?: boolean },
): FollowUp[] {
  if (obj.hasAction) return [];
  const learning = ctx.stage !== 'trade_ready' && ctx.stage !== 'developing';
  const out: FollowUp[] = [];
  const push = (f: FollowUp) => { if (!out.some((x) => x.id === f.id)) out.push(f); };

  const lead = obj.setups[0]?.symbol ?? obj.comparison?.subject.match(/\b[A-Z]{1,5}\b/)?.[0] ?? obj.mentioned[0] ?? null;
  const other = [...obj.setups.slice(1).map((s) => s.symbol), ...obj.mentioned, ...ctx.others].find((s) => s && s !== lead) ?? null;

  if (obj.brief) {
    const symbols = obj.brief.rows.map((r) => r.symbol).filter((s): s is string => !!s);
    if (obj.brief.rows.length >= 2) {
      push({ id: 'first', label: 'What should I watch first?', icon: 'question', kind: 'ask', task: 'What should I watch first?' });
    }
    const top = symbols[0];
    if (top) {
      push(learning
        ? { id: `explain:${top}`, label: `What is ${top}?`, icon: 'question', kind: 'ask', task: `Explain ${top} to me in plain words — what does the company do, and why is it on my list?` }
        : { id: `walk:${top}`, label: `Walk me through ${top}`, icon: 'thesis', kind: 'ask', task: `Walk me through ${top} — what is the setup and where would it fail?` });
    }
    const event = obj.brief.rows.find((r) => r.kind === 'earnings' && r.symbol);
    if (event?.symbol) {
      push({ id: `report:${event.symbol}`, label: `${event.symbol} earnings`, icon: 'report', kind: 'open', open: { kind: 'surface', surface: 'earnings', symbol: event.symbol } });
    }
    // The report Kai wrote this morning, when there is one — already written,
    // so reading it costs nothing and works while he is offline.
    if (ctx.hasReport) push({ id: 'morning-report', label: 'Morning report', icon: 'report', kind: 'open', open: { kind: 'reveal', what: 'report' } });
  } else if (obj.setups.length && lead) {
    push(learning
      ? { id: `simple:${lead}`, label: 'Explain it simply', icon: 'question', kind: 'ask', task: `Explain the ${lead} setup in plain words, like I'm new to this.` }
      : { id: `thesis:${lead}`, label: 'Explain the thesis', icon: 'thesis', kind: 'ask', task: `Explain the thesis on ${lead}.` });
    if (other && !learning) push({ id: `compare:${other}`, label: `Compare ${other}`, icon: 'compare', kind: 'ask', task: `Compare ${lead} with ${other}.` });
    if (!learning) {
      const entry = obj.setups[0]?.entry ? clean(obj.setups[0].entry) : '';
      push({ id: `alert:${lead}`, label: 'Set alert', icon: 'alert', kind: 'ask', task: entry ? `Set an alert on ${lead} at the entry, ${entry}.` : `Set an alert on ${lead} at the entry.` });
    } else {
      push({ id: `chart:${lead}`, label: `Show ${lead} on the chart`, icon: 'chart', kind: 'open', open: { kind: 'surface', surface: 'chart', symbol: lead } });
    }
  } else if (obj.comparison) {
    push({ id: 'fits', label: 'Which fits my plan?', icon: 'question', kind: 'ask', task: 'Between those, which fits my plan and my risk?' });
    if (lead) push({ id: `chart:${lead}`, label: `Show ${lead} on the chart`, icon: 'chart', kind: 'open', open: { kind: 'surface', surface: 'chart', symbol: lead } });
  } else if (lead) {
    push({ id: `chart:${lead}`, label: `Show ${lead} on the chart`, icon: 'chart', kind: 'open', open: { kind: 'surface', surface: 'chart', symbol: lead } });
    if (other && !learning) push({ id: `compare:${other}`, label: `Compare ${other}`, icon: 'compare', kind: 'ask', task: `Compare ${lead} with ${other}.` });
    if (!learning) push({ id: `alert:${lead}`, label: 'Set alert', icon: 'alert', kind: 'ask', task: `Set an alert on ${lead}.` });
  }

  return out.filter((f) => f.kind === 'open' || ctx.kaiAvailable).slice(0, 3);
}

/* ==================================================================== */
/* "Kai will update you …"                                               */
/* ==================================================================== */

/**
 * The monitoring line under a response, or null. It exists ONLY when an alert
 * the member switched on is about one of the response's tickers. The alert's
 * own words are repeated; when they do not read as a condition they are
 * quoted rather than rephrased into a promise.
 */
export function monitoringLine(symbols: readonly string[], agent: HomeAgent | null | undefined): string | null {
  if (!agent || !symbols.length) return null;
  const want = new Set(symbols.map((s) => s.toUpperCase()));
  const hits = agent.monitoring.filter((m) => m.symbol && want.has(m.symbol));
  if (!hits.length) return null;
  const m = hits[0];
  const more = hits.length > 1 ? ` (and ${hits.length - 1} more alert${hits.length === 2 ? '' : 's'})` : '';
  return m.clause
    ? `Kai will update you ${m.clause.replace(/[.]+$/, '')}${more}.`
    : `Kai is watching: “${m.plain.replace(/[.]+$/, '')}”${more}.`;
}

/**
 * What Kai says when he certainly cannot answer. A copy of
 * `KAI_OFFLINE_PLAIN` in packages/shared/api.ts (the phone imports types only
 * from there); `scripts/home-agent-test.mts` fails if the two ever differ.
 */
export const KAI_OFFLINE_PLAIN =
  "I'm offline right now, so I can't answer new questions. Your alerts and positions are still being watched.";

/* ==================================================================== */
/* Where the learning card goes, and whether today continues             */
/* ==================================================================== */

/**
 * The owner's brief for this screen: Beginner meets the learning path near the
 * top, straight under Kai's opening; everyone else meets the market first and
 * the path below the brief. A missing stage is read as beginner, like every
 * other reader in the app.
 */
export function learningPlacement(stage: Stage | null | undefined): 'top' | 'below' {
  return !stage || stage === 'beginner' ? 'top' : 'below';
}

/**
 * The conversation today's opening should continue, or null. Only one the
 * member spoke in TODAY (their calendar) — yesterday's thread is in the
 * drawer, and pulling it under this morning's brief would make the brief look
 * like it was part of that old exchange.
 */
export function resumeToday(conv: { id: string | null; last_message_at: string | null } | null | undefined, now: Date): string | null {
  if (!conv?.id || !conv.last_message_at) return null;
  const at = new Date(conv.last_message_at);
  if (Number.isNaN(at.getTime())) return null;
  return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()
    ? conv.id
    : null;
}

/** R multiple from level strings like "> 504" / "540" / "< 460". Null unless all three are numbers and the risk is real. */
export function rMultiple(entry?: string | number | null, stop?: string | number | null, target?: string | number | null): number | null {
  const n = (v: string | number | null | undefined) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  const e = n(entry); const s = n(stop); const t = n(target);
  if (e == null || s == null || t == null) return null;
  const risk = Math.abs(e - s);
  if (risk <= 0) return null;
  const reward = Math.abs(t - e);
  // A target on the same side as the stop is not a plan; say nothing.
  if ((t - e) * (e - s) <= 0) return null;
  return Math.round((reward / risk) * 10) / 10;
}

/**
 * KAI'S LATEST LINE, AS A CAPTION OVER THE CHART (moved here from the retired
 * war-room rules, unchanged).
 *
 * Only while he is writing: once the reply is finished it is in the
 * conversation below, and a caption repeating it over the candles would be the
 * same sentence twice. The last sentence is what he is saying NOW, so that is
 * what the caption shows, cut to fit two lines.
 */
export function chartCaption(items: readonly WallItem[], streaming: boolean, max = 120): string | null {
  if (!streaming) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === 'user_text') return null;
    if (it.kind !== 'kai_text') continue;
    const text = it.text.replace(/▍/g, '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
    let last = sentences[sentences.length - 1].trim();
    // A sentence of two words is the start of the next one; show the one before too.
    if (last.split(' ').length < 4 && sentences.length > 1) {
      last = `${sentences[sentences.length - 2].trim()} ${last}`;
    }
    return last.length > max ? `…${last.slice(last.length - max + 1).trimStart()}` : last;
  }
  return null;
}
