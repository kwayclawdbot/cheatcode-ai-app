/**
 * Kai context assembly (03 Unit 3, trimmed to the v1 slice).
 *
 * profile + risk policy + mode → pinned context → ranked setups for the mode →
 * last 20 conversation turns. No market_memory / kai_user_memory retrieval and
 * no live tools in this slice — Kai talks about the real rows in the database
 * and nothing else.
 */
import { KAI_HISTORY_TURNS, type AppMode, type MarketBlock, type MarketQuote } from '@shared/api';
import { serviceClient } from '../db';
import { attachLiveQuotes, holidayNotice, liveMarketBlock, quoteFor, worstFreshness } from '../market/live';
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
  /**
   * What the market says about this symbol RIGHT NOW, stamped on by
   * `attachLiveQuotes` at assembly time in one batched call. Absent when the
   * feed could not answer — `quoteFor(row)` then falls back to the stored
   * snapshot and labels it with its real age. Never populated by a scanner.
   */
  live_quote?: MarketQuote | null;

  /**
   * WHAT THIS CALL ACTUALLY DID WHILE IT WAS RUNNING, written by the peak
   * tracker inside the *\/5 resolver pass (`lib/tracking/peaks.ts`) and added by
   * migration 0041.
   *
   * `peak_price`, `peak_at` and `peak_gain_pct` are GENERATED columns: the
   * database picks the favourable extreme from the direction on the row, so
   * nothing on this side has to decide whether a short's peak is its high or
   * its low. Read them, never compute them.
   *
   * All optional because a row read with an older column list simply will not
   * carry them, and an absent measurement must stay absent.
   */
  call_price?: number | null;
  high_price?: number | null;
  high_basis?: string | null;
  low_price?: number | null;
  low_basis?: string | null;
  peak_price?: number | null;
  peak_at?: string | null;
  peak_gain_pct?: number | null;
  resolution_kind?: string | null;
  resolution_price?: number | null;
  contract_cost?: number | null;
  contract_peak?: number | null;
  contract_peak_multiple?: number | null;
  contract_expiry_value?: number | null;
};

