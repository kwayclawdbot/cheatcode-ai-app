/**
 * THE FIVE PANELS — quote card, earnings, options, watchlist, portfolio.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE WAR ROOM'S PANELS, TRANSLATED FOR ONE PHONE SCREEN
 * ═════════════════════════════════════════════════════════════════════════════
 * The desktop War Room (`kai-warroom/src/components/panel/*`) drew these as
 * tiles in a grid of eight stats and a two-sided chain table. On 390 points the
 * workspace owns roughly 300 of height, so each panel keeps the INTENT and drops
 * the grid: the one number the question was about is large, the supporting
 * facts are a two-column ledger under it, and anything longer scrolls inside
 * the panel rather than pushing the conversation off the screen.
 *
 * Identity, not chrome: these are prices, tickers, positions — so they are
 * hand-rolled on `src/ui/*` and `tokens.ts`. The ticker always carries its
 * mark (`Ticker`), every market number goes through the mono face, and colour
 * is used only where the palette grammar allows it: green/red for money that
 * moved, volt where the member acts (the chips they tap).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NO PLACEHOLDERS, AND NULL IS NEVER ZERO
 * ═════════════════════════════════════════════════════════════════════════════
 * Loading says it is loading. A failure prints the server's own sentence. An
 * empty list says it is empty. A number the data plan cannot supply is drawn as
 * the words "not known", beside the sentence that says why. Where a number
 * came from and how fresh it is (an estimated report date, option quotes from
 * a finished session) is said on the panel, not in a footnote elsewhere.
 * Options and the earnings date come from Unusual Whales; stock data from
 * Polygon — the server decides, these only draw it.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type {
  EarningsPanelResponse,
  KaiWorkspaceAction,
  OptionQuote,
  OptionsChainResponse,
  OptionsFlowPrint,
  QuoteCardResponse,
  WatchlistResponse,
} from '@cheatcode/shared';
import { T, Eyebrow, Num } from '../../../ui/Text';
import { Ticker } from '../../../ui/Ticker';
import { PriceRow, Price } from '../../../ui/Price';
import { DataRow } from '../../../ui/DataRow';
import { alpha, color, radius } from '../../../ui/tokens';
import type { Quote } from '../../../lib/types';
import type { PositionsPayload } from '../../positions/types';
import { workspace } from '../store';
import {
  loadEarnings, loadOptionsChain, loadPortfolio, loadQuoteCard, loadWatchlist,
} from '../panels-data';
import {
  bidAsk, bigMoney, compact, etStampOf, rangePosition, shortDate, strikeLabel, usd,
} from '../panels-read';

/* ==================================================================== */
/* Shared states                                                        */
/* ==================================================================== */

/**
 * Loading and failed are separate states, and a failure carries the SERVER'S
 * sentence when there is one — "I could not get a price for ZZZZ" says more
 * than any copy this file could write.
 */
type Load<T> = { value: T | null; loading: boolean; failed: string | null };

function useLoad<T>(run: () => Promise<T>, deps: unknown[], fallback: string): Load<T> {
  const [state, setState] = useState<Load<T>>({ value: null, loading: true, failed: null });
  useEffect(() => {
    let alive = true;
    setState({ value: null, loading: true, failed: null });
    run()
      .then((v) => { if (alive) setState({ value: v, loading: false, failed: null }); })
      .catch((e: unknown) => {
        const said = e instanceof Error && e.message && !/^(TypeError|Failed to fetch)/.test(e.message) ? e.message : null;
        if (alive) setState({ value: null, loading: false, failed: said ?? fallback });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function Status({ text, testID }: { text: string; testID?: string }) {
  return (
    <View style={{ padding: 18 }} testID={testID}>
      <T variant="body" c={color.dim} lh={20}>{text}</T>
    </View>
  );
}

/** One quiet line saying what the panel cannot show, drawn as part of the panel. */
function Caveat({ text, testID }: { text: string; testID?: string }) {
  return (
    <View
      testID={testID}
      style={{
        borderLeftWidth: 2, borderLeftColor: alpha.ivory20,
        paddingLeft: 10, paddingVertical: 2,
      }}
    >
      <T variant="meta" c={color.muted} lh={17}>{text}</T>
    </View>
  );
}

/** Two facts side by side. `null` renders as "not known", never as zero. */
function Stat({ label, value, testID }: { label: string; value: string | null; testID?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: 7 }} testID={testID}>
      <T variant="meta" c={color.dim}>{label}</T>
      {value === null
        ? <T variant="meta" c={color.dim}>not known</T>
        : <Num variant="body" weight="semibold">{value}</Num>}
    </View>
  );
}

function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, borderBottomWidth: 0.5, borderBottomColor: alpha.ivory08 }}>
      {children}
    </View>
  );
}

