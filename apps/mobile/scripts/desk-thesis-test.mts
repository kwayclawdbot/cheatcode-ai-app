/**
 * Reading the sections the desk already wrote.
 *
 *   cd apps/mobile && npm test
 *
 * What is checked here are the ways this can be wrong WITHOUT erroring, which
 * are the only ways that matter for a reader:
 *
 *   · a write-up shredded into fragments because a bold line inside a section
 *     got promoted to a heading of its own — PDYN's WHAT THE NUMBERS SAY opens
 *     eight paragraphs with one, and promoting them would put eight headings
 *     on the page the analyst never wrote;
 *   · the fourteen write-ups whose sections ARE bold lines being read as
 *     structureless and dumped out as one block;
 *   · a write-up with genuinely no headings being given invented ones;
 *   · the reader opening on the wrong section, so that a person who came for
 *     the verdict lands on the preamble.
 *
 * The two real write-ups the fixtures carry are parsed here as well, so this
 * fails the day either of them stops matching what the screen expects.
 */
import { readFileSync } from 'node:fs';
import { parseThesis, openingSection, sectionGloss } from '../src/features/desk/thesis.ts';
import { REAL_AAOI_THESIS, REAL_PDYN_THESIS } from '../src/lib/fixtures-desk-real.ts';

let pass = 0;
let fail = 0;

function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

console.log('\ndesk / the thesis reader');

/* ── the eight-section write-up, verbatim ─────────────────────────── */

const pdyn = parseThesis(REAL_PDYN_THESIS);
ok('a real write-up reads as sectioned', pdyn.sectioned);
eq('the title comes off the first line', pdyn.title, 'PDYN — Palladyne AI Corp.');
eq('the desk’s eight headings, in the desk’s order',
  pdyn.sections.map((s) => s.name),
  ['THE THEME', 'WHAT THEY ACTUALLY DO', 'WHY THIS ONE', 'COULD IT LEAD',
    'THE CONNECTION', 'WHAT THE NUMBERS SAY', 'WHAT WOULD HAVE TO BE TRUE', 'THE CALL']);
ok('no section comes back empty', pdyn.sections.every((s) => s.words > 0));
ok('nothing is written before the first heading', pdyn.preamble === '');

/*
 * The one that would ruin the page. WHAT THE NUMBERS SAY opens paragraph after
 * paragraph with a bold run; if those were read as headings the section would
 * come apart into fragments carrying names the analyst never wrote.
 */
const numbers = pdyn.sections.find((s) => s.name === 'WHAT THE NUMBERS SAY')!;
ok('bold runs inside a section stay inside it', numbers.words > 200, numbers.words);
ok('the bold runs survive as text', numbers.body.includes('**Gross margin'));

/* Every word of the original is still there, in order. */
const rebuilt = pdyn.sections.map((s) => s.body).join('\n');
ok('nothing was dropped on the way through',
  rebuilt.length > REAL_PDYN_THESIS.length * 0.9, rebuilt.length);
ok('nothing was summarised', REAL_PDYN_THESIS.includes(pdyn.sections[7].body.slice(0, 120)));

/* ── the write-ups whose headings are bold lines ──────────────────── */

const aaoi = parseThesis(REAL_AAOI_THESIS);
ok('a write-up with no ## headings still reads as sectioned', aaoi.sectioned);
eq('its bold lines are found as the sections they are',
  aaoi.sections.map((s) => s.name),
  ['WHAT THEY ACTUALLY DO', 'THE CONNECTION', 'WHAT THE NUMBERS SAY',
    'WHAT WOULD HAVE TO BE TRUE', 'THE CALL']);
ok('it has no title, because it was written without one', aaoi.title === null);
ok('its sections all carry text', aaoi.sections.every((s) => s.words > 20));

/* ── genuinely no structure: say so, invent nothing ───────────────── */

const plain = parseThesis('One paragraph of argument.\n\nAnd a second one.');
ok('a write-up with no headings is not pretended to have any', plain.sectioned === false);
eq('no sections are invented', plain.sections, []);
eq('the whole text is handed back untouched', plain.preamble,
  'One paragraph of argument.\n\nAnd a second one.');

