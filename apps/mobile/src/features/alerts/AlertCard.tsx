import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { alpha, color, gradientAngle, radius } from '../../ui/tokens';
import { T, Num, Eyebrow } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { GradeMedallion, GradeChip, Scorecard, gradeBand } from '../grade';
import type { AlertCard as AlertCardModel, AlertCardState } from '../../lib/types';

/**
 * The STANDARD actionable alert card — docs/10 §2/§3/§5.
 * One component for Active, Watching and History. The card is understandable
 * without opening the chart; the CTA is the ONE state-driven primary action
 * and it always lands in the Trade Portal with the alert context.
 *
 * Route contract with lane MOBILE-B:
 *     /trade/[symbol]?alert=<id>&ctx=alert
 */

/** States where acting on the trade is the point → filled volt. */
const ACTING = new Set<AlertCardState>(['ready', 'entry_reached', 'planned', 'order_pending', 'position_active']);

function Chevron({ open }: { open: boolean }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
      <Path d="M6 9l6 6 6-6" stroke={color.muted} strokeWidth={2.5} />
    </Svg>
  );
}

function LogoTile({ symbol }: { symbol: string }) {
  return (
    <LinearGradient
      colors={[alpha.ivory10, alpha.chip85]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{ width: 30, height: 30, borderRadius: 9, borderWidth: 0.5, borderColor: alpha.ivory14, alignItems: 'center', justifyContent: 'center' }}
    >
      <T size={13} weight="bold">{symbol.slice(0, 1)}</T>
    </LinearGradient>
  );
}

function LevelCell({ label, value, c, bg, border }: { label: string; value: string; c: string; bg: string; border: string }) {
  return (
    <View style={{ flex: 1, paddingVertical: 7, paddingHorizontal: 3, borderRadius: 10, backgroundColor: bg, borderWidth: 0.5, borderColor: border, alignItems: 'center' }}>
      <T size={8.5} c={color.muted}>{label}</T>
      <Num size={12} weight="semibold" c={c} style={{ marginTop: 2 }}>{value}</Num>
    </View>
  );
}

/** State label carries a dot + word — never colour alone. */
function stateTone(state: AlertCardState): string {
  if (state === 'entry_reached' || state === 'ready' || state === 'position_active') return color.green;
  if (state === 'invalidated') return color.red;
  if (state === 'closed') return color.muted;
  return color.gold;
}

