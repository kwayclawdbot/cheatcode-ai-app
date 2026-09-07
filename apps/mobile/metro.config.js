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

/**
 * uniwind — Tailwind classNames for the gluestack chrome layer.
 *
 * `withUniwindConfig` WRAPS the config assembled above rather than replacing
 * it: it adds a transformer that compiles `global.css` and rewrites `className`
 * into styles. Everything set before this line — the `html` asset extension,
 * the `packages/shared` watch folder, the `@shared` alias — is preserved,
 * which is why the wrap is the last thing that happens in this file and not
 * the first.
 *
 * `cssEntryFile` is the single stylesheet uniwind compiles. See global.css for
 * what it pulls in and, more importantly, what it deliberately does not
 * (Tailwind's preflight is left out so the live web build cannot shift).
 *
 * `dtsFile` is generated, not authored: uniwind writes the union of every class
 * name it knows about into `uniwind-types.d.ts` so a typo in a className is a
 * type error rather than a class that silently does nothing. It is gitignored
 * and regenerates on the next Metro start.
 *
 * `extraThemes: ['dark']` — the app is dark-only (app.json pins
 * `userInterfaceStyle: "dark"`), but gluestack's components are written with
 * `dark:` prefixed classes throughout. Without the dark theme registered, every
 * one of those prefixes resolves to nothing and the chrome renders in
 * gluestack's light defaults on a black page. theme.generated.css mirrors the
 * house palette into `.dark` for exactly this reason: both themes exist, and
 * both are the same single palette from tokens.ts.
 */
const { withUniwindConfig } = require('uniwind/metro');

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
  extraThemes: ['dark'],
});
