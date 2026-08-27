import { useCallback, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { fixtureAlertDetail, fixtureAlertLifecycle } from '../../lib/fixtures';
import type { AlertDetail, AlertDraftPreview, AlertLifecycle, AlertMonitoring } from '../../lib/types';

/** GET /alerts, grouped into the five lifecycle sections. */
export function useAlertsLifecycle() {
  return useResource<AlertLifecycle>(() => api.alertsLifecycle(), fixtureAlertLifecycle, []);
}

export function useAlertDetail(id: string) {
  const fallback: AlertDetail = { ...fixtureAlertDetail, id: id || fixtureAlertDetail.id };
  return useResource<AlertDetail>(() => api.alertDetail(id), fallback, [id]);
}

/**
 * The one sentence the UI is allowed to say about monitoring this round.
 * There is no evaluation worker yet, so an active alert is honest about it
 * instead of implying it is already watching the tape. The server's own
 * `monitoring_plain` wins whenever it sends one.
 */
export function monitoringLine(
  m: AlertMonitoring | null | undefined,
  plain?: string | null,
): string | null {
  if (plain) return plain;
  if (m === 'armed_no_feed') return 'armed · evaluation starts when market data goes live';
  if (m === 'armed') return 'armed';
  if (m === 'evaluating') return 'watching the market now';
  if (m === 'not_armed') return "not armed — Kai isn't watching this yet";
  return null;
}

type Busy = { id: string | null; error: string | null };

/** Activate a draft / pause / resume / cancel, with the entitlement error surfaced. */
export function useAlertActions(onChanged?: () => void) {
  const [busy, setBusy] = useState<Busy>({ id: null, error: null });
  const [upgradeNeeded, setUpgradeNeeded] = useState<string | null>(null);

  const run = useCallback(async (id: string, fn: () => Promise<unknown>) => {
    setBusy({ id, error: null });
    try {
      await fn();
      onChanged?.();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ENTITLEMENT_REQUIRED') {
        setUpgradeNeeded(e.message);
      } else {
        setBusy({ id: null, error: e instanceof Error ? e.message : 'That did not go through. Try again.' });
        return;
      }
    }
    setBusy({ id: null, error: null });
  }, [onChanged]);

  return {
    busyId: busy.id,
    error: busy.error,
    upgradeNeeded,
    dismissUpgrade: () => setUpgradeNeeded(null),
    activate: (draftId: string) => run(draftId, () => api.activateAlert(draftId)),
    act: (id: string, action: 'pause' | 'resume' | 'cancel' | 'edit', nl?: string) =>
      run(id, () => api.alertAction(id, action, nl)),
  };
}

/** The natural-language builder: type a sentence, see the structured condition. */
export function useAlertBuilder() {
  const [preview, setPreview] = useState<AlertDraftPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async (text: string, refs: { symbol?: string; setup_id?: string; level?: number } = {}) => {
    setPending(true);
    setError(null);
    if (!api.available()) {
      // Fixtures: parse the sentence locally so the preview is real, not canned.
      const symbol = (text.match(/\b[A-Z]{1,5}\b/) ?? [''])[0];
      const level = Number((text.match(/(\d+(?:\.\d+)?)/) ?? [])[1] ?? NaN);
      const below = /below|under|drops?|falls?/i.test(text);
      setPreview({
        alert_id: 'draft-local',
        natural_language: text,
        summary_plain: symbol && Number.isFinite(level)
          ? `I'll tell you when ${symbol} trades ${below ? 'below' : 'above'} $${level}.`
          : "I need a symbol and a price to watch. Try: “Watch META for a break above 504”.",
        symbol,
        structured: symbol && Number.isFinite(level)
          ? [
              { label: `${symbol} last price`, value: `${below ? 'below' : 'above'} ${level}` },
              { label: 'Confirmed by', value: '5-minute close' },
              { label: 'Fires', value: 'once' },
            ]
          : [],
      });
      setPending(false);
      return;
    }
    try {
      setPreview(await api.draftAlertPreview(text, refs));
    } catch (e) {
      setError(e instanceof Error ? e.message : "I couldn't read that as an alert. Try naming a symbol and a price.");
    } finally {
      setPending(false);
    }
  }, []);

  return { preview, pending, error, build, clear: () => setPreview(null) };
}
