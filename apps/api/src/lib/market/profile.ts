/**
 * Company profiles — Polygon `/v3/reference/tickers/{symbol}`, cached in
 * `instruments.meta`, refreshed weekly.
 *
 * WHY A CACHE COLUMN AND NOT A FETCH PER SCREEN
 * ---------------------------------------------
 * The plan allows 5 Polygon requests a minute (README "Rate limit"), and a
 * company description does not change between two page loads. So the profile is
 * written into `instruments.meta.profile` with a `refreshed_at`, and a symbol
 * whose profile is younger than a week costs ZERO requests. The alert cards,
 * the ticker page and the Trade Portal all read the same cached row.
 *
 * TWO SENTENCES, NOT A PROSPECTUS
 * -------------------------------
 * Spec §3 asks for "one or two beginner-friendly sentences describing the
 * business and relevant context". Polygon's `description` is a paragraph of
 * filing prose, so it is TRIMMED to its first two sentences — trimmed, never
 * rewritten. We do not paraphrase a company description with a language model:
 * that is how a factual field turns into a generated one.
 *
 * THE SEED FALLBACK
 * -----------------
 * The ten seeded instruments have hand-written two-sentence summaries below.
 * They are used when Polygon is not configured, is rate limited, or has nothing
 * for the symbol — and they come back with `source:'seed'` so the app can be
 * honest that the copy is ours, not the filing's. A symbol with neither answers
 * `source:'none'` and null fields; nothing is invented to fill the card.
 */
import type { CompanyProfile } from '@shared/api';
import { serviceClient } from '../db';
import { log } from '../log';
import { fetchTickerReference } from './polygon';

const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How many stale profiles one request may refresh in the background. Polygon
 * allows five requests a minute in total (README "Rate limit"), and a page that
 * quietly spent all five refreshing descriptions would starve the QUOTE path —
 * which is the one a user notices. One at a time; the rest wait for the next
 * page load, holding cached copy that is at most a week old.
 */
const MAX_BACKGROUND_REFRESHES = 1;

/* ------------------------------------------------------------------ */
/* Seed fallback — ours, and labelled as ours                           */
/* ------------------------------------------------------------------ */

type Seed = { summary: string; sector: string };

const SEED: Record<string, Seed> = {
  META: {
    summary:
      'Meta Platforms owns Facebook, Instagram and WhatsApp. Almost all of its money comes from selling advertising against the attention those apps collect.',
    sector: 'Communication Services',
  },
  NVDA: {
    summary:
      'Nvidia designs the chips that most artificial-intelligence systems are trained and run on. Its data-centre business is now far larger than the gaming business it started in.',
    sector: 'Technology',
  },
  AAPL: {
    summary:
      'Apple makes the iPhone, Mac and their accessories, and sells services on top of them. Hardware still drives the revenue, and services carry the higher margin.',
    sector: 'Technology',
  },
  TSLA: {
    summary:
      'Tesla builds electric cars and energy-storage systems. Deliveries and pricing decide the quarter, and the driver-assistance software is the part the market argues about.',
    sector: 'Consumer Cyclical',
  },
  AMD: {
    summary:
      'AMD designs processors and graphics chips for computers and data centres. It competes directly with Intel in processors and with Nvidia in AI accelerators.',
    sector: 'Technology',
  },
  MSFT: {
    summary:
      'Microsoft sells Windows, Office and the Azure cloud to businesses. Cloud and software subscriptions are the engine, not the desktop software it is named for.',
    sector: 'Technology',
  },
  AMZN: {
    summary:
      'Amazon runs the largest online store in the United States and the largest cloud business in the world. AWS produces most of the operating profit; retail produces most of the revenue.',
    sector: 'Consumer Cyclical',
  },
  CRM: {
    summary:
      'Salesforce sells software that companies use to track their customers and sales. It is a subscription business, so renewals matter more than any single quarter of new sales.',
    sector: 'Technology',
  },
  SPY: {
    summary:
      'SPY is a fund that holds the 500 largest listed US companies in one basket. Buying it is a bet on the American market as a whole rather than on any one company.',
    sector: 'Index ETF',
  },
  QQQ: {
    summary:
      'QQQ is a fund holding the hundred largest non-financial companies on the Nasdaq. It leans heavily towards technology, so it moves more than the broad market in both directions.',
    sector: 'Index ETF',
  },
};

