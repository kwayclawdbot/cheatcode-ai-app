/**
 * THE V2 ALERT CARD'S DECISIONS, CHECKED AS TEXT.
 *
 *   cd apps/mobile && npx tsx scripts/alert-card-v2-test.mts
 *
 * The card (src/features/alerts/AlertCard.tsx) draws what
 * src/features/alerts/card-model.ts decides. These are the decisions that
 * would be wrong quietly:
 *
 *   1. the status verb — "Target 1 hit" only when the TRACKER measured it,
 *      "Stop hit" beats everything but the member's own book, "Watching
 *      resistance" only when price is under a long's entry;
 *   2. the priority card — exactly one, never a resolved card, a crossed stop
 *      or a card Kai says to leave; a decision now beats watching;
 *   3. the rail, the R, the analytics row and the contract row draw nothing
 *      that was not measured;
 *   4. the adapter carries the new wire fields through, and a missing block
 *      stays missing.
 */
import {
  analyticsCells, bucketBars, contractLine, currentPrice, dayChangePct, pickPriority, priorityTier,
  rangeOf, rankActive, rMultiple, stateVerb, timeAgo, windowBars,
} from '../src/features/alerts/card-model.ts';
import { applyBoardFilter, NO_FILTER } from '../src/features/alerts/board-filter.ts';
import { adaptAlertCard } from '../src/lib/adapters.ts';
import type { AlertCard, AlertTracking, Candle } from '../src/lib/types.ts';

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown) {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const T0: AlertTracking = {
  peak_price: null, peak_at: null, peak_gain_pct: null, targets_hit: null, stop_hit: null,
  contract_cost: null, contract_peak: null, contract_peak_multiple: null,
};

const card = (over: Partial<AlertCard> = {}): AlertCard => ({
  id: 'c1', symbol: 'PURR', company: 'Purr', mode_label: 'Swing', direction_label: 'Long',
  grade: 'A', score: 92, state: 'watching', state_label: 'Watching', headline: '', what_changed: '',
  trade: { entry: '24.40', stop: '22.37', target: '30.49' },
  score_components: [], primary_action: { label: 'Open', kind: 'watching' },
  ...over,
});

console.log('\n1 · the verb is a claim about price');
{
  eq('entry reached → Entry triggered', stateVerb(card({ state: 'entry_reached' })).label, 'Entry triggered');
  eq('and it is the action tone', stateVerb(card({ state: 'entry_reached' })).tone, 'action');
  eq('long under its entry → Watching resistance', stateVerb(card(), 23.9).label, 'Watching resistance');
  eq('short over its entry → Watching support',
    stateVerb(card({ direction_label: 'Short', trade: { entry: '50', stop: '53', target: '45' } }), 51).label, 'Watching support');
  eq('no price → Watching entry', stateVerb(card(), null).label, 'Watching entry');
  eq('no entry → Watching', stateVerb(card({ trade: {} }), 10).label, 'Watching');
  eq('forming → Building confirmation', stateVerb(card({ state: 'forming' })).label, 'Building confirmation');
  eq('tracker says target 1 → Target 1 hit',
    stateVerb(card({ state: 'entry_reached', tracking: { ...T0, targets_hit: 1 } })).label, 'Target 1 hit');
  eq('and it is green', stateVerb(card({ state: 'entry_reached', tracking: { ...T0, targets_hit: 1 } })).tone, 'up');
  eq('two targets → Target 2 hit', stateVerb(card({ tracking: { ...T0, targets_hit: 2 } })).label, 'Target 2 hit');
  eq('zero targets hit is not a verb', stateVerb(card({ state: 'entry_reached', tracking: { ...T0, targets_hit: 0 } })).label, 'Entry triggered');
  eq('a price past the target WITHOUT the tracker is not "hit"', stateVerb(card({ state: 'entry_reached' }), 31).label, 'Entry triggered');
  eq('stop crossed beats a target', stateVerb(card({ tracking: { ...T0, targets_hit: 1, stop_hit: true } })).label, 'Stop hit');
  eq('and is red', stateVerb(card({ tracking: { ...T0, stop_hit: true } })).tone, 'down');
  eq('the member\'s position beats the tracker', stateVerb(card({ state: 'position_active', tracking: { ...T0, stop_hit: true } })).label, 'Position open');
  eq('an options-flow card that fired → Flow triggered',
    stateVerb(card({ state: 'ready', recommended_options: [{ type: 'call', strike: '120', expiry: 'Sep 23' }] })).label, 'Flow triggered');
  eq('a stock setup that is ready → Ready to enter', stateVerb(card({ state: 'ready' })).label, 'Ready to enter');
  eq('invalidated → Setup invalidated', stateVerb(card({ state: 'invalidated' })).label, 'Setup invalidated');
  eq('closed → Closed', stateVerb(card({ state: 'closed' })).label, 'Closed');
}

console.log('\n2 · exactly one priority card, and never the wrong one');
{
  const watching = card({ id: 'w', score: 99 });
  const fired = card({ id: 'f', state: 'entry_reached', score: 80 });
  const firedBetter = card({ id: 'fb', state: 'entry_reached', score: 90 });
  eq('a decision now beats a better-graded card that is only watching', pickPriority([watching, fired]), 'f');
  eq('between two decisions the higher grade wins', pickPriority([fired, firedBetter]), 'fb');
  const older = card({ id: 'old', state: 'entry_reached', score: 90, triggered_at: '2026-09-21T13:00:00Z' });
  const newer = card({ id: 'new', state: 'entry_reached', score: 90, triggered_at: '2026-09-21T13:30:00Z' });
  eq('same tier, same grade → the newest', pickPriority([older, newer]), 'new');
  eq('a card Kai passes on never glows', pickPriority([card({ id: 'p', state: 'entry_reached', kai_passes: true })]), null);
  eq('a crossed stop never glows', pickPriority([card({ id: 's', state: 'entry_reached', tracking: { ...T0, stop_hit: true } })]), null);
  eq('resolved cards never glow', pickPriority([card({ id: 'x', state: 'invalidated' }), card({ id: 'y', state: 'closed' })]), null);
  eq('watching alone may still lead the board', pickPriority([watching]), 'w');
  eq('an empty board has no priority', pickPriority([]), null);
  const ranked = rankActive([watching, card({ id: 'x', state: 'invalidated' }), fired, card({ id: 't', tracking: { ...T0, targets_hit: 1 } })]);
  eq('ranked: decision, target to manage, watching, resolved last', ranked.map((a) => a.id), ['f', 't', 'w', 'x']);
  eq('tiers', [fired, card({ state: 'position_active' }), card({ tracking: { ...T0, targets_hit: 1 } }), watching].map(priorityTier), [0, 1, 2, 3]);
}

console.log('\n3 · the rail and the R are drawn only for a coherent plan');
{
  const r = rangeOf(card(), 24.4);
  ok('a long plan has a rail', r !== null);
  ok('its R is reward over risk (≈3.0)', r !== null && Math.abs(r.r - 3.0) < 0.01, r?.r);
  ok('entry sits a quarter of the way along', r !== null && Math.abs(r.entryAt - 0.25) < 0.01, r?.entryAt);
  eq('price at entry sits on the entry', r?.currentAt?.toFixed(2), r?.entryAt.toFixed(2));
  const beyond = rangeOf(card(), 40);
  ok('price past the target clamps to the end and says so', beyond?.currentAt === 1 && beyond.currentOutside === true, beyond);
  eq('no stop → no rail', rangeOf(card({ trade: { entry: '24.40', target: '30.49' } }), 24), null);
  eq('a stop above a long entry is not a plan', rangeOf(card({ trade: { entry: '24.40', stop: '25', target: '30' } }), 24), null);
  const short = rangeOf(card({ direction_label: 'Short', trade: { entry: '50', stop: '53', target: '44' } }), 49);
  ok('a short plan is a rail too, stop at 0 and target at 1', short !== null && short.entryAt > 0 && short.entryAt < 1 && Math.abs(short.r - 2) < 0.01, short);
  eq('the header R is the rail\'s', rMultiple(card(), r)?.toFixed(1), '3.0');
  eq('a zone entry uses the stated ratio, never one off its near edge',
    rMultiple(card({ trade: { entry: '504–507', stop: '498', target: '520', rr: '2.4:1' } }), rangeOf(card({ trade: { entry: '504–507', stop: '498', target: '520' } }), 505)), 2.4);
  eq('a Day Trade card (no levels) has no R', rMultiple(card({ trade: { note: 'no plan' } }), null), null);
}

console.log('\n4 · analytics: only facts that exist');
{
  const cells = analyticsCells(card({ analytics: { pattern: 'Breakout', volume_ratio: 2.4 } }), 3);
  eq('R, pattern and volume, in that order', cells.map((c) => `${c.label}=${c.value}`), ['Risk / Reward=3.0R', 'Pattern=Breakout', 'Volume=2.4×']);
  eq('no duplicate R cell when the header already shows it',
    analyticsCells(card({ analytics: { pattern: 'Breakout', volume_ratio: 2.4 } }), 3, { rInHeader: true }).map((c) => c.key), ['pattern', 'volume']);
  eq('nothing measured → no cells', analyticsCells(card(), null), []);
  eq('no Confidence cell is ever invented', analyticsCells(card({ analytics: { pattern: 'x', volume_ratio: 1 } }), 2).some((c) => /confidence/i.test(c.label)), false);
  const scored = analyticsCells(card({ score_components: [{ key: 'volume', label: 'Volume', status: 'Healthy', strength: 3, explanation: '1.6× the 20-day average at this time of day.' }] }), null);
  eq('the scorer\'s own "1.6×" is read back', scored.map((c) => c.value), ['1.6×']);
  const unknown = analyticsCells(card({ score_components: [{ key: 'volume', label: 'Volume', status: 'Unknown', strength: 0, explanation: '1.6× something' }] }), null);
  eq('an Unknown reading is not a measurement', unknown, []);
  const flow = analyticsCells(card({ recommended_options: [{ type: 'put', strike: '607.5', expiry: 'Sep 23', premium: 262667, ask_side_share: 0.998, volume_vs_own_adv: 135.66 }] }), null);
  eq('an options card: volume vs its own average, premium, share at the ask', flow.map((c) => `${c.label}=${c.value}`), ['Volume=136× avg', 'Premium=$263K', 'Paid at ask=100%']);
}

console.log('\n5 · the Day Trade contract row');
{
  const base = card({ recommended_options: [{ type: 'call', strike: '120', expiry: 'Sep 23', cost: '$5.60' }] });
  const c0 = contractLine(base);
  eq('strike, side, expiry and what was paid', [c0?.strike, c0?.side, c0?.expiry, c0?.paid], ['$120', 'Call', 'Sep 23', '$5.60']);
  eq('no tracker → no peak (never a hopeful one)', c0?.peak, null);
  const c1 = contractLine({ ...base, tracking: { ...T0, contract_cost: 5.6, contract_peak: 27.91, contract_peak_multiple: 4.98 } });
  eq('the tracker\'s peak after the alert, with its multiple', [c1?.peak, c1?.multiple], ['$27.91', '5.0×']);
  eq('no contract → no row', contractLine(card()), null);
}

console.log('\n6 · price, change and the microchart window');
{
  const bars: Candle[] = [
    { t: '2026-09-18T19:55:00Z', o: 99, h: 100.5, l: 98.5, c: 100, v: 1 },
    { t: '2026-09-19T13:30:00Z', o: 100, h: 101, l: 99.5, c: 100.5, v: 1 },
    { t: '2026-09-19T19:55:00Z', o: 100.5, h: 103, l: 100, c: 102, v: 1 },
  ];
  eq('the quote\'s own change wins', dayChangePct(card({ quote: { price: 24.4, change_pct: 4.8 } }), bars), 4.8);
  eq('else last close against the PREVIOUS session\'s close', dayChangePct(card(), bars)?.toFixed(2), '2.00');
  eq('one session of bars has no previous close', dayChangePct(card(), bars.slice(1)), null);
  eq('price: the quote first', currentPrice(card({ quote: { price: 24.4 } }), bars), 24.4);
  eq('then the wire\'s Current', currentPrice(card({ trade: { current: '178.75' } }), bars), 178.75);
  eq('then the last bar', currentPrice(card(), bars), 102);
  eq('24h keeps the last session only', windowBars(bars, 24).length, 2);
  eq('72h keeps all three', windowBars(bars, 72).length, 3);
  const many: Candle[] = Array.from({ length: 234 }, (_, i) => ({ t: new Date(Date.UTC(2026, 8, 19, 13, 30) + i * 300_000).toISOString(), o: i, h: i + 1, l: i - 1, c: i + 0.5, v: 1 }));
  const merged = bucketBars(many, 40);
  ok('234 bars merge to at most 40 candles', merged.length <= 40, merged.length);
  ok('merging keeps the extremes', Math.max(...merged.map((b) => b.h)) === 234 && Math.min(...merged.map((b) => b.l)) === -1);
  eq('and the last close', merged[merged.length - 1].c, 233.5);
  const now = Date.parse('2026-09-21T14:00:00Z');
  eq('2 minutes → "2m ago"', timeAgo('2026-09-21T13:58:00Z', now), '2m ago');
  eq('3 hours → "3h ago"', timeAgo('2026-09-21T11:00:00Z', now), '3h ago');
  eq('no instant → nothing', timeAgo(null, now), null);
}

console.log('\n7 · the filter');
{
  const list = [
    card({ id: 'a', grade: 'A−', score: 86 }),
    card({ id: 'b', grade: 'B+', score: 81 }),
    card({ id: 'u', grade: '—', score: null }),
    card({ id: 's', grade: 'A', score: 92, direction_label: 'Short', trade: { entry: '50', stop: '53', target: '45' } }),
  ];
  eq('no filter keeps everything', applyBoardFilter(list, NO_FILTER, new Set()).map((a) => a.id), ['a', 'b', 'u', 's']);
  eq('A and above: A− in, B+ out, ungraded out', applyBoardFilter(list, { ...NO_FILTER, grade: 'a' }, new Set()).map((a) => a.id), ['a', 's']);
  eq('shorts only', applyBoardFilter(list, { ...NO_FILTER, direction: 'short' }, new Set()).map((a) => a.id), ['s']);
  eq('saved only', applyBoardFilter(list, { ...NO_FILTER, saved: true }, new Set(['b'])).map((a) => a.id), ['b']);
}

console.log('\n8 · the adapter carries the V2 wire fields');
{
  const wire = {
    id: 'setup:x', kind: 'setup', setup_id: 'x',
    identity: { symbol: 'UMC', mode_label: 'Swing', direction: 'long' },
    grade: { display: 'B', score: 76 }, state: 'entry_reached', state_label: 'Entry reached',
    event: { headline: 'h', what_changed: 'w', at_plain: 'Sep 21', triggered_at: '2026-09-21T11:41:00Z' },
    quote: { symbol: 'UMC', price: 8.93, change_pct: 3.1, freshness: 'live' },
    trade_plan: { entry: 8.12, stop: 7.72, targets: [{ price: 8.92 }] },
    tracking: { peak_price: 8.97, targets_hit: 1, stop_hit: false, contract_peak: null },
    analytics: { pattern: 'Pullback', volume_ratio: null },
    primary_action: { label: 'Open' },
  };
  const a = adaptAlertCard(wire);
  eq('triggered_at', a.triggered_at, '2026-09-21T11:41:00Z');
  eq('tracking.targets_hit', a.tracking?.targets_hit, 1);
  eq('tracking.stop_hit false stays false', a.tracking?.stop_hit, false);
  eq('analytics.pattern', a.analytics?.pattern, 'Pullback');
  eq('quote.change_pct', a.quote?.change_pct, 3.1);
  eq('so the verb is Target 1 hit', stateVerb(a, currentPrice(a)).label, 'Target 1 hit');
  const bare = adaptAlertCard({ ...wire, tracking: undefined, analytics: undefined });
  eq('no tracking block → null', bare.tracking, null);
  eq('no analytics block → null', bare.analytics, null);
  eq('an all-null tracking block → null', adaptAlertCard({ ...wire, tracking: { peak_price: null } }).tracking, null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
