/**
 * KAI DRIVING THE SCREEN — the UI half of the agent, kept apart from the data half.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE DISTINCTION THIS FILE EXISTS TO PROTECT
 * ═════════════════════════════════════════════════════════════════════════════
 *   A TOOL GETS INFORMATION.        read_community_messages('NVDA')
 *   AN ACTION SHOWS INFORMATION.    show_community({ symbol: 'NVDA' })
 *
 * They are never merged. A tool that also rearranged the screen would make every
 * lookup a layout decision, and a screen change that required a lookup would
 * cost a round trip to move a panel. Tools live in `tools*.ts` and return data.
 * The actions here return nothing at all — they are a request to the client to
 * show something it can already reach.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A FENCE AND NOT A TOOL
 * ═════════════════════════════════════════════════════════════════════════════
 * A tool call is a STOP: the model ends its turn, the server answers, the whole
 * prompt goes back up, and the model starts again. That is the right shape for
 * "go and find out" and completely the wrong shape for "put it on screen" —
 * there is nothing to come back with, and paying a round trip for a layout
 * change would make the chart appear a beat after the sentence that promised it.
 *
 * So an action is emitted the way a structured object is: a fenced block inside
 * the reply, split out of the text as it streams, and sent as its own frame
 * WHILE Kai is still talking. The chart materialises under the words.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NOTHING HERE ACTS
 * ═════════════════════════════════════════════════════════════════════════════
 * Every action opens a view. None writes, buys, sizes, arms or confirms. There
 * is deliberately no `submit_order`, no `arm_alert` and no `create_plan` in the
 * union, and adding one would move the execution boundary rather than extend a
 * vocabulary. The member walks to the ticket themselves; Kai can only put the
 * chart in front of them.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * AND NOTHING HERE IS TAKEN ON TRUST
 * ═════════════════════════════════════════════════════════════════════════════
 * A model that emits `show_alert` with a made-up uuid produces a screen that
 * flashes and then says nothing is there. So every id in an action is checked
 * against a real row OWNED BY THIS USER before the frame goes out, and an action
 * that does not resolve is dropped — the prose stands on its own, exactly as a
 * `chart_command` naming an unresolvable level is dropped rather than guessed.
 */
import type { KaiWorkspaceAction, WorkspaceState } from '@shared/api';
import { KaiWorkspaceAction as KaiWorkspaceActionSchema } from '@shared/api';
import { serviceClient } from '../db';
import { log } from '../log';

export const KAI_UI_FENCE = 'kai_ui';

/* ==================================================================== */
/* What Kai is told                                                     */
/* ==================================================================== */

/**
 * THE PROTOCOL BLOCK.
 *
 * Written around the failure mode rather than the feature: a model given a way
 * to change the screen will change it constantly, narrate changes it did not
 * make, and describe a panel as though the user were already looking at it. So
 * the rules that get the most words are the ones about NOT emitting — one per
 * reply, only when asked or when the answer is unreadable without it, and never
 * a claim that something is on screen unless the action for it went out.
 */
export const WORKSPACE_PROTOCOL = `SHOWING THINGS ON SCREEN

You can put things in front of the person you are talking to. Their screen has a
workspace above the conversation, and you can open a surface in it: a live chart,
a setup, one of their alerts, a community room, the news on a ticker, or a page
you read. You do this by emitting ONE fenced block:

\`\`\`${KAI_UI_FENCE}
{ "type": "open_chart", "symbol": "NVDA", "timeframe": "4h" }
\`\`\`

The block is never shown as text. Put your words before it; keep talking as
normal. The surface appears while you are still speaking, so write the sentence
that goes with it — "pulling it up now" — rather than a sentence about a screen
that has already changed.

THE ACTIONS
  { "type": "open_chart",     "symbol": "NVDA", "timeframe": "4h" }
  { "type": "show_setup",     "setup_id": "<id from your context or a lookup>" }
  { "type": "show_alert",     "alert_id": "<id from read_alerts>" }
  { "type": "show_community", "symbol": "NVDA" }   or  { "room": "traders" }
  { "type": "show_news",      "symbol": "NVDA" }
  { "type": "show_web",       "url": "<a url you actually opened>" }
  { "type": "focus_surface",  "surface_id": "chart" }
  { "type": "close_surface",  "surface_id": "news" }

WHEN TO EMIT ONE
- They asked to see something: "pull up NVDA", "show me the first one", "what
  are people saying", "show me the article".
- Or the answer does not make sense without it — you are about to talk about
  where price is sitting relative to three levels, and they cannot see the chart.

WHEN NOT TO
- Not on every turn. A screen that rearranges itself while somebody is reading
  is worse than one that sits still.
- ONE block per reply. If two things are worth showing, open the one they asked
  about and say the other is there.
- Never when the surface it names is already the active one — they are looking
  at it.
- Never to "illustrate" a general answer nobody asked to see.

THE IDS ARE REAL OR THE ACTION IS DROPPED
Every id must be one you were GIVEN — in your context, or back from a tool you
just called. Never construct one, never guess one, never reuse one from another
symbol. An action carrying an id that does not resolve is discarded by the
server and NOTHING appears, so a sentence claiming it did would be a lie you
cannot see yourself telling. If you have no id, say what you would need.

ONCE IT IS OPEN, THE CHART IS THE CHART
Marking levels, drawing zones, moving the camera — those are chart commands and
they are unchanged. Open the chart with an action; draw on it the way you always
have.`;

