/**
 * LIVE-1 contract + choreography checks.
 *
 *   node scripts/contracts-live1.mjs      (run from apps/api; smoke.sh calls it)
 *
 * WHAT THIS GUARDS
 *
 *  1. APPEND-ONLY. `AnnotationKind` and `ChartCommandName` are persisted in
 *     Postgres and spoken by a model prompt. Reordering them silently
 *     re-labels stored rows; dropping one breaks every client that has not
 *     shipped yet. So the round-4 members are asserted BY POSITION, and the new
 *     ones are only allowed to arrive after them.
 *
 *  2. THE BRIDGE ROUND-TRIPS. `packages/shared/chart-bridge.ts` is the protocol
 *     between the app and the chart page. The two ends ship together, so it is
 *     never validated on a hot path — which is exactly why a rename can rot
 *     unnoticed. These parses are the thing that notices.
 *
 *  3. THE FEEL IS TESTED, NOT JUST WATCHED. `choreography.ts` is pure on
 *     purpose: "the pointer arrives before the line is drawn" is an assertion
 *     about an array, and it holds or it does not, with no simulator, no eyes
 *     and no screen recording. That is the only way a quality that subjective
 *     survives the next six months of edits.
 *
 * It runs in bare Node with type stripping. The one piece of machinery is a
 * resolve hook that turns `./choreography` into `./choreography.ts`, because
 * the app's sources are written for Metro (extensionless) and Node's ESM
 * resolver is not.
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL) {
      const abs = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      for (const ext of ['.ts', '.tsx']) {
        if (existsSync(abs + ext)) return next(specifier + ext, context);
      }
    }
    return next(specifier, context);
  },
});

const SHARED = '../../../packages/shared';
const CHART = '../../../apps/mobile/src/features/chart';

const api = await import(`${SHARED}/api.ts`);
const bridge = await import(`${SHARED}/chart-bridge.ts`);
const choreo = await import(`${CHART}/choreography.ts`);
const apply = await import(`${CHART}/apply.ts`);

let pass = 0;
const fails = [];
const ok = (what, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${what}${detail ? ` — ${detail}` : ''}`); }
};
const throws = (what, fn) => {
  let threw = false;
  try { fn(); } catch { threw = true; }
  ok(what, threw, 'it was accepted');
};

/* ------------------------------------------------------------------ */
console.log('\nAnnotationKind — append-only');
/* ------------------------------------------------------------------ */

const ROUND4_KINDS = ['trigger', 'entry', 'stop', 'invalidation', 'target', 'support', 'resistance', 'note'];
const kinds = api.AnnotationKind.options;
ok('the eight round-4 kinds are unchanged and in the same order',
  ROUND4_KINDS.every((k, i) => kinds[i] === k),
  JSON.stringify(kinds.slice(0, 8)));
ok('trendline, box and vertical were APPENDED',
  kinds.slice(8).join(',') === 'trendline,box,vertical',
  JSON.stringify(kinds.slice(8)));
throws('an unknown kind is still refused', () => api.AnnotationKind.parse('rainbow'));

/* ------------------------------------------------------------------ */
console.log('\nChartCommandName — append-only');
/* ------------------------------------------------------------------ */

const ROUND4_COMMANDS = [
  'mark_level', 'set_timeframe', 'show_invalidation', 'mark_plan', 'zoom_trigger',
  'compare_prior', 'highlight_community', 'annotation_remove', 'annotation_explain',
  'alert_from_level', 'prepare_trade',
];
const names = api.ChartCommandName.options;
ok('the eleven round-4 commands are unchanged and in the same order',
  ROUND4_COMMANDS.every((c, i) => names[i] === c),
  JSON.stringify(names.slice(0, 11)));
ok('the five v2 camera commands were APPENDED',
  names.slice(11).join(',') === 'zoom_range,scroll_bars,scroll_to_now,flash_annotation,pointer_hint',
  JSON.stringify(names.slice(11)));

/* ------------------------------------------------------------------ */
console.log('\nChart commands v2 — payload round-trips');
/* ------------------------------------------------------------------ */

const zr = api.ZoomRangePayload.parse({ from: '2026-08-26T13:35:00Z', to: '2026-08-26T15:00:00Z', padding: 0.12 });
ok('zoom_range keeps both timestamps', zr.from.endsWith('Z') && zr.to.endsWith('Z'));
throws('zoom_range refuses padding outside 0..1', () => api.ZoomRangePayload.parse({ from: 'a', to: 'b', padding: 4 }));

ok('scroll_bars accepts a negative count (back in time)', api.ScrollBarsPayload.parse({ bars: -60 }).bars === -60);
throws('scroll_bars refuses a nonsense count', () => api.ScrollBarsPayload.parse({ bars: 99999 }));