export function StandardAlertCard({ alert, testID }: { alert: AlertCardModel; testID?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const band = gradeBand(alert.grade, alert.score);
  const acting = ACTING.has(alert.state);
  const trade = alert.trade;
  const hasStrip = !!(trade.current || trade.entry || trade.stop || trade.target);

  const openPortal = () =>
    router.push(`/trade/${encodeURIComponent(alert.symbol)}?alert=${encodeURIComponent(alert.alert_id ?? alert.id)}&ctx=alert`);

  return (
    <LinearGradient
      testID={testID ?? `alert-card-${alert.symbol}`}
      colors={[band.cardVeil, alpha.surface70]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{ borderRadius: radius.xxxl, borderWidth: 1, borderColor: band.cardBorder, padding: 15, gap: 11 }}
    >
      {/* Identity — logo, ticker, company, mode, direction, instrument */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <LogoTile symbol={alert.symbol} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Pressable
            onPress={() => router.push(`/symbol/${encodeURIComponent(alert.symbol)}`)}
            accessibilityRole="button"
            testID={`alert-ticker-${alert.symbol}`}
          >
            <T size={16} weight="bold">{alert.symbol}</T>
          </Pressable>
          <T size={10} c={color.muted}>
            {[alert.company, alert.mode_label, alert.direction_label, alert.instrument_label].filter(Boolean).join(' · ')}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {alert.triggered_at_label ? <T size={10.5} c={color.muted}>{alert.triggered_at_label}</T> : null}
          <T size={11} weight="bold" c={stateTone(alert.state)}>{alert.state_label}</T>
        </View>
      </View>

      {/* Quality + event — the medallion is the dominant object */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
        <GradeMedallion grade={alert.grade} score={alert.score} size={90} testID={`medallion-${alert.symbol}`} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={16} weight="bold" lh={20}>{alert.headline}</T>
          {alert.what_changed ? (
            <T size={12.5} c={color.muted} lh={18} style={{ marginTop: 6 }}>{alert.what_changed}</T>
          ) : null}
        </View>
      </View>

      {open ? (
        <>
          {alert.company_summary ? (
            <View style={{ paddingVertical: 9, paddingHorizontal: 11, borderRadius: 11, backgroundColor: alpha.ivory035, borderWidth: 0.5, borderColor: alpha.ivory08 }}>
              <T size={12} c={color.muted} lh={17}>{alert.company_summary}</T>
            </View>
          ) : null}

          {hasStrip ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <LevelCell label="Current" value={trade.current ?? '—'} c={color.text} bg={alpha.ivory04} border={alpha.ivory10} />
              <LevelCell label="Entry" value={trade.entry ?? '—'} c={color.cyan} bg={color.cyanTint} border={alpha.cyan40} />
              <LevelCell label="Stop" value={trade.stop ?? '—'} c={color.red} bg={color.redTint} border={alpha.red40} />
              <LevelCell label="Target" value={trade.target ?? '—'} c={color.green} bg={color.greenTint} border={alpha.green40} />
            </View>
          ) : null}

          {trade.note ? (
            <T size={11.5} c={color.muted} lh={17}>{trade.note}</T>
          ) : null}

          {trade.rr || trade.hold || trade.expires ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {trade.rr ? (
                <T size={11} c={color.muted}>R:R <Num size={11} c={color.text}>{trade.rr}</Num></T>
              ) : <View />}
              {trade.hold ? <T size={11} c={color.muted}>Hold: {trade.hold}</T> : null}
              {trade.expires ? <T size={11} c={color.muted}>Expires {trade.expires}</T> : null}
            </View>
          ) : null}

          {alert.score_components.length ? (
            <Scorecard
              components={alert.score_components}
              showEvidence={evidence}
              onToggleEvidence={() => setEvidence((v) => !v)}
              testID={`scorecard-${alert.symbol}`}
            />
          ) : null}

          {alert.kai_interpretation ? (
            <LinearGradient
              colors={[alpha.violet18, alpha.violet05]}
              start={gradientAngle.start}
              end={gradientAngle.end}
              style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13, borderWidth: 0.5, borderColor: alpha.violet45 }}
            >
              <KaiOrb size={18} glow={false} />
              <T size={12.5} lh={18} style={{ flex: 1 }}>
                {alert.kai_interpretation}{' '}
                <T size={12.5} c={color.muted}>Kai's assessment, not a guarantee.</T>
              </T>
            </LinearGradient>
          ) : null}

          {alert.fit ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={11} c={color.muted}>
                Your risk <Num size={11} c={color.gold}>{alert.fit.risk_amount ?? '—'}</Num>
                {alert.fit.cap_line ? ` · ${alert.fit.cap_line}` : ''}
              </T>
              {alert.fit.conflicts ? <T size={11} c={color.muted}>{alert.fit.conflicts}</T> : null}
            </View>
          ) : null}

          {alert.community ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T size={11} weight="semibold" c={color.violetLight}>Community</T>
              <T size={11} c={color.muted} style={{ flex: 1 }}>
                {[
                  alert.community.bullish_pct != null ? `${alert.community.bullish_pct}% bullish` : null,
                  alert.community.sample != null ? `${alert.community.sample} posts` : null,
                  alert.community.verification ? `volume claim ${alert.community.verification}` : null,
                ].filter(Boolean).join(' · ')}
              </T>
            </View>
          ) : null}
        </>
      ) : null}

      {/* Monitoring progress stays visible on Watching cards */}
      {alert.progress ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <T size={11} c={color.muted} style={{ width: 74 }}>To trigger</T>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: alpha.ivory08, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(0, Math.min(100, alert.progress.pct))}%`, height: '100%', borderRadius: 3, backgroundColor: color.violet }} />
          </View>
          <Num size={11} c={color.muted}>{alert.progress.label}</Num>
        </View>
      ) : null}

      {/* ONE state-driven primary action */}
      <Pressable
        onPress={openPortal}
        accessibilityRole="button"
        accessibilityHint={`Opens the ${alert.symbol} trade portal with this alert loaded`}
        testID={`alert-cta-${alert.symbol}`}
        style={{
          height: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
          ...(acting
            ? { backgroundColor: color.volt }
            : { borderWidth: 0.5, borderColor: alpha.ivory24 }),
        }}
      >
        <T size={14.5} weight="bold" c={acting ? color.bg : color.text}>{alert.primary_action.label}</T>
      </Pressable>

      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide setup details' : 'View setup details'}
        testID={`alert-expand-${alert.symbol}`}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <T size={11.5} weight="semibold" c={color.muted}>{open ? 'Hide setup details' : 'View setup details'}</T>
        <Chevron open={open} />
      </Pressable>

      {open && alert.freshness_line ? (
        <T size={10} c={color.muted} align="center">{alert.freshness_line}</T>
      ) : null}
    </LinearGradient>
  );
}

/** History row — the audit trail, not a decision object (spec §1). */
export function HistoryAlertRow({ alert }: { alert: AlertCardModel }) {
  const router = useRouter();
  const bad = alert.state === 'invalidated';
  return (
    <Pressable
      onPress={() => router.push(`/trade/${encodeURIComponent(alert.symbol)}?alert=${encodeURIComponent(alert.id)}&ctx=alert`)}
      accessibilityRole="button"
      testID={`alert-history-${alert.symbol}`}
    >
      <LinearGradient
        colors={bad ? [alpha.red06, alpha.surface70] : [alpha.ivory05, alpha.surface70]}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={{ borderRadius: radius.xl, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 0.5, borderColor: bad ? alpha.red35 : alpha.ivory14, gap: 8 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T size={15} weight="bold">{alert.symbol}</T>
          <GradeChip grade={alert.grade} score={alert.score} />
          <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, borderWidth: 0.5, borderColor: bad ? alpha.red40 : alpha.green50 }}>
            <T size={10} c={bad ? color.red : color.green}>{alert.state_label}</T>
          </View>
          {alert.resolved_label ? <T size={10} c={color.muted} style={{ marginLeft: 'auto' }}>{alert.resolved_label}</T> : null}
        </View>
        <T size={12.5} c={color.muted} lh={17.5}>{alert.what_changed || alert.headline}</T>
        {alert.outcome ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={11.5} c={color.muted}>{alert.outcome.label}</T>
            <Num size={11.5} weight="semibold" c={alert.outcome.tone === 'bad' ? color.red : color.green}>{alert.outcome.value ?? '—'}</Num>
          </View>
        ) : null}
        <T size={11} weight="semibold" c={color.violetLight}>{alert.primary_action.label}</T>
      </LinearGradient>
    </Pressable>
  );
}

export function AlertsEmpty({ copy }: { copy: string }) {
  return (
    <View style={{ paddingVertical: 40, paddingHorizontal: 20, gap: 8, alignItems: 'center' }} testID="alerts-empty">
      <Eyebrow c={color.dim}>NOTHING HERE</Eyebrow>
      <T size={13} c={color.muted} align="center" lh={19}>{copy}</T>
    </View>
  );
}
