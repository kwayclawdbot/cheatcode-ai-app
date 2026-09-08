/**
 * Companies worth understanding — the research list, checked as contract and
 * as text.
 *
 *   cd apps/mobile && npm test
 *
 * The Invest tab's top section is RESEARCH. It is read on a horizon of years,
 * and the ways it can be wrong without erroring are all ways of quietly turning
 * it back into an alerts board or of filling a gap with something that reads
 * like a finding:
 *
 *   · a stop, a target, a trigger or a price to act at appearing on a row —
 *     any one of them answers a question nobody came to this screen with;
 *   · a company graded A- being drawn as ungraded, because the app's copy of
 *     the scale was the six bare steps while the analyst wrote modifiers;
 *   · a missing business line rendered as a dash, which on that row reads as a
 *     company that does nothing rather than as a sentence not yet written;
 *   · the desk's list being stood in for by the watchlist rows when the desk
 *     has not published one — an empty section must say so in words;
 *   · one company printed twice, under two headings, as two opinions.
 *
 * The contract half runs the real zod objects. The screen half reads the source
 * of `Watchlist.tsx`, the same way `desk-thesis-test.mts` reads `ui.tsx`, since
 * a rule about what may never appear on a row is a rule about that file.
 */
import { readFileSync } from 'node:fs';
import {
  DeskCompany, DeskWatchlistResponse, IDEA_GRADE_SCALE, IdeaGrade, gradeRank,
} from '../../../packages/shared/desk.ts';
import { fixtureDeskWatchlist, fixtureDeskWatchlistEmpty } from '../src/lib/fixtures.ts';

let pass = 0;
let fail = 0;

function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

/* ── the scale the app is willing to read ─────────────────────────── */

console.log('\ndesk / the grade scale carries its modifiers');

for (const g of ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D']) {
  ok(`${g} is a grade the app accepts`, IdeaGrade.safeParse(g).success);
}
ok('F is still not one', !IdeaGrade.safeParse('F').success);
ok('and neither is a lowercase a-', !IdeaGrade.safeParse('a-').success);
eq('the ladder is ten marks long', IDEA_GRADE_SCALE.length, 10);
ok('best first', gradeRank('A+') === 0 && gradeRank('D') === 9);
ok('an ungraded row sorts behind the lowest mark', gradeRank(null) > gradeRank('D'));

/* ── the response shape ───────────────────────────────────────────── */

console.log('\ndesk / the watchlist response carries the research list');

{
  const old = DeskWatchlistResponse.parse({ asOf: '2026-09-04', rows: [] });
  eq('a payload written before this field existed still parses', old.companies, []);
}

{
  const row = {
    asOf: '2026-09-08', ticker: 'SITM', company: 'SiTime Corp',
    businessLine: 'Timing chips that keep electronics in step with each other.',
    ideaGrade: 'A-', ideaGradeWhy: 'a small market it already leads',
    theme: 'AI-Capex-Cycle', pickDate: '2026-09-04', direction: 'long',
    status: 'active', horizon: '4q', entryPrice: 212.4, entryStampedOn: '2026-09-04',
    potentialMovePct: null, potentialMoveBasis: null, sourcePick: 'SITM', rank: 1,
  };
  const parsed = DeskCompany.parse(row);
  eq('a real row parses whole', parsed.ticker, 'SITM');
  eq('with its modified grade intact', parsed.ideaGrade, 'A-');
  eq('and the stamped price carries the day it was stamped on',
    [parsed.entryPrice, parsed.entryStampedOn], [212.4, '2026-09-04']);

  // A missing business line is a real state and must parse, not throw — the
  // screen's job is then to omit the element rather than print a dash.
  ok('a company with no business line is still a company',
    DeskCompany.safeParse({ ...row, businessLine: null }).success);
  ok('and one the desk has not graded is too',
    DeskCompany.safeParse({ ...row, ideaGrade: null }).success);
  ok('but an off-scale grade is refused at the door',
    !DeskCompany.safeParse({ ...row, ideaGrade: 'F' }).success);
}

