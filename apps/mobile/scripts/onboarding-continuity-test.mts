/**
 * ONBOARDING CONTINUITY — the four promises this lane made, checked mechanically.
 *
 *   cd apps/mobile && npx tsx scripts/onboarding-continuity-test.mts
 *
 * Audit F01, F02 and F21 all have acceptance criteria that read like prose and
 * are actually assertions. This file is those assertions. It covers four things
 * that would otherwise rot quietly:
 *
 *   1. A DRAFT SURVIVES AND RESUMES. F01's acceptance is "complete signup,
 *      close and reopen, resume the same step with the same choices". A round
 *      trip through the codec plus `furthestStep` is exactly that sentence, and
 *      a Playwright proof could not check it — the failure mode is a process
 *      restart, which the browser proofs never perform.
 *
 *   2. INTENT NEVER BECOMES IDENTITY OR READINESS. "Keep identity and intent
 *      separate until an account exists" and "do not silently promote readiness
 *      from a marketing persona". Both are properties of one function,
 *      `prefillFromIntent`, and both are one careless line from being lost —
 *      adding `start_answer` to its return would look like a helpful tidy-up
 *      and would place people on the readiness ladder from a marketing click.
 *
 *   3. THE CAPABILITY LIST IS ONE LIST. `apps/site` cannot import
 *      `packages/shared` — its `next.config.ts` says so, because the site
 *      deploys with Root Directory = apps/site and the parent is not uploaded —
 *      so it carries a mirror. This test is the thing that stops the mirror
 *      drifting, exactly as `stage-rules-test.mts` does for the day gates.
 *
 *   4. EVERY PROMISE HAS A DESTINATION. F02's acceptance in one line: an
 *      available capability must name a route that EXISTS as a file, a planned
 *      one must name none, and onboarding must not contain the two sentences
 *      this lane deleted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * `features/training/path.ts` reaches the curriculum, which `require()`s the day
 * thumbnails — Metro understands that and Node does not. Registering a loader
 * for .jpg/.png that returns a number is what the bundler does, and it lets the
 * REAL curriculum be read here rather than a copy of it that could disagree
 * with it. `scripts/training-gates-test.mts` does the same and explains it at
 * more length.
 */
const req = createRequire(import.meta.url);
for (const ext of ['.jpg', '.png']) {
  (req.extensions as Record<string, unknown>)[ext] = (m: { exports: unknown }) => {
    m.exports = 1;
  };
}

import {
  DEFAULT_BALANCE,
  EMPTY_ANSWERS,
  clampBalance,
  isEmptyAnswers,
  parseDraft,
  parseDraftFile,
  serialiseDraftFile,
  toStored,
} from '../src/features/onboarding/draft-codec.ts';
import {
  GUIDANCE_FOR_PLACEMENT,
  MODE_FOR_PLACEMENT,
  answersForPlacement,
  furthestStep,
  prefillFromIntent,
  resumeRoute,
  type OnboardingAnswers,
} from '../src/features/onboarding/steps.ts';
import { intentFromPath, parseIntent } from '../src/features/onboarding/intent.ts';
import { CAPABILITIES, CAPABILITY_ORDER, type CapabilityId } from '../../../packages/shared/capabilities.ts';
import { CAPABILITIES as SITE_CAPABILITIES } from '../../site/src/sim/capabilities.ts';

const { PATH_STEPS, stepIsWritten } = await import('../src/features/training/path.ts');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, '..');
const APP_DIR = path.join(MOBILE, 'src', 'app');
const ONBOARDING_DIR = path.join(APP_DIR, '(onboarding)');
const SITE_DIR = path.resolve(MOBILE, '../site/src');

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

/* ==================================================================== */
console.log('\n1. A half-finished signup survives being closed');
/* ==================================================================== */
{
  // Somebody who answered step 1 and step 2 and then got a phone call.
  const answers: OnboardingAnswers = {
    ...EMPTY_ANSWERS,
    ...answersForPlacement('swing'),
    goal_mode: 'invest',
    guidance: 'pro',
    confirmed_goal: true,
    focus: ['ai', 'energy'],
    starting_balance: 25000,
  };

  const disk = serialiseDraftFile({ 'user-a': answers });
  const back = parseDraftFile(disk)['user-a'];

  ok('every answer comes back exactly as it went in', JSON.stringify(back) === JSON.stringify(answers), { back, answers });
  ok('and it resumes at the step that follows them', resumeRoute(back) === '/kai-plan', resumeRoute(back));

  // The overruled defaults are the interesting half: the placement pre-selected
  // swing + some, the member picked invest + pro, and a resume must show what
  // THEY chose rather than re-deriving the guess.
  ok('an overruled pre-selection is not re-derived on resume', back.goal_mode === 'invest' && back.guidance === 'pro', back);

  ok('two members on one device do not share a draft', parseDraftFile(serialiseDraftFile({ a: answers, b: EMPTY_ANSWERS }))['b'].start_answer === null);
}

