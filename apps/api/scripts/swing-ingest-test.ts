/**
 * SWING-1 — the mapping, without either database.
 *
 *   cd apps/api && npm test
 *
 * This covers the parts that are pure: what a pick IS, what the percentile
 * does, and which of the scanner's numbers are allowed to become a scorecard
 * component. It is NOT the gate — the gate is `swing-ingest-proof.ts` against
 * the real source, plus a real browser. What lives here are the cases that
 * would silently produce a plausible wrong number:
 *
 *   - a pick key that disagrees with `alert_outcomes.py` by one ET hour, which
 *     would make the two systems count different numbers of picks;
 *   - a percentile that is really a rank, so "top decile" quietly becomes
 *     "top half";
 *   - a scanner zero read as a measurement instead of as a missing one, which
 *     turns "I have no read" into "it scored badly";
 *   - a fingerprint that trips on Postgres spelling a timestamp its own way,
 *     which would rewrite every row on every run.
 */
import {
  SWING_LONG_TYPES,
  INGESTED_TYPES,
  EXCLUDED_TYPES,
  isReadableType,
  thesisComposed,
  modeOf,
  familyPerformanceIndex,
  assertRecordOnly,
  anchorDateFor,
  bandSplit,
  dedupePicks,
  entryQualityFromRsi,
  etDateFor,
  familyOf,
  familyPerformance,
  fingerprint,
  outcomeFor,
  SWING_SHORT_TYPES,
  assertHistoryOnly,
  gradeBandFromPercentile,
  gradeDisplayFromScore,
  isHistoryOnlyType,
  scoreFromPercentile,
  isIngestibleType,
  medallionFamilyFor,
  percentileRank,
  pickKey,
  plusSessions,
  setupFor,
  setupIdFor,
  uuidv5,
  validUntilFor,
  type ScannerAlert,
} from '../src/lib/swing/ingest.ts';

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

function alert(over: Partial<ScannerAlert> = {}): ScannerAlert {
  return {
    id: 1,
    ticker: 'NVDA',
    alert_type: 'kai_long',
    alert_price: 100,
    breakout_score: 90,
    quality_score: 15,
    catalyst_score: 3,
    flow_score: 8,
    volume_ratio: 1.4,
    rsi_at_alert: 55,
    setup_label: 'CONTINUATION',
    detected_pattern: 'CONTINUATION',
    humanized_message: 'A continuation.',
    sector: 'Technology',
    sector_stance: 'bullish',
    catalyst_type: 'news',
    scan_metadata: null,
    stop_price: null,
    pattern_target: null,
    next_resistance: null,
    sent_at: '2026-06-10T14:30:00+00:00',
    market_session: 'regular',
    ...over,
  };
}

console.log('\nidentity — the port of alert_outcomes.py');
{
  // 2026-06-10 14:30Z is 10:30 ET the same day.
  eq('ET date of a mid-session UTC stamp', etDateFor('2026-06-10T14:30:00+00:00'), '2026-06-10');
  // 01:30Z on the 11th is 21:30 ET on the 10th — the ET date, not the UTC one.
  eq('ET date rolls back over midnight UTC', etDateFor('2026-06-11T01:30:00+00:00'), '2026-06-10');
  eq(
    'pick key is (TICKER, ET date, lowercased type)',
    pickKey({ ticker: 'nvda', sent_at: '2026-06-11T01:30:00+00:00', alert_type: 'KAI_LONG' }),
    'NVDA|2026-06-10|kai_long',
  );

  const picks = dedupePicks([
    alert({ id: 9, sent_at: '2026-06-10T14:30:00+00:00' }),
    alert({ id: 4, sent_at: '2026-06-10T15:30:00+00:00' }),
    alert({ id: 7, ticker: 'AMD' }),
  ]);
  eq('recipient duplicates collapse to one pick per key', picks.size, 2);
  eq('the canonical row is the lowest id, so a re-run does not flap', picks.get('NVDA|2026-06-10|kai_long')?.id, 4);
}

