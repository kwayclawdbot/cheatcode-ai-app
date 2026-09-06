import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sheet } from '../../ui/Sheet';
import { T } from '../../ui/Text';
import { Bolt, ChevronDown, Check } from '../../ui/Icons';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { modeBadge, modeIsLive } from '../nav/second-tab';
import type { GoalMode } from '../../lib/types';

export const MODE_LABEL: Record<GoalMode, string> = {
  day_trade: 'Day Trade',
  swing: 'Swing',
  invest: 'Invest',
};

/**
 * Audit §10: mode is hidden complexity today. It has to be VISIBLE global
 * context, and switching it has to say out loud what it changes — the briefing,
 * the opportunity horizon, the default room, the chart timeframe and the risk
 * language. These three lines are exactly those five things, plus the sixth
 * that arrived with the research desk: in Invest, the second tab stops being
 * alerts and becomes the desk.
 */
const MODE_EFFECT: Record<GoalMode, string> = {
  // Day Trade is archived as coming soon (see nav/second-tab.ts). The line has
  // to describe what picking it ACTUALLY does today, which is not "same-day
  // ideas" — there are none — but a tab that says so. When DAY_TRADE_LIVE
  // flips, `MODE_EFFECT_DAY_TRADE_LIVE` below is what it goes back to saying.
  day_trade: 'Not live yet · the tab says so and nothing is deleted · Swing is running today',
  swing: 'Multi-day ideas · daily charts · #swing-ideas · risk measured per position',
  // Invest also changes what the second tab IS — it becomes the research desk
  // instead of today's alerts. That is the one effect a person can see from
  // the moment the sheet closes, so it is named here.
  invest: 'Long-horizon ideas · weekly charts · the research desk on your second tab · risk measured per portfolio',
};

/** What Day Trade says again the moment the same-day picker is publishing. */
export const MODE_EFFECT_DAY_TRADE_LIVE =
  'Same-day ideas · 5-minute charts · #market-open · risk measured per trade';

const MODES: GoalMode[] = ['day_trade', 'swing', 'invest'];

/**
 * The marker on a mode that is not live. A pill, hairline only — it is a label
 * on a choice, not a call to action, so it never carries volt.
 *
 * Exported because onboarding draws the same marker on the same modes, and two
 * copies of it is two things to keep in step.
 */
export function ComingSoonPill({ label, testID }: { label: string; testID?: string }) {
  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: 7, paddingVertical: 2,
        borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory14,
      }}
    >
      <T size={9} weight="bold" c={color.dim} ls={0.6}>{label}</T>
    </View>
  );
}

/**
 * The global mode chip. Tapping it opens the mode sheet.
 * Volt, because changing mode is a USER action.
 * Exported so MOBILE-B can drop the identical chip on Trade.
 */
