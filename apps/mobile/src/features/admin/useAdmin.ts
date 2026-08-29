import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type {
  AdminAuditPage, AdminAuditRow, AdminInviteRow, AdminInvitesPage, AdminOverview,
  AdminPeopleFilter, AdminPersonRow, AdminPerson, AdminSegmentRow, AdminSourceState, StaffRole,
} from '../../lib/types';

/**
 * THE ADMIN BOARD HAS NO FIXTURES, AND THAT IS DELIBERATE.
 *
 * Every other screen in this app falls back to a sample when the API is not
 * connected, because a sample watchlist is obviously a sample. A sample CRM is
 * not: sample people, sample revenue and a sample audit trail are indis-
 * tinguishable from real ones, and an operator would act on them. So these
 * hooks return `notAvailable` instead, and the screens say so in the app's own
 * `NotConnected` words.
 *
 * They also DO NOT POLL. Reading the overview, a person or the audit log writes
 * an audit row server-side; a screen that refreshed itself every thirty seconds
 * would fill the log with its own noise and bury the human being looked for.
 */
export type AdminResource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** The API on this stack does not serve the admin routes — or you are not staff. */
  notAvailable: boolean;
  reload: () => void;
};

function useAdminResource<T>(load: () => Promise<T>, deps: unknown[]): AdminResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!api.available()) {
      setData(null);
      setLoading(false);
      setNotAvailable(true);
      return;
    }
    setLoading(true);
    load()
      .then((d) => {
        if (!alive.current) return;
        setData(d);
        setError(null);
        setNotAvailable(false);
      })
      .catch((e: unknown) => {
        if (!alive.current) return;
        const code = e instanceof ApiError ? e.code : '';
        // NOT_FOUND is what a non-staff caller gets from every admin route, by
        // design (brief §3) — the route must not confirm it exists. So the two
        // cases are one case here, and they read as one sentence.
        setData(null);
        setNotAvailable(code === 'NOT_FOUND' || code === 'NO_API');
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      })
      .finally(() => { if (alive.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, notAvailable, reload };
}

export const useOverview = () => useAdminResource<AdminOverview>(() => api.adminOverview(), []);

export const useSources = () => useAdminResource<AdminSourceState[]>(() => api.adminSources(), []);

export const useSegments = () => useAdminResource<AdminSegmentRow[]>(() => api.adminSegments(), []);

export const usePerson = (id: string) => useAdminResource<AdminPerson>(() => api.adminPerson(id), [id]);

/**
 * A CURSOR PAGES FORWARD AND NOTHING ELSE. The first page comes from the
 * filter; "Show more" appends the next one. There is no page size to raise and
 * no offset to skip with, which is the API's guarantee kept honest on the
 * client side too.
 */
export function usePeople(filter: AdminPeopleFilter) {
  const key = JSON.stringify(filter);
  const first = useAdminResource(() => api.adminPeople(filter), [key]);
  const [extra, setExtra] = useState<AdminPersonRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => { setExtra([]); setCursor(null); }, [key, first.data]);

  const nextCursor = cursor ?? first.data?.next_cursor ?? null;

  const more = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.adminPeople({ ...filter, cursor: nextCursor });
      setExtra((rows) => [...rows, ...page.people]);
      setCursor(page.next_cursor);
    } catch {
      /* the rows already on screen are still true */
    } finally {
      setLoadingMore(false);
    }
  }, [filter, nextCursor, loadingMore]);

  return {
    ...first,
    people: [...(first.data?.people ?? []), ...extra],
    hasMore: !!nextCursor,
    loadingMore,
    more,
  };
}

export function useInvites() {
  const r = useAdminResource<AdminInvitesPage>(() => api.adminInvites(), []);
  const [created, setCreated] = useState<AdminInviteRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (body: {
    label?: string; tier: 'free' | 'premium'; duration_days?: number;
    max_redemptions?: number | null; expires_in_days?: number; person_id?: string;
  }) => {
    setBusy(true);
    setError(null);
    try {
      const invite = await api.adminCreateInvite(body);
      // The new code goes on screen AT ONCE and is also reloaded: a code you
      // cannot see is a code you cannot send, and the list is paged by date.
      setCreated((c) => [invite, ...c]);
      r.reload();
      return invite;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was not created.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [r]);

  const revoke = useCallback(async (id: string) => {
    setError(null);
    try {
      const row = await api.adminRevokeInvite(id);
      setCreated((c) => c.map((i) => (i.id === id ? row : i)));
      r.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was not switched off.');
    }
  }, [r]);

  // A code created in this session is shown once at the top and then folded
  // into the reloaded list, so it never appears twice.
  const listed = r.data?.invites ?? [];
  const ids = new Set(listed.map((i) => i.id));
  const invites = [...created.filter((i) => !ids.has(i.id)), ...listed];

  return { ...r, invites, totals: r.data?.totals ?? null, create, revoke, busy, actionError: error };
}

export function useAudit(filter: { action?: string; target_id?: string }) {
  const key = JSON.stringify(filter);
  const first = useAdminResource<AdminAuditPage>(() => api.adminAudit(filter), [key]);
  const [extra, setExtra] = useState<AdminAuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => { setExtra([]); setCursor(null); }, [key, first.data]);
  const nextCursor = cursor ?? first.data?.next_cursor ?? null;

  const more = useCallback(async () => {
    if (!nextCursor) return;
    const page = await api.adminAudit({ ...filter, cursor: nextCursor });
    setExtra((rows) => [...rows, ...page.entries]);
    setCursor(page.next_cursor);
  }, [filter, nextCursor]);

  return { ...first, entries: [...(first.data?.entries ?? []), ...extra], hasMore: !!nextCursor, more };
}

/** Running a source is an ADMIN act; a dry run is the same act that writes nothing. */
export function useSyncRunner(onDone: () => void) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<{ source: string; plain: string } | null>(null);

  const run = useCallback(async (source: string, dryRun: boolean) => {
    setRunning(source);
    setResult(null);
    try {
      const r = await api.adminSync(source, dryRun);
      setResult({ source, plain: r.plain });
      onDone();
    } catch (e) {
      setResult({ source, plain: e instanceof Error ? e.message : 'That run did not complete.' });
    } finally {
      setRunning(null);
    }
  }, [onDone]);

  return { run, running, result, dismiss: () => setResult(null) };
}

/**
 * WHICH ACTIONS TO DRAW — a courtesy, exactly like the door itself.
 *
 * `support` reads the CRM and writes notes and tags; `admin` and `owner` also
 * make invites, grant entitlements and run a source. The API already refuses
 * the difference (`{ min: 'admin' }` on those routes, re-checked against
 * `staff_members` every time), so nothing here is a permission — it is the
 * difference between a board with three buttons and a board with three buttons
 * that fail. A control that cannot work should not be on the screen.
 */
export function useStaffRole(): { role: StaffRole | null; canWrite: boolean } {
  const [role, setRole] = useState<StaffRole | null>(null);
  useEffect(() => {
    let alive = true;
    if (!api.available()) return;
    api.me().then((m) => { if (alive) setRole(m.staff.role); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return { role, canWrite: role === 'admin' || role === 'owner' };
}
