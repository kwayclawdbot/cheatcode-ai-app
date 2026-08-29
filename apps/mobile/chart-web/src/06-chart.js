/**
 * The chart itself, and the camera Kai drives.
 *
 * EVERY CAMERA MOVE IS ONE OPERATION: setting the visible LOGICAL range.
 * Scroll, zoom, fit and "go to that candle" are all the same two numbers moving
 * — `{from, to}` in bar indices — which is why they can be eased with one tween
 * runner, interrupted at one place, and composed into a sequence without the
 * seams you get from mixing `scrollToPosition` with `applyOptions({barSpacing})`
 * with `setVisibleRange`. Bar spacing is a CONSEQUENCE (width / span), not an
 * input, so a zoom can never fight a scroll for the same frame.
 *
 * WHAT THE USER OWNS: `handleScroll` / `handleScale` / `kineticScroll` are the
 * library's own gesture stack — real momentum, real pinch, anchored on the pinch
 * centre. We do not reimplement any of it. The first touch on the glass cancels
 * whatever Kai was doing (see `_bindInterrupt`), which is the whole of rule 3 in
 * 02-motion.js applied to a chart.
 */

var LWC = window.LightweightCharts;

/** The rail, and the window each timeframe opens on. From the LIVE-1 brief. */
var TF_BARS = { D: 120, '4h': 120, '1h': 100, '15m': 96, '5m': 78, '1m': 90 };
var TF_ORDER = ['1m', '5m', '15m', '1h', '4h', 'D'];

function Chart(root) {
  var self = this;
  this.root = root;
  this.bars = [];               // normalized {time, open, high, low, close, value}
  this.timeframe = 'D';
  this.symbol = '';
  this.lastPrice = null;
  this.volumeOn = false;
  this._seq = 0;
  this._readyPosted = false;
  this._userTouching = false;

  var host = document.createElement('div');
  host.className = 'chart-host';
  root.appendChild(host);
  this.host = host;

  this.chart = LWC.createChart(host, {
    layout: {
      background: { type: 'solid', color: TOKENS.bg },
      textColor: TOKENS.dim,
      fontSize: 10,
      fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: TOKENS.grid },
      horzLines: { color: TOKENS.grid },
    },
    crosshair: {
      mode: LWC.CrosshairMode.Normal,
      vertLine: { color: withAlpha(TOKENS.text, 0.28), width: 1, style: 3, labelBackgroundColor: TOKENS.surface },
      horzLine: { color: withAlpha(TOKENS.text, 0.28), width: 1, style: 3, labelBackgroundColor: TOKENS.surface },
    },
    rightPriceScale: {
      borderColor: TOKENS.hairline,
      scaleMargins: { top: 0.12, bottom: 0.14 },
      entireTextOnly: true,
    },
    leftPriceScale: { visible: false },
    timeScale: {
      borderColor: TOKENS.hairline,
      rightOffset: 4,
      barSpacing: 6,
      minBarSpacing: 0.6,
      timeVisible: true,
      secondsVisible: false,
      lockVisibleTimeRangeOnResize: true,
    },
    // The brokerage gesture set. Vertical touch-drag is OFF so a finger moving
    // down the glass never fights the price scale mid-swipe; pinch stays on and
    // anchors on the pinch centre, which is the library's own behaviour.
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true, axisDoubleClickReset: true },
    kineticScroll: { touch: true, mouse: false },
    autoSize: true,
    localization: {
      priceFormatter: function (p) { return fmtPrice(p); },
    },
  });

  this.series = this.chart.addSeries(LWC.CandlestickSeries, {
    upColor: TOKENS.green,
    downColor: TOKENS.red,
    borderVisible: false,
    wickUpColor: TOKENS.green,
    wickDownColor: TOKENS.red,
    priceLineVisible: true,
    // The last price is MARKET data, so it is cyan. Palette lock 14 reserves
    // volt for user actions; a volt price line would be the app claiming
    // authorship of the tape.
    priceLineColor: withAlpha(TOKENS.cyan, 0.6),
    priceLineWidth: 1,
    priceLineStyle: 2,
    lastValueVisible: true,
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
  });

  // Volume rides on its own invisible scale pinned to the bottom 16%, so it can
  // be switched on later (LIVE-1b) without the candles ever moving.
  this.volume = this.chart.addSeries(LWC.HistogramSeries, {
    priceScaleId: 'vol',
    priceFormat: { type: 'volume' },
    color: withAlpha(TOKENS.cyan, 0.14),
    lastValueVisible: false,
    priceLineVisible: false,
    visible: false,
  });
  this.chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });

  this.session = new SessionShading();
  this.series.attachPrimitive(this.session);
  this.annotations = new AnnotationLayer();
  this.series.attachPrimitive(this.annotations);

  this.rail = new TimeframeRail(root, function (tf, who) { self._railPick(tf, who); });
  this.rail.setOptions(TF_ORDER, this.timeframe);
  this.pointer = new KaiPointer(root);

  this.legend = document.createElement('div');
  this.legend.className = 'ohlc';
  root.appendChild(this.legend);

  this.veil = document.createElement('div');
  this.veil.className = 'veil';
  root.appendChild(this.veil);

  this.empty = document.createElement('div');
  this.empty.className = 'empty';
  this.empty.textContent = 'No price bars for this timeframe yet. The levels are still real.';
  root.appendChild(this.empty);

  this._bindInterrupt();
  this._bindCrosshair();
  this._bindTaps();
  this._measureChrome();
  window.addEventListener('resize', function () { self._measureChrome(); });

  this.chart.timeScale().subscribeVisibleLogicalRangeChange(function () { self._postViewport(); });
}

