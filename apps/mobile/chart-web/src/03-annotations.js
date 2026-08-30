/**
 * The annotation layer — a Lightweight Charts v5 series primitive.
 *
 * SIX PRIMITIVES, ONE RENDERER. `level`, `zone`, `trendline`, `box`, `vertical`
 * and `note` are drawn by one pass over one canvas rather than six plugin
 * objects, because they share a coordinate system, a z-order and a hit test, and
 * splitting them would only split the places a bug can hide.
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
  if (a.kind === 'box') return 'box';
  if (a.kind === 'vertical') return 'vertical';
  if (a.kind === 'circle') return 'circle';
  if (a.kind === 'arrow') return 'arrow';
  if (a.kind === 'note') return 'note';
  if (a.price != null && a.price2 != null) return 'zone';
  return 'level';
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
  var lo = Infinity, hi = -Infinity, n = 0;
  for (var i = 0; i < this._items.length; i++) {
    var a = this._items[i];
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
AnnotationLayer.prototype.setBars = function (bars) {
  this._bars = bars || [];
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

    for (var i = 0; i < self._items.length; i++) {
      var a = self._items[i];
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
        var x1 = toX(a.ts_from), x2 = toX(a.ts_to);
        var by1 = toY(a.price), by2 = toY(a.price2);
        if (by1 == null || by2 == null) continue;
        if (x1 == null) x1 = 0;
        if (x2 == null) x2 = W;
        var bx = Math.min(x1, x2), bw = Math.max(3, Math.abs(x2 - x1)) * grown;
        var byT = Math.min(by1, by2), bh = Math.max(2, Math.abs(by2 - by1));
        ctx.globalAlpha = 0.14 * pulse * (dead ? 0.4 : 1);
        ctx.fillRect(bx, byT, bw, bh);
        ctx.globalAlpha = base * 0.85;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(bx + 0.5, byT + 0.5, bw - 1, bh - 1);
        ctx.setLineDash([]);
        self._chipAt(ctx, a, col, bx + 4, claimY(byT - 1), chip, base, hit, dead, W);

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
        self._chipAndTag(ctx, a, col, claimY(ly), W, chip, base, hit, dead);
      }
    }

    ctx.restore();
    self._hit = hit;
  });
};

/** The left label plus the price tag hanging on the right edge. */
AnnotationLayer.prototype._chipAndTag = function (ctx, a, col, y, W, chip, base, hit, dead) {
  // Slide out from under the rail rather than being covered by it. The LINE
  // still starts at x=0 — only the label moves, and only when it has to.
  this._chipAt(ctx, a, col, 4, y, chip, base, hit, dead, W);
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
AnnotationLayer.prototype._chipAt = function (ctx, a, col, x, y, chip, base, hit, dead, W) {
  if (chip <= 0) return;
  var label = a.text || KIND_LABEL[a.kind] || a.kind;
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
};

function fmtPrice(p) {
  var n = Number(p);
  if (!isFinite(n)) return '—';
  return n >= 1000 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(4);
}
