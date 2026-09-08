import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  A11yCtx, clampScale, DEFAULT_PREFS, KEY, useSystemReducedMotion,
  type A11yPrefs, type A11yValue,
} from './context';

/**
 * THE ACCESSIBILITY PREFERENCES, ACTUALLY APPLIED (audit F19) — THE WRITE SIDE.
 * ===========================================================================
 *
 * The context, the hooks and the arithmetic are in `./context`, which imports
 * nothing but React so that `ui/Text.tsx` can depend on it without dragging
 * the API client behind every piece of text in the app. This file is the half
 * that talks to storage and to the server, and it re-exports the other half so
 * everything outside this folder has exactly one import path.
 *
 * WHERE THE VALUE COMES FROM, AND WHY IT SURVIVES A RELAUNCH.
 * The member's two fields live on the server, behind `/me`, behind auth. If
 * that were the only source, every cold start would render one or more frames
 * at the WRONG size and then jump — which for somebody who needs "Largest" is
 * the app briefly becoming unreadable, every single launch.
 *
 * So the preference is mirrored into AsyncStorage the moment it is set, read
 * back at mount before any screen paints anything it cares about, and
 * reconciled with the server once per signed-in account. The server wins when
 * they disagree, because the server is what a SECOND device sees — and the
 * mirror is rewritten from it, so the next cold start is already right.
 */

export * from './context';

export function A11yProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const systemReducedMotion = useSystemReducedMotion();
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  /** The user id we have already reconciled with the server, so we ask once. */
  const syncedFor = useRef<string | null>(null);

  // 1. The stored mirror. This is the one that makes "survives relaunch" true.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        try {
          const stored = JSON.parse(raw) as Partial<A11yPrefs>;
          setPrefs({
            textScale: clampScale(stored.textScale),
            reducedMotion: !!stored.reducedMotion,
          });
        } catch { /* corrupt row — keep the defaults */ }
      })
      .catch(() => { /* storage unavailable; the app still runs at scale 1 */ })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const write = useCallback((next: A11yPrefs) => {
    setPrefs(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => { /* best effort */ });
  }, []);

  const set = useCallback((patch: Partial<A11yPrefs>) => {
    setPrefs((p) => {
      const next: A11yPrefs = {
        textScale: patch.textScale === undefined ? p.textScale : clampScale(patch.textScale),
        reducedMotion: patch.reducedMotion === undefined ? p.reducedMotion : !!patch.reducedMotion,
      };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => { /* best effort */ });
      return next;
    });
  }, []);

  const adopt = set;

  // 2. Reconcile with the server, once per signed-in account. The server is
  //    what a SECOND device sees, so it wins over the local mirror — and the
  //    mirror is rewritten from it so the next cold start is already right.
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    if (!uid || !api.available() || syncedFor.current === uid) return;
    syncedFor.current = uid;
    let alive = true;
    (async () => {
      try {
        const me = await api.me();
        if (!alive) return;
        write({
          textScale: clampScale(me.settings.accessibility.text_scale),
          reducedMotion: !!me.settings.accessibility.reduced_motion,
        });
      } catch {
        // Offline, expired, or the route is not reachable. The local mirror is
        // still the member's own last choice, which is the right thing to keep.
      }
    })();
    return () => { alive = false; };
  }, [session?.user?.id, write]);

  const value = useMemo<A11yValue>(() => ({
    textScale: prefs.textScale,
    // THE OR. System first, and no branch below can turn it back off.
    reducedMotion: systemReducedMotion || prefs.reducedMotion,
    systemReducedMotion,
    memberReducedMotion: prefs.reducedMotion,
    ready,
    set,
    adopt,
  }), [prefs, systemReducedMotion, ready, set, adopt]);

  return <A11yCtx.Provider value={value}>{children}</A11yCtx.Provider>;
}

