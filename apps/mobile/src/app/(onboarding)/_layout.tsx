import React, { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { color } from '../../ui/tokens';
import { useOnboardingDraft, useSession } from '../../lib/session';
import { claimFunnelIntent } from '../../features/onboarding/api';

/**
 * The onboarding stack, plus the one thing that has to happen once for the
 * whole group rather than once per screen: picking up the website's answers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE CLAIM LIVES HERE
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F21. A visitor who walked the site's funnel told it a great deal, and
 * until now that reached an email draft and nothing else — so the first thing
 * the app did was ask them all of it again (F01). `POST /onboarding/intent/claim`
 * is the other end of that: it hands back what they said.
 *
 * It runs from the layout because it must run EXACTLY ONCE per signup, and the
 * screens are pushed, popped and resumed. Putting it on `start.tsx` would fire
 * it again every time somebody navigated back.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO TOKEN IS NEEDED, AND THAT IS THE INTERESTING PART
 * ─────────────────────────────────────────────────────────────────────────────
 * A device that arrived by deep link has a token, and `start.tsx` adopts that
 * intent directly from the link. This call is for the much more common case:
 * somebody filled the form on a laptop and installed the app on a phone. That
 * phone has no token. What it has is an authenticated session, and the session's
 * email is the identity the form wrote — so the server resolves the person from
 * the bearer token and reads their own most recent request.
 *
 * Which is the audit's rule stated as behaviour: the token says WHAT somebody
 * wanted, authentication says WHO is asking, and only the second of those is
 * ever allowed to decide whose answers these are.
 *
 * IT NEVER BLOCKS AND NEVER SHOWS AN ERROR. Most people never touched the
 * funnel; a miss is `null` and a failure is swallowed (`claimFunnelIntent`
 * catches). The cost of it not working is two extra taps, and there is no
 * version of that worth interrupting somebody's first minute for.
 */
function IntentPickup() {
  const { session } = useSession();
  const { draft, ready, intent, adoptIntent } = useOnboardingDraft();
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    if (!session || !ready) return;
    // Nothing to pick up FOR: this member has already started answering, and
    // `adoptIntent` would refuse to overwrite them anyway. Skipping the call
    // keeps a resumed signup from making a network request it cannot use.
    if (draft.start_answer || draft.confirmed_goal) { asked.current = true; return; }
    asked.current = true;
    void (async () => {
      const found = await claimFunnelIntent(intent?.token ?? null);
      if (found) adoptIntent(found);
    })();
  }, [session, ready, draft.start_answer, draft.confirmed_goal, intent, adoptIntent]);

  return null;
}

export default function OnboardingLayout() {
  return (
    <>
      <IntentPickup />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />
    </>
  );
}