/* ==================================================================== */
console.log('\n2. The step is derived from the answers, never guessed');
/* ==================================================================== */
{
  ok('nothing answered resumes at step 1', furthestStep(EMPTY_ANSWERS) === 'start');

  const placed: OnboardingAnswers = { ...EMPTY_ANSWERS, ...answersForPlacement('brand_new') };
  ok('placement answered resumes at step 2', furthestStep(placed) === 'goal', furthestStep(placed));

  // THE CASE THE FLAG EXISTS FOR. Placement pre-selects goal AND guidance, so
  // both are set on a draft whose owner has never seen step 2. Without
  // `confirmed_goal` this would resume at the plan screen and the member would
  // never be asked the question the audit asked us to ask once, clearly.
  ok('a pre-selected goal does NOT count as having answered step 2', placed.goal_mode !== null && placed.guidance !== null && furthestStep(placed) === 'goal');

  ok('confirming step 2 resumes at the plan', furthestStep({ ...placed, confirmed_goal: true }) === 'plan');
}

/* ==================================================================== */
console.log('\n3. A draft written by another build never becomes an answer');
/* ==================================================================== */
{
  ok('a value outside the union reads as unanswered', parseDraft({ ...toStored(EMPTY_ANSWERS), goal_mode: 'crypto' })?.goal_mode === null);
  ok('so does a guidance level that no longer exists', parseDraft({ ...toStored(EMPTY_ANSWERS), guidance: 'expert' })?.guidance === null);
  ok('an unknown focus chip is dropped, the known ones survive', JSON.stringify(parseDraft({ ...toStored(EMPTY_ANSWERS), focus: ['ai', 'tulips'] })?.focus) === JSON.stringify(['ai']));
  ok('a draft from a different schema version is discarded whole', parseDraft({ ...toStored(EMPTY_ANSWERS), v: 99 }) === null);
  ok('rubbish on disk is a fresh start, not a crash', JSON.stringify(parseDraftFile('{{not json')) === '{}');
  ok('a NaN balance becomes the paper default', parseDraft({ ...toStored(EMPTY_ANSWERS), starting_balance: Number.NaN })?.starting_balance === DEFAULT_BALANCE);
  ok('the balance is clamped to what the server will accept', clampBalance(1) === 1000 && clampBalance(10_000_000) === 100000);
  ok('an empty draft is recognised as empty, so the key is deleted', isEmptyAnswers(EMPTY_ANSWERS) && !isEmptyAnswers({ ...EMPTY_ANSWERS, start_answer: 'active' }));
  ok('nothing is pre-ticked — a preference nobody expressed is not stored', EMPTY_ANSWERS.focus.length === 0 && EMPTY_ANSWERS.guidance === null);
}

/* ==================================================================== */
console.log('\n4. The website may set preferences. It may not set readiness.');
/* ==================================================================== */
{
  const intent = intentFromPath('pro', { interest: 'plan', priority: 'grade', token: 'abc' });
  const prefill = prefillFromIntent(intent);

  ok('a funnel path prefills the goal', prefill.goal_mode === 'day_trade', prefill);
  ok('and the guidance', prefill.guidance === 'pro', prefill);

  // The audit's own sentence: "Do not silently promote readiness from a
  // marketing persona." A `start_answer` here would set `profiles.stage`
  // through START_PLACEMENT, which decides which Home somebody gets and what
  // tag sits beside their name — from a button on a marketing page.
  ok('it NEVER answers the placement question', !('start_answer' in prefill), Object.keys(prefill));
  ok('and never anything that is not a preference', Object.keys(prefill).every((k) => k === 'goal_mode' || k === 'guidance'), Object.keys(prefill));

  ok('the suggestion is carried separately, for the screen to show', intent.suggested_placement === 'active');

  // Identity is not in the shape at all — the strongest form of "keep identity
  // and intent separate until an account exists".
  const keys = Object.keys(intent);
  ok('an intent has no field that could hold a person', !keys.some((k) => /email|name|user|person|phone/i.test(k)), keys);

  ok('garbage from a deep link is refused outright', parseIntent({ path: 'wealth' }) === null && parseIntent(null) === null);
  ok('a partial intent is refused rather than half-applied', parseIntent({ interest: 'chart' }) === null);
  ok('every placement has a mode and a guidance default', (['brand_new', 'investor', 'swing', 'active'] as const).every((k) => MODE_FOR_PLACEMENT[k] && GUIDANCE_FOR_PLACEMENT[k]));
  ok('the gentlest placements never default to the terse voice', GUIDANCE_FOR_PLACEMENT.brand_new === 'new' && GUIDANCE_FOR_PLACEMENT.investor === 'new');
}

