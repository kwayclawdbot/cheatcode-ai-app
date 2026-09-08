import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * THE ACCESSIBILITY PREFERENCES, ACTUALLY APPLIED (audit F19) — THE READ SIDE.
 * ===========================================================================
 *
 * `PUT /settings` has stored `accessibility.text_scale` and
 * `accessibility.reduced_motion` since round 4. Until this file existed those
 * two fields appeared in exactly four places in the mobile source — the
 * settings screen that writes them, the type that describes them, the fixture
 * that seeds them and the adapter that parses them. Nothing READ them. `T`
 * rendered whatever size its caller passed; the two motion hooks (Home's
 * `Wakeup`, Community's `Social`) asked the OS and ignored the member.
 *
 * So a member picked "Larger", watched the chip light up, and nothing on any
 * screen moved. A saved preference that does nothing is worse than no
 * preference at all: it is the product telling somebody their need has been
 * handled when it has not.
 *
 * ---------------------------------------------------------------------------
 * THE TWO RULES THIS PROVIDER EXISTS TO ENFORCE
 * ---------------------------------------------------------------------------
 *
 * 1. THE SYSTEM AND THE MEMBER ARE COMBINED, NOT CHOSEN BETWEEN.
 *
 *    Motion is an OR, and it is an OR on purpose and in one direction only:
 *
 *        reducedMotion = systemReducedMotion || memberReducedMotion
 *
 *    Somebody who turned reduce-motion on at the OS level has told every app
 *    on the device that movement makes them ill. NO in-app setting may
 *    override that — not a toggle, not a default, not a "but this animation is
 *    tasteful". The app is allowed to be quieter than the OS asked for. It is
 *    never allowed to be louder.
 *
 *    Type is a MULTIPLY, and the system half is not ours to apply: React
 *    Native already scales `fontSize` by the OS text-size setting because
 *    `allowFontScaling` defaults to true. The member's scale multiplies on top
 *    of that. Which brings us to:
 *
 * 2. SYSTEM TEXT SCALING IS NEVER DISABLED.
 *
 *    The cheap way to stop an enlarged-text device from breaking a tight
 *    layout is `allowFontScaling={false}`, and it is the single most hostile
 *    line an app can ship: it takes an OS-level accessibility setting away
 *    from the person who set it. This app does not use it, the audit says so
 *    explicitly, and `scripts/contrast-test.mts` fails the build if it ever
 *    appears in `src/`.
 *
 * ---------------------------------------------------------------------------
 * Where the value comes from, how it is stored and how it is reconciled with
 * the server is the other half of this feature — see `./index.tsx`.
 */


/*
 * WHY THIS IS SPLIT FROM `index.tsx`.
 *
 * `ui/Text.tsx` imports from this file, and `ui/Text.tsx` is imported by very
 * nearly every module in the app. The PROVIDER needs `lib/api` and
 * `lib/session` — which pull in the Supabase client and the whole request
 * layer — and dragging that graph behind every piece of text in the product is
 * how a leaf component ends up owning the app's module-evaluation order.
 *
 * So: the read side (context, hooks, arithmetic) lives here and imports
 * nothing but React and React Native. The write side (storage, server
 * reconciliation, the provider component) lives in `index.tsx`, which
 * re-exports all of this so callers only ever need one import path.
 */
export type A11yPrefs = {
  /** The member's chosen multiplier. 1 = the design's own sizes. */
  textScale: number;
  /** The member's own toggle. NOT the effective value — see `reducedMotion`. */
  reducedMotion: boolean;
};

/**
 * The settings screen offers 1 / 1.15 / 1.3. The clamp is wider than that on
 * both sides because the value arrives from a server the phone does not
 * control, and a stored 4 would render one word per screen.
 */
export const SCALE_MIN = 0.85;
export const SCALE_MAX = 1.5;

export function clampScale(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));
}

export const DEFAULT_PREFS: A11yPrefs = { textScale: 1, reducedMotion: false };

/**
 * Versioned, like every other stored row in this app. `v1` is
 * `{ textScale, reducedMotion }`; a row that will not parse is a corrupt row
 * and is dropped rather than crashing the provider that wraps the whole app.
 */
export const KEY = 'ccai.a11y.v1';