/* ------------------------------------------------------------------ */
/* User input owns the camera the instant it arrives                   */
/* ------------------------------------------------------------------ */

Chart.prototype._bindInterrupt = function () {
  var self = this;
  var grab = function () {
    self._userTouching = true;
    // Not "queue the user behind Kai" and not "let both move it". The finger
    // wins, from wherever the tween had reached, and the host is told so it can
    // abandon the rest of the sequence instead of talking over the user.
    if (Motion.busy()) {
      Motion.cancel('interrupted');
      self.pointer.hide();
    }
  };
  var release = function () { self._userTouching = false; };
  this.host.addEventListener('pointerdown', grab, { passive: true });
  this.host.addEventListener('touchstart', grab, { passive: true });
  this.host.addEventListener('wheel', grab, { passive: true });
  this.host.addEventListener('pointerup', release, { passive: true });
  this.host.addEventListener('touchend', release, { passive: true });
};

/* ------------------------------------------------------------------ */
/* Crosshair readout                                                   */
/* ------------------------------------------------------------------ */

Chart.prototype._bindCrosshair = function () {
  var self = this;
  this.chart.subscribeCrosshairMove(function (param) {
    if (!param || !param.time || !param.point) { self._clearLegend(); return; }
    var d = param.seriesData.get(self.series);
    if (!d) { self._clearLegend(); return; }
    var up = d.close >= d.open;
    var col = up ? TOKENS.green : TOKENS.red;
    var chg = d.open ? ((d.close - d.open) / d.open) * 100 : 0;
    self.legend.innerHTML =
      '<span class="ohlc-t">' + fmtTime(param.time, self.timeframe) + '</span>' +
      '<span class="ohlc-k">O</span><span>' + fmtPrice(d.open) + '</span>' +
      '<span class="ohlc-k">H</span><span>' + fmtPrice(d.high) + '</span>' +
      '<span class="ohlc-k">L</span><span>' + fmtPrice(d.low) + '</span>' +
      '<span class="ohlc-k">C</span><span style="color:' + col + '">' + fmtPrice(d.close) + '</span>' +
      '<span style="color:' + col + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</span>';
    self.legend.classList.add('is-on');
    post({ type: 'crosshair', payload: { time: param.time, open: d.open, high: d.high, low: d.low, close: d.close } });
  });
};

Chart.prototype._clearLegend = function () {
  if (!this.legend.classList.contains('is-on')) return;
  this.legend.classList.remove('is-on');
  post({ type: 'crosshairEnd', payload: {} });
};

/* ------------------------------------------------------------------ */
/* Taps: annotation chips, and double-tap to reset                     */
/* ------------------------------------------------------------------ */

