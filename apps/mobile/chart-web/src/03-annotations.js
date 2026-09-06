/**
 * The annotation layer — a Lightweight Charts v5 series primitive.
 *
 * SEVEN PRIMITIVES, ONE RENDERER. `level`, `zone`, `trendline`, `box`,
 * `vertical`, `note` and `indicator` are drawn by one pass over one canvas
 * rather than seven plugin objects, because they share a coordinate system, a
 * z-order and a hit test, and splitting them would only split the places a bug
 * can hide.
 *
 * TWO THINGS IN HERE ARE ABOUT LEGIBILITY RATHER THAN ABOUT DRAWING, and they
 * are here because the chart got reported as unusable and both were the cause:
 *
 *   INDICATORS ARE CURVES. A moving average arrived as a price — its value on
 *   the newest bar — and a price is drawn as a rule across the whole plot. It is
 *   wrong about the instrument (an average is a line that moves) and it was
 *   wrong five times over on a chart carrying four averages and a VWAP. So an
 *   `indicator` annotation names a curve, this file computes the series from the
 *   bars it already has, and it is drawn as a line. It is never ruled at `price`.
 *
 *   THERE IS A BUDGET FOR HORIZONTAL LINES. Even with the averages gone, a chart
 *   accumulates rules — a trigger, an entry that starts at the same number, a
 *   stop, an invalidation on top of the stop, two targets, support, resistance,
 *   five fib retracements. `_budget` merges the ones sitting on top of each other
 *   and caps how many are drawn at once, risk and plan first. Nothing is lost:
 *   the levels rail beside the chart still lists every mark.
 *
 * WHY CANVAS AND NOT DOM CHIPS: DOM chips positioned per frame lag the candles
 * by one frame during a camera tween — the line is drawn by the library on the
 * chart's own canvas, the chip by the browser's compositor, and at 500 ms of
 * eased scroll you can see them separate. Drawing both in the same pass means a
 * level and its label are, by construction, never out of register.
 *
 * SHAPE IS DERIVED FROM MEANING. The host sends `kind` (semantics) and geometry;
 * nothing sends a shape name twice:
 *   kind 'trendline' → two anchors     kind 'box'      → time × price rectangle
 *   kind 'vertical'  → a time marker   kind 'note'     → anchored text
 *   kind 'circle'    → a ring on one bar kind 'arrow'    → price → a level
 *   price + price2   → a zone          price only      → a level
 */

var CHIP_FONT = '500 9.5px "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';
var TAG_FONT = '500 9.5px "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

function shapeOf(a) {
  if (a.kind === 'trendline') return 'trendline';
  // A `zone` and a `box` are the same rectangle drawn from the same four
  // numbers. They differ in what they MEAN — a box is the band between two plan
  // levels across the whole window, a zone is a named area anchored at a bar and
  // running forward — and that difference is honoured inside the branch, not by
  // having two of them.
  if (a.kind === 'box' || a.kind === 'zone') return 'box';
  if (a.kind === 'vertical') return 'vertical';
  if (a.kind === 'circle') return 'circle';
  if (a.kind === 'arrow') return 'arrow';
  if (a.kind === 'note') return 'note';
  // An overlay only counts as one if it names a curve this file can compute. A
  // row typed `indicator` with nothing to compute would otherwise fall through
  // to `level` and be ruled across the plot — the exact bug, reintroduced by a
  // malformed row. It becomes a note instead: a dot, not a line.
  if (a.kind === 'indicator') return specOf(a) ? 'indicator' : 'note';
  if (a.price != null && a.price2 != null) return 'zone';
  return 'level';
}

/* ------------------------------------------------------------------ */
/* The indicator library — the arithmetic, done where the bars are      */
/* ------------------------------------------------------------------ */

/**
 * THE COMPUTE HALF OF THE REGISTRY IN packages/shared/indicators.ts.
 *
 * It is a second copy of the math and that is a deliberate cost, not an
 * oversight. This page is a self-contained document with no module system (see
 * chart-web/build.mjs — the "build" is a concatenation), and it is the one
 * holding the candles. Sending a precomputed series down the bridge instead
 * would send something derivable, that goes stale on the next tick, and that
 * would have to be re-sent on every pan.
 *
 * THE DUPLICATION IS CHECKED RATHER THAN TRUSTED. `scripts/chart-indicators-
 * test.mjs` runs this table and the TypeScript one over the same fixture bars
 * and fails on any entry whose numbers disagree. Adding an indicator means one
 * row there and one row here, and forgetting the second is a test failure
 * rather than a curve that silently stops being drawable.
 *
 * COLOUR IS NOT IN HERE. Every overlay is the one muted family (palette lock
 * 14): colour on this chart means MEANING, and an indicator that picked a hue
 * would be claiming to be risk, or a target, or the tape. Weight and dash are
 * what tell the curves apart, and the label is what names them.
 */
var IND = {
  ema:          { outputs: ['ema'],                    band: false, weight: 1.2, dash: null,   period: 21,  mult: null },
  sma:          { outputs: ['sma'],                    band: false, weight: 1.2, dash: null,   period: 20,  mult: null },
  vwap:         { outputs: ['vwap'],                   band: false, weight: 1.3, dash: [5, 3], period: null, mult: null },
  bollinger:    { outputs: ['basis', 'upper', 'lower'], band: true, weight: 1,   dash: null,   period: 20,  mult: 2 },
  trend_clouds: { outputs: ['line', 'upper', 'lower'],  band: true, weight: 1.5, dash: null,   period: 20,  mult: 1.5 }
};

/**
 * Which curve this annotation names.
 *
 * The host sends `indicator`, `period` and `mult`. The parse from the LABEL is
 * the fallback for a row that has none of them: one the user drew and typed
 * "50 EMA" into, or one written by a build that predates the fields. Mirrors
 * `parseIndicator` in packages/shared/indicators.ts — deliberately the loose
 * half of it, because everything strict already happened server-side.
 *
 * A NAME THIS TABLE DOES NOT HOLD RESOLVES TO NOTHING, which is how a panel
 * indicator (RSI, MACD) that somehow reached the client is refused rather than
 * rescaled onto a dollar axis. `shapeOf` turns that into a note, not a rule.
 */
