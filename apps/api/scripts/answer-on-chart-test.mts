/**
 * LIVE-8 — does a gesture land on the word it is about?
 *
 *   cd apps/api && npx tsx scripts/answer-on-chart-test.ts
 *
 * THE ONE MEASUREMENT THAT MATTERS. Everything else in this lane is a plumbing
 * question with a typecheck behind it. This is the question that decides whether
 * the feature works at all: when the chart moves, is it moving to the thing Kai
 * is saying at that instant? An answer where the cursor is on the stop while he
 * talks about resistance is not a worse answer, it is a wrong one — the user
 * believes the chart.
 *
 * HOW IT IS MEASURED. Every action carries `t_offset_ms`, measured from the
 * first word. The pacing that produced it is linear, so it inverts exactly:
 *
 *     position = t_offset_ms / duration_ms * spoken.length
 *
 * Take the SENTENCE containing that position, plus its neighbours, and assert
 * the level the action names appears in them.
 *
 * NEIGHBOURING SENTENCES, NOT A FIXED CHARACTER WINDOW. A ±70-character window
 * slices words in half — it matches "…sistance" and scores a hit that a reader
 * would call a miss, and it cuts a long sentence off from its own subject. The
 * sentence is the unit a person actually hears.
 *
 * No network, no database, no model: the director's LLM call is stubbed with a
 * fixed set of cues, so what is under test is the placement — the injectors, the
 * character offsets and the pacing — rather than a model's judgement on the day.
 *
 * CURRENT MEASURED FLOOR: 95%. The show measures 97%. Below 95% is a regression
 * and the thing that regressed is almost always an injector choosing a subject
 * that has gone stale.
 */
