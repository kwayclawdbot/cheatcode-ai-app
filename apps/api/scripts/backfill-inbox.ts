/**
 * BACKFILL ONE PERSON'S INBOX — the alerts that were published before their
 * account existed.
 *
 *   cd apps/api
 *   ENV_FILE=.env.prod npx tsx scripts/backfill-inbox.ts --user=someone@example.com
 *   ENV_FILE=.env.prod npx tsx scripts/backfill-inbox.ts --user=<uuid> --write
 *
 * WHY THIS IS NOT `publishSetups`. The publisher refuses anything that is not
 * TODAY's pick (`not_todays_pick`), and that refusal is a safety property worth
 * more than this errand — it is the reason a re-run of the ingest can never
 * fan the back catalogue out at everybody. So this file does not weaken it and
 * does not call it. It writes inbox rows for ONE named user, directly.
 *
 * IT CANNOT SEND A PUSH, AND THAT IS STRUCTURAL RATHER THAN A PROMISE.
 * A push exists only as a `notification_deliveries` row, those rows are only
 * ever written by `enqueuePush`, and nothing in this file imports it. A phone
 * lighting up twelve times for last week's alerts is the wrong outcome, so the
 * only way to get it from here is to write different code.
 *
 * WHAT IT WRITES. Only setups that are STILL LIVE (`state = 'ready'`, a long,
 * swing, graded) and that match the user's own `setup_alert_prefs`. Resolved
 * picks are deliberately left out: the Alerts History tab already carries the
 * back catalogue with its result attached, and an inbox full of dead alerts is
 * noise dressed as news.
 *
 * THE COPY DOES NOT LIE ABOUT WHEN. The live publisher's title is "today's
 * swing setup", which is true when it fires and false a week later. A
 * backfilled row says the date the alert actually went out, and carries
 * `backfilled: true` in its payload so anything reading the row can tell.
 *
 * IDEMPOTENT. It reads back what the user already has for these setups — the
 * same `(user_id, payload->>setup_id)` check the publisher uses — and skips
 * them. Running it twice writes nothing the second time.
 *
 * DRY BY DEFAULT. `--write` is the only way to make it write.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static, like every other script here: `db.ts` reads its environment lazily,
// so the env-file load below still lands before the first client is built.
import { serviceClient } from '../src/lib/db.ts';
import { NOTIF_GROUP } from '../src/lib/notify.ts';
import {
  DEFAULT_MIN_GRADE,
  matchesPrefs,
  truncate,
  BODY_MAX,
  type PublishableSetup,
  type SetupPrefs,
} from '../src/lib/swing/publish.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.ENV_FILE ?? resolve(HERE, '../.env.local');
for (const line of safeRead(ENV_FILE).split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}


const ARGS = process.argv.slice(2);
const WRITE = ARGS.includes('--write');
const WHO = arg('--user');

if (!WHO) {
  console.error('backfill-inbox: --user=<uuid|email> is required. This writes to one inbox, never to everybody.');
  process.exit(1);
}

run().catch((e) => {
  console.error('backfill-inbox failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});

async function run(): Promise<void> {
  const db = serviceClient();
  const userId = await resolveUser(db, WHO!);
  console.log(`user: ${userId}`);
  console.log(WRITE ? 'mode: WRITE' : 'mode: dry run — pass --write to actually write');

  /* ---- 1. what is still live ------------------------------------------ */
  const { data: setupRows, error: sErr } = await db
    .from('setups')
    .select(
      'id,symbol,mode,intent,state,grade_band,grade_display,score,thesis_plain,thesis_technical,quote_snapshot,created_at'
    )
    .eq('mode', 'swing')
    .eq('intent', 'buy_to_open')
    .eq('state', 'ready')
    .eq('quote_snapshot->>origin', 'kai_sms_scanner')
    .order('created_at', { ascending: true });
  if (sErr) throw new Error(`setups read failed — ${sErr.message}`);

  const setups = ((setupRows ?? []) as unknown as (PublishableSetup & { created_at: string })[]).filter(
    (s) => Boolean(s.grade_band)
  );
  console.log(`live swing longs, graded: ${setups.length}`);
  if (!setups.length) return;

  /* ---- 2. what this person asked for ---------------------------------- */
  const { data: prefRow, error: pErr } = await db
    .from('setup_alert_prefs')
    .select('user_id,enabled,min_grade,modes,intents,symbols_include,symbols_exclude')
    .eq('user_id', userId)
    .maybeSingle();
  if (pErr) throw new Error(`setup_alert_prefs read failed — ${pErr.message}`);
  // No row means "has never expressed a preference", which is the schema
  // defaults — never "opted out". Same reading as `loadPrefs` in publish.ts.
  const prefs: SetupPrefs = (prefRow as unknown as SetupPrefs) ?? {
    user_id: userId,
    enabled: null,
    min_grade: null,
    modes: null,
    intents: null,
    symbols_include: null,
    symbols_exclude: null,
  };
  console.log(
    `prefs: enabled=${prefs.enabled ?? 'default'} min_grade=${prefs.min_grade ?? DEFAULT_MIN_GRADE} ` +
      `modes=${prefs.modes?.join('/') ?? 'all'} intents=${prefs.intents?.join('/') ?? 'all'}`
  );

  /* ---- 3. what they already have --------------------------------------- */
  const { data: haveRows, error: nErr } = await db
    .from('notifications')
    .select('payload')
    .eq('user_id', userId)
    .eq('kind', 'setup_published')
    .in('payload->>setup_id', setups.map((s) => s.id));
  if (nErr) throw new Error(`notifications read failed — ${nErr.message}`);
  const have = new Set(
    ((haveRows ?? []) as { payload: Record<string, unknown> }[])
      .map((r) => r.payload?.setup_id)
      .filter((v): v is string => typeof v === 'string')
  );

  /* ---- 4. decide -------------------------------------------------------- */
  const rows: Record<string, unknown>[] = [];
  const refused: Record<string, number> = {};
  for (const s of setups) {
    if (have.has(s.id)) {
      refused.already_in_inbox = (refused.already_in_inbox ?? 0) + 1;
      continue;
    }
    const d = matchesPrefs(s, prefs);
    if (!d.ok) {
      refused[d.reason] = (refused[d.reason] ?? 0) + 1;
      continue;
    }
    const etDate = ((s.quote_snapshot ?? {}) as Record<string, unknown>).et_date;
    const when = typeof etDate === 'string' && etDate ? etDate : s.created_at.slice(0, 10);
    const thesis = (s.thesis_plain ?? s.thesis_technical ?? '').trim();
    rows.push({
      user_id: userId,
      channel: 'in_app',
      kind: 'setup_published',
      // `created_at` is the day the alert went out, not the day this ran, so
      // the inbox reads in the order things actually happened.
      created_at: s.created_at,
      payload: {
        title_plain: `${s.symbol} — swing setup from ${humanDate(when)}`,
        body_plain: thesis
          ? truncate(thesis, BODY_MAX)
          : 'Kai published this one on the morning scan. Nothing has been bought or sold.',
        route: `/setup/${s.id}`,
        group: NOTIF_GROUP.setup_published,
        setup_id: s.id,
        symbol: s.symbol,
        grade_display: s.grade_display,
        grade_band: s.grade_band,
        score: s.score,
        source: 'kai_sms_scanner',
        // Said out loud on the row: this was added after the fact, because the
        // account did not exist when the alert went out.
        backfilled: true,
        backfilled_at: new Date().toISOString(),
        published_et_date: when,
      },
    });
    console.log(`  + ${s.symbol.padEnd(6)} ${when}  ${s.grade_display ?? '—'}`);
  }

  console.log(`to write: ${rows.length}`);
  for (const [k, v] of Object.entries(refused)) console.log(`skipped (${k}): ${v}`);

  if (!rows.length) return;
  if (!WRITE) {
    console.log('dry run — nothing written. No push would be sent either way: this file writes no delivery rows.');
    return;
  }

  const { error: wErr } = await db.from('notifications').insert(rows as never);
  if (wErr) throw new Error(`notifications insert failed — ${wErr.message}`);
  console.log(`written: ${rows.length} inbox rows. Delivery rows written: 0 — no push was queued or sent.`);
}

async function resolveUser(db: ReturnType<typeof serviceClient>, who: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(who)) return who;
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`could not list users — ${error.message}`);
  const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === who.toLowerCase());
  if (!hit) throw new Error(`no account with the email ${who}`);
  return hit.id;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function humanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

function arg(name: string): string | null {
  const hit = ARGS.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function safeRead(p: string): string {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}
