/**
 * THE TRADE IDEA EXPLAINS ITSELF, AND THE DESK SPEAKS ENGLISH.
 *
 *   cd apps/mobile && npx tsx scripts/setup-preview-test.mts
 *
 * Three audit findings meet in this file because they share one rule: a screen
 * may show what was measured and must say so when nothing was.
 *
 *   F06  the alert card leads with entry / stop / target, a price map, a
 *        reward ruler and one sentence — and refuses to invent any of them for
 *        an engine that publishes none. `features/alerts/trade-idea.ts` is the
 *        seam where that refusal is decided, so it is where it is asserted.
 *   F15  the desk leads with the company, quoting the write-up rather than
 *        summarising it, and never manufactures a description.
 *   F18  the attention badge is refreshed from shared state, and a failed load
 *        on the alerts board can never be drawn as a verified empty list.
 *
 * WHY HALF OF IT IS A STATIC CHECK. The mapping and the quoting are pure and
 * are exercised for real below. The RENDERING rules — "the levels are outside
 * the collapsed section", "the badge is not fetched once on mount" — are facts
 * about a React tree that a node script cannot mount, and they are exactly the
 * facts a later edit would undo without any test noticing. `no-fake-data-test`
 * set the precedent: where the rule is what matters, the rule is what is
 * checked, in the source.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  alertStatus, availability, exitPlan, hasMappableLevel, ideaDirection, ideaFromAlert,
  levelPrice, rewardPlan, setupKind, setupTypeLabel,
} from '../src/features/alerts/trade-idea.ts';
import { riskReward } from '../../../packages/trade-ui/model.ts';
import {
  IDEA_GRADE_MEANS, WATCH_STATE_CAVEAT, WATCH_STATE_PLAIN, firstSentences, horizonPlain,
  ideaGradeLine, plainCompany, whatCouldChange, whatItDoes, whyWatched,
} from '../src/features/desk/plain.ts';
import { REAL_PDYN_THESIS } from '../src/lib/fixtures-desk-real.ts';
import type { AlertCard } from '../src/lib/types.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

/* ================================================================== */
/* F06 — the seam                                                      */
/* ================================================================== */

const card = (over: Partial<AlertCard> = {}): AlertCard => ({
  id: 'a1',
  symbol: 'META',
  company: 'Meta Platforms',
  mode_label: 'Swing',
  direction_label: 'Long',
  instrument_label: 'equity',
  grade: 'A−',
  score: 87,
  state: 'entry_reached',
  state_label: 'Triggered',
  headline: 'Breakout confirmation detected',
  what_changed: 'META reclaimed $504 with 1.6× volume.',
  trade: { direction: 'Long', current: '506.12', entry: '504–507', stop: '498', target: '520', rr: '2.4:1' },
  score_components: [],
  primary_action: { label: 'Open Trade Portal', kind: 'entry_reached' },
  ...over,
});

console.log('\nF06 / a level is a price, or it is not a level');
{
  ok('a plain price parses', levelPrice('504.10') === 504.1);
  ok('a dollar sign is allowed', levelPrice('$504.10') === 504.1);
  ok('thousands separators are allowed', levelPrice('1,234.50') === 1234.5);
  ok('surrounding space is allowed', levelPrice('  498 ') === 498);

  /*
    THE FOUR REFUSALS. Every one of these is a string the live board actually
    sends, and every one of them contains a number a loose parser would happily
    turn into a dashed line on a chart labelled ENTRY.
  */
  ok('an entry ZONE is not a price', levelPrice('504–507') === null, levelPrice('504–507'));
  ok('a hyphenated zone is not either', levelPrice('242-245') === null);
  ok('a condition is not a price', levelPrice('> 934') === null);
  ok('a sentence containing a price is not a price', levelPrice('Above $124.8.') === null);
  ok('nothing is not a price', levelPrice(null) === null && levelPrice('') === null);
  ok('a negative or zero is refused', levelPrice('0') === null);
}

console.log('\nF06 / the reward ratio is measured, quoted, or absent — never guessed');
{
  const zone = card();
  const zoneIdea = ideaFromAlert(zone);
  ok('a zone entry yields no kit entry', zoneIdea.entry === null);
  ok('but the stop and target still reach the map', zoneIdea.stop === 498 && zoneIdea.target === 520);
  ok('so the kit cannot measure an R', riskReward(zoneIdea) === null);
  const zoneReward = rewardPlan(zone, zoneIdea);
  ok('and the server’s own ratio is STATED instead',
    zoneReward.kind === 'stated' && zoneReward.text === '2.4:1', zoneReward);

  const exact = card({ trade: { entry: '500', stop: '490', target: '520', rr: '2.4:1' } });
  const exactIdea = ideaFromAlert(exact);
  const measured = riskReward(exactIdea);
  ok('three real prices are measured by the kit', measured !== null && Math.abs(measured.ratio - 2) < 1e-9, measured);
  ok('and the ruler is what draws it', rewardPlan(exact, exactIdea).kind === 'measured');

  const bare = card({ trade: { entry: '500' } });
  const bareReward = rewardPlan(bare, ideaFromAlert(bare));
  ok('with neither, the absence is stated',
    bareReward.kind === 'absent' && bareReward.line === 'No reward ratio supplied', bareReward);
}