ok('scroll_to_now needs nothing at all', Object.keys(api.ScrollToNowPayload.parse({})).length === 0);

ok('flash_annotation carries an id and a pulse count',
  api.FlashAnnotationPayload.parse({ annotation_id: 'ann-stop', pulses: 2 }).pulses === 2);
throws('flash_annotation refuses a missing id', () => api.FlashAnnotationPayload.parse({ pulses: 2 }));

ok('pointer_hint can point at a rail button',
  api.PointerHintPayload.parse({ rail: '15m', linger: true }).rail === '15m');
throws('pointer_hint refuses a timeframe that is not on the rail',
  () => api.PointerHintPayload.parse({ rail: '3m' }));

ok('every v2 command has a payload schema',
  api.ChartCommandName.options.slice(11).every((n) => !!api.ChartCommandPayloadV2[n]));

/* ------------------------------------------------------------------ */
console.log('\nThe chart bridge — round-trips both ways');
/* ------------------------------------------------------------------ */

const OUT = [
  { type: 'setData', id: 'c1', payload: { symbol: 'META', timeframe: '15m', candles: [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }], lastPrice: 1.5 } },
  { type: 'camera.scrollToTime', id: 'c2', payload: { time: '2026-08-26T13:35:00Z', align: 'center', duration: 450 } },
  { type: 'camera.zoomTo', id: 'c3', payload: { barSpacing: 18, anchorTime: 1756215300, duration: 500 } },
  { type: 'camera.zoomToRange', id: 'c4', payload: { from: 1, to: 2, padding: 0.12, duration: 600 } },
  { type: 'annotations.add', id: 'c5', payload: { annotations: [{ id: 'a', kind: 'box', price: 1, price2: 2, ts_from: 1, ts_to: 2 }] } },
  { type: 'annotations.flash', id: 'c6', payload: { id: 'a', pulses: 2 } },
  { type: 'pointer.moveTo', id: 'c7', payload: { price: 504, rail: 'D', duration: 380 } },
  { type: 'pointer.press', id: 'c8', payload: { rail: 'D' } },
  { type: 'setTimeframe', id: 'c9', payload: { timeframe: 'D' } },
];
for (const m of OUT) {
  const r = bridge.ChartBridgeOutbound.safeParse(m);
  ok(`host → chart: ${m.type}`, r.success, r.success ? '' : JSON.stringify(r.error.issues[0]));
}
throws('an unknown host command is refused',
  () => bridge.ChartBridgeOutbound.parse({ type: 'camera.teleport', payload: {} }));
throws('a camera duration beyond the cap is refused',
  () => bridge.ChartBridgeOutbound.parse({ type: 'camera.fit', payload: { duration: 60000 } }));

const IN = [
  { type: 'ready', payload: { version: '5.2.1', firstPaintMs: 21, reducedMotion: false, timeframes: ['1m', '5m', '15m', '1h', '4h', 'D'] } },
  { type: 'done', id: 'c2', payload: { reason: 'interrupted' } },
  { type: 'viewport', payload: { from: 1, to: 2, barSpacing: 6, firstTime: 1, lastTime: 2 } },
  { type: 'timeframe', payload: { timeframe: '15m', by: 'user' } },
  { type: 'annotationTap', payload: { id: 'ann-stop' } },
  { type: 'crosshair', payload: { time: 1, open: 1, high: 2, low: 0.5, close: 1.5 } },
  { type: 'fps', payload: { fps: 60, worst: 58 } },
  { type: 'error', id: 'c9', payload: { message: 'nope' } },
];
for (const m of IN) {
  const r = bridge.ChartBridgeInbound.safeParse(m);
  ok(`chart → host: ${m.type}`, r.success, r.success ? '' : JSON.stringify(r.error.issues[0]));
}
throws('a `done` reason outside the three is refused',
  () => bridge.ChartBridgeInbound.parse({ type: 'done', id: 'x', payload: { reason: 'whatever' } }));

ok('the default window per timeframe matches the brief',
  JSON.stringify(bridge.CHART_TF_DEFAULT_BARS) ===
  JSON.stringify({ '1m': 90, '5m': 78, '15m': 96, '1h': 100, '4h': 120, D: 120 }),
  JSON.stringify(bridge.CHART_TF_DEFAULT_BARS));

/* ------------------------------------------------------------------ */
console.log('\nChoreography — the shape of a performance');
/* ------------------------------------------------------------------ */

const { sequenceFor, sequenceDuration, CHOREO } = choreo;
const level = { id: 'ann-trigger', kind: 'trigger', price: 504, text: 'Trigger 504', provenance: 'kai', status: 'valid' };
const at = (s) => s.map((x) => x.do);