Chart.prototype._bindTaps = function () {
  var self = this;
  var lastTap = 0;
  this.host.addEventListener('pointerup', function (e) {
    var r = self.host.getBoundingClientRect();
    var x = e.clientX - r.left;
    var y = e.clientY - r.top;

    var id = self.annotations.hitTest(x, y);
    if (id) {
      self.annotations.flash(id, 1);
      post({ type: 'annotationTap', payload: { id: id } });
      lastTap = 0;
      return;
    }
    var now = Date.now();
    if (now - lastTap < 280) {
      // Double-tap is "put it back the way it was", the same promise as
      // double-tapping a photo back to fit. Not a zoom step.
      lastTap = 0;
      self.fitDefault(reducedMotion() ? 0 : 320);
    } else {
      lastTap = now;
    }
  });
};

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

Chart.prototype.setData = function (p) {
  var raw = p.candles || [];
  var bars = [];
  var vols = [];
  for (var i = 0; i < raw.length; i++) {
    var c = raw[i];
    var t = typeof c.t === 'number' ? c.t : Math.floor(Date.parse(c.t) / 1000);
    if (!isFinite(t)) continue;
    var bar = { time: t, open: +c.o, high: +c.h, low: +c.l, close: +c.c };
    // Per-bar colour hook. Nothing sets it in LIVE-1; the RSI heatmap in LIVE-1b
    // sets `color`/`wickColor` per bar and this chart needs no change at all.
    if (c.color) { bar.color = c.color; bar.wickColor = c.wickColor || c.color; bar.borderColor = c.color; }
    bars.push(bar);
    vols.push({ time: t, value: +(c.v || 0), color: withAlpha(bar.close >= bar.open ? TOKENS.green : TOKENS.red, 0.16) });
  }
  bars.sort(function (a, b) { return a.time - b.time; });
  vols.sort(function (a, b) { return a.time - b.time; });

  var wasEmpty = this.bars.length === 0;
  this.bars = bars;
  this.symbol = p.symbol || this.symbol;
  if (p.timeframe) { this.timeframe = p.timeframe; this.rail.setValue(p.timeframe); }
  this.lastPrice = p.lastPrice == null ? (bars.length ? bars[bars.length - 1].close : null) : p.lastPrice;

  this.series.setData(bars);
  this.volume.setData(vols);
  this.session.setBars(bars, this.timeframe);
  this.annotations.setBars(bars);
  this.empty.classList.toggle('is-on', bars.length === 0);

  if (wasEmpty || p.resetView !== false) this.fitDefault(0);
  this._lower();
  this._postViewport();
};

/** Replace or append the newest bar without touching the camera. */
Chart.prototype.updateLast = function (c) {
  if (!c) return;
  var t = typeof c.t === 'number' ? c.t : Math.floor(Date.parse(c.t) / 1000);
  if (!isFinite(t)) return;
  var bar = { time: t, open: +c.o, high: +c.h, low: +c.l, close: +c.c };
  this.series.update(bar);
  if (this.bars.length && this.bars[this.bars.length - 1].time === t) this.bars[this.bars.length - 1] = bar;
  else this.bars.push(bar);
  this.lastPrice = bar.close;
};

Chart.prototype.setVolume = function (on) {
  this.volumeOn = !!on;
  this.volume.applyOptions({ visible: this.volumeOn });
};

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

Chart.prototype._range = function () {
  var r = this.chart.timeScale().getVisibleLogicalRange();
  if (r) return { from: r.from, to: r.to };
  var n = this.bars.length || 1;
  return { from: Math.max(0, n - 100), to: n + 4 };
};

Chart.prototype._setRange = function (from, to) {
  if (!(to > from)) return;
  this.chart.timeScale().setVisibleLogicalRange({ from: from, to: to });
};

/**
 * The one tween every camera command funnels into: move `{from,to}` from where
 * it IS to where it should be. Interrupting reads the live value, so a cancelled
 * move leaves the chart exactly where the finger caught it.
 */
