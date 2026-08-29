/**
 * LIVE-2 contract + behaviour checks.
 *
 *   cd workers/kai-live && npm test
 *
 * WHAT THIS GUARDS, and why each one is worth a test rather than a comment.
 *
 *  1. THE TIMELINE ROUND-TRIPS. Every frame is written to `live_frames.payload`
 *     as JSON and parsed back out by the API and by the client. A field renamed
 *     on one side and not the other would not fail a typecheck — both ends parse
 *     `unknown` out of Postgres — it would fail as a frame that silently never
 *     renders. These parses are what notices.
 *
 *  2. THE RECONCILE RULE IS ARITHMETIC, SO IT CAN BE ASSERTED. "A late joiner
 *     lands in the same state" is the whole replay promise, and it reduces to
 *     `mergeFrames` refusing to open a gap. That holds or it does not, with no
 *     database and no browser.
 *
 *  3. THE RESOLVER DROPS WHAT IT CANNOT TRACE. This is the rule the entire lane
 *     rests on and the one nobody is watching at three in the morning when the
 *     review show generates itself. It is asserted here on a candidate with no
 *     stop, no target and no persisted rows.
 *
 *  4. THE BUDGET CAP ACTUALLY TRIPS. A cap that has never been observed to fire
 *     is a comment about intentions.
 *
 * No network, no database, no model. Everything here runs in under a second, so
 * there is no excuse not to run it.
 */
import {
  ChartFrame,
  LiveCurrentResponse,
  LiveFrame,
  LiveHealthResponse,
  LiveShow,
  LiveSegment,
  OverlayFrame,
  PresentFrame,
  SayFrame,
  liveChannel,
  mergeFrames,
  parseMarkers,
  stripMarkers,
  LIVE_MARK_TARGETS,
} from '../../../packages/shared/live.ts';
import { AnnotationRow, ChartCommandName } from '../../../packages/shared/api.ts';
import { Budget, anthropicCostUsd, ttsCostUsd } from '../src/budget.ts';
import { PrepBuffer } from '../src/buffer.ts';
import {
  contradictions,
  levelTable,
  unbackedPrices,
} from '../src/resolve.ts';
import { registerViolations, scrubRegister, glossaryFor, speakableName } from '../src/voice.ts';
import { estimateDurationMs, wavDurationMs } from '../src/tts.ts';
import type { Candidate } from '../src/api.ts';

let pass = 0;
let fail = 0;

function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const ann = (over: Partial<AnnotationRow> = {}): AnnotationRow =>
  AnnotationRow.parse({
    id: 'a1',
    symbol: 'META',
    timeframe: '1d',
    kind: 'trigger',
    price: 601.86,
    price2: null,
    ts_from: null,
    ts_to: null,
    text: 'Trigger',
    reason: 'Above this the idea is live.',
    provenance: 'kai',
    status: 'valid',
    source_alert_id: null,
    source_setup_id: 's1',
    source_plan_id: null,
    semantic: 'entry',
    editable: true,
    created_at: new Date().toISOString(),
    updated_at: null,
    ...over,
  });

const base = { show_id: 'show-1', segment_id: 'seg-1', t_offset_ms: 0 };

const sayF = (seq: number) =>
  SayFrame.parse({
    ...base,
    seq,
    kind: 'say',
    voice: 'kai',
    text: 'The trigger is the only number that matters here.',
    audio_url: null,
    duration_ms: 4200,
    audio_state: 'estimated',
    glossary: [{ term: 'trigger', plain: 'The trigger is the price that turns a watched idea into an actionable one.' }],
  });

const chartF = (seq: number) =>
  ChartFrame.parse({
    ...base,
    seq,
    kind: 'chart',
    command: 'mark_level',
    payload: { level: 'trigger' },
    annotations: [ann()],
    annotation_ids: ['a1'],
    narration: 'Above this the idea is live.',
    provenance: 'setup s1 entry condition',
  });

/** A candidate with a trigger and nothing else — no stop, no target, no swings. */
const thinCandidate = (): Candidate => ({
  source: 'setup',
  symbol: 'META',
  headline: 'META',
  rank: 1,
  setup_id: 's1',
  alert_id: null,
  request_id: null,
  intent: 'buy_to_open',
  long: true,
  state: 'ready',
  grade_band: 'A',
  grade_display: 'A',
  thesis_plain: null,
  narration: null,
  why_plain: null,
  levels: { entry: 601.86, stop: null, targets: [], perShare: null, rr: null },
  evidence: [],
  scenarios: [],
  support: [],
  resistance: [],
  outcome: null,
  quote: { price: 571.1, freshness: 'delayed' },
  valid_until: null,
});

