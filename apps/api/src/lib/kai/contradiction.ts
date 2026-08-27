/**
 * Contradiction validator (03 Unit 3), minimal v1-slice subset.
 *
 * Applied pre-publication to every financial Kai object. Checks:
 *  1. intent vs target orientation  — long targets above entry, short below.
 *  2. stop vs entry                 — long stop below entry, short stop above.
 *  3. narrative-vs-structured       — every price mentioned in the narrative
 *                                     must exist in a structured field, in the
 *                                     context Kai was given, or be derivable
 *                                     from them (|entry-stop|, R multiples).
 *                                     This is the anti-invention rule: it
 *                                     catches numbers Kai made up, not numbers
 *                                     the scanner or the risk policy supplied.
 *  4. grade / state coherence       — an invalidated setup is not "ready".
 *
 * Failure → regenerate once (caller's job) → drop the object and log.
 * VALIDATION_INCOHERENT is internal-only and never reaches the client.
 */
import type { GradedSetupPayload } from '@shared/api';

export type ValidationResult = { ok: true } | { ok: false; failures: string[] };

const PRICE_RE = /\$\s?(\d{1,6}(?:,\d{3})*(?:\.\d{1,4})?)/g;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005 * Math.max(1, Math.abs(b));
}

export function structuredPrices(p: GradedSetupPayload): number[] {
  const out: number[] = [];
  // Derived-but-legitimate values.
  if (typeof p.entry === 'number' && typeof p.stop === 'number') {
    const per = Math.abs(p.entry - p.stop);
    out.push(per, Math.round(per * 100) / 100);
    for (const t of p.targets ?? []) {
      if (typeof t.price === 'number' && per > 0) {
        out.push(Math.round((Math.abs(t.price - p.entry) / per) * 100) / 100);
      }
    }
  }
  if (typeof p.entry === 'number') out.push(p.entry);
  if (typeof p.stop === 'number') out.push(p.stop);
  for (const t of p.targets ?? []) if (typeof t.price === 'number') out.push(t.price);
  if (typeof p.quote?.price === 'number') out.push(p.quote.price);
  if (typeof p.est_risk_usd === 'number') out.push(p.est_risk_usd);
  for (const src of [p.entry_condition, p.invalidation]) {
    if (src && typeof src === 'object') {
      for (const v of Object.values(src as Record<string, unknown>)) {
        const n = Number(v);
        if (Number.isFinite(n)) out.push(n);
      }
    }
  }
  return out;
}

/** Prices the model wrote in prose that are not backed by a structured field. */
export function unbackedNarrativePrices(
  narrative: string,
  p: GradedSetupPayload,
  allowedFromContext: number[] = []
): number[] {
  const known = [...structuredPrices(p), ...allowedFromContext];
  const found: number[] = [];
  for (const m of narrative.matchAll(PRICE_RE)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    if (!known.some((k) => near(n, k))) found.push(n);
  }
  return found;
}

export function validateGradedSetup(
  p: GradedSetupPayload,
  narrative = '',
  allowedFromContext: number[] = []
): ValidationResult {
  const failures: string[] = [];
  const long = p.intent === 'buy_to_open' || p.intent === 'buy_to_cover';
  const targets = (p.targets ?? []).map((t) => t.price).filter((n) => Number.isFinite(n));

  if (typeof p.entry === 'number') {
    for (const t of targets) {
      if (long && t <= p.entry) failures.push(`long target ${t} is not above entry ${p.entry}`);
      if (!long && t >= p.entry) failures.push(`short target ${t} is not below entry ${p.entry}`);
    }
    if (typeof p.stop === 'number') {
      if (long && p.stop >= p.entry) failures.push(`long stop ${p.stop} is not below entry ${p.entry}`);
      if (!long && p.stop <= p.entry) failures.push(`short stop ${p.stop} is not above entry ${p.entry}`);
    }
  }

  if (p.state === 'invalidated' && /\bready\b/i.test(p.next_action ?? '')) {
    failures.push('setup is invalidated but next_action reads as ready');
  }
  if (p.grade_band && p.grade_display && !p.grade_display.startsWith(p.grade_band)) {
    failures.push(`grade_display ${p.grade_display} does not sit inside band ${p.grade_band}`);
  }

  const unbacked = unbackedNarrativePrices(narrative, p, allowedFromContext);
  if (unbacked.length) {
    failures.push(`narrative mentions price(s) ${unbacked.join(', ')} that are not in the structured fields`);
  }

  return failures.length ? { ok: false, failures } : { ok: true };
}
