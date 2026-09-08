import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { fixtureKaiProfile, fixtureMe, fixtureMemory, fixtureNotifications, fixtureRuleAdherence } from '../../lib/fixtures';
import { EXPERIENCE_LABEL, EXPERIENCE_VOICE, MODE_LABEL, focusList } from './profile';
import type { SaveStatus } from './controls';
import type { Experience, FocusKey, GoalMode, Me, MemoryRow, NotificationRow, RuleAdherence } from '../../lib/types';

export function useMe() {
  return useResource<Me>(() => api.me(), fixtureMe, []);
}

export function useNotifications(group?: string) {
  const fallback = group ? fixtureNotifications.filter((n) => n.group === group) : fixtureNotifications;
  return useResource<NotificationRow[]>(() => api.notifications(group), fallback, [group ?? '']);
}

export function useMemory() {
  return useResource<MemoryRow[]>(() => api.memory(), fixtureMemory, []);
}

/**
 * PUT /settings. Optimistic: the control moves at once and reverts with a plain
 * message if the server refuses — a settings toggle that lags feels broken.
 *
 * IT NOW REPORTS SUCCESS AS WELL AS FAILURE, and it keeps the failed patch.
 * A settings screen that says nothing on a good save leaves the person with no
 * way to tell a saved change from a tap that missed the row; and a failure the
 * user cannot retry without guessing which control to poke again is a dead end.
 * `status` drives `SaveNote`, and `retry` re-sends the exact patch that failed.
 */
export function useSettingsWriter(onSaved?: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  /** The last patch that failed, so Try again means "that change", not "some change". */
  const failed = useRef<Record<string, unknown> | null>(null);
  /** "Saved" fades; an error does not. Cleared on unmount so a late timer cannot fire. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    if (!api.available()) return true;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setStatus('saving');
    setError(null);
    try {
      await api.putSettings(patch);
      failed.current = null;
      onSaved?.();
      setStatus('saved');
      timer.current = setTimeout(() => setStatus('idle'), 2400);
      return true;
    } catch (e) {
      failed.current = patch;
      setError(e instanceof Error ? e.message : "That setting didn't save. Try again.");
      setStatus('error');
      return false;
    }
  }, [onSaved]);

  const retry = useCallback(async () => {
    const patch = failed.current;
    if (!patch) return true;
    return save(patch);
  }, [save]);

  return { save, retry, status, saving: status === 'saving', error };
}

/*
 * `useCheckout` IS GONE AND MUST NOT COME BACK.
 *
 * It called `POST /billing/checkout` and opened Stripe in a browser sheet. That
 * is a purchase path inside the app, which breaks App Store rule 3.1.3(b) —
 * the rule that lets this app honour a subscription bought on the website
 * without In-App Purchase. Plans are changed on the website; the app honours
 * whatever plan the account already has. See `apps/api/src/lib/storefront.ts`.
 */

/* ==================================================================== */
/* Round 4 — YOUR KAI PROFILE (prototype "Account" board)               */
/* ==================================================================== */

/**
 * Guidance · Kai watches · the voice line those produce, and the rule-adherence
 * receipt.
 *
 * ===========================================================================
 * THE CYCLERS ARE GONE. `cycleMode` AND `cycleExperience` MUST NOT COME BACK.
 * ===========================================================================
 * They advanced a setting one step per tap from a row that looked exactly like
 * every row on the board that merely opens a screen. Three consequences, all
 * bad: a person checking their mode changed it; going back one step meant
 * tapping forward two; and nothing ever showed what the other options were.
 * Worse, the mode chip on the same screen opened a proper chooser, so one
 * setting had two different behaviours a few pixels apart.
 *
 * Both settings now go through an explicit chooser — `ChoiceSheet` for
 * guidance, the shared `ModeSheet` for the goal — so the caller passes a value
 * rather than asking for "the next one".
 *
 * MODE IS NO LONGER WRITTEN FROM HERE AT ALL. `ModeSheet` writes it through
 * `patchProfile` + `PUT /mode`, which is the same act as switching mode on
 * Home or in Trade; this hook only reads it so the voice line and the row
 * agree. Two write paths for one setting is how they drift.
 *
 * WRITES REPORT. `persist` used to swallow every failure with "the next load
 * reconciles" — which is true of the data and false of the person, who saw a
 * row sitting on a value the server had refused. A failure now reverts the row
 * and surfaces the server's sentence through `save`, with a retry.
 */
export function useKaiProfile(fallbackMode: GoalMode) {
  const [experience, setExperience] = useState<Experience>('new');
  const [focus, setFocus] = useState<FocusKey[]>(['tech', 'ai']);
  const [mode, setMode] = useState<GoalMode>(fallbackMode);
  const [adherence, setAdherence] = useState<RuleAdherence | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const retryPatch = useRef<(() => void) | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  useEffect(() => {
    let alive = true;
    if (!api.available()) {
      const f = fixtureKaiProfile();
      setExperience(f.experience);
      setFocus(f.focus);
      setMode(f.mode);
      setAdherence(fixtureRuleAdherence);
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const r = await api.kaiProfile(fallbackMode);
        if (!alive) return;
        setExperience(r.profile.experience);
        setFocus(r.profile.focus);
        setMode(r.profile.mode);
        setAdherence(r.adherence);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : null);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [fallbackMode]);

  /**
   * Write, and say what happened. `revert` puts the row back where it was: a
   * control left showing a value the server rejected is the one outcome a
   * settings screen must never produce.
   */
  const persist = useCallback(async (
    patch: { experience?: Experience; focus?: FocusKey[] },
    revert: () => void,
  ) => {
    if (!api.available()) return;
    if (savedTimer.current) { clearTimeout(savedTimer.current); savedTimer.current = null; }
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await api.putKaiProfile(patch);
      retryPatch.current = null;
      setSaveStatus('saved');
      savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2400);
    } catch (e) {
      revert();
      retryPatch.current = () => { void persist(patch, revert); };
      setSaveError(e instanceof Error ? e.message : "That didn't save. Try again.");
      setSaveStatus('error');
    }
  }, []);

  /** An explicit choice, not a step. Same value in = nothing written. */
  const chooseExperience = useCallback((next: Experience) => {
    setExperience((prev) => {
      if (prev === next) return prev;
      void persist({ experience: next }, () => setExperience(prev));
      return next;
    });
  }, [persist]);

  const toggleFocus = useCallback((k: FocusKey) => {
    setFocus((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      void persist({ focus: next }, () => setFocus(prev));
      return next;
    });
  }, [persist]);

  return {
    mode, experience, focus, adherence, loaded, error,
    modeLabel: MODE_LABEL[mode],
    experienceLabel: EXPERIENCE_LABEL[experience],
    focusShort: focusList(focus),
    voiceLine: EXPERIENCE_VOICE[experience],
    chooseExperience, toggleFocus,
    save: {
      status: saveStatus,
      message: saveError,
      retry: () => retryPatch.current?.(),
    },
  };
}