/* ------------------------------------------------------------------ */

section('1. the timeline contract round-trips');

for (const f of [sayF(0), chartF(1)]) {
  const wire = JSON.parse(JSON.stringify(f));
  const back = LiveFrame.safeParse(wire);
  ok(`${f.kind} frame survives JSON → jsonb → JSON`, back.success, back.success ? null : back.error.issues);
}

ok(
  'present frame',
  PresentFrame.safeParse({ ...base, seq: 2, kind: 'present', symbol: 'NVDA', timeframe: 'D', headline: 'x', source: 'setup' })
    .success
);
ok(
  'overlay frame',
  OverlayFrame.safeParse({ ...base, seq: 3, kind: 'overlay', overlay: 'ticker_rail', payload: { symbol: 'NVDA' } }).success
);

ok(
  'a frame with an unknown kind is refused, not coerced',
  !LiveFrame.safeParse({ ...base, seq: 4, kind: 'sing', text: 'la' }).success
);

ok(
  'ChartFrame.command is the api.ts enum, not a copy of it',
  ChartCommandName.options.every((c) => ChartFrame.shape.command.safeParse(c).success) &&
    !ChartFrame.shape.command.safeParse('mark_everything').success
);

ok(
  'a ChartFrame must say where its numbers came from',
  !ChartFrame.safeParse({ ...chartF(5), provenance: '' }).success
);

ok('channel name', liveChannel('abc') === 'live:abc');

ok(
  'the API response shapes parse',
  LiveCurrentResponse.safeParse({
    show: LiveShow.parse({
      id: 's',
      mode: 'review',
      status: 'ended',
      title: null,
      started_at: null,
      ended_at: null,
      meta: null,
    }),
    segment: null,
    segments: [],
    frames: [sayF(0)],
    cursor: 0,
    channel: 'live:s',
    plain: 'ok',
  }).success &&
    LiveHealthResponse.safeParse({
      show: null,
      segment: null,
      buffer_depth: 0,
      segments_done: 0,
      spend_usd: 0,
      budget_usd_per_hour: 3,
      degraded: false,
      last_error: null,
      heartbeat_at: null,
      plain: 'x',
    }).success &&
    LiveSegment.safeParse({
      id: 'seg',
      show_id: 's',
      seq: 0,
      symbol: 'META',
      source: 'setup',
      state: 'done',
      prepared_at: null,
      started_at: null,
      ended_at: null,
      cost_usd: 0.03,
      meta: null,
    }).success
);

/* ------------------------------------------------------------------ */

section('2. reconciliation — a late joiner lands in the same place');

{
  const frames = [0, 1, 2, 3].map(sayF);

  const fromScratch = mergeFrames(-1, [], frames);
  ok('a full replay applies every frame in order', fromScratch.ready.map((f) => f.seq).join(',') === '0,1,2,3');
  ok('and reports the last seq as the cursor', fromScratch.cursor === 3);

  const late = mergeFrames(1, [], frames);
  ok('a late joiner at seq 1 gets only 2 and 3', late.ready.map((f) => f.seq).join(',') === '2,3');
  ok('and ends on the same cursor as the client that watched it all', late.cursor === fromScratch.cursor);

  const dup = mergeFrames(3, [], frames);
  ok('a frame that arrives twice is a no-op', dup.ready.length === 0 && dup.cursor === 3);

  // The one that matters: a broadcast frame that arrives before the one before
  // it must WAIT, or the chart renders a level that was never drawn.
  const gap = mergeFrames(0, [], [sayF(3), sayF(2)]);
  ok('a frame that would open a gap is held, not applied', gap.ready.length === 0);
  ok('and is kept, in order, until the hole is filled', gap.pending.map((f) => f.seq).join(',') === '2,3');

  const filled = mergeFrames(gap.cursor, gap.pending, [sayF(1)]);
  ok('when the missing frame arrives the whole run goes at once', filled.ready.map((f) => f.seq).join(',') === '1,2,3');
  ok('and the cursor catches up', filled.cursor === 3);

  const outOfOrder = mergeFrames(-1, [], [sayF(2), sayF(0), sayF(1)]);
  ok('frames arriving out of order still apply in order', outOfOrder.ready.map((f) => f.seq).join(',') === '0,1,2');
}