/* ── the sample the preview draws ─────────────────────────────────── */

console.log('\ndesk / the sample list has the shapes the real one has');

{
  const list = fixtureDeskWatchlist.companies;
  ok('the sample publishes a list', list.length > 0);
  ok('every row is a valid company', list.every((c) => DeskCompany.safeParse(c).success));
  ok('one publication day, not several',
    new Set(list.map((c) => c.asOf)).size === 1, list.map((c) => c.asOf));

  // The dedupe case has to EXIST in the sample or the screen rule it proves is
  // never exercised by anything a person can look at.
  const watched = new Set(fixtureDeskWatchlist.rows.map((r) => r.ticker));
  ok('a company the desk both graded and took a position in is in the sample',
    list.some((c) => watched.has(c.ticker)));

  // And the missing-line case, for the same reason: a sample where every field
  // is filled in is a sample of a screen that does not exist.
  ok('a company with no business line is in the sample too',
    list.some((c) => c.businessLine === null));
  ok('a modified grade is in the sample', list.some((c) => /[+-]$/.test(c.ideaGrade ?? '')));

  eq('the empty sample publishes nothing rather than a placeholder',
    fixtureDeskWatchlistEmpty.companies, []);
  eq('and has no watchlist rows either', fixtureDeskWatchlistEmpty.rows, []);
}

/* ── what may never appear on a research row ──────────────────────── */

const src = readFileSync(new URL('../src/features/desk/Watchlist.tsx', import.meta.url), 'utf8');
/* Comments record what the rules are and why, and must not fail the check that
 * the thing they describe is absent from the screen. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const block = (name: string): string => {
  const from = code.indexOf(`function ${name}`);
  if (from < 0) return '';
  const next = code.indexOf('\nfunction ', from + 1);
  return code.slice(from, next < 0 ? code.length : next);
};

console.log('\ndesk / the research row is research, not a trade');

ok('the section is on the screen, in the desk’s own words',
  /Companies worth understanding\./.test(code) && /Clear ideas\. Real businesses\./.test(code));
ok('the row opens the write-up that already exists', /\/desk\/pick\/\$\{/.test(code));

const row = block('CompanyRow');
ok('there is a company row to check', row.length > 0);
ok('it carries the ticker’s mark, never bare text', /<TickerMark /.test(row));
ok('it carries the business line', /businessLine/.test(row));
ok('it carries the idea grade', /<IdeaGradePill /.test(row));
ok('and a way into the write-up', /<ChevronRight /.test(row));

// The horizon is years. Any of these on this row is the surface reverting to
// the thing it was built not to be.
for (const [what, re] of [
  ['a stop', /\bstop\b/i],
  ['a target', /\btarget\b/i],
  ['a trigger', /trigger/i],
  ['an invalidation level', /invalidation/i],
  ['a level track', /LevelTrack/],
  ['a state chip', /StateChip/],
  ['a price of any kind', /\bpx\(|entryPrice|\bprice\b/i],
] as const) {
  ok(`the row shows no ${what}`, !re.test(row), row.match(re)?.[0]);
}
// And no short-horizon scoreboard anywhere on this surface: the desk measures
// these in quarters, and "day 1 / day 5" is the alerts lane's question.
ok('nothing on the screen frames a five-day outcome',
  !/\b(day\s*1|day\s*5|5-day|five-day|same-day)\b/i.test(code));

console.log('\ndesk / a blank never reads as a finding');

const pill = block('IdeaGradePill');
ok('an ungraded company says so in words', /not graded/.test(pill));
ok('and never draws a dash instead', !/'—'|"—"|>—</.test(pill));
ok('a company with no business line has the line omitted, not filled',
  /\{c\.businessLine \?/.test(row));
ok('a company with no name has it omitted too', /\{c\.company \?/.test(row));
ok('an unpublished list says the desk has not published one',
  /has not published a list yet/.test(code));
ok('and says the watchlist is not standing in for it',
  /is not stood in for them/.test(code));

console.log('\ndesk / the two lists stay two lists');

ok('a company already in the research list is not printed again below',
  /listed\.has\(r\.ticker\)/.test(code));
{
  // The desk's list may hide a row it duplicates. It may NEVER touch the list
  // you wrote — so the filter that builds `manual` must not consult it at all.
  const yours = code.split('\n').find((l) => /manual: rows\.filter/.test(l)) ?? '';
  ok('there is a filter that builds your own list', yours.length > 0);
  ok('your own additions are never dropped by the dedupe rule',
    /r\.source === 'manual'/.test(yours) && !/listed/.test(yours), yours.trim());
}
ok('the list you wrote is still yours to add to', /desk-add-input/.test(code));
ok('and it is still headed as yours', /You added these/.test(code));

console.log('\ndesk / the identity layer');

// Hand-rolled StyleSheet against tokens. A colour written into this file is a
// second palette that has no way of knowing when the first one changes.
ok('the screen styles itself with StyleSheet', /StyleSheet\.create\(/.test(code));
ok('no Tailwind classNames on an identity surface', !/className=/.test(code));
ok('no gluestack imports', !/@gluestack-ui/.test(code));
ok('no raw hex colour', !/#[0-9a-fA-F]{3,8}\b/.test(code));
ok('no raw rgb/rgba colour', !/rgba?\(/.test(code));
ok('colours come from the token file', /from '\.\.\/\.\.\/ui\/tokens'/.test(code));

/* ── a theme nobody judged is not a theme scored zero ─────────────── */
/*
 * The 6 September theme run ran out of credit and stored zeros with the reason
 * "NOT JUDGED". The API refuses those now, so the app receives null — and null
 * must not be drawn as a measure. An empty ten-segment bar beside a dash is a
 * picture of the lowest score on the scale, which is precisely the judgement
 * the desk did not make.
 */
