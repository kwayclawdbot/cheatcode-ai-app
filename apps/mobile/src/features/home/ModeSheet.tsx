import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sheet } from '../../ui/Sheet';
import { T } from '../../ui/Text';
import { Bolt, ChevronDown, Check } from '../../ui/Icons';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
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
  day_trade: 'Same-day ideas · 5-minute charts · #market-open · risk measured per trade',
  swing: 'Multi-day ideas · daily charts · #swing-ideas · risk measured per position',
  // Invest also changes what the second tab IS — it becomes the research desk
  // instead of today's alerts. That is the one effect a person can see from
  // the moment the sheet closes, so it is named here.
  invest: 'Long-horizon ideas · weekly charts · the research desk on your second tab · risk measured per portfolio',
};

const MODES: GoalMode[] = ['day_trade', 'swing', 'invest'];

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
                <T size={15} weight="bold" c={active ? color.volt : color.text}>{MODE_LABEL[m]}</T>
                {active ? <Check size={14} color={color.volt} strokeWidth={2.6} /> : null}
              </View>
              <T size={12} lh={17} c={color.muted}>{MODE_EFFECT[m]}</T>
            </Pressable>
          );
        })}
      </View>

      {error ? <T size={11} c={color.red}>{error}</T> : null}
      {mode === 'invest' ? (
        <T size={11} lh={16} c={color.dim}>
          Your second tab becomes the research desk — every name the desk argued for, and why.
          Kai placing trades for you arrives in a later release; grading, alerts and paper practice work today.
        </T>
      ) : null}
    </Sheet>
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
