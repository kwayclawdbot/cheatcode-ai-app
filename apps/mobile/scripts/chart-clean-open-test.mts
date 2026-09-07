/**
 * The chart opens quiet, and fills up only when asked.
 *
 *   cd apps/mobile && npx tsx scripts/chart-clean-open-test.mts
 *
 * THE OWNER'S REPORT: "the trade chart should not populate with a bunch of shit
 * on it, the chart should only populate one marking at a time.. the spy chart is
 * showing with a million markings and labels that's no good."
 *
 * TWO CLAIMS, AND THEY NEED DIFFERENT EVIDENCE.
 *
 *   WHAT LOADS is a rule about a list, and `defaultVisibleIds` is a pure
 *   function, so it is checked directly against the shape of a real cluttered
 *   symbol: a pile of stored marks from old conversations, plus a live plan,
 *   plus something the user drew.
 *
 *   WHAT IT LOOKS LIKE is only true as pixels. The same annotation sets go
 *   through the real chart page in a real browser, and the horizontal rules are
 *   counted off the canvas — because "clean" is a claim about the picture, and
 *   the way this went wrong in the first place was everyone reasoning about the
 *   list instead of looking at the chart.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { defaultVisibleIds, hasLiveTrade, visibleAnnotations } from '../src/features/portal/visible-annotations.ts';
import type { Annotation, TradePortal } from '../src/features/portal/types.ts';

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown) {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
function section(t: string) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

/* ------------------------------------------------------------------ */
/* A chart in the state the owner was looking at                       */
/* ------------------------------------------------------------------ */

const LAST = 640;
let seq = 0;
const ann = (over: Partial<Annotation>): Annotation => ({
  id: `a${++seq}`, symbol: 'SPY', timeframe: null, kind: 'support',
  price: LAST, price2: null, ts_from: null, ts_to: null,
  text: 'Support', reason: 'x', provenance: 'kai', status: 'valid',
  source_alert_id: null, source_setup_id: null, source_plan_id: null,
  created_at: null, updated_at: null,
  ...over,
});

/** Eighteen marks, which is what a symbol you have talked about all week has. */
const stored: Annotation[] = [
  // The live trade's own levels — these belong on screen.
  ann({ kind: 'trigger', price: LAST + 2, text: 'Trigger', source_plan_id: 'plan-now' }),
  ann({ kind: 'entry', price: LAST + 2, text: 'Entry', source_plan_id: 'plan-now' }),
  ann({ kind: 'stop', price: LAST - 9, text: 'Stop', source_plan_id: 'plan-now' }),
  ann({ kind: 'invalidation', price: LAST - 9, text: 'Invalidation', source_plan_id: 'plan-now' }),
  ann({ kind: 'target', price: LAST + 14, text: 'First target', source_plan_id: 'plan-now' }),
  // A stop from a plan that is over. Same kind, different trade.
  ann({ kind: 'stop', price: LAST - 40, text: 'Stop', source_plan_id: 'plan-last-week' }),
  // Shelves and structure from old reads.
  ...[6, 12, 18, 24, 30, 36].map((d, i) => ann({ kind: i % 2 ? 'support' : 'resistance', price: LAST + (i % 2 ? -d : d), text: `Level ${i}` })),
  // Averages and a band.
  ann({ kind: 'indicator', price: LAST - 3, text: 'EMA 21', indicator: 'ema', period: 21 }),
  ann({ kind: 'indicator', price: LAST - 11, text: 'EMA 50', indicator: 'ema', period: 50 }),
  ann({ kind: 'indicator', price: LAST + 4, text: 'BB 20', indicator: 'bollinger', period: 20, mult: 2 }),
  // A gap Kai marked in some earlier conversation.
  ann({ kind: 'zone', price: LAST - 20, price2: LAST - 26, ts_from: '2026-08-01T00:00:00Z', text: 'FVG 1 Aug' }),
  // And one the user drew themselves.
  ann({ kind: 'support', price: LAST - 33, text: 'Mine', provenance: 'user' }),
];

/** Captured before anything filters, so "nothing was removed" is checkable. */
const STORED_AT_START = stored.length;

const withTrade = { symbol: 'SPY', plan: { id: 'plan-now' }, alert: null } as unknown as TradePortal;
const noTrade = { symbol: 'SPY', plan: null, alert: null } as unknown as TradePortal;

/* ------------------------------------------------------------------ */
section('What a cluttered chart opens with');

const open1 = defaultVisibleIds(stored, withTrade);
const opened = stored.filter((a) => open1.has(a.id));

ok('eighteen stored marks do not all arrive', opened.length < stored.length, { stored: stored.length, opened: opened.length });
ok('what opens is the trade and your own work, and nothing else', opened.length === 6, opened.map((a) => a.text));
ok("this trade's entry is there", opened.some((a) => a.kind === 'entry'));
ok('so is the stop', opened.some((a) => a.kind === 'stop' && a.price === LAST - 9));
ok('and the target', opened.some((a) => a.kind === 'target'));
ok('the drawing you made is there', opened.some((a) => a.provenance === 'user'));
ok("last week's stop is NOT — same kind, different trade", !opened.some((a) => a.source_plan_id === 'plan-last-week'));
ok('none of the old shelves are', !opened.some((a) => /^Level /.test(a.text ?? '')));
ok('no averages', !opened.some((a) => a.kind === 'indicator'));
ok('and no zones', !opened.some((a) => a.kind === 'zone'));

section('A chart with no trade on it opens emptier still');

const open2 = stored.filter((a) => defaultVisibleIds(stored, noTrade).has(a.id));
ok('there is no live trade', !hasLiveTrade(noTrade));
ok('so only what you drew yourself is on it', open2.length === 1 && open2[0].provenance === 'user', open2.map((a) => a.text));

