/**
 * The pattern library — one entry per pattern, and nothing else to change.
 *
 * WHY THIS IS A SIBLING OF `indicators.ts` AND NOT A NEW IDEA. An indicator is
 * arithmetic over closes that produces a curve; a pattern is a SHAPE a few bars
 * made, and what it produces is a box or a mark on one bar. Different output,
 * identical failure mode: the moment "find the gaps" is a branch in a parser and
 * a second branch in a resolver and a third hand-written name in a prompt, one of
 * them gets forgotten, and the way that shows up is Kai saying "I marked the
 * gaps" over a chart that did not move. So a pattern is a ROW, exactly as an
 * indicator is, and the parser, the resolver, the prompt and the levels tool all
 * read that one row.
 *
 * THE ANTI-INVENTION RULE, APPLIED TO A SHAPE. A box drawn on a chart is a claim
 * that a particular band of prices means something, and the only thing that makes
 * that claim checkable is that both of its edges are fields on bars that actually
 * printed. Every detector below returns prices it READ — a high, a low — and
 * never a price it worked out. A midpoint, a projection, a "roughly here" would
 * all look exactly like a measured edge once they are a rectangle on a screen,
 * which is the whole problem: a box nobody can check is indistinguishable from a
 * box that is right.
 *
 * REFUSING IS A FIRST-CLASS ANSWER HERE TOO. `REFUSED_PATTERNS` is a short closed
 * list of things a person will plausibly ask for — order blocks, liquidity
 * sweeps, head and shoulders — that this file has no honest way to find. Naming
 * them is what turns "put the order blocks on there" into a sentence instead of
 * silence. Silence reads as the chart being broken; a sentence reads as someone
 * being careful, and only one of those is true.
 *
 * NO ZOD, AND NO DEPENDENCIES AT ALL. The mobile app imports this file to label
 * and describe what came down the bridge, and the chart page it feeds is a
 * self-contained document. `indicators.ts` is dependency-free for the same
 * reason and stays that way; a validator dragged in here would be shipped to
 * every phone for the sake of shapes that are already typed at the boundary in
 * `api.ts`.
 */

/* ------------------------------------------------------------------ */
/* The row                                                             */
/* ------------------------------------------------------------------ */

/** The patterns that can actually be found and drawn. */
export type PatternId = 'fvg' | 'swing_high' | 'swing_low';

/** Named so they can be REFUSED by name. Nothing here is ever drawn. */
export type RefusedPatternId =
  | 'order_block'
  | 'liquidity_sweep'
  | 'head_and_shoulders'
  | 'elliott_wave'
  | 'double_top';

export type PatternName = PatternId | RefusedPatternId;

/** The least a bar has to be for any of this to work. */
export type PatternBar = { ts: string; o: number; h: number; l: number; c: number; v?: number | null };

/**
 * One thing found on the bars, carrying the numbers it was found FROM.
 *
 * `top` and `bottom` are the same number for a `level` — a swing high is a band
 * with no height — which keeps every match one shape and keeps the drawing code
 * from needing to know which kind it is holding before it can read a price.
 */
export type PatternMatch = {
  /** Repeated from the entry so a match on its own is enough to draw. */
  kind: 'zone' | 'level';
  /** Both edges. Every one of these is a high or a low off a bar that printed. */
  top: number;
  bottom: number;
  /** Where the shape STARTS on the time axis. */
  tsFrom: string;
  /** Null means it runs to the live edge — see the note on `detect` for fvg. */
  tsTo: string | null;
  /** The bar the shape is anchored to, for the camera and the pointer. */
  at: string;
  /** Which way the gap was left. Null for a pattern that has no direction. */
  direction: 'bullish' | 'bearish' | null;
  /** Plain English naming the actual bars this came off. Goes into the reason. */
  why: string;
};