console.log('\nfamilies — everything is imported, exactly one may be live');
{
  ok('kai_long is the live family', isIngestibleType('kai_long'));
  eq('and it is the only one', SWING_LONG_TYPES, ['kai_long']);

  // The trap the brief's own `kai_long%` filter walks into. Both of these are
  // five-minute opening-range breaks; grading them as swing would put a
  // 5-SESSION expiry on an intraday idea and measure a horizon it never
  // claimed. They are imported — as records, carrying `mode: 'day_trade'`.
  eq('kai_long_or_break is intraday, not swing', familyOf('kai_long_or_break'), 'intraday_long');
  eq('kai_long_pullback_or_break is intraday, not swing', familyOf('kai_long_pullback_or_break'), 'intraday_long');
  ok('so a kai_long% prefix filter would be wrong twice out of three', !isIngestibleType('kai_long_or_break') && !isIngestibleType('kai_long_pullback_or_break'));
  eq('kai_orb_bullish is intraday too', familyOf('kai_orb_bullish'), 'intraday_long');
  eq('an intraday family carries the day-trade horizon', modeOf('kai_orb_bullish'), 'day_trade');
  eq('a swing family carries the swing horizon', modeOf('kai_long'), 'swing');

  // Owner ruling 2026-09-03: every family the product has sent is imported for
  // the RECORD. Live is still `kai_long` and nothing else.
  eq('kai_short is the morning short, kept for History', familyOf('kai_short'), 'swing_short');
  ok('and it is never gradeable or live', !isIngestibleType('kai_short'));
  ok('but it is readable, for the back catalogue', isHistoryOnlyType('kai_short'));
  eq('exactly one short type is the morning short', SWING_SHORT_TYPES, ['kai_short']);
  // SWING-5: a pick nobody received is not history. Every kai_short_shadow row
  // is an unsent shadow short — empty message, null stop, null target — so it
  // is declined at the family map rather than imported as a blank card.
  eq('kai_short_shadow is never broadcast, so it is not a record either', familyOf('kai_short_shadow'), 'other');
  ok('and it is not imported', !isHistoryOnlyType('kai_short_shadow'));
  ok('nor readable, so retireForeignFamilies removes the rows an earlier run wrote', !isReadableType('kai_short_shadow'));
  eq('but it is named, not forgotten', [...EXCLUDED_TYPES], ['kai_short_shadow']);
  eq('kai_orb_bearish is the intraday short', familyOf('kai_orb_bearish'), 'intraday_short');
  eq('the pre-April breakout family is imported too', familyOf('breakout'), 'legacy_long');
  eq('so is pattern', familyOf('pattern'), 'legacy_long');
  eq('and breakdown, on the short side', familyOf('breakdown'), 'legacy_short');
  ok('no short is ever gradeable', !['kai_short', 'kai_orb_bearish', 'breakdown', 'short_idea'].some(isIngestibleType));
  ok(
    'nor is any non-kai_long long',
    !['breakout', 'pattern', 'watchlist_swing', 'long_idea', 'premarket', 'orb', 'intraday', 'kai_orb_bullish'].some(isIngestibleType),
  );
  ok(
    'but every one of them is imported',
    ['breakout', 'pattern', 'watchlist_swing', 'long_idea', 'premarket', 'orb', 'intraday', 'kai_orb_bullish',
     'kai_orb_bearish', 'breakdown', 'short_idea', 'kai_long_or_break', 'kai_long_pullback_or_break'].every(isHistoryOnlyType),
  );
  eq('fifteen families, no more and no fewer', INGESTED_TYPES.length, 15);

  ok('an unrecognised type is declined rather than assumed', !isIngestibleType('kai_something_new'));
  eq('and classified as other', familyOf('kai_something_new'), 'other');
  ok('so it is not imported either — a new family is a decision, not a match', !isHistoryOnlyType('kai_something_new'));
  ok('a null type is out', !isIngestibleType(null));
}

