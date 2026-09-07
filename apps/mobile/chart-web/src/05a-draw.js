/**
 * Drawing on the chart with your own hands.
 *
 * THE GAP THIS FILLS, in the owner's words: "little things like no manual
 * drawing abilities". Everything on this chart until now was placed by Kai or
 * computed from bars. A trader's first instinct in front of a chart is to draw
 * a line on it, and there was nothing to draw with — which quietly says the
 * chart is something you watch rather than something you use.
 *
 * WHAT THIS FILE IS, AND WHAT IT DELIBERATELY IS NOT. It is the GESTURE half:
 * which surface was touched, what shape that turns into, and which handle is
 * being dragged. It is NOT a renderer — every drawing is an ordinary annotation
 * and goes through the same `AnnotationLayer` that draws Kai's, so a user's
 * trendline and Kai's are the same object drawn by the same code, differing
 * only in `provenance`. That is the whole reason a user's drawing can be
 * selected, hidden, explained and persisted without any of that being built
 * twice.
 *
 * ONE POINTER PATH FOR FINGER AND MOUSE. Pointer Events are supported by every
 * surface this app runs on — WKWebView, Android WebView, and desktop browsers
 * for Expo web — so there is one set of handlers rather than a touch path and a
 * mouse path that drift apart. The test drives both.
 *
 * THE LIBRARY'S GESTURES ARE TURNED OFF WHILE A TOOL IS ACTIVE, and back on the
 * moment it is put away. Drawing a trendline across a chart that is panning
 * underneath the finger produces a line through two prices that were never both
 * on screen, which is worse than no line at all.
 *
 * NOTHING HERE WRITES TO A DATABASE. The page has no network (see 07-bridge.js).
 * A finished drawing is POSTED UP to the host, which persists it through the
 * same annotations API Kai's marks go through and sends the authoritative row
 * back down. Until that round trip lands the drawing is on screen as a draft, so
 * the line appears under the finger rather than after a server.
 */

/** How close a finger has to get to a handle for it to count as grabbing it. */
var HANDLE_HIT = 16;
/** Below this, a drag was a tap. Fingers are not precise and a tap is not a box. */
var DRAG_MIN = 6;

function DrawTool(chart) {
  this.c = chart;
  this.tool = null;        // null | 'level' | 'trendline' | 'zone'
  this.selectedId = null;
  this._draft = null;      // the annotation being created or edited
  this._grab = null;       // which handle, when editing
  this._from = null;       // pointer down position
  this._seq = 0;
  this._pressTimer = 0;
  this._saved = null;      // the library's gesture options, while a tool is out
  this._bind();
}

/* ------------------------------------------------------------------ */
/* Coordinates                                                         */
/* ------------------------------------------------------------------ */

/** Price at a y, or null off the scale. */
DrawTool.prototype._price = function (y) {
  var p = this.c.series.coordinateToPrice(y);
  return p == null || !isFinite(p) ? null : p;
};

/**
 * The bar time at an x.
 *
 * `coordinateToTime` answers null past either end of the data, and a drawing
 * anchored just off the last bar is a completely reasonable thing to want — so
 * the logical scale is used instead, which extrapolates. Snapping to whole bars
 * is deliberate: a trendline anchored a third of the way through a candle
 * implies a precision the data does not have.
 */
DrawTool.prototype._time = function (x) {
  var bars = this.c.bars;
  if (!bars.length) return null;
  var logical = this.c.chart.timeScale().coordinateToLogical(x);
  if (logical == null || !isFinite(logical)) return null;
  var idx = Math.round(logical);
  if (idx >= 0 && idx < bars.length) return bars[idx].time;
  var step = bars.length > 1 ? bars[1].time - bars[0].time : 86400;
  if (idx < 0) return bars[0].time + idx * step;
  return bars[bars.length - 1].time + (idx - (bars.length - 1)) * step;
};

