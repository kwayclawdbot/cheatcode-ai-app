/**
 * The four working panels that sit under the portal chart, plus the execution
 * object (pending order / open position) from the Asset-workspace board.
 *
 * Spec 10 §8: rich objects appear inside the conversation only when relevant.
 * Kai never claims an order was accepted, filled or monitored before
 * confirmation, and every assessment is labelled as analysis.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { KaiOrb } from '../../ui/KaiOrb';
import { Check, ArrowRight } from '../../ui/Icons';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { alpha, color, radius } from '../../ui/tokens';
import { money, shareLabel, StatusDot } from '../trade/components';
import { GradeMedallion, GradeChip, Scorecard } from './grade';
import type { PortalTurn } from './useKaiPortal';
import type { PortalAlert, PortalCommunity, PortalExecution, PortalPlan, TradePortal } from './types';

/* ------------------------------------------------------------------ */
/* Kai panel                                                            */
/* ------------------------------------------------------------------ */

export function KaiPanel({ turns, symbol }: { turns: PortalTurn[]; symbol: string }) {
  return (
    <View testID="panel-kai" style={{ gap: 11 }}>
      {turns.map((t) => {
        if (t.kind === 'user') {
          return (
            <View
              key={t.id}
              style={{
                alignSelf: 'flex-end', maxWidth: '86%', paddingVertical: 8, paddingHorizontal: 13,
                borderTopLeftRadius: 14, borderTopRightRadius: 4, borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
                backgroundColor: alpha.volt14, borderWidth: 0.5, borderColor: alpha.volt50,
              }}
            >
              <T size={13} lh={19}>{t.text}</T>
            </View>
          );
        }
        if (t.kind === 'typing') {
          return (
            <View key={t.id} testID="kai-typing" style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <KaiOrb size={24} />
              <T size={13} c={color.muted}>Kai is reading the chart…</T>
            </View>
          );
        }
        if (t.kind === 'narration') {
          return (
            <View
              key={t.id}
              testID="chart-narration"
              style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 7, paddingHorizontal: 11,
                borderRadius: radius.lg, backgroundColor: alpha.violet08, borderLeftWidth: 2, borderLeftColor: color.violet,
              }}
            >
              <T size={12.5} lh={18} c={color.violetLight} style={{ flex: 1 }}>{t.text}</T>
            </View>
          );
        }
        return (
          <View key={t.id} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
            <KaiOrb size={24} />
            <View
              style={{
                flex: 1, paddingVertical: 9, paddingHorizontal: 13,
                borderTopLeftRadius: 4, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
                backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50,
              }}
            >
              <T size={13} lh={19} testID="kai-reply">{t.text}</T>
            </View>
          </View>
        );
      })}
      {!turns.length ? (
        <T size={12.5} lh={18} c={color.muted}>{`Ask Kai anything about the ${symbol} chart.`}</T>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Alert panel — the standard card, inside the portal                   */
/* ------------------------------------------------------------------ */

export function AlertPanel({
  alert, onAskWhy, onPrimary, quoteFreshness,
}: {
  alert: PortalAlert;
  onAskWhy: () => void;
  onPrimary: () => void;
  quoteFreshness?: React.ReactNode;
}) {
  const strip: { label: string; value: string | null; c: string }[] = [
    { label: 'Entry', value: alert.entry != null ? (alert.entry_high != null ? `${alert.entry}–${alert.entry_high}` : String(alert.entry)) : null, c: color.cyan },
    { label: 'Stop', value: alert.stop != null ? String(alert.stop) : null, c: color.red },
    { label: 'Target', value: alert.target != null ? String(alert.target) : null, c: color.green },
  ];

  return (
    <View testID="panel-alert" style={{ gap: 11 }}>
      <ObjectCard r={radius.xl} style={{ padding: 15, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 13, alignItems: 'flex-start' }}>
          <GradeMedallion grade={alert.grade_display} score={alert.score} size={72} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <T size={15} weight="bold">{alert.symbol}</T>
              {alert.company ? <T size={11} c={color.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{alert.company}</T> : null}
            </View>
            <T size={10.5} c={color.dim}>
              {[alert.mode, alert.direction, alert.instrument].filter(Boolean).join(' · ')}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <StatusDot c={alert.condition_met ? color.green : color.gold} size={5} />
              <T size={10.5} c={alert.condition_met ? color.green : color.gold} testID="alert-state">{alert.state_label}</T>
              {alert.triggered_at ? <T size={10} c={color.dim}>{`· ${alert.triggered_at.slice(11, 16) || alert.triggered_at}`}</T> : null}
            </View>
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <T size={14} weight="semibold" lh={20} testID="alert-headline">{alert.headline}</T>
          {alert.what_changed ? <T size={12.5} lh={18} c={color.muted}>{alert.what_changed}</T> : null}
        </View>

        {alert.company_summary ? (
          <T size={12} lh={18} c={color.muted} testID="company-summary">{alert.company_summary}</T>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {strip.map((s) => (
            <View
              key={s.label}
              style={{
                flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center',
                backgroundColor: `${s.c}14`, borderWidth: 0.5, borderColor: `${s.c}66`,
              }}
            >
              <T size={8.5} c={color.muted}>{s.label}</T>
              <Num size={12} weight="semibold" c={s.c}>{s.value ?? '—'}</Num>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {alert.rr ? <T size={11} c={color.muted}>{`${alert.rr} reward to risk`}</T> : null}
          {alert.hold ? <T size={11} c={color.dim}>{`· ${alert.hold}`}</T> : null}
          {alert.expires_plain ? <T size={11} c={color.dim}>{`· ${alert.expires_plain}`}</T> : null}
          {quoteFreshness}
        </View>

        <Scorecard components={alert.score_components} />

        {alert.kai_interpretation ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <KaiOrb size={16} glow={false} />
            <T size={12.5} lh={18} c={color.muted} style={{ flex: 1 }} testID="kai-interpretation">
              {alert.kai_interpretation}
            </T>
          </View>
        ) : null}
        {alert.fit_plain ? <T size={11.5} lh={17} c={color.muted}>{alert.fit_plain}</T> : null}
        {alert.community_plain ? <T size={11} lh={16} c={color.dim}>{alert.community_plain}</T> : null}
      </ObjectCard>

      <ObjectCard r={radius.xl} style={{ padding: 14, gap: 9 }} testID="alert-condition">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T size={12} weight="bold" style={{ flex: 1 }}>Alert condition</T>
          {alert.condition_met ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Check size={10} color={color.green} strokeWidth={3} />
              <T size={10} c={color.green}>Triggered</T>
            </View>
          ) : (
            <T size={10} c={color.gold}>Watching</T>
          )}
        </View>
        {alert.condition ? <T size={13} lh={19}>{alert.condition}</T> : null}
        {alert.events.length ? (
          <View style={{ gap: 5, paddingTop: 7, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 }}>
            {alert.events.map((e, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <T size={11} c={e.tone === 'good' ? color.gold : color.muted} style={{ flex: 1 }}>{e.label}</T>
                {e.at ? <Num size={11} weight="regular" c={color.dim}>{e.at}</Num> : null}
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, paddingTop: 2 }}>
          <View style={{ flex: 1 }}>
            <Button label={alert.primary_action?.label ?? 'Review trade'} height={40} testID="alert-primary" onPress={onPrimary} />
          </View>
          <Button label="Ask Kai why" kind="kai" height={40} testID="alert-ask-why" onPress={onAskWhy} />
        </View>
      </ObjectCard>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Plan panel                                                           */
/* ------------------------------------------------------------------ */

export function PlanPanel({ plan, symbol, onAction, onAskKai }: {
  plan: PortalPlan | null; symbol: string; onAction: (route: string) => void; onAskKai: () => void;
}) {
  if (!plan || plan.empty_plain) {
    return (
      <View testID="panel-plan" style={{ gap: 11 }}>
        <ObjectCard r={radius.xl} style={{ padding: 16, gap: 6 }}>
          <T size={15} weight="bold">No plan yet</T>
          <T size={13} lh={19} c={color.muted}>
            {plan?.empty_plain ?? `Kai has no entry, stop or target for ${symbol} at the moment.`}
          </T>
        </ObjectCard>
        <Button
          label="Build a plan"
          height={48}
          testID="plan-build"
          onPress={() => onAction(plan?.action?.route ?? `/plan/new?symbol=${encodeURIComponent(symbol)}`)}
        />
      </View>
    );
  }

  const cap = plan.daily_cap;
  const pct = cap && cap.cap ? Math.min(1, (cap.used ?? 0) / cap.cap) : 0;

  return (
    <View testID="panel-plan" style={{ gap: 11 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { label: 'Entry', v: plan.entry, c: color.cyan, bg: color.cyanTint, bd: alpha.cyan40 },
          { label: 'Target', v: plan.targets[0] ?? null, c: color.green, bg: color.greenTint, bd: alpha.green40 },
          { label: 'Stop', v: plan.stop, c: color.red, bg: color.redTint, bd: alpha.red40 },
        ].map((t) => (
          <View key={t.label} style={{ flex: 1, paddingVertical: 11, borderRadius: radius.lg, backgroundColor: t.bg, borderWidth: 0.5, borderColor: t.bd, alignItems: 'center' }}>
            <T size={10} c={color.muted}>{t.label}</T>
            <Num size={16} weight="semibold" c={t.c}>{t.v != null ? String(t.v) : '—'}</Num>
          </View>
        ))}
      </View>

      {plan.size_plain ? <T size={12.5} lh={18} c={color.muted} testID="plan-size">{plan.size_plain}</T> : null}
      {plan.rr ? (
        <T size={12.5} lh={18} c={color.muted} testID="plan-rr">
          {/^[\d.]+\s*:\s*1$/.test(plan.rr) ? `${plan.rr} reward to risk` : plan.rr}
        </T>
      ) : null}

      {cap ? (
        <View style={{ gap: 5 }} testID="plan-daily-cap">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={11} c={color.muted}>Daily risk used</T>
            <Num size={11} weight="regular" c={color.muted}>{`$${(cap.used ?? 0).toFixed(0)} of $${(cap.cap ?? 0).toFixed(0)}`}</Num>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: alpha.ivory08, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: pct > 0.8 ? color.red : color.volt }} />
          </View>
        </View>
      ) : null}

      <T size={11} lh={16} c={color.dim}>
        {plan.stop_attaches_plain ?? 'The stop attaches as a paper leg when the entry fills. Paper orders only — fills use delayed prices.'}
      </T>

      {plan.action ? (
        <Button label={plan.action.label} height={48} arrow testID="plan-primary" onPress={() => onAction(plan.action!.route)} />
      ) : null}
      <Button label="Ask Kai to check this" kind="kai" height={42} testID="plan-ask-kai" onPress={onAskKai} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Community panel                                                      */
/* ------------------------------------------------------------------ */

export function CommunityPanel({
  community, symbol, onOpenCircle,
}: { community: PortalCommunity | null; symbol: string; onOpenCircle: () => void }) {
  if (!community) {
    return (
      <View testID="panel-community">
        <T size={12.5} lh={18} c={color.muted}>{`No one has posted about ${symbol} yet.`}</T>
      </View>
    );
  }
  return (
    <View testID="panel-community" style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Num size={11} weight="bold" c={color.cyan}>{`$${symbol}`}</Num>
        <T size={11} c={color.dim} style={{ flex: 1 }}>
          {[community.message_count != null ? `${community.message_count} messages today` : null,
            community.bullish_pct != null ? `${community.bullish_pct}% bullish` : null]
            .filter(Boolean).join(' · ')}
        </T>
        {community.circle_id || community.room_id ? (
          <Pressable
            testID="open-circle"
            accessibilityRole="button"
            accessibilityLabel="Open the circle for this symbol"
            onPress={onOpenCircle}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <T size={11} weight="semibold" c={color.violetLight}>Open circle ›</T>
          </Pressable>
        ) : null}
      </View>

      {community.summary ? (
        <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
          <KaiOrb size={17} glow={false} />
          <T size={12} lh={17} c={color.muted} style={{ flex: 1 }} testID="community-summary">{community.summary}</T>
        </View>
      ) : null}

      {community.common_level != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} testID="community-level">
          <T size={11.5} c={color.muted}>Most-mentioned level</T>
          <Num size={12} weight="semibold" c={color.cyan}>{community.common_level.toFixed(2)}</Num>
        </View>
      ) : null}

      {community.claims.length ? (
        <View style={{ gap: 7 }} testID="community-claims">
          {community.claims.map((c, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Check size={12} color={c.verdict === 'verified' ? color.green : color.muted} strokeWidth={2.6} />
              <T size={12} lh={17} c={color.muted} style={{ flex: 1 }}>{c.plain || c.claim}</T>
            </View>
          ))}
        </View>
      ) : null}

      {community.label_plain ? (
        <T size={10.5} lh={15} c={color.dim} testID="community-label">{community.label_plain}</T>
      ) : null}

      {community.messages.map((m) => (
        <View key={m.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          {m.is_kai ? <KaiOrb size={28} /> : (
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: alpha.chip85, borderWidth: 0.5, borderColor: alpha.ivory14, alignItems: 'center', justifyContent: 'center' }}>
              <T size={11} weight="bold">{m.initial}</T>
            </View>
          )}
          <View style={{ flex: 1, ...(m.is_kai ? { borderLeftWidth: 2, borderLeftColor: alpha.violet50, paddingLeft: 10 } : null) }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <T size={12.5} weight="bold" c={m.is_kai ? color.violetLight : color.text}>{m.author}</T>
              {m.is_kai ? (
                <View style={{ paddingHorizontal: 5, borderRadius: 4, borderWidth: 0.5, borderColor: alpha.violet50 }}>
                  <T size={8.5} weight="bold" c={color.violetLight}>AI</T>
                </View>
              ) : null}
              {m.role ? <T size={9} c={color.dim}>{m.role}</T> : null}
              {m.at ? <T size={9.5} c={color.dim}>{m.at}</T> : null}
            </View>
            <T size={13.5} lh={19} style={{ marginTop: 2 }}>{m.body}</T>
            {m.verified_plain ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
                <Check size={10} color={color.green} strokeWidth={3} />
                <T size={10.5} c={color.green}>{m.verified_plain}</T>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Execution object — pending order / open position                     */
/* ------------------------------------------------------------------ */

export function ExecutionObject({
  execution, portal, onAction, onAskKai,
}: {
  execution: PortalExecution;
  portal: TradePortal;
  onAction: (route: string) => void;
  onAskKai: () => void;
}) {
  const o = execution.order;
  const p = execution.position;
  if (!o && !p && !execution.action) return null;

  if (o) {
    return (
      <ObjectCard tone="gold" r={radius.xxl} style={{ padding: 15, gap: 10 }} testID="execution-order-pending">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <T size={12} weight="bold" c={color.gold} style={{ flex: 1 }}>
            {`Order pending · ${o.side_label} ${o.limit_price != null ? `limit ${money(o.limit_price)}` : 'market'}`}
          </T>
          <StatusDot c={color.gold} />
          <T size={11} c={color.gold}>{o.status_label}</T>
        </View>
        <T size={12.5} lh={18} c={color.muted}>
          {o.status_detail ?? `${shareLabel(o.qty)} · not filled yet. The stop and target attach as paper legs on fill.`}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <KaiOrb size={16} glow={false} />
          <T size={12} c={color.violetLight} style={{ flex: 1 }}>
            Watching your order, not a position yet — I&apos;ll tell you the moment it fills.
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="Manage order" height={42} testID="manage-order" onPress={() => onAction(`/order/${encodeURIComponent(o.id)}`)} />
          </View>
          <Button label="Ask Kai" kind="kai" height={42} onPress={onAskKai} />
        </View>
      </ObjectCard>
    );
  }

  if (p) {
    const stop = p.stop ?? 0;
    const target = p.target ?? 0;
    const now = p.mark_price ?? 0;
    const span = target - stop;
    const pos = span > 0 ? Math.max(0, Math.min(1, (now - stop) / span)) : 0.5;
    return (
      <ObjectCard tone="volt" r={radius.xxl} style={{ padding: 15, gap: 10 }} testID="execution-position">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <T size={12} weight="bold" c={color.green} style={{ flex: 1 }}>
            {`Position open · ${p.side === 'short' ? 'Short' : 'Long'} ${p.notional != null ? money(p.notional, 0) : shareLabel(p.qty)}`}
          </T>
          <StatusDot c={p.health === 'at_risk' ? color.gold : color.green} />
          <T size={11} c={p.health === 'at_risk' ? color.gold : color.green}>{p.health_label}</T>
        </View>
        <View style={{ gap: 4 }}>
          <View style={{ height: 7, borderRadius: 4, backgroundColor: alpha.ivory08 }}>
            <View style={{ width: `${Math.round(pos * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: color.cyan }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Num size={10} weight="regular" c={color.red}>{`Stop ${p.stop ?? '—'}`}</Num>
            <Num size={10} weight="regular" c={color.muted}>{`now ${p.mark_price?.toFixed(2) ?? '—'}`}</Num>
            <Num size={10} weight="regular" c={color.green}>{`Target ${p.target ?? '—'}`}</Num>
          </View>
        </View>
        {p.kai_line ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <KaiOrb size={16} glow={false} />
            <T size={12} c={color.violetLight} style={{ flex: 1 }}>{p.kai_line}</T>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="Manage position" height={42} testID="manage-position" onPress={() => onAction(`/position/${encodeURIComponent(p.id)}`)} />
          </View>
          <Button label="Ask Kai" kind="kai" height={42} onPress={onAskKai} />
        </View>
      </ObjectCard>
    );
  }

  const a = execution.action!;
  return (
    <ObjectCard tone="gold" r={radius.xxl} style={{ padding: 14, gap: 9 }} testID="execution-cta">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <GradeChip grade={portal.alert?.grade_display ?? null} />
        <T size={12} weight="bold" style={{ flex: 1 }}>{`${portal.symbol} · ${execution.label}`}</T>
      </View>
      {execution.detail_plain ? <T size={11.5} lh={17} c={color.muted}>{execution.detail_plain}</T> : null}
      <Button label={a.label} height={42} testID="execution-primary" onPress={() => onAction(a.route)} />
    </ObjectCard>
  );
}

export function PortalNotice({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start', paddingTop: 2 }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.dim, marginTop: 6 }} />
      <T size={10.5} lh={15} c={color.dim} style={{ flex: 1 }} testID="portal-notice">{text}</T>
    </View>
  );
}

export { ArrowRight, Eyebrow, FreshnessMark };
