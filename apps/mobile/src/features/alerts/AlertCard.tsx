import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, GradeBadge, StatusChip, Divider, Button, PriceTriplet, T, Num, color, alpha, radius, type ChipTone } from '../../ui/kit';
// A ticker is never plain text: the one shared mark (logo, or the vibrant
// letters fallback) lives in the design system — feedback_ticker_logo_rule.
import { TickerMark } from '../../ui/Ticker';
import { gradeBand, displayGrade } from '../grade/bands';
import { tradeHref } from './links';
import { kaiPasses, sideOf } from './card-rules';
import {
  analyticsCells, contractLine, currentPrice, dayChangePct, isContractLed, isZoneText, levelOf, rangeOf, rMultiple,
  stateVerb, timeAgo, windowBars, type VerbTone,
} from './card-model';
import { AnalyticsRow, BookmarkButton, MicroChart, RangeRail, WindowToggle } from './instruments';
import type { AlertCard as AlertCardModel, Candle } from '../../lib/types';
import { hitSlopFor } from '../../ui/touch';

/**
 * THE V2 ALERT CARD — "alert cards are market instruments" (owner pack,
 * docs/design/redesign-2026-09-21, board V2 panel 2).
 *
 * ONE ANATOMY FOR EVERY FAMILY (owner, 21 Sept: "daytrade is diff from swing
 * card ui"). Top to bottom, in the order the spec reads a card:
 *
 *   ticker + logo · mode · direction · grade badge · R        (identity)
 *   status chip, said as a verb · time ago                    (what happened)
 *   current price · the day's change  |  24h/72h microchart   (where it is)
 *   Day Trade only: ONE contract row — strike · expiry · paid · peak after
 *   priority: the stop – entry – target rail with price on it, then the
 *     secondary facts that exist — R, pattern, volume …        (why)
 *   compact: the same three levels as one Entry · Stop · Target row (a card
 *     with no levels shows its secondary facts there instead)
 *   "View setup" + the bookmark                                (act)
 *
 * TWO DENSITIES. `priority` is the single highest-priority alert on the board:
 * it carries the orange edge glow, the rail and the filled orange action — the
 * screen's one dominant CTA. `compact` is every supporting card: the levels as
 * one row instead of the rail, an outline action, so two or three fit on a
 * phone. Kai's "explain this signal" lives on the detail the card opens —
 * a third control here would break "bookmark is the only trailing control".
 *
 * THE WHOLE CARD OPENS THE DETAIL. The bookmark and the 24h/72h toggle are the
 * only controls inside it. They cannot be nested inside the card's own button
 * (react-native-web renders `role=button` as a real <button>, which may not
 * contain another), so the card's door is a full-bleed Pressable UNDER the
 * content; the content ignores touches (`pointerEvents="none"`) and only the
 * two controls take them.
 *
 * GRADE, NEVER A TINT. The grade is the compact badge plus the kit Card's
 * subtle left edge (gold for A/A+, violet-ink for B+, grey below). A card Kai
 * says to leave keeps its letter but draws it grey, with "I'd pass" beside the
 * time — never gold beside "I would leave this one".
 *
 * NOTHING IS INVENTED. No bars → no chart. No coherent plan → no rail and no
 * R. No measured contract peak → the contract row stops at what was paid. An
 * analytics cell with nothing behind it is not drawn.
 *
 * PROPS ARE STABLE FOR HOME. `StandardAlertCard({ alert, candles })` still
 * renders (compact, no bookmark control unless `onToggleBookmark` is given).
 * New, all optional: `density`, `priority`, `bookmarked`, `onToggleBookmark`.
 * `onOpen` now fires just before the card navigates to its detail.
 */
export type AlertCardDensity = 'priority' | 'compact';

const TONE: Record<VerbTone, ChipTone> = { neutral: 'neutral', action: 'action', up: 'up', down: 'down' };

const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