/**
 * THE MEMBER'S OWN MOVES BETWEEN PANELS. Volt, because they are the one
 * acting; each opens a surface in place — nothing here navigates.
 */
function Jump({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
      hitSlop={6}
      style={({ pressed }) => ({
        paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.lg,
        borderWidth: 0.5, borderColor: alpha.volt50, backgroundColor: alpha.volt08,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <T variant="meta" weight="semibold" c={color.volt}>{label}</T>
    </Pressable>
  );
}

const open = (a: KaiWorkspaceAction) => { workspace.apply(a); };

function Jumps({ symbol, except }: { symbol: string; except: 'quote' | 'earnings' | 'options' }) {
  const items: { key: string; label: string; action: KaiWorkspaceAction }[] = [
    { key: 'chart', label: 'Chart', action: { type: 'open_chart', symbol, timeframe: null, setup_id: null } },
    { key: 'quote', label: 'Quote', action: { type: 'show_quote', symbol } },
    { key: 'earnings', label: 'Earnings', action: { type: 'show_earnings', symbol } },
    { key: 'options', label: 'Options', action: { type: 'show_options', symbol } },
    { key: 'news', label: 'News', action: { type: 'show_news', symbol } },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.filter((i) => i.key !== except).map((i) => (
        <Jump key={i.key} label={i.label} onPress={() => open(i.action)} testID={`panel-jump-${i.key}`} />
      ))}
    </View>
  );
}

const toQuote = (q: QuoteCardResponse['quote']): Quote => ({
  symbol: q.symbol, price: q.price, change: q.change, change_pct: q.change_pct,
  source_ts: q.source_ts, received_ts: q.received_ts, freshness: q.freshness, delay_reason: q.delay_reason ?? null,
});

/* ==================================================================== */
/* Quote card                                                           */
/* ==================================================================== */

/** Where price sits between the day's low and high. Drawn only when both are known. */
function RangeBar({ low, high, price, label }: { low: number | null; high: number | null; price: number | null; label: string }) {
  const at = rangePosition(low, high, price);
  return (
    <View style={{ gap: 6 }} testID="quote-range">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T variant="meta" c={color.dim}>{`Day range · ${label}`}</T>
      </View>
      {at === null ? (
        <T variant="meta" c={color.dim}>The range is not known yet.</T>
      ) : (
        <>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: alpha.ivory12 }}>
            <View
              style={{
                position: 'absolute', left: `${at * 100}%`, top: -4, width: 2, height: 12,
                marginLeft: -1, backgroundColor: color.text, borderRadius: 1,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Num variant="meta" weight="regular" c={color.muted}>{usd(low)}</Num>
            <Num variant="meta" weight="regular" c={color.muted}>{usd(high)}</Num>
          </View>
        </>
      )}
    </View>
  );
}

export function QuoteSurface({ symbol }: { symbol: string }) {
  const s = useLoad<QuoteCardResponse>(() => loadQuoteCard(symbol), [symbol], `I could not load the price card for ${symbol} just now.`);
  if (s.loading) return <Status text={`Loading the price card for ${symbol}…`} testID="panel-loading" />;
  if (s.failed || !s.value) return <Status text={s.failed ?? `No price came back for ${symbol}.`} testID="panel-failed" />;
  const d = s.value;
  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 6, gap: 10 }} testID="panel-quote">
      <Ticker symbol={d.symbol} size={30} sub={d.name ?? undefined} />
      <PriceRow quote={toQuote(d.quote)} size={27} />
      <RangeBar low={d.day.low} high={d.day.high} price={d.quote.price} label={d.day.basis_plain} />
      <View>
        <StatRow>
          <Stat label="Open" value={usd(d.day.open)} />
          <Stat label="Previous close" value={usd(d.quote.prev_close)} />
        </StatRow>
        <StatRow>
          <Stat label="Volume" value={compact(d.day.volume)} testID="quote-volume" />
          <Stat label="Average price (VWAP)" value={usd(d.day.vwap)} />
        </StatRow>
      </View>
      {d.degraded && d.degraded_reason ? <Caveat text={d.degraded_reason} /> : null}
      <Jumps symbol={d.symbol} except="quote" />
    </ScrollView>
  );
}

