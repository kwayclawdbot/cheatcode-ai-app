/**
 * Kai's pointer.
 *
 * This is the single element that turns "the state changed" into "somebody did
 * that". A price line that simply appears is a render. A violet cursor that
 * travels to the price, pauses, and only THEN leaves a line behind is a person
 * working. Nothing else in this lane buys as much for as little.
 *
 * It is violet because violet is Kai (palette lock 14: volt = you, violet = Kai,
 * cyan = the market). A volt pointer would be Kai impersonating the user.
 *
 * It is a DOM element, not canvas: it must be able to travel OFF the plot — over
 * the timeframe rail, over the price axis — and it must never be clipped by the
 * chart's own canvas bounds.
 */
function KaiPointer(root) {
  var el = document.createElement('div');
  el.className = 'kai-pointer';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<div class="kai-pointer-halo"></div>' +
    '<div class="kai-pointer-dot"></div>';
  root.appendChild(el);

  this.el = el;
  this.x = -60;
  this.y = -60;
  this.visible = false;
  this._apply();
}

KaiPointer.prototype._apply = function () {
  // translate3d only: transform and opacity are the two properties that never
  // touch layout or paint, which is what keeps this at 60fps next to a chart
  // that is also redrawing.
  this.el.style.transform = 'translate3d(' + this.x.toFixed(1) + 'px,' + this.y.toFixed(1) + 'px,0)';
};

/** Travel to a point, eased, with the small overshoot a hand has. */
KaiPointer.prototype.moveTo = function (x, y, duration, done) {
  var self = this;
  var x0 = this.x, y0 = this.y;
  if (!this.visible) {
    // Appearing at the destination would be teleporting. Fade in where the
    // travel STARTS, then travel — nothing in the world appears mid-flight.
    this.x = x0 = x - (x - x0) * 0.18;
    this.y = y0 = y - (y - y0) * 0.18;
    this.show();
  }
  Motion.run({
    duration: duration,
    ease: 'pointer',
    onStep: function (p) {
      self.x = x0 + (x - x0) * p;
      self.y = y0 + (y - y0) * p;
      self._apply();
    },
    onDone: done || function () {},
  });
};

/** Snap without motion — used when reduced motion is on, and on re-show. */
KaiPointer.prototype.placeAt = function (x, y) {
  this.x = x; this.y = y; this._apply();
};

KaiPointer.prototype.show = function () {
  this.visible = true;
  this.el.classList.add('is-on');
};

KaiPointer.prototype.hide = function () {
  this.visible = false;
  this.el.classList.remove('is-on');
};

/**
 * The press. 90ms down, then release — the same shape as a finger, and short
 * enough that it reads as a click rather than a squeeze.
 */
KaiPointer.prototype.press = function (done) {
  var self = this;
  this.el.classList.add('is-press');
  var ms = reducedMotion() ? 0 : 90;
  setTimeout(function () {
    self.el.classList.remove('is-press');
    if (done) done();
  }, ms);
};

/* ------------------------------------------------------------------ */
/* The timeframe rail                                                  */
/* ------------------------------------------------------------------ */

/**
 * The rail lives INSIDE the chart surface rather than in React chrome above it,
 * for one reason: Kai's pointer has to be able to press it. A pointer that
 * travels to the edge of the WebView and stops, while a button outside changes
 * state on its own, is worse than no pointer at all.
 *
 * Active = volt, because choosing a timeframe is a USER action even when Kai is
 * the one doing it on the user's behalf. Kai's authorship is shown by the violet
 * pointer sitting on the button, not by recolouring the control.
 */
function TimeframeRail(root, onPick) {
  var el = document.createElement('div');
  el.className = 'tf-rail';
  el.setAttribute('role', 'tablist');
  el.setAttribute('aria-label', 'Chart timeframe');
  root.appendChild(el);

  this.el = el;
  this.buttons = {};
  this.value = null;
  this._onPick = onPick;
}

TimeframeRail.prototype.setOptions = function (options, value) {
  var self = this;
  this.el.innerHTML = '';
  this.buttons = {};
  for (var i = 0; i < options.length; i++) {
    (function (tf) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tf-btn';
      b.textContent = tf;
      b.setAttribute('role', 'tab');
      b.setAttribute('data-tf', tf);
      // Feedback on pointer-DOWN, never on release: the moment a press shows up
      // late is the moment the whole surface stops feeling direct.
      b.addEventListener('pointerdown', function () { b.classList.add('is-down'); });
      var up = function () { b.classList.remove('is-down'); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('click', function () { self._onPick(tf, 'user'); });
      self.el.appendChild(b);
      self.buttons[tf] = b;
    })(options[i]);
  }
  this.setValue(value);
};

TimeframeRail.prototype.setValue = function (tf) {
  this.value = tf;
  for (var k in this.buttons) {
    if (!Object.prototype.hasOwnProperty.call(this.buttons, k)) continue;
    var on = k === tf;
    this.buttons[k].classList.toggle('is-on', on);
    this.buttons[k].setAttribute('aria-selected', on ? 'true' : 'false');
  }
};

/** Where the pointer should travel to, in page coordinates. */
TimeframeRail.prototype.centerOf = function (tf, rootRect) {
  var b = this.buttons[tf];
  if (!b) return null;
  var r = b.getBoundingClientRect();
  return { x: r.left - rootRect.left + r.width / 2, y: r.top - rootRect.top + r.height / 2 };
};

/** The visible press Kai performs. Same class the finger produces. */
TimeframeRail.prototype.pressVisual = function (tf, done) {
  var b = this.buttons[tf];
  if (!b) { if (done) done(); return; }
  b.classList.add('is-down');
  var ms = reducedMotion() ? 0 : 90;
  setTimeout(function () { b.classList.remove('is-down'); if (done) done(); }, ms);
};