function specOf(a) {
  var name = String(a.indicator || '').toLowerCase();
  var entry = IND[name];
  if (entry) {
    var p = Number(a.period);
    var m = Number(a.mult);
    return {
      indicator: name,
      period: entry.period === null ? null : (isFinite(p) && p >= 2 && p <= 500 ? Math.round(p) : entry.period),
      mult: entry.mult === null ? null : (isFinite(m) && m > 0 ? m : entry.mult)
    };
  }
  if (name) return null;

  var label = String(a.text || '').toLowerCase();
  if (!label) return null;
  if (/\bv\.?w\.?a\.?p\b/.test(label)) return { indicator: 'vwap', period: null, mult: null };
  if (/bollinger|bbands|\bbb\b|\bbb\s*\d/.test(label)) {
    return { indicator: 'bollinger', period: readNum(label, IND.bollinger.period), mult: IND.bollinger.mult };
  }
  if (/trend\s+clouds?|supertrend|super\s+trend/.test(label)) {
    return { indicator: 'trend_clouds', period: readNum(label, IND.trend_clouds.period), mult: IND.trend_clouds.mult };
  }
  var m2 = /\b(?:ema|sma|ma)\s*[-_]?\s*(\d{1,3})\b/.exec(label) ||
           /\b(\d{1,3})\s*[-_]?\s*(?:day|period|bar)?\s*[-_]?\s*(?:ema|sma|ma)\b/.exec(label) ||
           // Spelled out. "50-day moving average" has no acronym in it at all,
           // and it is what a row labelled by a person most often says.
           (/\bmoving\s+average\b/.test(label) ? /(\d{1,3})/.exec(label) : null);
  if (!m2) return null;
  var n = Number(m2[1]);
  if (!isFinite(n) || n < 2 || n > 500) return null;
  return { indicator: /\bsma\b|\bsimple\b/.test(label) ? 'sma' : 'ema', period: Math.round(n), mult: null };
}

/** The first plausible period in a label, or the registry's default. */
function readNum(label, fallback) {
  var m = /(\d{1,3})/.exec(String(label).split('(')[0]);
  if (!m) return fallback;
  var n = Number(m[1]);
  return isFinite(n) && n >= 2 && n <= 500 ? Math.round(n) : fallback;
}

function specKey(spec, anchor) {
  return spec.indicator + ':' + (spec.period == null ? '-' : spec.period) +
         ':' + (spec.mult == null ? '-' : spec.mult) + ':' + (anchor == null ? '-' : anchor);
}

/* ---- the primitives every entry is built from ---- */

