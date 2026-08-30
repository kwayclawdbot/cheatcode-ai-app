/**
 * LIVE-8 — does a second question abandon the first answer cleanly?
 *
 *   cd apps/mobile && ../../workers/kai-live/node_modules/.bin/tsx scripts/answer-runner-test.mts
 *
 * `runChartAnswer` is where three promises the lane depends on are actually
 * kept, and none of them is visible in a typecheck:
 *
 *   ONE AT A TIME. `applyChartCommand` keeps a queue of one and a second
 *   sequence supersedes the first, so an un-awaited action silently drops the
 *   level the previous one was drawing. Asserted by counting overlaps.
 *
 *   THE CLOCK IS THE ANSWER'S. An action that overruns does not push the rest
 *   back — the next is already late and goes at once. Asserted by making the
 *   first action take longer than the gap to the second.
 *
 *   A SECOND QUESTION WINS. Cancelling stops the run between actions and the
 *   remainder never reaches the chart. Asserted by cancelling mid-answer.
 *
 * Pure: no chart, no React, no timers you have to wait for — the clock and the
 * sleep are injected, so the whole file runs in milliseconds.
 */
import { runChartAnswer } from '../src/features/chart/answer';

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

/** A clock that only moves when something sleeps, so the test never waits. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += Math.max(0, ms);
      await Promise.resolve();
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const ACTIONS = [
  { t_offset_ms: 0, frame: 'a' },
  { t_offset_ms: 1000, frame: 'b' },
  { t_offset_ms: 2000, frame: 'c' },
  { t_offset_ms: 3000, frame: 'd' },
];

async function main(): Promise<void> {
  console.log('\nEvery action reaches the chart, in order, one at a time');
  {
    const clock = fakeClock();
    const fired: string[] = [];
    let inFlight = 0;
    let overlaps = 0;
    const run = runChartAnswer<string>({
      actions: ACTIONS,
      now: clock.now,
      sleep: clock.sleep,
      perform: async (f) => {
        inFlight += 1;
        if (inFlight > 1) overlaps += 1;
        fired.push(f);
        await clock.sleep(200);
        inFlight -= 1;
      },
    });
    const r = await run.done;
    ok('all four fired', r.fired === 4 && r.total === 4, r);
    ok('in the order the director placed them', fired.join('') === 'abcd', fired);
    ok('and never two at once', overlaps === 0, { overlaps });
    ok('the run reports itself finished', r.reason === 'done', r);
  }

  console.log('\nAn action that overruns does not push the rest back');
  {
    const clock = fakeClock();
    const at: number[] = [];
    const run = runChartAnswer<string>({
      actions: ACTIONS,
      now: clock.now,
      sleep: clock.sleep,
      perform: async (f) => {
        at.push(clock.now());
        // The first gesture takes 2.5s — longer than the gap to the next two.
        await clock.sleep(f === 'a' ? 2500 : 100);
      },
    });
    await run.done;
    ok('the overrunning action starts on time', at[0] === 0, at);
    ok(
      'the two it ran over fire immediately after it, not 1s and 2s later',
      at[1] === 2500 && at[2] === 2600,
      at,
    );
    ok('and the answer is back on its own clock by the last one', at[3] === 3000, at);
  }

  console.log('\nGestures follow the voice, not the wall clock');
  {
    /**
     * An audio playhead that STALLS: it advances with wall time, except for a
     * one-second stretch early on where the file is rebuffering and the voice
     * has not moved. A runner that slept once for the whole wait would fire the
     * second gesture on schedule, over a silence, and stay a second ahead of Kai
     * for the rest of the answer.
     */
    let wall = 0;
    const STALL_FROM = 300;
    const STALL_MS = 1000;
    const playhead = () => (wall <= STALL_FROM ? wall : Math.max(STALL_FROM, wall - STALL_MS));
    const heardAt: number[] = [];
    const run = runChartAnswer<string>({
      actions: ACTIONS,
      now: playhead,
      sleep: async (ms) => {
        wall += Math.max(0, ms);
        await Promise.resolve();
      },
      perform: () => {
        heardAt.push(playhead());
      },
    });
    const r = await run.done;
    ok('every gesture still fires', r.fired === 4, r);
    ok(
      'and each one lands at its own offset IN THE AUDIO, not in wall time',
      heardAt.every((t, i) => Math.abs(t - ACTIONS[i].t_offset_ms) <= 120),
      { heardAt, due: ACTIONS.map((a) => a.t_offset_ms) },
    );
    ok('which means the run outlasted the stall in wall time', wall >= 3000 + STALL_MS, { wall });
  }

  console.log('\nA second question abandons the first');
  {
    const clock = fakeClock();
    const fired: string[] = [];
    const run = runChartAnswer<string>({
      actions: ACTIONS,
      now: clock.now,
      sleep: clock.sleep,
      perform: async (f) => {
        fired.push(f);
        // The user asks something else while the second gesture is on screen.
        if (f === 'b') run.cancel();
        await clock.sleep(50);
      },
    });
    const r = await run.done;
    ok('what was already performing is not undone', fired.join('') === 'ab', fired);
    ok('and nothing after it reaches the chart', r.fired === 2, r);
    ok('the run says it was cancelled, not that it finished', r.reason === 'cancelled', r);
  }

  console.log('\nCancelling before anything fires draws nothing at all');
  {
    const clock = fakeClock();
    const fired: string[] = [];
    const run = runChartAnswer<string>({
      actions: ACTIONS,
      now: clock.now,
      sleep: clock.sleep,
      perform: (f) => {
        fired.push(f);
      },
    });
    run.cancel();
    const r = await run.done;
    ok('the chart was never touched', fired.length === 0, fired);
    ok('and it is reported as cancelled', r.reason === 'cancelled' && r.fired === 0, r);
  }

  console.log('\nAn answer with no actions is still a finished answer');
  {
    const run = runChartAnswer<string>({ actions: [], perform: () => {} });
    const r = await run.done;
    ok('it resolves rather than hanging', r.reason === 'done' && r.total === 0, r);
  }

  console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
  process.exit(failures ? 1 : 0);
}

await main();