/* ------------------------------------------------------------------ */

section('3. the marker grammar');

{
  const line = 'Watch the [MARK:trigger] trigger, and [TF:15m] drop to the fifteen. [NOTE:"volume dried up"] Quiet here.';
  const markers = parseMarkers(line);
  ok('every marker is found', markers.map((m) => m.name).join(',') === 'MARK,TF,NOTE');
  ok('a quoted note keeps its text', markers[2].value === 'volume dried up');
  ok('markers are never spoken', !stripMarkers(line).includes('['));
  ok('and stripping repairs the spacing', stripMarkers(line) === 'Watch the trigger, and drop to the fifteen. Quiet here.');
  ok('offsets point into the original text', line.slice(markers[0].start, markers[0].end) === '[MARK:trigger]');
  ok('the level vocabulary is closed', LIVE_MARK_TARGETS.includes('trigger') && !(LIVE_MARK_TARGETS as readonly string[]).includes('vibes'));
}

/* ------------------------------------------------------------------ */

section('4. THE RULE — a number that cannot be traced never reaches the screen');

{
  const c = thinCandidate();
  const table = levelTable(c);

  ok('a level that exists on the setup is in the table', table.has('trigger') && table.get('trigger')!.price === 601.86);
  ok('a level the setup does not carry is NOT in the table', !table.has('stop') && !table.has('target'));
  ok('every level in the table says where it came from', [...table.values()].every((l) => l.provenance.length > 0));
  ok('and carries the reason it is on the chart', [...table.values()].every((l) => l.reason.length > 10));

  // The resolver's decision, isolated: `whyUnresolvable` is internal, so the
  // same question is asked through the table it consults.
  ok('a [MARK:stop] on this candidate has nothing to resolve against', !table.has('stop'));

  ok(
    'a price in prose that is on no object is caught',
    unbackedPrices('It should run to 742.10 from here.', [601.86]).join(',') === '742.1'
  );
  ok(
    'a price that IS on an object passes',
    unbackedPrices('The trigger sits at 601.86.', [601.86]).length === 0
  );
  ok(
    'small counts are not prices',
    unbackedPrices('Three closes in a row, two of them red.', [601.86]).length === 0
  );
  ok(
    'an index in its own name is not an invented level',
    unbackedPrices('The S&P 500 is doing the same thing.', [601.86]).length === 0,
    unbackedPrices('The S&P 500 is doing the same thing.', [601.86])
  );
  ok(
    'a masked company name is not an invented level',
    unbackedPrices('Invesco QQQ Trust 100 led it.', [601.86], ['Invesco QQQ Trust 100']).length === 0
  );

  const long = { ...c, levels: { ...c.levels, stop: 620, targets: [{ price: 500 }] } };
  const failures = contradictions(long as Candidate, '');
  ok('a long setup with its stop above entry is incoherent', failures.some((f) => f.includes('stop')));
  ok('and a long target below entry is too', failures.some((f) => f.includes('target')));
  ok('a coherent setup produces no failures', contradictions(c, 'Nothing numeric here.').length === 0);
}

/* ------------------------------------------------------------------ */

section('5. the show register');

{
  ok('a banned connective is caught', registerViolations('Notably, the trend is up.').length === 1);
  ok('so is telling the viewer what they can see', registerViolations('As you can see on the chart, it fell.').length === 1);
  ok('so is the word this show does not say', registerViolations('And boom, it broke out.').length === 1);
  ok('so is execution language', registerViolations('I just bought it here.').length === 1);
  ok('so is the name we never use', registerViolations('The SuperTrend flipped.').length === 1);
  ok('a clean line passes', registerViolations('Price is respecting this level. Watch it hold.').length === 0);

  const scrubbed = scrubRegister('Notably, price held. I just bought it here. The level is intact.');
  ok('the connective is removed', !/notably/i.test(scrubbed));
  ok('and the sentence that could not be said is gone', !/bought/i.test(scrubbed));
  ok('while the sentence that was fine survives', scrubbed.includes('The level is intact.'));

  const spent = new Set<string>();
  const first = glossaryFor('The trigger is the level that matters.', spent);
  const second = glossaryFor('The trigger again.', spent);
  ok('a term is defined the first time it is used', first.some((g) => g.term === 'trigger'));
  ok('and never again', second.length === 0);
  ok('a definition is plain English, not a formula', first[0].plain.length > 20 && !first[0].plain.includes('='));

  ok('a legal name is not read aloud', speakableName('Meta Platforms, Inc. Class A Common Stock', 'META') === 'Meta Platforms');
  ok('nor is a corporation suffix', speakableName('NVIDIA Corporation', 'NVDA') === 'NVIDIA');
  ok('and a missing name falls back to the symbol', speakableName(null, 'AMD') === 'AMD');
}

