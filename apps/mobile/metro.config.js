/**
 * Metro config — one line of intent: the chart page is an ASSET.
 *
 * `assets/chart/index.html` is a committed, self-contained page (Lightweight
 * Charts + our layers + the fonts, ~560KB) that the chart WebView loads. Metro
 * only treats a file as an asset if its extension is in `assetExts`, and `html`
 * is not there by default — without this it would be handed to the JS
 * transformer and the bundle would fail on the first `<`.
 *
 * Serving it as an asset rather than inlining it as a JS string keeps ~560KB
 * out of the JavaScript bundle: the page is fetched by the WebView on its own,
 * in parallel, and never parsed by the JS engine.
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('html')) config.resolver.assetExts.push('html');

module.exports = config;
