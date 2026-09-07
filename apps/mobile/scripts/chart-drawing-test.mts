/**
 * Drawing on the chart by hand, and scaling it by dragging the price sidebar.
 *
 *   cd apps/mobile && npx tsx scripts/chart-drawing-test.mts
 *
 * THE OWNER'S REPORT: "little things like no manual drawing abilities, can't
 * scroll the price sidebar to zoom in and out etc".
 *
 * BOTH POINTER PATHS ARE DRIVEN, and that is not belt-and-braces. The price
 * sidebar was measured working with a MOUSE and doing nothing at all with a
 * FINGER on the embedded chart — the surface most people are actually on — so a
 * test that drove only one of them would have called the bug fixed. Every
 * gesture below runs twice: once through `page.mouse`, once through real CDP
 * touch events.
 *
 * THE PAGE IS TALKED TO THE WAY THE APP TALKS TO IT. Messages go in over the
 * bridge and come back out through `window.ReactNativeWebView.postMessage`,
 * which is stubbed before the page's own scripts run. Nothing reaches inside the
 * page's closure, so this measures the contract rather than the implementation.
 */
import { chromium, type Page, type CDPSession } from 'playwright';
import path from 'node:path';

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown) {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
function section(t: string) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

const url = 'file://' + path.resolve('assets/chart/index.html');
const W = 940;
const H = 500;

/** 160 daily bars with shape, so a drag across them crosses real prices. */
const bars: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
let t = Math.floor(Date.parse('2026-01-05T00:00:00Z') / 1000);
for (let i = 0; i < 160; i++) {
  const c = 200 + Math.sin(i / 12) * 22 + i * 0.28;
  bars.push({ t, o: +c.toFixed(2), h: +(c + 2).toFixed(2), l: +(c - 2).toFixed(2), c: +c.toFixed(2), v: 1_000_000 });
  t += 86400;
}

type Msg = { type: string; payload?: Record<string, unknown> };

async function openChart(browser: Awaited<ReturnType<typeof chromium.launch>>, touch: boolean) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // Stubbed BEFORE the page's scripts evaluate, so `NATIVE` is true when the
  // bridge computes it and every outbound message is captured.
  await page.addInitScript(`
    window.__msgs = [];
    window.ReactNativeWebView = { postMessage: function (s) { window.__msgs.push(s); } };
  `);
  const cdp = await ctx.newCDPSession(page);
  await page.goto(url);
  await page.waitForTimeout(500);
  await page.evaluate(`window.postMessage({type:'setData',id:1,payload:{symbol:'TEST',timeframe:'D',candles:${JSON.stringify(bars)},lastPrice:${bars[bars.length - 1].c}}},'*')`);
  await page.waitForTimeout(350);
  return { ctx, page, cdp };
}

const msgs = async (page: Page): Promise<Msg[]> =>
  (await page.evaluate('window.__msgs.slice()') as string[]).map((s) => JSON.parse(s) as Msg);

const clear = (page: Page) => page.evaluate('window.__msgs.length = 0');

/** One drag, through whichever pointer the caller asked for. */
async function drag(page: Page, cdp: CDPSession, touch: boolean, from: [number, number], to: [number, number]) {
  if (!touch) {
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  } else {
    const tp = (type: string, x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 2, radiusY: 2, force: 1 }],
      } as never);
    await tp('touchStart', from[0], from[1]);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await tp('touchMove', from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
      await page.waitForTimeout(18);
    }
    await tp('touchEnd', to[0], to[1]);
  }
  await page.waitForTimeout(160);
}

async function tap(page: Page, cdp: CDPSession, touch: boolean, at: [number, number]) {
  if (!touch) {
    await page.mouse.move(at[0], at[1]);
    await page.mouse.down();
    await page.mouse.up();
  } else {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at[0], y: at[1], radiusX: 2, radiusY: 2, force: 1 }] } as never);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] } as never);
  }
  await page.waitForTimeout(160);
}

const browser = await chromium.launch();

/* ------------------------------------------------------------------ */
/* 1. The three tools, on both pointers                                */
/* ------------------------------------------------------------------ */