import { direct, type Cue, type DirectorLevel } from '@shared/director';
import { LIVE_ZONE_TARGETS, parseMarkers, stripMarkers } from '@shared/live';
import { spokenDurationMs } from '../src/lib/kai/chart-answer';

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}
function section(title: string): void {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/* A chart with a plan on it                                           */
/* ------------------------------------------------------------------ */

const lvl = (
  name: string,
  price: number,
  kind: DirectorLevel['kind'],
  ts: string | null = null,
): [string, DirectorLevel] => [
  name,
  { name, price, kind, reason: `The ${name}.`, provenance: `Test ${name}.`, ts },
];

const TABLE = new Map<string, DirectorLevel>([
  lvl('trigger', 628.4, 'trigger', '2026-08-27T00:00:00.000Z'),
  lvl('stop', 601.2, 'stop'),
  lvl('target', 671.0, 'target'),
  lvl('support', 598.5, 'support'),
  lvl('resistance', 641.9, 'resistance'),
]);

/**
 * A real-shaped answer to "why is this only a B-plus?" — the acceptance
 * question. Four sentences, each about a different level, which is what makes it
 * a fair test: an answer that only ever says "trigger" cannot catch a director
 * that only ever points at the trigger.
 */
const ANSWER = [
  'Two things hold it back.',
  'It has not cleared the resistance yet, and until it does the breakout is a forecast rather than a fact.',
  'The trigger is still some way above where it is trading now, so the entry is not live.',
  'What I do like is the stop: it sits just under the support, so the thing that would prove this wrong is close and cheap.',
  'Clear the resistance on volume and this grades higher the same day.',
].join(' ');

/** A director that answers the way a good one does, without a network call. */
const stubbedCues = (cues: Cue[]) => async () => ({ cues });

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  section('The director places a gesture on the word it is about');

  const directed = await direct({
    beats: [{ key: 'answer', text: ANSWER }],
    table: TABLE,
    form: 'answer',
    ask: stubbedCues([
      { beat: 'answer', sentence: 2, cue: 'MARK:resistance' },
      { beat: 'answer', sentence: 3, cue: 'ZOOM:trigger' },
      { beat: 'answer', sentence: 4, cue: 'MARK:stop' },
    ]),
    available: { priorSession: true, lastPrice: 612.75 },
    label: 'TEST',
  });

  const marked = directed.beats[0].text;
  const spoken = stripMarkers(marked);
  const duration = spokenDurationMs(spoken);

  ok('the prose is unchanged once the markers come back out', spoken === ANSWER, {
    spoken: spoken.slice(0, 80),
  });
  ok('the director placed something', directed.cues > 0, directed);

  /**
   * The same character-offset arithmetic `answerOnChart` does: a marker's position
   * measured in SPOKEN characters, with every earlier marker discounted.
   */
  const markers = parseMarkers(marked);
  let consumed = 0;
  let cursor = 0;
  const actions: { level: string; name: string; t: number }[] = [];
  for (const m of markers) {
    consumed += m.start - cursor;
    cursor = m.end;
    actions.push({
      level: m.value.trim().toLowerCase(),
      name: m.name,
      t: Math.round((consumed / Math.max(1, spoken.length)) * duration),
    });
  }

  ok('every marker got a time inside the answer', actions.every((a) => a.t >= 0 && a.t <= duration), {
    duration,
    worst: actions.map((a) => a.t),
  });

  /* ---- the measurement ------------------------------------------- */

  /** The spoken line, cut into the sentences a listener actually hears. */
  function sentences(text: string): { start: number; end: number; text: string }[] {
    const out: { start: number; end: number; text: string }[] = [];
    const re = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const body = m[0].trim();
      if (body.length > 1) out.push({ start: m.index, end: m.index + m[0].length, text: body });
    }
    return out;
  }

  const SN = sentences(spoken);

  /** The sentence being spoken at that instant, and the one either side of it. */
  function heardAround(t: number): string {
    const pos = (t / Math.max(1, duration)) * spoken.length;
    const i = SN.findIndex((s) => pos >= s.start && pos < s.end);
    const at = i < 0 ? SN.length - 1 : i;
    return [SN[at - 1], SN[at], SN[at + 1]]
      .filter((s): s is { start: number; end: number; text: string } => Boolean(s))
      .map((s) => s.text)
      .join(' ')
      .toLowerCase();
  }

  // A camera move or a note names no level, so there is nothing for it to be
  // wrong about. Only the actions that assert a subject are scored.
  const scored = actions.filter((a) => !['CAM', 'COMPARE', 'NOTE', 'SLIDE', 'TF'].includes(a.name));

  /**
   * What an action claims the user is hearing about.
   *
   * A ZONE IS NAMED FOR THE BAND, NOT FOR A LEVEL. `[ZONE:risk]` is the space
   * between the trigger and the stop, and Kai says "the stop" — he does not say
   * "risk". Scoring it against the string "risk" marks a correctly placed band
   * as a miss, which is what the first run of this file did. A band is right
   * when EITHER of its edges is what he is talking about.
   */
  const subjectsOf = (a: { name: string; level: string }): string[] => {
    if (a.name !== 'ZONE') return [a.level];
    const pair = (LIVE_ZONE_TARGETS as Record<string, readonly string[]>)[a.level];
    return pair ? [...pair] : [a.level];
  };

  const landed = (a: { name: string; level: string; t: number }) => {
    const heard = heardAround(a.t);
    return subjectsOf(a).some((s) => heard.includes(s));
  };

  const hits = scored.filter(landed);
  const rate = scored.length ? hits.length / scored.length : 1;

  console.log(
    `\n  ${hits.length}/${scored.length} actions mark the level being spoken` +
      ` (${(rate * 100).toFixed(0)}%), over ${(duration / 1000).toFixed(1)}s`,
  );
  for (const a of scored) {
    if (landed(a)) continue;
    console.log(`       MISS ${a.name}:${a.level} at ${a.t}ms — heard: "${heardAround(a.t).slice(0, 90)}"`);
  }

  ok('at least 95% of actions mark the level being spoken', rate >= 0.95, {
    hits: hits.length,
    scored: scored.length,
  });

  section('The answer form holds its own rules');

  ok(
    'no timeframe change — the user asked about the chart they are looking at',
    !/\[TF:/i.test(marked),
  );
  ok('no panel — a chat answer already has the chat', !/\[SLIDE:/i.test(marked));
  ok(
    'at most one shape, because fifteen seconds is one thought',
    (marked.match(/\[(ZONE|ARROW):/gi) ?? []).length <= 1,
    marked.match(/\[(ZONE|ARROW|CIRCLE):[^\]]*\]/gi),
  );
  ok(
    'a zoom rings the candle it flew to',
    !/\[ZOOM:\s*trigger\s*\]/i.test(marked) || /\[ZOOM:\s*trigger\s*\][^[]{0,160}\[CIRCLE:\s*trigger\s*\]/i.test(marked),
    marked,
  );
  ok(
    'no bracketed fragment survives into what Kai says',
    !/\[[^\]]+\]/.test(spoken),
    spoken.match(/\[[^\]]+\]/g),
  );

  section('The camera arrives before the hand points');
  {
    /**
     * The levels are daily; the Trade Portal opens on the five-minute. Marking a
     * daily support on a 5m pane draws it several percent outside the visible
     * range — right price, invisible chart. The cut has to come first, and it
     * has to be injected rather than hoped for.
     */
    const crossTf = await direct({
      beats: [{ key: 'answer', text: ANSWER }],
      table: TABLE,
      form: 'answer',
      ask: stubbedCues([{ beat: 'answer', sentence: 2, cue: 'MARK:resistance' }]),
      available: { lastPrice: 612.75, analysisTimeframe: 'D', chartTimeframe: '5m' },
      label: 'TEST',
    });
    const tfText = crossTf.beats[0].text;
    ok('a cut to the analysis timeframe is injected', /\[TF:D\]/i.test(tfText), tfText.slice(0, 120));
    ok('it is the FIRST thing that happens', /^\s*\[TF:D\]/i.test(tfText), tfText.slice(0, 60));
    ok('and only one cut — an answer is not a tour', (tfText.match(/\[TF:/gi) ?? []).length === 1);

    const sameTf = await direct({
      beats: [{ key: 'answer', text: ANSWER }],
      table: TABLE,
      form: 'answer',
      ask: stubbedCues([{ beat: 'answer', sentence: 2, cue: 'MARK:resistance' }]),
      available: { lastPrice: 612.75, analysisTimeframe: 'D', chartTimeframe: 'D' },
      label: 'TEST',
    });
    ok(
      'no cut when they already match — do not move a chart that is right',
      !/\[TF:/i.test(sameTf.beats[0].text),
    );

    const noLevels = await direct({
      // Names no level, and trips neither the zone nor the arrow injector — so
      // nothing daily gets drawn and there is nothing to cut away for.
      beats: [{ key: 'answer', text: 'Volume dried right up into the close and the last hour was quieter than the open.' }],
      table: TABLE,
      form: 'answer',
      ask: stubbedCues([]),
      available: { lastPrice: 612.75, analysisTimeframe: 'D', chartTimeframe: '5m' },
      label: 'TEST',
    });
    ok(
      'and no cut when nothing daily will be drawn — that chart was their choice',
      !/\[TF:/i.test(noLevels.beats[0].text),
      noLevels.beats[0].text,
    );
  }

  section('A director that cannot be reached changes nothing');

  const dark = await direct({
    beats: [{ key: 'answer', text: ANSWER }],
    table: TABLE,
    form: 'answer',
    ask: async () => null,
    label: 'TEST',
  });
  ok('the prose comes back exactly as it went in', dark.beats[0].text === ANSWER);
  ok('and nothing is reported as placed', dark.cues === 0 && dark.injected.length === 0);

  section('A chart with nothing on it draws nothing');

  const bare = await direct({
    beats: [{ key: 'answer', text: ANSWER }],
    table: new Map<string, DirectorLevel>(),
    form: 'answer',
    ask: stubbedCues([{ beat: 'answer', sentence: 2, cue: 'MARK:resistance' }]),
    label: 'TEST',
  });
  ok(
    'a cue naming a level nothing defines is dropped, not approximated',
    !/\[MARK:/i.test(bare.beats[0].text),
    bare.beats[0].text,
  );
}

await main();
console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
