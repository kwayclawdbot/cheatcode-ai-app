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
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('html')) config.resolver.assetExts.push('html');

/**
 * `@shared/*` — the contract package, resolved as SOURCE.
 *
 * `packages/shared` has no build step and lives outside this app, so Metro has
 * to be told twice: watch the folder, and map the specifier onto it. Until
 * LIVE-2 every mobile import of the package was `import type`, which the
 * transform erases — so nothing ever had to resolve at runtime. `@shared/live`
 * exports `mergeFrames`, a real function, and it is imported rather than copied
 * on purpose: the rule for "have I already applied this frame" has to be the
 * same one the server writes frames against, and two copies of it would
 * eventually disagree about a gap.
 */
const repoRoot = path.resolve(__dirname, '..', '..');
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(repoRoot, 'packages', 'shared')];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@shared': path.resolve(repoRoot, 'packages', 'shared'),
};

module.exports = config;