console.log('\nF06 / no exit plan is a visible state, not a tidy gap');
{
  ok('a complete plan says so', exitPlan(card()).kind === 'complete');

  const noStop = card({ trade: { entry: '500', target: '520' } });
  ok('a missing stop is named', exitPlan(noStop).kind === 'partial' && exitPlan(noStop).line === 'No stop supplied');

  const flow = card({
    grade: '—',
    score: null,
    instrument_label: 'options',
    trade: { direction: 'Long', current: '115.50', note: 'This engine reads options flow and nothing else.' },
    recommended_options: [{ label: 'The contract the flow bought', type: 'call', strike: '120', expiry: 'Aug 21' }],
  });
  const flowExit = exitPlan(flow);
  ok('an options-flow card says NO EXIT PLAN SUPPLIED in as many words',
    flowExit.kind === 'none' && flowExit.line === 'No exit plan supplied', flowExit);
  ok('it is the options product, decided from the data', setupKind(flow) === 'options_activity');
  ok('and it is named as one', setupTypeLabel(flow) === 'Unusual options activity');
  ok('it has no level to map, so it fetches no bars', hasMappableLevel(flow) === false);
  ok('an em-dash grade is not a grade', ideaFromAlert(flow).grade === null);
  ok('a card with levels is a setup', setupKind(card()) === 'stock_setup' && setupTypeLabel(card()) === 'Swing setup');
  ok('a card with neither is a signal, not a setup',
    setupKind(card({ trade: {}, recommended_options: [] })) === 'signal_only');
}

console.log('\nF06 / direction is read, never assumed');
{
  ok('the word wins when there is one', ideaDirection(card({ direction_label: 'Short' })) === 'short');
  ok('a put reads short', ideaDirection(card({ direction_label: null, trade: { direction: 'Put' } })) === 'short');
  // No word at all: the levels are the fact. A stop UNDER the entry is a long
  // however anybody labelled it, and defaulting to long would invert the other.
  const silentLong = card({ direction_label: '', trade: { entry: '500', stop: '490', target: '520' } });
  const silentShort = card({ direction_label: '', trade: { entry: '500', stop: '510', target: '480' } });
  ok('with no word, a stop below the entry is a long', ideaDirection(silentLong) === 'long');
  ok('and a stop above it is a short', ideaDirection(silentShort) === 'short');
  ok('a short’s reward measures positive',
    (riskReward(ideaFromAlert(silentShort))?.ratio ?? 0) === 2, riskReward(ideaFromAlert(silentShort)));
}

console.log('\nF06 / idea or order — answered in a sentence, not inferred from a dot');
{
  ok('an untouched idea says so', availability(card({ state: 'watching' })).kind === 'idea');
  ok('and says nothing has been placed',
    availability(card({ state: 'ready' })).line.includes('No order has been placed'));
  ok('a working order is not an idea', availability(card({ state: 'order_pending' })).kind === 'order');
  ok('an open position is not either', availability(card({ state: 'position_active' })).kind === 'position');
  ok('a finished one is over', availability(card({ state: 'closed' })).kind === 'over');

  ok('watching maps onto the kit’s first step', alertStatus('forming') === 'watching');
  ok('a plan with nothing open is NOT active', alertStatus('planned') === 'entry_reached');
  ok('a working order is', alertStatus('order_pending') === 'active');
  ok('and an invalidation keeps its own word', alertStatus('invalidated') === 'invalidated');
}

/* ================================================================== */
/* F06 — the card, as source                                           */
/* ================================================================== */

console.log('\nF06 / the decision essentials are outside the fold');
{
  const src = read('src/features/alerts/AlertCard.tsx');

  ok('the card draws the kit, not a fourth private chart',
    /from '\.\.\/\.\.\/ui\/trade'/.test(src)
    && src.includes('TradeMap') && src.includes('RiskRewardRuler') && src.includes('TradeStatusStrip'));

  /*
    THE FINDING ITSELF. The levels used to live inside `{open ? (`. This is the
    check that they are above it and stay there: the first mention of the levels
    row must come BEFORE the collapsed section opens.
  */
  const levels = src.indexOf('alert-levels-');
  const fold = src.indexOf('{open ? (');
  ok('the levels row exists', levels > 0);
  ok('and it is drawn before the collapsed section', levels > 0 && fold > 0 && levels < fold, { levels, fold });
  ok('so is the map', src.indexOf('alert-map-') < fold && src.indexOf('alert-map-') > 0);
  ok('so is the reward', src.indexOf('alert-rr-') < fold && src.indexOf('alert-rr-') > 0);
  ok('so is the availability sentence', src.indexOf('alert-availability-') < fold);

  ok('a level value is set at decision size', /<Num size=\{22\}/.test(src));
  ok('and its label is not 8.5 pixels any more', !src.includes('size={8.5}'));

  ok('the options family is offered an explanation first',
    src.indexOf('Explain this signal') > 0 && src.indexOf('Explain this signal') < src.indexOf('alert-cta-'));
  ok('what is collapsed is the evidence', src.includes('Show the evidence'));
}

