/**
 * PROOF FOR THE HANDS-FREE LOGIC (lane C) — no microphone, no network.
 *
 *  1. The pause detector stops ~1.5 s after SPEECH, never on the quiet before
 *     someone starts, learns a noisy room instead of listening forever, and
 *     survives someone who starts talking the instant they tap.
 *  2. Only a reply that just FINISHED, after the member's own message, is read
 *     out — never history, a stopped turn, a card, or the same reply twice.
 *  3. The upload is named for the bytes it carries (OpenAI reads the name).
 *
 * Run: npx tsx scripts/voice-logic-test.mts
 */
import { clock, createSilenceDetector, fileFor, meterLevel, replyToSpeak } from '../src/features/voice/logic.ts';

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passes += 1;
  else failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

/** Feed a level timeline sampled every 100 ms; return when/why it stopped. */
function run(levels: (t: number) => number | undefined, opts = {}, until = 70_000) {
  const d = createSilenceDetector(opts);
  for (let t = 0; t <= until; t += 100) {
    const v = d.feed(levels(t), t);
    if (v !== 'listening') return { v, t };
  }
  return { v: 'listening', t: until };
}

// quiet room (-62), speech (-28) from 0.8 s to 3.0 s, then quiet
const quietRoom = (t: number) => (t >= 800 && t < 3000 ? -28 : -62);
const a = run(quietRoom);
check('quiet room: stops ~1.5 s after the last word', a.v === 'stop_after_speech' && a.t >= 4400 && a.t <= 4700, a);

// nobody speaks
const b = run(() => -62);
check('nobody speaks: gives up at 8 s with a different verdict', b.v === 'stop_nothing_heard' && b.t === 8000, b);

// long thinking pause BEFORE speaking is not the end of the question
const c = run((t) => (t >= 5000 && t < 7000 ? -30 : -60));
check('a 5 s pause before speaking does not end it', c.v === 'stop_after_speech' && c.t >= 8400 && c.t <= 8700, c);

// a pause MID-sentence shorter than 1.5 s does not end it
const d = run((t) => ((t >= 500 && t < 2000) || (t >= 3000 && t < 4500) ? -30 : -60));
check('a 1 s pause mid-question does not end it', d.v === 'stop_after_speech' && d.t >= 5900 && d.t <= 6200, d);

// noisy street: floor -40, speech -20
const e = run((t) => (t >= 600 && t < 2500 ? -20 : -40));
check('noisy street (-40 floor): still hears the pause', e.v === 'stop_after_speech' && e.t >= 3900 && e.t <= 4200, e);

// talks from the very first sample, then pauses
const f = run((t) => (t < 2000 ? -25 + (t % 300 === 0 ? -20 : 0) : -58));
check('talking from the first instant: still stops after the pause', f.v === 'stop_after_speech' && f.t <= 3800, f);

// digital silence on web before the stream warms up (-160)
const g = run((t) => (t < 300 ? -160 : t < 2500 ? -30 : -70));
check('web warm-up silence (-160) does not break the floor', g.v === 'stop_after_speech' && g.t >= 3900 && g.t <= 4200, g);

// no metering at all → only the ceiling / no-speech rule
const h = run(() => undefined);
check('no metering: nothing-heard rule still applies', h.v === 'stop_nothing_heard', h);
const h2 = run((t) => (t < 500 ? -30 : undefined));
check('no metering after speech: never auto-stops early; ceiling at 60 s', h2.v === 'stop_too_long' && h2.t === 60_000, h2);

// talks for over a minute
const i = run(() => -25, {}, 70_000);
check('a minute of talking hits the ceiling', i.v === 'stop_too_long' && i.t === 60_000, i);

check('meter: silence → 0, -35 dB → 0.5, loud → 1', meterLevel(-160) === 0 && meterLevel(-35) === 0.5 && meterLevel(0) === 1 && meterLevel(undefined) === 0);
check('clock: 0:07, 1:00', clock(7400) === '0:07' && clock(60_000) === '1:00');

/* 2. which reply */
const wall = [
  { kind: 'kai_text', id: 'hist', text: 'From yesterday.' },
  { kind: 'user_text', id: 'u1', text: 'what is nvidia doing' },
  { kind: 'kai_text', id: 'k1', text: 'Nvidia is up 2%.' },
];
check('reads the reply after the member’s message', replyToSpeak(wall, null)?.id === 'k1');
check('never the same reply twice', replyToSpeak(wall, 'k1') === null);
check('history with no new message is never read', replyToSpeak([wall[0]], null) === null);
check('a reply still streaming is not read', replyToSpeak([wall[1], { ...wall[2], streaming: true }], null) === null);
check('a stopped turn with no text is not read', replyToSpeak([wall[1], { kind: 'kai_text', id: 'k2', text: '' }, { kind: 'notice', id: 'n', text: 'Stopped.' }], null) === null);
check('a turn that produced only a card says nothing', replyToSpeak([wall[1], { kind: 'setup', id: 's' }], null) === null);
check('an older reply before the latest message is not read', replyToSpeak([...wall, { kind: 'user_text', id: 'u2', text: 'and amd?' }], null) === null);

/* 3. names */
check('web Chrome: webm;codecs=opus → voice.webm', fileFor('audio/webm;codecs=opus').name === 'voice.webm');
check('web Safari: audio/mp4 → voice.m4a', fileFor('audio/mp4').name === 'voice.m4a');
check('phone: m4a', fileFor('audio/m4a').name === 'voice.m4a');
check('unknown type falls back to the given extension', fileFor('', 'webm').name === 'voice.webm');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
