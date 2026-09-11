/**
 * THE WORKSPACE BUS — one place that knows what is on screen.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY A STORE AND NOT A PROP
 * ═════════════════════════════════════════════════════════════════════════════
 * Three things drive this state and none of them can see the other two:
 *
 *   1. KAI, through a `workspace_action` frame arriving mid-sentence, inside a
 *      stream handler that lives in a hook.
 *   2. THE MEMBER, tapping the surface strip or swiping back to the conversation.
 *   3. THE HOST SCREEN, which knows the route it is on.
 *
 * Threading one `useState` through all three would put the workspace's shape in
 * Home's component tree, and then the alert detail screen could not have one
 * without Home lending it. A module-level store with a subscription is the
 * smaller thing: any surface anywhere can read it, and the stream handler can
 * push into it without a ref-chain back up to the screen.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ONE ACTIVE SURFACE, A SHORT STACK BEHIND IT
 * ═════════════════════════════════════════════════════════════════════════════
 * The old War Room was a desktop with tabs. On a phone that is the wrong shape:
 * panels beside a conversation on a 390pt screen are four things too small to
 * read. So exactly ONE surface is active and takes the canvas, and the others
 * sit in a strip one tap away.
 *
 * The stack is capped. A conversation that opens six things does not leave the
 * member with a row of chips they will never scroll; the oldest falls off, and
 * anything that falls off is one sentence away from being opened again.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * OPENING WHAT IS ALREADY OPEN IS A FOCUS, NOT A SECOND COPY
 * ═════════════════════════════════════════════════════════════════════════════
 * `open_chart NVDA` twice is one chart. `open_chart NVDA` then `open_chart AMD`
 * is one chart that changed symbol, NOT two chart surfaces — a phone with two
 * chart chips in a strip is a phone whose owner has to remember which is which.
 * A surface's identity is its KIND, and its subject is a property of it.
 */
import { useSyncExternalStore } from 'react';
import type { KaiWorkspaceAction, WorkspaceState, WorkspaceSurfaceKind } from '@cheatcode/shared';

/** How many surfaces the strip will hold before the oldest falls off. */
export const MAX_SURFACES = 4;

/**
 * One thing on screen.
 *
 * `id` IS the kind. See the header: a surface is identified by what it is, and
 * its subject — which symbol, which alert — is state on it. That is what makes
 * "pull up AMD" replace the chart rather than add a second one, and it is why
 * `focus_surface` takes a kind and needs no registry of instances.
 */
export type Surface = {
  id: WorkspaceSurfaceKind;
  kind: WorkspaceSurfaceKind;
  symbol: string | null;
  setupId: string | null;
  alertId: string | null;
  roomId: string | null;
  url: string | null;
  title: string | null;
  /** Chart only. Null lets the chart keep whatever it resolved for itself. */
  timeframe: string | null;
  /** Bumped whenever the same surface is re-opened with a new subject. */
  nonce: number;
};

export type WorkspaceSnapshot = {
  surfaces: Surface[];
  /** Null means the conversation owns the canvas — the resting state. */
  activeId: WorkspaceSurfaceKind | null;
};

const EMPTY: WorkspaceSnapshot = { surfaces: [], activeId: null };

let state: WorkspaceSnapshot = EMPTY;
const listeners = new Set<() => void>();
let seq = 0;

function commit(next: WorkspaceSnapshot) {
  state = next;
  for (const l of listeners) l();
}

const blank = (kind: WorkspaceSurfaceKind): Surface => ({
  id: kind, kind,
  symbol: null, setupId: null, alertId: null, roomId: null,
  url: null, title: null, timeframe: null,
  nonce: ++seq,
});

/**
 * Put a surface on the canvas, or bring it forward with a new subject.
 *
 * The nonce moves only when the SUBJECT changes. A host keyed on it remounts
 * when the chart walks to a different ticker and does not remount when the same
 * chart is merely brought back to the front — which is the difference between a
 * ticker change and a WebView reload nobody asked for.
 */
function put(kind: WorkspaceSurfaceKind, patch: Partial<Omit<Surface, 'id' | 'kind' | 'nonce'>>) {
  const existing = state.surfaces.find((s) => s.id === kind);
  const base = existing ?? blank(kind);
  const merged: Surface = { ...base, ...patch, id: kind, kind };
  const subjectChanged =
    merged.symbol !== base.symbol ||
    merged.setupId !== base.setupId ||
    merged.alertId !== base.alertId ||
    merged.roomId !== base.roomId ||
    merged.url !== base.url;
  const next: Surface = subjectChanged ? { ...merged, nonce: ++seq } : merged;

  const rest = state.surfaces.filter((s) => s.id !== kind);
  // Newest last, oldest trimmed from the front — the strip reads left to right
  // in the order things were opened, which is the order they were talked about.
  const surfaces = [...rest, next].slice(-MAX_SURFACES);
  commit({ surfaces, activeId: kind });
}