/* ------------------------------------------------------------------ */
/* Shaping                                                              */
/* ------------------------------------------------------------------ */

/** First two sentences of the filing description. Trimmed, never rewritten. */
export function twoSentences(text: string | null | undefined): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const parts = clean.match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length === 0) return clean.slice(0, 260);
  return parts.slice(0, 2).join(' ').trim();
}

export function marketCapPlain(n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function emptyProfile(symbol: string, name: string | null): CompanyProfile {
  return {
    symbol,
    name,
    summary: null,
    sector: null,
    market_cap: null,
    market_cap_plain: null,
    next_earnings: null,
    pe: null,
    employees: null,
    homepage: null,
    logo_url: null,
    source: 'none',
    refreshed_at: null,
  };
}

function seedProfile(symbol: string, name: string | null): CompanyProfile {
  const s = SEED[symbol];
  if (!s) return emptyProfile(symbol, name);
  return {
    ...emptyProfile(symbol, name),
    summary: s.summary,
    sector: s.sector,
    source: 'seed',
  };
}

function fromMeta(symbol: string, name: string | null, meta: Record<string, unknown> | null): CompanyProfile | null {
  const p = (meta?.profile ?? null) as Record<string, unknown> | null;
  if (!p) return null;
  const cap = p.market_cap === null || p.market_cap === undefined ? null : Number(p.market_cap);
  return {
    symbol,
    name: (p.name as string) ?? name,
    summary: (p.summary as string) ?? null,
    sector: (p.sector as string) ?? null,
    market_cap: Number.isFinite(cap as number) ? (cap as number) : null,
    market_cap_plain: marketCapPlain(Number.isFinite(cap as number) ? (cap as number) : null),
    next_earnings: (p.next_earnings as string) ?? null,
    pe: p.pe === null || p.pe === undefined ? null : Number(p.pe),
    employees: p.employees === null || p.employees === undefined ? null : Number(p.employees),
    homepage: (p.homepage as string) ?? null,
    logo_url: (p.logo_url as string) ?? null,
    source: (p.source as CompanyProfile['source']) ?? 'polygon',
    refreshed_at: (p.refreshed_at as string) ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* The read                                                             */
/* ------------------------------------------------------------------ */

const inFlight = new Map<string, Promise<unknown>>();

/**
 * The profile for one symbol. Cache-first; a refresh is fired in the background
 * when the stored copy is older than a week, so a page load is never blocked on
 * a reference lookup and never spends the request budget twice for one symbol.
 */
export async function getCompanyProfile(symbol: string): Promise<CompanyProfile> {
  const sym = symbol.toUpperCase();
  const db = serviceClient();
  const { data } = await db.from('instruments').select('symbol,name,meta').eq('symbol', sym).maybeSingle();
  const row = (data as Record<string, unknown> | null) ?? null;
  const name = (row?.name as string) ?? null;
  const meta = (row?.meta as Record<string, unknown> | null) ?? null;

  const cached = fromMeta(sym, name, meta);
  const age = cached?.refreshed_at ? Date.now() - new Date(cached.refreshed_at).getTime() : Infinity;

  if (!cached || age > REFRESH_MS) {
    // Refresh in the background. `void` on purpose — the caller gets whatever
    // we already have, which is the point of caching a company description.
    if (!inFlight.has(sym)) {
      const p = refreshCompanyProfile(sym, name)
        .catch(() => undefined)
        .finally(() => inFlight.delete(sym));
      inFlight.set(sym, p);
      // With nothing cached at all, wait for it once — a first view of a symbol
      // should not show an empty Overview when one request would fill it.
      if (!cached) {
        await p;
        const again = await db.from('instruments').select('meta').eq('symbol', sym).maybeSingle();
        const fresh = fromMeta(sym, name, (again.data as Record<string, unknown> | null)?.meta as Record<string, unknown> | null);
        if (fresh) return fresh;
      }
    }
  }

  return cached ?? seedProfile(sym, name);
}

/** Profiles for many symbols in one read. Refreshes happen in the background. */
export async function getCompanyProfiles(symbols: string[]): Promise<Map<string, CompanyProfile>> {
  const out = new Map<string, CompanyProfile>();
  const syms = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (!syms.length) return out;
  const db = serviceClient();
  const { data } = await db.from('instruments').select('symbol,name,meta').in('symbol', syms);
  let refreshed = 0;
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const sym = String(r.symbol);
    const name = (r.name as string) ?? null;
    const cached = fromMeta(sym, name, (r.meta as Record<string, unknown> | null) ?? null);
    out.set(sym, cached ?? seedProfile(sym, name));
    const age = cached?.refreshed_at ? Date.now() - new Date(cached.refreshed_at).getTime() : Infinity;
    if (age > REFRESH_MS && !inFlight.has(sym) && refreshed < MAX_BACKGROUND_REFRESHES) {
      refreshed += 1;
      const p = refreshCompanyProfile(sym, name)
        .catch(() => undefined)
        .finally(() => inFlight.delete(sym));
      inFlight.set(sym, p);
    }
  }
  for (const s of syms) if (!out.has(s)) out.set(s, seedProfile(s, null));
  return out;
}

/**
 * Fetch and store. Writes `instruments.meta.profile`, merging rather than
 * replacing `meta` so anything else living in that column survives.
 */
export async function refreshCompanyProfile(symbol: string, knownName: string | null = null): Promise<CompanyProfile> {
  const sym = symbol.toUpperCase();
  const db = serviceClient();

  let profile: CompanyProfile = seedProfile(sym, knownName);

  try {
    // Through the token bucket, never around it — see fetchTickerReference.
    const r = await fetchTickerReference(sym);
    if (r) {
      const cap = typeof r.market_cap === 'number' ? r.market_cap : null;
      const summary = twoSentences(r.description) ?? SEED[sym]?.summary ?? null;
      profile = {
        symbol: sym,
        name: r.name ?? knownName,
        summary,
        sector: r.sic_description ?? SEED[sym]?.sector ?? null,
        market_cap: cap,
        market_cap_plain: marketCapPlain(cap),
        // Polygon's reference endpoint carries no earnings date and no P/E on
        // this plan. Null is the honest answer; a guessed date on a card that
        // says "Next earnings" would be a fabricated fact.
        next_earnings: null,
        pe: null,
        employees: typeof r.total_employees === 'number' ? r.total_employees : null,
        homepage: r.homepage_url ?? null,
        logo_url: r.branding?.icon_url ?? r.branding?.logo_url ?? null,
        source: r.description ? 'polygon' : SEED[sym] ? 'seed' : 'none',
        refreshed_at: new Date().toISOString(),
      };
    }
  } catch (e) {
    log('warn', 'profile', 'company_profile.fetch_failed', {
      symbol: sym,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (!profile.refreshed_at) profile = { ...profile, refreshed_at: new Date().toISOString() };

  try {
    const { data } = await db.from('instruments').select('meta').eq('symbol', sym).maybeSingle();
    const meta = ((data as Record<string, unknown> | null)?.meta as Record<string, unknown> | null) ?? {};
    await db
      .from('instruments')
      .update({ meta: { ...meta, profile: { ...profile } } })
      .eq('symbol', sym);
  } catch (e) {
    log('warn', 'profile', 'company_profile.store_failed', {
      symbol: sym,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return profile;
}

/** The two-sentence line the alert card and the ticker Overview both show. */
export function summaryFor(profile: CompanyProfile | null | undefined): string | null {
  return profile?.summary ?? null;
}
