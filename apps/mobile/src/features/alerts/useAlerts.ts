import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { useMarketRefresh } from '../../lib/useMarketRefresh';
import {
  fixtureAlertDetail, fixtureAlertLifecycle, fixtureAlertsRound4, fixtureAlertsRound4Empty,
  fixtureAlertsSimple,
} from '../../lib/fixtures';
import { mergeAlertsTab } from '../../lib/adapters';
import { alertsChanged } from './attention';
import type {
  AlertBoardTab, AlertDetail, AlertDraftPreview, AlertLifecycle, AlertMonitoring, AlertsRound4,
  AlertsSimple, AlertTab, GoalMode,
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
      /*
        THE BADGE IS PART OF "IT WORKED" — audit F18.

        Activating, pausing, resuming or cancelling an alert changes what needs
        the member, and the tab's attention dot is drawn from that same set. It
        is forced rather than throttled because this is the exact moment the
        finding is about: acknowledging the thing the dot points at has to clear
        the dot, not sixty seconds later.
      */
      alertsChanged(true);
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
export function useAlertsRound4(mode: GoalMode, fixture: 'default' | 'empty' = 'default') {
  const offline = !api.available();
  // Fixtures preview only — lets the owner and Playwright see the quiet day.
  const seed = fixture === 'empty' ? fixtureAlertsRound4Empty : fixtureAlertsRound4;
  const [tab, setTab] = useState<AlertBoardTab>('active');
  const [data, setData] = useState<AlertsRound4 | null>(offline ? seed : null);
  const [loading, setLoading] = useState(!offline);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  /**
   * WHEN THE CARDS ON SCREEN WERE LAST CONFIRMED — audit F18 asks for a "Last
   * checked" line "when the service can support it", and this is the service
   * supporting it: the instant a payload actually arrived, not the instant one
   * was asked for. It is what the stale notice prints, so a board whose refresh
   * has been failing says how old the answer under it is.
   */
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  /**
   * Set immediately before a POLL bumps the tick. A background refresh must not
   * raise the board's loading state — a list of trade cards that flashes into a
   * spinner every fifteen seconds is unusable — and must not throw away good
   * cards when one request fails. Read once, at the top of the effect.
   */
  const quiet = useRef(false);

  /**
   * THE MODE THE HELD CARDS ARE ABOUT, adjusted during render rather than in an
   * effect.
   *
   * An effect runs AFTER the browser has painted, so clearing the old mode's
   * cards there would show them for one frame on the new mode's board — which
   * is the bug, briefly, rather than the fix. Setting state during render is
   * React's own answer to "this state is stale for the props I was just given":
   * it re-renders immediately, before anything is committed to the screen, so
   * the day-trade board's first paint is a spinner and never a swing card.
   */
  const [shownMode, setShownMode] = useState<GoalMode>(mode);
  if (shownMode !== mode) {
    setShownMode(mode);
    setData(offline ? seed : null);
    setLoading(!offline);
    setError(null);
  }

  /**
   * REQUEST IDENTITY. `alive` alone says "a newer effect run exists"; it cannot
   * say which mode the reply in hand is about, so it depends on the effect
   * having re-run for the right reason. This ref is the fact itself: every
   * request is stamped, and only the newest stamp may write.
   */
  const seqRef = useRef(0);

  /**
   * Which of the server's buckets this board tab needs. `community` needs none
   * of them — it is a different route entirely — so it never fires a request
   * and never blanks the alert lists already held.
   */
  const wanted: AlertTab[] =
    tab === 'active' ? ['active', 'watching'] : tab === 'history' ? ['history'] : [];

  useEffect(() => {
    if (offline) { setData(seed); setLoading(false); return; }
    const isQuiet = quiet.current;
    quiet.current = false;
    if (!wanted.length) { setLoading(false); return; }
    let alive = true;
    const seq = ++seqRef.current;
    if (!isQuiet) setLoading(true);
    Promise.all(wanted.map((t) => api.alertsRound4(t).then((incoming) => ({ t, incoming }))))
      .then((answers) => {
        if (!alive || seq !== seqRef.current) return;
        /*
         * THE SERVER SAYS WHICH BOARD IT ANSWERED, AND WE BELIEVE IT OVER THE
         * ORDER THE PROMISES RESOLVED IN.
         *
         * `/alerts` is scoped by the profile row, not by anything in the
         * request, so a reply sent before the mode changed is a perfectly valid
         * answer to a question nobody is asking any more. `payload.mode` is the
         * mode that actually filtered those rows; if it is not the mode on
         * screen, the cards are dropped and the board stays on its loading
         * state until the request that belongs to it comes back.
         *
         * A build that does not send the field yet answers `null`, which is
         * read as "this server cannot tell me" — the stamp above is then the
         * only guard, which is where this code already was.
         */
        const wrongMode = answers.find(({ incoming }) => incoming.mode && incoming.mode !== mode);
        if (wrongMode) return;
        setData((prev) => answers.reduce(
          (acc: AlertsRound4 | null, { t, incoming }) => (acc ? mergeAlertsTab(acc, incoming, t) : incoming),
          prev,
        ));
        setError(null);
        setCheckedAt(Date.now());
        /*
          A FRESH BOARD IS A FRESH READING. The cards that just landed are the
          same lifecycle the tab's dot is drawn from, so the store is told to
          re-ask — gently, because this also runs on every fifteen-second poll
          and the dot is not worth a second request at that cadence.
        */
        alertsChanged();
      })
      .catch((e: unknown) => {
        if (!alive || seq !== seqRef.current) return;
        // A poll that failed leaves the cards that are already on screen. They
        // were true when they arrived and their freshness marks age honestly.
        if (isQuiet) return;
        setError(e instanceof ApiError && e.code === 'NOT_FOUND'
          ? "That part of the service isn't live yet."
          : e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      })
      .finally(() => { if (alive && seq === seqRef.current && !isQuiet) setLoading(false); });
    return () => { alive = false; };
    // `wanted` is derived from `tab` and rebuilt every render; `tab` is the dep.
    // `mode` is a dep because the board is ONE MODE'S BOARD and the server
    // scopes it by the profile — switching the mode has to re-ask, and before
    // this line it did not, which is how a day trader read a list of swing
    // picks until he changed tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, seed, tab, tick, mode]);

  /**
   * NEVER HAND BACK THE OTHER MODE'S CARDS. Every path above already refuses to
   * store them, and this is the line that makes that a property of the hook
   * instead of a property of five correct branches: if what is held is not
   * about the mode being displayed, the board is given nothing and draws its
   * loading state.
   */
  const forShownMode = data && (!data.mode || data.mode === mode) ? data : null;

  /**
   * EVERY CARD ON THIS BOARD CARRIES A PRICE, so the board is a price surface.
   * It refreshes on the quote cadence and by asking `/alerts?tab=` again —
   * one request per visible bucket, never one per card. The Community tab
   * fetches nothing here, so it polls nothing either.
   */
  useMarketRefresh({
    onRefresh: useCallback(() => { quiet.current = true; setTick((t) => t + 1); }, []),
    kind: 'quote',
    enabled: !offline && tab !== 'community',
  });

  return {
    data: forShownMode,
    loading: loading || (!!data && !forShownMode),
    error, tab, setTab, checkedAt,
    isFixture: offline,
    reload: () => setTick((t) => t + 1),
  };
}
