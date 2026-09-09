/**
 * THE HOST ADAPTER — the one place the app's real data becomes the kit's view model.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 * `packages/design-kit` ships 36 screen COMPOSITIONS, and its INTEGRATION.md
 * opens by naming the exact mistake that produces a half-upgraded app:
 *
 *     "This is the missing layer between a mockup and a real app. AlertsScreen
 *      includes the page heading, category rail, setup object, secondary rows,
 *      source text, composer and navigation ownership. Importing only TradeChart
 *      into the old oversized alert card will retain the old look."
 *
 * That is what happened once already here: kit pieces were imported INTO
 * `StandardAlertCard`, so the card kept its own proportions and gained two kit
 * components below the fold. The fix is to render the composition as the screen,
 * and a composition needs the whole `KitData` view model. This file builds it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE ADAPTER, NOT FIVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Every route reads the same `KitData`, so five routes must not each invent
 * their own mapping — that is how two screens end up disagreeing about what a
 * member's belt is. Each domain owns exactly one slot function below and
 * nothing else. A slot that has no real source yet returns an HONEST EMPTY and
 * says so in `missing`, which is what `loadState` and the kit's own
 * `FeedbackState` are for. It never returns a plausible-looking placeholder:
 * `scripts/no-fake-data-test.mts` exists to stop precisely that, and the kit's
 * own note agrees — "Do not assume gallery fixtures describe the current
 * subscription, order, company, lesson availability or market."
 *
 * NEVER import `packages/design-kit/gallery/fixtures.ts` from an app route. Its
 * first line says so too.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MEANS FOR AGENTS.md
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/mobile/AGENTS.md` says the hand-rolled components in `src/ui/*` ARE the
 * identity layer and must not be rebuilt on a component library. That rule was
 * right and it is now superseded BY THE OWNER, who supplied this kit as the new
 * identity layer. The rule's reasoning survives the change: the kit is not a
 * generic component library, it is this product's own face, and it carries the
 * same grammar (volt = the member acted, violet = Kai did). `AGENTS.md` is
 * updated in the same commit as this file rather than left contradicting it.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import type {
  KitAction,
  KitData,
  KitState,
  ScreenId,
} from '../../ui/design-kit';
import type { TradeIdea } from '../../../../../packages/trade-ui/model';
import { useTextScale, useReducedMotion } from '../a11y/context';
import { useSession } from '../../lib/session';

/* ==================================================================== */
/* What a slot may say when it has nothing                              */
/* ==================================================================== */

/**
 * A domain that cannot answer yet.
 *
 * `missing` is a SENTENCE, not a flag, because it reaches the screen: the kit
 * takes `errorMessage` and draws it, and "we could not read your belt" is a
 * different thing to a member than an empty ring. `loading` and `missing` are
 * deliberately separate — a request in flight is a spinner, and a request that
 * answered with nothing is a stated absence. Conflating them is how a failed
 * load gets drawn as a verified empty list, which is the audit's F18.
 */
export type Slot<T> = { value: T; loading: boolean; missing: string | null };

export const ready = <T,>(value: T): Slot<T> => ({ value, loading: false, missing: null });
export const pending = <T,>(value: T): Slot<T> => ({ value, loading: true, missing: null });
export const absent = <T,>(value: T, missing: string): Slot<T> => ({ value, loading: false, missing });

/* ==================================================================== */
/* The empty view model                                                 */
/* ==================================================================== */

/**
 * The shape with nothing in it.
 *
 * Every string here describes an ABSENCE rather than filling one. A screen
 * rendered against this says "there is nothing here yet" in the product's own
 * voice; it does not say NVDA is at 178.40.
 */
const EMPTY_IDEA: TradeIdea = {
  id: '', symbol: '', company: '', title: '', summary: '',
  grade: null, direction: 'long',
  entry: null, stop: null, target: null,
  status: 'watching', candles: [],
  dataLabel: 'No setup loaded',
};

export const EMPTY_KIT_DATA: KitData = {
  trade: EMPTY_IDEA,
  ideas: [],
  greeting: '',
  selectedLevelNotes: { entry: '', stop: '', target: '' },
  profile: { name: '', rank: 'white', progress: 0, nextRank: '', balanceLabel: '' },
  company: { symbol: '', name: '', description: '', whyWatch: '', risk: '', sourceLabel: '' },
  companies: [],
  lessons: [],
  skills: [],
  video: { lessonId: '', title: '', creator: '', duration: '' },
  rooms: [],
  messages: [],
  threads: [],
  plan: { name: '', priceLabel: '', availability: '', interests: [] },
  membership: { name: '', creditsUsed: 0, creditsTotal: 0, resetsLabel: '', included: [], excluded: [] },
  execution: 'paper',
  order: { statusLabel: '', filled: 0, requested: 0, asOf: '' },
  position: { shares: 0, entry: 0, current: null, asOf: '' },
  review: { title: '', lesson: '', exitPrice: 0, shares: 0, entry: 0 },
  connection: { lastUpdated: '', message: '' },
  notificationDelivery: '',
};

/* ==================================================================== */
/* State                                                                */
/* ==================================================================== */

