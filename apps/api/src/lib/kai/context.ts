/**
 * Kai context assembly (03 Unit 3, trimmed to the v1 slice).
 *
 * profile + risk policy + mode → pinned context → ranked setups for the mode →
 * last 20 conversation turns. No market_memory / kai_user_memory retrieval and
 * no live tools in this slice — Kai talks about the real rows in the database
 * and nothing else.
 */
import { KAI_HISTORY_TURNS, type AppMode } from '@shared/api';
import { serviceClient } from '../db';
import { marketBlock, quoteFromSnapshot } from '../market';
import { ensureSeedLevelsChecked } from '../v5/seed-guard';

export type SetupRow = {
  id: string;
  symbol: string;
  mode: AppMode;
  intent: string;
  state: string;
  score: number | null;
  grade_band: string | null;
  grade_display: string | null;
  score_components: Record<string, unknown> | null;
  thesis_plain: string | null;
  thesis_technical: string | null;
  entry_condition: Record<string, unknown> | null;
  invalidation: Record<string, unknown> | null;
  stop: number | null;
  targets: unknown;
  catalyst: Record<string, unknown> | null;
  quote_snapshot: Record<string, unknown>;
  valid_until: string | null;
  scanner_run_id: string | null;
};

export type ProfileRow = {
  user_id: string;
  display_name: string | null;
  primary_mode: AppMode;
  experience: string;
  involvement: string;
  explanation_level: string;
  memory_enabled: boolean;
  onboarding: Record<string, unknown>;
  timezone: string | null;
};

export type RiskPolicyRow = {
  daily_loss_cap_usd: number | null;
  max_position_pct: number | null;
  max_open_positions: number | null;
  max_sector_concentration_pct: number | null;
  min_reward_risk: number | null;
  pdt_warnings: boolean | null;
};

export type TurnRow = { seq: number; role: 'user' | 'kai'; content: { text?: string } };

export type KaiContext = {
  profile: ProfileRow;
  risk: RiskPolicyRow | null;
  mode: AppMode;
  setups: SetupRow[];
  pinnedSetups: SetupRow[];
  turns: TurnRow[];
  marketBlock: ReturnType<typeof marketBlock>;
};

const SETUP_COLUMNS =
  'id,symbol,mode,intent,state,score,grade_band,grade_display,score_components,thesis_plain,thesis_technical,entry_condition,invalidation,stop,targets,catalyst,quote_snapshot,valid_until,scanner_run_id';

/** Ranked setups for a mode: score desc, then urgency-ish by state. */
export async function rankedSetups(mode: AppMode, cap: number, state?: string): Promise<SetupRow[]> {
  // Warns (once, then hourly) when the seeded levels are stale enough to
  // contradict a live quote. Fire-and-forget: it never blocks the read.
  ensureSeedLevelsChecked();
  const db = serviceClient();
  let q = db
    .from('setups')
    .select(SETUP_COLUMNS)
    .eq('mode', mode)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(cap);
  if (state) q = q.eq('state', state);
  else q = q.in('state', ['discovered', 'watching', 'forming', 'ready', 'invalidated']);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as SetupRow[];
}

export async function setupsByIds(ids: string[]): Promise<SetupRow[]> {
  if (ids.length === 0) return [];
  const db = serviceClient();
  const { data, error } = await db.from('setups').select(SETUP_COLUMNS).in('id', ids);
  if (error) throw error;
  return (data ?? []) as unknown as SetupRow[];
}

export async function loadProfile(userId: string): Promise<ProfileRow> {
  const db = serviceClient();
  const { data, error } = await db
    .from('profiles')
    .select('user_id,display_name,primary_mode,experience,involvement,explanation_level,memory_enabled,onboarding,timezone')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data as unknown as ProfileRow;
}

export async function loadRiskPolicy(userId: string): Promise<RiskPolicyRow | null> {
  const db = serviceClient();
  const { data } = await db
    .from('risk_policies')
    .select('daily_loss_cap_usd,max_position_pct,max_open_positions,max_sector_concentration_pct,min_reward_risk,pdt_warnings')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as unknown as RiskPolicyRow) ?? null;
}

export async function lastTurns(conversationId: string, n = KAI_HISTORY_TURNS): Promise<TurnRow[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from('conversation_messages')
    .select('seq,role,content')
    .eq('conversation_id', conversationId)
    .order('seq', { ascending: false })
    .limit(n);
  if (error) throw error;
  return ((data ?? []) as unknown as TurnRow[]).reverse();
}

