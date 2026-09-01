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
  anchorDateFor,
  bandSplit,
  dedupePicks,
  entryQualityFromRsi,
  etDateFor,
  familyOf,
  familyPerformance,
  fingerprint,
  gradeFromPercentile,
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

console.log('\nfamilies — long only, and swing-shaped only');
{
  ok('kai_long is in', isIngestibleType('kai_long'));

  // The trap the brief's own `kai_long%` filter walks into. Both of these are
  // five-minute opening-range breaks; ingesting them as swing would put a
  // 5-SESSION expiry on an intraday idea and grade it on a horizon it never
  // claimed. They are named, classified and declined — not relabelled.
  eq('kai_long_or_break is intraday, not swing', familyOf('kai_long_or_break'), 'intraday_long');
  eq('kai_long_pullback_or_break is intraday, not swing', familyOf('kai_long_pullback_or_break'), 'intraday_long');
  ok('so a kai_long% prefix filter would be wrong twice out of three', !isIngestibleType('kai_long_or_break') && !isIngestibleType('kai_long_pullback_or_break'));
  eq('kai_orb_bullish is intraday too', familyOf('kai_orb_bullish'), 'intraday_long');

  eq('kai_short is a short', familyOf('kai_short'), 'short');
  eq('kai_short_shadow is a short', familyOf('kai_short_shadow'), 'short');
  eq('kai_orb_bearish is a short', familyOf('kai_orb_bearish'), 'short');
  ok('no short is ingestible', !['kai_short', 'kai_short_shadow', 'kai_orb_bearish', 'breakdown', 'short_idea'].some(isIngestibleType));

  ok('an unrecognised type is declined rather than assumed', !isIngestibleType('kai_something_new'));
  eq('and classified as other', familyOf('kai_something_new'), 'other');
  ok('a null type is out', !isIngestibleType(null));
  eq('exactly one type is ingested today', SWING_LONG_TYPES, ['kai_long']);
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

  eq('A is the top decile', gradeFromPercentile(90).band, 'A');
  eq('just under the top decile is a B', gradeFromPercentile(89.9).band, 'B');
  eq('B is the upper half', gradeFromPercentile(50).band, 'B');
  eq('C is below the median', gradeFromPercentile(49.9).band, 'C');
  eq('no percentile means no letter, not a C', gradeFromPercentile(null).band, null);
  ok('the display letter carries no hyphen for displayGrade to convert', !(gradeFromPercentile(90).display ?? '').includes('-'));

  // The whole point of §2: this mapping must NOT make half the picks gold.
  const uniform = Array.from({ length: 100 }, (_, i) => ({ score: i, grade_band: gradeFromPercentile(i).band }));
  const split = bandSplit(uniform);
  eq('a uniform percentile puts exactly a tenth in A', split.letters.A, 10);
  eq('and four tenths in B', split.letters.B, 40);
  eq('and half in C', split.letters.C, 50);
  eq('gold is the top decile, not 46%', split.families.gold, 10);
  eq('the raw scanner score would have been read as gold; the percentile is not', medallionFamilyFor(124), 'gold');
}

console.log('\nthe scorecard — the scanner\'s real components, and only those');
{
  const c = setupFor({ alert: alert(), key: 'k', score: 80, now: new Date('2026-06-10T00:00:00Z') }).score_components;
  eq('quality_score 0..20 becomes trend on 0..100', c.trend, 75);
  eq('catalyst_score 0..12 becomes catalyst on 0..100', c.catalyst, 25);
  eq('a bullish sector stance becomes market', c.market, 85);
  eq('RSI 55 is the best entry band docs/17 measured', c.entry_quality, 92);
  ok('risk_reward is absent so grade.ts derives it from the plan', !('risk_reward' in c));

  // The pullback_or_break subfamily writes 0 for every score it did not compute.
  const blank = setupFor({
    alert: alert({ quality_score: 0, catalyst_score: 0, flow_score: 0, rsi_at_alert: 0, sector_stance: null, catalyst_type: null }),
    key: 'k', score: 80, now: new Date('2026-06-10T00:00:00Z'),
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

  const row = setupFor({ alert: alert(), key: 'NVDA|2026-06-10|kai_long', score: 80, now: new Date('2026-06-10T00:00:00Z') });
  const asPostgresReturnsIt = {
    ...row,
    // What PostgREST actually hands back: numeric as a string, timestamptz with
    // an offset instead of a Z, and the columns this ingest does not own.
    score: '80.0',
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
  const s = setupFor({ alert: alert(), key: 'NVDA|2026-06-10|kai_long', score: 95, now: new Date('2026-06-10T00:00:00Z') });
  eq('every ingested pick is a swing setup', s.mode, 'swing');
  eq('and long', s.intent, 'buy_to_open');
  eq('the published trigger is the entry condition', (s.entry_condition as { price: number }).price, 100);
  eq('the scanner publishes no stop for this family, so there is none', s.stop, null);
  eq('and no targets', s.targets, []);
  eq('the humanized message is the plain thesis', s.thesis_plain, 'A continuation.');
  ok('volume and pattern are read as prose, not scored', /volume 1\.4x/.test(s.thesis_technical ?? ''));
  ok('the raw scanner score is kept for provenance', s.score_components.raw_breakout_score === 90);
  eq('a live pick is ready', s.state, 'ready');
  eq('a pick past its window is expired', setupFor({ alert: alert(), key: 'k', score: 95, now: new Date('2027-01-01T00:00:00Z') }).state, 'expired');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