console.log('\nthe record families — imported, and structurally unable to be live');
{
  const orb = setupFor({
    alert: alert({ alert_type: 'kai_orb_bullish', sent_at: '2026-06-10T13:45:00+00:00' }),
    key: 'NVDA|2026-06-10|kai_orb_bullish',
    percentile: 99,
    now: new Date('2026-06-10T14:00:00Z'),
  });
  eq('an opening-range break is a day trade', orb.mode, 'day_trade');
  eq('it dies at its own close, not five sessions on', orb.valid_until, '2026-06-10T20:00:00.000Z');
  eq('it is expired the moment it is written', orb.state, 'expired');
  eq('it carries no score even at the 99th percentile', orb.score, null);
  eq('no band', orb.grade_band, null);
  eq('and no letter', orb.grade_display, null);
  eq('the row names its own family', (orb.score_components as Record<string, unknown>).family, 'intraday_long');
  eq('and says it is not a live one', (orb.score_components as Record<string, unknown>).live_family, false);
  eq('it is still a long', orb.intent, 'buy_to_open');

  const legacy = setupFor({
    alert: alert({ alert_type: 'breakout', sent_at: '2026-03-10T13:45:00+00:00' }),
    key: 'NVDA|2026-03-10|breakout',
    percentile: 99,
    now: new Date('2026-03-10T14:00:00Z'),
  });
  eq('a pre-April breakout keeps the swing horizon it claimed', legacy.mode, 'swing');
  eq('but is still only a record', legacy.state, 'expired');
  eq('and still ungraded', legacy.score, null);

  let threw = false;
  try { assertRecordOnly({ ...orb, state: 'ready' }); } catch { threw = true; }
  ok('a record that somehow became live stops the run', threw);
  threw = false;
  try { assertRecordOnly({ ...orb, score: 96 }); } catch { threw = true; }
  ok('a record that somehow got graded stops the run', threw);
  assertRecordOnly(orb);
  ok('a well-formed record passes', true);
}

console.log('\nthe performance line is the card\'s OWN family');
{
  const rows = [
    { alert_id: 1, direction: 'long', alert_type: 'kai_long', anchor_date: '2026-06-01', win_5d: true, gain_5d_pct: 4, is_primary: true },
    { alert_id: 2, direction: 'long', alert_type: 'kai_long', anchor_date: '2026-06-02', win_5d: true, gain_5d_pct: 3, is_primary: true },
    { alert_id: 3, direction: 'long', alert_type: 'kai_orb_bullish', anchor_date: '2026-06-03', win_5d: false, gain_5d_pct: -2, is_primary: true },
    { alert_id: 4, direction: 'long', alert_type: 'kai_orb_bullish', anchor_date: '2026-06-04', win_5d: false, gain_5d_pct: -1, is_primary: true },
  ];
  const index = familyPerformanceIndex(rows);
  eq('the live long family counts only its own picks', index.get('swing_long')?.n, 2);
  eq('at its own win rate', index.get('swing_long')?.win_pct, 100);
  eq('the intraday family counts only its own', index.get('intraday_long')?.n, 2);
  eq('and does not borrow the long family\'s number', index.get('intraday_long')?.win_pct, 0);
  ok(
    'an intraday line names the horizon it is NOT measured at',
    /not the one they claimed/.test(index.get('intraday_long')?.plain ?? ''),
  );
  ok(
    'a swing line makes no such claim, because +5 sessions is its own horizon',
    !/not the one they claimed/.test(index.get('swing_long')?.plain ?? ''),
  );
  eq('a family with no graded picks gets no line rather than a zero', index.get('legacy_short'), undefined);
}