/** Where the pointer is, in the plot's own coordinates. */
DrawTool.prototype._at = function (e) {
  var r = this.c.host.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

/** True when this x is over the price axis rather than the plot. */
DrawTool.prototype._overAxis = function (x) {
  var w = 0;
  try { w = this.c.chart.priceScale('right').width(); } catch (e) { w = 0; }
  return w > 0 && x >= this.c.host.clientWidth - w - 2;
};

/* ------------------------------------------------------------------ */
/* Tool state                                                          */
/* ------------------------------------------------------------------ */

/**
 * Pick up a tool, or put it down.
 *
 * WHILE A TOOL IS OUT THE CHART DOES NOT MOVE. The options are saved and
 * restored rather than reset to a guess, so putting the tool away returns the
 * chart to whatever the host had configured — embedded or on the stage, which
 * are genuinely different gesture sets.
 */
DrawTool.prototype.setTool = function (tool) {
  var next = tool === 'level' || tool === 'trendline' || tool === 'zone' ? tool : null;
  if (next === this.tool) return;
  this.tool = next;
  this.c.host.style.cursor = next ? 'crosshair' : '';

  if (next && !this._saved) {
    var o = this.c.chart.options();
    this._saved = { handleScroll: o.handleScroll, handleScale: o.handleScale };
    this.c.chart.applyOptions({
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false, axisDoubleClickReset: false },
    });
  } else if (!next && this._saved) {
    this.c.chart.applyOptions(this._saved);
    this._saved = null;
  }
  // Picking up a tool clears the selection: you are about to make a new thing,
  // and leaving handles on an old one invites a drag that edits the wrong shape.
  if (next) this.select(null);
  post({ type: 'draw.tool', payload: { tool: this.tool } });
};

DrawTool.prototype.select = function (id) {
  if (this.selectedId === id) return;
  this.selectedId = id;
  this.c.annotations.setSelected(id);
  var a = this._find(id);
  post({
    type: 'draw.selected',
    payload: { id: id, kind: a ? a.kind : null, provenance: a ? a.provenance : null, text: a ? a.text : null },
  });
};

DrawTool.prototype._find = function (id) {
  if (!id) return null;
  var items = this.c.annotations.items();
  for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
  return null;
};

/** Remove the selected drawing. Only ever the user's own — see `_hitOwn`. */
DrawTool.prototype.deleteSelected = function () {
  var id = this.selectedId;
  var a = this._find(id);
  if (!a || a.provenance !== 'user') return false;
  this.select(null);
  this.c.annotations.remove([id]);
  post({ type: 'draw.deleted', payload: { id: id } });
  return true;
};

/* ------------------------------------------------------------------ */
/* The gestures                                                        */
/* ------------------------------------------------------------------ */

DrawTool.prototype._bind = function () {
  var self = this;
  var host = this.c.host;
  host.addEventListener('pointerdown', function (e) { self._down(e); });
  host.addEventListener('pointermove', function (e) { self._move(e); });
  host.addEventListener('pointerup', function (e) { self._up(e); });
  host.addEventListener('pointercancel', function () { self._cancel(); });
};

/** The handles of the selected drawing, in plot coordinates. */
DrawTool.prototype._handles = function (a) {
  if (!a) return [];
  var self = this;
  var toY = function (p) { return p == null ? null : self.c.series.priceToCoordinate(p); };
  var toX = function (t) {
    if (t == null) return null;
    var u = typeof t === 'number' ? t : Math.floor(Date.parse(t) / 1000);
    return self.c.chart.timeScale().timeToCoordinate(u);
  };
  var W = this.c.host.clientWidth;
  var out = [];
  if (a.kind === 'trendline') {
    out.push({ h: 'from', x: toX(a.ts_from), y: toY(a.price) });
    out.push({ h: 'to', x: toX(a.ts_to), y: toY(a.price2) });
  } else if (a.kind === 'zone') {
    var x1 = toX(a.ts_from);
    var x2 = a.ts_to == null ? W - 60 : toX(a.ts_to);
    out.push({ h: 'top', x: x1 == null ? 20 : x1 + 14, y: toY(a.price) });
    out.push({ h: 'bottom', x: x1 == null ? 20 : x1 + 14, y: toY(a.price2) });
    out.push({ h: 'from', x: x1, y: (toY(a.price) + toY(a.price2)) / 2 });
    if (a.ts_to != null) out.push({ h: 'to', x: x2, y: (toY(a.price) + toY(a.price2)) / 2 });
  } else {
    // A level has one handle, and it is deliberately not at x=0: a control in
    // the corner of the plot is a control under the chip that names the line.
    out.push({ h: 'price', x: W * 0.5, y: toY(a.price) });
  }
  return out.filter(function (p) { return p.x != null && p.y != null; });
};

