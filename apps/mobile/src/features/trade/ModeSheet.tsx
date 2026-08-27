/**
 * Mode as visible global context (audit §6) — the Trade half.
 *
 * Cross-lane note: lane MOBILE-A is exporting a shared `ModeSheet` from
 * `src/features/home/ModeSheet.tsx`. Until it lands, this is the local sheet the
 * round-3 brief sanctions ("else a local sheet calling PUT /mode"). It writes
 * through the same endpoint and the same profile patch, so switching here and
 * switching on Home are the same act — swapping to A's component later is one
 * import.
 */
import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sheet } from '../../ui/Sheet';
import { T } from '../../ui/Text';
import { Bolt, Check } from '../../ui/Icons';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import type { GoalMode } from '../../lib/types';

export const MODE_LABEL: Record<GoalMode, string> = {
  day_trade: 'Day Trade',
  swing: 'Swing',
  invest: 'Invest',
};

/** What actually changes when you switch — stated, not implied. */
const MODE_EFFECT: Record<GoalMode, string> = {
  day_trade: 'Intraday charts, same-day ideas, tighter stops, and a daily loss cap that matters today.',
  swing: 'Multi-day charts, ideas that need days to work, wider stops, risk measured across the week.',
  invest: 'Long charts, position ideas measured in months, and language about businesses rather than levels.',
};

export function ModeChip({ mode, onPress, testID = 'mode-chip' }: { mode: GoalMode; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Mode: ${MODE_LABEL[mode]}. Change it.`}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <LinearGradient
        colors={gradient.modeChip as unknown as readonly [string, string]}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, height: 32,
          paddingHorizontal: 13, borderRadius: radius.pill,
          borderWidth: 0.5, borderColor: alpha.volt55,
        }}
      >
        <Bolt size={11} color={color.volt} />
        <T size={12} weight="semibold" c={color.volt}>{MODE_LABEL[mode]}</T>
      </LinearGradient>
    </Pressable>
  );
}

export function ModeSheet({
  visible, mode, onClose,
}: { visible: boolean; mode: GoalMode; onClose: () => void }) {
  const { patchProfile } = useSession();
  const [busy, setBusy] = useState<GoalMode | null>(null);

  const choose = async (m: GoalMode) => {
    if (m === mode) { onClose(); return; }
    setBusy(m);
    try {
      await patchProfile({ primary_mode: m });
      if (api.available()) await api.setMode(m);
    } catch {
      /* the profile write already carried it; the next load reconciles */
    } finally {
      setBusy(null);
      onClose();
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="How are you trading today?" testID="mode-sheet">
      <T size={13} c={color.muted} lh={19}>
        This changes what Kai looks for, how far out the ideas reach, which chart you land on and how risk is worded.
      </T>
      {(['day_trade', 'swing', 'invest'] as GoalMode[]).map((m) => {
        const on = m === mode;
        return (
          <Pressable
            key={m}
            testID={`mode-option-${m}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={MODE_LABEL[m]}
            onPress={() => choose(m)}
            style={{ opacity: busy && busy !== m ? 0.5 : 1 }}
          >
            <LinearGradient
              colors={(on ? gradient.voltPanel : gradient.panel) as unknown as readonly [string, string, string]}
              locations={(on ? gradient.voltPanelLocations : gradient.panelLocations) as unknown as readonly [number, number, number]}
              start={gradientAngle.start}
              end={gradientAngle.end}
              style={{
                borderRadius: radius.xl, padding: 14, gap: 4, minHeight: 44,
                borderWidth: on ? 1 : 0.5, borderColor: on ? alpha.volt60 : alpha.ivory16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T size={15} weight="bold" c={on ? color.volt : color.text} style={{ flex: 1 }}>{MODE_LABEL[m]}</T>
                {on ? <Check size={15} color={color.volt} /> : null}
              </View>
              <T size={12} c={color.muted} lh={17}>{MODE_EFFECT[m]}</T>
            </LinearGradient>
          </Pressable>
        );
      })}
    </Sheet>
  );
}
