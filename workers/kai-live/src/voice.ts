/**
 * The SHOW register.
 *
 * This is not `apps/api/src/lib/kai/voice.ts`. That file answers "how does Kai
 * talk to THIS user", branching on an experience setting the user chose. A show
 * has no user — it has an audience, and the audience is mixed: the YouTube
 * review show is marketing aimed at beginners, and some of the people watching
 * have traded for ten years. So the register is fixed, and the accommodation is
 * the GLOSSARY: define a term the first time it appears, then use it plainly.
 *
 * The definitions are lifted from the app's glossary verbatim, on purpose. A
 * viewer who learns what an invalidation is from the show and then opens the app
 * should meet the same sentence, not a paraphrase — that is the difference
 * between a product with a vocabulary and a product with a tone.
 *
 * WHAT IS BANNED AND WHY IT IS A LIST RATHER THAN A VIBE.
 * The banned register below is not taste. Every entry is a failure that shipped
 * on the deprecated show and had to be corrected after the fact: "notably" and
 * "moreover" turn a person into a research note read aloud; passive voice makes
 * a chart sound like it happened to nobody; three-adjective stacks are what a
 * model writes when it has nothing to say; "as you can see on the chart" tells
 * people something they can see; "boom" is corny on stocks Twitter and reads as
 * a bot doing an impression of a trader. A list can be checked. A vibe cannot,
 * and nobody is watching this generation.
 */
import { LIVE_MARK_TARGETS, type LiveGlossaryTerm } from '../../../packages/shared/live.ts';

/* ------------------------------------------------------------------ */
/* Glossary — the app's wording, unchanged                             */
/* ------------------------------------------------------------------ */

export const SHOW_GLOSSARY: Record<string, string> = {
  trigger: 'The trigger is the price that turns a watched idea into an actionable one.',
  entry: 'The entry is the price you plan to get in at, decided before you are in it.',
  stop: 'A stop is the price where you get out because the idea was wrong.',
  target: 'A target is where the plan takes profit, decided before you enter.',
  invalidation: 'The invalidation is the price that proves the idea wrong, not just losing.',
  support: 'Support is a price where buyers have stepped in before.',
  resistance: 'Resistance is a price where sellers have stepped in before.',
  volume: 'Volume is how many shares changed hands — more of it makes a move more believable.',
  thesis: 'A thesis is the reason you own something and what would make you stop.',
  confirmed: 'Confirmed means the move Kai was waiting for actually happened — not just a guess.',
  cleared: 'Cleared the level means price moved above a price that had been holding it back.',
  'average true range': 'Average true range is how far this stock usually moves in a day.',
  'relative strength': 'Relative strength is a zero to one hundred reading of how one-sided the recent buying or selling has been.',
  'reward against risk': 'Reward against risk compares what you stand to make with what you stand to lose.',
  timeframe: 'A timeframe is how much time each candle on the chart covers.',
  'higher timeframe': 'The higher timeframe is the slower chart — it sets the direction the faster chart trades inside.',
  breakout: 'A breakout is price leaving a range it had been stuck in.',
  pullback: 'A pullback is price coming back toward a level after moving away from it.',
};

/** Terms of the glossary that this text actually spends. Longest match first. */
export function termsUsed(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.keys(SHOW_GLOSSARY)
    .sort((a, b) => b.length - a.length)
    .filter((t) => lower.includes(t));
}

/**
 * The glossary entries this line owes the audience, given what the show has
 * already defined.
 *
 * FIRST USE ONLY. Repeating a definition every time the word appears is the
 * tone of a product that thinks nobody watching is learning anything, and over
 * a forty-minute show it is unbearable. At most two per line, because three
 * lower thirds stacked on one sentence is a wall, not a lesson.
 */