export const workspace = {
  get(): WorkspaceSnapshot {
    return state;
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /**
   * Apply one of Kai's actions.
   *
   * Returns true when the screen changed, so a caller can tell "Kai opened
   * something" from "Kai emitted something that landed nowhere". The server has
   * already checked every id against a real row; this is the client half, and
   * it refuses the kinds it has no surface for rather than opening a blank.
   */
  apply(action: KaiWorkspaceAction): boolean {
    switch (action.type) {
      case 'open_chart':
        put('chart', {
          symbol: action.symbol.toUpperCase(),
          timeframe: action.timeframe ?? null,
          setupId: action.setup_id ?? null,
        });
        return true;
      case 'show_setup':
        put('setup', { setupId: action.setup_id, symbol: action.symbol ?? null });
        return true;
      case 'show_alert':
        put('alert', { alertId: action.alert_id });
        return true;
      case 'show_community':
        put('community', { roomId: action.room_id ?? null, symbol: action.symbol ?? null });
        return true;
      case 'show_news':
        put('news', { symbol: action.symbol.toUpperCase() });
        return true;
      case 'show_web':
        put('web', { url: action.url, title: action.title ?? null });
        return true;
      case 'focus_surface': {
        const found = state.surfaces.find((s) => s.id === action.surface_id);
        if (!found) return false;
        commit({ ...state, activeId: found.id });
        return true;
      }
      case 'close_surface': {
        const surfaces = state.surfaces.filter((s) => s.id !== action.surface_id);
        if (surfaces.length === state.surfaces.length) return false;
        commit({
          surfaces,
          activeId: state.activeId === action.surface_id
            ? surfaces[surfaces.length - 1]?.id ?? null
            : state.activeId,
        });
        return true;
      }
      default:
        return false;
    }
  },

  /** The member's own moves. Kai never calls these; the strip and the back gesture do. */
  focus(id: WorkspaceSurfaceKind) {
    if (state.surfaces.some((s) => s.id === id)) commit({ ...state, activeId: id });
  },

  /**
   * Back to the conversation WITHOUT closing anything.
   *
   * The distinction matters: a member who swipes down to read what Kai said
   * has not finished with the chart, and re-opening it from the strip must not
   * cost a reload. `close` is the one that forgets.
   */
  collapse() {
    if (state.activeId !== null) commit({ ...state, activeId: null });
  },

  close(id: WorkspaceSurfaceKind) {
    workspace.apply({ type: 'close_surface', surface_id: id } as KaiWorkspaceAction);
  },

  /** Everything goes. Used when the member starts a new conversation. */
  reset() {
    if (state.surfaces.length || state.activeId) commit(EMPTY);
  },

  /**
   * WHAT KAI IS TOLD, ON THE NEXT TURN.
   *
   * The ids travel so "build it" and "what are they saying" resolve against the
   * thing in front of them. The symbol is read off the ACTIVE surface first and
   * falls back to the chart's, because a member looking at the news for NVDA
   * with an NVDA chart behind it means NVDA either way — while a member on a
   * community room with no symbol at all is not talking about a ticker.
   */
  toState(): WorkspaceState {
    const active = state.surfaces.find((s) => s.id === state.activeId) ?? null;
    const chart = state.surfaces.find((s) => s.id === 'chart') ?? null;
    return {
      active_surface: state.activeId,
      symbol: active?.symbol ?? chart?.symbol ?? null,
      timeframe: chart?.timeframe ?? null,
      open_surfaces: state.surfaces.map((s) => s.id),
      setup_id: active?.setupId ?? state.surfaces.find((s) => s.setupId)?.setupId ?? null,
      alert_id: active?.alertId ?? state.surfaces.find((s) => s.alertId)?.alertId ?? null,
      room_id: active?.roomId ?? state.surfaces.find((s) => s.roomId)?.roomId ?? null,
    };
  },
};

/** Subscribe a component to the workspace. */
export function useWorkspaceSurfaces(): WorkspaceSnapshot {
  return useSyncExternalStore(workspace.subscribe, workspace.get, workspace.get);
}

/** The active surface alone, for a host that only renders one thing. */
export function useActiveSurface(): Surface | null {
  const snap = useWorkspaceSurfaces();
  return snap.surfaces.find((s) => s.id === snap.activeId) ?? null;
}