const empty = parseThesis(null);
ok('nothing at all is handled', empty.sectioned === false && empty.preamble === '');

/*
 * A single bold line is emphasis, not a section. Two would be a heading set —
 * one is a person making a point.
 */
const oneBold = parseThesis('Some argument.\n\n**A single emphasised line**\n\nMore argument.');
ok('one lone bold line is not treated as a heading',
  oneBold.sections.length <= 1, oneBold.sections.map((s) => s.name));

/* ── where the reader lands ───────────────────────────────────────── */

eq('the reader opens on the verdict', pdyn.sections[openingSection(pdyn.sections)].name, 'THE CALL');
eq('the reader opens on the verdict for bold-line write-ups too',
  aaoi.sections[openingSection(aaoi.sections)].name, 'THE CALL');
eq('with no verdict written, it opens on the first section',
  openingSection([{ name: 'THE THEME', body: 'x', words: 1 }]), 0);
eq('with no sections at all there is nothing to open', openingSection([]), -1);

/* ── the glosses are labels on the desk's own headings only ───────── */

eq('a heading the desk writes gets its plain-English label',
  sectionGloss('WHAT WOULD HAVE TO BE TRUE'), 'the conditions, listed');
eq('a heading nobody recognises gets no invented explanation',
  sectionGloss('SOMETHING THE DESK MADE UP TODAY'), null);

/* ── what the screen says the grade means ─────────────────────────── */
/*
 * The explainer on the pick screen is the only place a reader is told what the
 * grade IS. It said the grade was "how big the claim is, how underpriced it
 * looks, and how well placed this company is" — and two of those three had no
 * numbers behind them anywhere in the brain, so the screen was describing a
 * judgement that was partly being invented. The brain's rubric was rebuilt on
 * 5 September around five legs that each point at real figures. These checks
 * exist so the screen cannot drift back to describing something else.
 */
const uiSrc = readFileSync(new URL('../src/features/desk/ui.tsx', import.meta.url), 'utf8');
const pickSrc = readFileSync(new URL('../src/app/desk/pick/[ticker].tsx', import.meta.url), 'utf8');

console.log('\ndesk / what the screen says the grade means');

const legs = [...uiSrc.matchAll(/^  '(.+?)',$/gm)].map((m) => m[1]);
eq('the screen lists five things, matching the desk rubric', legs.length, 5);
ok('big change, not big company', /How big the change is/.test(uiSrc));
ok('whether this is the name', /could end up being the name that owns it/.test(uiSrc));
ok('whether the numbers turned', /reported numbers have started to turn/.test(uiSrc));
ok('whether it is already priced', /price already assumes all of it/.test(uiSrc));
ok('whether the stock is still early', /still early, or halfway up already/.test(uiSrc));

/* Comments are stripped first: both files deliberately record what the old
 * wording was and why it went, and that history must not fail the check that
 * the wording is no longer on screen. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '');
ok('the old invented wording is gone from the screen',
  !/underpriced/i.test(stripComments(uiSrc))
  && !/underpriced/i.test(stripComments(pickSrc)));
ok('the closing promise survives', /not a forecast for this quarter/.test(uiSrc));
ok('the calibration is on the page too', /Most are B or C/.test(uiSrc));
ok('a great business at a full price is still a B', /already in the price is a\n          B/.test(uiSrc));
ok('the pick screen actually renders the five legs', /<GradeLegs \/>/.test(pickSrc));
ok('and it still prints the analyst\'s own reason', /\{pick\.gradeWhy\}/.test(pickSrc));

/* Design rules on this screen: hairlines and rules only, no rounded boxes. */
const legsBlock = uiSrc.slice(uiSrc.indexOf('export function GradeLegs'),
                              uiSrc.indexOf('const STATE_TONE'));
ok('the explainer is ruled, not boxed',
  /StyleSheet\.hairlineWidth/.test(legsBlock) && !/borderRadius/.test(legsBlock));
ok('the numerals read violet, because the grade is Kai\'s judgement',
  /color\.violetLight/.test(legsBlock));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