export function glossaryFor(text: string, alreadySpent: Set<string>): LiveGlossaryTerm[] {
  const out: LiveGlossaryTerm[] = [];
  for (const term of termsUsed(text)) {
    if (alreadySpent.has(term)) continue;
    if (out.some((g) => term.includes(g.term) || g.term.includes(term))) continue;
    out.push({ term, plain: SHOW_GLOSSARY[term] });
    alreadySpent.add(term);
    if (out.length === 2) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Banned register                                                     */
/* ------------------------------------------------------------------ */

/**
 * Phrases that must not appear in narration, with the reason each one is here.
 * Checked in code (`registerViolations`) as well as being told to the model,
 * because a rule that is only in a prompt is a suggestion.
 */
export const BANNED_PHRASES: { pattern: RegExp; why: string }[] = [
  { pattern: /\bnotably\b/i, why: 'research-note register' },
  { pattern: /\binterestingly\b/i, why: 'research-note register' },
  { pattern: /\bit'?s worth noting\b/i, why: 'research-note register' },
  { pattern: /\bmoreover\b/i, why: 'research-note register' },
  { pattern: /\bfurthermore\b/i, why: 'research-note register' },
  { pattern: /\bin addition\b/i, why: 'research-note register' },
  { pattern: /\bthat said,/i, why: 'research-note register' },
  { pattern: /\bto summari[sz]e\b/i, why: 'research-note register' },
  { pattern: /\bas you can see (on|in) the chart\b/i, why: 'tells the viewer what they can already see' },
  { pattern: /\bboom\b/i, why: 'corny; reads as an impression of a trader' },
  { pattern: /\bfor those who don'?t know\b/i, why: 'talks down; define inline instead' },
  { pattern: /\bdelve\b/i, why: 'nobody says this out loud' },
  { pattern: /\blet'?s dive in\b/i, why: 'filler opening' },
  { pattern: /\bin conclusion\b/i, why: 'essay register' },
  // Execution language. Kai is an analyst on this show, not a broker (spec 15
  // §5), and paper execution lives in Trade — never in a broadcast.
  { pattern: /\byour (order|position|fill)\b/i, why: 'execution language in a broadcast' },
  { pattern: /\bI (just )?(bought|sold|filled)\b/i, why: 'execution language in a broadcast' },
  { pattern: /\bbuy (it )?now\b/i, why: 'instruction to trade' },
  { pattern: /\bSuperTrend\b/i, why: 'it is CheatCode Trend Clouds, always' },
];

export type RegisterViolation = { phrase: string; why: string };

/** Every banned phrase this text contains. Empty means it may be spoken. */
export function registerViolations(text: string): RegisterViolation[] {
  const out: RegisterViolation[] = [];
  for (const b of BANNED_PHRASES) {
    const m = text.match(b.pattern);
    if (m) out.push({ phrase: m[0], why: b.why });
  }
  return out;
}

/**
 * A last-resort repair for a line that broke the register.
 *
 * Deliberately crude: it deletes the offending WORD where the word is a
 * connective ("notably", "moreover"), and deletes the whole SENTENCE where the
 * offence is the claim itself (execution language). Regenerating is always
 * better and the analyzer tries that first; this is what happens on the second
 * failure, when the choice is between a slightly clipped sentence and a show
 * that says something it must not.
 */
export function scrubRegister(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => {
    const v = registerViolations(s);
    return !v.some((x) => x.why.includes('execution') || x.why.includes('instruction'));
  });
  let out = (kept.length ? kept : sentences).join(' ');
  for (const b of BANNED_PHRASES) {
    if (b.why === 'research-note register' || b.why === 'filler opening' || b.why === 'essay register') {
      out = out.replace(new RegExp(b.pattern.source, 'gi'), '');
    }
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

/* ------------------------------------------------------------------ */
/* How the lines have to be written, for a machine to read them aloud  */
/* ------------------------------------------------------------------ */

/**
 * TTS rules. These are about the AUDIO, not the prose: a text-to-speech engine
 * reads "$558" as "dollar five five eight" and "RSI" as three letters, so the
 * script has to be written the way it should sound. Standing guidance
 * (`feedback_tts_phonetic_script`, `feedback_ticker_names`) says the same.
 */
export const TTS_RULES = `HOW TO WRITE A LINE THAT WILL BE READ ALOUD BY A MACHINE
- Company names, never ticker symbols. "Nvidia", not "N V D A". "Meta", not "META".
- Numbers as words. "two twenty seven ninety two" not "$227.92". "three percent" not "3%".
- No symbols at all: write "dollars" and "percent", never "$" or "%".
- No acronyms read as letters: "relative strength", not "RSI". "average true range", not "ATR".
- Plain spoken English. No bullet points, no headings, no lists.
- Say "CheatCode Trend Clouds". Never say "SuperTrend".`;

export const SHOW_VOICE = `HOW YOU SOUND
You are Kai, presenting a show. You are an analyst talking to a camera, not a
report being read aloud. Confident, direct, specific. The audience is mixed:
somebody who opened their first brokerage account this month and somebody who
has traded for a decade are both watching, and both should get something.

- Talk to them. "Watch what happens here." "This is the number that matters."
- Vary the length. A three-word reaction next to a full explanation is what
  energy sounds like. Every sentence the same length is what a report sounds like.
- Have an opinion. "This is heavy" beats "this could potentially indicate
  weakness". You can be wrong out loud; you cannot be vague on purpose.
- Plain definition FIRST, metaphor only as the closer. Never open on the
  metaphor. If you reach for an image, it comes after the audience already knows
  what the thing is.
- Define a term the first time you use it, in five to ten words, then use it
  freely. Do not define it twice.
- Three beats per timeframe, not a list: what happened, what it means, what
  would change your mind.

AVOID, ALWAYS
- "Notably", "interestingly", "it's worth noting", "moreover", "furthermore",
  "in addition", "that said,", "to summarize"
- Passive voice — "price is respecting these levels", not "these levels are
  being respected"
- Three-adjective stacks — "the strong, sustained, multi-week trend"
- Saying what the viewer can already see — "as you can see on the chart"
- Robotic openings — "The four-hour timeframe shows…"
- Talking down — "for those who don't know…". Define it inline and move on.
- The word "boom".

WHAT YOU ARE NOT
You are an analyst, not a broker. Never tell anyone to buy or sell, never
describe an order, a fill or a position as though it is theirs. You explain what
the chart is doing and what would prove the idea wrong.`;

/**
 * The marker grammar, as the model is told it.
 *
 * THE MODEL NEVER WRITES A NUMBER INTO A MARKER. It writes WHICH level it means
 * and the resolver looks the price up on the setup. That split is the whole
 * anti-invention design: the model is allowed to be wrong about emphasis and
 * cannot be wrong about a price, because it is never given the opportunity to
 * type one.
 */
export const MARKER_GRAMMAR = `MARKING THE CHART
Put markers inline, immediately BEFORE the words that describe them. Markers are
never spoken — they are instructions to the chart, removed before the line is read.

  [MARK:<level>]     draw that level and point at it
  [ZOOM:<level>]     move the camera to the candle that made that level matter
  [TF:<timeframe>]   switch the chart to that timeframe (D, 4h, 1h, 15m)
  [COMPARE:prior]    look back at the prior session, then come back
  [NOTE:"..."]       put a short note on the chart (six to twelve words)

<level> is one of: ${LIVE_MARK_TARGETS.join(', ')}. Nothing else resolves.

YOU MUST NOT WRITE A PRICE INSIDE A MARKER, and you must not invent one in the
sentence either. Name the level — "the trigger", "the stop" — and the chart puts
the number on screen. If a level you want does not exist in the DATA section
below, you do not have it: say what you can say without it. A number that is not
in the data is a number that will be removed, and the sentence with it.

Four to seven markers per timeframe, at least one of which moves the camera.`;

/* ------------------------------------------------------------------ */
/* Saying a company's name out loud                                    */
/* ------------------------------------------------------------------ */

const LEGAL_SUFFIXES =
  /\s*(,?\s*(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|s\.?a\.?|n\.?v\.?)\.?)+$/i;
const SHARE_CLASS = /\s*(class\s+[a-z]\b|common stock|ordinary shares?|depositary shares?|trust|etf)\b.*$/i;

/**
 * "Meta Platforms, Inc. Class A Common Stock" → "Meta Platforms".
 *
 * The reference data carries the LEGAL name because that is what a filing says.
 * A person introducing a segment does not read a filing out loud, and a
 * text-to-speech engine reads every word of it — the first run of this worker
 * produced a cohost saying "Meta Platforms, Inc. Class A Common Stock is next",
 * twice, in one segment. Standing guidance is full company names rather than
 * tickers ("Nvidia", not "N V D A"); this is the other half of that rule, which
 * is that a name has to be the one people actually use.
 *
 * Falls back to the symbol when trimming leaves nothing — an ETF whose whole
 * name is its share class ("SPDR S&P 500 ETF Trust") keeps enough to be
 * recognisable, and anything that trims to empty is better said as its symbol
 * than as nothing.
 */
export function speakableName(name: string | null | undefined, symbol: string): string {
  if (!name) return symbol;
  let out = name.replace(SHARE_CLASS, '').replace(LEGAL_SUFFIXES, '').replace(/[,\s]+$/, '').trim();
  if (out.length < 2) out = name.replace(LEGAL_SUFFIXES, '').replace(/[,\s]+$/, '').trim();
  return out.length >= 2 ? out : symbol;
}
