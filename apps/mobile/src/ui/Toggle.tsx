import React from 'react';
import { Pressable, View } from 'react-native';
import { alpha, color } from './tokens';

/** V3-AC1 toggle: 40×24 track, 20px knob, volt when on. */
export function Toggle({
  value, onChange, label, disabled, testID,
}: { value: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange?.(!value)}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{
        width: 40, height: 24, borderRadius: 12,
        backgroundColor: value ? color.volt : alpha.ivory14,
        borderWidth: value ? 0 : 0.5, borderColor: alpha.ivory20,
        justifyContent: 'center',
        opacity: disabled && !value ? 0.5 : 1,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: value ? 18 : 2,
          width: 20, height: 20, borderRadius: 10,
          backgroundColor: value ? color.bg : color.muted,
        }}
      />
    </Pressable>
  );
}