export function ModeChip({ mode, onPress, testID = 'mode-chip' }: { mode: GoalMode; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Mode: ${MODE_LABEL[mode]}`}
      accessibilityHint="Change how Kai reads the market for you"
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <LinearGradient
        colors={gradient.modeChip as unknown as readonly [string, string, ...string[]]}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          height: 32, paddingHorizontal: 13, borderRadius: radius.pill,
          borderWidth: 0.5, borderColor: alpha.volt55,
        }}
      >
        <Bolt size={12} color={color.volt} />
        <T size={12} weight="semibold" c={color.volt}>{MODE_LABEL[mode]}</T>
        <ChevronDown size={9} color={color.volt} />
      </LinearGradient>
    </Pressable>
  );
}

/**
 * The mode sheet. `PUT /mode` is the source of truth; the local profile is
 * patched so every screen re-reads its data in the new mode immediately.
 * Exported from `src/features/home/ModeSheet.tsx` so Trade reuses this exact
 * component rather than growing a second one (cross-lane contract).
 */
export function ModeSheet({
  visible, onClose, mode, onChanged,
}: { visible: boolean; onClose: () => void; mode: GoalMode; onChanged?: (m: GoalMode) => void }) {
  const { patchProfile } = useSession();
  const [busy, setBusy] = useState<GoalMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(async (m: GoalMode) => {
    if (m === mode) { onClose(); return; }
    setBusy(m);
    setError(null);
    try {
      if (api.available()) await api.setMode(m);
      await patchProfile({ primary_mode: m });
      onChanged?.(m);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }, [mode, onClose, onChanged, patchProfile]);

  return (
    <Sheet visible={visible} onClose={onClose} title="How should Kai read the market?" testID="sheet-mode">
      <T size={12} lh={18} c={color.muted}>
        This changes your briefing, what your second tab shows, which opportunities Kai surfaces,
        your default room, the chart timeframe and how risk is described.
      </T>

      <View style={{ gap: 8, marginTop: 4 }}>
        {MODES.map((m) => {
          const active = m === mode;
          return (
            <Pressable
              key={m}
              testID={`mode-option-${m}`}
              accessibilityRole="button"
              accessibilityLabel={MODE_LABEL[m]}
              accessibilityState={{ selected: active, busy: busy === m }}
              disabled={!!busy}
              onPress={() => { void choose(m); }}
              style={({ pressed }) => ({
                borderRadius: radius.xl,
                borderWidth: active ? 1 : 0.5,
                borderColor: active ? alpha.volt60 : alpha.ivory14,
                backgroundColor: active ? alpha.volt08 : 'transparent',
                paddingVertical: 12,
                paddingHorizontal: 14,
                gap: 4,
                opacity: pressed || busy === m ? 0.8 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T size={15} weight="bold" c={active ? color.volt : modeIsLive(m) ? color.text : color.muted}>{MODE_LABEL[m]}</T>
                {modeBadge(m) ? <ComingSoonPill label={modeBadge(m) as string} testID={`mode-soon-${m}`} /> : null}
                {active ? <Check size={14} color={color.volt} strokeWidth={2.6} /> : null}
              </View>
              <T size={12} lh={17} c={color.muted}>{MODE_EFFECT[m]}</T>
            </Pressable>
          );
        })}
      </View>

      {error ? <T size={11} c={color.red}>{error}</T> : null}
      {!modeIsLive('day_trade') ? (
        <T size={11} lh={16} c={color.dim} testID="mode-sheet-day-trade-note">
          Day Trade is still here and so is everything it has ever sent — the same-day picker is
          being reworked, so Kai is not calling intraday trades while that is in hand. Picking it
          shows you that, and nothing else changes.
        </T>
      ) : null}
      {mode === 'invest' ? (
        <T size={11} lh={16} c={color.dim}>
          Your second tab becomes the research desk — every name the desk argued for, and why.
          Kai placing trades for you arrives in a later release; grading, alerts and paper practice work today.
        </T>
      ) : null}
    </Sheet>
  );
}

/**
 * Short names, for the segmented control ONLY.
 *
 * "Day Trade · Swing · Invest" is 130pt of text before any padding, and a
 * 390pt header also has to hold a title and two icon buttons. The segment says
 * "Day"; the screen reader still says "Day Trade", and the sheet — where there
 * is room to explain what each one changes — still says it in full.
 */
const SHORT_LABEL: Record<GoalMode, string> = {
  day_trade: 'Day',
  swing: 'Swing',
  invest: 'Invest',
};

/**
 * The mode control as a compact segmented bar, sized to sit INSIDE a header
 * row between the icon buttons (owner, 6 Sept). Same three modes and the same
 * write path as the sheet: `PUT /mode` is the truth, the local profile is
 * patched so every screen re-reads in the new mode at once. This is a second
 * SHAPE for the control, not a second source of truth.
 *
 * A mode that is not live yet is still offered — archived, not removed — it
 * just reads dim until you pick it, exactly as it does in the sheet.
 */
export function ModeSegmented({ mode, onChanged, testID = 'mode-segmented' }: {
  mode: GoalMode; onChanged?: (m: GoalMode) => void; testID?: string;
}) {
  const { patchProfile } = useSession();
  const [busy, setBusy] = useState<GoalMode | null>(null);

  const choose = useCallback(async (m: GoalMode) => {
    if (m === mode || busy) return;
    setBusy(m);
    try {
      if (api.available()) await api.setMode(m);
      await patchProfile({ primary_mode: m });
      onChanged?.(m);
    } catch {
      // Nothing to say in a header this small. The control simply stays on the
      // mode that is still true, rather than showing a switch that did not take.
    } finally {
      setBusy(null);
    }
  }, [mode, busy, onChanged, patchProfile]);

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel="How Kai reads the market"
      style={{
        flexDirection: 'row', alignItems: 'center', padding: 2,
        borderRadius: radius.pill, backgroundColor: color.surface2,
        borderWidth: 0.5, borderColor: alpha.ivory10,
      }}
    >
      {MODES.map((m) => {
        const active = m === mode;
        return (
          <Pressable
            key={m}
            testID={`mode-seg-${m}`}
            accessibilityRole="tab"
            accessibilityLabel={MODE_LABEL[m]}
            accessibilityHint="Changes how Kai reads the market for you"
            accessibilityState={{ selected: active, busy: busy === m }}
            disabled={!!busy}
            onPress={() => { void choose(m); }}
            style={({ pressed }) => ({
              height: 24, paddingHorizontal: 9, borderRadius: radius.pill,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: active ? alpha.volt14 : 'transparent',
              borderWidth: active ? 0.5 : 0,
              borderColor: active ? alpha.volt55 : 'transparent',
              opacity: pressed || busy === m ? 0.7 : 1,
            })}
          >
            <T
              size={10.5}
              weight={active ? 'bold' : 'regular'}
              c={active ? color.volt : modeIsLive(m) ? color.muted : color.dim}
            >
              {SHORT_LABEL[m]}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Chip + sheet as one unit; the common case on Home and Trade. */
export function ModeControl({ mode, onChanged, testID }: { mode: GoalMode; onChanged?: (m: GoalMode) => void; testID?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ModeChip mode={mode} onPress={() => setOpen(true)} testID={testID} />
      <ModeSheet visible={open} onClose={() => setOpen(false)} mode={mode} onChanged={onChanged} />
    </>
  );
}
