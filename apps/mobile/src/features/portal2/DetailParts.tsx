/**
 * THE TRADE DETAIL, PIECE BY PIECE — redesign 2026-09-21, V1 board panel 4.
 *
 *   header ........... back · "PURR · Swing Long" (the search) · overflow
 *   identity ......... logo, ticker, grade chip, company · the R right now
 *   setup summary .... Entry / Stop / Target, Risk / Reward, Setup type
 *   Kai's thesis ..... the ONLY violet card on the screen
 *   checklist ........ Trend · Catalyst · Volume · Risk, each from a grade leg
 *   the one action ... Add to watchlist, orange
 *
 * Every piece is composed from `ui/kit` and reads its words and numbers from
 * `detail-model.ts`, which is pure and tested. Nothing here decides anything.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card, PriceTriplet, T, Num, Button, color, alpha, radius, layout, tap } from '../../ui/kit';
import { TickerMark } from '../../ui/Ticker';
import { Check } from '../../ui/Icons';
import { gradeBand, displayGrade } from '../grade/bands';
import type { Quote } from '../../lib/types';
import {
  BackGlyph, BookmarkGlyph, CheckDisc, ChevronDownGlyph, MoreGlyph, OpenRing, SparkGlyph, UnknownRing,
} from './icons';
import { signedR, type CheckItem, type Thesis } from './detail-model';

/* ------------------------------------------------------------------ */
/* Header                                                               */
/* ------------------------------------------------------------------ */

/**
 * Back · title · overflow. The title IS the ticker search: tapping "META ·
 * Day Trade Long" opens the same search sheet the old field did (the owner's
 * "ticker search bar at top"), and the chevron says so. A field-shaped pill
 * here would be a second focal point on a screen the spec gives exactly one.
 */
export function TradeHeader({
  title, symbol, onBack, onSearch, onMore,
}: {
  title: string;
  symbol: string;
  onBack: () => void;
  onSearch: () => void;
  onMore: () => void;
}) {
  return (
    <View
      testID="portal-top-bar"
      accessibilityRole="header"
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter - 12, minHeight: 52 }}
    >
      <Pressable
        testID="portal-back"
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={{ width: tap.min, height: tap.min, alignItems: 'center', justifyContent: 'center' }}
      >
        <BackGlyph />
      </Pressable>
      <Pressable
        testID="ticker-switcher"
        accessibilityRole="search"
        accessibilityLabel={`${title}. Search for a different symbol`}
        accessibilityHint="Opens search. Pick a symbol and the screen changes to it."
        onPress={onSearch}
        style={({ pressed }) => ({
          flex: 1, minHeight: tap.min, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          borderRadius: radius.control, opacity: pressed ? 0.7 : 1, paddingHorizontal: 6,
        })}
      >
        <T variant="cardTitle" weight="bold" numberOfLines={1} testID="trade-title">{title}</T>
        <ChevronDownGlyph />
      </Pressable>
      <Pressable
        testID="trade-more"
        accessibilityRole="button"
        accessibilityLabel={`More for ${symbol}`}
        accessibilityHint="Review a paper order, your positions and orders, and search."
        onPress={onMore}
        style={{ width: tap.min, height: tap.min, alignItems: 'center', justifyContent: 'center' }}
      >
        <MoreGlyph />
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Identity                                                             */
/* ------------------------------------------------------------------ */

const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Logo, ticker, grade chip, company — and in the corner, where the trade is
 * right now in R. The R is market-coloured because it IS market state (above
 * the entry is a gain, below it a loss). With no plan there is no R to show, so
 * the corner shows the live price and the day's move instead of a made-up one.
 */