console.log('\nthe percentile — not the raw 31..190 score');
{
  // Ten picks, scores 0..9, all inside the window.
  const pop = Array.from({ length: 10 }, (_, i) => ({ date: '2026-06-10', score: i }));
  eq('the lowest score sits at 0', percentileRank(0, '2026-06-10', pop), 0);
  eq('the highest score sits at 90 — the top decile, not 100', percentileRank(9, '2026-06-10', pop), 90);
  eq('the median sits at 50', percentileRank(5, '2026-06-10', pop), 50);

  // Ties take the floor of their group rather than being split.
  const tied = [
    { date: '2026-06-10', score: 1 }, { date: '2026-06-10', score: 5 },
    { date: '2026-06-10', score: 5 }, { date: '2026-06-10', score: 9 },
  ];
  eq('ties take the floor of their group', percentileRank(5, '2026-06-10', tied), 25);

  // The window is trailing: nothing after the pick, nothing older than 180 days.
  const drift = [
    { date: '2025-01-01', score: 1000 },   // far outside
    { date: '2026-06-20', score: 1000 },   // in the future
    { date: '2026-06-01', score: 10 },
    { date: '2026-06-10', score: 50 },
  ];
  eq('the future and the far past are excluded', percentileRank(50, '2026-06-10', drift), 50);
  eq('an empty window has no percentile rather than a zero', percentileRank(50, '2026-06-10', []), null);

  eq('A is the top decile', gradeBandFromPercentile(90), 'A');
  eq('just under the top decile is a B', gradeBandFromPercentile(89.9), 'B');
  eq('B is the upper half', gradeBandFromPercentile(50), 'B');
  eq('C is below the median', gradeBandFromPercentile(49.9), 'C');
  eq('no percentile means no letter, not a C', gradeBandFromPercentile(null), null);

  // The rescale, owner ruling: the rank is a rank, the score is a position on
  // the band ladder. One straight line, so order is preserved exactly.
  eq('the worst pick sits at the bottom of C, not below the ladder', scoreFromPercentile(0), 60);
  eq('the median sits at 80', scoreFromPercentile(50), 80);
  eq('the top decile starts at 96', scoreFromPercentile(90), 96);
  eq('the best pick is 100', scoreFromPercentile(100), 100);
  ok('nothing graded can fall into the grey band any more', [0, 1, 17, 49, 99].every((p) => (scoreFromPercentile(p) as number) >= 60));
  ok('and the rescale is monotone, so it never reorders two picks',
    [0, 7, 30, 55, 80, 99.9].every((p, i, arr) => i === 0 || (scoreFromPercentile(p) as number) > (scoreFromPercentile(arr[i - 1]) as number)));

  // The letter comes off the SCORE, so it agrees with the ring bands.ts draws.
  eq('96 reads as an A, matching the gold ring', gradeDisplayFromScore(96), 'A');
  eq('87 reads as A minus, matching gold restrained', gradeDisplayFromScore(87), 'A\u2212');
  eq('82 reads as B plus, matching violet', gradeDisplayFromScore(82), 'B+');
  eq('74 reads as B', gradeDisplayFromScore(74), 'B');
  eq('62 reads as C, matching amber', gradeDisplayFromScore(62), 'C');
  ok('the minus is U+2212, per displayGrade', (gradeDisplayFromScore(87) ?? '').includes('\u2212'));
  ok('no score means no letter', gradeDisplayFromScore(null) === null);

  // The letter and the ring must never disagree — a card reading "Grade B" in a
  // gold ring whose own screen-reader text says "top quality" is the failure
  // this pairing exists to prevent.
  ok('every score renders a letter whose family is the ring\u2019s family',
    [60, 65, 70, 79, 80, 84, 85, 89, 90, 100].every((sc) => {
      const letter = gradeDisplayFromScore(sc) ?? '';
      const fam = medallionFamilyFor(sc);
      if (fam === 'gold') return letter === 'A';
      if (fam === 'gold_restrained') return letter === 'A\u2212';
      if (fam === 'violet') return letter === 'B+';
      if (fam === 'violet_graphite') return letter === 'B';
      return letter === 'C';
    }));

  // The A/B/C split — the FILTER value — is untouched by the rescale.
  const uniform = Array.from({ length: 100 }, (_, i) => ({ score: scoreFromPercentile(i), grade_band: gradeBandFromPercentile(i) }));
  const split = bandSplit(uniform);
  eq('a uniform percentile still puts exactly a tenth in A', split.letters.A, 10);
  eq('and four tenths in B', split.letters.B, 40);
  eq('and half in C', split.letters.C, 50);
  eq('and nothing lands in the grey band', split.families.neutral, 0);
  eq('the raw scanner score would have been read as gold; the percentile is not', medallionFamilyFor(124), 'gold');
}

console.log('\nthe scorecard — the scanner\'s real components, and only those');
{
  const c = setupFor({ alert: alert(), key: 'k', percentile: 80, now: new Date('2026-06-10T00:00:00Z') }).score_components;
  eq('quality_score 0..20 becomes trend on 0..100', c.trend, 75);
  eq('catalyst_score 0..12 becomes catalyst on 0..100', c.catalyst, 25);
  eq('a bullish sector stance becomes market', c.market, 85);
  eq('RSI 55 is the best entry band docs/17 measured', c.entry_quality, 92);
  ok('risk_reward is absent so grade.ts derives it from the plan', !('risk_reward' in c));

  // The pullback_or_break subfamily writes 0 for every score it did not compute.
  const blank = setupFor({
    alert: alert({ quality_score: 0, catalyst_score: 0, flow_score: 0, rsi_at_alert: 0, sector_stance: null, catalyst_type: null }),
    key: 'k', percentile: 80, now: new Date('2026-06-10T00:00:00Z'),
  }).score_components;
  ok('a scanner zero is a MISSING read, not a bad one — trend is absent', !('trend' in blank));
  ok('…and so is entry_quality', !('entry_quality' in blank));
  ok('…and so is catalyst', !('catalyst' in blank));
  ok('…and so is market', !('market' in blank));

  ok('RSI is inverted, per the monotone result in docs/17 §1', entryQualityFromRsi(45) > entryQualityFromRsi(75));
  ok('RSI 70+ is the worst band', entryQualityFromRsi(72) < entryQualityFromRsi(65));
  ok('and 80+ is worse still', entryQualityFromRsi(85) < entryQualityFromRsi(72));
}

