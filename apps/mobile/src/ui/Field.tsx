import React, { useState } from 'react';
import { View, TextInput, TextInputProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradient, gradientAngle, radius } from './tokens';
import { family } from './fonts';
import { T } from './Text';

/** Input in the composer/search skin: pill, 0.5px hairline, 52px tall. */
export function Field({
  label, error, testID, ...input
}: TextInputProps & { label: string; error?: string | null; testID?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      <T size={13} c={color.muted}>{label}</T>
      <LinearGradient
        colors={gradient.composer as unknown as readonly [string, string, ...string[]]}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={{
          height: 52,
          borderRadius: radius.pill,
          paddingHorizontal: 18,
          justifyContent: 'center',
          borderWidth: focused ? 1 : 0.5,
          borderColor: error ? alpha.red45 : focused ? alpha.volt55 : alpha.ivory20,
        }}
      >
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          placeholderTextColor={color.dim}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...input}
          style={{
            fontFamily: family.regular,
            fontSize: 16,
            color: color.text,
            paddingVertical: 0,
            ...(({ outlineStyle: 'none' } as unknown) as object),
          }}
        />
      </LinearGradient>
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
          <View style={{ width: 6, height: 6, backgroundColor: color.red }} />
          <T size={12} c={color.red} style={{ flex: 1 }}>{error}</T>
        </View>
      ) : null}
    </View>
  );
}