/* ==================================================================== */
/* Reading one                                                          */
/* ==================================================================== */

/** Parse one fenced body. Anything malformed is nothing, never a guess. */
export function readWorkspaceAction(body: string): KaiWorkspaceAction | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body.trim());
  } catch {
    return null;
  }
  const parsed = KaiWorkspaceActionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/* ==================================================================== */
/* Checking one against reality                                         */
/* ==================================================================== */

export type WorkspaceActionCtx = { userId: string; requestId: string };

/**
 * Resolve an action against real rows, or refuse it.
 *
 * Returns the action — normalised, and with ids confirmed — or `null`, which
 * means the client is told nothing and the prose stands alone. The rule is the
 * same one the chart commands follow: a surface Kai cannot prove exists does not
 * open. The failure a user would actually notice is the opposite one, a panel
 * that opens onto nothing, and this is where that is prevented.
 *
 * EVERY LOOKUP IS SCOPED TO THE USER. `alert_id` and `room_id` are checked
 * against rows they own or are a member of, so an id borrowed from anywhere —
 * another session, a hallucination that happens to be valid, a community post
 * Kai just read — resolves to nothing rather than to somebody else's data.
 */
export async function resolveWorkspaceAction(
  action: KaiWorkspaceAction,
  ctx: WorkspaceActionCtx
): Promise<KaiWorkspaceAction | null> {
  const db = serviceClient();
  const drop = (why: string): null => {
    log('info', ctx.requestId, 'kai.workspace_action_dropped', { type: action.type, why });
    return null;
  };

  switch (action.type) {
    /**
     * A SYMBOL IS NOT AN ID, SO IT IS CHECKED DIFFERENTLY.
     *
     * There is no row to own. What there has to be is a chart worth opening, and
     * the honest test for that is whether the market data provider knows the
     * ticker — which `instruments` answers for the tracked universe. A symbol
     * outside it still opens: the chart loads from bars, and refusing every
     * untracked ticker would break the one case this whole feature exists for.
     * What is refused is a symbol that is not shaped like one at all, which is
     * what a hallucinated ticker looks like.
     */
    case 'open_chart': {
      const symbol = action.symbol.trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(symbol)) return drop('symbol_shape');
      let setupId = action.setup_id;
      if (setupId) {
        const { data } = await db.from('setups').select('id,symbol').eq('id', setupId).maybeSingle();
        const row = data as Record<string, unknown> | null;
        // A setup id from a DIFFERENT symbol is the interesting failure: it is
        // how a chart opens carrying somebody else's levels.
        if (!row || String(row.symbol).toUpperCase() !== symbol) setupId = null;
      }
      return { ...action, symbol, setup_id: setupId };
    }

    case 'show_setup': {
      const { data } = await db
        .from('setups')
        .select('id,symbol')
        .eq('id', action.setup_id)
        .maybeSingle();
      const row = data as Record<string, unknown> | null;
      if (!row) return drop('setup_not_found');
      return { ...action, symbol: String(row.symbol).toUpperCase() };
    }

    case 'show_alert': {
      const { data } = await db
        .from('alerts')
        .select('id')
        .eq('id', action.alert_id)
        .eq('user_id', ctx.userId)
        .maybeSingle();
      if (!data) return drop('alert_not_found_or_not_theirs');
      return action;
    }

    /**
     * A ROOM THEY ARE NOT IN IS NOT A ROOM THEY CAN SEE.
     *
     * Same rule the `read_community_messages` tool follows, for the same reason:
     * Kai acts on the member's behalf and has exactly their reach. Opening a
     * room they have not joined would either show them a room they cannot read
     * or show them one they should not.
     */
    case 'show_community': {
      const joined = await db
        .from('room_members')
        .select('room_id,banned')
        .eq('user_id', ctx.userId)
        .limit(50);
      const allowed = ((joined.data ?? []) as Record<string, unknown>[])
        .filter((r) => !r.banned)
        .map((r) => String(r.room_id));
      if (!allowed.length) return drop('no_rooms_joined');

      if (action.room_id) {
        return allowed.includes(action.room_id) ? action : drop('not_a_member');
      }
      if (action.room) {
        const slug = action.room.trim().toLowerCase();
        const { data } = await db.from('rooms').select('id,slug').in('id', allowed).eq('slug', slug);
        const row = ((data ?? []) as Record<string, unknown>[])[0];
        if (!row) return drop('not_a_member');
        return { ...action, room_id: String(row.id) };
      }
      // Neither named: the client resolves it against the room they last read,
      // which is a better answer than this module guessing one.
      return action;
    }

    case 'show_news': {
      const symbol = action.symbol.trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(symbol)) return drop('symbol_shape');
      return { ...action, symbol };
    }

    /**
     * ONLY A PAGE HE ACTUALLY READ.
     *
     * `show_web` is the one action carrying a URL, so it is the one that could
     * put an arbitrary address in front of a member. It goes through the SAME
     * allowlist `open_web_page` does — the tool and the surface cannot disagree
     * about what is readable — and an address outside it is dropped here rather
     * than refused later on the screen.
     */
    case 'show_web': {
      const { __test: web } = await import('./tools-web');
      const vetted = await web.vet(action.url.trim());
      if ('refused' in vetted) return drop('url_not_allowed');
      return { ...action, url: vetted.url.toString() };
    }

    // Pure client-side moves over surfaces that are already open. There is
    // nothing on the server to check them against, and inventing a registry of
    // open surfaces here would be a second copy of state the client owns.
    case 'focus_surface':
    case 'close_surface':
      return action;

    default:
      return null;
  }
}