/** The user-authored drawing under this point, if any. Kai's are not grabbable. */
DrawTool.prototype._hitOwn = function (pt) {
  var items = this.c.annotations.items();
  var best = null;
  var bestD = Infinity;
  var self = this;
  var toY = function (p) { return p == null ? null : self.c.series.priceToCoordinate(p); };
  for (var i = 0; i < items.length; i++) {
    var a = items[i];
    if (a.provenance !== 'user' || a.status === 'hidden' || a.status === 'deleted') continue;
    var d = Infinity;
    if (a.kind === 'zone') {
      var y1 = toY(a.price), y2 = toY(a.price2);
      if (y1 == null || y2 == null) continue;
      var top = Math.min(y1, y2), bot = Math.max(y1, y2);
      d = pt.y >= top - 4 && pt.y <= bot + 4 ? 0 : Math.min(Math.abs(pt.y - top), Math.abs(pt.y - bot));
    } else if (a.kind === 'trendline') {
      var hs = this._handles(a);
      if (hs.length < 2) continue;
      d = distToSegment(pt, hs[0], hs[1]);
    } else {
      var y = toY(a.price);
      if (y == null) continue;
      d = Math.abs(pt.y - y);
    }
    if (d < bestD) { bestD = d; best = a; }
  }
  return bestD <= 14 ? best : null;
};

DrawTool.prototype._down = function (e) {
  var pt = this._at(e);
  if (this._overAxis(pt.x)) return;
  this._from = pt;

  // --- editing an existing drawing ---
  if (!this.tool) {
    var sel = this._find(this.selectedId);
    var hs = this._handles(sel);
    for (var i = 0; i < hs.length; i++) {
      if (Math.abs(hs[i].x - pt.x) <= HANDLE_HIT && Math.abs(hs[i].y - pt.y) <= HANDLE_HIT) {
        this._grab = { id: sel.id, handle: hs[i].h, before: cloneAnn(sel) };
        this._lockChart(true);
        return;
      }
    }
    var own = this._hitOwn(pt);
    this.select(own ? own.id : null);
    // A long press on your own drawing offers to remove it. It is the gesture a
    // phone has for "and now do something to this thing", and it means the
    // delete does not depend on chrome being on screen.
    if (own) {
      var self = this;
      clearTimeout(this._pressTimer);
      this._pressTimer = setTimeout(function () {
        post({ type: 'draw.longPress', payload: { id: own.id } });
      }, 550);
    }
    return;
  }

  // --- creating a new one ---
  var price = this._price(pt.y);
  var time = this._time(pt.x);
  if (price == null || time == null) return;
  var id = 'draft:' + (++this._seq);
  this._draft =
    this.tool === 'level'
      ? { id: id, kind: 'support', price: round2(price), price2: null, ts_from: null, ts_to: null, text: 'Level', provenance: 'user', status: 'valid' }
      : this.tool === 'trendline'
        ? { id: id, kind: 'trendline', price: round2(price), price2: round2(price), ts_from: time, ts_to: time, text: 'Trendline', provenance: 'user', status: 'valid' }
        : { id: id, kind: 'zone', price: round2(price), price2: round2(price), ts_from: time, ts_to: null, text: 'Zone', provenance: 'user', status: 'valid' };
  this.c.annotations.add([this._draft]);
  this._lockChart(true);
};

DrawTool.prototype._move = function (e) {
  if (!this._from) return;
  var pt = this._at(e);
  if (Math.abs(pt.x - this._from.x) > 4 || Math.abs(pt.y - this._from.y) > 4) clearTimeout(this._pressTimer);

  if (this._grab) {
    var a = this._find(this._grab.id);
    if (!a) return;
    var p = this._price(pt.y);
    var t = this._time(pt.x);
    if (this._grab.handle === 'price' || this._grab.handle === 'top') { if (p != null) a.price = round2(p); }
    else if (this._grab.handle === 'bottom') { if (p != null) a.price2 = round2(p); }
    else if (this._grab.handle === 'from') {
      if (t != null) a.ts_from = t;
      if (p != null && a.kind === 'trendline') a.price = round2(p);
    } else if (this._grab.handle === 'to') {
      if (t != null) a.ts_to = t;
      if (p != null && a.kind === 'trendline') a.price2 = round2(p);
    }
    this.c.annotations.add([a]);
    return;
  }

  if (!this._draft) return;
  var pp = this._price(pt.y);
  var tt = this._time(pt.x);
  if (this._draft.kind === 'support') {
    if (pp != null) this._draft.price = round2(pp);
  } else if (this._draft.kind === 'trendline') {
    if (pp != null) this._draft.price2 = round2(pp);
    if (tt != null) this._draft.ts_to = tt;
  } else {
    if (pp != null) this._draft.price2 = round2(pp);
    // A drag that stayed in one column is a band, not a box: it is left OPEN at
    // the right so it runs to the live edge, which is what a supply or demand
    // area actually claims. Moving sideways is how you say "only this stretch".
    if (tt != null && Math.abs(pt.x - this._from.x) > DRAG_MIN * 3) this._draft.ts_to = tt;
  }
  this.c.annotations.add([this._draft]);
};

