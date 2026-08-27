/**
 * Client preferences that have no column of their own.
 *
 * Accessibility (`reduced_motion`, `text_scale`) is stored in
 * `profiles.onboarding -> 'prefs'`. 01 §2 has no accessibility column and
 * adding one belongs to SCHEMA-2, not this lane; `onboarding` is already the
 * profile's free-form config jsonb, and namespacing under `prefs` keeps it
 * clear of the onboarding answers themselves.
 */
import type { Accessibility } from '@shared/api';

export const DEFAULT_ACCESSIBILITY: Accessibility = { reduced_motion: false, text_scale: 1 };

export type Prefs = { accessibility: Accessibility };

export function readPrefs(onboarding: Record<string, unknown> | null | undefined): Prefs {
  const prefs = (onboarding?.prefs ?? {}) as Record<string, unknown>;
  const a = (prefs.accessibility ?? {}) as Record<string, unknown>;
  const scale = Number(a.text_scale);
  return {
    accessibility: {
      reduced_motion: Boolean(a.reduced_motion),
      text_scale: Number.isFinite(scale) && scale >= 0.8 && scale <= 2 ? scale : DEFAULT_ACCESSIBILITY.text_scale,
    },
  };
}

export function writePrefs(
  onboarding: Record<string, unknown> | null | undefined,
  patch: Partial<Accessibility>
): Record<string, unknown> {
  const base = { ...(onboarding ?? {}) };
  const prefs = { ...((base.prefs as Record<string, unknown>) ?? {}) };
  const current = readPrefs(base).accessibility;
  prefs.accessibility = { ...current, ...patch };
  base.prefs = prefs;
  return base;
}
