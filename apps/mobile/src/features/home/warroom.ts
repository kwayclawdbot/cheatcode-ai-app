/**
 * THE WAR ROOM'S RULES, WITHOUT ANY DRAWING IN THEM.
 *
 * Home borrows the old War Room's look (docs/HOME-WAR-ROOM-2026-09-21.md): Kai's
 * brain in the middle, a status light in the top bar, regions that light when
 * he uses the tool behind them. Everything that DECIDES what those show lives
 * here, in plain functions, so `scripts/war-room-test.mts` can check the
 * decisions without a renderer. The drawing is `ui/KaiBrain.tsx`.
 *
 * This file imports types only. It must stay loadable under plain node.
 */
import type { Credits, Stage, WallItem } from '../../lib/types';

/** The eight regions of Kai's brain, in the order they are drawn. */
export type BrainRegion =
  | 'memory' | 'market' | 'technicals' | 'alerts'
  | 'watchlist' | 'community' | 'news' | 'options';

/**
 * Left column top to bottom, then right column top to bottom. The left side is
 * what Kai knows and reads (his notes, the market, the chart, alerts); the
 * right side is what the member keeps and hears about.
 */
export const BRAIN_REGIONS: readonly { key: BrainRegion; label: string }[] = [
  { key: 'memory', label: 'Memory' },
  { key: 'market', label: 'Market' },
  { key: 'technicals', label: 'Technicals' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'community', label: 'Community' },
  { key: 'news', label: 'News' },
  { key: 'options', label: 'Options' },
];

/** What Kai is doing right now, in the five words the status light can say. */
export type KaiState = 'ready' | 'thinking' | 'speaking' | 'listening' | 'offline';

export const STATE_WORD: Record<KaiState, string> = {
  ready: 'Ready',
  thinking: 'Thinking',
  speaking: 'Speaking',
  listening: 'Listening',
  offline: 'Kai offline',
};

/** The voice hook's phases, repeated as a string union so this file needs no audio import. */
export type VoicePhaseLike = 'idle' | 'starting' | 'recording' | 'transcribing' | 'speaking';

/**
 * ONE ANSWER, IN A FIXED ORDER OF PRECEDENCE.
 *
 * Offline wins over everything: a member out of credit who taps the mic is
 * still talking to a Kai who cannot answer, and a light that said "Listening"
 * would promise a reply that is not coming. After that, the member's own voice
 * wins over Kai's — if they are talking, that is what is happening.
 */
export function kaiStateFor(input: {
  online: boolean | null | undefined;
  credits: Pick<Credits, 'blocked'> | null;
  streaming: boolean;
  voicePhase: VoicePhaseLike;
}): KaiState {
  if (input.online === false || input.credits?.blocked) return 'offline';
  const v = input.voicePhase;
  if (v === 'starting' || v === 'recording' || v === 'transcribing') return 'listening';
  if (v === 'speaking') return 'speaking';
  if (input.streaming) return 'thinking';
  return 'ready';
}

/**
 * WHAT GLOWS WHEN KAI IS IDLE, BY STAGE.
 *
 * The brain leads with what matters to this member. A beginner's Kai is
 * teaching: his notes on them, the news that explains the day, and the handful
 * of names they are learning on. A trade-ready member's Kai is hunting: setups
 * (technicals), the alerts that fire on them, and the options behind them.
 */
export const STAGE_REGIONS: Record<Stage, BrainRegion[]> = {
  beginner: ['memory', 'news', 'watchlist'],
  developing: ['technicals', 'market', 'watchlist'],
  trade_ready: ['alerts', 'technicals', 'options'],
};

/** No stage on the profile yet: the brain still glows, on the general market. */
export const NO_STAGE_REGIONS: BrainRegion[] = ['memory', 'market'];

/** The one line under the brain when Kai is idle, per stage. */
export const STAGE_LEAD: Record<Stage, string> = {
  beginner: 'Lessons, the news and your watchlist come first.',
  developing: 'Charts, the market and your watchlist come first.',
  trade_ready: 'Setups, alerts and the chart come first.',
};

/**
 * WHICH REGION A PANEL BELONGS TO.
 *
 * Opening a surface IS Kai reaching for the tool behind it, so the region that
 * tool lives in lights up. Kinds with no tool of their own (a web page) light
 * nothing rather than a guess.
 */
