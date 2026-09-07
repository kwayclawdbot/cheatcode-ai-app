import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import {
  fixtureAlertDetail, fixtureAlertLifecycle, fixtureAlertsRound4, fixtureAlertsRound4Empty,
  fixtureAlertsSimple,
} from '../../lib/fixtures';
import { mergeAlertsTab } from '../../lib/adapters';
import type {
  AlertBoardTab, AlertDetail, AlertDraftPreview, AlertLifecycle, AlertMonitoring, AlertsRound4,
  AlertsSimple, AlertTab,
} from '../../lib/types';

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
    // The composer has no symbol context of its own, so anything the SENTENCE
    // names is passed as a known reference. The server still parses the
    // sentence authoritatively — this only makes sure the alert it writes is
    // attached to a symbol, which is what every downstream object keys on.
    const hinted = { ...refs };
    if (!hinted.symbol) {
      const sym = (text.match(/\$([A-Za-z]{1,5})\b/) ?? text.match(/\b([A-Z]{2,5})\b/) ?? [])[1];
      if (sym) hinted.symbol = sym.toUpperCase();
    }
    if (hinted.level === undefined) {
      const lvl = Number((text.match(/(\d+(?:\.\d+)?)/) ?? [])[1] ?? NaN);
      if (Number.isFinite(lvl)) hinted.level = lvl;
    }
    refs = hinted;
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

/* ==================================================================== */
/* V5 — Attention · Monitoring · History (audit §6)                     */
/* ==================================================================== */

/**
 * `GET /alerts` collapsed to three buckets.
 * The five internal states are still what the server keeps; the screen just
 * stops making the user learn them. "Active Trades" is gone: a position's
 * monitoring event is a MONITORING ROW here, and the position itself lives in
 * Trade.
 */
export function useAlertsSimple() {
  return useResource<AlertsSimple>(() => api.alertsSimple(), fixtureAlertsSimple, []);
}

/* ==================================================================== */
/* Round 4 — alerts are complete trade objects (docs/10 §1)             */
/* ==================================================================== */

/**
 * `GET /alerts?tab=` → the server's Active · Watching · History, read by a
 * board that draws Active · Community · History.
 *
 * The API answers with the requested tab's cards plus the counts for all
 * three, so the hook keeps the three lists it has already seen and refreshes
 * only what the visible tab needs. Switching tabs therefore never blanks the
 * screen.
 *
 * ── WHY THE ACTIVE TAB COSTS TWO REQUESTS ────────────────────────────────
 * Watching folded into Active on 7 Sept (see `AlertBoardTab`). The server still
 * shapes three buckets, on purpose: `alerts.tab` is a GENERATED column and the
 * lifecycle mapping behind it is the same one History and the resolver read.
 * So the fold is done here, and the board's Active tab has to hold both lists —
 * which means asking for both. They go out together rather than one after the
 * other, so the screen waits for the slower of the two and not for their sum.
 *
 * The alternative was teaching `?tab=` to mean "active and watching", which is
 * a third meaning for a word the database already defines, for the sake of one
 * request. `history` still costs exactly one.
 */
export function useAlertsRound4(fixture: 'default' | 'empty' = 'default') {
  const offline = !api.available();
  // Fixtures preview only — lets the owner and Playwright see the quiet day.
  const seed = fixture === 'empty' ? fixtureAlertsRound4Empty : fixtureAlertsRound4;
  const [tab, setTab] = useState<AlertBoardTab>('active');
  const [data, setData] = useState<AlertsRound4 | null>(offline ? seed : null);
  const [loading, setLoading] = useState(!offline);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  /**
   * Which of the server's buckets this board tab needs. `community` needs none
   * of them — it is a different route entirely — so it never fires a request
   * and never blanks the alert lists already held.
   */
  const wanted: AlertTab[] =
    tab === 'active' ? ['active', 'watching'] : tab === 'history' ? ['history'] : [];

  useEffect(() => {
    if (offline) { setData(seed); setLoading(false); return; }
    if (!wanted.length) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    Promise.all(wanted.map((t) => api.alertsRound4(t).then((incoming) => ({ t, incoming }))))
      .then((answers) => {
        if (!alive) return;
        setData((prev) => answers.reduce(
          (acc: AlertsRound4 | null, { t, incoming }) => (acc ? mergeAlertsTab(acc, incoming, t) : incoming),
          prev,
        ));
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiError && e.code === 'NOT_FOUND'
          ? "That part of the service isn't live yet."
          : e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // `wanted` is derived from `tab` and rebuilt every render; `tab` is the dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, seed, tab, tick]);

  return {
    data, loading, error, tab, setTab,
    isFixture: offline,
    reload: () => setTick((t) => t + 1),
  };
}
