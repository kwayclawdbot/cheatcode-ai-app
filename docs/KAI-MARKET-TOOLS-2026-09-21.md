# Kai's market tools — ported from the War Room (21 September 2026)

Seven read-only tools in `apps/api/src/lib/kai/tools-intel.ts`, registered in
`KAI_TOOLS` after the five market tools. None writes a row, arms anything or
grades anything.

## What replaces what

| New tool | War Room tool(s) | Source | Same behaviour? |
|---|---|---|---|
| `scan_movers` | `scan_breakouts` | Polygon full-market snapshot + news | Yes: same filters (2%, $5, 500k shares, up/down/both) and same ranking (move × shares). Differences: 12 rows not 15; warrants/rights/units dropped; newest headline on the top 5, fenced as untrusted. |
| `read_sectors` | `scan_sector`, `get_sector_analysis` | Polygon snapshot + grouped daily | `scan_sector` yes (same 15-name lists, minus delisted HES/IPG). `get_sector_analysis` read vault notes; this ranks the 11 funds live (today, 5 days, 1 month) instead. The vault notes stopped updating on 1 September. |
| `read_market_context` | `get_macro_snapshot`, `get_market_context` | Polygon snapshot + SPY daily bars | Macro yes, same symbols. There is no VIX: the plan refuses `I:VIX`, so VIXY stands in and is labelled as VIXY. Vault market notes are replaced by live breadth, sector rotation and a four-check regime read modelled on `breakout-alert-system/regime`. |
| `read_stock_today` | `get_today_thesis` (per symbol), `get_relative_strength` | Polygon snapshot, daily bars, reference; app `setups`; UW earnings | Relative strength yes (stock vs SPY vs sector fund, 1D/5D/1M/3M). The daily vault thesis is market-wide and weekly now, so this gives a per-symbol read instead: nearest levels from `computeKeyLevels`, the graded setup if one exists, and earnings within 14 days. |
| `read_options_flow` | `get_options_analysis`, `get_options_posture` | Unusual Whales `options-volume` + `flow-alerts`; app `setups` (UOA family) | Partly. Put/call and unusual trades yes. The chain itself (strikes, bid/ask, IV) is `read_options_chain`, also from Unusual Whales. Nothing is labelled bullish or bearish, because the engine measured that these numbers do not predict direction. |
| `read_earnings` | `get_earnings_calendar` | Unusual Whales `/api/earnings/{ticker}` | Yes, and the source is now UW instead of yfinance. Adds watchlist mode (`symbols: null`) and an `date_confirmed` flag. UW's estimated dates are marked as estimates. |
| `read_track_record` | `get_performance_stats`, `get_recent_alerts`, `get_alerts_for_ticker` | app `setups` (outcome + peak tracker columns) | Improved. War Room counted `sent_alerts` and called anything above +0.5% a win. This uses the engine's graded `win_5d` (right after five sessions, close to close), the engine's own family record, and the tracker's peak and how each call ended. |

Covered by tools that already exist, so there is no new tool: `get_ticker_snapshot` → `look_up_prices`,
`get_key_levels`/`get_intraday_levels` → `read_chart_levels`, `get_ticker_news`/`get_recent_news` →
`read_news`, `get_company_overview` → `look_up_company`, `get_user_watchlist`/`get_watchlist_intel` →
`read_watchlist` + `look_up_prices`.

Not ported: marketing, chart-driving and side-effect tools such as `send_email`, `update_user_prefs`, the
chart draw, scroll and panel verbs (the workspace owns these now), `semantic_recall`,
`search_past_conversations` and `compute_trade_setup`. That last one makes a plan, which Kai must never do.

## To go live

- Set **`UNUSUAL_WHALES_TOKEN`** on the API's Vercel project. Without it the options and earnings tools
  say "not connected" and the other tools still work.
- Nothing else. No migration. Polygon uses the existing key.

## Cost

- About 1,280 extra tokens of tool definitions (estimated from character count, because `count_tokens`
  is also blocked by the credit balance). They sit in the cached prefix, so after the first request they
  are billed as cache reads. The first request after deploy writes a new cache once.
- Upstream: one full-market snapshot (about 3 seconds) is shared by the scanner, the sector board and
  the market read. It is cached for 60 seconds while the market is open and 10 minutes when it is shut.
  A live smoke of all nine calls cost 12 Polygon requests and 4 Unusual Whales requests.

## Proof

```bash
cd apps/api && npx tsx scripts/kai-intel-tools-test.mts   # 109 assertions, recorded upstreams, no network
cd apps/api && npx tsx scripts/kai-intel-smoke.mts NVDA     # live; needs the keys in env
```

## Needs a live check (model credit exhausted)

The tools were proved without any model calls. Still unchecked: whether Kai picks the right tool, and
whether he repeats the `must_say` lines. Also unchecked: whether four tool turns are enough for a
question like "how's the market and what's moving".

## Flagged, not fixed (outside this lane)

`loadChartContext` loads daily candles only up to `lastTradingDate()`. During the session that date is
yesterday, so `computeKeyLevels` may name the day before yesterday as the "prior day". This needs
checking on the chart. `read_stock_today` fetches bars up to today, so its "prior day" is yesterday. The
proof pins this.
