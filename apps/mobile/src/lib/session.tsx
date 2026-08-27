import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, plainAuthError } from './supabase';
import { env } from './env';
import { fixtureProfile } from './fixtures';
import type { GoalMode, Involvement, Profile, RiskAnswer, FundingChoice } from './types';

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

/** Onboarding answers live here until POST /onboarding/complete accepts them. */
export type OnboardingDraft = {
  goal_mode: GoalMode | null;
  funding: FundingChoice | null;
  risk_answer: RiskAnswer | null;
  involvement: Involvement | null;
  experience: 'beginner' | 'intermediate' | 'advanced';
  starting_balance: number;
};
const DEFAULT_DRAFT: OnboardingDraft = {
  goal_mode: null, funding: null, risk_answer: null, involvement: null,
  experience: 'beginner', starting_balance: 2000,
};

type DraftValue = { draft: OnboardingDraft; set: (p: Partial<OnboardingDraft>) => void; reset: () => void };
const DraftCtx = createContext<DraftValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(env.FIXTURES ? fixtureProfile : null);
  const [draft, setDraft] = useState<OnboardingDraft>(DEFAULT_DRAFT);
  const mounted = useRef(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (env.FIXTURES) { setProfile(fixtureProfile); return; }
    if (!supabase || !s) { setProfile(null); return; }
    const { data } = await supabase
      .from('profiles')
      .select('user_id, display_name, handle, primary_mode, involvement, experience, memory_enabled, onboarding')
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

  const value = useMemo<SessionValue>(() => ({
    loading,
    session,
    profile,
    onboardingDone: env.FIXTURES ? true : profile?.onboarding?.completed === true,

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

    signOut: async () => { await supabase?.auth.signOut(); setProfile(null); },

    refreshProfile: async () => { await loadProfile(session); },

    patchProfile: async (patch) => {
      setProfile((p) => (p ? { ...p, ...patch } : p));
      if (!supabase || !session) return;
      await supabase.from('profiles').update(patch).eq('user_id', session.user.id);
    },
  }), [loading, session, profile, loadProfile]);

  const draftValue = useMemo<DraftValue>(() => ({
    draft,
    set: (p) => setDraft((d) => ({ ...d, ...p })),
    reset: () => setDraft(DEFAULT_DRAFT),
  }), [draft]);

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

/** Daily loss cap derived from the risk answer on a $2,000 account (S02 copy). */
export const RISK_EXAMPLES: Record<RiskAnswer, { title: string; cap: number; note?: string }> = {
  careful: { title: 'Careful', cap: 20 },
  balanced: { title: 'Balanced', cap: 60 },
  aggressive: { title: 'Aggressive', cap: 140, note: 'Higher swings' },
};
export function capFor(answer: RiskAnswer | null, balance: number): number {
  const base = answer ? RISK_EXAMPLES[answer].cap : RISK_EXAMPLES.balanced.cap;
  return Math.round((base / 2000) * balance);
}
