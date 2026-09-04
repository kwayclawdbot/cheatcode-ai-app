/**
 * Kai's wake-up — the first thing he says on the first open of a day.
 *
 * This module is pure. It takes what the app already knows (`GET /home`) and a
 * clock, and returns the message. No React, no network, no model call, so it is
 * testable (`scripts/wakeup-test.mts`) and it can never be the reason the
 * screen is slow.
 *
 * The rules it enforces, from the brief:
 *   - greet by name and market state (UX.md "daily routine")
 *   - say the SINGLE most relevant thing — derived from the payload, never invented
 *   - flag overnight movement on a name the user actually has something riding on
 *   - end by offering a direction, and every direction must lead somewhere real
 *   - when there is nothing, say that honestly instead of sounding busy
 *   - when the data is missing, still greet — degrade the content, not the moment
 */
import type { HomeV5 } from '../../lib/types';

export type WakeDirection =
  /** push an existing route (the server's own action route, or a tab) */
  | { id: string; label: string; kind: 'route'; route: string }
  /** drop the morning report into the conversation */
  | { id: string; label: string; kind: 'briefing' }
  /** drop the "also watching" rows into the conversation */
  | { id: string; label: string; kind: 'watching' }
  /** ask the home payload for itself again */
  | { id: string; label: string; kind: 'retry' };

export type Wakeup = {
  /** local calendar day — the once-a-day key */
  date: string;
  /** "Morning, Kway." */
  greeting: string;
  /** "The market is open. Futures flat, CPI print at 10:00 is the day's risk." */
  state: string | null;
  /** the one relevant thing, one sentence */
  lead: string;
  /** the numbers behind it, in the server's own words */
  evidence: string | null;
  /** one overnight flag on a name the user cares about */
  aside: string | null;
  /** the question — this is what stops the screen dead-ending */
  question: string;
  /** 2–3 offers, each of which goes somewhere that exists */
  directions: WakeDirection[];
  /** ISO time the message was first shown */
  at: string;
  /** true when the payload never arrived — the greeting still stands */
  degraded: boolean;
};

