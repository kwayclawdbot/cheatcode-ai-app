/**
 * `npm run show:review` — one show, start to finish, on the terminal.
 *
 * Everything the operator needs before a single dollar is spent is printed at
 * the top: which capabilities are configured, whether the API answers, whether
 * there is a voice. A run that is about to produce a captions-only show says so
 * at second zero rather than at segment four.
 *
 * The exit code is the gate: non-zero when no segment was produced, because a
 * show with nothing in it is a failure however cleanly the process ended.
 */
import { config, describeEnv } from './config.ts';
import { log, money, say } from './log.ts';
import { Budget } from './budget.ts';
import { Director, MARKET_MODE, REVIEW_MODE } from './director.ts';
import { apiReachable } from './api.ts';
import { anthropicConfigured } from './analyze.ts';
import { ttsStatus } from './tts.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const modeName = arg('mode') ?? 'review';
  const mode = modeName === 'market' ? MARKET_MODE : REVIEW_MODE;
  const maxSegments = Number(arg('segments') ?? config.maxSegments());

  say('');
  say('  kai-live');
  for (const [k, v] of Object.entries(describeEnv())) {
    say(`    ${k.padEnd(22)} ${typeof v === 'boolean' ? (v ? 'yes' : 'NO') : v}`);
  }

  if (!anthropicConfigured()) {
    say('');
    say('  ANTHROPIC_API_KEY is not set. There is nothing to write the show with.');
    return 2;
  }

  const reach = await apiReachable();
  say(`    api                    ${reach.ok ? reach.detail : `UNREACHABLE — ${reach.detail}`}`);
  if (!reach.ok) {
    say('');
    say('  The API is not answering. Start it with `cd apps/api && npm run dev`.');
    return 2;
  }
  if (!config.openaiKey()) {
    say('    voice                  NO KEY — the show will run as captions with no audio');
  }

  const budget = new Budget();
  const director = new Director(mode, { budget, maxSegments: Number.isFinite(maxSegments) ? maxSegments : 0 });

  const result = await director.run();

  say('');
  say('  ────────────────────────────────────────────────────────────');
  say(`  show      ${result.showId}`);
  say(`  segments  ${result.segments}`);
  say(`  frames    ${result.frames}`);
  say(`  spend     ${money(result.spendUsd)}   (cap ${money(budget.cap)}/hr, run rate ${money(budget.runRateUsdPerHour())}/hr)`);
  say(`  audio     ${result.ttsAvailable ? 'generated' : `unavailable — ${ttsStatus().reason ?? 'no provider'}`}`);
  if (result.degraded) say('  NOTE      the budget cap was reached and the show degraded');
  say('');
  say('  per segment');
  for (const s of result.perSegment) {
    say(`    ${String(s.seq).padStart(2)}  ${s.symbol.padEnd(6)} ${s.source.padEnd(10)} ${s.frames} frames  ${money(s.cost_usd)}`);
  }
  say('');
  say(`  watch it:  /stage-check?show=${result.showId}`);
  say('  ────────────────────────────────────────────────────────────');
  say('');

  // The whole cost table, as JSON, for whatever is reading the log. The build
  // gate asks for per-segment cost and this is where that number comes from.
  log('info', 'show.cost_table', { table: budget.table(), summary: budget.summary() });

  return result.segments > 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    log('error', 'show.crashed', { message: e instanceof Error ? e.message : String(e) });
    if (e instanceof Error && e.stack) console.error(e.stack);
    process.exit(3);
  });
