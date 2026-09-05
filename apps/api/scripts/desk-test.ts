/**
 * The research desk mapping, without the database.
 *
 *   cd apps/api && npm test
 *
 * What lives here are the cases that would silently produce a plausible wrong
 * answer rather than an error — the ones that cost a full run to find in the
 * brain itself:
 *
 *   - an unfinished write-up read as a rejection, which is how sixteen
 *     truncated arguments got published as decisions on 4 September;
 *   - a company written up under three themes collapsing to the WRONG one, so
 *     the watchlist shows a stale grade against a current price;
 *   - a grade the brain never wrote appearing as a real grade, or a real one
 *     being dropped, which look identical downstream;
 *   - a watchlist ordered so that something you typed in outranks something
 *     the desk argued for.
 */
import {
  catalysts, grade, num, outcome, shapeWatchlist, state, strings, toPick,
  type PickRow, type StatusRow,
} from '../src/lib/desk/source.ts';
import { settlesOn } from '@shared/desk';

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

const NO_CALL_LINE =
  'no CALL line was emitted — the argument is stored, but the desk did not ' +
  'state a claim in the required form';

function pick(over: Partial<PickRow> = {}): PickRow {
  return {
    ticker: 'INOD', company: 'Innodata Inc', theme: 'Enterprise-Software-AI-Disruption',
    theme_rank: 1, pick_date: '2026-09-04', direction: 'long', horizon: '2q',
    status: 'active', idea_grade: 'B+', idea_grade_why: 'a real idea, well covered',
    score: 0.5973, market_cap: 1.2e9, falsifier: 'Q3 revenue growth below +40%',
    revisit_when: null, catalysts: [{ when: 'Q3 2026', what: 'earnings — settles the acceleration' }],
    why: ['revenue +57% YoY'], blockers: [], hypothesis: 'data preparation for model training',
    thesis: '## THE THEME\n\nSomething.',
    // The scoreboard, in the state every real row is in: stamped on the day,
    // nothing settled, because no write-up has reached its horizon yet.
    entry_price: 54.96, entry_benchmark: 773.17,
    return_pct: null, excess_pct: null, outcome: null, graded_at: null,
    revisit_count: 0, revisit_checked_at: null, news_90d: 7, nominated_by: null,
    ...over,
  };
}

function status(over: Partial<StatusRow> = {}): StatusRow {
  return {
    ticker: 'INOD', theme: null, state: 'no_base', state_since: '2026-09-04',
    price: 54.96, trigger_price: null, invalidation: null, source: 'pick',
    updated_at: '2026-09-04T15:00:00Z', pick_date: '2026-09-04', ...over,
  };
}

console.log('\ndesk — grades\n');
{
  eq('a grade the brain wrote comes through', grade('B+'), 'B+');
  eq('A+ is a grade, not a typo for A', grade('A+'), 'A+');
  // The brain could not parse A+ or B+ for a full run and stored null. A screen
  // that invented a grade to fill the gap would be worse than an empty one.
  eq('no grade means no grade, never a default', grade(null), null);
  eq('a grade off the scale is not promoted onto it', grade('F'), null);
  eq('and neither is a stray string', grade('excellent'), null);
}

console.log('\ndesk — an unfinished argument is not a decision\n');
{
  eq(
    'the truncation sentinel is recognised verbatim',
    toPick(pick({ falsifier: NO_CALL_LINE, direction: 'pass', status: 'rejected' })).unfinished,
    true,
  );
  eq(
    'a written pass is a decision and must not be flagged as unfinished',
    toPick(pick({ direction: 'pass', status: 'rejected', falsifier: 'the filings show no automotive contracts' })).unfinished,
    false,
  );
  eq('a call is never unfinished', toPick(pick()).unfinished, false);
}

console.log('\ndesk — the arrays the brain stores as jsonb\n');
{
  eq('reasons come through in order', strings(['a', 'b']), ['a', 'b']);
  eq('a null column is an empty list, not a crash', strings(null), []);
  eq('blank entries are dropped rather than rendered as bullets', strings(['a', '   ', '']), ['a']);
  eq(
    'a dated catalyst survives',
    catalysts([{ when: 'Q3 2026', what: 'earnings' }]),
    [{ when: 'Q3 2026', what: 'earnings' }],
  );
  // An undated catalyst is the brain refusing to invent a date. Rendering a
  // half-shaped object would put "undefined" on a screen.
  eq('a half-shaped catalyst is dropped, not half-rendered', catalysts([{ when: 'Q3 2026' }]), []);
  eq('a non-array is an empty list', catalysts('soon'), []);
}

console.log('\ndesk — states\n');
{
  eq('a known state comes through', state('triggered'), 'triggered');
  // A state the app does not know must not colour a row green by accident.
  eq('an unknown state falls back to no_base, never to a signal', state('exploding'), 'no_base');
  eq('a null state is no_base', state(null), 'no_base');
}

