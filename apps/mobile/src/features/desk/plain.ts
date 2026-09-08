/**
 * THE DESK, IN WORDS A BEGINNER ALREADY HAS — audit F15 (P2).
 *
 * The finding: "the desk uses compact ticker rows, theme labels and states such
 * as armed, cooled, triggered and extended… a person who chose long-term
 * investing may still meet trading-like vocabulary without a simple
 * understanding of the company." Its acceptance test is the one that matters —
 * a beginner can say what the company does and why it is being watched WITHOUT
 * opening a long thesis, and watching a company does not imply an order.
 *
 * ── NOTHING IN THIS FILE WRITES ANYTHING ──────────────────────────────────
 *
 * There is a real temptation here and it must be named: the plain-English lines
 * the board asks for — "what it does", "why watch it", "what could change" —
 * are exactly the three sentences an app is most tempted to generate. This file
 * does not generate them. Every line it returns is QUOTED, verbatim, from
 * something the desk itself wrote:
 *
 *   what it does      the write-up's own WHAT THEY ACTUALLY DO section
 *   why watch it      its WHY THIS ONE / THE THEME section, or the screen's own
 *                     `why` list, or the hypothesis the search matched
 *   what could change the falsifier — the desk's single statement of what would
 *                     prove it wrong — or, failing that, its first blocker
 *
 * and every one of them carries `source`, so the screen can say where the
 * sentence came from rather than presenting the app's choice as the desk's
 * voice. Where the desk wrote none of it, the answer is `null` and the screen
 * says so. A missing sentence is a fact about the write-up.
 *
 * The only editorial act is LENGTH: the first sentence or two of a section,
 * never a paraphrase and never a truncation mid-sentence — a quote cut in half
 * is a different quote.
 *
 * Framework-free on purpose, like `thesis.ts` beside it, so the quoting rules
 * can be asserted in `scripts/setup-preview-test.mts` under plain node.
 */
import { parseThesis } from './thesis';
import type { DeskPick, IdeaGrade, WatchState } from '@shared/desk';

export type PlainNote = { text: string; source: string };

export type PlainCompany = {
  /** The business, in the desk's own words. Null when it never wrote them. */
  whatItDoes: PlainNote | null;
  /** Why this name is on the desk at all. */
  whyWatched: PlainNote | null;
  /** The main risk — the thing that would prove the argument wrong. */
  whatCouldChange: PlainNote | null;
  /** How long the desk is giving it, as a sentence rather than "2q". */
  horizon: { text: string; known: boolean };
  /** "Idea grade B+", and never just "B+". See `IDEA_GRADE_MEANS`. */
  gradeLine: string;
};

/* ------------------------------------------------------------------ */
/* quoting                                                             */
/* ------------------------------------------------------------------ */

/** Markdown emphasis and list bullets are formatting, not words. */
const clean = (s: string): string =>
  s
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The first sentence or two, whole.
 *
 * A boundary is a `.`, `!` or `?` — with any run of them taken together — that
 * is either the end of the text or followed by WHITESPACE and then a capital, a
 * digit or an opening quote. That one condition is what leaves the three
 * abbreviations this corpus is full of alone:
 *
 *   "$1.4bn"  the dot is followed by a digit with no space
 *   "U.S."    the first dot is followed by a letter with no space, and the
 *             second by a lower-case word
 *   "Inc. in" a real dot, followed by a lower-case word
 *
 * A boundary that fails the test is not a boundary and the scan simply carries
 * on; there is no backtracking into the middle of a word, which is the way a
 * regex written for this goes wrong. Where no boundary is found at all the
 * whole block comes back — a paragraph that never ends is still the desk's
 * paragraph, and cutting it at a character count would invent a full stop.
 */