/* ==================================================================== */
/* Earnings                                                             */
/* ==================================================================== */

export function EarningsSurface({ symbol }: { symbol: string }) {
  const s = useLoad<EarningsPanelResponse>(() => loadEarnings(symbol), [symbol], `I could not load the earnings record for ${symbol} just now.`);
  if (s.loading) return <Status text={`Loading ${symbol}'s earnings…`} testID="panel-loading" />;
  if (s.failed || !s.value) return <Status text={s.failed ?? `No earnings record came back for ${symbol}.`} testID="panel-failed" />;
  const d = s.value;
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} testID="panel-earnings">
      <Ticker symbol={d.symbol} size={30} sub={d.name ? `${d.name} · Earnings` : 'Earnings'} />

      <View style={{ gap: 4 }} testID="earnings-next">
        <Eyebrow>Next report</Eyebrow>
        {d.next ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <T variant="sectionTitle" weight="bold">{shortDate(d.next.date) ?? d.next.date}</T>
              {d.next.days_away !== null ? (
                <T variant="meta" c={color.muted}>
                  {d.next.days_away === 0 ? 'today' : d.next.days_away === 1 ? 'tomorrow' : `in ${d.next.days_away} days`}
                </T>
              ) : null}
            </View>
            <T variant="meta" c={color.dim} lh={17}>{d.next.source_plain}</T>
          </>
        ) : (
          <T variant="meta" c={color.muted} lh={19} testID="earnings-next-unknown">{d.next_plain}</T>
        )}
      </View>

      {d.quarters.length ? (
        <View testID="earnings-quarters">
          <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: alpha.ivory12 }}>
            <T variant="meta" c={color.dim} style={{ flex: 1.1 }}>Quarter</T>
            <T variant="meta" c={color.dim} style={{ flex: 1 }}>Filed</T>
            <T variant="meta" c={color.dim} style={{ flex: 0.9 }} align="right">EPS</T>
            <T variant="meta" c={color.dim} style={{ flex: 1 }} align="right">Revenue</T>
          </View>
          {d.quarters.map((q) => (
            <View
              key={`${q.fiscal_year}-${q.fiscal_period}-${q.period_end}`}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: alpha.ivory08 }}
            >
              <T variant="meta" weight="semibold" style={{ flex: 1.1 }}>{`${q.fiscal_period} ${q.fiscal_year}`.trim() || '—'}</T>
              <T variant="meta" c={color.muted} style={{ flex: 1 }}>{shortDate(q.filed) ?? 'not known'}</T>
              <View style={{ flex: 0.9, alignItems: 'flex-end' }}>
                {q.eps_diluted === null
                  ? <T variant="meta" c={color.dim}>not known</T>
                  : <Num variant="meta">{`$${q.eps_diluted.toFixed(2)}`}</Num>}
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                {q.revenue === null
                  ? <T variant="meta" c={color.dim}>not known</T>
                  : <Num variant="meta">{bigMoney(q.revenue)}</Num>}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <T variant="meta" c={color.dim}>{d.degraded_reason ?? 'No reported quarters are on file.'}</T>
      )}

      <Caveat text={d.estimates_plain} testID="earnings-no-estimates" />
      <Jumps symbol={d.symbol} except="earnings" />
    </ScrollView>
  );
}

/* ==================================================================== */
/* Options                                                              */
/* ==================================================================== */

/**
 * One side of one strike: its bid / ask, and under it the volume traded — or,
 * when the options-flow engine recorded this exact contract, that it did.
 */
function Side({ q, flow, align }: { q: OptionQuote | null; flow: OptionsFlowPrint | null; align: 'flex-start' | 'flex-end' }) {
  if (!q) {
    return (
      <View style={{ flex: 1, alignItems: align }}>
        <T variant="meta" c={color.dim}>not listed</T>
      </View>
    );
  }
  const quote = bidAsk(q);
  return (
    <View style={{ flex: 1, alignItems: align }} testID={flow ? 'options-flow-cell' : 'options-quote-cell'}>
      {quote ? <Num variant="meta" c={color.text}>{quote}</Num> : <T variant="meta" c={color.dim}>no quote</T>}
      <T variant="meta" c={flow ? color.muted : color.dim} numberOfLines={1}>
        {flow ? 'flow bought this' : q.volume !== null && q.volume > 0 ? `${compact(q.volume)} traded` : 'no trades yet'}
      </T>
    </View>
  );
}