export function regionsForSurface(kind: string | null | undefined): BrainRegion[] {
  switch (kind) {
    case 'chart': return ['market', 'technicals'];
    case 'quote': return ['market'];
    case 'setup': return ['technicals', 'alerts'];
    case 'alert': return ['alerts'];
    case 'news': return ['news'];
    case 'earnings': return ['news', 'options'];
    case 'options': return ['options'];
    case 'watchlist': return ['watchlist'];
    case 'portfolio': return ['watchlist'];
    case 'community': return ['community'];
    case 'training': return ['memory'];
    case 'plan': return ['technicals', 'memory'];
    default: return [];
  }
}

/**
 * The regions that are lit, given what Kai is doing.
 *
 * Offline lights nothing — a dark brain is the honest picture of a Kai who
 * cannot answer. Thinking always lights Memory, because the first thing he does
 * with any question is read the conversation it arrived in.
 */
export function litRegions(input: {
  state: KaiState;
  stage: Stage | null | undefined;
  surfaceKind: string | null | undefined;
}): BrainRegion[] {
  if (input.state === 'offline') return [];
  const fromSurface = regionsForSurface(input.surfaceKind);
  const idle = input.stage ? STAGE_REGIONS[input.stage] : NO_STAGE_REGIONS;
  const out = new Set<BrainRegion>();
  if (input.state === 'thinking') {
    out.add('memory');
    (fromSurface.length ? fromSurface : ['market' as BrainRegion]).forEach((r) => out.add(r));
  } else if (fromSurface.length) {
    fromSurface.forEach((r) => out.add(r));
  } else {
    idle.forEach((r) => out.add(r));
  }
  return BRAIN_REGIONS.map((r) => r.key).filter((k) => out.has(k));
}

const labelOf = (k: BrainRegion) => BRAIN_REGIONS.find((r) => r.key === k)?.label ?? k;

/** "Memory", "Memory and Market", "Memory, Market and News". */
export function listLabels(keys: BrainRegion[]): string {
  const names = keys.map(labelOf);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * THE CAPTION UNDER THE BRAIN — one honest line about what Kai is doing.
 *
 * Offline says WHY, in the member's terms, because "Kai offline" on its own
 * reads as the app being broken. The reset line comes from the caller (it is
 * formatted against the phone's clock, which this file does not touch).
 */
export function brainCaption(input: {
  state: KaiState;
  stage: Stage | null | undefined;
  lit: BrainRegion[];
  online: boolean | null | undefined;
  credits: Pick<Credits, 'blocked' | 'blocked_reason'> | null;
  resets?: string | null;
}): string {
  switch (input.state) {
    case 'offline':
      if (input.online === false) return 'No connection. What you see is what I last knew.';
      if (input.credits?.blocked_reason === 'ceiling') {
        return "This month's limit is reached. It resets when the month turns.";
      }
      return `Today's credits are used up. ${input.resets ?? 'They come back tomorrow'}.`;
    case 'listening':
      return 'Listening…';
    case 'speaking':
      return 'Speaking. Tap the mic to stop me.';
    case 'thinking':
      return input.lit.length ? `Thinking · ${listLabels(input.lit)}` : 'Thinking';
    default:
      return input.stage ? STAGE_LEAD[input.stage] : 'Ask me about a symbol, a setup or your rules.';
  }
}

/**
 * KAI'S LATEST LINE, AS A CAPTION OVER THE CHART.
 *
 * Only while he is writing: once the reply is finished it is in the
 * conversation below, and a caption repeating it over the candles would be the
 * same sentence twice. The last sentence is what he is saying NOW, so that is
 * what the caption shows, cut to fit two lines.
 */
export function chartCaption(items: readonly WallItem[], streaming: boolean, max = 120): string | null {
  if (!streaming) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === 'user_text') return null;
    if (it.kind !== 'kai_text') continue;
    const text = it.text.replace(/▍/g, '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
    let last = sentences[sentences.length - 1].trim();
    // A sentence of two words is the start of the next one; show the one before too.
    if (last.split(' ').length < 4 && sentences.length > 1) {
      last = `${sentences[sentences.length - 2].trim()} ${last}`;
    }
    return last.length > max ? `…${last.slice(last.length - max + 1).trimStart()}` : last;
  }
  return null;
}