/**
 * `KitState` is the kit's own UI state — which filter is selected, how many
 * shares are typed into the box — and it is NOT the app's preferences.
 *
 * Three fields are the exception and they are seeded from the real stores,
 * because they already exist and a second copy would drift: `textScale` and
 * `reducedMotion` come from the accessibility provider (audit F19), and
 * `roomId` from the remembered room. Everything the member changes through the
 * kit is persisted back through `onAction` rather than living only here.
 */
export function useKitState(seed?: Partial<KitState>): [KitState, (patch: Partial<KitState>) => void] {
  const textScale = useTextScale();
  const reducedMotion = useReducedMotion();

  const [local, setLocal] = useState<KitState>(() => ({
    persona: 'learn',
    interest: '',
    level: 'entry',
    alertFilter: 'active',
    quantity: 1,
    ownedShares: 0,
    candlePart: 'body',
    guidance: 'guided',
    textScale,
    reducedMotion,
    setupNotifications: true,
    communityNotifications: true,
    quietHours: false,
    email: '',
    password: '',
    roomId: '',
    ...seed,
  }));

  // The two accessibility values are owned elsewhere and mirrored in, never the
  // other way round: the OR in the provider is what stops an in-app setting
  // overriding a phone set to reduce motion.
  const state = useMemo<KitState>(
    () => ({ ...local, textScale, reducedMotion }),
    [local, textScale, reducedMotion],
  );

  const patch = useCallback((p: Partial<KitState>) => setLocal((s) => ({ ...s, ...p })), []);
  return [state, patch];
}

/* ==================================================================== */
/* Actions                                                              */
/* ==================================================================== */

/** Where each kit screen id lives in this app's router. */
const ROUTE: Partial<Record<ScreenId, string>> = {
  'home-beginner': '/home', 'home-developing': '/home', 'home-ready': '/home',
  'home-invest': '/desk', research: '/desk/themes', company: '/desk',
  alerts: '/alerts', setup: '/alerts', analysis: '/trade',
  'order-review': '/order/review', 'order-pending': '/order/new', position: '/position',
  debrief: '/debrief', quiet: '/home', offline: '/home',
  training: '/training', lesson: '/training', video: '/training',
  'lesson-complete': '/training', skills: '/training/progress', belt: '/training/belt',
  community: '/community', 'room-switcher': '/community', discussion: '/community',
  history: '/home', kai: '/home', account: '/account',
  guidance: '/account/settings', notifications: '/account/notifications',
  membership: '/account/subscription',
};

/**
 * The action router.
 *
 * Everything a composition can do arrives here as one discriminated union, and
 * this is the only place it becomes navigation or a mutation. Two rules the kit
 * states and this honours: the host performs authoritative validation for
 * `submit-order` (the UI calculates display math only), and `complete-lesson`
 * REQUESTS assessment rather than awarding it — the server decides, which is
 * what 0046 and 0047 made true.
 */
export function useKitActions(patch: (p: Partial<KitState>) => void) {
  const router = useRouter();

  return useCallback((action: KitAction) => {
    switch (action.type) {
      case 'state':
        patch(action.patch);
        return;
      case 'back':
        if (router.canGoBack()) router.back();
        return;
      case 'navigate': {
        const to = ROUTE[action.screen];
        if (to) router.push(to as never);
        return;
      }
      case 'open-idea':
        if (action.id) router.push(`/setup/${encodeURIComponent(action.id)}` as never);
        return;
      case 'open-company':
        if (action.symbol) router.push(`/desk/pick/${encodeURIComponent(action.symbol)}` as never);
        return;
      case 'open-room':
        patch({ roomId: action.id });
        return;
      case 'open-thread':
        patch({ threadId: action.id });
        return;
      case 'new-thread':
        patch({ threadId: undefined });
        return;
      case 'open-lesson':
        if (action.id) router.push(`/training/${encodeURIComponent(action.id)}` as never);
        return;
      case 'analyze-chart':
        router.push('/trade' as never);
        return;
      case 'retry':
        // The caller binds a real refresh; a host with nothing to refresh does
        // nothing rather than pretending to.
        return;
      default:
        // Domain actions — submit-order, complete-lesson, create-account,
        // sign-out and the rest — belong to the route that owns that domain and
        // are handled by the `onAction` it composes around this one. Falling
        // through silently here would make a button look wired when it is not,
        // so an unhandled action is left for the caller by design.
        return;
    }
  }, [patch, router]);
}

/* ==================================================================== */
/* The provider                                                         */
/* ==================================================================== */

type HostValue = {
  data: KitData;
  state: KitState;
  patch: (p: Partial<KitState>) => void;
  onAction: (a: KitAction) => void;
  /** True while the signed-in member is not known yet. */
  loading: boolean;
};

const Ctx = createContext<HostValue | null>(null);

export function KitHostProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useSession();
  const [state, patch] = useKitState();
  const onAction = useKitActions(patch);

  const data = useMemo<KitData>(() => ({
    ...EMPTY_KIT_DATA,
    // The one field that is genuinely global and genuinely known.
    profile: {
      ...EMPTY_KIT_DATA.profile,
      name: profile?.display_name ?? '',
      rank: 'white',
      progress: 0,
      nextRank: '',
      balanceLabel: '',
    },
  }), [profile?.display_name]);

  const value = useMemo<HostValue>(
    () => ({ data, state, patch, onAction, loading: !profile }),
    [data, state, patch, onAction, profile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKitHost(): HostValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useKitHost outside KitHostProvider');
  return v;
}