export function OptionsSurface({ symbol }: { symbol: string }) {
  const s = useLoad<OptionsChainResponse>(() => loadOptionsChain(symbol), [symbol], `I could not load the options on ${symbol} just now.`);
  if (s.loading) return <Status text={`Loading the options on ${symbol}…`} testID="panel-loading" />;
  if (s.failed || !s.value) return <Status text={s.failed ?? `No options came back for ${symbol}.`} testID="panel-failed" />;
  const d = s.value;
  const later = d.expiries.filter((e) => e !== d.expiry).map((e) => shortDate(e)).filter(Boolean);
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} testID="panel-options">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Ticker symbol={d.symbol} size={30} sub={d.expiry ? `Options · expiring ${shortDate(d.expiry)}` : 'Options'} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Num variant="body">{usd(d.spot) ?? 'not known'}</Num>
          <T variant="meta" c={color.dim} numberOfLines={1}>{d.spot_plain}</T>
        </View>
      </View>

      {/* The short form sits where the eye lands first; the full sentence is
          under the ladder, still on the panel, for anyone who wants the why. */}
      <T variant="meta" c={color.muted}>
        {d.prices_as_of ? `Bid / ask per contract · as of ${etStampOf(d.prices_as_of) ?? 'an unknown time'}` : 'Bid / ask per contract'}
      </T>

      {d.rows.length ? (
        <View testID="options-ladder">
          <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: alpha.ivory12 }}>
            <T variant="meta" c={color.dim} style={{ flex: 1 }}>Calls</T>
            <T variant="meta" c={color.dim} style={{ width: 76 }} align="center">Strike</T>
            <T variant="meta" c={color.dim} style={{ flex: 1 }} align="right">Puts</T>
          </View>
          {d.rows.map((row) => (
            <View
              key={row.strike}
              testID={row.nearest_the_money ? 'options-row-nearest' : undefined}
              style={{
                flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4,
                borderBottomWidth: 0.5, borderBottomColor: alpha.ivory08,
                backgroundColor: row.nearest_the_money ? alpha.ivory07 : 'transparent',
                borderRadius: row.nearest_the_money ? radius.sm : 0,
              }}
            >
              <Side q={row.call} flow={row.call_flow} align="flex-start" />
              <View style={{ width: 76, alignItems: 'center' }}>
                <Num variant="meta" weight={row.nearest_the_money ? 'bold' : 'semibold'}>{strikeLabel(row.strike)}</Num>
                {row.nearest_the_money ? <T variant="meta" c={color.muted}>nearest price</T> : null}
              </View>
              <Side q={row.put} flow={row.put_flow} align="flex-end" />
            </View>
          ))}
        </View>
      ) : (
        <T variant="meta" c={color.dim}>{d.degraded_reason ?? 'No contracts came back.'}</T>
      )}

      {d.flow.length ? (
        <View testID="options-flow">
          <Eyebrow>What the options flow bought</Eyebrow>
          {d.flow.map((f, i) => (
            <DataRow
              key={f.option_symbol}
              last={i === d.flow.length - 1}
              label={`${f.type === 'call' ? 'Call' : 'Put'} ${strikeLabel(f.strike)} · ${shortDate(f.expiry)}`}
              sub={`${f.label} · recorded ${etStampOf(f.recorded_at) ?? 'at an unknown time'}`}
              meta={[
                f.volume !== null ? `${compact(f.volume)} traded` : null,
                f.open_interest !== null ? `${compact(f.open_interest)} open` : null,
              ].filter(Boolean).join(' · ') || undefined}
              value={`${usd(f.bid) ?? '?'} / ${usd(f.ask) ?? '?'}`}
            />
          ))}
        </View>
      ) : null}

      <Caveat text={d.prices_plain} testID="options-prices-source" />
      {later.length ? <T variant="meta" c={color.dim}>{`Also listed: ${later.join(', ')}.`}</T> : null}
      <Jumps symbol={d.symbol} except="options" />
    </ScrollView>
  );
}

