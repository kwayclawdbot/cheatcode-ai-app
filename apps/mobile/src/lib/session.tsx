import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, plainAuthError } from './supabase';
import { env } from './env';
import { fixtureProfile } from './fixtures';
import type { Profile, RiskAnswer } from './types';
import {
  BALANCE_MAX,
  BALANCE_MIN,
  DEFAULT_BALANCE,
  EMPTY_ANSWERS,
  clampBalance,
  isEmptyAnswers,
} from '../features/onboarding/draft-codec';
import { prefillFromIntent, type OnboardingAnswers } from '../features/onboarding/steps';
import type { FunnelIntent } from '../features/onboarding/intent';
import { clearDraft, readDraft, readIntent, writeDraft, writeIntent } from '../features/onboarding/storage';

type AuthResult = { ok: boolean; error?: string; needsConfirmation?: boolean };

type SessionValue = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  onboardingDone: boolean;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInWithMagicLink: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  patchProfile: (patch: Partial<Profile>) => Promise<void>;
};

const Ctx = createContext<SessionValue | null>(null);

/**
 * Onboarding answers live here until POST /onboarding/complete accepts them —
 * AND ON DISK, WHICH IS THE CHANGE.
 *
 * Audit F01 (P1) named this exact object: "the draft is in React state". It was
 * a `useState` in this provider, so a phone call, a backgrounded app iOS chose
 * to reclaim, a reload on Expo web, or a crash on any of the six screens ended
 * signup and started it again from question one with every answer thrown away.
 * The acceptance is "complete signup, close and reopen, resume the same step
 * with the same choices", and none of the three halves of that were true.
 *
 * The shape, the validation and the disk are in `features/onboarding/` — free
 * of React and (for the codec) of AsyncStorage, so the continuity test can
 * round-trip them in Node. This provider does three things with them: load the
 * right member's draft, persist every change, and keep the funnel INTENT in a
 * separate place from the member's ANSWERS.
 *
 * THAT SEPARATION IS THE AUDIT'S, NOT A PREFERENCE. "Keep identity and intent
 * separate until an account exists." The draft is keyed by user id; the intent
 * is stored per device, holds nothing that identifies anybody, and is only ever
 * allowed to prefill preferences — never the readiness placement. See
 * `features/onboarding/steps.ts` → `prefillFromIntent`.
 */
export type OnboardingDraft = OnboardingAnswers;

export { BALANCE_MIN, BALANCE_MAX, DEFAULT_BALANCE, clampBalance };