/* ==================================================================== */
console.log('\n5. The capability list is one list (shared ↔ site mirror)');
/* ==================================================================== */
{
  const sharedIds = Object.keys(CAPABILITIES).sort();
  const siteIds = Object.keys(SITE_CAPABILITIES).sort();
  ok('both files carry the same capabilities', JSON.stringify(sharedIds) === JSON.stringify(siteIds), { sharedIds, siteIds });

  for (const id of sharedIds as CapabilityId[]) {
    const a = CAPABILITIES[id];
    const b = SITE_CAPABILITIES[id as keyof typeof SITE_CAPABILITIES];
    if (!b) continue;
    ok(`${id}: state agrees`, a.state === b.state, { shared: a.state, site: b.state });
    ok(`${id}: title agrees`, a.title === b.title, { shared: a.title, site: b.title });
    ok(`${id}: action agrees`, a.action === b.action, { shared: a.action, site: b.action });
    ok(`${id}: the line agrees`, a.plain === b.plain, { shared: a.plain, site: b.plain });
  }

  ok('the render order covers every capability', CAPABILITY_ORDER.length === sharedIds.length && new Set(CAPABILITY_ORDER).size === sharedIds.length);
}

/* ==================================================================== */
console.log('\n6. Every advertised capability has a working destination');
/* ==================================================================== */
{
  /** Every route the app can reach, read off the filesystem. */
  const routes = new Set<string>();
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name;
      if (name.startsWith('_')) continue;
      if (entry.isDirectory()) {
        // A `(group)` contributes no path segment — that is what the
        // parentheses mean to expo-router — so `(tabs)/alerts.tsx` is /alerts.
        walk(path.join(dir, name), name.startsWith('(') ? prefix : `${prefix}/${name}`);
        continue;
      }
      if (!name.endsWith('.tsx')) continue;
      const base = name.replace(/\.tsx$/, '');
      routes.add(base === 'index' ? (prefix || '/') : `${prefix}/${base}`);
    }
  };
  walk(APP_DIR, '');

  for (const id of CAPABILITY_ORDER) {
    const c = CAPABILITIES[id];
    if (c.state === 'available') {
      ok(`${id} is offered and names a route`, c.route !== null, c);
      if (c.route) ok(`${id} → ${c.route} is a screen that exists`, routes.has(c.route), { route: c.route });
    } else {
      // A planned capability with a route is the F02 bug in its purest form:
      // an offer somebody can tap that lands on an apology.
      ok(`${id} is planned and names NO route`, c.route === null, c);
    }
  }
}

/* ==================================================================== */
console.log('\n7. Onboarding agrees with training about what is written');
/* ==================================================================== */
{
  const pairs: [CapabilityId, string][] = [
    ['training_basics', '01'],
    ['training_read_chart', '02'],
    ['training_build_plan', '03'],
  ];
  for (const [id, index] of pairs) {
    const step = PATH_STEPS.find((s) => s.index === index);
    ok(`step ${index} exists in the training path`, Boolean(step));
    if (!step) continue;
    const written = stepIsWritten(step);
    ok(
      `step ${index}: the capability list and the curriculum agree`,
      (CAPABILITIES[id].state === 'available') === written,
      { capability: CAPABILITIES[id].state, stepIsWritten: written },
    );
  }
}

/* ==================================================================== */
console.log('\n8. Onboarding no longer promises what the app cannot do');
/* ==================================================================== */
{
  const onboardingSource = stripComments(
    fs
      .readdirSync(ONBOARDING_DIR)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => fs.readFileSync(path.join(ONBOARDING_DIR, f), 'utf8'))
      .join('\n'),
  );

  // The exact sentence the plan screen used to end on, against an Account board
  // that says "Paper is the only mode in this release". Audit F02's evidence.
  ok(
    'the plan screen does not offer a brokerage "anytime in Account"',
    !/Connect a brokerage anytime/i.test(onboardingSource),
  );
  ok(
    'the action says paper money in the action itself',
    /Practise with paper money/.test(CAPABILITIES.paper_trading.action),
  );

  const siteSource = stripComments(collectSource(SITE_DIR));
  ok(
    'the site no longer sells "7 Days" of curriculum',
    !/Zero to Trade Ready in 7 Days|7-day path|Seven days from nothing/i.test(siteSource),
  );
  ok(
    'and the funnel ends at a form rather than a mailto button',
    fs.existsSync(path.join(SITE_DIR, 'app/get-the-app/EarlyAccessForm.tsx')) &&
      fs.existsSync(path.join(SITE_DIR, 'app/api/early-access/route.ts')),
  );
}

function collectSource(dir: string): string {
  let out = '';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { out += collectSource(full); continue; }
    if (/\.(ts|tsx)$/.test(entry.name)) out += `${fs.readFileSync(full, 'utf8')}\n`;
  }
  return out;
}

/**
 * Comments out, code in.
 *
 * Without this the check fails on its own explanation: this repo's house style
 * is that a file opens by saying what it used to do and why that was wrong, so
 * `kai-plan.tsx` and the site's learn surface both QUOTE the sentences that
 * were removed. A grep that cannot tell a rendered promise from a note about a
 * deleted one would push the next author into deleting the note instead.
 *
 * Block comments go entirely. Line comments only when the `//` opens the line,
 * because a `//` mid-line is far more often a URL than a comment, and stripping
 * the rest of that line would hide real code from the check.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

console.log(
  failures === 0
    ? '\nAll onboarding continuity checks passed.\n'
    : `\n${failures} onboarding continuity check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