Chart.prototype._glide = function (target, duration, ease, id) {
  var self = this;
  var start = this._range();
  var f0 = start.from, t0 = start.to;
  var f1 = target.from, t1 = target.to;
  Motion.run({
    duration: duration,
    ease: ease || 'scroll',
    onStep: function (p) { self._setRange(f0 + (f1 - f0) * p, t0 + (t1 - t0) * p); },
    onDone: function (reason) { done(id, reason); },
  });
};

/** Index of the bar at (or nearest before) a timestamp. -1 when there is none. */
Chart.prototype._indexOf = function (time) {
  var t = typeof time === 'number' ? time : Math.floor(Date.parse(time) / 1000);
  if (!isFinite(t) || !this.bars.length) return -1;
  var best = -1;
  for (var i = 0; i < this.bars.length; i++) {
    if (this.bars[i].time <= t) best = i; else break;
  }
  return best === -1 ? 0 : best;
};

Chart.prototype.scrollByBars = function (bars, duration, id) {
  var r = this._range();
  this._glide({ from: r.from + bars, to: r.to + bars }, duration, 'scroll', id);
};

Chart.prototype.scrollToTime = function (time, align, duration, id) {
  var idx = this._indexOf(time);
  if (idx < 0) return done(id, 'done');
  var r = this._range();
  var span = r.to - r.from;
  // 0.62 rather than 0.5: the eye reads a chart left to right, so the candle
  // being discussed wants MORE history behind it than empty space ahead of it.
  var frac = align === 'right' ? 0.9 : align === 'left' ? 0.2 : 0.62;
  var from = idx - span * frac;
  this._glide({ from: from, to: from + span }, duration, 'scroll', id);
};

Chart.prototype.scrollToNow = function (duration, id) {
  var r = this._range();
  var span = r.to - r.from;
  var to = this.bars.length + 4;
  this._glide({ from: to - span, to: to }, duration, 'scroll', id);
};

Chart.prototype.zoomTo = function (barSpacing, anchorTime, duration, id) {
  var W = this.host.clientWidth || 320;
  var span = Math.max(6, W / Math.max(0.6, barSpacing));
  var r = this._range();
  var anchorIdx = anchorTime != null ? this._indexOf(anchorTime) : (r.from + r.to) / 2;
  // Keep the anchor bar at the same fraction of the width it already occupies,
  // so a zoom around a candle rotates the view about that candle instead of
  // sliding it sideways while the scale changes.
  var frac = Math.max(0.05, Math.min(0.95, (anchorIdx - r.from) / Math.max(1, r.to - r.from)));
  var from = anchorIdx - span * frac;
  this._glide({ from: from, to: from + span }, duration, 'zoom', id);
};

Chart.prototype.zoomToRange = function (t1, t2, padding, duration, id) {
  var a = this._indexOf(t1), b = this._indexOf(t2);
  if (a < 0 || b < 0) return done(id, 'done');
  var lo = Math.min(a, b), hi = Math.max(a, b);
  var pad = padding == null ? 0.12 : padding;
  var span = Math.max(8, hi - lo);
  this._glide({ from: lo - span * pad, to: hi + span * pad }, duration, 'zoom', id);
};

/** The timeframe's own default window (brief: D 120 · 4h 120 · 1h 100 · 15m 96 · 5m 78 · 1m 90). */
Chart.prototype.fitDefault = function (duration, id) {
  var want = TF_BARS[this.timeframe] || 100;
  var n = this.bars.length;
  var to = n + 4;
  var from = Math.max(-2, to - Math.min(want, Math.max(20, n)) - 4);
  if (!duration) { this._setRange(from, to); return done(id, 'done'); }
  this._glide({ from: from, to: to }, duration, 'zoom', id);
};

/* ------------------------------------------------------------------ */
/* Timeframe: the button presses, then the chart crossfades            */
/* ------------------------------------------------------------------ */

Chart.prototype._railPick = function (tf, who) {
  if (tf === this.timeframe) return;
  this.rail.setValue(tf);
  this.timeframe = tf;
  this.crossfadeIn();
  post({ type: 'timeframe', payload: { timeframe: tf, by: who || 'user' } });
};

/** Veil up. It comes back down when the new bars land (or after a beat, if the
 *  host has nothing new to send). Never a hard cut between two price series. */