type DraftValue = {
  draft: OnboardingDraft;
  /**
   * False until the disk has answered. A screen that renders before this is
   * true would paint the empty draft and then jump to the restored one, which
   * reads as the app having changed somebody's answer by itself — the same
   * trap `features/community/last-room.ts` documents for the room memory.
   */
  ready: boolean;
  set: (p: Partial<OnboardingDraft>) => void;
  /** Signup finished. Clears the answers here and on the device. */
  reset: () => void;
  /** What the website funnel said, if anything. Never identity. */
  intent: FunnelIntent | null;
  /**
   * Record an intent that just arrived — from a deep link, or from the claim
   * route after sign-in. It prefills the preferences it implies, and it
   * DELIBERATELY refuses to touch a draft somebody has already started: an
   * answer a member gave outranks one a marketing page guessed.
   */
  adoptIntent: (i: FunnelIntent) => void;
};
const DraftCtx = createContext<DraftValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(env.FIXTURES ? fixtureProfile : null);
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_ANSWERS);
  const [draftReady, setDraftReady] = useState(false);
  const [intent, setIntent] = useState<FunnelIntent | null>(null);
  /**
   * Whose draft is currently in state. A ref and not derived from `session`
   * inside the persist effect, because the persist must never write one
   * member's answers under another member's key during the frame after a
   * sign-out — which is exactly what reading `session` there would do.
   */
  const draftUser = useRef<string | null>(null);
  const mounted = useRef(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (env.FIXTURES) { setProfile(fixtureProfile); return; }
    if (!supabase || !s) { setProfile(null); return; }
    const { data } = await supabase
      .from('profiles')
      /*
       * `stage` and `stage_locked` are 0042. They are READ here and never
       * written: the column is client-readable through the member's own
       * `profiles_owner_all` policy, and a database trigger refuses any write
       * to it that does not come from the service role.
       *
       * This select is an explicit column list, which means a new column is
       * invisible to the whole app until it is named here — and invisible in
       * the quietest way possible. `homeOrderFor(profile?.stage)` treats
       * undefined as `beginner`, so leaving `stage` out of this line did not
       * break Home, it just silently gave every member a beginner's Home
       * forever. Worth remembering before adding the next column.
       */
      .select('user_id, display_name, handle, primary_mode, involvement, experience, memory_enabled, onboarding, stage, stage_locked')
      .eq('user_id', s.user.id)
      .maybeSingle();
    if (mounted.current) setProfile((data as unknown as Profile) ?? { user_id: s.user.id, onboarding: { completed: false } });
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (env.FIXTURES || !supabase) { setLoading(false); return () => { mounted.current = false; }; }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      if (mounted.current) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      await loadProfile(s);
    });
    return () => { mounted.current = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  /**
   * LOAD. One member's answers, plus whatever the website told this device.
   *
   * Re-runs when the account changes, which covers the two real cases: the
   * first read after a cold start, and a second account signing in on the same
   * phone. `ready` goes false first so no screen paints the empty draft as if
   * it were an answer.
   */
  useEffect(() => {
    const userId = session?.user.id ?? null;
    draftUser.current = userId;
    let alive = true;
    setDraftReady(false);
    void (async () => {
      const [storedIntent, stored] = await Promise.all([
        readIntent(),
        userId ? readDraft(userId) : Promise.resolve(null),
      ]);
      if (!alive) return;
      setIntent(storedIntent);
      // A stored draft wins outright. The intent only fills a draft that does
      // not exist yet — and even then only the preferences it is allowed to
      // touch, never the readiness placement (F01: do not silently promote
      // readiness from a marketing persona).
      setDraft(stored ?? { ...EMPTY_ANSWERS, ...(storedIntent ? prefillFromIntent(storedIntent) : {}) });
      setDraftReady(true);
    })();
    return () => { alive = false; };
  }, [session?.user.id]);

  /**
   * PERSIST. Every change, immediately, and never awaited by a screen.
   *
   * An empty draft DELETES the key rather than storing it: an empty draft reads
   * back identically to no draft, so keeping it would be storing a fact about
   * somebody that says nothing — and it is what makes `reset()` after a
   * completed signup actually clear the device.
   */
  useEffect(() => {
    if (!draftReady) return;
    const userId = draftUser.current;
    if (!userId) return;
    if (isEmptyAnswers(draft)) { void clearDraft(userId); return; }
    void writeDraft(userId, draft);
  }, [draft, draftReady]);

  const value = useMemo<SessionValue>(() => ({
    loading,
    session,
    profile,
    /**
     * The SERVER decides this: `complete_onboarding` (0016) stamps
     * `onboarding.completed_at`. The older client-side `completed:true` flag is
     * still honoured so accounts created before round 4 keep working — but it
     * is never written any more, because patching `onboarding` wholesale would
     * wipe the answers (focus, experience, starting balance) stored beside it.
     */
    onboardingDone: env.FIXTURES
      ? true
      : profile?.onboarding?.completed === true || !!profile?.onboarding?.completed_at,

    signUp: async (email, password) => {
      if (!supabase) return { ok: false, error: 'Sign up is not available yet — the service is still being set up.' };
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) return { ok: false, error: plainAuthError(error.message) };
      if (!data.session) return { ok: true, needsConfirmation: true };
      return { ok: true };
    },

    signIn: async (email, password) => {
      if (!supabase) return { ok: false, error: 'Sign in is not available yet — the service is still being set up.' };
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { ok: false, error: plainAuthError(error.message) };
      return { ok: true };
    },

    signInWithMagicLink: async (email) => {
      if (!supabase) return { ok: false, error: 'Sign in is not available yet — the service is still being set up.' };
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (error) return { ok: false, error: plainAuthError(error.message) };
      return { ok: true, needsConfirmation: true };
    },

    // Revoke server-side when we can — that is what a deliberate sign-out
    // means. But NEVER let a failed revoke strand the user signed in: if the
    // server will not accept this token (rotated key, reset project, session
    // from another stack) the global call throws, and without the fallback the
    // local session survives and the only escape hatch in the app is broken
    // for exactly the person who needs it.
    signOut: async () => {
      try {
        await supabase?.auth.signOut();
      } catch {
        await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
      }
      setProfile(null);
    },

    refreshProfile: async () => { await loadProfile(session); },

    patchProfile: async (patch) => {
      setProfile((p) => (p ? { ...p, ...patch } : p));
      if (!supabase || !session) return;
      await supabase.from('profiles').update(patch).eq('user_id', session.user.id);
    },
  }), [loading, session, profile, loadProfile]);

  const draftValue = useMemo<DraftValue>(() => ({
    draft,
    ready: draftReady,
    set: (p) => setDraft((d) => ({ ...d, ...p })),
    reset: () => setDraft(EMPTY_ANSWERS),
    intent,
    adoptIntent: (i) => {
      setIntent(i);
      void writeIntent(i);
      // An answer somebody GAVE outranks one a marketing page guessed, always.
      // Without this, a member who had already picked their placement and was
      // sitting on step 2 would watch the goal screen change under them the
      // moment a slow claim call came back.
      setDraft((d) => (d.start_answer || d.confirmed_goal ? d : { ...d, ...prefillFromIntent(i) }));
    },
  }), [draft, draftReady, intent]);

  return (
    <Ctx.Provider value={value}>
      <DraftCtx.Provider value={draftValue}>{children}</DraftCtx.Provider>
    </Ctx.Provider>
  );
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

export function useOnboardingDraft(): DraftValue {
  const v = useContext(DraftCtx);
  if (!v) throw new Error('useOnboardingDraft must be used inside SessionProvider');
  return v;
}

/**
 * Daily loss cap by example. The caps below are quoted against a $2,000 account
 * because that is the number S02 teaches with; `capFor` scales them to whatever
 * balance the person actually chose, so the cap on the summary is THEIR cap and
 * not the teaching example.
 */
export const RISK_EXAMPLES: Record<RiskAnswer, { title: string; cap: number; note?: string }> = {
  careful: { title: 'Careful', cap: 20 },
  balanced: { title: 'Balanced', cap: 60 },
  aggressive: { title: 'Aggressive', cap: 140, note: 'Higher swings' },
};
export function capFor(answer: RiskAnswer | null, balance: number): number {
  const base = answer ? RISK_EXAMPLES[answer].cap : RISK_EXAMPLES.balanced.cap;
  return Math.round((base / 2000) * balance);
}