console.log('\nthe honest performance line — §4');
{
  const rows = [
    { alert_id: 1, direction: 'long', alert_type: 'kai_long', anchor_date: '2026-06-01', win_5d: true, gain_5d_pct: 4, is_primary: true },
    { alert_id: 2, direction: 'long', alert_type: 'kai_long', anchor_date: '2026-06-02', win_5d: false, gain_5d_pct: -2, is_primary: true },
    { alert_id: 3, direction: 'short', alert_type: 'kai_short', anchor_date: '2026-06-03', win_5d: true, gain_5d_pct: 3, is_primary: true },
    { alert_id: 4, direction: 'long', alert_type: 'kai_long_or_break', anchor_date: '2026-06-04', win_5d: true, gain_5d_pct: 3, is_primary: true },
    { alert_id: 5, direction: 'long', alert_type: 'kai_long', anchor_date: '2026-06-05', win_5d: true, gain_5d_pct: 1, is_primary: false },
  ];
  const perf = familyPerformance(rows)!;
  eq('shorts, the intraday families and non-primary rows are all excluded', perf.n, 2);
  eq('the win rate is pick-level at +5 sessions', perf.win_pct, 50);
  eq('as_of is the last resolved pick, not the wall clock', perf.as_of, '2026-06-02');
  ok('the line says the number is history, not a forecast', /not what will/.test(perf.plain));
  ok('and says what it actually measured — close to close, no stop, no target', /close to close/.test(perf.plain) && /no stop and no target/.test(perf.plain));
  ok('and refuses to call it a managed trade', /not the result of a trade anyone managed/.test(perf.plain));
  ok('and it disowns the medallion explicitly', /grade says nothing about it/.test(perf.plain));
  eq('no graded rows means no line rather than a zero', familyPerformance([]), null);
}

console.log('\nsessions and expiry');
{
  eq('a mid-session alert is actionable that day', anchorDateFor('2026-06-10T14:30:00+00:00'), '2026-06-10');
  eq('at or after 16:00 ET it is the next session', anchorDateFor('2026-06-10T20:00:00+00:00'), '2026-06-11');
  // 2026-06-13 is a Saturday.
  eq('a weekend alert rolls to Monday', anchorDateFor('2026-06-13T14:30:00+00:00'), '2026-06-15');
  eq('five sessions skips the weekend', plusSessions('2026-06-10', 5), '2026-06-17');
  ok('valid_until is a timestamp on the fifth session', validUntilFor('2026-06-10').startsWith('2026-06-17T'));
}

