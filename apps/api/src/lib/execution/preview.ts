/**
 * The preview pipeline (03 Unit 4, adapted for a delayed-only data plan).
 *
 * Order of gates, and why each one is where it is:
 *   1. instrument      — we only quote what we follow.
 *   2. freshness       — `stale` stops everything (`FRESHNESS_STALE`). `delayed`
 *                        does NOT: on this Polygon plan delayed IS the truth, so
 *                        the preview proceeds and the label says so. Blocking on
 *                        `delayed` would disable the product permanently.
 *   3. entitlement     — paper is included on free. There is nothing to sell
 *                        here, so this check passes and says so out loud.
 *   4. capability      — equities and ETFs only; options are v1.1
 *                        (`CAPABILITY_UNSUPPORTED` with the alternatives).
 *   5. risk            — daily loss cap · buying power · max position % · max
 *                        open positions · reward:risk · sector · missing stop.
 *   6. estimate        — fill, cost, fees ($0 on paper), buying power after.
 *   7. persist         — the preview lands ON the order row (`status='previewed'`,
 *                        `preview` jsonb) so submit can verify it later, and so
 *                        an abandoned preview is a real auditable row rather than
 *                        a number that only ever existed in a client's memory.
 *
 * Nothing in here places anything. The last line of the payload is the promise:
 * "Nothing is sent until you confirm."
 */
import type {
  AppMode,
  OrderPreviewResponse,
  OrderType,
  PositionEffect,
  RiskCheck,
  SetupTarget,
} from '@shared/api';
import {
  PAPER_FILL_PLAIN,
  PLACE_ORDER_LABEL,
  STOP_ALERT_ASSISTED_PLAIN,
  STOP_ATTACHES_PLAIN,
} from '@shared/api';
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { marketStatus } from '../market';
import { etStamp, getQuote } from '../market/polygon';
import { loadRiskPolicy, normalizeTargets, type RiskPolicyRow } from '../kai/context';
import { DISCLOSURES } from '../kai/objects';
import {
  SIDE_LABEL,
  directionFor,
  evaluateFill,
  isBuySide,
  opensPosition,
  previewTtlFor,
  round2,
  toleranceBpsFor,
} from './paper';
import { loadPaperAccount, type PaperAccount } from './engine';
import {
  advisory,
  blocker,
  dailyRisk,
  missingStopCheck,
  okCheck,
  rewardRiskCheck,
  sectorCheck,
  unknownCheck,
  type DailyRiskDetail,
} from './risk';

export type PreviewInput = {
  userId: string;
  requestId: string;
  accountId?: string;
  symbol: string;
  side: PositionEffect;
  type: OrderType;
  qty?: number;
  notional?: number;
  limitPrice?: number | null;
  stopPrice?: number | null;
  duration: string;
  planId?: string;
  setupId?: string;
  mode: AppMode;
  forceStale?: boolean;
  /** Set by POST /positions/:id/close so the preview knows the exit levels. */
  overrideStop?: number | null;
  overrideTarget?: number | null;
  exitStyle?: 'auto' | 'alert_assisted';
};

const FEES = 0;