export type PatternEntry = {
  id: PatternId;
  /**
   * Everything a person might actually say, lowercased. Matched longest-first,
   * so "fair value gap" wins over "gap" and neither is a prefix accident.
   */
  aliases: string[];
  /** A box across a band of prices, or a mark at one price. */
  kind: 'zone' | 'level';
  /**
   * THE MOST THAT MAY BE DRAWN AT ONCE, AND IT IS NOT A PERFORMANCE LIMIT.
   *
   * A year of daily bars has dozens of gaps in it. Drawing all of them is a
   * chart covered in boxes, which says "all of these matter" — and the older
   * ones mostly do not, because the whole reason a gap is interesting is that
   * price has not been back through it yet and it is still close enough to
   * matter. So the newest few are drawn, and Kai is required to say out loud how
   * many there were, because a silent cap is a lie by omission.
   */
  cap: number;
  /** How one match is written on the chart. "FVG 12 Mar". */
  label: (m: PatternMatch) => string;
  /** Singular and plural, for a sentence Kai says. */
  noun: { one: string; many: string };
  /** One sentence saying what the pattern IS, for the annotation's reason line. */
  plain: () => string;
  /**
   * PURE, and over an array of bars in time order. No clock, no network, no
   * randomness: the same bars produce the same matches forever, which is what
   * makes a fixture able to prove the arithmetic on paper.
   *
   * MOST RECENT FIRST. The cap takes from the front, so the order is part of
   * what "the 4 most recent gaps" means rather than something a caller applies
   * afterwards and could forget.
   */
  detect: (bars: PatternBar[]) => PatternMatch[];
};

/* ------------------------------------------------------------------ */
/* Small shared helpers                                                */
/* ------------------------------------------------------------------ */

const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "12 Mar", read in UTC.
 *
 * UTC ON PURPOSE. A daily bar is stamped at UTC midnight, so reading it in the
 * viewer's local zone turns it into the previous evening for anyone west of
 * Greenwich — and a box labelled with the wrong day is worse than a box labelled
 * with no day, because the wrong day is checkable and it is wrong.
 */