Chart.prototype.crossfadeIn = function () {
  var self = this;
  if (reducedMotion()) return;
  this.veil.classList.add('is-on');
  clearTimeout(this._veilT);
  this._veilT = setTimeout(function () { self.veil.classList.remove('is-on'); }, 900);
};

Chart.prototype._lower = function () {
  var self = this;
  clearTimeout(this._veilT);
  // One frame of the new data on screen before the veil lifts, so the fade
  // reveals the new chart rather than dissolving into an empty one.
  requestAnimationFrame(function () { self.veil.classList.remove('is-on'); });
};

Chart.prototype.setTimeframe = function (tf, id) {
  if (!TF_BARS[tf]) return done(id, 'done');
  // The host re-asserts the timeframe whenever its own state settles, which is
  // correct and would otherwise crossfade a chart that never changed. Switching
  // to what is already on screen is a no-op, not a transition.
  if (tf === this.timeframe) return done(id, 'done');
  this.rail.setValue(tf);
  this.timeframe = tf;
  this.session.setBars(this.bars, tf);
  this.crossfadeIn();
  post({ type: 'timeframe', payload: { timeframe: tf, by: 'kai' } });
  done(id, 'done');
};

/* ------------------------------------------------------------------ */
/* Pointer, in chart coordinates                                       */
/* ------------------------------------------------------------------ */

Chart.prototype.rootRect = function () { return this.root.getBoundingClientRect(); };

/**
 * Where the floating rail sits, in PLOT coordinates, so annotation chips can
 * step around it. Measured once and on resize — reading layout every frame
 * would force a reflow inside the render loop.
 */
Chart.prototype._measureChrome = function () {
  var r = this.rail.el.getBoundingClientRect();
  var h = this.host.getBoundingClientRect();
  this.annotations.setAvoid({ x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height });
};

/** Resolve {x|time, y|price} into page coordinates inside the chart surface. */
Chart.prototype.resolvePoint = function (p) {
  var hostRect = this.host.getBoundingClientRect();
  var rootRect = this.rootRect();
  var dx = hostRect.left - rootRect.left;
  var dy = hostRect.top - rootRect.top;
  var x, y;

  if (p.rail) {
    var c = this.rail.centerOf(p.rail, rootRect);
    if (c) return c;
  }
  if (p.time != null) {
    var cx = this.chart.timeScale().timeToCoordinate(
      typeof p.time === 'number' ? p.time : Math.floor(Date.parse(p.time) / 1000)
    );
    x = cx == null ? this.host.clientWidth * 0.62 : cx;
  } else if (p.x != null) {
    x = p.x <= 1 ? this.host.clientWidth * p.x : p.x;
  } else {
    x = this.host.clientWidth * 0.62;
  }
  if (p.price != null) {
    var cy = this.series.priceToCoordinate(p.price);
    y = cy == null ? this.host.clientHeight * 0.5 : cy;
  } else if (p.y != null) {
    y = p.y <= 1 ? this.host.clientHeight * p.y : p.y;
  } else {
    y = this.host.clientHeight * 0.5;
  }
  return { x: x + dx, y: y + dy };
};

/* ------------------------------------------------------------------ */
/* Viewport reporting                                                  */
/* ------------------------------------------------------------------ */

Chart.prototype._postViewport = function () {
  var r = this.chart.timeScale().getVisibleLogicalRange();
  if (!r) return;
  var W = this.host.clientWidth || 1;
  post({
    type: 'viewport',
    payload: {
      from: r.from, to: r.to,
      barSpacing: W / Math.max(1, r.to - r.from),
      firstTime: this.bars.length ? this.bars[Math.max(0, Math.min(this.bars.length - 1, Math.round(r.from)))].time : null,
      lastTime: this.bars.length ? this.bars[Math.max(0, Math.min(this.bars.length - 1, Math.round(r.to)))].time : null,
    },
  });
};

function fmtTime(t, tf) {
  var d = new Date((typeof t === 'number' ? t : Date.parse(t) / 1000) * 1000);
  if (tf === 'D') return d.toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(d);
  } catch (e) { return d.toISOString().slice(5, 16).replace('T', ' '); }
}