const inst = readFileSync(new URL('../src/features/desk/instruments.tsx', import.meta.url), 'utf8');
const themes = readFileSync(new URL('../src/app/desk/themes.tsx', import.meta.url), 'utf8');
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const instCode = stripComments(inst);
const themesCode = stripComments(themes);

console.log('\ndesk / not judged is not zero');

ok('the size meter draws words, not an empty bar, when nothing was judged',
  /if \(magnitude === null\) return <NotJudged/.test(instCode));
ok('and so does the conviction meter',
  /if \(conviction === null\) return <NotJudged/.test(instCode));
ok('the words say the desk has not judged it, in plain English',
  /has not judged this theme yet/.test(instCode));

// The exact bug, as a shape: a missing reading coalesced to zero.
ok('nothing on the theme path turns a missing magnitude into 0',
  !/magnitude \?\? 0/.test(instCode) && !/magnitude \?\? 0/.test(themesCode));
ok('nor a missing conviction',
  !/conviction \?\? 0/.test(instCode) && !/conviction \?\? 0/.test(themesCode));
ok('and the themes list prints no dash where a score would be',
  !/conviction \?\? '—'/.test(themesCode) && !/magnitude != null \? .*: '—'/.test(themesCode));
ok('the themes list says "not judged yet" instead',
  /not judged yet/.test(themesCode) && /not judged/.test(themesCode));

// A real zero is still a reading, and the meter still draws it as one.
ok('a judged zero is not caught by the absence check',
  !/magnitude === 0/.test(instCode) && !/!magnitude/.test(instCode));

console.log('\ndesk / a reading carries the day it was taken');

ok('the theme panel prints when the judgement was made', /Judged \$\{saidDate\(judgedOn\)/.test(inst));
ok('the panel takes the date from the desk, not from the clock',
  /judgedOn\?: string \| null/.test(inst));
ok('the themes list dates its readings too', /judged \$\{theme\.judgedOn\}/.test(themes));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
