import { readFileSync, writeFileSync } from "node:fs";
const banner =
  "// GENERATED from packages/trade-ui. Run node packages/trade-ui/sync-site.mjs.\n";
const root = new URL("../../", import.meta.url);
for (const [from, to, transform] of [
  ["model.ts", "apps/site/src/components/trade/model.generated.ts", (s) => s],
  [
    "fixtures.ts",
    "apps/site/src/components/trade/fixtures.generated.ts",
    (s) => s.replace(/(['"])\.\/model\1/g, '"./model.generated"'),
  ],
]) {
  const expected =
    banner + transform(readFileSync(new URL(from, import.meta.url), "utf8"));
  const path = new URL(to, root);
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== expected)
      throw new Error(
        `${to} differs from the shared source; run sync-site.mjs`,
      );
  } else writeFileSync(path, expected);
}
console.log("Site trade model and fixture match the shared source.");
