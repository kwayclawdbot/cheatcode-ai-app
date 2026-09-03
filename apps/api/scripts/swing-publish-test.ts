/**
 * SWING-3 — who a published setup reaches, without a database.
 *
 *   cd apps/api && npm test
 *
 * The pure half of `lib/swing/publish.ts`. The cases here are the ones that
 * would ship something plausible and wrong:
 *
 *   - a gate that lets the BACK CATALOGUE out. The ingest holds a 180-day
 *     window every morning and creates three rows; a fan-out that trusts "what
 *     the run touched" pushes 250 notifications at every user on the system,
 *     once, irreversibly. That is the failure this file exists for.
 *   - a short escaping as a live setup, which the ingest forbids two files away.
 *   - `min_grade` read as a preference rather than a floor, so a C-band pick
 *     reaches a user who asked for B and better.
 *   - an empty preference array read as "nothing" instead of "not narrowed",
 *     which silently mutes every user who ever cleared a filter.
 */
import {
  GRADE_RANK,
  DEFAULT_MIN_GRADE,
  BODY_MAX,
  etDateOf,
  matchesPrefs,
  notificationFor,
  publishable,
  truncate,
  type PublishableSetup,
  type SetupPrefs,
} from '../src/lib/swing/publish.ts';

let pass = 0;
let fail = 0;