DrawTool.prototype._up = function (e) {
  clearTimeout(this._pressTimer);
  var pt = this._at(e);
  var moved = this._from ? Math.abs(pt.x - this._from.x) + Math.abs(pt.y - this._from.y) : 0;
  this._from = null;
  this._lockChart(false);

  if (this._grab) {
    var edited = this._find(this._grab.id);
    var g = this._grab;
    this._grab = null;
    if (edited) post({ type: 'draw.changed', payload: { annotation: cloneAnn(edited) } });
    return;
  }

  var d = this._draft;
  this._draft = null;
  if (!d) return;

  /**
   * A SHAPE THAT NEVER GOT A SECOND POINT IS NOT A SHAPE.
   *
   * A tap with the trendline tool would otherwise store a line from a bar to
   * itself — a dot claiming to be a trendline — and a tap with the zone tool a
   * rectangle with no height, which is a level wearing a box's clothes. Both are
   * dropped, and the tool stays out so the next attempt is just a drag.
   *
   * A LEVEL IS THE ONE THING A TAP CAN FINISH, because a horizontal line needs
   * one price and nothing else.
   */
  if (d.kind !== 'support' && moved < DRAG_MIN) {
    this.c.annotations.remove([d.id]);
    return;
  }
  if (d.kind === 'zone' && Math.abs(d.price - d.price2) < Math.max(0.01, Math.abs(d.price) * 0.0005)) {
    this.c.annotations.remove([d.id]);
    return;
  }
  if (d.kind === 'zone') {
    var hi = Math.max(d.price, d.price2);
    var lo = Math.min(d.price, d.price2);
    d.price = hi; d.price2 = lo;
  }
  post({ type: 'draw.created', payload: { annotation: cloneAnn(d) } });
  this.select(d.id);
  // One shape per pick-up. Leaving the tool armed is how a chart ends up with
  // five lines nobody meant to draw.
  this.setTool(null);
};

DrawTool.prototype._cancel = function () {
  clearTimeout(this._pressTimer);
  if (this._draft) this.c.annotations.remove([this._draft.id]);
  this._draft = null;
  this._grab = null;
  this._from = null;
  this._lockChart(false);
};

/** Hold the chart still for the duration of a drag that is not about the camera. */
DrawTool.prototype._lockChart = function (on) {
  if (this.tool) return;   // already locked for as long as the tool is out
  if (on && !this._editLock) {
    var o = this.c.chart.options();
    this._editLock = { handleScroll: o.handleScroll, handleScale: o.handleScale };
    this.c.chart.applyOptions({
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false, axisDoubleClickReset: false },
    });
  } else if (!on && this._editLock) {
    this.c.chart.applyOptions(this._editLock);
    this._editLock = null;
  }
};

/* ------------------------------------------------------------------ */
/* Small shared geometry                                               */
/* ------------------------------------------------------------------ */

function round2(n) { return Math.round(n * 100) / 100; }

function cloneAnn(a) {
  return {
    id: a.id, kind: a.kind, price: a.price, price2: a.price2,
    ts_from: a.ts_from, ts_to: a.ts_to, text: a.text,
    provenance: a.provenance, status: a.status,
  };
}

/** Distance from a point to a segment — how a trendline is hit-tested. */
function distToSegment(p, a, b) {
  var dx = b.x - a.x, dy = b.y - a.y;
  var len = dx * dx + dy * dy;
  if (!len) return Math.hypot(p.x - a.x, p.y - a.y);
  var t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