export async function assembleContext(opts: {
  userId: string;
  mode?: AppMode;
  conversationId?: string;
  pinnedSetupIds?: string[];
  cap?: number;
}): Promise<KaiContext> {
  const profile = await loadProfile(opts.userId);
  const mode = opts.mode ?? profile.primary_mode;
  const [risk, setups, pinnedSetups, turns] = await Promise.all([
    loadRiskPolicy(opts.userId),
    rankedSetups(mode, opts.cap ?? 5),
    setupsByIds(opts.pinnedSetupIds ?? []),
    opts.conversationId ? lastTurns(opts.conversationId) : Promise.resolve([]),
  ]);
  return { profile, risk, mode, setups, pinnedSetups, turns, marketBlock: marketBlock() };
}

/**
 * What is on the chart the user is looking at, when there is one.
 *
 * Only the two facts the refusal rule below needs: the symbol, and the levels
 * that ACTUALLY resolve against real rows for it. Deliberately not the whole
 * `ChartContext` — this module renders a prompt and has no business importing
 * the chart's loader.
 */
export type ChartOnScreen = { symbol: string; timeframe: string; levels: string[] };

/** Compact, unambiguous rendering of the context for the model. */
export function renderContext(ctx: KaiContext, chart?: ChartOnScreen | null): string {
  const lines: string[] = [];
  lines.push(
    `MARKET: ${ctx.marketBlock.label_plain} (status=${ctx.marketBlock.status}) as of ${ctx.marketBlock.session_ts}. ` +
      `US market holidays are NOT known to this system yet — weekends only.`
  );
  if (ctx.risk) {
    lines.push(
      `RISK POLICY: daily loss cap ${fmtUsd(ctx.risk.daily_loss_cap_usd)}, max position ${ctx.risk.max_position_pct ?? '—'}% of account, ` +
        `max open positions ${ctx.risk.max_open_positions ?? '—'}, minimum reward:risk ${ctx.risk.min_reward_risk ?? '—'}.`
    );
  }
  const render = (s: SetupRow, tag: string) => {
    const q = quoteFromSnapshot(s.symbol, s.quote_snapshot);
    const targets = normalizeTargets(s.targets)
      .map((t) => (t.label ? `${t.price} (${t.label})` : `${t.price}`))
      .join(', ');
    return [
      `${tag} ${s.symbol} · mode=${s.mode} · intent=${s.intent} · state=${s.state} · grade=${s.grade_display ?? s.grade_band ?? '—'} (score ${s.score ?? '—'})`,
      `  setup_id: ${s.id}`,
      `  thesis_plain: ${s.thesis_plain ?? '—'}`,
      `  thesis_technical: ${s.thesis_technical ?? '—'}`,
      `  entry_condition: ${JSON.stringify(s.entry_condition ?? null)}`,
      `  stop: ${s.stop ?? 'null'}  targets: ${targets || 'none'}`,
      `  invalidation: ${JSON.stringify(s.invalidation ?? null)}`,
      `  catalyst: ${JSON.stringify(s.catalyst ?? null)}`,
      `  quote: price=${q.price ?? 'unknown'} freshness=${q.freshness} source_ts=${q.source_ts ?? 'unknown'} received_ts=${q.received_ts ?? 'unknown'}`,
      `  valid_until: ${s.valid_until ?? '—'}`,
    ].join('\n');
  };

  if (ctx.pinnedSetups.length) {
    lines.push('PINNED BY THE USER (talk about these first):');
    lines.push(...ctx.pinnedSetups.map((s) => render(s, '•')));
  }
  lines.push(`RANKED SETUPS FOR ${ctx.mode.toUpperCase()} (score desc — these are the ONLY setups you may cite):`);
  lines.push(ctx.setups.length ? ctx.setups.map((s) => render(s, '•')).join('\n') : '  (none right now)');
  /**
   * THE REFUSAL, AND WHY IT NEEDED SPLITTING IN TWO.
   *
   * The rule used to be one sentence: a symbol that is not in the ranked list
   * gets "I have no graded setup on it right now". Correct as far as it goes,
   * and it is the last thing in the prompt, so it is the instruction that wins.
   *
   * It was ALSO being applied to the chart the user was looking at. Open the
   * Trade Portal on anything outside the top few ranked setups — which is most
   * tickers, most of the time — and Kai answered "I have no graded setup on it"
   * while a chart with real support and resistance sat directly above the reply.
   * That is not caution, it is Kai refusing to discuss something the user can
   * see, and it made the whole chart-answer feature look broken.
   *
   * NO GRADED SETUP IS NOT THE SAME AS NOTHING TO SAY. The levels below came
   * out of the same resolver every chart command uses — swing highs and lows
   * computed from stored bars, an entry from a saved plan. They are traceable,
   * they are already drawn, and talking about them invents nothing. What Kai
   * still may not do is imply a graded trade idea exists when it does not, so
   * that half of the rule is kept and stated separately.
   */
  if (chart) {
    lines.push(
      `ON SCREEN: the user is looking at a ${chart.symbol} chart on the ${chart.timeframe} timeframe.` +
        (chart.levels.length
          ? ` These levels on it resolve against real rows and are yours to discuss and draw: ${chart.levels.join(', ')}.`
          : ' No named level on it resolves against a real row yet.')
    );
    lines.push(
      `Answer questions about the ${chart.symbol} chart in front of them directly, whether or not ${chart.symbol} is in ` +
        'the ranked list above. Use the chart, the levels named above and what price has actually done.'
    );
    /**
     * DO NOT OPEN WITH WHAT YOU DO NOT HAVE.
     *
     * The first version of this rule said "you have no graded setup — say that
     * once, plainly, then answer". It did exactly that, on every single reply:
     * every answer about every chart began "I don't have a graded setup on
     * Apple right now, but...". Technically it was answering. It read as
     * refusing, because the first thing the user hears is the thing Kai will
     * not do, and nobody asked. A disclaimer volunteered on every turn is not
     * caution — it is noise that buries the answer.
     *
     * The claim that actually needs governing is the opposite one: never imply a
     * graded setup exists when it does not. Staying quiet about a grade nobody
     * asked for does not imply one. So the mention is now DEMAND-DRIVEN — it
     * belongs in an answer about the grade, and nowhere else.
     */
    lines.push(
      'Do NOT open by saying what you lack. If there is no graded setup on this symbol, mention it ONLY when the ' +
        'question is about a grade, a rating, or whether to take the trade — and then say it in one short clause, not ' +
        'as a preamble. For every other question, just read the chart. Never imply a graded setup exists when it does ' +
        'not, and never state a price that is not one of the levels above.'
    );
  }
  lines.push(
    'If the user asks about a DIFFERENT symbol — one that is neither listed above nor on their screen — say plainly ' +
      'that you have no graded setup on it right now and do not invent prices for it.'
  );
  return lines.join('\n');
}

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function normalizeTargets(raw: unknown): { price: number; label?: string }[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: { price: number; label?: string }[] = [];
  for (const t of arr) {
    if (typeof t === 'number' && Number.isFinite(t)) out.push({ price: t });
    else if (t && typeof t === 'object') {
      const o = t as Record<string, unknown>;
      // `level` is 0020's normalised target shape ([{label, level}]); `price`
      // is the setups/plan shape this app writes. Both are read here so a plan
      // round-tripped through `create_plan` never loses its targets.
      const price = Number(o.price ?? o.level ?? o.value ?? o.target);
      if (Number.isFinite(price)) out.push({ price, ...(typeof o.label === 'string' ? { label: o.label } : {}) });
    }
  }
  return out;
}