/** SMA-seeded EMA. Null until the window has filled — never zero. */
function _ema(values, period) {
  var out = new Array(values.length);
  for (var z = 0; z < out.length; z++) out[z] = null;
  if (values.length < period) return out;
  var k = 2 / (period + 1), seed = 0, i;
  for (i = 0; i < period; i++) seed += values[i];
  var e = seed / period;
  out[period - 1] = e;
  for (i = period; i < values.length; i++) { e = values[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

function _sma(values, period) {
  var out = new Array(values.length);
  for (var z = 0; z < out.length; z++) out[z] = null;
  var sum = 0;
  for (var i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * `ewm(span, adjust=False)` — seeded with the FIRST value, not with an SMA.
 *
 * Deliberately different from `_ema` and NOT interchangeable with it. This is
 * the smoothing pandas does, and CheatCode Trend Clouds is defined in terms of
 * it (`_ema` in engine/kai_score/reference_cca.py). Using the SMA-seeded one
 * would move every band by a little, forever, and the line drawn here would
 * stop being the line the alert engine scored on.
 */
function _ewm(values, span) {
  var k = 2 / (span + 1), prev = null;
  var out = new Array(values.length);
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (v == null || !isFinite(v)) { out[i] = prev; continue; }
    prev = prev == null ? v : v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Population standard deviation, ddof = 0 — the one pandas and Pine both use. */
function _stdev(values, period) {
  var out = new Array(values.length);
  for (var z = 0; z < out.length; z++) out[z] = null;
  for (var i = period - 1; i < values.length; i++) {
    var m = 0, j;
    for (j = 0; j < period; j++) m += values[i - period + 1 + j];
    m /= period;
    var s = 0;
    for (j = 0; j < period; j++) { var d = values[i - period + 1 + j] - m; s += d * d; }
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

/** `ta.linreg(series, length, 0)` — the least-squares value at the newest bar. */
function _lsma(values, length) {
  var out = new Array(values.length);
  for (var z = 0; z < out.length; z++) out[z] = null;
  var sumX = (length * (length - 1)) / 2;
  var sumXX = ((length - 1) * length * (2 * length - 1)) / 6;
  var denom = length * sumXX - sumX * sumX;
  for (var i = length - 1; i < values.length; i++) {
    var sumY = 0, sumXY = 0;
    for (var j = 0; j < length; j++) { var y = values[i - length + 1 + j]; sumY += y; sumXY += j * y; }
    var slope = (length * sumXY - sumX * sumY) / denom;
    out[i] = (sumY - slope * sumX) / length + slope * (length - 1);
  }
  return out;
}

function _trueRange(bars) {
  var out = new Array(bars.length);
  for (var i = 0; i < bars.length; i++) {
    if (i === 0) { out[i] = bars[i].high - bars[i].low; continue; }
    var pc = bars[i - 1].close;
    out[i] = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - pc), Math.abs(bars[i].low - pc));
  }
  return out;
}

/**
 * Every point of every output, aligned to `bars` index for index.
 *
 * Values before the window has filled are ABSENT, not zero. A 200-bar average
 * over 150 bars starts nowhere, and a line dropping to the bottom of the pane
 * for its first 199 bars is a claim that price was there.
 */
function indicatorSeries(bars, vols, spec, anchorTime) {
  if (!bars || bars.length < 2) return null;
  var entry = IND[spec.indicator];
  if (!entry) return null;
  var i, closes = [];
  for (i = 0; i < bars.length; i++) closes.push(bars[i].close);
  var out = new Array(bars.length);
  for (i = 0; i < bars.length; i++) out[i] = { time: bars[i].time };

  if (spec.indicator === 'vwap') {
    // WHERE THE RUNNING TOTAL STARTS. The host sends the anchor — the first bar
    // of the session it priced. Without one, fall back to the last calendar-day
    // boundary in the data, and refuse outright when the bars ARE days: a
    // session VWAP over daily candles is not a thing, and drawing one anyway
    // would put a confident line over a meaningless number.
    var start = -1;
    if (anchorTime != null) {
      var u = typeof anchorTime === 'number' ? anchorTime : Math.floor(Date.parse(anchorTime) / 1000);
      if (isFinite(u)) for (i = 0; i < bars.length; i++) { if (bars[i].time >= u) { start = i; break; } }
    }
    if (start < 0) {
      var step = bars[1].time - bars[0].time;
      if (step >= 82800) return null;             // 23h — these are daily bars
      for (i = bars.length - 1; i > 0; i--) {
        if (Math.floor(bars[i].time / 86400) !== Math.floor(bars[i - 1].time / 86400)) { start = i; break; }
      }
      if (start < 0) start = 0;
    }
    if (start >= bars.length - 1) return null;
    var pv = 0, vol = 0, any = false;
    for (i = start; i < bars.length; i++) {
      var v = vols && vols[i] != null ? vols[i] : 0;
      if (!(v > 0)) continue;
      pv += ((bars[i].high + bars[i].low + bars[i].close) / 3) * v;
      vol += v;
      out[i].vwap = pv / vol;
      any = true;
    }
    return any ? out : null;
  }

  if (spec.indicator === 'ema' || spec.indicator === 'sma') {
    if (bars.length < spec.period) return null;
    var line = spec.indicator === 'ema' ? _ema(closes, spec.period) : _sma(closes, spec.period);
    for (i = 0; i < bars.length; i++) out[i][spec.indicator] = line[i];
    return out;
  }

  if (spec.indicator === 'bollinger') {
    if (bars.length < spec.period) return null;
    var basis = _sma(closes, spec.period);
    var sd = _stdev(closes, spec.period);
    for (i = 0; i < bars.length; i++) {
      if (basis[i] == null || sd[i] == null) continue;
      out[i].basis = basis[i];
      out[i].upper = basis[i] + spec.mult * sd[i];
      out[i].lower = basis[i] - spec.mult * sd[i];
    }
    return out;
  }

  if (spec.indicator === 'trend_clouds') {
    /**
     * PORTED FROM `supertrend` IN engine/kai_score/reference_cca.py, at its
     * default sensitivity ('Medium', an LSMA-12 source). The shapes are kept
     * identical to the reference rather than tidied, and the test runs the
     * PYTHON and fails on any bar that disagrees. That matters more here than
     * anywhere else on this page — the alert engine scores on a fresh
     * trend-cloud flip, so a port that drifted would draw a line disagreeing
     * with the grade printed beside it.
     */
    var n = bars.length;
    var src = _lsma(closes, 12);
    var atr = _ewm(_trueRange(bars), spec.period);
    var up = new Array(n), dn = new Array(n), trend = new Array(n);
    for (i = 0; i < n; i++) { up[i] = null; dn[i] = null; trend[i] = 1; }
    for (i = 1; i < n; i++) {
      var sv = src[i], av = atr[i];
      if (sv == null || av == null) {
        up[i] = up[i - 1] == null ? 0 : up[i - 1];
        dn[i] = dn[i - 1] == null ? 0 : dn[i - 1];
        trend[i] = trend[i - 1];
        continue;
      }
      var u2 = sv - spec.mult * av, d2 = sv + spec.mult * av;
      var u1 = up[i - 1] == null ? u2 : up[i - 1];
      var d1 = dn[i - 1] == null ? d2 : dn[i - 1];
      up[i] = closes[i - 1] > u1 ? Math.max(u2, u1) : u2;
      dn[i] = closes[i - 1] < d1 ? Math.min(d2, d1) : d2;
      var prev = trend[i - 1];
      if (prev === -1 && closes[i] > d1) trend[i] = 1;
      else if (prev === 1 && closes[i] < u1) trend[i] = -1;
      else trend[i] = prev;
      out[i].line = trend[i] === 1 ? up[i] : dn[i];
      out[i].upper = dn[i];
      out[i].lower = up[i];
    }
    return out;
  }

  return null;
}

function roundRect(ctx, x, y, w, h, r) {
  var rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * Per-annotation motion state. An annotation is not "set" and then present — it
 * ARRIVES: the line draws left to right, then the chip fades in behind Kai's
 * pointer. `flash` is the two-pulse acknowledgement ("this one, here").
 */
function AnnState() {
  this.bornAt = 0;      // performance.now() when it was added
  this.flashUntil = 0;  // pulse window end
  this.flashFrom = 0;
}

function AnnotationLayer() {
  this._chart = null;
  this._series = null;
  this._requestUpdate = null;
  this._items = [];
  this._state = {};       // id -> AnnState
  this._hidden = false;
  this._hit = [];         // media-space rects captured on the last draw, for taps
  // A rectangle the chips must not be drawn under — the floating timeframe
  // rail. A label hidden behind the control that changes timeframes is the
  // worst possible place to hide a level.
  this._avoid = null;
  this._bars = [];        // times, for placing a timestamp that is not exactly a bar
  this._vols = [];        // volume per bar, by index — VWAP is the only thing that needs it
  this._lastPrice = null; // which levels are nearest, when the budget has to choose
  this._curves = {};      // spec key -> computed series, so a pan costs no arithmetic
  this._curvesFor = '';   // the bar window those curves were computed over
  this._showAll = false;  // the overflow chip, tapped
  this._raf = 0;
  this._self = this;
}

AnnotationLayer.prototype.attached = function (p) {
  this._chart = p.chart;
  this._series = p.series;
  this._requestUpdate = p.requestUpdate;
};
AnnotationLayer.prototype.detached = function () {
  this._chart = null; this._series = null; this._requestUpdate = null;
};
AnnotationLayer.prototype.updateAllViews = function () { /* geometry is read at draw time */ };

/**
 * THE PRICE SCALE HAS TO FIT WHAT KAI DREW, NOT JUST THE CANDLES.
 *
 * Without this the scale autoscales to the visible bars and nothing else, so an
 * annotation outside that range is drawn — correctly, at the right price — off
 * the top or bottom of the pane, where nobody will ever see it. It is not
 * clipped, logged or reported. The line simply is not on the screen.
 *
 * It went unnoticed because the show runs on a daily chart, where a trigger a
 * few percent away is comfortably inside the visible range. An ANSWER runs on
 * whatever the user is looking at, and on a 5-minute chart the visible range is
 * often under a percent — so every level Kai marked was off-screen and the only
 * thing left was an arrow rising from the last price toward one of them. A
 * vertical line labelled "To go", and nothing else. Which is exactly what it
 * looked like.
 *
 * NO CLAMP ON HOW FAR THIS WILL STRETCH, deliberately. Capping the expansion
 * would put back the silent failure it exists to remove: a level just past the
 * cap would be invisible again with nothing to indicate it. A squashed chart is
 * bad; a chart quietly missing the level being discussed is worse, because the
 * user believes what they can see. If it stretches too far, the annotations
 * toggle already turns them off.
 */
AnnotationLayer.prototype.autoscaleInfo = function () {
  if (this._hidden) return null;
  // ONLY WHAT IS ACTUALLY DRAWN GETS TO STRETCH THE SCALE. A level the budget
  // folded away is not on screen, so letting it widen the price range would
  // squash the candles to make room for a line nobody can see — the failure this
  // function exists to prevent, running backwards.
  var b = this._budget(this._items);
  var visible = b.others.slice();
  for (var r = 0; r < b.rules.length; r++) visible.push(b.rules[r].lead);
  var lo = Infinity, hi = -Infinity, n = 0;
  for (var i = 0; i < visible.length; i++) {
    var a = visible[i];
    if (!a || a.status === 'hidden' || a.status === 'deleted') continue;
    var ps = [a.price, a.price2];
    for (var k = 0; k < ps.length; k++) {
      var v = ps[k];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      n++;
    }
  }
  if (!n || !isFinite(lo) || !isFinite(hi)) return null;
  // A hair of headroom so a level never draws flush against the pane edge,
  // where it reads as a border rather than a price.
  var pad = Math.max((hi - lo) * 0.04, Math.abs(hi) * 0.001, 0.01);
  return { priceRange: { minValue: lo - pad, maxValue: hi + pad } };
};

/** The library asks for views; we hand it one, in the normal layer. */
AnnotationLayer.prototype.paneViews = function () {
  var self = this;
  if (!this._view) {
    this._view = {
      zOrder: function () { return 'top'; },
      renderer: function () {
        return { draw: function (target) { self._draw(target); } };
      },
    };
  }
  return [this._view];
};

/**
 * The bar times, so a timestamp can be placed even when it is not exactly a
 * bar open. `timeToCoordinate` answers null for anything the series does not
 * contain — an anchor half a bar late, a level from a 5-minute setup on a
 * 15-minute chart — and a null x is why a box or a vertical silently vanishes.
 * Snapping to the nearest bar and going through the LOGICAL scale always
 * answers, and answers in the right place.
 */
AnnotationLayer.prototype.setBars = function (bars, vols, lastPrice) {
  this._bars = bars || [];
  // VOLUME COMES ALONG BECAUSE VWAP NEEDS IT. It rides beside the bars rather
  // than on them: the candle objects go straight into the library's series, and
  // hanging a field it does not know about off them is the kind of thing that
  // works until the library starts validating.
  this._vols = vols || [];
  if (lastPrice != null) this._lastPrice = lastPrice;
  // The window changed, so every curve computed over the old one is stale.
  this._curves = {};
  this._curvesFor = '';
};

/** The last traded price. Only the horizontal-line budget uses it. */
AnnotationLayer.prototype.setLastPrice = function (p) {
  this._lastPrice = typeof p === 'number' && isFinite(p) ? p : this._lastPrice;
};

/** Show every horizontal level, budget or not. The overflow chip toggles this. */
AnnotationLayer.prototype.toggleOverflow = function () {
  this._showAll = !this._showAll;
  this._kick();
  return this._showAll;
};

/** The series for one overlay, computed once per bar window. */
AnnotationLayer.prototype._curve = function (a) {
  var spec = specOf(a);
  if (!spec) return null;
  var stamp = this._bars.length + ':' + (this._bars.length ? this._bars[0].time + '-' + this._bars[this._bars.length - 1].time : '');
  if (stamp !== this._curvesFor) { this._curves = {}; this._curvesFor = stamp; }
  var key = specKey(spec, a.ts_from);
  if (!(key in this._curves)) {
    this._curves[key] = indicatorSeries(this._bars, this._vols, spec, a.ts_from);
  }
  return this._curves[key];
};

/* ------------------------------------------------------------------ */
/* The horizontal-line budget                                          */
/* ------------------------------------------------------------------ */

/** How many dashed rules may share the plot before it stops being readable. */
var MAX_RULES = 8;
/** Two rules this close together are one shelf drawn twice. */
var MERGE_PCT = 0.001;
/**
 * How many shaded areas before the chart is a stack of tints.
 *
 * Lower than the line budget, and it has to be: a rule costs one row of pixels
 * and a zone costs a region, so four overlapping fills darken each other into an
 * unreadable smear long before eight lines become a problem.
 */
var MAX_ZONES = 4;
/** Two zones overlapping by this much of their height are one area. */
var ZONE_MERGE = 0.6;

/**
 * WHICH TONE A ZONE TAKES, decided by where price is.
 *
 * The same rule the server uses for a level: an area under the last price is
 * acting as support and one above it as resistance, and it is the same area
 * either way. Naming the SIDE rather than the zone's own label is what stops a
 * "demand zone" keeping its tone after price has fallen through it.
 *
 * BOTH SIDES ARE CYAN TODAY, and that is the palette being right rather than
 * this function being pointless. Lock 14 gives red to risk and green to the
 * outcome; support and resistance are both market information and share the one
 * hue, so a zone is separated from a level by ALPHA — a wash rather than a rule
 * — not by colour. Asking `kindColor` anyway is the seam that keeps zones
 * following levels automatically if the palette ever does split them.
 */
AnnotationLayer.prototype._zoneColour = function (a) {
  var ref = this._lastPrice;
  var top = Math.max(a.price, a.price2);
  var bottom = Math.min(a.price, a.price2);
  if (ref == null || (ref <= top && ref >= bottom)) return kindColor('support');
  return kindColor(ref > top ? 'support' : 'resistance');
};

/**
 * WHICH LEVEL SURVIVES A COLLISION, AND WHICH SURVIVES THE CAP.
 *
 * 0 is the trade: where you get in, where you get out, where you were wrong,
 * where you take something off. Those are decisions and they are never dropped
 * — a chart that hid the stop to make room for a fib retracement would be worse
 * than a cluttered one. 1 is structure the market made. 2 is commentary.
 */
function rulePriority(kind) {
  if (kind === 'stop' || kind === 'invalidation') return 0;
  if (kind === 'entry' || kind === 'trigger' || kind === 'target') return 0;
  if (kind === 'support' || kind === 'resistance') return 1;
  return 2;
}

/**
 * Decide what actually gets drawn as a horizontal rule.
 *
 * TWO EDITS, IN THIS ORDER, AND THE ORDER MATTERS. Merge first: a trigger at
 * 504.00 and an entry at 504.02 are one line on any screen a person owns, and
 * counting them as two would spend two of the eight on a single pixel row.
 * Then cap what is left, plan and risk first and everything else by how close it
 * is to price — because a level twenty percent away is not what the user is
 * looking at even when it is real.
 *
 * NOTHING IS DELETED. The rest is counted and reported: the plot draws an
 * overflow chip, and the levels rail beside the chart lists every mark whatever
 * this decides. That is the whole reason a cap is safe here — the chart is being
 * edited for legibility, not the record.
 */
AnnotationLayer.prototype._budget = function (items) {
  var rules = [];
  var others = [];
  var zones = [];
  var i;
  for (i = 0; i < items.length; i++) {
    var a = items[i];
    if (!a || a.status === 'hidden' || a.status === 'deleted') continue;
    if (shapeOf(a) === 'level' && typeof a.price === 'number' && isFinite(a.price)) rules.push(a);
    else if (a.kind === 'zone' && typeof a.price === 'number' && typeof a.price2 === 'number') zones.push(a);
    else others.push(a);
  }

  /**
   * ZONES GET THEIR OWN BUDGET, NOT A SHARE OF THE LINES'.
   *
   * A rule costs one row of pixels; a zone costs a region, and two overlapping
   * washes are darker than either of them alone. So they are capped separately
   * and merged on a different rule — not "within a tenth of a percent" but
   * "mostly on top of each other", because two supply areas that share most of
   * their height ARE one area however far apart their edges happen to be.
   */
  zones.sort(function (x, y) {
    return Math.min(x.price, x.price2) - Math.min(y.price, y.price2);
  });
  var zoneGroups = [];
  for (i = 0; i < zones.length; i++) {
    var z = zones[i];
    var zTop = Math.max(z.price, z.price2), zBot = Math.min(z.price, z.price2);
    var merged = false;
    for (var g = 0; g < zoneGroups.length; g++) {
      var q = zoneGroups[g];
      var overlap = Math.min(zTop, q.top) - Math.max(zBot, q.bottom);
      var smaller = Math.min(zTop - zBot, q.top - q.bottom);
      if (smaller > 0 && overlap / smaller >= ZONE_MERGE) {
        // The union, so nothing the user marked ends up outside the area that
        // stands in for it.
        q.top = Math.max(q.top, zTop);
        q.bottom = Math.min(q.bottom, zBot);
        q.extra += 1;
        merged = true;
        break;
      }
    }
    if (!merged) zoneGroups.push({ lead: z, top: zTop, bottom: zBot, extra: 0 });
  }
  // Nearest to price first: an area twenty percent away is not what the user is
  // looking at even when it is real.
  var zref = this._lastPrice;
  if (zref != null) {
    zoneGroups.sort(function (x, y) {
      var dx = x.bottom > zref ? x.bottom - zref : zref > x.top ? zref - x.top : 0;
      var dy = y.bottom > zref ? y.bottom - zref : zref > y.top ? zref - y.top : 0;
      return dx - dy;
    });
  }
  var keptZones = this._showAll ? zoneGroups : zoneGroups.slice(0, MAX_ZONES);
  var hiddenZones = zoneGroups.length - keptZones.length;
  for (i = 0; i < keptZones.length; i++) {
    var kz = keptZones[i];
    // The merged group is drawn as one area spanning all of its members.
    others.push(kz.extra > 0
      ? Object.assign({}, kz.lead, { price: kz.top, price2: kz.bottom, text: (kz.lead.text || 'Zone') + ' +' + kz.extra })
      : kz.lead);
  }

  // --- merge ---
  rules.sort(function (x, y) { return x.price - y.price; });
  var groups = [];
  for (i = 0; i < rules.length; i++) {
    var g = groups[groups.length - 1];
    if (g && Math.abs(rules[i].price - g.lead.price) <= Math.abs(g.lead.price) * MERGE_PCT) {
      g.members.push(rules[i]);
      // The one that matters most speaks for the group. A stop merged into a
      // support is a stop, and it keeps the red.
      if (rulePriority(rules[i].kind) < rulePriority(g.lead.kind)) g.lead = rules[i];
    } else {
      groups.push({ lead: rules[i], members: [rules[i]] });
    }
  }

  // --- cap ---
  var ref = this._lastPrice;
  groups.sort(function (x, y) {
    var d = rulePriority(x.lead.kind) - rulePriority(y.lead.kind);
    if (d !== 0) return d;
    if (ref == null) return 0;
    return Math.abs(x.lead.price - ref) - Math.abs(y.lead.price - ref);
  });
  var keep = this._showAll ? groups : groups.slice(0, MAX_RULES);
  var hidden = groups.length - keep.length;

  var drawn = [];
  for (i = 0; i < keep.length; i++) {
    // A merged group is drawn once, and says so. "Stop +1" is honest about the
    // fact that two marks are under this line; silently drawing one of them
    // would leave a mark the user placed apparently missing.
    drawn.push(keep[i].members.length > 1 ? { lead: keep[i].lead, extra: keep[i].members.length - 1 } : { lead: keep[i].lead, extra: 0 });
  }
  return { rules: drawn, others: others, hidden: hidden + hiddenZones };
};

/** Tell the layer where the floating chrome is, in plot coordinates. */
AnnotationLayer.prototype.setAvoid = function (rect) {
  this._avoid = rect;
};

AnnotationLayer.prototype.setHidden = function (on) {
  this._hidden = !!on;
  this._kick();
};

/** Replace the whole set. Anything already on screen keeps its birth time so a
 *  re-send (a reload, a status change) does not replay every draw-in animation. */
AnnotationLayer.prototype.set = function (items) {
  var now = (window.performance || Date).now();
  var next = {};
  for (var i = 0; i < items.length; i++) {
    var id = items[i].id;
    next[id] = this._state[id] || new AnnState();
    if (!next[id].bornAt) next[id].bornAt = now;
  }
  this._state = next;
  this._items = items.slice();
  this._kick();
};

/** Add or replace a few. New ones animate in; existing ones just update. */
AnnotationLayer.prototype.add = function (items) {
  var now = (window.performance || Date).now();
  for (var i = 0; i < items.length; i++) {
    var a = items[i];
    var at = -1;
    for (var j = 0; j < this._items.length; j++) if (this._items[j].id === a.id) { at = j; break; }
    if (at === -1) {
      this._items.push(a);
      this._state[a.id] = new AnnState();
      this._state[a.id].bornAt = now;
    } else {
      this._items[at] = a;
      if (!this._state[a.id]) { this._state[a.id] = new AnnState(); this._state[a.id].bornAt = now; }
    }
  }
  this._kick();
};

AnnotationLayer.prototype.remove = function (ids) {
  var drop = {};
  for (var i = 0; i < ids.length; i++) drop[ids[i]] = true;
  this._items = this._items.filter(function (a) { return !drop[a.id]; });
  this._kick();
};

/** Two pulses. Used by `flash_annotation` and by the trigger candle. */
AnnotationLayer.prototype.flash = function (id, pulses) {
  var s = this._state[id];
  if (!s) return false;
  var now = (window.performance || Date).now();
  s.flashFrom = now;
  s.flashUntil = now + (pulses || 2) * 320;
  this._kick();
  return true;
};

AnnotationLayer.prototype.items = function () { return this._items; };

/**
 * Keep asking the chart to repaint while anything is still moving. The library
 * only redraws on its own events, so an annotation drawing itself in needs us to
 * drive the frames — and to STOP as soon as nothing is animating, because a
 * permanent rAF loop on a chart is a battery bug.
 */
AnnotationLayer.prototype._kick = function () {
  var self = this;
  if (this._raf) return;
  var tick = function () {
    self._raf = 0;
    if (self._requestUpdate) self._requestUpdate();
    if (self._animating()) self._raf = requestAnimationFrame(tick);
  };
  this._raf = requestAnimationFrame(tick);
};

AnnotationLayer.prototype._animating = function () {
  var now = (window.performance || Date).now();
  for (var i = 0; i < this._items.length; i++) {
    var s = this._state[this._items[i].id];
    if (!s) continue;
    if (now - s.bornAt < ANN_IN_MS) return true;
    if (now < s.flashUntil) return true;
  }
  return false;
};

var ANN_DRAW_MS = 220;   // the line growing left → right
var ANN_CHIP_MS = 160;   // the label fading in behind it
var ANN_IN_MS = ANN_DRAW_MS + ANN_CHIP_MS;

AnnotationLayer.prototype._draw = function (target) {
  var self = this;
  if (this._hidden || !this._items.length || !this._series) { this._hit = []; return; }

  target.useMediaCoordinateSpace(function (scope) {
    var ctx = scope.context;
    var W = scope.mediaSize.width;
    var H = scope.mediaSize.height;
    var now = (window.performance || Date).now();
    var ts = self._chart.timeScale();
    var hit = [];

    var toY = function (p) {
      var y = self._series.priceToCoordinate(p);
      return y == null ? null : y;
    };
    var bars = self._bars;
    var toX = function (t) {
      if (t == null) return null;
      var u = typeof t === 'number' ? t : Math.floor(Date.parse(t) / 1000);
      if (!isFinite(u)) return null;
      var x = ts.timeToCoordinate(u);
      if (x != null) return x;
      if (!bars.length) return null;
      // Nearest bar, then the logical scale — which extrapolates past both ends
      // rather than refusing, so an anchor just off the data still draws where
      // it belongs instead of disappearing.
      var lo = 0, hi = bars.length - 1;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (bars[mid].time < u) lo = mid + 1; else hi = mid;
      }
      var idx = lo;
      if (idx > 0 && Math.abs(bars[idx - 1].time - u) < Math.abs(bars[idx].time - u)) idx -= 1;
      var step = bars.length > 1 ? bars[1].time - bars[0].time : 0;
      var frac = step ? (u - bars[idx].time) / step : 0;
      return ts.logicalToCoordinate(idx + Math.max(-3, Math.min(3, frac)));
    };

    /* -------- chip vertical de-collision -------- */
    // Two levels at the same price (a trigger at 504 and an entry that starts at
    // 504) draw their LINES exactly where the prices are — only the LABELS are
    // nudged apart, top-down, so both stay readable and tappable.
    var placed = [];
    var claimY = function (want) {
      var y = want;
      for (var k = 0; k < placed.length; k++) {
        if (Math.abs(y - placed[k]) < 15) y = placed[k] + 15;
      }
      placed.push(y);
      return y;
    };

    ctx.save();
    ctx.font = CHIP_FONT;
    ctx.textBaseline = 'middle';

    /**
     * WHAT GETS DRAWN, AND HOW MANY OF IT.
     *
     * Curves, shapes and zones are all drawn — there is no such thing as too
     * many trendlines, because there is never more than one. It is the dashed
     * horizontal rules that pile up, and `_budget` is the only thing standing
     * between eleven of them and a chart made of stripes. Rules go LAST so a
     * level's label lands on top of a curve rather than under it.
     */
    var plan = self._budget(self._items);
    var queue = [];
    for (var q = 0; q < plan.others.length; q++) queue.push({ a: plan.others[q], extra: 0 });
    for (var q2 = 0; q2 < plan.rules.length; q2++) queue.push({ a: plan.rules[q2].lead, extra: plan.rules[q2].extra });

    for (var i = 0; i < queue.length; i++) {
      var a = queue[i].a;
      var mergedWith = queue[i].extra;
      if (a.status === 'hidden' || a.status === 'deleted') continue;
      var st = self._state[a.id] || new AnnState();
      var age = now - st.bornAt;
      var grow = Math.min(1, age / ANN_DRAW_MS);
      var grown = 1 - Math.pow(1 - grow, 3);                       // ease-out
      var chip = Math.max(0, Math.min(1, (age - ANN_DRAW_MS) / ANN_CHIP_MS));
      var dead = a.status === 'invalidated';
      var col = a.color || kindColor(a.kind);
      // Two pulses: the opacity swings, the line does not move. Motion that
      // moves a price line would be a lie about the price.
      var pulse = 1;
      if (now < st.flashUntil) {
        var ph = ((now - st.flashFrom) % 320) / 320;
        pulse = 0.45 + 0.55 * Math.abs(Math.cos(ph * Math.PI));
      }
      var base = (dead ? 0.34 : 0.92) * pulse;
      var shape = shapeOf(a);

      ctx.lineWidth = 1;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;

      if (shape === 'zone') {
        var yA = toY(a.price), yB = toY(a.price2);
        if (yA == null || yB == null) continue;
        var top = Math.min(yA, yB), bot = Math.max(yA, yB);
        ctx.globalAlpha = 0.13 * pulse * (dead ? 0.4 : 1);
        ctx.fillStyle = col;
        ctx.fillRect(0, top, W * grown, Math.max(2, bot - top));
        ctx.globalAlpha = base * 0.8;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(W * grown, top);
        ctx.moveTo(0, bot); ctx.lineTo(W * grown, bot); ctx.stroke();
        ctx.setLineDash([]);
        // The label goes on the PRICE it names, not on the top of the band. An
        // "Entry 504-507" chip hanging at 507 next to a tag reading 504.00 puts
        // the number a whole level away from where it is true.
        self._chipAndTag(ctx, a, col, claimY(yA), W, chip, base, hit, dead);

      } else if (shape === 'box') {
        /**
         * A SHADED AREA. `price` and `price2` are its edges in either order,
         * `ts_from` the bar it starts at, `ts_to` an optional end.
         *
         * AN UNBOUNDED ZONE RUNS TO THE RIGHT EDGE, and that is the difference
         * between a zone and a box rather than a detail of one. A supply shelf
         * is not something that happened between two dates — it is still there,
         * and a rectangle that stops halfway across the plot says it expired.
         * Leaving `ts_to` null and extending it here is also what keeps the zone
         * correct as new bars arrive, with nothing rewritten anywhere.
         */
        var x1 = toX(a.ts_from), x2 = a.ts_to == null ? null : toX(a.ts_to);
        var by1 = toY(a.price), by2 = toY(a.price2);
        if (by1 == null || by2 == null) continue;
        if (x1 == null) x1 = 0;
        if (x2 == null) x2 = W;
        var bx = Math.min(x1, x2), bw = Math.max(3, Math.abs(x2 - x1)) * grown;
        var byT = Math.min(by1, by2), bh = Math.max(2, Math.abs(by2 - by1));
        // A zone is coloured by which side of price it is on — the same rule
        // `computedLevels` uses on the server to decide whether a level is
        // acting as support or as resistance. The chart is the only place that
        // knows where price is, so it is the only place that can decide.
        var zc = a.kind === 'zone' ? self._zoneColour(a) : col;
        ctx.globalAlpha = 0.11 * pulse * (dead ? 0.4 : 1);
        ctx.fillStyle = zc;
        ctx.fillRect(bx, byT, bw, bh);
        // A hairline, so the area reads as a region rather than as two more
        // levels with a tint between them.
        ctx.globalAlpha = base * 0.55;
        ctx.strokeStyle = zc;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, byT + 0.5, bw - 1, bh - 1);
        // The label goes INSIDE the top-left of the area it names. Outside and
        // above, it collides with whatever level is sitting on the zone's own
        // upper edge — which, since the edges of a zone ARE levels, is common.
        var inside = bh > 22 ? byT + 10 : byT - 1;
        self._chipAt(ctx, a, zc, bx + 5, bh > 22 ? inside : claimY(inside), chip, base, hit, dead, W);

      } else if (shape === 'trendline') {
        var tx1 = toX(a.ts_from), tx2 = toX(a.ts_to);
        var ty1 = toY(a.price), ty2 = toY(a.price2 != null ? a.price2 : a.price);
        if (ty1 == null || ty2 == null) continue;
        if (tx1 == null) tx1 = 0;
        if (tx2 == null) tx2 = W;
        ctx.globalAlpha = base;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tx1, ty1);
        ctx.lineTo(tx1 + (tx2 - tx1) * grown, ty1 + (ty2 - ty1) * grown);
        ctx.stroke();
        // The anchors are the point of a trendline: two real bars, not a slope.
        ctx.globalAlpha = base * chip;
        ctx.beginPath(); ctx.arc(tx1, ty1, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(tx2, ty2, 2.6, 0, Math.PI * 2); ctx.fill();
        self._chipAt(ctx, a, col, Math.min(tx1, tx2) + 6, claimY(Math.min(ty1, ty2) - 1), chip, base, hit, dead, W);

      } else if (shape === 'vertical') {
        var vx = toX(a.ts_from);
        if (vx == null) continue;
        ctx.globalAlpha = base * 0.8;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(vx, H * (1 - grown)); ctx.lineTo(vx, H); ctx.stroke();
        ctx.setLineDash([]);
        self._chipAt(ctx, a, col, vx + 5, claimY(12), chip, base, hit, dead, W);

      } else if (shape === 'circle') {
        // A ring around the bar being talked about. The RADIUS IS PRESENTATION,
        // not data — it is a constant in pixels, so the circle cannot be read as
        // a claim about how wide a zone is. Everything asserted (which bar,
        // which price) is the centre.
        var cx = toX(a.ts_from), cy = toY(a.price);
        if (cx == null || cy == null) continue;
        var rr0 = 26;
        // Drawn as a slightly out-of-round ellipse and started from the top:
        // a perfect circle appearing all at once reads as a UI element, and a
        // hand-drawn ring reads as someone marking up a chart.
        ctx.globalAlpha = base * 0.9;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rr0 * 1.15, rr0 * 0.8, -0.12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * grown);
        ctx.stroke();
        self._chipAt(ctx, a, col, cx + rr0 * 1.15 + 4, claimY(cy), chip, base, hit, dead, W);

      } else if (shape === 'arrow') {
        // From where price is to the level it has not reached. Both ends are
        // real: the arrow says "this far to go" and cannot say it about a
        // number nobody stored.
        var ax = toX(a.ts_from), ax2 = toX(a.ts_to);
        var ay = toY(a.price), ay2 = toY(a.price2);
        if (ay == null || ay2 == null) continue;
        if (ax == null) ax = W * 0.72;
        if (ax2 == null) ax2 = ax;
        var ex = ax + (ax2 - ax) * grown, ey = ay + (ay2 - ay) * grown;
        ctx.globalAlpha = base;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
        // Head, oriented along the shaft rather than assumed vertical.
        var ang = Math.atan2(ey - ay, ex - ax);
        var hd = 7;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - hd * Math.cos(ang - 0.42), ey - hd * Math.sin(ang - 0.42));
        ctx.lineTo(ex - hd * Math.cos(ang + 0.42), ey - hd * Math.sin(ang + 0.42));
        ctx.closePath();
        ctx.fill();
        self._chipAt(ctx, a, col, ex + 6, claimY((ay + ey) / 2), chip, base, hit, dead, W);

      } else if (shape === 'indicator') {
        /**
         * A LINE THAT MOVES, DRAWN AS A LINE THAT MOVES.
         *
         * Every point comes from `indicatorSeries` over the bars on this page,
         * so it is correct on each bar rather than correct at the right-hand
         * edge and a lie everywhere else. It is a POLYLINE, not a price rule:
         * there is no branch in here that can degrade to `moveTo(0,y)`.
         *
         * WEIGHT SAYS WHICH AVERAGE, HUE NEVER DOES. All the curves are the one
         * muted grey — palette lock 14, and colour on this chart means meaning,
         * not identity. A short average is the one price is actually trading
         * against, so it is drawn brightest; a 200-day is a horizon and sits
         * back. Which is which is settled by the label, not by a legend.
         */
        var curve = self._curve(a);
        if (!curve || curve.length < 2) continue;
        var spec = specOf(a);
        var entry = IND[spec.indicator];
        var per = spec.period || 0;
        // A LONGER AVERAGE SITS FURTHER BACK. The short one is what price is
        // actually trading against; the 200 is a horizon. Weight is the only
        // thing distinguishing them, because hue is spoken for.
        var weight = entry.band ? 0.72 : spec.indicator === 'vwap' ? 0.8 : per <= 21 ? 0.85 : per <= 50 ? 0.68 : 0.52;
        ctx.lineJoin = 'round';

        // The reveal runs left to right with everything else, so a curve
        // arriving mid-sentence is the same gesture as a level arriving.
        var upto = Math.max(2, Math.round(curve.length * grown));

        /** One output as a polyline, returning where it ended. */
        var stroke = function (field, lw, alpha) {
          ctx.globalAlpha = base * alpha;
          ctx.lineWidth = lw;
          if (entry.dash) ctx.setLineDash(entry.dash);
          var started = false, ex = null, ey = null;
          ctx.beginPath();
          for (var ci = 0; ci < upto; ci++) {
            var v = curve[ci][field];
            if (v == null) { started = false; continue; }
            var px = toX(curve[ci].time);
            var py = toY(v);
            if (px == null || py == null) { started = false; continue; }
            // Off-pane vertically is normal for a long average on a zoomed
            // chart and is left to the canvas to clip. Off-pane HORIZONTALLY by
            // a wide margin is not worth the path segment.
            if (px < -W || px > W * 2) { started = false; continue; }
            if (!started) { ctx.moveTo(px, py); started = true; } else { ctx.lineTo(px, py); }
            ex = px; ey = py;
          }
          ctx.stroke();
          ctx.setLineDash([]);
          return ex == null ? null : { x: ex, y: ey };
        };

        /**
         * THE FILL IS WHAT MAKES A BAND READ AS ONE OBJECT.
         *
         * Bollinger's two edges and the Trend Clouds' two ratcheting bands are
         * not two indicators that happen to be near each other — the DISTANCE
         * between them is the whole message ("the band is squeezing", "the cloud
         * is holding under price"). Drawn as two separate thin lines they read
         * as two more averages on a chart that already has four. Every pixel of
         * the fill is bounded by two computed series; nothing here is invented
         * to make a shape.
         */
        if (entry.band) {
          ctx.globalAlpha = 0.055 * pulse * (dead ? 0.4 : 1);
          ctx.fillStyle = col;
          ctx.beginPath();
          var open = false, k2;
          for (k2 = 0; k2 < upto; k2++) {
            var hv = curve[k2].upper;
            if (hv == null) continue;
            var hx = toX(curve[k2].time), hy = toY(hv);
            if (hx == null || hy == null) continue;
            if (!open) { ctx.moveTo(hx, hy); open = true; } else ctx.lineTo(hx, hy);
          }
          if (open) {
            for (k2 = upto - 1; k2 >= 0; k2--) {
              var lv2 = curve[k2].lower;
              if (lv2 == null) continue;
              var lx2 = toX(curve[k2].time), ly2 = toY(lv2);
              if (lx2 == null || ly2 == null) continue;
              ctx.lineTo(lx2, ly2);
            }
            ctx.closePath();
            ctx.fill();
          }
          ctx.strokeStyle = col;
          stroke('upper', 0.9, weight * 0.8);
          stroke('lower', 0.9, weight * 0.8);
        }

        ctx.strokeStyle = col;
        var end = stroke(entry.outputs[0], entry.band ? entry.weight : (per > 50 ? 1 : 1.2), weight);
        // THE LABEL SITS ON THE END OF THE LINE, which is the only place on a
        // moving average where a single number is true. `_chipAt` keeps it clear
        // of the price axis on its own.
        if (end) self._chipAt(ctx, a, col, end.x + 6, claimY(end.y), chip, base, hit, dead, W);

      } else if (shape === 'note') {
        var nx = toX(a.ts_from);
        var ny = toY(a.price);
        if (ny == null) ny = H * 0.2;
        if (nx == null) nx = 10;
        ctx.globalAlpha = base * 0.5;
        ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fill();
        self._chipAt(ctx, a, col, nx + 7, claimY(ny), chip, base, hit, dead, W);

      } else {
        var ly = toY(a.price);
        if (ly == null) continue;
        ctx.globalAlpha = base;
        ctx.setLineDash(dead ? [2, 4] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, Math.round(ly) + 0.5);
        ctx.lineTo(W * grown, Math.round(ly) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        self._chipAndTag(ctx, a, col, claimY(ly), W, chip, base, hit, dead, mergedWith);
      }
    }

    /**
     * WHAT THE BUDGET FOLDED AWAY, SAID OUT LOUD.
     *
     * A cap that hides things silently is a chart lying by omission — the user
     * marked a level, it is not on screen, and nothing anywhere says why. So the
     * count is drawn, and it is tappable: one press shows every rule, another
     * puts the budget back.
     */
    if (plan.hidden > 0 || self._showAll) {
      var oTxt = self._showAll ? 'Show fewer marks' : '+' + plan.hidden + ' more mark' + (plan.hidden === 1 ? '' : 's');
      ctx.font = CHIP_FONT;
      ctx.textBaseline = 'middle';
      var ow = ctx.measureText(oTxt).width + 12;
      var ox = W - ow - 50;
      var oy = H - 14;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = TOKENS.surface;
      roundRect(ctx, ox, oy - 8, ow, 16, 4);
      ctx.fill();
      ctx.strokeStyle = withAlpha(TOKENS.text, 0.16);
      ctx.lineWidth = 0.75;
      ctx.stroke();
      ctx.fillStyle = TOKENS.muted;
      ctx.textAlign = 'left';
      ctx.fillText(oTxt, ox + 6, oy + 0.5);
      hit.push({ id: OVERFLOW_ID, x: ox - 8, y: oy - 16, w: ow + 16, h: 32 });
    }

    ctx.restore();
    self._hit = hit;
  });
};

/** The tap target the overflow chip claims. Not an annotation; the host checks for it. */
var OVERFLOW_ID = '__levels_overflow__';

/** The left label plus the price tag hanging on the right edge. */
AnnotationLayer.prototype._chipAndTag = function (ctx, a, col, y, W, chip, base, hit, dead, extra) {
  // Slide out from under the rail rather than being covered by it. The LINE
  // still starts at x=0 — only the label moves, and only when it has to.
  this._chipAt(ctx, a, col, 4, y, chip, base, hit, dead, W, extra);
  if (a.price == null || chip <= 0) return;
  var txt = fmtPrice(a.price);
  ctx.font = TAG_FONT;
  var w = ctx.measureText(txt).width + 10;
  var x = W - w - 3;
  ctx.globalAlpha = (dead ? 0.4 : 1) * chip;
  ctx.fillStyle = col;
  roundRect(ctx, x, y - 7.5, w, 15, 3);
  ctx.fill();
  ctx.fillStyle = TOKENS.bg;
  ctx.textAlign = 'center';
  ctx.fillText(txt, x + w / 2, y + 0.5);
  ctx.textAlign = 'left';
};

/** One label chip. Opaque, because the level's own dashed line runs behind it
 *  and a translucent chip made every label read struck through. */
AnnotationLayer.prototype._chipAt = function (ctx, a, col, x, y, chip, base, hit, dead, W, extra) {
  if (chip <= 0) return;
  var label = a.text || KIND_LABEL[a.kind] || a.kind;
  // Two marks a tenth of a percent apart are one line on any screen. The suffix
  // is how the line admits it is standing in for both, so a level the user
  // placed never appears to have simply vanished.
  if (extra > 0) label += ' +' + extra;
  ctx.font = CHIP_FONT;
  var w = ctx.measureText(label).width + 11 + (a.provenance === 'kai' ? 8 : 0);

  // A label always stays fully on the plot. A trendline anchored 40 bars off
  // the left edge would otherwise hang its chip in the margin, where all you
  // see is the last few pixels of a box and no word at all.
  if (typeof W === 'number') x = Math.max(4, Math.min(x, W - w - 46));
  // And it steps out from under the floating rail rather than hiding behind it.
  var av = this._avoid;
  if (av && y > av.y - 9 && y < av.y + av.h + 9 && x < av.x + av.w + 6) x = av.x + av.w + 6;
  ctx.globalAlpha = (dead ? 0.55 : 1) * chip;
  ctx.fillStyle = TOKENS.bg;
  roundRect(ctx, x, y - 7.5, w, 15, 3.5);
  ctx.fill();
  ctx.strokeStyle = withAlpha(col, 0.55);
  ctx.lineWidth = 0.75;
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.fillText(label, x + 5.5, y + 0.5);
  // Kai's mark carries Kai's colour as a dot. Provenance is visible without
  // opening anything — you can see at a glance which lines you drew.
  if (a.provenance === 'kai') {
    ctx.fillStyle = TOKENS.violet;
    ctx.beginPath(); ctx.arc(x + w - 5, y, 2, 0, Math.PI * 2); ctx.fill();
  }
  // 44pt-ish tap target, taller than the chip it belongs to.
  hit.push({ id: a.id, x: x - 6, y: y - 15, w: w + 12, h: 30 });
};

/** Which annotation, if any, is under this tap. Nearest chip wins. */
AnnotationLayer.prototype.hitTest = function (x, y) {
  var best = null, bestD = Infinity;
  for (var i = 0; i < this._hit.length; i++) {
    var r = this._hit[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      var d = Math.abs(y - (r.y + r.h / 2));
      if (d < bestD) { bestD = d; best = r.id; }
    }
  }
  return best;
};

var KIND_LABEL = {
  trigger: 'Trigger', entry: 'Entry', stop: 'Stop', invalidation: 'Invalid',
  target: 'Target', support: 'Support', resistance: 'Resistance', note: 'Note',
  trendline: 'Trend', box: 'Zone', vertical: 'Mark',
  circle: 'Here', arrow: 'To go',
  // The fallback only. An overlay carries its own name — "EMA 21", "VWAP" —
  // and `a.text` is what the chip shows.
  indicator: 'Average',
};

function fmtPrice(p) {
  var n = Number(p);
  if (!isFinite(n)) return '—';
  return n >= 1000 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(4);
}
