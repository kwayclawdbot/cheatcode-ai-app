# Verification status

## Passed

- Strict TypeScript check of the native kit and imported dependencies.
- Server rendering of all 36 screen compositions at textScale 1 and 1.4.
- Missing candles, missing prices, short setups and near-overlapping chart levels render without NaN/Infinity.
- Existing shared model tests for long/short risk/reward and OHLC geometry.
- Browser gallery compilation from the same native source.
- SVG asset XML parsing and reference file presence.

## Not passed / not run

- Browser screenshot comparisons: the authoring browser blocked preview access. No screenshot output is represented as a successful visual check.
- Full legacy application suite: not certified; the local sparse checkout lacks unrelated tracked feature files.
- Native iOS/Android rendering, software keyboard and screen reader testing.
- Production API, authentication, billing, notifications or execution integration: outside this source-kit delivery.

`../scripts/verify-gallery.mjs` is supplied to run browser layout checks, capture each screen and exercise key local interactions on an accessible development machine. Its output belongs in `proof/browser/` only after it has actually run. Review those images before pixel-level approval.