console.log('\ndesk — the watchlist join\n');
{
  // KLIC came back under three themes on 4 September. One row, newest argument.
  const { rows } = shapeWatchlist(
    [status({ ticker: 'KLIC', theme: null, source: 'pick' })],
    [
      pick({ ticker: 'KLIC', theme: 'AI-Packaging-Interconnect', pick_date: '2026-09-03', idea_grade: 'C' }),
      pick({ ticker: 'KLIC', theme: 'AI-Capex-Cycle', pick_date: '2026-09-04', idea_grade: 'B+' }),
      pick({ ticker: 'KLIC', theme: 'Domestic-Semiconductor-Reshoring', pick_date: '2026-09-04', idea_grade: 'B+' }),
    ],
  );
  eq('three write-ups for one company make one watchlist row', rows.length, 1);
  eq('and it carries the newest one, not whichever arrived first', rows[0].grade, 'B+');
  ok('the newest theme wins too', rows[0].theme !== 'AI-Packaging-Interconnect', rows[0].theme);

  const noPick = shapeWatchlist([status({ ticker: 'ZZZZ', source: 'manual' })], []);
  eq('a name you added has no grade rather than a fabricated one', noPick.rows[0].grade, null);
  eq('and is marked as yours', noPick.rows[0].source, 'manual');

  const ordered = shapeWatchlist(
    [
      status({ ticker: 'MANU', source: 'manual' }),
      status({ ticker: 'GOOD', source: 'pick' }),
      status({ ticker: 'BEST', source: 'pick' }),
    ],
    [
      pick({ ticker: 'GOOD', idea_grade: 'C' }),
      pick({ ticker: 'BEST', idea_grade: 'A+' }),
    ],
  );
  eq(
    'argued names come before typed ones, best idea first',
    ordered.rows.map((r) => r.ticker),
    ['BEST', 'GOOD', 'MANU'],
  );

  const stamped = shapeWatchlist(
    [
      status({ ticker: 'A', updated_at: '2026-09-04T10:00:00Z' }),
      status({ ticker: 'B', updated_at: '2026-09-04T15:00:00Z' }),
    ],
    [],
  );
  eq('as-of is the most recent reading, not the first row', stamped.asOf, '2026-09-04T15:00:00Z');
  eq('an unread watchlist has no as-of', shapeWatchlist([], []).asOf, null);
}

/*
 * The potential move.
 *
 * The brain does not compute it. The column does not exist, `select=*` does not
 * return it, and the app has a place waiting for it. The only thing that must
 * never happen is a number appearing there that came from somewhere else — the
 * score, the market cap, the theme's size — so these check that the field is
 * null unless the brain itself wrote a number into it.
 */
{
  console.log('\nthe potential move — a slot, not a guess');

  eq('a row with no such column reads as not measured',
    toPick(pick()).potentialMovePct, null);

  eq('the ranking score is never borrowed for it',
    toPick(pick({ score: 0.9812 })).potentialMovePct, null);

  eq('market cap is never turned into one',
    toPick(pick({ market_cap: 4.4e10, score: 0.77 })).potentialMovePct, null);

  eq('a null the brain wrote stays null',
    toPick(pick({ potential_move_pct: null })).potentialMovePct, null);

  eq('a number the brain wrote comes straight through',
    toPick(pick({ potential_move_pct: 34.5 })).potentialMovePct, 34.5);

  eq('a negative one comes through unchanged, because a short can have one',
    toPick(pick({ potential_move_pct: -18 })).potentialMovePct, -18);

  eq('anything that is not a number is refused rather than coerced',
    toPick(pick({ potential_move_pct: '34.5' as unknown as number })).potentialMovePct, null);

  eq('and the score still reaches the app as itself, unrenamed',
    toPick(pick({ score: 0.5973 })).score, 0.5973);
}