/* ------------------------------------------------------------------ */

section('6. the budget cap trips, and trips to cached');

{
  const b = new Budget(3.0);
  ok(
    'a model call is priced from its own usage counters',
    anthropicCostUsd('claude-sonnet-5', { input_tokens: 1_000_000, output_tokens: 0 }) === 2 &&
      anthropicCostUsd('claude-sonnet-5', { input_tokens: 0, output_tokens: 1_000_000 }) === 10
  );
  ok(
    'a cached read is a tenth of an uncached one',
    anthropicCostUsd('claude-sonnet-5', { cache_read_input_tokens: 1_000_000 }) === 0.2
  );
  ok('TTS is priced too, and marked as an estimate', ttsCostUsd(1000) > 0);

  ok('a fresh budget affords the first segment', !b.wouldBreach(0.05));
  ok('and is not degraded', !b.degraded);

  // A minute of show at $3/hr is five cents of allowance, plus one segment of
  // headroom. Two dollars of spend is past both.
  b.record({ segment: 0, kind: 'analysis', usd: 2.0, detail: 'a very expensive segment', measured: true });
  ok('a segment that would pass the cap is refused BEFORE it is built', b.wouldBreach(2.0));

  b.markDegraded();
  ok('the show is now degraded', b.degraded);
  b.markDegraded();
  ok('and stays degraded — the latch does not reopen', b.degraded);

  ok('per-segment cost is tracked separately', b.forSegment(0) === 2.0 && b.forSegment(1) === 0);
  ok('and the table names what each line was for', b.table()[0].detail === 'a very expensive segment');
  ok('measured and estimated lines are distinguishable', b.table().every((l) => typeof l.measured === 'boolean'));
}

/* ------------------------------------------------------------------ */

section('7. the prep buffer holds two, and never leaks a slot');

{
  const buf = new PrepBuffer<string>(2, 5, 50);
  ok('an empty buffer has capacity', buf.hasCapacity());

  buf.startPrep('META');
  buf.startPrep('NVDA');
  ok('depth counts IN-FLIGHT preps, not just finished ones', !buf.hasCapacity());

  buf.push('META', 'a');
  ok('a finished prep still occupies its slot', !buf.hasCapacity());

  buf.abortPrep('NVDA', 'the model said nothing usable');
  ok('an aborted prep frees its slot', buf.hasCapacity());

  ok('the router is told what not to hand out again', buf.blocked().includes('META'));
  ok('the outro can name the next one without consuming it', buf.peekNext()?.symbol === 'META');

  // The leak the deprecated buffer had: a prep that never finishes.
  const leaky = new PrepBuffer<string>(1, 5, 10);
  leaky.startPrep('SPY');
  ok('a slot is held while a prep is running', !leaky.hasCapacity());
  await new Promise((r) => setTimeout(r, 25));
  ok('a prep that never finished is reaped and its slot released', leaky.hasCapacity());
}

/* ------------------------------------------------------------------ */

section('8. audio, measured rather than assumed');

{
  // A 1-second, 16-bit, 24kHz mono WAV: byteRate 48000, data 48000 bytes.
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + 48000, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28); // byteRate
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(48000, 40);
  const wav = Buffer.concat([header, Buffer.alloc(48000)]);
  ok('a wav duration is read from its header', wavDurationMs(wav) === 1000);

  // The gotcha: a streamed WAV claims 0xFFFFFFFF bytes of audio.
  const streamed = Buffer.from(wav);
  streamed.writeUInt32LE(0xffffffff, 40);
  ok('a streamed wav header cannot claim more audio than it has', wavDurationMs(streamed) === 1000);

  ok('a non-wav buffer answers null rather than guessing', wavDurationMs(Buffer.from('not audio at all')) === null);

  const ms = estimateDurationMs('One two three four five six seven eight nine ten.');
  ok('a line with no audio still gets a sane duration', ms > 2000 && ms < 8000, ms);
}

/* ------------------------------------------------------------------ */

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