export type ProfileRow = {
  user_id: string;
  /**
   * The member's username. Read here so that every surface built on this row
   * — /me, /settings, Kai's own context — has the real value. It was hardcoded
   * to null in two responses until 0034, which is why the Account tab could
   * never show a name that was sitting in the database all along.
   */
  handle: string | null;
  avatar_url: string | null;
  display_name: string | null;
  primary_mode: AppMode;
  experience: string;
  involvement: string;
  explanation_level: string;
  memory_enabled: boolean;
  onboarding: Record<string, unknown>;
  timezone: string | null;
  /**
   * Readiness stage (0042). Kai reads it for the same reason the Home ordering
   * does — it is the difference between explaining what a stop is and assuming
   * it. Nullable in the type because a profile row written before 0042 applied
   * has no value, and the callers treat that as `beginner`.
   */
  stage: string | null;
  stage_locked: boolean | null;
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

/**
 * WHAT THE ACCOUNT IS WORTH — the number every risk rule is a percentage OF.
 *
 * THE BUG THIS FIXES. Asked "how many shares of CRWD could I take?", Kai
 * answered: *"No account size on file — the 10% max-position rule is a
 * percentage of your account balance, which I don't have access to. I'm not
 * connected to a broker or account balance in this paper trading environment."*
 * Every word of that was wrong. The owner's `accounts` row has existed the whole
 * time — paper, $10,000 cash, $10,000 buying power, $10,000 equity — and it was
 * simply never assembled into the context.
 *
 * So he could recite the risk policy perfectly — $300 daily cap, 10% max
 * position, 5 open at once, 1.5 minimum reward-to-risk — and could not apply a
 * single one of them, because every one of those rules is a fraction of a
 * balance he had not been given. Position sizing is the core job of a trade
 * assistant and it was the one arithmetic he could not do.
 */
export type AccountRow = {
  kind: string;
  currency: string | null;
  cash: number | null;
  buying_power: number | null;
  equity: number | null;
  starting_balance: number | null;
};

export type KaiContext = {
  profile: ProfileRow;
  risk: RiskPolicyRow | null;
  account: AccountRow | null;
  mode: AppMode;
  setups: SetupRow[];
  pinnedSetups: SetupRow[];
  turns: TurnRow[];
  marketBlock: MarketBlock;
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
    .select('user_id,handle,avatar_url,display_name,primary_mode,experience,involvement,explanation_level,memory_enabled,onboarding,timezone,stage,stage_locked')
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

/**
 * The account this user actually trades. Paper is preferred when both exist:
 * v1 executes on paper, so the balance a size must fit inside is the paper one.
 */
export async function loadAccount(userId: string): Promise<AccountRow | null> {
  const db = serviceClient();
  const { data } = await db
    .from('accounts')
    .select('kind,currency,cash,buying_power,equity,starting_balance')
    .eq('user_id', userId)
    .order('kind', { ascending: true })
    .limit(1);
  const row = ((data ?? []) as unknown as AccountRow[])[0];
  return row ?? null;
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
  const [risk, account, setups, pinnedSetups, turns] = await Promise.all([
    loadRiskPolicy(opts.userId),
    loadAccount(opts.userId),
    rankedSetups(mode, opts.cap ?? 5),
    setupsByIds(opts.pinnedSetupIds ?? []),
    opts.conversationId ? lastTurns(opts.conversationId) : Promise.resolve([]),
  ]);
  /**
   * ONE market call for the whole context. Every surface downstream of here —
   * Home's priority object, "also watching", the setup cards, Kai's own prompt
   * — reads the same quote off the same row, so they cannot disagree, and the
   * screen costs one request however many setups it holds.
   */
  const rows = [...setups, ...pinnedSetups];
  await attachLiveQuotes(rows);
  // Sequential on purpose and it costs nothing: the snapshot above already
  // asked for the session in the background, and `refreshMarketStatus` shares
  // one request between everyone waiting on it. Doing it in this order is what
  // lets the block carry the freshness the screen ACTUALLY has rather than a
  // constant — Home's "my prices are running behind" line reads this.
  const block = await liveMarketBlock(worstFreshness(rows));

  return { profile, risk, account, mode, setups, pinnedSetups, turns, marketBlock: block };
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

/**
 * THE ONE LINE THAT CHANGES EVERY SINGLE REQUEST.
 *
 * `session_ts` is `new Date().toISOString()` — a fresh timestamp, to the
 * millisecond, on every call. It used to be the FIRST line of the context,
 * which meant the first bytes of the prompt were different every time and not
 * one byte after it could ever be re-read from cache. Five thousand tokens of
 * setups sat behind a timestamp and were paid for in full, every turn.
 *
 * So it is its own function now, and the chat route puts it at the very END of
 * the request — after the last cache marker, next to the user's question, where
 * a value that moves belongs. Kai is told exactly the same thing; it is just
 * told last.
 */
export function renderMarketLine(ctx: KaiContext): string {
  return (
    `MARKET: ${ctx.marketBlock.label_plain} (status=${ctx.marketBlock.status}) as of ${ctx.marketBlock.session_ts}. ` +
    holidayNotice(ctx.marketBlock.holidays_known)
  );
}

/**
 * THE PRICES, AND WHY THEY TRAVEL WITH THE TIMESTAMP RATHER THAN THE FACTS.
 *
 * A price moves. Put it in the cached facts block and that block is different
 * on every turn, so nothing behind it can be re-read from cache — the exact
 * mistake `session_ts` used to make, one level down. So the quotes ride at the
 * END of the request, next to the market line and the user's question, where
 * everything that moves belongs. The setups themselves — thesis, levels, stop,
 * catalyst — do not move within a session and stay cached.
 *
 * Each line says the number, how fresh it is, and WHEN it is from, because
 * "$229.49" and "$229.49 as of Friday's close" are different claims and Kai
 * must be able to tell the user which one he is making.
 */
export function renderQuoteLines(ctx: KaiContext): string {
  const rows = [...ctx.pinnedSetups, ...ctx.setups];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const s of rows) {
    if (seen.has(s.symbol)) continue;
    seen.add(s.symbol);
    lines.push(`  ${s.symbol}: ${quoteSentence(s)}`);
  }
  if (!lines.length) return '';
  return (
    'PRICES RIGHT NOW (the only prices you may quote for these symbols; ' +
    'if one is not live, say when it is from rather than implying it is current):\n' +
    lines.join('\n')
  );
}

/** One symbol's price, its freshness and its age, in a form Kai can repeat. */
function quoteSentence(s: SetupRow): string {
  const q = quoteFor(s);
  if (q.price === null) return 'no price available — say so, do not estimate one';
  return `${q.price} · ${q.label_plain} (freshness=${q.freshness}, source_ts=${q.source_ts ?? 'unknown'})`;
}

/**
 * Compact, unambiguous rendering of the context for the model.
 *
 * `opts.market` is on by default so every existing caller is unchanged. The
 * chat route turns it OFF and sends `renderMarketLine` separately — see above.
 */
export function renderContext(
  ctx: KaiContext,
  chart?: ChartOnScreen | null,
  opts?: { market?: boolean; quotes?: boolean }
): string {
  const lines: string[] = [];
  if (opts?.market !== false) lines.push(renderMarketLine(ctx));
  if (ctx.risk) {
    lines.push(
      `RISK POLICY: daily loss cap ${fmtUsd(ctx.risk.daily_loss_cap_usd)}, max position ${ctx.risk.max_position_pct ?? '—'}% of account, ` +
        `max open positions ${ctx.risk.max_open_positions ?? '—'}, minimum reward:risk ${ctx.risk.min_reward_risk ?? '—'}.`
    );
  }
  /**
   * THE BALANCE, AND THE TWO SUMS THAT TURN A PERCENTAGE INTO SHARES.
   *
   * The rules above are all fractions of this number, so without it Kai could
   * recite the policy and apply none of it — he told the owner he had "no
   * account size on file" while the row said $10,000.
   *
   * The two calculations are spelled out because they are the ones he is asked
   * for and they are arithmetic on numbers that are all RIGHT HERE: the balance
   * from the row, the percentage from the policy, and a stop that must come off
   * a graded setup or the user's own mouth. Nothing in this block lets him
   * produce a stop — sizing needs one, and where it comes from is unchanged.
   *
   * The cap in dollars is computed once, here, rather than left to the model.
   * A ceiling the user is told is "10% of your account" and a ceiling in dollars
   * must be the same ceiling, and a model doing arithmetic in prose is the one
   * way they come out different.
   */
  if (ctx.account) {
    const a = ctx.account;
    const base = a.equity ?? a.cash ?? a.buying_power ?? null;
    const pct = ctx.risk?.max_position_pct ?? null;
    const capUsd = base !== null && pct !== null ? Math.round(base * (pct / 100) * 100) / 100 : null;
    lines.push(
      `ACCOUNT (${a.kind === 'paper' ? 'PAPER money, not real' : a.kind}): ` +
        `equity ${fmtUsd(a.equity)}, cash ${fmtUsd(a.cash)}, buying power ${fmtUsd(a.buying_power)}` +
        (a.starting_balance !== null ? `, started at ${fmtUsd(a.starting_balance)}` : '') +
        '.'
    );
    if (capUsd !== null) {
      lines.push(
        `MOST YOU MAY PUT IN ONE POSITION: ${fmtUsd(capUsd)} — that is the ${pct}% cap applied to ${fmtUsd(base)}. ` +
          'Use this figure when asked how much or how many shares; do not work the percentage out again in your head.'
      );
    }
    lines.push(
      'HOW TO ANSWER "how many shares": shares = the risk you are willing to lose divided by (entry − stop), then ' +
        'capped so shares × entry does not exceed the position limit above. You have the balance and the limit, so ' +
        'ANSWER THE QUESTION — never say you do not have an account size. ' +
        'If there is no stop you cannot size a trade: say what the position limit is in dollars and roughly how many ' +
        'shares that buys at the current price, and ask where they would get out. ' +
        'Producing a stop yourself on a symbol with no graded setup is the one thing you may not do.'
    );
  }
  const render = (s: SetupRow, tag: string) => {
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
      // The price is deliberately NOT here — see `renderQuoteLines`. It moves,
      // and a value that moves inside a cached block throws the cache away.
      ...(opts?.quotes === false ? [] : [`  quote: ${quoteSentence(s)}`]),
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
    // A live price is a number Kai was GIVEN, so it is his to quote. Only the
    // money fields — a timestamp's digits are not a price and have no business
    // in the list of numbers he is allowed to say out loud.
    if (s.live_quote) {
      pushAll(s.live_quote.price);
      pushAll(s.live_quote.prev_close);
      pushAll(s.live_quote.change);
      pushAll(s.live_quote.change_pct);
    }
    pushAll(s.catalyst);
    pushAll(s.thesis_plain);
    pushAll(s.thesis_technical);
    pushAll(s.score_components);
  }
  if (ctx.risk) pushAll(ctx.risk);
  // The balance and what it allows are numbers he was GIVEN, so they are as
  // quotable as any level — a size he is now expected to state must not then be
  // rejected by the validator as a number nobody gave him.
  if (ctx.account) pushAll(ctx.account);
  return out;
}