const mark = sequenceFor({ command: 'mark_level', annotations: [level] });
const iPointer = at(mark).indexOf('pointer.moveTo');
const iDraw = at(mark).indexOf('annotations.add');
ok('mark_level: the pointer ARRIVES before the line is drawn', iPointer >= 0 && iPointer < iDraw, at(mark).join(' → '));
ok('mark_level: it pauses between arriving and acting',
  mark[iPointer + 1]?.do === 'wait' && mark[iPointer + 1].duration === CHOREO.beforeAct);
ok('mark_level: the pointer leaves at the end', at(mark).at(-1) === 'pointer.hide');
const markMs = sequenceDuration(mark);
ok('mark_level takes about a second (the brief says ~1.1s)', markMs > 800 && markMs < 1500, `${markMs}ms`);

ok('a command with nothing resolved performs NOTHING',
  sequenceFor({ command: 'mark_level', annotations: [] }).length === 0);

const tf = sequenceFor({ command: 'set_timeframe', timeframe: 'D' });
ok('set_timeframe: pointer → press → switch → fit, in that order',
  at(tf).join(',').startsWith('pointer.moveTo,pointer.press,setTimeframe,wait,camera.fit'), at(tf).join(' → '));
ok('set_timeframe: the pointer travels to the RAIL BUTTON, not to a price',
  tf[0].target.rail === 'D');
ok('set_timeframe: the crossfade is waited out before the camera fits',
  tf[3].do === 'wait' && tf[3].duration === CHOREO.crossfade);
ok('set_timeframe with a focus time scrolls to it after the fit',
  at(sequenceFor({ command: 'set_timeframe', timeframe: '15m', focusTs: '2026-08-26T13:35:00Z' }))
    .includes('camera.scrollToTime'));

const zt = sequenceFor({ command: 'zoom_trigger', focusTs: '2026-08-26T13:35:00Z' });
ok('zoom_trigger: it scrolls THEN zooms — never both at once',
  at(zt).indexOf('camera.scrollToTime') < at(zt).indexOf('camera.zoomTo'), at(zt).join(' → '));
ok('zoom_trigger: the trigger candle is marked and pulsed',
  at(zt).includes('annotations.add') && at(zt).includes('annotations.flash'));
ok('zoom_trigger: the mark it adds is a `vertical` — the new shape kind',
  zt.find((s) => s.do === 'annotations.add').annotations[0].kind === 'vertical');
ok('zoom_trigger with no trigger timestamp does nothing',
  sequenceFor({ command: 'zoom_trigger' }).length === 0);

const plan = sequenceFor({
  command: 'mark_plan',
  annotations: [
    { id: 'e', kind: 'entry', price: 504 },
    { id: 's', kind: 'stop', price: 498 },
    { id: 't', kind: 'target', price: 520 },
  ],
});
const adds = plan.filter((s) => s.do === 'annotations.add');
ok('mark_plan: the three legs are drawn one at a time', adds.length === 3);
ok('mark_plan: in the order Kai narrates them (entry, stop, target)',
  adds.map((s) => s.annotations[0].kind).join(',') === 'entry,stop,target');
const legGap = plan.slice(at(plan).indexOf('annotations.add') + 1)
  .slice(0, 3).reduce((m, s) => m + (s.do === 'wait' ? s.duration : s.duration ?? 0), 0);
ok('mark_plan: roughly 700ms between legs', Math.abs(legGap - CHOREO.planLeg) < 60, `${legGap}ms`);

const cmp = sequenceFor({ command: 'compare_prior', bars: 40 });
ok('compare_prior: goes back, HOLDS, and returns along the same path',
  at(cmp).join(',') === 'camera.scrollByBars,wait,camera.scrollByBars', at(cmp).join(' → '));
ok('compare_prior: the two moves are equal and opposite', cmp[0].bars === -cmp[2].bars);
ok('compare_prior: the hold is long enough to actually read', cmp[1].duration >= 1000);

ok('zoom_range needs both ends or it does nothing',
  sequenceFor({ command: 'zoom_range', rangeFrom: 'a' }).length === 0 &&
  sequenceFor({ command: 'zoom_range', rangeFrom: 'a', rangeTo: 'b' }).length === 1);
ok('scroll_bars with 0 bars is not a move', sequenceFor({ command: 'scroll_bars', bars: 0 }).length === 0);
ok('scroll_to_now always has somewhere to go',
  at(sequenceFor({ command: 'scroll_to_now' })).join(',') === 'camera.scrollToNow');
ok('flash_annotation points at the mark before pulsing it',
  at(sequenceFor({ command: 'flash_annotation', flashId: 'ann-trigger', annotations: [level] }))
    .join(',').startsWith('pointer.moveTo,annotations.flash'));
