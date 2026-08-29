/**
 * Boot.
 *
 * NO WHITE FLASH: the document is painted `#0B0B0E` by the stylesheet before a
 * line of this runs, and the WebView itself is given the same colour, so the
 * three moments that used to flash white (WebView creation, first paint, chart
 * canvas insertion) are all already the surface colour.
 *
 * FIRST PAINT IS MEASURED, NOT ASSUMED. `firstPaintMs` is reported to the host
 * with `ready` so the number in the PR is one the device produced, not one a
 * build machine guessed.
 */
(function boot() {
  var t0 = (window.performance && performance.now) ? performance.now() : Date.now();

  var run = function () {
    var root = document.getElementById('root');
    CHART = new Chart(root);

    // A chart with no bars is not a blank chart — it says so, and any levels the
    // host has already sent still draw, because those are real.
    CHART.empty.classList.add('is-on');

    requestAnimationFrame(function () {
      var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
      post({
        type: 'ready',
        payload: {
          version: (window.LightweightCharts && window.LightweightCharts.version && window.LightweightCharts.version()) || 'unknown',
          firstPaintMs: Math.round(t1 - t0),
          reducedMotion: reducedMotion(),
          timeframes: TF_ORDER,
        },
      });
    });

    startFpsMeter();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

/**
 * A rolling frame-rate meter, reported only while the chart is actually moving.
 * "60fps" is a claim; this is the instrument that makes it a measurement, and it
 * costs one counter per frame.
 */
function startFpsMeter() {
  var frames = 0;
  var since = 0;
  var worst = 60;
  var sampling = false;

  var tick = function (now) {
    if (!since) since = now;
    frames++;
    if (now - since >= 1000) {
      var fps = Math.round((frames * 1000) / (now - since));
      if (sampling) {
        worst = Math.min(worst, fps);
        post({ type: 'fps', payload: { fps: fps, worst: worst } });
      }
      frames = 0; since = now; sampling = false;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  var wake = function () { sampling = true; };
  window.addEventListener('touchstart', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('wheel', wake, { passive: true });
  // Kai's own motion counts as motion worth measuring.
  window.__cc_wakeFps = wake;
}