/* ==================================================================== */
/* What they are looking at, rendered into the turn                     */
/* ==================================================================== */

const SURFACE_PLAIN: Record<string, string> = {
  chart: 'a live chart',
  setup: 'a graded setup',
  alert: 'one of their alerts',
  community: 'a community room',
  news: 'the news on a ticker',
  web: 'a page you opened',
  watchlist: 'their watchlist',
  portfolio: 'their positions',
  training: 'a lesson',
  plan: 'a trade plan',
};

/**
 * THE FOUR FIELDS THAT MAKE PRONOUNS WORK.
 *
 * "Zoom in", "show me where I'm wrong", "what are they saying", "build it" —
 * every one of those is unanswerable from the words alone and trivially
 * answerable with this block in front of them.
 *
 * IT GOES AT THE END OF THE REQUEST, NEXT TO THE QUESTION, and never into the
 * cached system blocks. It changes on almost every turn: put it in the facts
 * block and nothing behind it could ever be read from cache again — the same
 * mistake `session_ts` used to make, which cost about nine thousand tokens a
 * call. It travels with the market line for exactly that reason.
 *
 * Returns '' when there is no workspace, which is most callers: the sheet, the
 * briefing, a script. An empty block would tell Kai a screen is empty when the
 * truth is that nobody mentioned a screen.
 */
export function renderWorkspace(ws: WorkspaceState | null | undefined): string {
  if (!ws) return '';
  if (!ws.active_surface && !ws.open_surfaces.length) {
    return (
      'ON THEIR SCREEN: the workspace is empty — they are in the conversation with nothing open. ' +
      'If the answer needs a chart or a setup in front of them, open one.'
    );
  }
  const lines: string[] = [];
  const active = ws.active_surface ? SURFACE_PLAIN[ws.active_surface] ?? ws.active_surface : null;
  lines.push(
    `ON THEIR SCREEN: they are looking at ${active ?? 'the conversation'}` +
      (ws.symbol ? ` for ${ws.symbol}` : '') +
      (ws.active_surface === 'chart' && ws.timeframe ? ` on the ${ws.timeframe} timeframe` : '') +
      '.'
  );
  if (ws.open_surfaces.length > 1) {
    lines.push(
      `Also open, one tap away: ${ws.open_surfaces.filter((s) => s !== ws.active_surface).join(', ')}. ` +
        'Use focus_surface to bring one forward rather than opening a second copy of it.'
    );
  }
  const ids: string[] = [];
  if (ws.setup_id) ids.push(`setup_id ${ws.setup_id}`);
  if (ws.alert_id) ids.push(`alert_id ${ws.alert_id}`);
  if (ws.room_id) ids.push(`room_id ${ws.room_id}`);
  if (ids.length) lines.push(`The object in front of them: ${ids.join(', ')}.`);
  lines.push(
    'Resolve "it", "this", "that one" and "they" against this before you ask which one they mean — ' +
      'they are pointing at something and you can see what it is. Do not re-open what is already active.'
  );
  return lines.join('\n');
}

/**
 * The chart the workspace has open, as a `ChartStamp` for `loadChartContext`.
 *
 * THIS IS WHAT MAKES HOME AND TRADE THE SAME PLACE. The Trade section stamps the
 * conversation with its chart when the thread is created; Home's workspace opens
 * a chart mid-conversation, long after. Feeding the live workspace through the
 * same loader means "mark the invalidation" resolves identically in both, off
 * one implementation, rather than working in Trade and quietly doing nothing on
 * Home.
 *
 * It WINS over the conversation's stored stamp when both exist, because the
 * stored one is where the thread started and this is where the member is now.
 */
export function chartStampFor(
  ws: WorkspaceState | null | undefined
): { symbol: string; timeframe?: string; setup_id?: string } | null {
  if (!ws?.symbol) return null;
  if (ws.active_surface !== 'chart' && !ws.open_surfaces.includes('chart')) return null;
  return {
    symbol: ws.symbol.toUpperCase(),
    ...(ws.timeframe ? { timeframe: ws.timeframe } : null),
    ...(ws.setup_id ? { setup_id: ws.setup_id } : null),
  };
}