console.log('\nidempotency');
{
  eq(
    'the same pick key always yields the same setup id',
    setupIdFor('NVDA|2026-06-10|kai_long'),
    setupIdFor('NVDA|2026-06-10|kai_long'),
  );
  ok('different picks get different ids', setupIdFor('NVDA|2026-06-10|kai_long') !== setupIdFor('AMD|2026-06-10|kai_long'));
  ok('the id is a v5 uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(setupIdFor('x')));
  // RFC 4122 §Appendix B: v5 of 'www.example.org' in the DNS namespace.
  eq(
    'uuidv5 matches the RFC test vector',
    uuidv5('www.example.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
    '74738ff5-5367-5958-9aee-98fffdcd1876',
  );

  const row = setupFor({ alert: alert(), key: 'NVDA|2026-06-10|kai_long', percentile: 80, now: new Date('2026-06-10T00:00:00Z') });
  const asPostgresReturnsIt = {
    ...row,
    // What PostgREST actually hands back: numeric as a string, timestamptz with
    // an offset instead of a Z, and the columns this ingest does not own.
    score: (row.score as number).toFixed(1),
    valid_until: row.valid_until.replace('.000Z', '+00:00'),
    updated_at: new Date().toISOString(),
    discussion_room_id: null,
  };
  eq(
    'a row read back from Postgres fingerprints identically — the second run writes nothing',
    fingerprint(asPostgresReturnsIt),
    fingerprint(row as unknown as Record<string, unknown>),
  );
  ok(
    'a changed score does change the fingerprint',
    fingerprint({ ...row, score: 81 } as unknown as Record<string, unknown>) !== fingerprint(row as unknown as Record<string, unknown>),
  );
}

console.log('\nthe setup row');
{
  const s = setupFor({ alert: alert(), key: 'NVDA|2026-06-10|kai_long', percentile: 95, now: new Date('2026-06-10T00:00:00Z') });
  eq('every ingested pick is a swing setup', s.mode, 'swing');
  eq('and long', s.intent, 'buy_to_open');
  eq('the published trigger is the entry condition', (s.entry_condition as { price: number }).price, 100);
  eq('the scanner publishes no stop for this family, so there is none', s.stop, null);
  eq('and no targets', s.targets, []);
  eq('the humanized message is the plain thesis', s.thesis_plain, 'A continuation.');
  ok('volume and pattern are read as prose, not scored', /volume 1\.4x/.test(s.thesis_technical ?? ''));
  ok('the raw scanner score is kept for provenance', s.score_components.raw_breakout_score === 90);
  eq('a live pick is ready', s.state, 'ready');
  eq('a pick past its window is expired', setupFor({ alert: alert(), key: 'k', percentile: 95, now: new Date('2027-01-01T00:00:00Z') }).state, 'expired');
}

console.log('\nshorts \u2014 History yes, Active no, and it is real in the data');
{
  const shortAlert = alert({ alert_type: 'kai_short', quality_score: 15, rsi_at_alert: 78 });
  const row = setupFor({ alert: shortAlert, key: 'NVDA|2026-06-10|kai_short', percentile: 95, now: new Date('2026-06-10T00:00:00Z') });

  eq('a short is written short', row.intent, 'sell_short');
  // The picks are from June; "now" is the day after. A long here would be READY.
  eq('a long on the same day would be live', setupFor({ alert: alert(), key: 'k', percentile: 95, now: new Date('2026-06-10T00:00:00Z') }).state, 'ready');
  eq('a short on the same day is expired anyway \u2014 it can never hold a live state', row.state, 'expired');
  eq('and it carries no score', row.score, null);
  eq('no band', row.grade_band, null);
  eq('no letter', row.grade_display, null);
  ok('so it renders as the ungraded medallion, which is what grey now means', medallionFamilyFor(row.score) === 'neutral');
  ok('no long-calibrated component is applied to it', !('trend' in row.score_components) && !('entry_quality' in row.score_components));
  eq('the row says which side it was', row.score_components.direction, 'short');
  ok('and the invalidation copy is not long-side', /close above/.test(String((row.invalidation as { plain?: string } | null)?.plain ?? 'close above')));

  // The guard is the mechanism, not a filter someone has to remember.
  assertHistoryOnly(row);
  let threw = false;
  try { assertHistoryOnly({ ...row, state: 'ready' }); } catch { threw = true; }
  ok('a short that somehow became live stops the run', threw);
  threw = false;
  try { assertHistoryOnly({ ...row, score: 96 }); } catch { threw = true; }
  ok('a short that somehow got graded stops the run', threw);

  // The outcome must read as a short, and the number must not be flipped twice.
  const shortOutcome = outcomeFor({
    alert_id: 1, direction: 'short', alert_type: 'kai_short', anchor_date: '2026-06-10',
    win_5d: true, gain_5d_pct: 6.8, is_primary: true,
  })!;
  eq('the position return is kept as the grader recorded it', shortOutcome.gain_5d_pct, 6.8);
  ok('but the sentence describes the STOCK falling, not rising', /stock closed 6\.8% below/.test(shortOutcome.plain));
  ok('and names it as a short that was right', /short was right/.test(shortOutcome.plain));
  const shortLoss = outcomeFor({
    alert_id: 2, direction: 'short', alert_type: 'kai_short', anchor_date: '2026-06-10',
    win_5d: false, gain_5d_pct: -4.2, is_primary: true,
  })!;
  ok('a losing short says the stock went up', /stock closed 4\.2% above/.test(shortLoss.plain));
  ok('and that the short was wrong', /short was wrong/.test(shortLoss.plain));

  // The record shown on a short must be the SHORT family's, never the long one.
  const rows = [
    { alert_id: 1, direction: 'long', alert_type: 'kai_long', anchor_date: '2026-06-01', win_5d: true, gain_5d_pct: 4, is_primary: true },
    { alert_id: 2, direction: 'long', alert_type: 'kai_long', anchor_date: '2026-06-02', win_5d: true, gain_5d_pct: 4, is_primary: true },
    { alert_id: 3, direction: 'short', alert_type: 'kai_short', anchor_date: '2026-06-03', win_5d: false, gain_5d_pct: -3, is_primary: true },
  ];
  eq('the long line counts longs', familyPerformance(rows, 'long')?.win_pct, 100);
  eq('the short line counts shorts', familyPerformance(rows, 'short')?.win_pct, 0);
  ok('and says so in its own name', /short/.test(familyPerformance(rows, 'short')?.family ?? ''));
  ok('with short-side wording', /were lower/.test(familyPerformance(rows, 'short')?.plain ?? ''));
}

console.log('\nSWING-5 — the description, composed from measurements when no model wrote one');
{
  const published = setupFor({ alert: alert(), key: 'k', percentile: 50, now: new Date('2026-06-10T00:00:00Z') });
  eq('a message that WAS sent is used verbatim', published.thesis_plain, 'A continuation.');
  eq('and the row says so', published.score_components.thesis_source, 'published_sms');

  const blank = alert({ humanized_message: '   ' });
  const s = setupFor({ alert: blank, key: 'k', percentile: 50, now: new Date('2026-06-10T00:00:00Z') });
  ok('an empty message is composed instead of left blank', (s.thesis_plain ?? '').length > 0);
  eq('and the row never claims it was sent', s.score_components.thesis_source, 'composed_from_measurements');
  ok('it names the horizon and the side', /swing long/.test(s.thesis_plain ?? ''));
  ok('it quotes the volume as measured', /1\.4x its average/.test(s.thesis_plain ?? ''));
  ok('and the RSI', /RSI was 55/.test(s.thesis_plain ?? ''));
  ok('and the sector with its stance', /Technology, reading bullish/.test(s.thesis_plain ?? ''));
  ok('no adjective the numbers do not license', !/(heavy|strong|explosive|massive|surging)/i.test(s.thesis_plain ?? ''));
  ok('and no performance claim', !/\b(wins?|won|profit|returns?|gained?|outperform\w*)\b/i.test(s.thesis_plain ?? ''));

  const withLevels = thesisComposed(alert({ humanized_message: '', stop_price: 95, pattern_target: 110 }))!;
  ok('published levels are quoted when they exist', /stop was \$95\.00 and the target \$110\.00/.test(withLevels));
  ok('with the ratio they imply and nothing more', /about 2\.0 to 1/.test(withLevels));

  const shortSide = thesisComposed(alert({ alert_type: 'kai_short', humanized_message: '' }))!;
  ok('a short is described as a short', /swing short/.test(shortSide));
  const orb = thesisComposed(alert({ alert_type: 'kai_orb_bullish', humanized_message: '' }))!;
  ok('an opening-range break is described at its own horizon', /intraday long/.test(orb));
  ok('the article agrees with the setup name', /on an approaching low setup/.test(
    thesisComposed(alert({ humanized_message: '', setup_label: 'APPROACHING_LOW' })) ?? ''));

  eq(
    'a row with nothing but a price gets NULL, because entry_condition already says the price',
    thesisComposed(alert({
      humanized_message: '', volume_ratio: null, rsi_at_alert: null, sector: null,
      setup_label: null, detected_pattern: null, stop_price: null, pattern_target: null,
      next_resistance: null, catalyst_type: null,
    })),
    null,
  );
  const empty = setupFor({
    alert: alert({
      humanized_message: '', volume_ratio: null, rsi_at_alert: null, sector: null,
      setup_label: null, detected_pattern: null, catalyst_type: null,
    }),
    key: 'k', percentile: 50, now: new Date('2026-06-10T00:00:00Z'),
  });
  eq('and the provenance is null too, not a lie about a sentence that does not exist', empty.score_components.thesis_source, null);

  // rsi_at_alert: 0 means "not computed" (kai_swing_trigger_engine writes it),
  // and a zero must not be rendered as a measurement.
  ok('a zero RSI is not computed, so it is not quoted', !/RSI was 0/.test(thesisComposed(alert({ humanized_message: '', rsi_at_alert: 0 })) ?? ''));
  ok('nor is a zero volume ratio', !/0\.0x/.test(thesisComposed(alert({ humanized_message: '', volume_ratio: 0 })) ?? ''));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
