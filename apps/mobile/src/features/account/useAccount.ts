import { useCallback, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { fixtureMe, fixtureMemory, fixtureNotifications } from '../../lib/fixtures';
import type { Me, MemoryRow, NotificationRow } from '../../lib/types';

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