export function firstSentences(text: string | null | undefined, max = 2): string | null {
  const body = clean(text ?? '');
  if (!body) return null;

  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < body.length && out.length < max; i += 1) {
    if (!'.!?'.includes(body[i])) continue;
    let end = i;
    while (end + 1 < body.length && '.!?'.includes(body[end + 1])) end += 1;
    const after = body.slice(end + 1);
    const next = after.match(/^\s+(\S)/);
    const boundary = after.trim() === '' || (!!next && /["“'(A-Z0-9]/.test(next[1]));
    i = end;
    if (!boundary) continue;
    out.push(body.slice(start, end + 1).trim());
    start = end + 1;
  }
  return out.length ? out.join(' ') : body;
}

/** The named section, if the desk wrote one under any of these headings. */
function section(thesis: string | null, names: RegExp): string | null {
  const parsed = parseThesis(thesis);
  if (!parsed.sectioned) return null;
  const found = parsed.sections.find((s) => names.test(s.name.trim().toUpperCase()));
  return found && found.body.trim() ? found.body : null;
}

/* ------------------------------------------------------------------ */
/* the three lines                                                     */
/* ------------------------------------------------------------------ */

const DOES = /^(WHAT THEY ACTUALLY DO|WHAT THE COMPANY DOES|WHAT IT DOES|THE BUSINESS)$/;
const WHY = /^(WHY THIS ONE|WHY THIS COMPANY|THE THEME)$/;

export function whatItDoes(pick: DeskPick): PlainNote | null {
  const text = firstSentences(section(pick.thesis, DOES));
  return text ? { text, source: "the desk's own write-up" } : null;
}

export function whyWatched(pick: DeskPick): PlainNote | null {
  const written = firstSentences(section(pick.thesis, WHY));
  if (written) return { text: written, source: "the desk's own write-up" };
  const first = pick.why.map((w) => w.trim()).find((w) => w.length > 0);
  if (first) return { text: clean(first), source: 'what the screen counted in its favour' };
  const hypothesis = firstSentences(pick.hypothesis);
  if (hypothesis) return { text: hypothesis, source: 'the description the search matched' };
  return null;
}

/**
 * THE MAIN RISK.
 *
 * The falsifier is the desk's own single statement of what would prove the
 * argument wrong, and it is the right answer here — but only on a write-up that
 * REACHED a verdict. On an unfinished one the field holds the brain's marker
 * saying no call was emitted, which is a fact about the document and not a
 * risk, so it is refused and the blockers are asked instead.
 */
export function whatCouldChange(pick: DeskPick): PlainNote | null {
  const falsifier = (pick.falsifier ?? '').trim();
  if (!pick.unfinished && falsifier) {
    return { text: clean(falsifier), source: 'the desk names this as what would prove it wrong' };
  }
  const blocker = pick.blockers.map((b) => b.trim()).find((b) => b.length > 0);
  if (blocker) return { text: clean(blocker), source: 'what the screen counted against it' };
  return null;
}

/* ------------------------------------------------------------------ */
/* horizon and grade                                                   */
/* ------------------------------------------------------------------ */

/**
 * The horizon as a length of time rather than a code.
 *
 * "2q" is a database value. `HorizonTrack` already renders it as "two
 * quarters", which is the desk's register; this is the investor's — a person
 * choosing long-term investing wants to know whether they are being asked for
 * months or years before they read anything else.
 */
const HORIZON_PLAIN: Record<string, string> = {
  '1q': 'Long-term view · about three months',
  '2q': 'Long-term view · about six months',
  '3q': 'Long-term view · about nine months',
  '4q': 'Long-term view · about a year',
};

export function horizonPlain(horizon: string | null): { text: string; known: boolean } {
  const key = (horizon ?? '').trim().toLowerCase();
  const known = HORIZON_PLAIN[key];
  return known
    ? { text: known, known: true }
    : { text: 'No horizon was written down for this one', known: false };
}

/**
 * WHY THE WORDS "IDEA GRADE" ARE NOT OPTIONAL.
 *
 * The audit: "its idea grade deliberately differs from an actionable trade
 * grade… make the grade explicitly an Idea grade." A bare "A−" on a desk row is
 * read as the same A− the alert card puts on a trade you could take this
 * morning, and it is not: this one says the company has the shape a company has
 * before a very big move, over quarters, with no entry, no stop and no size
 * attached. The difference has to be VISIBLE, not implied by which screen you
 * happen to be standing on.
 */
export const IDEA_GRADE_MEANS =
  'An idea grade is not a trade grade. It scores the argument for the company ' +
  'over quarters — it names no entry, no stop and no size, and it is not a ' +
  'forecast for this quarter.';

export const ideaGradeLine = (grade: IdeaGrade | null): string =>
  grade ? `Idea grade ${grade}` : 'No idea grade — the desk has not graded this one';

export function plainCompany(pick: DeskPick): PlainCompany {
  return {
    whatItDoes: whatItDoes(pick),
    whyWatched: whyWatched(pick),
    whatCouldChange: whatCouldChange(pick),
    horizon: horizonPlain(pick.horizon),
    gradeLine: ideaGradeLine(pick.grade),
  };
}

/* ------------------------------------------------------------------ */
/* the watch states, explained                                         */
/* ------------------------------------------------------------------ */

/**
 * EACH STATE IN PLAIN LANGUAGE, ON DEMAND.
 *
 * `WATCH_STATE_COPY` in `@shared/desk` is the desk's own short label and stays
 * exactly as it is — this is the second line under it, for somebody who has
 * never heard a range described as compressed. Every one of them ends where it
 * has to: these describe THE CHART, and none of them is an instruction.
 */
export const WATCH_STATE_PLAIN: Record<WatchState, string> = {
  no_base: 'The share price has not settled into a range yet, so there is no particular level to wait for.',
  coiled: 'The price has been moving in a narrowing range. That often comes before a bigger move, in either direction.',
  armed: 'The price has settled into a range and the desk has written down the level it would want to see cleared.',
  triggered: 'The price went above that level and has stayed there so far.',
  failed: 'The price went above the level and then fell back inside the range.',
  invalidated: 'The price went through the level the desk said would prove the idea wrong.',
  extended: 'The price has already run a long way from where the desk was interested.',
  cooled: 'After a move, the price has settled back into a range. The desk may write a new level for it.',
  expired: 'The time the desk gave this idea has run out. Nothing further is being measured.',
};

/**
 * The sentence that has to be on the same screen as every one of those.
 *
 * "Watching a company does not imply an order or a complete trade plan" is the
 * second half of F15's acceptance, and it is the half a state chip can most
 * easily undermine — `triggered` reads as something having been done.
 */
export const WATCH_STATE_CAVEAT =
  'These describe what the share price is doing. None of them is an ' +
  'instruction, and nothing on the desk places an order.';