/** Entry price out of an entry_condition jsonb, when one is expressible. */
export function entryPrice(entryCondition: unknown): number | null {
  if (!entryCondition || typeof entryCondition !== 'object') return null;
  const o = entryCondition as Record<string, unknown>;
  for (const k of ['price', 'level', 'trigger', 'above', 'below', 'value']) {
    const v = Number(o[k]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

export function invalidationPrice(invalidation: unknown): number | null {
  if (!invalidation || typeof invalidation !== 'object') return null;
  const o = invalidation as Record<string, unknown>;
  for (const k of ['price', 'level', 'below', 'above', 'value']) {
    const v = Number(o[k]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Every number Kai was actually shown: setup levels, thesis text figures, quote
 * prices, risk-policy limits. The contradiction validator treats these as
 * legitimate sources for a price mentioned in the narrative — the rule it
 * enforces is "do not invent numbers", not "do not mention context".
 */
export function contextNumbers(ctx: KaiContext): number[] {
  const out: number[] = [];
  const pushAll = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string') {
      for (const m of v.matchAll(/\d+(?:\.\d+)?/g)) {
        const n = Number(m[0]);
        if (Number.isFinite(n)) out.push(n);
      }
    } else if (Array.isArray(v)) v.forEach(pushAll);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(pushAll);
  };

  for (const s of [...ctx.setups, ...ctx.pinnedSetups]) {
    pushAll(s.score);
    pushAll(s.stop);
    pushAll(s.targets);
    pushAll(s.entry_condition);
    pushAll(s.invalidation);
    pushAll(s.quote_snapshot);
    pushAll(s.catalyst);
    pushAll(s.thesis_plain);
    pushAll(s.thesis_technical);
    pushAll(s.score_components);
  }
  if (ctx.risk) pushAll(ctx.risk);
  return out;
}