export function StandardAlertCard({
  alert, testID, candles, onOpen, density = 'compact', priority = false, bookmarked = false, onToggleBookmark,
}: {
  alert: AlertCardModel;
  testID?: string;
  /** Five-minute bars from `/market/candles` — the alert wire carries none. See useAlertCandles. */
  candles?: readonly Candle[];
  /** Fires as the card opens its detail. */
  onOpen?: () => void;
  density?: AlertCardDensity;
  /** The orange edge glow. The board gives it to ONE card (`pickPriority`). */
  priority?: boolean;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
}) {
  const router = useRouter();
  const [hours, setHours] = useState<24 | 72>(24);
  const expanded = density === 'priority';
  const sym = alert.symbol;
  const passes = kaiPasses(alert);
  const graded = displayGrade(alert.grade) !== '—';
  const band = passes ? gradeBand(null, 0) : gradeBand(alert.grade, alert.score);

  const bars = candles ?? [];
  const now = currentPrice(alert, bars);
  const change = dayChangePct(alert, bars);
  const verb = stateVerb(alert, now);
  const ago = timeAgo(alert.triggered_at);
  const range = rangeOf(alert, now);
  const r = rMultiple(alert, range);
  const cells = useMemo(() => analyticsCells(alert, r), [alert, r]);
  const contract = contractLine(alert);
  const shown = useMemo(() => windowBars(bars, hours), [bars, hours]);
  const hasChart = shown.length >= 2;
  // A zone is not a price: the numeric triplet is only for single levels (a
  // zone card shows its secondary facts in that row instead, and the zone
  // itself on the rail's label and on the detail).
  const hasLevels = [alert.trade.entry, alert.trade.stop, alert.trade.target].some((v) => levelOf(v) != null)
    && ![alert.trade.entry, alert.trade.stop, alert.trade.target].some(isZoneText);

  const open = () => {
    onOpen?.();
    router.push(tradeHref(alert) as never);
  };

  const a11y = [
    sym, sideOf(alert), graded ? `grade ${displayGrade(alert.grade)}` : null,
    r != null ? `${r.toFixed(1)} R` : null, verb.label, ago,
    now != null ? `price ${money(now)}` : null, change != null ? `${pct(change)} today` : null,
  ].filter(Boolean).join(', ');

  return (
    <Card
      edge={graded ? band.edge : null}
      priority={priority}
      testID={testID ?? `alert-card-${sym}`}
      style={{ gap: expanded ? 14 : 12 }}
    >
      {/* THE DOOR — under everything, the size of the card. */}
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint="Opens the full setup"
        testID={`alert-open-${sym}`}
        style={({ pressed }) => [StyleSheet.absoluteFill, { backgroundColor: pressed ? color.raised : 'transparent' }]}
      />

      {/* identity */}
      <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TickerMark symbol={sym} size={expanded ? 40 : 36} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
          <T variant="cardTitle" weight="bold" numberOfLines={1}>{sym}</T>
          <T variant="meta" c={color.textSecondary} numberOfLines={1} testID={`alert-side-${sym}`}>{sideOf(alert)}</T>
        </View>
        {graded ? (
          <GradeBadge grade={alert.grade} score={passes ? 0 : alert.score} testID={`alert-grade-${sym}`} />
        ) : null}
        {r != null ? (
          <Num variant="cardTitle" weight="semibold" c={passes ? color.textSecondary : color.marketUp} testID={`alert-r-${sym}`}>
            {`${r.toFixed(1)}R`}
          </Num>
        ) : null}
      </View>

      {/* what happened · where it is · the shape of it */}
      <View pointerEvents="box-none" style={{ flexDirection: 'row', gap: 12 }}>
        <View pointerEvents="none" style={{ flexShrink: 1, gap: 8, minWidth: 0, flex: hasChart ? undefined : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusChip label={verb.label} tone={TONE[verb.tone]} testID={`alert-verb-${sym}`} />
            {ago ? <T variant="meta" c={color.textSecondary} testID={`alert-ago-${sym}`}>{ago}</T> : null}
            {passes ? <T variant="meta" c={color.textSecondary}>I'd pass</T> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {now != null ? (
              <Num variant="keyPrice" c={color.textPrimary} testID={`alert-price-${sym}`}>{money(now)}</Num>
            ) : null}
            {change != null ? (
              <Num
                variant="body"
                weight="semibold"
                c={change > 0 ? color.marketUp : change < 0 ? color.marketDown : color.textSecondary}
                testID={`alert-change-${sym}`}
              >
                {pct(change)}
              </Num>
            ) : null}
          </View>
        </View>
        {hasChart ? (
          <View pointerEvents="box-none" style={{ flex: 1, minWidth: 110, gap: 4 }}>
            <WindowToggle value={hours} onChange={setHours} testID={`alert-window-${sym}`} />
            <View pointerEvents="none">
              <MicroChart bars={shown} height={expanded ? 56 : 44} testID={`alert-chart-${sym}`} />
            </View>
          </View>
        ) : null}
      </View>

      {/* Day Trade: the one contract row */}
      {contract ? (
        <View
          pointerEvents="none"
          testID={`contract-row-${sym}`}
          accessibilityLabel={[
            `${contract.strike} ${contract.side.toLowerCase()}`, `expires ${contract.expiry}`,
            contract.paid ? `paid ${contract.paid}` : null,
            contract.peak ? `peak after the alert ${contract.peak}${contract.multiple ? `, ${contract.multiple} cost` : ''}` : null,
          ].filter(Boolean).join(', ')}
          style={{
            flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, rowGap: 2,
            paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.lg,
            backgroundColor: alpha.ivory04, borderWidth: 1, borderColor: alpha.divider,
          }}
        >
          <Num variant="meta" weight="semibold" c={color.textPrimary}>{`${contract.strike} ${contract.side}`}</Num>
          <T variant="meta" c={color.textSecondary}>·</T>
          <T variant="meta" c={color.textSecondary}>{`exp ${contract.expiry}`}</T>
          {contract.paid ? (
            <>
              <T variant="meta" c={color.textSecondary}>· paid</T>
              <Num variant="meta" weight="semibold" c={color.textPrimary}>{contract.paid}</Num>
            </>
          ) : null}
          {contract.peak ? (
            <>
              <T variant="meta" c={color.textSecondary}>· peak</T>
              <Num variant="meta" weight="semibold" c={color.marketUp} testID={`contract-peak-${sym}`}>
                {contract.multiple ? `${contract.peak} (${contract.multiple})` : contract.peak}
              </Num>
            </>
          ) : null}
        </View>
      ) : null}

      {/* priority: the stop – entry – target rail */}
      {expanded && range ? (
        <View pointerEvents="none">
          <RangeRail
            range={range}
            current={now}
            labels={{
              stop: alert.trade.stop ?? range.stop.toFixed(2),
              entry: alert.trade.entry ?? range.entry.toFixed(2),
              target: alert.trade.target ?? range.target.toFixed(2),
            }}
            testID={`alert-range-${sym}`}
          />
        </View>
      ) : null}

      {/* compact: the three levels as one row — the spec's card order ends in
          entry / stop / target, and a supporting card must not hide them */}
      {!expanded && hasLevels ? (
        <View pointerEvents="none">
          <PriceTriplet
            entry={levelOf(alert.trade.entry)}
            stop={levelOf(alert.trade.stop)}
            target={levelOf(alert.trade.target)}
            testID={`alert-levels-${sym}`}
          />
        </View>
      ) : null}

      {/* a plan with no numbers says so in the server's own words (Day Trade has none) */}
      {!range && !hasLevels && !isContractLed(alert) && alert.trade.note ? (
        <View pointerEvents="none">
          <T variant="meta" c={color.textSecondary} testID={`alert-no-plan-${sym}`}>{alert.trade.note}</T>
        </View>
      ) : null}

      {cells.length && (expanded || !hasLevels) ? (
        <View pointerEvents="none" style={{ gap: 12 }}>
          <Divider />
          <AnalyticsRow cells={cells} testID={`alert-analytics-${sym}`} />
        </View>
      ) : null}

      {/* act */}
      <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View pointerEvents="box-none" style={{ flex: 1 }}>
          <Button
            label="View setup"
            arrow={expanded}
            kind={expanded ? 'volt' : 'outline'}
            height={44}
            onPress={open}
            accessibilityHint={`Opens the ${sym} setup`}
            testID={`alert-cta-${sym}`}
          />
        </View>
        {onToggleBookmark ? (
          <BookmarkButton
            saved={bookmarked}
            emphasis={expanded}
            symbol={sym}
            onPress={onToggleBookmark}
            testID={`alert-bookmark-${sym}`}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** The same card under the name the redesign's component inventory uses. */
export const AlertSetupCard = StandardAlertCard;

/* ==================================================================== */
/* History                                                               */
/* ==================================================================== */

/**
 * HISTORY ROW — the record, in the V2 card's language.
 *
 * Same surface, same identity row, same grade edge as a live card, so History
 * reads as the same objects later in their lives. What it carries is numbers:
 * what it was called at, the best it reached, what it did — each only where it
 * was measured, never a dash under a label (a dash under "Peak" reads as a
 * peak of nothing). One muted line qualifies them: a rehearsal says so first;
 * otherwise the measurement basis.
 */
export function HistoryAlertRow({ alert }: { alert: AlertCardModel }) {
  const router = useRouter();
  const bad = alert.state === 'invalidated';
  const outcome = alert.outcome ?? null;
  const graded = displayGrade(alert.grade) !== '—';
  const band = gradeBand(alert.grade, alert.score);
  const contract = contractLine(alert);

  const stats: { key: string; label: string; value: string; tone?: string; big?: boolean }[] = [];
  const called = alert.trade.entry?.trim() ?? '';
  if (/^[$\d]/.test(called)) stats.push({ key: 'called', label: 'Called', value: called.startsWith('$') ? called : `$${called}` });
  if (outcome?.peak) stats.push({ key: 'peak', label: outcome.peak_label ?? 'Peak', value: outcome.peak });
  if (outcome?.value) {
    stats.push({
      key: 'result',
      label: alert.held ? `Result · ${alert.held}` : 'Result',
      value: outcome.value,
      tone: outcome.tone === 'bad' ? color.marketDown : outcome.tone === 'good' ? color.marketUp : color.textPrimary,
      big: true,
    });
  }
  const heldLead = alert.held && !outcome?.value ? `Held ${alert.held}` : null;
  const basisLine = outcome?.basis ?? (stats.length ? null : alert.headline || null);
  const note = alert.replay
    ? 'Rehearsal, not an alert anyone was sent.'
    : [heldLead, basisLine].filter(Boolean).join(' · ') || null;
  const verb = bad ? { label: alert.state_label || 'Invalidated', tone: 'down' as ChipTone } : { label: alert.state_label || 'Closed', tone: 'neutral' as ChipTone };

  return (
    <Card edge={graded ? band.edge : null} testID={`alert-history-${alert.symbol}`} style={{ gap: 12 }}>
      <Pressable
        onPress={() => router.push(tradeHref(alert) as never)}
        accessibilityRole="button"
        accessibilityLabel={`${alert.symbol}, ${sideOf(alert)}, ${verb.label}${alert.resolved_label ? `, ${alert.resolved_label}` : ''}`}
        accessibilityHint={`Opens the full record for this ${alert.symbol} alert`}
        testID={`alert-history-open-${alert.symbol}`}
        style={({ pressed }) => [StyleSheet.absoluteFill, { backgroundColor: pressed ? color.raised : 'transparent' }]}
      />
      <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TickerMark symbol={alert.symbol} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <T variant="cardTitle" weight="bold">{alert.symbol}</T>
            <T variant="meta" c={color.textSecondary} numberOfLines={1} testID={`direction-${alert.symbol}`}>{sideOf(alert)}</T>
          </View>
          {alert.resolved_label ? <T variant="meta" c={color.textSecondary}>{alert.resolved_label}</T> : null}
        </View>
        {graded ? <GradeBadge grade={alert.grade} score={alert.score} size="sm" /> : null}
        <StatusChip label={verb.label} tone={verb.tone} />
      </View>

      {stats.length ? (
        <View pointerEvents="none" testID={`stats-${alert.symbol}`} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 8 }}>
          {stats.map((s) => (
            <View
              key={s.key}
              accessibilityLabel={`${s.label}, ${s.value}`}
              testID={s.key === 'result' ? `outcome-${alert.symbol}` : `stat-${s.key}-${alert.symbol}`}
            >
              <T variant="meta" c={color.textSecondary}>{s.label}</T>
              <Num variant={s.big ? 'cardTitle' : 'body'} weight="semibold" c={s.tone ?? color.textPrimary}>{s.value}</Num>
            </View>
          ))}
        </View>
      ) : null}

      {contract ? (
        <View pointerEvents="none">
          <T variant="meta" c={color.textSecondary} testID={`history-contract-${alert.symbol}`}>
            {[`${contract.strike} ${contract.side}`, `exp ${contract.expiry}`, contract.paid ? `paid ${contract.paid}` : null]
              .filter(Boolean).join(' · ')}
          </T>
        </View>
      ) : null}

      {note ? <View pointerEvents="none"><T variant="meta" c={color.textSecondary}>{note}</T></View> : null}
    </Card>
  );
}

/* ==================================================================== */
/* Empty                                                                 */
/* ==================================================================== */

/**
 * Nothing here — and somewhere to go. A quiet day is a real answer and the
 * copy says so; every offer goes to a route that exists.
 */
export function AlertsEmpty({ copy, offers = [] }: {
  copy: string;
  offers?: { label: string; onPress: () => void; testID?: string }[];
}) {
  return (
    <Card testID="alerts-empty" style={{ gap: 8, alignItems: 'center', paddingVertical: 28 }}>
      <T variant="cardTitle" weight="semibold">Nothing here</T>
      <T variant="body" c={color.textSecondary} align="center">{copy}</T>
      {offers.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          {offers.map((o) => (
            <Pressable
              hitSlop={hitSlopFor(44, 36)}
              key={o.label}
              testID={o.testID}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              onPress={o.onPress}
              style={({ pressed }) => ({
                height: 36, paddingHorizontal: 14, borderRadius: radius.control,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: alpha.action40, backgroundColor: pressed ? alpha.action14 : alpha.action10,
              })}
            >
              <T variant="meta" weight="semibold" c={color.action}>{o.label}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
