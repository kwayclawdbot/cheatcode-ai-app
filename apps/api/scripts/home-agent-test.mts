/**
 * HOME'S AGENT BLOCK SAYS ONLY WHAT IT READ.
 *
 *   cd apps/api && npx tsx scripts/home-agent-test.mts
 *
 * The earnings reader is stubbed — no network, no token. Checked: a report in
 * the next week becomes a row; one further out does not; a source that is not
 * connected or did not answer says so and carries NO events (an empty list from
 * a failed read must never read as "nothing coming up"); a slow read is cut off
 * rather than holding Home; and an alert's words become a "when …" clause only
 * when they actually read as a condition.
 */
import { homeCalendar, watchClause, CALENDAR_MAX_SYMBOLS } from '../src/lib/v5/calendar.ts';
import { HomeAgentBlock, HomeRound6Response, KAI_OFFLINE_PLAIN, AlsoWatchingRow } from '../../../packages/shared/api.ts';

let failures = 0;
function check(name: string, pass: boolean, detail?: unknown): void {
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass || detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

const TODAY = '2026-09-21';
type Next = { date: string; confirmed: boolean; when: 'premarket' | 'postmarket' | null } | null;
const table = (m: Record<string, Next | 'fail'>) => async (sym: string) => {
  const v = m[sym];
  if (v === 'fail' || v === undefined) return { ok: false as const };
  return { ok: true as const, next: v };
};

// 1 — a report inside the week is a row, one outside it is not
{
  const cal = await homeCalendar(['nvda', 'AAPL', 'PURR'], {
    configured: true,
    today: TODAY,
    nextEarnings: table({
      NVDA: { date: '2026-09-24', confirmed: true, when: 'postmarket' },
      AAPL: { date: '2026-10-30', confirmed: false, when: null },
      PURR: null,
    }),
  });
  check('state ok when every read answered', cal.state === 'ok', cal);
  check('one event, NVDA, three days away', cal.events.length === 1 && cal.events[0].symbol === 'NVDA' && cal.events[0].days_away === 3, cal.events);
  check('after-the-close timing travels', cal.events[0]?.when === 'postmarket');
  check('confirmed flag travels', cal.events[0]?.confirmed === true);
  check('plain names the count', /1 report in the next 7 days/.test(cal.plain), cal.plain);
}

// 2 — not connected is a sentence and no events
{
  let asked = 0;
  const cal = await homeCalendar(['NVDA'], {
    configured: false,
    today: TODAY,
    nextEarnings: async () => { asked += 1; return { ok: true, next: { date: TODAY, confirmed: true, when: null } }; },
  });
  check('not connected → state not_connected', cal.state === 'not_connected');
  check('not connected → no events and no reads', cal.events.length === 0 && asked === 0);
  check('not connected → says so', /not connected/.test(cal.plain));
}

// 3 — every read failing is "unavailable", never "no reports"
{
  const cal = await homeCalendar(['NVDA', 'AMD'], { configured: true, today: TODAY, nextEarnings: table({ NVDA: 'fail', AMD: 'fail' }) });
  check('all failed → unavailable', cal.state === 'unavailable', cal);
  check('all failed → does not claim no reports', !/No reports/.test(cal.plain), cal.plain);
}

// 4 — a partial failure is named
{
  const cal = await homeCalendar(['NVDA', 'AMD'], {
    configured: true,
    today: TODAY,
    nextEarnings: table({ NVDA: 'fail', AMD: { date: '2026-09-22', confirmed: false, when: 'premarket' } }),
  });
  check('partial → ok with the one it read', cal.state === 'ok' && cal.events.length === 1 && cal.events[0].symbol === 'AMD');
  check('partial → says one could not be checked', /could not check 1/.test(cal.plain), cal.plain);
  check('estimate stays an estimate', cal.events[0]?.confirmed === false);
}

// 5 — a slow source is cut off
{
  const t0 = Date.now();
  const cal = await homeCalendar(['NVDA'], {
    configured: true,
    today: TODAY,
    nextEarnings: () => new Promise((r) => setTimeout(() => r({ ok: true, next: null }), 2000)),
  }, { timeoutMs: 60 });
  check('slow read is abandoned quickly', Date.now() - t0 < 1000, Date.now() - t0);
  check('slow read counts as unavailable', cal.state === 'unavailable');
}

// 6 — symbols are de-duplicated, cleaned and capped
{
  const asked: string[] = [];
  await homeCalendar(['nvda', 'NVDA', ' amd ', '', '12345678', 'A', 'B', 'C', 'D', 'E', 'F', 'G'], {
    configured: true,
    today: TODAY,
    nextEarnings: async (s) => { asked.push(s); return { ok: true, next: null }; },
  });
  check('asks each company once', new Set(asked).size === asked.length, asked);
  check(`asks at most ${CALENDAR_MAX_SYMBOLS}`, asked.length === CALENDAR_MAX_SYMBOLS, asked);
  check('drops junk symbols', !asked.includes('12345678') && !asked.includes(''), asked);
}

// 7 — the alert's words
check('"Alert me when …" → "when …"', watchClause('Alert me when PURR breaks 24.40 on volume.') === 'when PURR breaks 24.40 on volume');
check('"Let me know if …" → "if …"', watchClause('let me know if AMD loses 170') === 'if AMD loses 170');
check('words that are not a condition give null', watchClause('PURR 24.40') === null);
check('empty gives null', watchClause('') === null && watchClause(null) === null);

// 8 — the contract accepts the block and the offline sentence is plain
{
  const block = HomeAgentBlock.safeParse({
    kai: { available: false, status: 'no_credit' },
    positions_open: 2,
    monitoring: [{ id: 'a1', symbol: 'PURR', plain: 'Alert me when PURR breaks 24.40', clause: 'when PURR breaks 24.40' }],
    calendar: { state: 'ok', plain: 'x', events: [] },
  });
  check('agent block parses', block.success, block.success ? undefined : block.error.issues);
  check('round 6 keeps the agent key', 'agent' in HomeRound6Response.shape);
  const row = AlsoWatchingRow.parse({ kind: 'setup', id: 's', symbol: 'AMD', plain: 'Watching', route: '/x' });
  check('an old also-watching row still parses (state_label defaults to null)', row.state_label === null);
  check('offline sentence names no provider or credit', !/anthropic|credit|api/i.test(KAI_OFFLINE_PLAIN), KAI_OFFLINE_PLAIN);
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
