/**
 * Trade plan — V3-T1-Trade-plan.html, shared by `/plan/new` and `/plan/[id]`.
 *
 * The plan is where the numbers get decided, calmly, before any order exists:
 * how much, where in, where out if it works, where out if it doesn't, and what
 * that costs against today's cap.
 *
 * Two deliberate departures from the board, both required by the round-3 brief:
 *   · the primary is a BUTTON labelled "Review order", not a slide-to-confirm —
 *     a slide is not reachable with a screen reader or a keyboard, and this
 *     screen does not send anything anyway;
 *   · the quote line prints the real freshness (delayed on this data plan)
 *     rather than the board's "1s".
 */
import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';
import { Segmented } from '../../ui/Segmented';
import { alpha, color, radius } from '../../ui/tokens';
import { openKaiSheet } from '../kai-sheet';
import {
  BackButton, KaiLine, LevelTile, PaperChip, QuoteLine, RiskBar, ScenarioTile, money, signedMoney,
} from '../trade/components';
import type { ExitStyle, Plan } from './types';

type EditKind = 'entry' | 'target' | 'stop' | 'size';

const EDIT_COPY: Record<EditKind, { title: string; label: string; help: string }> = {
  entry: { title: 'Where do you get in?', label: 'Entry price', help: 'The price you are willing to pay. Above it, you are chasing.' },
  target: { title: 'Where do you take it off?', label: 'Target price', help: 'The price that makes this worth doing. Decide it now, not while it is moving.' },
  stop: { title: 'Where are you wrong?', label: 'Stop price', help: 'The price that says the idea failed. This is the number that caps the loss.' },
  size: { title: 'How much?', label: 'Amount in dollars', help: 'Kai sizes this from your risk rules, but the decision is yours.' },
};

function BackRow({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
        paddingTop: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: alpha.ivory07,
      }}
    >
      <BackButton onPress={onBack} />
      <T size={16} weight="bold" align="center" style={{ flex: 1 }}>{title}</T>
      <PaperChip />
    </View>
  );
}