ok('pointer_hint with linger leaves the pointer on screen',
  !at(sequenceFor({ command: 'pointer_hint', pointer: { price: 504 }, linger: true })).includes('pointer.hide'));
ok('pointer_hint without linger takes it away again',
  at(sequenceFor({ command: 'pointer_hint', pointer: { price: 504 } })).includes('pointer.hide'));
ok('a proposal command (prepare_trade) moves the chart not at all',
  sequenceFor({ command: 'prepare_trade' }).length === 0);

/* ------------------------------------------------------------------ */
console.log('\nRunning a performance — the finger outranks Kai');
/* ------------------------------------------------------------------ */

function fakeHandle(overrides = {}) {
  const calls = [];
  const rec = (name) => (...a) => { calls.push(name); return Promise.resolve('done'); };
  return {
    calls,
    isReady: () => true,
    setData: rec('setData'), updateLast: rec('updateLast'),
    setVolume: rec('setVolume'), setReducedMotion: rec('setReducedMotion'),
    scrollByBars: rec('scrollByBars'), scrollToTime: rec('scrollToTime'),
    scrollToNow: rec('scrollToNow'), zoomTo: rec('zoomTo'),
    zoomToRange: rec('zoomToRange'), fit: rec('fit'), cancelMotion: rec('cancelMotion'),
    setTimeframe: rec('setTimeframe'),
    pointerMoveTo: rec('pointerMoveTo'), pointerPress: rec('pointerPress'),
    pointerHide: rec('pointerHide'),
    setAnnotations: rec('setAnnotations'), addAnnotations: rec('addAnnotations'),
    removeAnnotations: rec('removeAnnotations'), flashAnnotation: rec('flashAnnotation'),
    setAnnotationsHidden: rec('setAnnotationsHidden'),
    ...overrides,
  };
}

{
  const h = fakeHandle();
  const r = await apply.runSequence(h, sequenceFor({ command: 'mark_level', annotations: [level] }));
  ok('a clean run finishes every step', r.reason === 'done' && r.completed === r.total, JSON.stringify(r));
  ok('and it actually touched the handle', h.calls.includes('pointerMoveTo') && h.calls.includes('addAnnotations'));
}

{
  // The pointer move reports `interrupted` — a finger landed on the glass.
  const h = fakeHandle({ pointerMoveTo: () => Promise.resolve('interrupted') });
  const seq = sequenceFor({ command: 'mark_level', annotations: [level] });
  const r = await apply.runSequence(h, seq);
  ok('an interrupted step ENDS the sequence', r.reason === 'interrupted' && r.completed < r.total, JSON.stringify(r));
  ok('nothing was drawn after the interruption', !h.calls.includes('addAnnotations'), h.calls.join(','));
  ok('and Kai takes his pointer off the chart', h.calls.includes('pointerHide'));
}

{
  const h = fakeHandle();
  const r = await apply.runSequence(h, sequenceFor({ command: 'mark_level', annotations: [level] }), { aborted: true });
  ok('an aborted sequence never starts', r.reason === 'superseded' && r.completed === 0);
}

{
  apply.resetChartCommandQueue();
  const h = fakeHandle();
  const first = apply.applyChartCommand(h, { command: 'compare_prior', payload: { bars: 40 } });
  await new Promise((r) => setTimeout(r, 30));
  const second = apply.applyChartCommand(h, { command: 'mark_level', annotations: [level] });
  const [a, b] = await Promise.all([first, second]);
  ok('a newer command supersedes the one still running',
    a.reason === 'superseded' && b.reason === 'done', `${a.reason} / ${b.reason}`);
  ok('and the running camera motion is cancelled on the way out', h.calls.includes('cancelMotion'));
  apply.resetChartCommandQueue();
}

{
  const inp = apply.choreoInput({
    command: 'zoom_range',
    payload: { from: '2026-08-26T13:00:00Z', to: '2026-08-26T15:00:00Z' },
  });
  ok('choreoInput reads a v2 payload without inventing anything',
    inp.rangeFrom === '2026-08-26T13:00:00Z' && inp.rangeTo === '2026-08-26T15:00:00Z');
  const hint = apply.choreoInput({ command: 'pointer_hint', payload: { rail: 'D', linger: true } });
  ok('choreoInput carries a rail hint through', hint.pointer.rail === 'D' && hint.linger === true);
  const bad = apply.choreoInput({ command: 'pointer_hint', payload: { rail: '3m' } });
  ok('and drops a rail that is not on the rail', bad.pointer.rail === undefined);
}

/* ------------------------------------------------------------------ */

console.log(`\n  ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  console.log('\nFAILURES:');
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
