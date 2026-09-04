/**
 * THE SPINE — look at it, decide, take it.
 *
 * The old Trade Portal put a top bar, a context switcher, a timeframe rail, two
 * sheets and five panels on one screen. None of them was wrong. All of them were
 * equally loud, at the same time, which is the same thing as having no order at
 * all: a person opening it could not tell what they were supposed to do next.
 *
 * This is that order, made visible. Three beats, numbered, and exactly one of
 * them is the screen at any moment (War Room UX pillar 3: "One thing visible at
 * a time on mobile. Don't stack five panels.").
 *
 * IT IS NOT A TAB BAR. Tabs are peers; these are steps, and step three is not
 * always available — a symbol with no invalidation level has nothing to take, so
 * Take is legibly locked with the reason underneath rather than tappable and
 * disappointing. The numeral, the rule and the weight carry the state; no chips,
 * no boxes, no rounded rectangles pretending to be buttons.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T } from '../../ui/Text';
import { alpha, color } from '../../ui/tokens';
import { BEATS, BEAT_LABEL, BEAT_STEP, type Beat } from './read';

export function Spine({
  value, onChange, lockedTake, testID = 'portal2-spine',
}: {
  value: Beat;
  onChange: (b: Beat) => void;
  /** Why Take cannot be reached, or null when it can. */
  lockedTake: string | null;
  testID?: string;
}) {
  const index = BEATS.indexOf(value);
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 10, gap: 8 }}
    >
      {BEATS.map((b, i) => {
        const active = b === value;
        const done = i < index;
        const locked = b === 'take' && Boolean(lockedTake);
        const tint = locked ? color.dim : active ? color.text : done ? color.muted : color.dim;
        return (
          <React.Fragment key={b}>
            {i > 0 ? (
              <View
                style={{
                  flex: 1, height: 1,
                  backgroundColor: i <= index ? alpha.volt40 : alpha.ivory10,
                }}
              />
            ) : null}
            <Pressable
              testID={`spine-${b}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled: locked }}
              accessibilityLabel={`Step ${BEAT_STEP[b]}, ${BEAT_LABEL[b]}${locked ? `. Not available. ${lockedTake}` : ''}`}
              disabled={locked}
              onPress={() => onChange(b)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
            >
              <T
                mono
                size={11}
                weight="bold"
                c={active ? color.volt : locked ? color.dim : color.muted}
              >
                {BEAT_STEP[b]}
              </T>
              <T size={12} weight={active ? 'bold' : 'semibold'} ls={0.6} c={tint}>
                {BEAT_LABEL[b].toUpperCase()}
              </T>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

/**
 * The one action that moves the spine forward, and the sentence under it when
 * it cannot move.
 *
 * Volt is the user's own action and there is one of it per screen — so a beat
 * that has nothing to advance to renders the reason as text, never as a filled
 * button that does nothing when pressed.
 */
export function SpineFooter({
  label, onPress, disabled, blocked, testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  blocked?: string | null;
  testID?: string;
}) {
  if (blocked) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 }}>
        <T size={12.5} lh={18} c={color.muted} testID={`${testID ?? 'spine-footer'}-blocked`}>{blocked}</T>
      </View>
    );
  }
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        style={{
          height: 46,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: disabled ? alpha.volt20 : color.volt,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <T size={14.5} weight="bold" c={color.bg}>{label}</T>
      </Pressable>
    </View>
  );
}