/*
 * THE SCOREBOARD.
 *
 * For an accumulation system this is the only thing that ever settles an
 * argument, and it is the part of the record most likely to be quietly filled
 * in from something else. The rule under test is the same rule that caught
 * "Move potential 0.597": a slot on this screen is filled by ITS OWN column or
 * it stays empty. The score is not a return. The market cap is not a return.
 * The entry price is not a benchmark. None of them may stand in.
 */
{
  console.log('\nthe scoreboard — a result, or nothing');

  eq('the entry the desk stamped comes through as it is',
    toPick(pick({ entry_price: 100.38 })).entryPrice, 100.38);

  eq('and so does the S&P it stamped beside it',
    toPick(pick({ entry_benchmark: 773.17 })).entryBenchmark, 773.17);

  // The one that would look right and be wrong. Both are prices in dollars on
  // the same day, so a mix-up produces a plausible screen and a false result.
  ok('the entry price never stands in for the benchmark',
    toPick(pick({ entry_price: 100.38, entry_benchmark: null })).entryBenchmark === null);
  ok('and the benchmark never stands in for the entry',
    toPick(pick({ entry_price: null, entry_benchmark: 773.17 })).entryPrice === null);

  eq('an unsettled call has no return',
    toPick(pick()).returnPct, null);
  eq('an unsettled call has no excess',
    toPick(pick()).excessPct, null);
  eq('an unsettled call has no verdict',
    toPick(pick()).outcome, null);

  eq('the ranking score is never read as a return',
    toPick(pick({ score: 0.5973 })).returnPct, null);
  eq('nor as the move against the market',
    toPick(pick({ score: 0.5973, market_cap: 4.4e10 })).excessPct, null);

  eq('a settled return comes through unchanged',
    toPick(pick({ return_pct: 41.2 })).returnPct, 41.2);
  eq('a loss keeps its sign',
    toPick(pick({ return_pct: -51.3, excess_pct: -60.4 })).excessPct, -60.4);

  // A name that went UP and still lost to the index. If the app ever showed
  // the raw return as the verdict it would call this a win.
  {
    const p = toPick(pick({ return_pct: 3.1, excess_pct: -9.4, outcome: 'miss' }));
    ok('a name that rose and still lost to the market reads as a miss',
      p.returnPct! > 0 && p.excessPct! < 0 && p.outcome === 'miss', p);
  }

  eq('hit is a verdict', outcome('hit'), 'hit');
  eq('miss is a verdict', outcome('miss'), 'miss');
  eq('a measured pass is neither', outcome('not_scored'), 'not_scored');
  eq('a word the brain does not write is not promoted to a verdict', outcome('won'), null);
  eq('and neither is an empty string', outcome(''), null);
  eq('no outcome is no outcome', outcome(null), null);

  eq('graded_at says when it was settled',
    toPick(pick({ graded_at: '2026-07-16T10:00:00Z' })).gradedAt, '2026-07-16T10:00:00Z');
  eq('and is null while it is still running', toPick(pick()).gradedAt, null);

  eq('a number written as a string is refused rather than parsed',
    num('41.2'), null);
  eq('and so is a NaN', num(Number.NaN), null);
  eq('but a real zero is a real zero, not a blank', num(0), 0);
}

/*
 * When a blank scoreboard fills.
 *
 * `settlesOn` restates ONE line of the brain's own settler — 1q is 91 days,
 * 2q is 182, 4q is 365, counted from the pick date. It exists so an empty
 * scoreboard can say why it is empty. It must never produce a date out of a
 * horizon the brain does not settle on.
 */
{
  console.log('\nwhen a blank scoreboard fills');

  eq('two quarters is 182 days from the pick date',
    settlesOn('2026-01-15', '2q'), '2026-07-16');
  eq('one quarter is 91', settlesOn('2026-08-19', '1q'), '2026-11-18');
  eq('four quarters is a year', settlesOn('2025-08-30', '4q'), '2026-08-30');

  // Twelve of the thirty-two write-ups have no horizon. The settler skips
  // them, so they can NEVER be settled, and the screen has to say so rather
  // than invent a date.
  eq('no horizon means no settlement date, ever', settlesOn('2026-09-03', null), null);
  eq('a horizon the settler does not know gets no date', settlesOn('2026-09-03', '3q'), null);
  eq('no pick date means no date', settlesOn(null, '2q'), null);
  eq('and a broken date is not guessed at', settlesOn('not a date', '2q'), null);
}

/*
 * Provenance.
 *
 * Three facts that are not judgements. The failure to avoid is presenting a
 * column nothing writes as if it were a measurement.
 */
{
  console.log('\nprovenance — attention, not evidence');

  eq('the news count comes through as the plain integer it is',
    toPick(pick({ news_90d: 9 })).news90d, 9);
  eq('a company with no coverage found reads as zero, which is a real reading',
    toPick(pick({ news_90d: 0 })).news90d, 0);
  eq('an uncounted one reads as nothing, not as zero',
    toPick(pick({ news_90d: null })).news90d, null);

  // Nothing in the brain increments this. Every row reads 0 and the screen
  // says why; what it must not do is turn 0 into a missing value.
  eq('a revisit count of zero survives as zero',
    toPick(pick({ revisit_count: 0 })).revisitCount, 0);
  eq('and a real count comes through',
    toPick(pick({ revisit_count: 3 })).revisitCount, 3);

  eq('nobody nominated it, so nobody is named',
    toPick(pick({ nominated_by: null })).nominatedBy, null);
  eq('an empty string is not a company',
    toPick(pick({ nominated_by: '   ' })).nominatedBy, null);
  eq('and a real nominator comes through',
    toPick(pick({ nominated_by: 'RMBS' })).nominatedBy, 'RMBS');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