/* ================================================================== */
/* F18 — the badge, and quiet vs unavailable                           */
/* ================================================================== */

console.log('\nF18 / the attention dot is shared state, not a one-shot fetch');
{
  const layout = read('src/app/(tabs)/_layout.tsx');
  ok('the tab bar no longer asks for alerts itself', !layout.includes('api.alertsSimple('));
  ok('it reads the shared attention instead', layout.includes('useAlertAttention'));
  ok('and only a CHECKED answer draws a dot', layout.includes("attention.status === 'ready'"));

  const attention = read('src/features/alerts/attention.ts');
  ok('an unreachable service reports unknown rather than quiet', attention.includes("'unavailable'"));
  ok('a foreground return re-asks', attention.includes('subscribeForeground'));

  const hooks = read('src/features/alerts/useAlerts.ts');
  ok('acting on an alert invalidates the dot at once', /alertsChanged\(true\)/.test(hooks));
  ok('and a fresh board invalidates it gently', /alertsChanged\(\)/.test(hooks));
}

console.log('\nF18 / a failed load is never a verified empty list');
{
  const board = read('src/features/alerts/AlertsBoard.tsx');
  ok('the board uses the shared capability vocabulary', board.includes('capabilityFor') && board.includes('CapabilityNotice'));
  ok('quiet is only reachable when something answered', /verified: answered && !failed/.test(board));
  ok('a failure has its own state with a retry', board.includes('alerts-failed'));
  ok('and held cards survive a failed refresh as stale', board.includes('alerts-stale'));
  ok('the old "empty list plus a grey error line" is gone',
    !/\{error \? <T size=\{11\} c=\{color\.muted\}/.test(board));
}

/* ================================================================== */
/* F15 — the desk, in plain English                                    */
/* ================================================================== */

console.log('\nF15 / the desk is quoted, never paraphrased');
{
  ok('a two-sentence quote comes back whole',
    firstSentences('It builds robots. It sells them to warehouses. It also does consulting.')
    === 'It builds robots. It sells them to warehouses.');
  // The three abbreviations that break a naive split on this corpus.
  ok('U.S. does not end a sentence',
    (firstSentences('It sells into the U.S. market and nowhere else.', 1) ?? '')
      .includes('U.S. market'));
  ok('a decimal does not either',
    (firstSentences('Revenue was $1.4bn last year and rising.', 1) ?? '').includes('$1.4bn'));
  ok('and neither does Inc.',
    (firstSentences('It was spun out of Palladyne Inc. in 2021 and listed later.', 1) ?? '')
      .includes('Palladyne Inc.'));
  ok('a block with no sentence end is returned whole, not cut',
    firstSentences('a fragment with no full stop') === 'a fragment with no full stop');
  ok('markdown emphasis is formatting, not words',
    (firstSentences('**Gross margin** rose. And again.', 1) ?? '') === 'Gross margin rose.');
  ok('nothing in, nothing out', firstSentences('') === null && firstSentences(null) === null);
}

const pick = (over: Record<string, unknown> = {}) => ({
  ticker: 'PDYN', company: 'Palladyne AI Corp.', theme: 'humanoid-robotics', themeRank: 1,
  pickDate: '2026-04-02', direction: 'long', horizon: '2q', status: 'open',
  grade: 'B+', gradeWhy: null, score: null, potentialMovePct: null, marketCap: null,
  entryPrice: null, entryBenchmark: null, returnPct: null, excessPct: null,
  outcome: null, gradedAt: null, revisitCount: null, revisitCheckedAt: null,
  news90d: null, nominatedBy: null,
  falsifier: 'The robotics contract does not convert into revenue by the next filing.',
  revisitWhen: null, catalysts: [], why: ['It is the only listed pure play in the theme.'],
  blockers: ['It has never made money.'], hypothesis: 'A listed company doing humanoid autonomy software.',
  thesis: REAL_PDYN_THESIS, unfinished: false,
  ...over,
}) as Parameters<typeof plainCompany>[0];

console.log('\nF15 / what it does, why watch it, what could change');
{
  const does = whatItDoes(pick());
  ok('what it does is read from the desk’s own section', does !== null);
  ok('and it is the write-up’s words, not the app’s',
    !!does && REAL_PDYN_THESIS.replace(/\s+/g, ' ').includes(does.text.split('.')[0]), does?.text);
  ok('the quote says where it came from', does?.source === "the desk's own write-up");

  ok('a write-up with no such section says so, rather than inventing one',
    whatItDoes(pick({ thesis: '## THE CALL\nBuy it.' })) === null);

  const why = whyWatched(pick({ thesis: null }));
  ok('with no thesis, the reason falls to what the screen counted',
    why?.text === 'It is the only listed pure play in the theme.', why);
  const hypothesisOnly = whyWatched(pick({ thesis: null, why: [] }));
  ok('and then to the description the search matched',
    hypothesisOnly?.source === 'the description the search matched', hypothesisOnly);
  ok('and then to nothing at all',
    whyWatched(pick({ thesis: null, why: [], hypothesis: null })) === null);

  const risk = whatCouldChange(pick());
  ok('the risk is the falsifier', !!risk && risk.text.startsWith('The robotics contract'));
  /*
    An unfinished write-up stores the brain's "no CALL line was emitted" marker
    in `falsifier`. That is a fact about the DOCUMENT and not a risk, and
    printing it under "what could change" would be the screen quoting a
    housekeeping note back at a member as an investment risk.
  */
  const unfinished = whatCouldChange(pick({ unfinished: true }));
  ok('an unfinished write-up’s falsifier is refused',
    unfinished?.text === 'It has never made money.', unfinished);
  ok('and with no blocker either, the absence stands',
    whatCouldChange(pick({ unfinished: true, blockers: [] })) === null);
}

console.log('\nF15 / an idea grade says the word "idea", and a horizon says months');
{
  ok('the grade line names itself', ideaGradeLine('B+') === 'Idea grade B+');
  ok('an ungraded one is not a blank', (ideaGradeLine(null) ?? '').includes('has not graded'));
  ok('the difference from a trade grade is stated',
    IDEA_GRADE_MEANS.includes('not a trade grade') && IDEA_GRADE_MEANS.includes('no entry'));

  ok('2q reads as six months', horizonPlain('2q').text.includes('six months') && horizonPlain('2q').known);
  ok('a missing horizon is said, not filled in',
    horizonPlain(null).known === false && horizonPlain(null).text.includes('No horizon'));

  const plain = plainCompany(pick());
  ok('the whole card comes back together',
    plain.gradeLine === 'Idea grade B+' && plain.horizon.known && plain.whatCouldChange !== null);
}

console.log('\nF15 / every watch state has plain English, and a caveat');
{
  const states = [
    'no_base', 'coiled', 'armed', 'triggered', 'failed', 'invalidated', 'extended', 'cooled', 'expired',
  ];
  const keys = Object.keys(WATCH_STATE_PLAIN).sort();
  ok('all nine states are explained', JSON.stringify(keys) === JSON.stringify([...states].sort()), keys);
  ok('none of the explanations is an instruction',
    Object.values(WATCH_STATE_PLAIN).every((s) => !/\b(buy|sell|should)\b/i.test(s)));
  ok('and the caveat says watching is not ordering',
    WATCH_STATE_CAVEAT.includes('None of them is an') && WATCH_STATE_CAVEAT.includes('order'));

  const ui = read('src/features/desk/ui.tsx');
  ok('the chip prints the desk’s English, not the state name',
    ui.includes('WATCH_STATE_COPY[state]}</T>') && !ui.includes("state.replace('_', ' ')"));

  const list = read('src/features/desk/Watchlist.tsx');
  ok('the row leads with the company name', list.includes('{row.company ?? row.ticker}'));
  ok('the grade on a row says "Idea grade"', /GradeMark[\s\S]{0,80}label/.test(list));
  ok('and the state is explainable on demand', list.includes('desk-state-sheet'));

  const understand = read('src/features/desk/Understand.tsx');
  ok('a company opens on what it does', understand.includes('desk-what-it-does'));
  ok('with why it is watched and what could change',
    understand.includes('desk-why-watched') && understand.includes('desk-what-could-change'));
  ok('it offers Watch company and Ask Kai', understand.includes('desk-watch-company') && understand.includes('desk-ask-kai'));
  ok('and says watching is not an order', understand.includes('desk-watch-caveat'));

  const pickScreen = read('src/app/desk/pick/[ticker].tsx');
  ok('the pick screen leads with it, before the instruments',
    pickScreen.indexOf('<UnderstandBusiness') > 0
    && pickScreen.indexOf('<UnderstandBusiness') < pickScreen.indexOf('<Strip'));
}

console.log(failures ? `\nsetup preview FAILED (${failures})` : '\nsetup preview OK');
process.exit(failures ? 1 : 0);