/* ==================================================================== */
/* Watchlist                                                            */
/* ==================================================================== */

export function WatchlistSurface() {
  const s = useLoad<WatchlistResponse>(() => loadWatchlist(), [], 'I could not load your watchlist just now.');
  if (s.loading) return <Status text="Loading your watchlist…" testID="panel-loading" />;
  if (s.failed || !s.value) return <Status text={s.failed ?? 'Your watchlist did not answer.'} testID="panel-failed" />;
  const d = s.value;
  if (!d.items.length) return <Status text={d.degraded_reason ?? d.empty_copy} testID="panel-empty" />;
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 6 }} testID="panel-watchlist">
      <Eyebrow>{`${d.name.toUpperCase()} · ${d.items.length}`}</Eyebrow>
      {d.degraded && d.degraded_reason ? <Caveat text={d.degraded_reason} /> : null}
      {d.items.map((it, i) => (
        <DataRow
          key={it.symbol}
          last={i === d.items.length - 1}
          testID={`watchlist-row-${it.symbol}`}
          onPress={() => open({ type: 'show_quote', symbol: it.symbol })}
          accessibilityLabel={`${it.symbol}. Open its price card.`}
          label={<Ticker symbol={it.symbol} size={26} sub={[it.name, it.grade_display ? `Graded ${it.grade_display}` : null].filter(Boolean).join(' · ') || undefined} />}
          valueNode={<Price quote={it.quote ? toQuote(it.quote) : null} showChange size={13} prefix="$" />}
        />
      ))}
      <T variant="meta" c={color.dim}>Tap one to open its price card here.</T>
    </ScrollView>
  );
}

/* ==================================================================== */
/* Portfolio                                                            */
/* ==================================================================== */

const signedUsd = (n: number | null): string | null =>
  n === null ? null : `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;

export function PortfolioSurface({ onRoute }: { onRoute?: (r: string) => void }) {
  const s = useLoad<PositionsPayload>(() => loadPortfolio(), [], 'I could not load your positions just now.');
  if (s.loading) return <Status text="Loading your positions…" testID="panel-loading" />;
  if (s.failed || !s.value) return <Status text={s.failed ?? 'Your positions did not answer.'} testID="panel-failed" />;
  const d = s.value;
  const open = d.positions.filter((p) => p.status === 'open');
  if (!open.length) return <Status text={d.empty_copy} testID="panel-empty" />;
  const today = d.today_pnl;
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }} testID="panel-portfolio">
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Eyebrow>{`PAPER POSITIONS · ${open.length}`}</Eyebrow>
          <T variant="meta" c={color.dim}>Practice money — nothing real moved.</T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 1 }}>
          <T variant="meta" c={color.dim}>Today</T>
          {today === null
            ? <T variant="meta" c={color.dim}>not known</T>
            : <Num variant="body" weight="bold" c={today >= 0 ? color.green : color.red}>{signedUsd(today)}</Num>}
        </View>
      </View>
      {open.map((p, i) => {
        const pnl = p.unrealized_pnl;
        return (
          <DataRow
            key={p.id}
            last={i === open.length - 1}
            testID={`portfolio-row-${p.symbol}`}
            onPress={onRoute ? () => onRoute(`/position/${encodeURIComponent(p.id)}`) : undefined}
            label={
              <Ticker
                symbol={p.symbol}
                size={26}
                sub={[
                  p.side === 'long' ? 'Long' : 'Short',
                  p.qty !== null ? `${p.qty} sh` : null,
                  p.avg_entry !== null ? `at ${usd(p.avg_entry)}` : null,
                  p.simulated ? 'simulated' : null,
                ].filter(Boolean).join(' · ')}
              />
            }
            meta={p.health_label || undefined}
            valueNode={
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                {pnl === null
                  ? <T variant="meta" c={color.dim}>not known</T>
                  : <Num variant="meta" c={pnl >= 0 ? color.green : color.red}>{signedUsd(pnl)}</Num>}
                {p.unrealized_pnl_pct !== null
                  ? <Num variant="meta" weight="regular" c={color.muted}>{`${p.unrealized_pnl_pct >= 0 ? '+' : '−'}${Math.abs(p.unrealized_pnl_pct).toFixed(2)}%`}</Num>
                  : null}
              </View>
            }
          />
        );
      })}
    </ScrollView>
  );
}