/** Local calendar day, `YYYY-MM-DD`. Local, not UTC: "today" is the user's. */
export function localDay(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Strip the markdown the briefing lines carry, so stored text renders plainly. */
const plain = (s: string) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();

/** Lowercase a label's first letter unless it opens on an acronym or ticker. */
function lowerFirst(s: string): string {
  if (!s) return s;
  if (s.length > 1 && s[1] === s[1].toUpperCase() && /[A-Z]/.test(s[1])) return s;
  return s[0].toLowerCase() + s.slice(1);
}

const stop = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

function timeOfDay(now: Date): 'Morning' | 'Afternoon' | 'Evening' {
  const h = now.getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

export function greetingFor(now: Date, name?: string | null): string {
  const who = name && name.trim() ? `, ${name.trim()}` : '';
  return `${timeOfDay(now)}${who}.`;
}

const SESSION: Record<HomeV5['market']['status'], string> = {
  pre: 'Pre-market — the bell has not rung yet.',
  open: 'The market is open.',
  post: 'After hours — the bell has rung.',
  closed: 'The market is closed.',
  holiday: 'Markets are closed today.',
};

/** The market state sentence: the session, plus whatever the report says about it. */
function stateLine(data: HomeV5): string {
  const parts: string[] = [SESSION[data.market.status] ?? 'Checking the tape.'];
  const marketLine = data.briefing?.lines.find((l) => l.tone === 'market');
  if (marketLine) parts.push(stop(plain(marketLine.text)));
  if (data.market.freshness === 'stale') parts.push('My prices are running behind, so treat the levels as approximate.');
  return parts.join(' ');
}

/** The one relevant thing, from the derived priority object. */
function leadFor(data: HomeV5): { lead: string; evidence: string | null } {
  const p = data.priority;
  if (!p) {
    return {
      lead: 'Nothing on your list needs a decision right now.',
      evidence: 'I went through your setups, your alerts and your open positions. That is the whole answer — I am not going to manufacture one.',
    };
  }
  const sym = p.symbol ?? null;
  const state = p.state_label ? lowerFirst(p.state_label.trim()) : null;
  const tail = state ? ` — ${state}` : '';

  let lead: string;
  switch (p.kind) {
    case 'alert':
      lead = sym ? `${sym} did the thing you were watching for${tail}.` : `Something you were watching happened${tail}.`;
      break;
    case 'position':
      lead = sym ? `Your ${sym} position needs a decision${tail}.` : `A position of yours needs a decision${tail}.`;
      break;
    case 'portfolio':
      lead = stop(p.title ?? 'Your book is steady — nothing has moved enough to act on');
      break;
    default:
      lead = sym ? `${sym} is the one worth looking at${tail}.` : stop(p.title ?? `One setup is worth looking at${tail}`);
  }

  const evidence = [p.chart_note, p.detail].filter((s): s is string => !!s && !!s.trim()).join(' · ');
  return { lead, evidence: evidence || null };
}

/**
 * One overnight flag, and only one. `also_watching` rows already carry what
 * moved on the names the user holds or watches; we surface the one that is
 * actually asking for attention and leave the rest behind a direction.
 */
function asideFor(data: HomeV5): string | null {
  const row = data.also_watching.find((r) => r.tone === 'attention');
  if (!row) return null;
  return `${row.symbol} also moved: ${lowerFirst(plain(row.text))}.`;
}

function directionsFor(data: HomeV5): WakeDirection[] {
  const out: WakeDirection[] = [];
  const p = data.priority;

  if (p) {
    out.push({
      id: 'wd-primary',
      kind: 'route',
      route: p.primary_action.route,
      label: p.symbol ? `Show me ${p.symbol}` : p.primary_action.label,
    });
  }
  if (data.also_watching.length) {
    out.push({ id: 'wd-watching', kind: 'watching', label: 'What else moved?' });
  }
  if (data.briefing) {
    out.push({ id: 'wd-briefing', kind: 'briefing', label: 'The full report' });
  }
  // Always at least two ways out of the screen, both of which are real tabs.
  out.push({ id: 'wd-trade', kind: 'route', route: '/trade', label: 'Find me something' });
  out.push({ id: 'wd-alerts', kind: 'route', route: '/alerts', label: 'Check my alerts' });

  return out.slice(0, 3);
}

/**
 * The wake-up when `GET /home` never answered.
 *
 * It is still a greeting, not an error card: the name and the clock are known
 * locally and need no network. Kai says plainly that he is missing his read
 * rather than showing a spinner where a sentence should be.
 */
export function degradedWakeup(opts: { name?: string | null; now?: Date; reason?: string | null }): Wakeup {
  const now = opts.now ?? new Date();
  return {
    date: localDay(now),
    greeting: greetingFor(now, opts.name),
    state: null,
    lead: "I could not pull your morning read just now.",
    evidence: 'Nothing here is made up — I would rather come up short than guess. Your alerts and your positions are still exactly where you left them.',
    aside: null,
    question: 'Want me to try again, or go straight to your alerts?',
    directions: [
      { id: 'wd-retry', kind: 'retry', label: 'Try again' },
      { id: 'wd-alerts', kind: 'route', route: '/alerts', label: 'Check my alerts' },
    ],
    at: now.toISOString(),
    degraded: true,
  };
}

/** The wake-up for a real payload. */
export function composeWakeup(opts: { name?: string | null; data: HomeV5 | null; now?: Date; reason?: string | null }): Wakeup {
  const now = opts.now ?? new Date();
  if (!opts.data) return degradedWakeup({ name: opts.name, now, reason: opts.reason });

  const data = opts.data;
  const { lead, evidence } = leadFor(data);
  const quiet = !data.priority;

  // A degraded payload still has a real market block and real rows; only Kai's
  // written report is missing, and the priority is derived from the database.
  const reportMissing = !!data.degraded && !data.briefing;

  return {
    date: localDay(now),
    greeting: greetingFor(now, opts.name),
    state: stateLine(data),
    lead,
    evidence: reportMissing
      ? [evidence, "My written report did not come through this morning — everything above is read straight off your account."].filter(Boolean).join(' ')
      : evidence,
    aside: asideFor(data),
    question: quiet ? 'Want to go looking, or leave it be?' : 'Where do you want to start?',
    directions: directionsFor(data),
    at: now.toISOString(),
    degraded: false,
  };
}

/** "8:42 AM" — the mark on a wake-up the user is seeing for the second time. */
export function shownAtLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'earlier today';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