function dayLabel(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * The height below which a band is not a band.
 *
 * The same rule `markZone` uses to convert a zero-height zone into a level: a
 * rectangle this thin is a hairline sitting on top of nothing, and drawing one
 * claims a gap exists where the two bars effectively touched. Relative, because
 * a cent means something different on a $4 stock than on a $400 one.
 */
const thin = (top: number, bottom: number): boolean =>
  top - bottom < Math.max(0.01, Math.abs(top) * 0.0005);

/* ------------------------------------------------------------------ */
/* The detectors                                                       */
/* ------------------------------------------------------------------ */

/**
 * A fair value gap: three candles in a row that left a band of prices untraded.
 *
 * THE DEFINITION, AND IT IS THE THREE-CANDLE ONE. Looking at bars i−2, i−1 and
 * i, the gap is between the OUTER two and the middle candle is the one that ran
 * through the space:
 *
 *   BULLISH  bars[i−2].h < bars[i].l   the zone is [bars[i−2].h, bars[i].l]
 *   BEARISH  bars[i−2].l > bars[i].h   the zone is [bars[i].h, bars[i−2].l]
 *
 * Nothing is averaged, nothing is padded, and both edges are fields on bars that
 * printed. That is what lets a person put a ruler on the screen and check it.
 *
 * ANCHORED TO THE MIDDLE CANDLE, which is the bar that MADE the gap — the big
 * one that jumped the distance. Anchoring to the first would start the box three
 * days before anything happened, and anchoring to the third would start it after
 * the event it is about.
 *
 * `tsTo` IS LEFT NULL, so the box runs to the live edge. An unfilled gap is not
 * a thing that happened between two dates; it is a band that is still sitting
 * there, and a rectangle that stops halfway across the plot says it expired.
 *
 * ONLY UNFILLED ONES COME BACK. A gap a later bar has traded all the way across
 * is not a level anybody trades — it is history — and the request this exists to
 * answer is "the recent gaps", which means the ones still open. A later bar
 * whose own range covers the whole band has filled it, and it is dropped.
 */
function detectFvg(bars: PatternBar[]): PatternMatch[] {
  const out: PatternMatch[] = [];
  // Backwards, so the newest gap is the first thing in the list and the cap
  // takes the ones nearest the right-hand edge.
  for (let i = bars.length - 1; i >= 2; i--) {
    const a = bars[i - 2];
    const mid = bars[i - 1];
    const c = bars[i];
    if (!fin(a.h) || !fin(a.l) || !fin(c.h) || !fin(c.l)) continue;

    let top: number;
    let bottom: number;
    let direction: 'bullish' | 'bearish';
    if (a.h < c.l) {
      bottom = a.h;
      top = c.l;
      direction = 'bullish';
    } else if (a.l > c.h) {
      bottom = c.h;
      top = a.l;
      direction = 'bearish';
    } else {
      continue;
    }
    if (thin(top, bottom)) continue;

    // FILLED, AND THEREFORE NOT REPORTED. Only bars AFTER the third candle
    // count: the middle one is the bar that made the gap and is expected to
    // span it, and counting it would mean no gap ever qualified.
    let filled = false;
    for (let j = i + 1; j < bars.length; j++) {
      const b = bars[j];
      if (!fin(b.h) || !fin(b.l)) continue;
      if (b.l <= bottom && b.h >= top) {
        filled = true;
        break;
      }
    }
    if (filled) continue;

    const first = dayLabel(a.ts);
    const third = dayLabel(c.ts);
    const middle = dayLabel(mid.ts);
    const why =
      direction === 'bullish'
        ? `The ${first} bar's high of $${round(a.h)} never met the ${third} bar's low of $${round(c.l)}, and the ${middle} candle ran straight through the space between them. Nothing since has traded all the way back across it.`
        : `The ${first} bar's low of $${round(a.l)} never met the ${third} bar's high of $${round(c.h)}, and the ${middle} candle dropped straight through the space between them. Nothing since has traded all the way back across it.`;

    out.push({
      kind: 'zone',
      top,
      bottom,
      tsFrom: mid.ts,
      tsTo: null,
      at: mid.ts,
      direction,
      why,
    });
  }
  return out;
}

/**
 * A swing high or a swing low, on the 3-bar fractal.
 *
 * MIRRORED FROM `fractals` IN apps/api/src/lib/market/key-levels.ts, deliberately
 * and character for character: a bar whose high beats the bar either side of it,
 * strictly. It is mirrored rather than imported because that file lives in the
 * API app and pulls in the whole market layer, and this one is imported by the
 * mobile bundle — but the definition must not drift, because the same turn shown
 * as a swing in the levels rail and as a different swing on the chart is the
 * chart contradicting itself in front of the user. `chart-vocabulary-test` runs
 * both over the same bars.
 *
 * The first and last bars can never qualify: a fractal needs a bar on each side,
 * and calling the newest bar a swing high the moment it prints would mean every
 * new high is a turning point until the next bar disagrees.
 */
function detectSwing(bars: PatternBar[], side: 'high' | 'low'): PatternMatch[] {
  const out: PatternMatch[] = [];
  for (let i = bars.length - 2; i >= 1; i--) {
    const prev = bars[i - 1];
    const bar = bars[i];
    const next = bars[i + 1];
    const price = side === 'high' ? bar.h : bar.l;
    if (!fin(price) || !fin(prev.h) || !fin(prev.l) || !fin(next.h) || !fin(next.l)) continue;
    const turns = side === 'high' ? bar.h > prev.h && bar.h > next.h : bar.l < prev.l && bar.l < next.l;
    if (!turns) continue;
    out.push({
      kind: 'level',
      top: price,
      bottom: price,
      tsFrom: bar.ts,
      tsTo: null,
      at: bar.ts,
      direction: null,
      why:
        side === 'high'
          ? `The ${dayLabel(bar.ts)} bar topped out at $${round(price)}, above the bar either side of it. That is where the move turned back down.`
          : `The ${dayLabel(bar.ts)} bar bottomed at $${round(price)}, below the bar either side of it. That is where the move turned back up.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The registry                                                        */
/* ------------------------------------------------------------------ */

export const PATTERNS: Record<PatternId, PatternEntry> = {
  fvg: {
    id: 'fvg',
    // "gap" and "gaps" land here on purpose. A person saying "mark the gaps"
    // means the untraded band, not the overnight difference between a close and
    // the next open — and the overnight one is not something this file finds, so
    // pointing the word at the thing that IS found is the honest mapping.
    aliases: ['fair value gap', 'fair-value gap', 'fair value gaps', 'imbalance', 'imbalances', 'fvgs', 'fvg', 'gaps', 'gap'],
    kind: 'zone',
    cap: 4,
    label: (m) => `FVG ${dayLabel(m.at)}`,
    noun: { one: 'gap', many: 'gaps' },
    plain: () =>
      'a band of prices three candles in a row skipped over — the first bar\'s high never reached the third bar\'s low, so almost nothing traded in the middle',
    detect: detectFvg,
  },
  swing_high: {
    id: 'swing_high',
    aliases: ['swing highs', 'swing high', 'recent highs', 'recent high', 'higher highs', 'pivot highs', 'pivot high'],
    kind: 'level',
    cap: 3,
    label: (m) => `Swing high ${dayLabel(m.at)}`,
    noun: { one: 'swing high', many: 'swing highs' },
    plain: () => 'a bar whose high is above the bar either side of it — the point where the move turned back down',
    detect: (bars) => detectSwing(bars, 'high'),
  },
  swing_low: {
    id: 'swing_low',
    aliases: ['swing lows', 'swing low', 'recent lows', 'recent low', 'lower lows', 'pivot lows', 'pivot low'],
    kind: 'level',
    cap: 3,
    label: (m) => `Swing low ${dayLabel(m.at)}`,
    noun: { one: 'swing low', many: 'swing lows' },
    plain: () => 'a bar whose low is below the bar either side of it — the point where the move turned back up',
    detect: (bars) => detectSwing(bars, 'low'),
  },
};

/** Everything that can actually be found and drawn. */
export const DRAWABLE_PATTERNS: PatternId[] = Object.keys(PATTERNS) as PatternId[];

/**
 * PATTERNS THAT ARE NAMED SO THEY CAN BE TURNED DOWN IN WORDS.
 *
 * Every one of these is a real thing traders talk about and a reasonable thing
 * to ask for. What they have in common is that finding one takes a judgement —
 * which leg counts, which sweep was the sweep, where the neckline is — and a
 * judgement dressed up as a measurement is the exact failure this whole
 * subsystem exists to prevent. A box I guessed looks identical to a box I
 * measured, so the answer is a sentence, in first person, that says which one
 * this would have been.
 */
export const REFUSED_PATTERNS: { id: RefusedPatternId; aliases: string[]; why: string }[] = [
  {
    id: 'order_block',
    aliases: ['order blocks', 'order block', 'orderblock', 'orderblocks', 'ob'],
    why: "I don't have a reliable way to find order blocks yet — I would be guessing at which candle counts, and a box I guessed looks exactly like one I measured. I can mark the gaps and the swing highs and lows instead, because those I can point at the bars for.",
  },
  {
    id: 'liquidity_sweep',
    aliases: ['liquidity sweep', 'liquidity sweeps', 'liquidity grab', 'stop hunt', 'stop run'],
    why: "I can't tell a liquidity sweep from an ordinary poke through a high — that call is a judgement about intent, and I would be dressing a guess up as a measurement. I can mark the swing highs and lows it would have run through.",
  },
  {
    id: 'head_and_shoulders',
    aliases: ['head and shoulders', 'head & shoulders', 'inverse head and shoulders', 'h&s'],
    why: "I don't have an honest way to find a head and shoulders — where the neckline goes is a choice, and two people draw it in two places. I can mark the swing highs and lows the shape would be made of and let you see it yourself.",
  },
  {
    id: 'elliott_wave',
    aliases: ['elliott wave', 'elliott waves', 'elliot wave', 'wave count'],
    why: "I don't do wave counts. Which swing is wave three is an interpretation, not a measurement, and I am not going to put one on your chart as though I had worked it out.",
  },
  {
    id: 'double_top',
    aliases: ['double top', 'double bottom', 'double tops', 'double bottoms'],
    why: "I can't call a double top for you — deciding that two highs are the same high is a judgement about how close is close enough. I can mark the swing highs themselves, and you can see how they line up.",
  },
];

/* ------------------------------------------------------------------ */
/* Reading a name                                                      */
/* ------------------------------------------------------------------ */

/**
 * Every alias from both lists, longest first.
 *
 * LONGEST FIRST IS LOAD-BEARING, exactly as it is in `indicators.ts`: "fair
 * value gap" has to be matched before "gap", and "swing highs" before "swing
 * high", or a plural request resolves as a singular one and a specific name
 * resolves as a vague one.
 */
const ALIASES: { alias: string; id: PatternName }[] = [
  ...DRAWABLE_PATTERNS.flatMap((id) => PATTERNS[id].aliases.map((alias) => ({ alias, id: id as PatternName }))),
  ...REFUSED_PATTERNS.flatMap((r) => r.aliases.map((alias) => ({ alias, id: r.id as PatternName }))),
].sort((a, b) => b.alias.length - a.alias.length);

/**
 * Read a pattern out of whatever a person or a model called it.
 *
 * IT RESOLVES THE REFUSED ONES TOO, and that is the point of them being in the
 * table. A refusal has to know WHICH pattern was asked for in order to say
 * anything useful about it, and "I can't do that" with no noun in it is not an
 * answer anybody can act on.
 */
export function parsePattern(text: string | null | undefined): PatternName | null {
  const raw = String(text ?? '').trim().toLowerCase();
  if (!raw) return null;
  const norm = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  for (const { alias, id } of ALIASES) {
    // A boundary in FRONT and no letter behind, the same shape the indicator
    // parser uses: "fvgs" must not match as "fvg" plus a stray letter, and
    // "gap" must not fire inside "gapping".
    const re = new RegExp(`(?:^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'i');
    if (re.test(norm)) return id;
  }
  return null;
}

/** Is this one of the ones that can actually be drawn? */
export function isDrawablePattern(name: PatternName | null): name is PatternId {
  return name !== null && Object.prototype.hasOwnProperty.call(PATTERNS, name);
}

/**
 * Why this one is not drawn, or null when it is drawable or unknown.
 *
 * A WHOLE SENTENCE, never a code, because the only thing that ever happens to it
 * is that Kai says it to somebody. Unknown names return null rather than a
 * refusal: a word this file has never heard of is not a pattern being turned
 * down, it is a word, and answering it with a polished apology would teach the
 * model that any noun at all is a pattern.
 */
export function patternRefusal(name: string | null | undefined): string | null {
  const id = typeof name === 'string' ? parsePattern(name) : (name ?? null);
  if (id === null || isDrawablePattern(id)) return null;
  return REFUSED_PATTERNS.find((r) => r.id === id)?.why ?? null;
}

/** The label on the chart for one match. */
export function patternLabel(id: PatternId, m: PatternMatch): string {
  return PATTERNS[id].label(m);
}

/** One sentence saying what the pattern IS. */
export function patternPlain(id: PatternId): string {
  return PATTERNS[id].plain();
}

/**
 * Find one pattern on some bars, newest first and cut to its cap.
 *
 * `found` IS RETURNED ALONGSIDE THE CAPPED LIST and is not decoration. Kai is
 * required to say how many there were whenever the cap bit, so the number has to
 * survive the capping — a caller that only got the four could only say "here are
 * four", which reads as "there are four" and is a quiet untruth.
 */
export function findPattern(id: PatternId, bars: PatternBar[]): { matches: PatternMatch[]; found: number; cap: number } {
  const entry = PATTERNS[id];
  const all = entry.detect(bars);
  return { matches: all.slice(0, entry.cap), found: all.length, cap: entry.cap };
}
