/**
 * A FRESHNESS LABEL IS A CLAIM ABOUT NOW, NOT ABOUT WHEN THE PAYLOAD ARRIVED.
 *
 * The server stamps a quote `live` because it WAS live when it answered. The
 * app then kept that word on screen for as long as the screen stayed open, so a
 * price fetched at 9:31 sat under a green "Live · 9:31 AM" dot at two in the
 * afternoon. The dot was the worst part: the number being old is a fact of the
 * network, but the word "Live" over it is the app telling somebody something
 * untrue about the money in front of them.
 *
 * So the label is recomputed from the timestamp against the current clock.
 *
 * ── THE ONE RULE THAT MATTERS: ONLY EVER DOWNGRADE ───────────────────────────
 * The server knows things this file cannot — an entitlement that caps the feed
 * at 15 minutes, a feed gap, a seeded row. When it says `delayed` or `stale`,
 * that verdict stands. This file may make a label WORSE as time passes and may
 * never make one better, because a client that can promote a label can promote
 * a wrong one, and "Live" is the single word in the app that has to be earned.
 *
 * Pure by design (no React, no react-native) so `scripts/live-refresh-test.mts`
 * can assert the decay and the never-promote rule directly.
 */
import type { DelayReason, Freshness } from './types';
import { currentSession, type MarketSession } from './market-session';

/**
 * How long a price may keep each word, per session.
 *
 * The `live` window is deliberately wider than the poll interval plus a grace
 * period — `open` polls every 15s, `extended` every 60s — because a threshold
 * tighter than the refresh cadence makes the mark flicker between Live and
 * Delayed on a screen that is working perfectly.
 */
const WINDOW: Record<Exclude<MarketSession, 'closed'>, { live: number; delayed: number }> = {
  open: { live: 60_000, delayed: 5 * 60_000 },
  extended: { live: 90_000, delayed: 10 * 60_000 },
};

/** Worst-wins ordering. Only these three participate; see `decayFreshness`. */
const RANK: Record<'live' | 'delayed' | 'stale', number> = { live: 0, delayed: 1, stale: 2 };

/**
 * The freshness this price has EARNED, given how old it is.
 *
 * Returns `freshness` unchanged whenever there is nothing to compute from:
 *
 *  · `market_closed` / `seed` — "Market closed" is the honest word for a
 *    Saturday price and decaying it to "Stale" would replace a true statement
 *    with an alarming one. Same for sample data, which is labelled as sample.
 *  · no timestamp — there is no clock to compare against, and guessing would be
 *    the same failure in the other direction.
 *  · already `closed` / `unknown` — neither is a claim about recency.
 *  · market closed right now — every price is old at 3am and that is not news.
 */
export function decayFreshness(
  freshness: Freshness | undefined,
  reason?: DelayReason | null,
  at?: string | null,
  opts: { now?: number; session?: MarketSession } = {},
): Freshness {
  const given = freshness ?? 'unknown';
  if (reason === 'market_closed' || reason === 'seed') return given;
  if (given !== 'live' && given !== 'delayed') return given;
  if (!at) return given;

  const session = opts.session ?? currentSession();
  if (session === 'closed') return given;

  const now = opts.now ?? Date.now();
  const stamped = Date.parse(at);
  if (Number.isNaN(stamped)) return given;
  const age = now - stamped;
  // A timestamp in the future is a clock disagreement, not freshness. Leave it.
  if (age < 0) return given;

  const w = WINDOW[session];
  const earned: 'live' | 'delayed' | 'stale' =
    age > w.delayed ? 'stale' : age > w.live ? 'delayed' : 'live';

  // Worst wins — this is the whole never-promote rule, in one expression.
  return RANK[earned] > RANK[given] ? earned : given;
}
