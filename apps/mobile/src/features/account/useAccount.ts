import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { fixtureKaiProfile, fixtureMe, fixtureMemory, fixtureNotifications, fixtureRuleAdherence } from '../../lib/fixtures';
import {
  EXPERIENCE_LABEL, EXPERIENCE_VOICE, MODE_LABEL, focusList, nextExperience, nextMode,
} from './profile';
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
 */
export function useSettingsWriter(onSaved?: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    if (!api.available()) return true;
    setSaving(true);
    setError(null);
    try {
      await api.putSettings(patch);
      onSaved?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That setting didn't save. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [onSaved]);

  return { save, saving, error };
}

/** POST /billing/checkout — the honest "not configured yet" path is a first-class result. */
export function useCheckout() {
  const [state, setState] = useState<{ url: string | null; message: string | null; busy: boolean }>({
    url: null, message: null, busy: false,
  });

  const start = useCallback(async () => {
    if (!api.available()) {
      setState({ url: null, message: 'Upgrades open soon.', busy: false });
      return;
    }
    setState({ url: null, message: null, busy: true });
    try {
      const r = await api.billingCheckout();
      setState({ url: r?.url ?? null, message: r?.url ? null : 'Upgrades open soon.', busy: false });
    } catch (e) {
      const msg = e instanceof ApiError && e.code === 'BILLING_NOT_CONFIGURED'
        ? e.message || 'Upgrades open soon.'
        : e instanceof Error ? e.message : 'Upgrades open soon.';
      setState({ url: null, message: msg, busy: false });
    }
  }, []);

  return { ...state, start, dismiss: () => setState({ url: null, message: null, busy: false }) };
}

/* ==================================================================== */
/* Round 4 — YOUR KAI PROFILE (prototype "Account" board)               */
/* ==================================================================== */

/**
 * Trading mode · Experience level · Kai watches, plus the voice line those
 * three produce and the rule-adherence receipt.
 *
 * Changing any row writes `PUT /settings` and updates the local profile at
 * once — these three settings change how Kai scans, writes and warns, so the
 * screen must never lag behind what the user just chose.
 */
export function useKaiProfile(fallbackMode: GoalMode) {
  const [experience, setExperience] = useState<Experience>('new');
  const [focus, setFocus] = useState<FocusKey[]>(['tech', 'ai']);
  const [mode, setMode] = useState<GoalMode>(fallbackMode);
  const [adherence, setAdherence] = useState<RuleAdherence | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const persist = useCallback(async (patch: { experience?: Experience; focus?: FocusKey[]; mode?: GoalMode }) => {
    if (!api.available()) return;
    try { await api.putKaiProfile(patch); } catch { /* the row already moved; the next load reconciles */ }
  }, []);

  const cycleMode = useCallback(() => {
    setMode((m) => { const next = nextMode(m); void persist({ mode: next }); return next; });
  }, [persist]);

  const cycleExperience = useCallback(() => {
    setExperience((e) => { const next = nextExperience(e); void persist({ experience: next }); return next; });
  }, [persist]);

  const toggleFocus = useCallback((k: FocusKey) => {
    setFocus((f) => {
      const next = f.includes(k) ? f.filter((x) => x !== k) : [...f, k];
      void persist({ focus: next });
      return next;
    });
  }, [persist]);

  return {
    mode, experience, focus, adherence, loaded, error,
    modeLabel: MODE_LABEL[mode],
    experienceLabel: EXPERIENCE_LABEL[experience],
    focusShort: focusList(focus),
    voiceLine: EXPERIENCE_VOICE[experience],
    cycleMode, cycleExperience, toggleFocus,
  };
}
