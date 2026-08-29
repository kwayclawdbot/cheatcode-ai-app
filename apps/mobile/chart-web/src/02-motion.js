/**
 * The motion engine. Everything Kai does to the camera runs through here.
 *
 * WHY A TWEEN RUNNER AND NOT CSS: the thing being animated is not a DOM
 * property — it is the chart's visible logical range and its bar spacing. Those
 * only move when we set them, frame by frame. `requestAnimationFrame` is the
 * display-synced clock (WWDC "Designing Fluid Interfaces" calls it CADisplayLink;
 * on the web it is rAF), so every step lands on a real frame.
 *
 * THE THREE RULES THIS FILE EXISTS TO ENFORCE
 *  1. Motion is EASED. Linear interpolation reads as a machine moving a value;
 *     ease-out reads as a hand letting go.
 *  2. Motion is INTERRUPTIBLE. A finger on the glass cancels whatever Kai was
 *     doing, immediately, from wherever it had got to — never "finish first, then
 *     obey". The cancelled step reports `interrupted` so the host can stop the
 *     rest of the sequence instead of stepping on the user.
 *  3. Motion RESPECTS REDUCED MOTION. Durations collapse to zero and the END
 *     STATE STILL APPLIES. Reduced motion means "don't move me", not "don't
 *     work".
 */

/* ------------------------------------------------------------------ */
/* Easing                                                              */
/* ------------------------------------------------------------------ */

/** Scroll. Starts at full speed, settles. cubic-out — the honest default. */
function easeOutCubic(t) {
  var u = 1 - t;
  return 1 - u * u * u;
}

/**
 * Zoom. A spring that has already been let go: it arrives slightly past the
 * target and settles back. Overshoot is deliberately small (c1 = 0.55, about
 * 3% past) because a chart that visibly bounces reads as a toy, and a chart
 * that arrives dead-flat reads as a `setState`.
 */
function easeOutSettle(t) {
  var c1 = 0.55;
  var c3 = c1 + 1;
  var u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/** Pointer travel. Barely-there overshoot so the cursor "lands" on the level. */
function easeOutPointer(t) {
  var c1 = 0.28;
  var c3 = c1 + 1;
  var u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

var EASINGS = { scroll: easeOutCubic, zoom: easeOutSettle, pointer: easeOutPointer, linear: function (t) { return t; } };

/* ------------------------------------------------------------------ */
/* Reduced motion                                                      */
/* ------------------------------------------------------------------ */

var REDUCED = false;
try {
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  REDUCED = !!mq.matches;
  if (mq.addEventListener) mq.addEventListener('change', function (e) { REDUCED = !!e.matches; });
} catch (e) { /* no matchMedia: assume motion is fine */ }

/** The host can force it too (an app-level accessibility switch outranks the OS). */
function setReducedMotion(on) { REDUCED = !!on; }
function reducedMotion() { return REDUCED; }

/**
 * ±10% jitter. Six identical `mark_level` commands with identical 420ms tweens
 * read as a script. The same six with 380/441/409/430/392/417 read as a person
 * who is not a metronome. Small, deterministic-enough, and never below 0.
 */
function jitter(ms, amount) {
  if (!ms) return 0;
  var a = amount == null ? 0.1 : amount;
  return Math.max(0, Math.round(ms * (1 + (Math.random() * 2 - 1) * a)));
}

/* ------------------------------------------------------------------ */
/* The runner                                                          */
/* ------------------------------------------------------------------ */

/**
 * One tween at a time. Starting a second one CANCELS the first — because the
 * chart has exactly one camera, and two things moving it at once is a stutter,
 * not a feature.
 */
var Motion = {
  _active: null,
  _raf: 0,

  /** True while Kai (not the user) is moving the camera. */
  busy: function () { return !!this._active; },

  /**
   * @param opts.duration ms (0 or reduced motion → apply the end state now)
   * @param opts.ease     key into EASINGS
   * @param opts.onStep   (v) => void, v is the eased 0..1 progress
   * @param opts.onDone   (reason) => void, reason is 'done' | 'interrupted' | 'superseded'
   */
  run: function (opts) {
    this.cancel('superseded');

    var ease = EASINGS[opts.ease] || EASINGS.scroll;
    var dur = REDUCED ? 0 : Math.max(0, opts.duration || 0);

    if (dur === 0) {
      // The end state ALWAYS applies. Reduced motion removes the journey, not
      // the destination.
      opts.onStep(1);
      if (opts.onDone) opts.onDone('done');
      return;
    }

    var self = this;
    var t0 = 0;
    var state = { onDone: opts.onDone };
    this._active = state;

    var step = function (now) {
      if (self._active !== state) return;          // cancelled between frames
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / dur);
      opts.onStep(ease(p));
      if (p < 1) {
        self._raf = requestAnimationFrame(step);
      } else {
        self._active = null;
        if (state.onDone) state.onDone('done');
      }
    };
    this._raf = requestAnimationFrame(step);
  },

  /**
   * Stop now, wherever we are. The chart keeps the position it had reached —
   * we never snap back to the start and never jump to the target. That is the
   * "animate from the presentation value" rule: what is on screen IS the state.
   */
  cancel: function (reason) {
    var s = this._active;
    if (!s) return;
    this._active = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (s.onDone) s.onDone(reason || 'interrupted');
  },
};