export async function buildPreview(input: PreviewInput): Promise<OrderPreviewResponse> {
  const db = serviceClient();
  const symbol = input.symbol.toUpperCase();

  // 1. instrument -------------------------------------------------------
  const instrument = await db.from('instruments').select('symbol,kind,meta').eq('symbol', symbol).maybeSingle();
  const inst = instrument.data as Record<string, unknown> | null;
  if (!inst) {
    throw new ApiError('NOT_FOUND', `I do not follow ${symbol} yet, so I cannot prepare an order on it.`);
  }
  if (String(inst.kind) === 'option') {
    throw new ApiError(
      'CAPABILITY_UNSUPPORTED',
      'Options are not part of this release. Shares of the same company are available.',
      { detail: { alternatives: ['equity'] } }
    );
  }

  // 2. freshness --------------------------------------------------------
  const quote = input.forceStale
    ? {
        ...(await getQuote(symbol)),
        freshness: 'stale' as const,
        delay_reason: 'feed_gap' as const,
        label_plain: 'Data unavailable — the price feed stopped answering.',
      }
    : await getQuote(symbol);

  if (quote.freshness === 'stale' || quote.price === null) {
    throw new ApiError(
      'FRESHNESS_STALE',
      `I do not have a current price for ${symbol}, so I will not prepare an order on it. Nothing was sent.`,
      { detail: { symbol, freshness: quote.freshness, source_ts: quote.source_ts } }
    );
  }

  const last = quote.price;

  // 3/4. entitlement + capability ---------------------------------------
  const entitlementCheck = okCheck(
    'entitlement',
    'Your plan',
    'Paper trading is included on every plan. There is nothing to buy to place this.'
  );

  // levels from the plan or the setup ------------------------------------
  const levels = await resolveLevels(input, symbol);
  const rawStop = input.overrideStop !== undefined ? input.overrideStop : levels.stop;
  const targets = input.overrideTarget !== undefined && input.overrideTarget !== null
    ? [{ price: input.overrideTarget }]
    : levels.targets;
  const firstTarget = targets[0]?.price ?? null;

  // account --------------------------------------------------------------
  const account = await loadPaperAccount(input.userId, input.accountId);
  if (!account) {
    throw new ApiError('STATE_CONFLICT', 'Your practice account is not set up yet, so there is nothing to trade with.');
  }

  const policy = await loadRiskPolicy(input.userId);
  const risk = await dailyRisk(input.userId, policy?.daily_loss_cap_usd ?? null);

  // qty ------------------------------------------------------------------
  const qty = resolveQty(input, last);
  if (qty < 1) {
    throw new ApiError('VALIDATION_FAILED', 'Tell me how many shares — or how many dollars — you want to put in.');
  }

  // 6. estimate ----------------------------------------------------------
  const decision0 = evaluateFill({
    side: input.side,
    type: input.type,
    qty,
    last,
    limitPrice: input.limitPrice ?? null,
    stopPrice: input.stopPrice ?? null,
  });
  const estPrice0 = decision0.price ?? input.limitPrice ?? last;

  /**
   * A stop has to be on the losing side of the entry. A setup's stop is written
   * for the setup's OWN entry, so an order priced somewhere else — a limit far
   * below, a market fill well above the trigger — can inherit a stop that sits
   * on the wrong side of it. Computing "risk" from that produces a number that
   * is not risk at all (a long with a stop ABOVE the fill), and it was blocking
   * legitimate orders on a daily cap it had no business consuming.
   *
   * So an incoherent stop is DROPPED, and the order is treated as having none —
   * which raises the missing-stop advisory. That is the honest reading: there
   * is no level here that has been decided as "I was wrong".
   */
  const stopCoherent =
    rawStop === null
      ? true
      : isBuySide(input.side)
        ? rawStop < estPrice0
        : rawStop > estPrice0;
  const stop = stopCoherent ? rawStop : null;
  const droppedStop = rawStop !== null && !stopCoherent ? rawStop : null;

  const decision = decision0;
  const estPrice = estPrice0;
  const notional = round2(qty * estPrice);
  const cashOut = isBuySide(input.side) ? notional : 0;
  const buyingPowerAfter = round2(account.buying_power - cashOut);

  const perShareRisk = stop === null ? null : round2(Math.abs(estPrice - stop));
  const maxLoss = perShareRisk === null ? null : round2(perShareRisk * qty);
  const rr =
    perShareRisk && firstTarget !== null ? round2(Math.abs(firstTarget - estPrice) / perShareRisk) : null;

  // 5. risk checks -------------------------------------------------------
  const checks: RiskCheck[] = [
    okCheck(
      'freshness',
      'Price freshness',
      `${quote.label_plain}. ${PAPER_FILL_PLAIN}`
    ),
    entitlementCheck,
  ];

  // daily loss cap — a spent cap in day mode is a hard stop, by the user's rule
  if (opensPosition(input.side)) {
    if (risk.cap === null) {
      checks.push(
        unknownCheck('daily_cap', 'Daily loss limit', 'You have no daily loss limit set, so there is nothing for me to hold you to.')
      );
    } else if (risk.remaining !== null && risk.remaining <= 0) {
      checks.push(
        blocker(
          'daily_cap',
          'Daily loss limit',
          `Your $${risk.cap} limit for today is fully committed. This is the rule you set — I am not going to help you around it. Tomorrow it resets.`,
          'RISK_LIMIT_DAILY_LOSS'
        )
      );
    } else if (maxLoss !== null && risk.remaining !== null && maxLoss > risk.remaining) {
      checks.push(
        blocker(
          'daily_cap',
          'Daily loss limit',
          `This order risks $${maxLoss} and you have $${risk.remaining} left of your $${risk.cap} daily limit. Size it smaller, or leave it.`,
          'RISK_LIMIT_DAILY_LOSS'
        )
      );
    } else {
      checks.push(
        okCheck(
          'daily_cap',
          'Daily loss limit',
          `${maxLoss === null ? 'This order' : `Risking $${maxLoss}`} against $${risk.remaining} left of your $${risk.cap} daily limit.`
        )
      );
    }

    // buying power
    if (isBuySide(input.side) && notional > account.buying_power) {
      checks.push(
        blocker(
          'buying_power',
          'Buying power',
          `This costs about $${notional} and you have $${round2(account.buying_power)} available. Nothing was sent.`,
          'RISK_LIMIT_POSITION_SIZE'
        )
      );
    } else {
      checks.push(
        okCheck('buying_power', 'Buying power', `About $${notional} of your $${round2(account.buying_power)}.`)
      );
    }

    // max position %
    const maxPct = policy?.max_position_pct ?? null;
    if (maxPct !== null && account.equity > 0) {
      const pct = round2((notional / account.equity) * 100);
      if (pct > maxPct) {
        checks.push(
          blocker(
            'position_size',
            'Position size',
            `This is ${pct}% of your account and your own limit is ${maxPct}%. Fewer shares would fit.`,
            'RISK_LIMIT_POSITION_SIZE'
          )
        );
      } else {
        checks.push(okCheck('position_size', 'Position size', `${pct}% of your account, inside your ${maxPct}% limit.`));
      }
    }

    // max open positions
    const maxOpen = policy?.max_open_positions ?? null;
    if (maxOpen !== null) {
      const { count } = await db
        .from('positions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', input.userId)
        .is('closed_at', null);
      const open = count ?? 0;
      if (open >= maxOpen) {
        checks.push(
          blocker(
            'open_positions',
            'How many trades at once',
            `You already have ${open} positions open and your limit is ${maxOpen}. Close one before you open another.`,
            'RISK_LIMIT_CONCENTRATION'
          )
        );
      } else {
        checks.push(
          okCheck('open_positions', 'How many trades at once', `${open} of ${maxOpen} positions open.`)
        );
      }
    }

    checks.push(missingStopCheck(stop));
    if (droppedStop !== null) {
      checks.push(
        advisory(
          'stop_orientation',
          'The exit level does not fit this order',
          `The plan's exit sits at $${droppedStop}, which is on the wrong side of a fill near $${estPrice} for this direction. I am not going to call that a stop, so this order has no defined exit.`
        )
      );
    }
    if (firstTarget !== null) {
      const targetBehind = isBuySide(input.side) ? firstTarget <= estPrice : firstTarget >= estPrice;
      if (targetBehind) {
        checks.push(
          advisory(
            'target_passed',
            'The target is already behind this price',
            `The target on this idea is $${firstTarget} and you would be filled near $${estPrice}. The move you were waiting for has already happened — if you take this, the exit fires almost immediately and you are buying the top of someone else's trade.`
          )
        );
      }
    }
    checks.push(rewardRiskCheck(rr, maxLoss, policy));
    checks.push(await buildSectorCheck(input.userId, symbol, inst, notional, account, policy));
  } else {
    checks.push(
      okCheck('closing', 'What this does', 'This closes an existing position. It takes risk off, it does not add any.')
    );
    checks.push(missingStopCheck(stop));
  }

  if (marketStatus() !== 'open') {
    checks.push(
      advisory(
        'market_closed',
        'The market is closed',
        'The market is closed, so this fills against the last delayed print rather than a live one. In a real account it would queue for the open and could gap.',
        'MARKET_CLOSED'
      )
    );
  }

  if (input.side === 'sell_short') {
    checks.push(
      advisory(
        'short_locate',
        'Shorting is simulated',
        'Practice shorting always finds shares. Real shorting does not — sometimes there is nothing to borrow, and sometimes it is expensive.'
      )
    );
  }

  const advisories = checks.filter((c) => c.status === 'advisory');
  const blockers = checks.filter((c) => c.status === 'blocker');

  // 7. persist -----------------------------------------------------------
  const ttl = previewTtlFor(input.mode);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
  const toleranceBps = toleranceBpsFor(input.mode);

  const exitStyle = input.exitStyle ?? levels.exitStyle;
  const bracket = opensPosition(input.side) && (stop !== null || targets.length)
    ? {
        exit_style: exitStyle,
        stop,
        targets,
        plain: exitStyle === 'auto' ? STOP_ATTACHES_PLAIN : STOP_ALERT_ASSISTED_PLAIN,
      }
    : null;

  const previewPayload = {
    version: 3,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    tolerance_bps: toleranceBps,
    mode: input.mode,
    quote_price: last,
    quote_source_ts: quote.source_ts,
    quote_freshness: quote.freshness,
    est_fill_price: estPrice,
    fills_immediately: decision.fills,
    notional,
    fees: FEES,
    qty,
    stop,
    targets,
    first_target: firstTarget,
    per_share_risk: perShareRisk,
    max_loss_usd: maxLoss,
    rr,
    exit_style: exitStyle,
    setup_id: input.setupId ?? levels.setupId ?? null,
    blockers: blockers.map((b) => ({ code: b.code, key: b.key, plain: b.plain })),
    advisories: advisories.map((a) => ({ code: a.code, key: a.key, plain: a.plain })),
    checks,
  };

  const orderRow = await db
    .from('orders')
    .insert({
      user_id: input.userId,
      account_id: account.id,
      plan_id: input.planId ?? levels.planId ?? null,
      symbol,
      side: input.side,
      type: input.type,
      qty,
      limit_price: input.limitPrice ?? null,
      stop_price: input.stopPrice ?? null,
      duration: input.duration,
      status: 'previewed',
      idempotency_key: `preview-${input.userId}-${symbol}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      driver: 'paper',
      preview: previewPayload as never,
    })
    .select('id')
    .single();

  if (orderRow.error || !orderRow.data) {
    throw new ApiError('INTERNAL', 'We could not prepare that order. Nothing was sent.', {
      detail: orderRow.error?.message,
    });
  }
  const orderId = String((orderRow.data as Record<string, unknown>).id);

  await db.from('order_events').insert({
    order_id: orderId,
    from_status: 'draft',
    to_status: 'previewed',
    payload: { plain: 'Order prepared for review. Nothing is sent until you confirm.' } as never,
    created_at: now.toISOString(),
  });

  return {
    preview_id: orderId,
    order_id: orderId,
    account_id: account.id,
    plan_id: input.planId ?? levels.planId ?? null,
    symbol,
    side: input.side,
    side_label: SIDE_LABEL[input.side],
    type: input.type,
    qty,
    limit_price: input.limitPrice ?? null,
    stop_price: input.stopPrice ?? null,
    duration: input.duration,
    mode: input.mode,
    quote,
    estimate: {
      fill_price: decision.fills ? decision.price : null,
      fills_immediately: decision.fills,
      notional,
      fees: FEES,
      total: round2(notional + FEES),
      buying_power: round2(account.buying_power),
      buying_power_after: buyingPowerAfter,
      plain: decision.fills
        ? `${decision.plain} ${PAPER_FILL_PLAIN}`
        : `${decision.plain} ${PAPER_FILL_PLAIN}`,
    },
    risk: {
      stop,
      target: firstTarget,
      per_share_risk: perShareRisk,
      max_loss_usd: maxLoss,
      rr,
      daily_cap: risk.cap,
      daily_used: risk.used,
      daily_remaining: risk.remaining,
      hard_stop_plain:
        maxLoss === null
          ? 'There is no stop on this order, so I cannot tell you what being wrong costs. That is the problem with it.'
          : `You can lose up to $${maxLoss} on this order if the stop executes.`,
      plain: risk.plain,
    },
    checks,
    advisories,
    blockers,
    can_submit: blockers.length === 0,
    bracket,
    expires_at: expiresAt,
    expires_in_s: ttl,
    tolerance_bps: toleranceBps,
    disclosures: [DISCLOSURES.paperOnly, DISCLOSURES.education],
    confirm_label: PLACE_ORDER_LABEL,
    footer_plain: `Nothing is sent until you confirm · quote ${etStamp(quote.source_ts)} · ${quote.freshness}`,
    paper_plain: PAPER_FILL_PLAIN,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function resolveQty(input: PreviewInput, last: number): number {
  if (input.qty) return Math.floor(input.qty);
  if (input.notional) return Math.floor(input.notional / last);
  return 0;
}

type Levels = {
  stop: number | null;
  targets: SetupTarget[];
  planId: string | null;
  setupId: string | null;
  exitStyle: 'auto' | 'alert_assisted';
};

/** A plan's levels win; a setup's are the fallback; otherwise there are none. */
async function resolveLevels(input: PreviewInput, symbol: string): Promise<Levels> {
  const db = serviceClient();
  const empty: Levels = { stop: null, targets: [], planId: null, setupId: null, exitStyle: 'auto' };

  if (input.planId) {
    const { data } = await db
      .from('trade_plans')
      .select('id,setup_id,stop,targets,exit_style,symbol')
      .eq('id', input.planId)
      .eq('user_id', input.userId)
      .maybeSingle();
    const row = data as Record<string, unknown> | null;
    if (row) {
      return {
        stop: row.stop === null || row.stop === undefined ? null : Number(row.stop),
        targets: normalizeTargets(row.targets),
        planId: String(row.id),
        setupId: (row.setup_id as string) ?? null,
        exitStyle: String(row.exit_style ?? 'auto') === 'alert_assisted' ? 'alert_assisted' : 'auto',
      };
    }
  }

  const setupId = input.setupId ?? null;
  const q = db.from('setups').select('id,stop,targets,invalidation').eq('symbol', symbol);
  const { data } = setupId
    ? await q.eq('id', setupId).maybeSingle()
    : await q.in('state', ['watching', 'forming', 'ready']).order('score', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return empty;
  const invalidation = (row.invalidation as Record<string, unknown>) ?? {};
  const stop =
    row.stop === null || row.stop === undefined
      ? Number.isFinite(Number(invalidation.level))
        ? Number(invalidation.level)
        : null
      : Number(row.stop);
  return { stop, targets: normalizeTargets(row.targets), planId: null, setupId: String(row.id), exitStyle: 'auto' };
}

async function buildSectorCheck(
  userId: string,
  symbol: string,
  inst: Record<string, unknown>,
  notional: number,
  account: PaperAccount,
  policy: RiskPolicyRow | null
): Promise<RiskCheck> {
  const meta = (inst.meta as Record<string, unknown>) ?? {};
  const sector = typeof meta.sector === 'string' ? meta.sector : null;
  if (!sector) {
    return sectorCheck({ equity: account.equity, notional, sectorNotional: 0, sector: null }, policy);
  }

  const db = serviceClient();
  const [positions, instruments] = await Promise.all([
    db.from('positions').select('symbol,qty,avg_cost').eq('user_id', userId).is('closed_at', null),
    db.from('instruments').select('symbol,meta'),
  ]);
  const sectorOf = new Map<string, string | null>();
  for (const r of (instruments.data ?? []) as Record<string, unknown>[]) {
    const m = (r.meta as Record<string, unknown>) ?? {};
    sectorOf.set(String(r.symbol), typeof m.sector === 'string' ? m.sector : null);
  }
  let sectorNotional = 0;
  for (const p of (positions.data ?? []) as Record<string, unknown>[]) {
    if (String(p.symbol) === symbol || sectorOf.get(String(p.symbol)) === sector) {
      sectorNotional += Number(p.qty) * Number(p.avg_cost);
    }
  }
  return sectorCheck({ equity: account.equity, notional, sectorNotional, sector }, policy);
}

export type { DailyRiskDetail };
export { directionFor };
