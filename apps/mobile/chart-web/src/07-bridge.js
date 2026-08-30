/**
 * The bridge. One message shape in both directions, one transport per platform.
 *
 *   native  →  window.ReactNativeWebView.postMessage(json)
 *   web     →  window.parent.postMessage(obj, '*')     (iframe, same origin)
 *
 * EVERY HOST COMMAND CARRIES AN `id`, AND EVERY CAMERA COMMAND ANSWERS WITH
 * `done{id, reason}`. That is not bookkeeping — it is what lets a choreography
 * be a SEQUENCE rather than a pile of setTimeouts. Step 3 starts when step 2
 * actually finished, on this device, at this frame rate; and when the user
 * grabs the chart mid-move, step 2 answers `interrupted` and the rest of the
 * sequence is abandoned instead of talking over them.
 *
 * The page never fetches. No `<script src>`, no XHR, no websocket: data and
 * commands arrive over this channel and nowhere else. A chart that can reach the
 * network is a chart that can show a number nobody in the app can account for.
 */

var NATIVE = !!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage);

function post(msg) {
  try {
    if (NATIVE) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    else if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
  } catch (e) { /* a dead bridge must not take the chart down with it */ }
}

/** Resolve one host command. `reason` is 'done' | 'interrupted' | 'superseded'. */
function done(id, reason) {
  if (id == null) return;
  post({ type: 'done', id: id, payload: { reason: reason || 'done' } });
}

var CHART = null;

function handle(msg) {
  if (!msg || typeof msg !== 'object') return;
  var id = msg.id;
  var p = msg.payload || {};
  var c = CHART;
  if (!c) return;

  try {
    switch (msg.type) {
      case 'ping': return done(id, 'done');

      case 'setTheme': {
        for (var k in p.tokens || {}) {
          if (Object.prototype.hasOwnProperty.call(p.tokens, k)) TOKENS[k] = p.tokens[k];
        }
        return done(id, 'done');
      }

      case 'setReducedMotion': setReducedMotion(p.on); return done(id, 'done');
      // The chart owns the screen (the stage) or is embedded in a page.
      case 'setGestures': c.setGestures(p.own); return done(id, 'done');
      // Kai is talking; the chart's own controls step back.
      case 'setBroadcast': c.setBroadcast(p.on); return done(id, 'done');
      case 'setVolume': c.setVolume(p.on); return done(id, 'done');
      case 'setData': c.setData(p); return done(id, 'done');
      case 'updateLast': c.updateLast(p.candle || p); return done(id, 'done');
      case 'setTimeframe': return c.setTimeframe(p.timeframe || p.tf, id);

      /* -------- camera -------- */
      case 'camera.scrollByBars': return c.scrollByBars(p.bars || 0, dur(p), id);
      case 'camera.scrollToTime': return c.scrollToTime(p.time, p.align, dur(p), id);
      case 'camera.scrollToNow': return c.scrollToNow(dur(p), id);
      case 'camera.zoomTo': return c.zoomTo(p.barSpacing, p.anchorTime, dur(p), id);
      case 'camera.zoomToRange': return c.zoomToRange(p.from, p.to, p.padding, dur(p), id);
      case 'camera.fit': return c.fitDefault(dur(p), id);
      case 'camera.cancel': Motion.cancel('superseded'); return done(id, 'done');

      /* -------- annotations -------- */
      case 'annotations.set': c.annotations.set(p.annotations || []); return done(id, 'done');
      case 'annotations.add': c.annotations.add(p.annotations || []); return done(id, 'done');
      case 'annotations.remove': c.annotations.remove(p.ids || []); return done(id, 'done');
      case 'annotations.flash': c.annotations.flash(p.id, p.pulses); return done(id, 'done');
      case 'annotations.hidden': c.annotations.setHidden(p.on); return done(id, 'done');

      /* -------- Kai's pointer -------- */
      case 'pointer.moveTo': {
        var pt = c.resolvePoint(p);
        return c.pointer.moveTo(pt.x, pt.y, dur(p, 380), function (reason) { done(id, reason); });
      }
      case 'pointer.press': {
        // Pressing a rail button is a press ON SOMETHING: the button has to look
        // pressed too, or the pointer is miming.
        if (p.rail) return c.rail.pressVisual(p.rail, function () { c.pointer.press(function () { done(id, 'done'); }); });
        return c.pointer.press(function () { done(id, 'done'); });
      }
      case 'pointer.hide': c.pointer.hide(); return done(id, 'done');
      case 'pointer.show': c.pointer.show(); return done(id, 'done');

      default:
        return post({ type: 'error', id: id, payload: { message: 'Unknown chart command: ' + msg.type } });
    }
  } catch (e) {
    post({ type: 'error', id: id, payload: { message: String((e && e.message) || e) } });
    done(id, 'done');
  }
}

/** Durations are jittered ±10% here, once, so every caller inherits it. */
function dur(p, fallback) {
  var d = p.duration == null ? (fallback == null ? 420 : fallback) : p.duration;
  return p.jitter === false ? d : jitter(d);
}

function receive(ev) {
  var data = ev && ev.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { return; }
  }
  handle(data);
}

window.addEventListener('message', receive);
// react-native-webview delivers injected messages on `document` on Android and
// on `window` on iOS. Listening to both is the whole of the platform difference.
document.addEventListener('message', receive);