export type A11yValue = {
  /** The effective text multiplier. Multiplies the design size; the OS scales on top. */
  textScale: number;
  /** The EFFECTIVE answer: system OR member. This is what a component asks. */
  reducedMotion: boolean;
  /** The OS setting on its own — so a screen can explain why a toggle is stuck on. */
  systemReducedMotion: boolean;
  /** The member's own toggle on its own — the value the settings screen renders. */
  memberReducedMotion: boolean;
  /** False until AsyncStorage has been read. Nothing needs to wait on it. */
  ready: boolean;
  /** Set from a control. Applies instantly and mirrors to storage; the caller still writes the server. */
  set: (patch: Partial<A11yPrefs>) => void;
  /** Adopt what the server says. Used by the settings screen when `/me` lands. */
  adopt: (prefs: Partial<A11yPrefs>) => void;
};

/** Exported so the provider in `./index.tsx` can mount it. Nothing else should read it directly. */
export const A11yCtx = createContext<A11yValue | null>(null);

/**
 * The OS reduce-motion setting, subscribed.
 *
 * Exported because it is genuinely useful on its own — a screen that wants to
 * say "your phone is set to reduce motion" needs the system half, not the OR.
 * Everything else should ask `useReducedMotion()`.
 */
export function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => { if (alive) setReduced(!!v); })
      .catch(() => { /* web and older RN both land here; false is the honest default */ });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduced(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduced;
}

/**
 * The whole preference. Throws nowhere: a component rendered outside the
 * provider (a proof script, a unit render) gets the design's own defaults
 * rather than a crash, because `T` calls this on every single text node.
 */
export function useA11y(): A11yValue {
  const ctx = useContext(A11yCtx);
  const system = useSystemReducedMotion();
  if (ctx) return ctx;
  return {
    textScale: 1,
    reducedMotion: system,
    systemReducedMotion: system,
    memberReducedMotion: false,
    ready: true,
    set: () => {},
    adopt: () => {},
  };
}

/**
 * The multiplier only. Cheap: no subscription, no state, one context read —
 * which matters, because every `T` in the app calls it on every render.
 */
export function useTextScale(): number {
  return useContext(A11yCtx)?.textScale ?? 1;
}

/**
 * DOES THIS PERSON WANT MOVEMENT.
 *
 * Reduced motion is not "no animation" — it is no MOVEMENT. A thing may still
 * fade, because a cross-fade is a change of opacity and not a change of
 * position, and it is position that makes somebody with vestibular sensitivity
 * feel it. What stops is translation, spring, parallax, scale-from-nothing and
 * anything that pulses forever.
 *
 * This is a drop-in replacement for the two local copies that used to live in
 * `features/home/Wakeup.tsx` and `features/community/ui/Social.tsx` — same
 * name, same signature, same return — except that it also honours the member's
 * own toggle instead of only the OS.
 */
export function useReducedMotion(): boolean {
  const ctx = useContext(A11yCtx);
  const system = useSystemReducedMotion();
  return ctx ? ctx.reducedMotion : system;
}

/**
 * The motion budget, for the places that need numbers rather than a boolean.
 *
 *   duration(250)  -> 0 when reduced, so an Animated.timing finishes instantly
 *                     and the component never has to branch its whole tree.
 *   distance(16)   -> 0 when reduced. Movement is the part that is removed.
 *   stagger(90)    -> 0 when reduced. A cascade is movement in time.
 *   loop           -> false when reduced. Nothing pulses forever.
 *
 * Written as multipliers rather than `if (reduced) return null` so that a
 * sheet, a chart annotation and a piece of feedback all end up in the SAME
 * final state whichever way the preference is set — only the journey there
 * changes. A component that renders a different tree under reduced motion is a
 * component with two layouts to maintain and one of them untested.
 */
export function useMotion(): {
  reduced: boolean;
  duration: (ms: number) => number;
  distance: (px: number) => number;
  stagger: (ms: number) => number;
  loop: boolean;
} {
  const reduced = useReducedMotion();
  return useMemo(() => ({
    reduced,
    duration: (ms: number) => (reduced ? 0 : ms),
    distance: (px: number) => (reduced ? 0 : px),
    stagger: (ms: number) => (reduced ? 0 : ms),
    loop: !reduced,
  }), [reduced]);
}
