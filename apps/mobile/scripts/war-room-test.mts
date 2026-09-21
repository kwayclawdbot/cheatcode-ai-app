/**
 * HOME IN THE WAR ROOM STYLE — the rules, checked without a renderer.
 *
 *   npx tsx scripts/war-room-test.mts
 *
 * `features/home/warroom.ts` decides what Kai's status light says, which brain
 * regions glow and the one line under the brain. The drawing only draws those
 * answers, so the answers are what is tested. A few source checks at the end
 * hold the parts that live in components: reduced motion, the token rule, and
 * the chart staying loaded behind other tabs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAIN_REGIONS, STAGE_REGIONS, brainCaption, chartCaption, kaiStateFor, litRegions, listLabels, regionsForSurface,
} from '../src/features/home/warroom.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${got === undefined ? '' : ` — got ${JSON.stringify(got)}`}`); }
};
const head = (s: string) => console.log(`\n${s}`);

head('One status, in a fixed order');
{
  const base = { online: true, credits: null, streaming: false, voicePhase: 'idle' as const };
  ok('ready when nothing is happening', kaiStateFor(base) === 'ready');
  ok('thinking while Kai writes', kaiStateFor({ ...base, streaming: true }) === 'thinking');
  ok('speaking while his voice plays', kaiStateFor({ ...base, voicePhase: 'speaking' }) === 'speaking');
  ok('listening while the mic records', kaiStateFor({ ...base, voicePhase: 'recording' }) === 'listening');
  ok('and while the words are written down', kaiStateFor({ ...base, voicePhase: 'transcribing' }) === 'listening');
  ok('the member talking wins over Kai writing', kaiStateFor({ ...base, streaming: true, voicePhase: 'recording' }) === 'listening');
  ok('out of credit is offline', kaiStateFor({ ...base, credits: { blocked: true } }) === 'offline');
  ok('offline wins over the mic', kaiStateFor({ ...base, credits: { blocked: true }, voicePhase: 'recording' }) === 'offline');
  ok('no network is offline', kaiStateFor({ ...base, online: false }) === 'offline');
  ok('an unknown network is not offline', kaiStateFor({ ...base, online: null }) === 'ready');
}

head('The brain follows the stage');
{
  const idle = (stage: 'beginner' | 'developing' | 'trade_ready') => litRegions({ state: 'ready', stage, surfaceKind: null });
  ok('a beginner leads with lessons, news and the watchlist', idle('beginner').join() === 'memory,watchlist,news', idle('beginner'));
  ok('a trade-ready member leads with setups, alerts and options',
    idle('trade_ready').join() === 'technicals,alerts,options', idle('trade_ready'));
  ok('the two stages light different regions', idle('beginner').join() !== idle('trade_ready').join());
  ok('every stage lights at least two regions', Object.values(STAGE_REGIONS).every((r) => r.length >= 2));
  ok('no stage yet still glows', litRegions({ state: 'ready', stage: null, surfaceKind: null }).length > 0);
}

head('A region lights when Kai uses its tool');
{
  ok('a chart lights market and technicals', regionsForSurface('chart').join() === 'market,technicals');
  ok('news lights news', regionsForSurface('news').join() === 'news');
  ok('options light options', regionsForSurface('options').includes('options'));
  ok('a room lights community', regionsForSurface('community').join() === 'community');
  ok('a web page lights nothing rather than a guess', regionsForSurface('web').length === 0);
  const thinking = litRegions({ state: 'thinking', stage: 'beginner', surfaceKind: 'news' });
  ok('thinking lights memory and the tool in use', thinking.join() === 'memory,news', thinking);
  ok('offline lights nothing', litRegions({ state: 'offline', stage: 'trade_ready', surfaceKind: 'chart' }).length === 0);
  ok('every region named in the rules is drawn',
    Object.values(STAGE_REGIONS).flat().every((k) => BRAIN_REGIONS.some((r) => r.key === k)));
  ok('there are eight regions', BRAIN_REGIONS.length === 8);
}

head('The caption says what is happening, and why when Kai is offline');
{
  const cap = (over: Partial<Parameters<typeof brainCaption>[0]>) =>
    brainCaption({ state: 'ready', stage: 'beginner', lit: [], online: true, credits: null, ...over });
  ok('ready speaks to the stage', cap({}).includes('Lessons'));
  ok('trade ready speaks to setups', cap({ stage: 'trade_ready' }).includes('Setups'));
  ok('out of credit says so, with when it comes back',
    cap({ state: 'offline', credits: { blocked: true, blocked_reason: 'out_of_credits' }, resets: 'They come back overnight' })
      === "Today's credits are used up. They come back overnight.");
  ok('the monthly limit is a different sentence',
    cap({ state: 'offline', credits: { blocked: true, blocked_reason: 'ceiling' } }).includes('month'));
  ok('no network is its own sentence', cap({ state: 'offline', online: false }).startsWith('No connection'));
  ok('thinking names the lit regions', cap({ state: 'thinking', lit: ['memory', 'market'] }) === 'Thinking · Memory and Market');
  ok('lists read as English', listLabels(['memory', 'market', 'news']) === 'Memory, Market and News');
}

head('The chart caption is Kai\'s latest line, only while he is writing');
{
  const items = [
    { kind: 'user_text' as const, id: 'u', text: 'show me nvda' },
    { kind: 'kai_text' as const, id: 'k', text: 'Here is Nvidia on the daily. That line is yesterday\'s high, and it held twice.▍', streaming: true },
  ];
  ok('shows the last sentence', chartCaption(items, true) === 'That line is yesterday\'s high, and it held twice.', chartCaption(items, true));
  ok('nothing once he has finished', chartCaption(items, false) === null);
  ok('nothing before he has said anything', chartCaption(items.slice(0, 1), true) === null);
  const long = [{ kind: 'kai_text' as const, id: 'k', text: 'x'.repeat(300) }];
  ok('a long line is cut to fit', (chartCaption(long, true) ?? '').length <= 120);
}

head('The parts that live in components');
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const brain = strip(read('src/ui/KaiBrain.tsx'));
  const host = strip(read('src/features/kai-workspace/WorkspaceHost.tsx'));
  const home = strip(read('src/app/(tabs)/home.tsx'));
  const voice = strip(read('src/features/voice/useKaiVoice.tsx'));
  ok('the brain asks about reduced motion', brain.includes('useReducedMotion()'));
  ok('and its loops stop under it', /if \(reduced \|\| offline\) \{ breath\.setValue/.test(brain) && /if \(reduced \|\| offline\) \{ ring\.setValue/.test(brain));
  ok('the brain uses no raw colours', !/#[0-9A-Fa-f]{3,8}\b/.test(brain) && !/rgba?\(/.test(brain));
  ok('the host uses no raw colours', !/#[0-9A-Fa-f]{3,8}\b/.test(host) && !/rgba?\(/.test(host));
  ok('the panel settles in only when motion is allowed', host.includes('motion.reduced'));
  ok('the chart stays mounted behind other tabs', host.includes('chartBehind') && host.includes('key={`chart:${chart.nonce}`}'));
  ok('there is a close all', host.includes('workspace-close-all') && host.includes('workspace.closeAll()'));
  ok('the host still renders nothing when nothing is open', host.includes('if (!active) return null'));
  ok('the voice hook reports the live volume', /return \{ enabled: true as const, phase, level,/.test(voice));
  ok('Home feeds that volume to the brain', home.includes('level={voice.level}'));
  ok('Home passes Kai\'s line to the chart', home.includes('caption={onChart}'));
  ok('and the host draws it over the chart', host.includes('warroom-chart-caption') && host.includes("active.kind === 'chart' && props.caption"));
  ok('Home keeps its three controls', home.includes('<Hamburger') && home.includes('<PanelLauncherButton') && home.includes('<NewThread'));
  ok('and the brain gives way to a panel', home.includes('{!activeSurface ? ('));
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
