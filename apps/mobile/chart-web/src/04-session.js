/**
 * Pre-market / after-hours shading.
 *
 * A 5-minute chart that draws 04:00 and 19:30 exactly like 10:15 is telling the
 * user those bars are the same kind of thing. They are not: liquidity is thinner,
 * the spread is wider, and a level that "held" on 300 shares overnight held
 * nothing. So bars outside 09:30–16:00 New York sit on a faintly lighter ground.
 *
 * It is drawn UNDER the candles (zOrder 'bottom') and it is never labelled — the
 * point is peripheral, not a callout. Daily and 4-hour charts get no shading at
 * all, because the question does not apply to them.
 */
function SessionShading() {
  this._chart = null;
  this._series = null;
  this._runs = [];       // [{from, to}] in seconds, extended-hours spans
  this._on = false;
}

SessionShading.prototype.attached = function (p) { this._chart = p.chart; this._series = p.series; };
SessionShading.prototype.detached = function () { this._chart = null; this._series = null; };
SessionShading.prototype.updateAllViews = function () {};

SessionShading.prototype.paneViews = function () {
  var self = this;
  if (!this._view) {
    this._view = {
      zOrder: function () { return 'bottom'; },
      renderer: function () { return { draw: function (t) { self._draw(t); } }; },
    };
  }
  return [this._view];
};

/**
 * Recompute the extended-hours spans for a bar series.
 * Contiguous out-of-hours bars are merged into ONE span, so an overnight gap is
 * one rectangle rather than 200 abutting ones with seams between them.
 */
SessionShading.prototype.setBars = function (bars, timeframe) {
  this._on = timeframe === '1m' || timeframe === '5m' || timeframe === '15m' || timeframe === '1h';
  this._runs = [];
  if (!this._on || !bars.length) return;

  var open = null;
  var prev = null;
  var step = bars.length > 1 ? Math.max(60, bars[1].time - bars[0].time) : 300;
  for (var i = 0; i < bars.length; i++) {
    var t = bars[i].time;
    var ext = !isRegularHours(t);
    if (ext && open == null) open = t - step / 2;
    if (!ext && open != null) { this._runs.push({ from: open, to: prev + step / 2 }); open = null; }
    prev = t;
  }
  if (open != null) this._runs.push({ from: open, to: prev + step / 2 });
};

SessionShading.prototype._draw = function (target) {
  var self = this;
  if (!this._on || !this._runs.length || !this._chart) return;
  target.useMediaCoordinateSpace(function (scope) {
    var ctx = scope.context;
    var H = scope.mediaSize.height;
    var W = scope.mediaSize.width;
    var ts = self._chart.timeScale();
    ctx.save();
    ctx.fillStyle = TOKENS.session;
    for (var i = 0; i < self._runs.length; i++) {
      var a = ts.timeToCoordinate(self._runs[i].from);
      var b = ts.timeToCoordinate(self._runs[i].to);
      if (a == null && b == null) continue;
      if (a == null) a = 0;
      if (b == null) b = W;
      if (b < 0 || a > W) continue;
      ctx.fillRect(Math.max(0, a), 0, Math.min(W, b) - Math.max(0, a), H);
    }
    ctx.restore();
  });
};

/**
 * 09:30–16:00 America/New_York, DST included, without a timezone library.
 * `Intl.DateTimeFormat` knows the rules; a hardcoded UTC offset does not, and
 * would put the shading an hour out for half the year.
 */
var NY_FMT = null;
try {
  NY_FMT = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
} catch (e) { NY_FMT = null; }

function isRegularHours(unixSeconds) {
  if (!NY_FMT) return true;                 // no Intl: shade nothing rather than shade wrongly
  var parts = NY_FMT.formatToParts(new Date(unixSeconds * 1000));
  var h = 0, m = 0, wd = '';
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].type === 'hour') h = parseInt(parts[i].value, 10) % 24;
    else if (parts[i].type === 'minute') m = parseInt(parts[i].value, 10);
    else if (parts[i].type === 'weekday') wd = parts[i].value;
  }
  if (wd === 'Sat' || wd === 'Sun') return false;
  var mins = h * 60 + m;
  return mins >= 570 && mins < 960;         // 09:30 .. 16:00
}
