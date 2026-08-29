/**
 * The three connectors, registered in display order.
 *
 * Importing this module is what puts them in the registry, so every route that
 * touches sync imports THIS rather than the individual files — a route that
 * imported only `app` would report a Sources screen with one source on it and
 * be indistinguishable from a Sources screen that is correct.
 */
import { allSources, getSource, registerSource, type Source, type SourcePlan } from './source';
import { appSource } from './sources/app';
import { kaiSmsSource } from './sources/kai-sms';
import { stripeSource } from './sources/stripe';

let booted = false;

export function bootSources(): void {
  if (booted) return;
  registerSource(appSource);
  registerSource(kaiSmsSource);
  registerSource(stripeSource);
  booted = true;
}

export function sources(): Source[] {
  bootSources();
  return allSources();
}

export function source(name: string): Source | null {
  bootSources();
  return getSource(name as never);
}

export type { SourcePlan };
