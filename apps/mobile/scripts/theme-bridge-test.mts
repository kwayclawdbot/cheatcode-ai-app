/**
 * THE THEME BRIDGE TEST — proves the chrome layer wears the house colours.
 * ============================================================================
 *
 * `scripts/gen-theme.mts` translates `src/ui/tokens.ts` into
 * `src/ui/theme.generated.css` so gluestack's semantic tokens resolve to the
 * same palette every hand-rolled screen uses. That translation is only worth
 * anything if it cannot silently go stale, and if the stylesheet that consumes
 * it actually compiles. This file checks both, plus the one design decision in
 * `global.css` that is invisible in the source and expensive to get wrong.
 *
 *   1. DRIFT      — regenerate the CSS and diff it against the committed file.
 *   2. COMPILES   — run global.css through Tailwind's own compiler.
 *   3. NO PREFLIGHT — assert the global DOM reset is absent from the output.
 *   4. PALETTE    — assert the house colours survived into `--color-*`.
 *
 * Check 3 is the one that earns its keep. Leaving preflight out is a deliberate
 * choice recorded in a comment at the top of global.css, and a comment does not
 * survive a well-meaning future edit that "fixes" the imports back to the
 * documented single `@import 'tailwindcss'`. That edit would compile, typecheck,
 * pass every other test, and shift pixels on ~60 signed-off screens in the live
 * web build. So the absence is asserted, not merely explained.
 *
 *     run:  npx tsx scripts/theme-bridge-test.mts
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { compile } from 'tailwindcss';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${(err as Error).message}`);
  }
}

function assert(cond: boolean, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

console.log('theme bridge');

// ---------------------------------------------------------------------------
// 1. DRIFT
// ---------------------------------------------------------------------------
// Run the generator as a SUBPROCESS rather than importing it. gen-theme.mts
// writes the file as a top-level side effect, so importing it here would
// regenerate the very artifact we are trying to catch as stale — the test would
// repair the drift and then report success.
check('generated css is in step with tokens.ts', () => {
  try {
    execFileSync('npx', ['tsx', path.join(here, 'gen-theme.mts'), '--check'], {
      cwd: appRoot,
      stdio: 'pipe',
    });
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer };
    const detail = (e.stderr?.toString() || e.stdout?.toString() || '').trim();
    throw new Error(
      `${detail}\n       src/ui/theme.generated.css no longer matches src/ui/tokens.ts.\n` +
        `       Someone edited a token without regenerating, or hand-edited the\n` +
        `       generated file. Fix with: npx tsx scripts/gen-theme.mts`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2-4. COMPILE global.css
// ---------------------------------------------------------------------------
/**
 * Tailwind resolves `@import` through a caller-supplied loader. Two kinds of
 * specifier appear in global.css: relative paths, and bare package names whose
 * stylesheet is named by the `style` field in their package.json (this is how
 * `@import 'uniwind'` finds `uniwind/uniwind.css`).
 */
function loadStylesheet(id: string, base: string): { content: string; base: string; path: string } {
  let file: string;
  if (id.startsWith('.') || path.isAbsolute(id)) {
    file = path.resolve(base, id);
  } else {
    // `tailwindcss/theme.css` -> a file inside the package.
    // `uniwind`              -> the package's `style` entry.
    const parts = id.split('/');
    const pkgName = id.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    const sub = id.slice(pkgName.length + 1);
    const pkgJson = path.join(appRoot, 'node_modules', pkgName, 'package.json');
    const pkgDir = path.dirname(pkgJson);
    if (sub) {
      file = path.join(pkgDir, sub);
    } else {
      const style = JSON.parse(readFileSync(pkgJson, 'utf8')).style;
      assert(typeof style === 'string', `package ${pkgName} has no "style" entry to import`);
      file = path.join(pkgDir, style);
    }
  }
  return { content: readFileSync(file, 'utf8'), base: path.dirname(file), path: file };
}

let built = '';
const entry = readFileSync(path.join(appRoot, 'global.css'), 'utf8');
try {
  const compiler = await compile(entry, {
    base: appRoot,
    loadStylesheet: async (id: string, base: string) => loadStylesheet(id, base),
    loadModule: async () => {
      throw new Error('global.css should not need a JS plugin');
    },
  });
  // A couple of real utilities so the utilities layer is genuinely exercised
  // rather than compiled empty.
  built = compiler.build(['bg-background', 'text-foreground', 'border-border', 'bg-primary', 'text-kai']);
  console.log('  ok   global.css compiles');
} catch (err) {
  failures++;
  console.error(`  FAIL global.css compiles\n       ${(err as Error).message}`);
}

if (built) {
  // -------------------------------------------------------------------------
  // 3. NO PREFLIGHT
  // -------------------------------------------------------------------------
  // Fingerprints unique to tailwindcss/preflight.css. Each is a rule that would
  // apply to EVERY matching element in the document — which is the whole reason
  // preflight is excluded. If any of them appears, the reset came back.
  const preflightFingerprints: Array<[string, string]> = [
    ['-webkit-text-size-adjust', 'the html/:host reset'],
    ['text-indent: 0', 'the table reset'],
    ['-moz-ui-invalid', 'the form-control reset'],
    ['::-webkit-datetime-edit', 'the date-input reset'],
    ['list-style: none', 'the ol/ul/menu reset'],
  ];
  check('preflight is absent (the live web build cannot shift)', () => {
    const found = preflightFingerprints.filter(([needle]) => built.includes(needle));
    assert(
      found.length === 0,
      `global.css is emitting Tailwind's preflight — found ${found
        .map(([needle, what]) => `"${needle}" (${what})`)
        .join(', ')}.\n` +
        `       Preflight is a document-wide DOM reset. react-native-web already\n` +
        `       ships one, and ~60 screens in apps/mobile/proof/ were signed off\n` +
        `       against the current pixels. Someone probably replaced the split\n` +
        `       imports in global.css with a single @import 'tailwindcss'.\n` +
        `       Read the header of global.css before changing this.`,
    );
  });

  // -------------------------------------------------------------------------
  // 4. PALETTE
  // -------------------------------------------------------------------------
  // The point of the whole bridge: gluestack's semantic names have to resolve
  // to tokens.ts values. Read the expected values out of tokens.ts rather than
  // typing them here — a hardcoded hex would be a third copy of the palette,
  // which is the exact failure the bridge exists to prevent.
  const { color, alpha } = await import('../src/ui/tokens.ts');

  check('primary is volt (the user acting), not a default brand blue', () => {
    assert(
      built.includes(color.volt),
      `expected volt ${color.volt} in the compiled output as --color-primary`,
    );
  });

  check('accent is violet (Kai)', () => {
    assert(built.includes(color.violet), `expected violet ${color.violet} in the compiled output`);
  });

  check('the hairline kept its alpha (a border is ivory at 12%, not flat grey)', () => {
    assert(
      built.includes(alpha.ivory12),
      `expected the border token to be ${alpha.ivory12}. If this failed with a\n` +
        `       6-digit hex instead, the generator was switched to the rgb-triplet\n` +
        `       form, which cannot carry alpha — see the note in gen-theme.mts.`,
    );
  });

  check('uniwind did not blank the background', () => {
    // uniwind.css ships `@theme { --color-background: unset }` so a host app can
    // define it. That only works if our palette is imported AFTER uniwind.
    assert(
      built.includes(color.bg),
      `--color-background resolved to nothing. theme.generated.css must be\n` +
        `       imported AFTER 'uniwind' in global.css, or uniwind's "unset" wins.`,
    );
  });
}

console.log(failures === 0 ? 'theme bridge OK' : `theme bridge: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