section('Nothing is lost — it is summoned');

const revealed = new Set([stored[8].id, stored[14].id]);
const after = visibleAnnotations(stored, withTrade, revealed);
ok('marking two more puts exactly two more on', after.length === opened.length + 2, after.length);
ok('and the ones that opened are still there', opened.every((a) => after.some((b) => b.id === a.id)));
// The claim is that filtering NARROWS what the canvas gets without touching the
// list the rail, the count and the inspector all read. A magic number here would
// only assert that the fixture is the size the fixture is.
ok('the full set is untouched, so the rail still lists everything',
  stored.length === STORED_AT_START && after.every((a) => stored.includes(a)),
  { stored: stored.length, atStart: STORED_AT_START });

/* ------------------------------------------------------------------ */
section('And on the real chart page, in a real browser');

const url = 'file://' + path.resolve('assets/chart/index.html');
const W = 900;
const H = 470;
const bars: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
{
  let t = Math.floor(Date.parse('2026-03-02T00:00:00Z') / 1000);
  for (let i = 0; i < 140; i++) {
    const c = LAST - 40 + Math.sin(i / 11) * 14 + i * 0.22;
    bars.push({ t, o: +c.toFixed(2), h: +(c + 2).toFixed(2), l: +(c - 2).toFixed(2), c: +c.toFixed(2), v: 1e6 });
    t += 86400;
  }
}

const wire = (list: Annotation[]) => list.map((a) => ({
  id: a.id, kind: a.kind, price: a.price, price2: a.price2,
  ts_from: a.ts_from, ts_to: a.ts_to, text: a.text,
  provenance: a.provenance, status: a.status,
  indicator: a.indicator ?? null, period: a.period ?? null, mult: a.mult ?? null,
}));

/** Distinct horizontal rules on the plot — the thing the owner was counting. */
const RULES = `(function(){
  var cs=document.querySelectorAll('canvas'), rows={};
  for (var i=0;i<cs.length;i++){
    var cv=cs[i], w=cv.width, h=cv.height;
    if (w<200||h<100) continue;
    var d; try { d=cv.getContext('2d').getImageData(0,0,w,h).data; } catch(e){ continue; }
    for (var y=0;y<h;y++){
      var n=0, minX=9999;
      for (var x=0;x<w;x++){
        var o=(y*w+x)*4;
        if (d[o+3]<90) continue;
        var r=d[o],g=d[o+1],b=d[o+2];
        var lvl=(Math.abs(r-50)<40&&Math.abs(g-214)<40&&Math.abs(b-255)<40)
             || (Math.abs(r-255)<40&&Math.abs(g-90)<40&&Math.abs(b-95)<40)
             || (Math.abs(r-53)<40&&Math.abs(g-208)<40&&Math.abs(b-127)<40)
             || (Math.abs(r-200)<40&&Math.abs(g-255)<40&&b<60);
        if (lvl) { n++; if (x<minX) minX=x; }
      }
      if (n > w*0.3 && minX < 12) rows[y]=1;
    }
  }
  var ks=Object.keys(rows).map(Number).sort(function(a,b){return a-b;});
  return ks.filter(function(y,i){return i===0||y-ks[i-1]>3;}).length;
})()`;

const browser = await chromium.launch();
const bctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await bctx.newPage();
await page.goto(url);
await page.waitForTimeout(500);
await page.evaluate(`window.postMessage({type:'setData',id:1,payload:{symbol:'SPY',timeframe:'D',candles:${JSON.stringify(bars)},lastPrice:${LAST}}},'*')`);
await page.waitForTimeout(350);

// --- what it used to do: the whole stored set at once ---
await page.evaluate(`window.postMessage({type:'annotations.set',id:2,payload:{annotations:${JSON.stringify(wire(stored))}}},'*')`);
await page.waitForTimeout(900);
const before = (await page.evaluate(RULES)) as number;
await page.screenshot({ path: 'proof/chart-clean-before.png' });

// --- what it does now ---
await page.evaluate(`window.postMessage({type:'annotations.set',id:3,payload:{annotations:${JSON.stringify(wire(opened))}}},'*')`);
await page.waitForTimeout(900);
const after1 = (await page.evaluate(RULES)) as number;
await page.screenshot({ path: 'proof/chart-clean-after.png' });

ok('the old behaviour really did fill the chart', before >= 6, { rulesBefore: before });
ok('opening now draws only a handful', after1 <= 4, { rulesAfter: after1 });
ok('and it is genuinely fewer than before', after1 < before, { before, rulesAfter: after1 });

/**
 * THE REVEAL. A read marks what it names one at a time, and the only way to
 * check "one at a time" is to look between the marks: the count has to go up by
 * one and stay up, rather than jumping to the full set on the first frame.
 */
const counts: number[] = [after1];
const toReveal = [stored[7], stored[9], stored[11]];
const running = [...opened];
for (const a of toReveal) {
  running.push(a);
  await page.evaluate(`window.postMessage({type:'annotations.add',id:9,payload:{annotations:${JSON.stringify(wire([a]))}}},'*')`);
  await page.waitForTimeout(700);
  counts.push((await page.evaluate(RULES)) as number);
}
await page.screenshot({ path: 'proof/chart-clean-revealed.png' });

ok('each mark Kai names adds one line, not a set', counts.every((n, i) => i === 0 || n === counts[i - 1] + 1), counts);
ok('and the chart still ends up well under the cap', counts[counts.length - 1] <= 8, counts);

console.log(`  screenshots → proof/chart-clean-before.png, chart-clean-after.png, chart-clean-revealed.png`);
await browser.close();

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