export function PlanView({
  plan, onChange, onReview, onCancel, busy, notice, testID = 'screen-plan',
}: {
  plan: Plan;
  onChange: (next: Plan) => void;
  onReview: () => void;
  onCancel: () => void;
  busy?: boolean;
  notice?: string | null;
  testID?: string;
}) {
  const [edit, setEdit] = useState<EditKind | null>(null);
  const [draft, setDraft] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  /** Until the user changes a number, the SERVER's scenarios are the truth. */
  const [edited, setEdited] = useState(false);

  const target = plan.targets[0] ?? null;

  /**
   * Scenarios are recomputed locally whenever the user edits a number, so the
   * "if it works / if it fails" tiles never lag the levels above them. The
   * server's own numbers win until something is edited.
   */
  const scenarios = useMemo(() => {
    const shares = plan.size_shares
      ?? (plan.size_notional != null && plan.entry ? plan.size_notional / plan.entry : null);
    if (!edited || shares == null || plan.entry == null) return { up: plan.if_target, down: plan.if_stopped };
    const dir = plan.side === 'short' ? -1 : 1;
    return {
      up: target != null ? (target - plan.entry) * dir * shares : plan.if_target,
      down: plan.stop != null ? -Math.abs((plan.entry - plan.stop) * shares) : plan.if_stopped,
    };
  }, [edited, plan.size_shares, plan.size_notional, plan.entry, plan.stop, plan.side, plan.if_target, plan.if_stopped, target]);

  const openEdit = (kind: EditKind) => {
    setEditError(null);
    const current = kind === 'entry' ? plan.entry
      : kind === 'target' ? target
        : kind === 'stop' ? plan.stop
          : plan.size_notional;
    setDraft(current != null ? String(current) : '');
    setEdit(kind);
  };

  const saveEdit = () => {
    const v = Number(draft);
    if (!edit || !Number.isFinite(v) || v <= 0) { setEditError('That needs to be a number.'); return; }
    const next: Plan = { ...plan };
    if (edit === 'entry') next.entry = v;
    if (edit === 'target') next.targets = [v, ...plan.targets.slice(1)];
    if (edit === 'stop') next.stop = v;
    if (edit === 'size') {
      next.size_notional = v;
      next.size_shares = next.entry ? v / next.entry : null;
    }
    if (next.entry != null && next.size_notional != null) next.size_shares = next.size_notional / next.entry;
    setEdited(true);
    onChange(next);
    setEdit(null);
  };

  const capExceeded =
    plan.daily_cap.cap != null && scenarios.down != null
    && Math.abs(scenarios.down) + (plan.daily_cap.used ?? 0) > plan.daily_cap.cap;

  const sized = (plan.size_notional ?? 0) > 0 || (plan.size_shares ?? 0) > 0;
  const ready = plan.entry != null && plan.stop != null && sized;

  return (
    <Screen variant="dome" layout="tab" testID={testID}>
      <BackRow
        title={`${plan.side === 'short' ? 'Short' : 'Buy'} ${plan.symbol}`}
        onBack={onCancel}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* The size, as a decision, big. */}
        <Pressable
          testID="edit-size"
          accessibilityRole="button"
          accessibilityLabel="Change how much"
          onPress={() => openEdit('size')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 44 }}
        >
          <Num size={32} weight="semibold" testID="plan-size">
            {sized && plan.size_notional != null ? money(plan.size_notional, 0) : '—'}
          </Num>
          <T size={12} c={color.muted} lh={17}>
            {`${plan.entry != null ? `limit ${plan.entry.toFixed(2)}` : 'no entry yet'}\n${plan.size_shares != null && plan.size_shares % 1 !== 0 ? 'fractional' : 'shares'}`}
          </T>
        </Pressable>

        {!sized ? (
          <T size={12} c={color.gold} lh={17} align="center" testID="needs-size">
            {plan.size_plain
              ? `${plan.size_plain} Tap the amount to decide it yourself.`
              : 'Tap the amount to say how much of this you want.'}
          </T>
        ) : null}

        {/* Entry · Target · Stop */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={{ flex: 1 }} testID="edit-entry" accessibilityRole="button" accessibilityLabel="Change entry" onPress={() => openEdit('entry')}>
            <LevelTile label="Entry" value={plan.entry != null ? String(plan.entry) : '—'} tone="entry" testID="tile-entry" />
          </Pressable>
          <Pressable style={{ flex: 1 }} testID="edit-target" accessibilityRole="button" accessibilityLabel="Change target" onPress={() => openEdit('target')}>
            <LevelTile label="Target" value={target != null ? String(target) : '—'} tone="target" testID="tile-target" />
          </Pressable>
          <Pressable style={{ flex: 1 }} testID="edit-stop" accessibilityRole="button" accessibilityLabel="Change stop" onPress={() => openEdit('stop')}>
            <LevelTile label="Stop" value={plan.stop != null ? String(plan.stop) : '—'} tone="stop" testID="tile-stop" />
          </Pressable>
        </View>

        {/* What each end of it is worth, in dollars. */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ScenarioTile
            label="If target hits"
            value={sized && scenarios.up != null ? `≈ ${signedMoney(scenarios.up, 0)}` : '—'}
            tone="up"
            testID="scenario-up"
          />
          <ScenarioTile
            label="If stopped"
            value={sized && scenarios.down != null ? signedMoney(scenarios.down, 0) : '—'}
            tone="down"
            testID="scenario-down"
          />
        </View>

        {plan.daily_cap.cap != null ? (
          <RiskBar label="Daily cap" used={plan.daily_cap.used} cap={plan.daily_cap.cap} testID="daily-cap" />
        ) : null}
        {capExceeded ? (
          <T size={11} c={color.gold} lh={16} testID="cap-warning">
            This one would take you past today&apos;s cap. That is the point of the cap.
          </T>
        ) : null}

        <KaiLine
          text={
            plan.exit_style === 'alert_assisted'
              ? "I'll watch the stop and warn you before it hits — the exit is your tap."
              : "Stop attaches automatically. I'll warn you before it hits."
          }
          testID="stop-copy"
        />
        <Segmented
          options={[
            { key: 'auto', label: 'Exit for me' },
            { key: 'alert_assisted', label: 'Warn me, I tap' },
          ] as { key: ExitStyle; label: string }[]}
          value={plan.exit_style}
          onChange={(k) => onChange({ ...plan, exit_style: k })}
          testID="exit-style"
        />

        <QuoteLine quote={plan.quote} note="expires if price moves" testID="plan-quote" />

        {plan.order_state ? (
          <>
            <Eyebrow>WHERE THIS STANDS</Eyebrow>
            <T size={12} c={color.muted} lh={17}>{plan.order_state}</T>
          </>
        ) : null}
        {notice ? <T size={12} c={color.gold} lh={17} testID="plan-notice">{notice}</T> : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 28, gap: 8 }}>
        <Button
          label="Review order"
          onPress={onReview}
          disabled={!ready}
          loading={busy}
          height={56}
          size={16}
          testID="cta-review-order"
          accessibilityHint="Prices the order and shows Kai's risk check. Nothing is sent yet."
        />
        <Pressable
          testID="ask-kai"
          accessibilityRole="button"
          accessibilityLabel="Ask Kai about this plan"
          onPress={() => openKaiSheet({ context: { kind: 'symbol', id: plan.id ?? undefined, symbol: plan.symbol } })}
          style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}
        >
          <T size={12} weight="semibold" c={color.violetLight}>Ask Kai about this plan</T>
        </Pressable>
        <Pressable
          testID="cta-cancel"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onCancel}
          style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}
        >
          <T size={12} c={color.muted}>Cancel</T>
        </Pressable>
      </View>

      <Sheet visible={edit != null} onClose={() => setEdit(null)} title={edit ? EDIT_COPY[edit].title : ''} testID="plan-edit-sheet">
        {edit ? <T size={13} c={color.muted} lh={19}>{EDIT_COPY[edit].help}</T> : null}
        <Field
          label={edit ? EDIT_COPY[edit].label : ''}
          testID="plan-edit-input"
          value={draft}
          onChangeText={setDraft}
          keyboardType="decimal-pad"
          placeholder="0.00"
          error={editError}
        />
        <Button label="Save" onPress={saveEdit} testID="plan-edit-save" />
      </Sheet>
    </Screen>
  );
}
