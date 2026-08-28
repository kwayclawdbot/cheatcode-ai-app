/**
 * The circles row (Community.html) — a ring per circle, the ring being its
 * clock. "+ Create" is present but gated: without the `circles_create`
 * entitlement it says so plainly rather than disappearing, because a feature
 * you cannot see is not a feature you can decide to buy.
 */
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import { T, Num } from '../../ui/Text';
import { alpha, color } from '../../ui/tokens';
import type { Circle } from './types';

const R = 30;
const C = 2 * Math.PI * R;

function Ring({ progress, tone, children }: { progress: number; tone: string; children: React.ReactNode }) {
  return (
    <View style={{ width: 64, height: 64 }}>
      <Svg viewBox="0 0 64 64" width={64} height={64} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <SvgCircle cx={32} cy={32} r={R} fill="none" stroke={alpha.ivory08} strokeWidth={2.5} />
        <SvgCircle
          cx={32} cy={32} r={R} fill="none" stroke={tone} strokeWidth={2.5} strokeLinecap="round"
          strokeDasharray={`${C.toFixed(1)}`}
          strokeDashoffset={(C * Math.max(0, Math.min(1, progress))).toFixed(1)}
        />
      </Svg>
      <View
        style={{
          position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: 27,
          backgroundColor: alpha.chip85, alignItems: 'center', justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** Colour is the circle's URGENCY, not its quality — hours left, not grade. */
const toneFor = (c: Circle): string => {
  if (!c.expires_at) return color.violet;
  const hours = (Date.parse(c.expires_at) - Date.now()) / 3600_000;
  if (hours <= 12) return color.gold;
  if (hours <= 72) return color.volt;
  return color.violet;
};

export function CirclesRow({
  circles, canCreate, onOpen, onCreate,
}: {
  circles: Circle[];
  canCreate: boolean;
  onOpen: (c: Circle) => void;
  onCreate: () => void;
}) {
  return (
    <ScrollView
      testID="circles-row"
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: 'row', gap: 15, paddingHorizontal: 16, paddingVertical: 11 }}
    >
      {circles.map((c) => (
        <Pressable
          key={c.id}
          testID={`circle-${c.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${c.name}, ${c.time_left_plain}, ${c.members} members${c.unread ? `, ${c.unread} new` : ''}`}
          onPress={() => onOpen(c)}
          style={{ width: 66, alignItems: 'center', gap: 6 }}
        >
          <View>
            <Ring progress={c.progress} tone={toneFor(c)}>
              {/* Board rhythm: a ticker that fits reads whole (CPI), a longer
                  one reads as its initial (META → M). */}
              <T size={c.symbol.length > 1 ? 12 : 15} weight="bold">
                {c.symbol.length <= 3 ? c.symbol : c.symbol.slice(0, 1)}
              </T>
            </Ring>
            {c.unread ? (
              <View
                style={{
                  position: 'absolute', right: -2, bottom: -1, minWidth: 19, height: 19, paddingHorizontal: 5,
                  borderRadius: 10, backgroundColor: color.volt, borderWidth: 2, borderColor: color.bg,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <T size={9} weight="bold" c={color.bg}>{c.unread > 99 ? '99+' : String(c.unread)}</T>
              </View>
            ) : null}
          </View>
          <T size={10.5} weight="semibold" align="center" numberOfLines={1}>{c.symbol}</T>
          <Num size={9} weight="regular" c={color.dim} style={{ marginTop: -4 }}>{c.time_left_plain}</Num>
        </Pressable>
      ))}

      <Pressable
        testID="circle-create"
        accessibilityRole="button"
        accessibilityLabel={canCreate ? 'Create a circle' : 'Creating a circle is a premium feature'}
        onPress={onCreate}
        style={{ width: 66, alignItems: 'center', gap: 6 }}
      >
        <View
          style={{
            width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, borderStyle: 'dashed',
            borderColor: alpha.ivory20, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color.dim} strokeWidth={2}>
            <Path d="M12 5v14M5 12h14" />
          </Svg>
        </View>
        <T size={10.5} align="center" c={color.dim}>Create</T>
        {!canCreate ? <T size={9} align="center" c={color.dim} style={{ marginTop: -4 }}>Premium</T> : null}
      </Pressable>
    </ScrollView>
  );
}