function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`);
  }
}
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const TODAY = '2026-09-02';

function setup(over: Partial<PublishableSetup> = {}): PublishableSetup {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    symbol: 'PFE',
    mode: 'swing',
    intent: 'buy_to_open',
    state: 'ready',
    grade_band: 'B',
    grade_display: 'B+',
    score: 82,
    thesis_plain: 'Cyclical rotation is lifting the group and volume came in behind the move.',
    thesis_technical: null,
    quote_snapshot: { et_date: TODAY },
    ...over,
  };
}

function prefs(over: Partial<SetupPrefs> = {}): SetupPrefs {
  return {
    user_id: 'u1',
    enabled: null,
    min_grade: null,
    modes: null,
    intents: null,
    symbols_include: null,
    symbols_exclude: null,
    ...over,
  };
}

const why = (d: ReturnType<typeof publishable>) => (d.ok ? null : d.reason);

/* ---- the safety gate ------------------------------------------------ */
{
  console.log('\npublishable — the gate that stands between a back catalogue and every phone');

  ok('today\'s ready long passes', publishable(setup(), { todayEt: TODAY }).ok);

  eq('yesterday\'s pick is refused by date',
    why(publishable(setup({ quote_snapshot: { et_date: '2026-09-01' } }), { todayEt: TODAY })),
    'not_todays_pick');

  eq('a pick with no et_date at all is refused, not defaulted to today',
    why(publishable(setup({ quote_snapshot: {} }), { todayEt: TODAY })),
    'not_todays_pick');

  eq('a null quote_snapshot is refused too',
    why(publishable(setup({ quote_snapshot: null }), { todayEt: TODAY })),
    'not_todays_pick');

  eq('an expired setup is refused', why(publishable(setup({ state: 'expired' }), { todayEt: TODAY })), 'not_ready');

  // The ingest already forces every short to `expired`. This is the second lock
  // on the same door, because that fact lives in another file.
  eq('a short is refused on its own terms, not just via state',
    why(publishable(setup({ intent: 'sell_short' }), { todayEt: TODAY })),
    'not_a_long');

  eq('a day-trade setup is not this pipe\'s to announce',
    why(publishable(setup({ mode: 'day_trade' }), { todayEt: TODAY })),
    'not_swing');

  eq('an ungraded pick has no medallion to show, so nothing to announce',
    why(publishable(setup({ grade_band: null }), { todayEt: TODAY })),
    'ungraded');

  eq('et_date reads out of the snapshot', etDateOf(setup()), TODAY);
  eq('and is null when the key is not a string', etDateOf(setup({ quote_snapshot: { et_date: 20260902 } })), null);
}

/* ---- per-user matching ---------------------------------------------- */
{
  console.log('\nmatchesPrefs — what each person asked to hear about');

  ok('a user with no prefs row at all hears about a B', matchesPrefs(setup(), prefs()).ok);

  eq('enabled:false is a decision and it is honoured',
    why(matchesPrefs(setup(), prefs({ enabled: false }))), 'prefs_disabled');

  ok('enabled:null is not a decision — it is a user who never had a row',
    matchesPrefs(setup(), prefs({ enabled: null })).ok);

  // min_grade is a FLOOR. A is the best band.
  ok('A beats B in the ranking', GRADE_RANK.A > GRADE_RANK.B && GRADE_RANK.B > GRADE_RANK.C);
  eq('a C-band pick does not reach a user who asked for B and better',
    why(matchesPrefs(setup({ grade_band: 'C' }), prefs({ min_grade: 'B' }))), 'below_min_grade');
  ok('an A-band pick reaches that same user', matchesPrefs(setup({ grade_band: 'A' }), prefs({ min_grade: 'B' })).ok);
  // 0028: the floor nobody chose is C, not B. Band C is 46% of every pick the
  // scanner ships, and the letter is a percentile of a score ENGINE-9 measured
  // as no better than a coin toss at ranking outcomes — so a default floor was
  // hiding half the product behind a number that does not forecast.
  eq('the floor a user who never said anything gets is C', DEFAULT_MIN_GRADE, 'C');
  ok('so a C-band pick DOES reach a user with no preference set',
    matchesPrefs(setup({ grade_band: 'C' }), prefs()).ok);
  ok('and one whose row exists but was never narrowed',
    matchesPrefs(setup({ grade_band: 'C' }), prefs({ enabled: true, min_grade: null })).ok);
  ok('a person who chose B is still honoured — the default changed, the floor did not go away',
    !matchesPrefs(setup({ grade_band: 'C' }), prefs({ min_grade: 'B' })).ok);
  ok('a user who explicitly asked for everything gets the C',
    matchesPrefs(setup({ grade_band: 'C' }), prefs({ min_grade: 'C' })).ok);
  ok('and one who asked for A only still gets no C',
    !matchesPrefs(setup({ grade_band: 'C' }), prefs({ min_grade: 'A' })).ok);

  eq('a swing setup does not reach someone who only wants day trades',
    why(matchesPrefs(setup(), prefs({ modes: ['day_trade'] }))), 'mode_not_wanted');
  ok('and does reach someone who wants both', matchesPrefs(setup(), prefs({ modes: ['day_trade', 'swing'] })).ok);

  eq('intents are filtered the same way',
    why(matchesPrefs(setup(), prefs({ intents: ['sell_short'] }))), 'intent_not_wanted');

  eq('an excluded symbol is excluded',
    why(matchesPrefs(setup(), prefs({ symbols_exclude: ['PFE'] }))), 'symbol_excluded');
  ok('case does not rescue an exclusion',
    !matchesPrefs(setup(), prefs({ symbols_exclude: ['pfe'] })).ok);

  eq('an include list that omits the symbol excludes it',
    why(matchesPrefs(setup(), prefs({ symbols_include: ['NVDA'] }))), 'symbol_not_in_include_list');
  ok('an include list that names it lets it through',
    matchesPrefs(setup(), prefs({ symbols_include: ['nvda', 'pfe'] })).ok);
  ok('exclusion wins over inclusion when a symbol is in both',
    !matchesPrefs(setup(), prefs({ symbols_include: ['PFE'], symbols_exclude: ['PFE'] })).ok);

  // An emptied filter is a filter that narrows nothing. Reading [] as "match
  // nothing" would mute a user who cleared a list, silently and permanently.
  ok('an empty modes array narrows nothing', matchesPrefs(setup(), prefs({ modes: [] })).ok);
  ok('an empty include list narrows nothing', matchesPrefs(setup(), prefs({ symbols_include: [] })).ok);
}

/* ---- the copy -------------------------------------------------------- */
{
  console.log('\nnotificationFor — what it actually says');

  const n = notificationFor(setup());
  ok('the title leads with the symbol', n.titlePlain.startsWith('PFE'));
  ok('the body is the plain thesis', n.bodyPlain.startsWith('Cyclical rotation'));
  eq('it routes to the setup, not the tab', n.route, '/setup/aaaaaaaa-0000-4000-8000-000000000001');
  eq('the payload carries the id a deep link needs', n.payload.setup_id, setup().id);

  // "Gold never means profit" (bands.ts). A push that leads with a letter is
  // exactly where a quality mark gets read as a forecast.
  ok('the letter is not in the title', !/\bA−|\bB\+|Grade/.test(n.titlePlain));
  ok('nor in the body', !/Grade/.test(n.bodyPlain));
  ok('but it still rides along for the card', n.payload.grade_display === 'B+');

  const noThesis = notificationFor(setup({ thesis_plain: null, thesis_technical: null }));
  ok('a pick with no thesis still says something true',
    /Nothing has been bought or sold/.test(noThesis.bodyPlain));

  const fallback = notificationFor(setup({ thesis_plain: null, thesis_technical: 'GAP & GO, 15x volume' }));
  ok('and falls back to the technical thesis first', fallback.bodyPlain.startsWith('GAP & GO'));

  const long = 'x'.repeat(400);
  ok('a long body is cut to the push budget', truncate(long, BODY_MAX).length <= BODY_MAX);
  eq('a short body is left alone', truncate('all good', BODY_MAX), 'all good');
  ok('the cut prefers a word boundary',
    truncate(`${'word '.repeat(40)}end`, 60).endsWith('…') && !/ …$/.test(truncate(`${'word '.repeat(40)}end`, 60)));
  eq('whitespace is collapsed on the way through', truncate('a   b\n c', 50), 'a b c');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