export function IdentityRow({
  symbol, name, grade, score, rNow, quote,
}: {
  symbol: string;
  name: string | null;
  grade: string | null;
  score: number | null;
  rNow: number | null;
  quote: Quote | null;
}) {
  const band = gradeBand(grade, score);
  const isA = band.family === 'a-high' || band.family === 'a-low';
  const price = quote?.price ?? null;
  const chg = quote?.change_pct ?? null;
  const rInk = rNow == null ? color.textPrimary : rNow > 0.05 ? color.marketUp : rNow < -0.05 ? color.marketDown : color.textPrimary;
  const chgInk = chg == null ? color.textSecondary : chg > 0 ? color.marketUp : chg < 0 ? color.marketDown : color.textSecondary;

  return (
    <View testID="trade-identity" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.gutter, paddingVertical: 6 }}>
      <TickerMark symbol={symbol} size={48} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T variant="sectionTitle" weight="bold" testID="trade-ticker">{symbol}</T>
          {grade ? (
            <View
              testID="trade-grade-chip"
              accessibilityLabel={`Grade ${displayGrade(grade)} setup. ${band.quality}.`}
              style={{
                height: 24, paddingHorizontal: 9, borderRadius: radius.pill, justifyContent: 'center',
                borderWidth: 1, borderColor: band.ring, backgroundColor: isA ? alpha.grade14 : 'transparent',
              }}
            >
              <T variant="meta" weight="semibold" c={isA ? color.grade : band.letter}>{`${displayGrade(grade)} setup`}</T>
            </View>
          ) : (
            <View testID="trade-grade-chip" style={{ height: 24, paddingHorizontal: 9, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1, borderColor: alpha.border }}>
              <T variant="meta" c={color.textSecondary}>Not graded</T>
            </View>
          )}
        </View>
        <T variant="body" c={color.textSecondary} numberOfLines={1} testID="trade-company">{name ?? symbol}</T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {rNow != null ? (
          <>
            <Num
              variant="sectionTitle"
              weight="semibold"
              c={rInk}
              testID="trade-r-now"
              accessibilityLabel={`Right now the trade is at ${signedR(rNow).replace('−', 'minus ')}`}
            >
              {signedR(rNow)}
            </Num>
            {price != null ? <Num variant="meta" weight="medium" c={color.textSecondary} testID="trade-price">{money(price)}</Num> : null}
          </>
        ) : price != null ? (
          <>
            <Num variant="sectionTitle" weight="semibold" c={color.textPrimary} testID="trade-price">{money(price)}</Num>
            {chg != null ? <Num variant="meta" weight="medium" c={chgInk}>{`${chg > 0 ? '+' : chg < 0 ? '−' : ''}${Math.abs(chg).toFixed(2)}%`}</Num> : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Setup summary                                                        */
/* ------------------------------------------------------------------ */

export function SetupSummary({
  entry, stop, target, rPlanned, setupType, emptyPlain,
}: {
  entry: number | null;
  stop: number | null;
  target: number | null;
  rPlanned: number | null;
  setupType: string | null;
  /** Shown instead of the numbers when there is no plan. Never a row of dashes. */
  emptyPlain: string | null;
}) {
  if (entry == null && stop == null && target == null) {
    return (
      <Card testID="setup-summary" style={{ gap: 6 }}>
        <T variant="cardTitle">No plan on this one</T>
        <T variant="body" c={color.textSecondary}>{emptyPlain ?? 'There is no graded entry, stop and target here.'}</T>
      </Card>
    );
  }
  return (
    <Card testID="setup-summary" style={{ gap: 14 }}>
      <PriceTriplet entry={entry} stop={stop} target={target} size="cardTitle" testID="summary-triplet" />
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`Risk to reward ${rPlanned == null ? 'not known' : `${rPlanned.toFixed(1)} R`}`}>
          <T variant="meta" c={color.textSecondary}>Risk / Reward</T>
          <Num variant="cardTitle" weight="semibold" c={color.textPrimary} testID="summary-rr">
            {rPlanned == null ? '—' : `${rPlanned.toFixed(1)}R`}
          </Num>
        </View>
        <View style={{ flex: 2, gap: 2 }} accessible accessibilityLabel={`Setup type ${setupType ?? 'not stated'}`}>
          <T variant="meta" c={color.textSecondary}>Setup type</T>
          <T variant="cardTitle" weight="medium" testID="summary-type" numberOfLines={1}>{setupType ?? '—'}</T>
        </View>
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Kai's thesis                                                         */
/* ------------------------------------------------------------------ */

/**
 * THE ONE VIOLET CARD. The spec: "Kai thesis receives a violet outline/glow;
 * all ordinary analysis remains neutral." So the setup summary above and the
 * checklist below are neutral, and this is the only place violet sits on the
 * screen at rest. "Ask Kai" lives in its header because asking Kai is a Kai
 * action, and this is where Kai is already speaking.
 */
export function KaiThesisCard({
  thesis, symbol, onAsk, asking,
}: {
  thesis: Thesis;
  symbol: string;
  onAsk: () => void;
  asking: boolean;
}) {
  return (
    <Card tone="kai" testID="kai-thesis" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <SparkGlyph />
        <T variant="cardTitle" style={{ flex: 1 }}>Kai’s thesis</T>
        <Pressable
          testID="kai-thesis-ask"
          accessibilityRole="button"
          accessibilityLabel={asking ? 'Close the question to Kai' : `Ask Kai about ${symbol}`}
          onPress={onAsk}
          style={{ minHeight: tap.min, minWidth: tap.min, marginVertical: -12, marginRight: -8, paddingHorizontal: 8, alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <T variant="meta" weight="semibold" c={color.kaiInk}>{asking ? 'Close' : 'Ask Kai'}</T>
        </Pressable>
      </View>
      {thesis ? (
        <T variant="body" c={color.textPrimary} testID="kai-thesis-text">{thesis.text}</T>
      ) : (
        <T variant="body" c={color.textSecondary} testID="kai-thesis-none">
          {`Kai has not written a thesis on ${symbol}. There is no graded setup here for him to argue for, and he will not invent one.`}
        </T>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Checklist                                                            */
/* ------------------------------------------------------------------ */

const STATE_WORD: Record<CheckItem['state'], string> = { met: 'passes', not_met: 'not yet', unknown: 'not measured' };

/**
 * Trend · Catalyst · Volume · Risk. A tick is drawn only for a grade leg that
 * scored its top word; a leg below that is an empty ring; a leg nobody
 * measured is a dashed question — never a tick. Tapping a line says why, in
 * the grader's own sentence.
 */
export function SetupChecklist({ items }: { items: CheckItem[] }) {
  const [open, setOpen] = useState<CheckItem['key'] | null>(null);
  const openItem = items.find((i) => i.key === open) ?? null;
  return (
    <View testID="setup-checklist" style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row' }}>
        {items.map((it) => (
          <Pressable
            key={it.key}
            testID={`check-${it.key}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: open === it.key, checked: it.state === 'met' }}
            accessibilityLabel={`${it.label}: ${STATE_WORD[it.state]}${it.status ? `, ${it.status}` : ''}.`}
            accessibilityHint="Shows why."
            onPress={() => setOpen((k) => (k === it.key ? null : it.key))}
            style={({ pressed }) => ({
              flex: 1, minHeight: tap.min, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              borderRadius: radius.control, backgroundColor: open === it.key || pressed ? color.raised : 'transparent',
            })}
          >
            {it.state === 'met' ? <CheckDisc /> : it.state === 'not_met' ? <OpenRing /> : <UnknownRing />}
            <T variant="body" c={it.state === 'met' ? color.textPrimary : color.textSecondary} numberOfLines={1}>{it.label}</T>
          </Pressable>
        ))}
      </View>
      {openItem ? (
        <T variant="meta" c={color.textSecondary} testID="check-why" style={{ paddingHorizontal: 4 }}>
          {`${openItem.label}${openItem.status ? ` · ${openItem.status}` : ''} — ${openItem.plain}`}
        </T>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The one action                                                       */
/* ------------------------------------------------------------------ */

/**
 * ADD TO WATCHLIST — the screen's single orange action (spec: "One primary
 * action: Add to watchlist"). Once it is on the list, the button stops being
 * orange: there is nothing left to push, so it becomes a quiet outline that
 * says where it is and takes it off again if pressed.
 */
export function WatchlistCta({
  symbol, on, busy, onToggle,
}: {
  symbol: string;
  on: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return on ? (
    <Button
      testID="cta-watchlist"
      kind="outline"
      height={52}
      label="On your watchlist"
      icon={<Check size={16} color={color.textPrimary} strokeWidth={2.4} />}
      disabled={busy}
      onPress={onToggle}
      accessibilityHint={`Takes ${symbol} off your watchlist.`}
    />
  ) : (
    <Button
      testID="cta-watchlist"
      kind="volt"
      height={52}
      label="Add to watchlist"
      icon={<BookmarkGlyph />}
      disabled={busy}
      onPress={onToggle}
      accessibilityHint={`Adds ${symbol} to your watchlist.`}
    />
  );
}