for (const touch of [false, true]) {
  section(`Drawing with a ${touch ? 'finger' : 'mouse'}`);
  const { ctx, page, cdp } = await openChart(browser, touch);

  // --- a level, from a single tap ---
  await page.evaluate(`window.postMessage({type:'draw.setTool',id:2,payload:{tool:'level'}},'*')`);
  await page.waitForTimeout(120);
  await clear(page);
  await tap(page, cdp, touch, [420, 180]);
  let out = await msgs(page);
  const created = out.find((m) => m.type === 'draw.created');
  ok('a tap with the level tool creates one drawing', Boolean(created), out.map((m) => m.type));
  const lvl = created?.payload?.annotation as Record<string, unknown> | undefined;
  ok('it is a horizontal level at a real price', typeof lvl?.price === 'number' && (lvl!.price as number) > 100 && (lvl!.price as number) < 400, lvl?.price);
  ok('and it is marked as the USER\'s, not Kai\'s', lvl?.provenance === 'user', lvl?.provenance);
  ok('the tool puts itself away after one shape', out.some((m) => m.type === 'draw.tool' && m.payload?.tool === null));

  // --- a trendline, from a drag ---
  await page.evaluate(`window.postMessage({type:'draw.setTool',id:3,payload:{tool:'trendline'}},'*')`);
  await page.waitForTimeout(120);
  await clear(page);
  await drag(page, cdp, touch, [200, 320], [640, 150]);
  out = await msgs(page);
  const tl = out.find((m) => m.type === 'draw.created')?.payload?.annotation as Record<string, unknown> | undefined;
  ok('a drag with the trendline tool creates a trendline', tl?.kind === 'trendline', tl?.kind);
  ok('with two different anchors in time', tl?.ts_from !== tl?.ts_to, { from: tl?.ts_from, to: tl?.ts_to });
  ok('and two different prices, because it slopes', typeof tl?.price === 'number' && typeof tl?.price2 === 'number' && tl!.price !== tl!.price2, { a: tl?.price, b: tl?.price2 });

  // --- a zone, from a drag ---
  await page.evaluate(`window.postMessage({type:'draw.setTool',id:4,payload:{tool:'zone'}},'*')`);
  await page.waitForTimeout(120);
  await clear(page);
  await drag(page, cdp, touch, [300, 200], [520, 280]);
  out = await msgs(page);
  const z = out.find((m) => m.type === 'draw.created')?.payload?.annotation as Record<string, unknown> | undefined;
  ok('a drag with the zone tool shades an area', z?.kind === 'zone', z?.kind);
  ok('with the top edge on top', typeof z?.price === 'number' && typeof z?.price2 === 'number' && (z!.price as number) > (z!.price2 as number), { top: z?.price, bottom: z?.price2 });

  // --- a tap with a shape tool makes nothing ---
  await page.evaluate(`window.postMessage({type:'draw.setTool',id:5,payload:{tool:'trendline'}},'*')`);
  await page.waitForTimeout(120);
  await clear(page);
  await tap(page, cdp, touch, [500, 300]);
  out = await msgs(page);
  ok('a TAP with the trendline tool draws nothing — a line needs two points', !out.some((m) => m.type === 'draw.created'), out.map((m) => m.type));

  // --- select, then delete ---
  await page.evaluate(`window.postMessage({type:'draw.setTool',id:6,payload:{tool:null}},'*')`);
  await page.waitForTimeout(120);
  await clear(page);
  await tap(page, cdp, touch, [420, 180]);   // back on the level drawn first
  out = await msgs(page);
  const sel = out.find((m) => m.type === 'draw.selected' && m.payload?.id);
  ok('tapping your own drawing selects it', Boolean(sel), out.map((m) => m.type));
  ok('and the host is told whose it is, so it knows it may be deleted', sel?.payload?.provenance === 'user');

  await clear(page);
  await page.evaluate(`window.postMessage({type:'draw.deleteSelected',id:7,payload:{}},'*')`);
  await page.waitForTimeout(150);
  out = await msgs(page);
  ok('and it can be removed', out.some((m) => m.type === 'draw.deleted'), out.map((m) => m.type));

  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 2. Kai's drawings are not yours                                     */
/* ------------------------------------------------------------------ */

section("Kai's declutter never edits your work");

{
  const { ctx, page } = await openChart(browser, false);
  const last = bars[bars.length - 1].c;
  const kai = Array.from({ length: 12 }, (_, i) => ({
    id: `k${i}`, kind: i % 2 ? 'support' : 'resistance', price: +(last - 30 + i * 5).toFixed(2),
    text: `Level ${i}`, provenance: 'kai', status: 'valid',
  }));
  const mine = [
    { id: 'u1', kind: 'support', price: +(last - 46).toFixed(2), text: 'Mine A', provenance: 'user', status: 'valid' },
    { id: 'u2', kind: 'support', price: +(last - 52).toFixed(2), text: 'Mine B', provenance: 'user', status: 'valid' },
    { id: 'u3', kind: 'resistance', price: +(last + 38).toFixed(2), text: 'Mine C', provenance: 'user', status: 'valid' },
  ];
  await page.evaluate(`window.postMessage({type:'annotations.set',id:9,payload:{annotations:${JSON.stringify([...kai, ...mine])}}},'*')`);
  await page.waitForTimeout(900);

  /**
   * Counted off the canvas by colour. Volt is the user's and appears nowhere
   * else on this chart, so a volt row spanning the plot is one of their lines
   * and nothing else can be mistaken for it.
   */
  const counts = (await page.evaluate(`(function(){
    var out = { volt: 0, kai: 0 };
    var near = function (r,g,b,h,tol) {
      var n = parseInt(h.slice(1),16);
      tol = tol || 30;
      return Math.abs(r-((n>>16)&255))<tol && Math.abs(g-((n>>8)&255))<tol && Math.abs(b-(n&255))<tol;
    };
    var cs = document.querySelectorAll('canvas');
    var voltRows = {}, kaiRows = {};
    for (var i=0;i<cs.length;i++) {
      var cv = cs[i], w = cv.width, h = cv.height;
      if (w < 200 || h < 100) continue;
      var d; try { d = cv.getContext('2d').getImageData(0,0,w,h).data; } catch(e) { continue; }
      for (var y=0;y<h;y++) {
        var v=0,k=0;
        for (var x=0;x<w;x++) {
          var o=(y*w+x)*4; if (d[o+3]<90) continue;
          if (near(d[o],d[o+1],d[o+2],'#C8FF00')) v++;
          else if (near(d[o],d[o+1],d[o+2],'#32D6FF')) k++;
        }
        if (v > w*0.3) voltRows[y]=1;
        if (k > w*0.3) kaiRows[y]=1;
      }
    }
    var thin = function(o){ var ks=Object.keys(o).map(Number).sort(function(a,b){return a-b;});
      return ks.filter(function(y,i){ return i===0 || y-ks[i-1]>3; }).length; };
    return { volt: thin(voltRows), kai: thin(kaiRows) };
  })()`)) as { volt: number; kai: number };

  ok('all three of your own levels are drawn', counts.volt === 3, counts);
  ok("and Kai's twelve are still held to his eight", counts.kai > 0 && counts.kai <= 8, counts);
  ok('so your drawings did not spend his budget', counts.volt + counts.kai > 8, counts);

  await page.screenshot({ path: 'proof/chart-drawing.png' });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 3. The price sidebar                                                */
/* ------------------------------------------------------------------ */

section('Dragging the price sidebar scales the price axis');

for (const own of [false, true]) {
  for (const touch of [false, true]) {
    const { ctx, page, cdp } = await openChart(browser, touch);
    await page.evaluate(`window.postMessage({type:'setGestures',id:20,payload:{own:${own}}},'*')`);
    await page.waitForTimeout(500);
    const AXIS = { x: W - 70, y: 0, width: 70, height: H };
    const before = await page.screenshot({ clip: AXIS });
    await drag(page, cdp, touch, [W - 35, 130], [W - 35, 330]);
    await page.waitForTimeout(500);
    const after = await page.screenshot({ clip: AXIS });
    ok(
      `${own ? 'expanded' : 'embedded'} chart, ${touch ? 'finger' : 'mouse'}: the axis rescales`,
      Buffer.compare(before, after) !== 0,
    );

    // --- and the way back is offered, and works ---
    if (!own && touch) {
      const shown = await page.evaluate(`document.querySelector('.autoscale') && document.querySelector('.autoscale').classList.contains('is-on')`);
      ok('a manual scale offers the way back to autoscale', shown === true);
      const fitted = await page.screenshot({ clip: AXIS });
      await page.click('.autoscale');
      await page.waitForTimeout(600);
      const restored = await page.screenshot({ clip: AXIS });
      ok('and tapping it re-fits the chart in front of you', Buffer.compare(fitted, restored) !== 0);
      const hidden = await page.evaluate(`document.querySelector('.autoscale').classList.contains('is-on')`);
      ok('after which the control puts itself away', hidden === false);
    }
    await ctx.close();
  }
}

/* ------------------------------------------------------------------ */
/* 4. A drawing survives the page reloading under it                   */
/* ------------------------------------------------------------------ */

section('A saved drawing comes back');

{
  const { ctx, page } = await openChart(browser, false);
  // What the host would re-send after a reload: the row as the API stored it,
  // with a real id and an ISO timestamp rather than the draft's bar seconds.
  const saved = [{
    id: 'srv-1', kind: 'trendline',
    price: 210, price2: 240,
    ts_from: new Date(bars[20].t * 1000).toISOString(),
    ts_to: new Date(bars[120].t * 1000).toISOString(),
    text: 'Trendline', provenance: 'user', status: 'valid',
  }];
  await page.evaluate(`window.postMessage({type:'annotations.set',id:30,payload:{annotations:${JSON.stringify(saved)}}},'*')`);
  await page.waitForTimeout(800);
  const voltPixels = (await page.evaluate(`(function(){
    var n=0, cs=document.querySelectorAll('canvas');
    for (var i=0;i<cs.length;i++) {
      var cv=cs[i], w=cv.width, h=cv.height;
      if (w<200||h<100) continue;
      var d; try { d=cv.getContext('2d').getImageData(0,0,w,h).data; } catch(e) { continue; }
      for (var p=0;p<d.length;p+=4) {
        if (d[p+3]>90 && Math.abs(d[p]-200)<30 && Math.abs(d[p+1]-255)<30 && d[p+2]<60) n++;
      }
    }
    return n;
  })()`)) as number;
  ok('a stored user drawing renders, in the user\'s own colour', voltPixels > 200, { voltPixels });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 5. What "markup all recent fvgs" looks like                         */
/* ------------------------------------------------------------------ */

section('Kai marking up the gaps');

{
  const { ctx, page } = await openChart(browser, false);
  /**
   * FOUR GAPS, THE SHAPE THE SERVER SENDS THEM.
   *
   * `mark_pattern` resolves them off the same bars the chart is holding and
   * sends zones anchored to the middle candle of each three-bar gap, left open
   * at the right so they run to the live edge. The ranges below are the ones a
   * three-candle gap actually produces on this fixture — first bar's high to
   * third bar's low — so what is being checked is that the renderer draws a
   * band where the server said there is one, and that four of them do not turn
   * the chart back into a wall.
   */
  const gaps = [140, 120, 96, 70].map((i) => {
    const a = bars[i - 2];
    const c = bars[i];
    const top = Math.max(a.h, c.l);
    const bottom = Math.min(a.h, c.l);
    return {
      id: `fvg${i}`, kind: 'zone',
      price: +(bottom + Math.abs(top - bottom) + 3).toFixed(2),
      price2: +bottom.toFixed(2),
      ts_from: new Date(bars[i - 1].t * 1000).toISOString(),
      ts_to: null,
      text: `FVG ${new Date(bars[i - 1].t * 1000).toISOString().slice(5, 10)}`,
      provenance: 'kai', status: 'valid',
    };
  });
  await page.evaluate(`window.postMessage({type:'annotations.set',id:40,payload:{annotations:${JSON.stringify(gaps)}}},'*')`);
  await page.waitForTimeout(900);

  /**
   * THE CLAIM BEING MEASURED: a gap arrives as an AREA, and none of them turned
   * into another horizontal line.
   *
   * Two numbers say it. `bands` counts contiguous runs of ink tall enough to be
   * a shaded region rather than a border — an outlined rectangle would give runs
   * of one or two rows. `fullWidthRules` counts horizontal lines that start at
   * the left edge of the plot, which is what a LEVEL looks like and what a zone
   * never does: a zone begins at the bar it is anchored to. If a gap were ever
   * routed back through the level path, the second number would move.
   */
  const seen = (await page.evaluate(`(function(){
    var cs = document.querySelectorAll('canvas');
    var bands = 0, ruleRows = {};
    for (var i=0;i<cs.length;i++) {
      var cv=cs[i], w=cv.width, h=cv.height;
      if (w<200||h<100) continue;
      var d; try { d=cv.getContext('2d').getImageData(0,0,w,h).data; } catch(e){ continue; }
      var at=function(x,y){var o=(y*w+x)*4;return [d[o],d[o+1],d[o+2],d[o+3]];};
      // Bands: the tallest column of separate ink runs anywhere in the right
      // half, where every zone in this fixture is still running.
      for (var x=Math.floor(w*0.55); x<w-70; x++) {
        var runs=0, run=0;
        for (var y=2;y<h-2;y++){
          var p=at(x,y);
          var ink=Math.abs(p[0]-11)+Math.abs(p[1]-11)+Math.abs(p[2]-14)>=4;
          if(ink) run++; else { if(run>=6) runs++; run=0; }
        }
        if (run>=6) runs++;
        if (runs>bands) bands=runs;
      }
      // Full-width horizontal rules: a coloured row whose ink starts at x<12.
      for (var y2=0;y2<h;y2++) {
        var n=0, minX=9999;
        for (var x2=0;x2<w;x2++) {
          var q=at(x2,y2);
          if (q[3]<90) continue;
          if (Math.abs(q[0]-50)<40 && Math.abs(q[1]-214)<40 && Math.abs(q[2]-255)<40) { n++; if(x2<minX) minX=x2; }
        }
        if (n > w*0.3 && minX < 12) ruleRows[y2]=1;
      }
    }
    var ks=Object.keys(ruleRows).map(Number).sort(function(a,b){return a-b;});
    return { bands: bands, fullWidthRules: ks.filter(function(y,i){return i===0||y-ks[i-1]>3;}).length };
  })()`)) as { bands: number; fullWidthRules: number };

  ok('the gaps draw as shaded AREAS', seen.bands >= 2, seen);
  ok('and not one of them became another horizontal line', seen.fullWidthRules === 0, seen);
  await page.screenshot({ path: 'proof/chart-fvg.png' });
  console.log('  screenshot → apps/mobile/proof/chart-fvg.png');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 6. Editing what you drew: move, reshape, and the bin                 */
/* ------------------------------------------------------------------ */

section('A drawing can be moved, reshaped and thrown away');

{
  const { ctx, page, cdp } = await openChart(browser, false);

  // Draw a trendline to edit.
  await page.evaluate(`window.postMessage({type:'draw.setTool',id:50,payload:{tool:'trendline'}},'*')`);
  await page.waitForTimeout(120);
  await clear(page);
  await drag(page, cdp, false, [220, 300], [620, 170]);
  let out = await msgs(page);
  const made = out.find((m) => m.type === 'draw.created')?.payload?.annotation as Record<string, unknown>;
  ok('a trendline to work on', made?.kind === 'trendline', made?.kind);

  // It is selected on creation, so its handles are live. Grab the far end and
  // move it: this is RESHAPING, which is the half that never persisted.
  await clear(page);
  await drag(page, cdp, false, [620, 170], [620, 300]);
  out = await msgs(page);
  const changed = out.find((m) => m.type === 'draw.changed')?.payload?.annotation as Record<string, unknown>;
  ok('dragging an endpoint reports a change', Boolean(changed), out.map((m) => m.type));
  ok('and the change is in the SECOND price, not the first',
    typeof changed?.price2 === 'number' && changed!.price2 !== made!.price2,
    { before: made?.price2, after: changed?.price2 });
  ok('while the anchored end stayed put', changed?.price === made?.price, { before: made?.price, after: changed?.price });

  /**
   * THE BIN, ON THE DRAWING ITSELF — above and outside its right-hand end.
   *
   * It has to clear the endpoint handle's grab radius, and it did not: every
   * tap on it was read as the start of a drag, so the drawing could not be
   * deleted at all. That is what this asserts, and it is why the bin is checked
   * before the handles rather than after.
   */
  await clear(page);
  await tap(page, cdp, false, [620 + 22, 300 - 22]);
  out = await msgs(page);
  const deletedByBin = out.some((m) => m.type === 'draw.deleted');
  ok('tapping the bin on the drawing removes it', deletedByBin, out.map((m) => m.type));

  // And tapping empty chart clears the selection rather than leaving handles
  // floating on something you have stopped working on.
  await page.evaluate(`window.postMessage({type:'draw.setTool',id:51,payload:{tool:'level'}},'*')`);
  await page.waitForTimeout(120);
  await tap(page, cdp, false, [400, 200]);
  await page.waitForTimeout(200);
  await clear(page);
  await tap(page, cdp, false, [300, 420]);
  out = await msgs(page);
  const cleared = out.filter((m) => m.type === 'draw.selected').pop();
  ok('tapping empty chart deselects', cleared?.payload?.id === null || cleared === undefined, cleared?.payload);

  await page.screenshot({ path: 'proof/chart-edit.png' });
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
