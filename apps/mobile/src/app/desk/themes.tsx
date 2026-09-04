/**
 * Every theme the desk is reading, largest first.
 *
 * Sorted on size alone. A 5y+ theme sits above a "now" theme when it is
 * bigger, because size and timing are judged separately and never averaged —
 * marking something down for being early is the failure this whole system
 * exists to avoid. Humanoid robotics scores 9.5 on one entry in seven days and
 * ranks 43rd by how much is being written about it; counting activity finds
 * themes that are already crowded.
 */
import React, { useCallback } from 'react';
import { ScrollView, View, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { alpha, color, radius, space, type as typeScale } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import type { DeskTheme, DeskThemesResponse } from '@shared/desk';

export default function DeskThemes() {
  const router = useRouter();
  const load = useCallback(() => api.deskThemes(), []);
  const res = useResource<DeskThemesResponse>(load, null, []);
  const themes = res.data?.themes ?? [];

  return (
    <Screen variant="corner" layout="stack" testID="desk-themes-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <Eyebrow c={color.violetLight}>Kai · research desk</Eyebrow>
        <T size={typeScale.screenTitle.size} weight="bold" c={color.text} style={{ marginTop: space.x8 }}>
          What the desk is reading
        </T>
        <T size={14} lh={20} c={color.muted} style={{ marginTop: space.x10, maxWidth: 460 }}>
          Scored on how much moves if it is right, at the theme&rsquo;s ceiling —
          never on how much is being written about it. Size and timing are
          separate numbers and nothing is marked down for being years out.
        </T>
        {res.data?.asOf && (
          <T size={12} c={color.dim} style={{ marginTop: space.x8 }}>
            Judged {res.data.asOf} · {themes.length} live
          </T>
        )}

        {res.loading ? (
          <View style={{ paddingVertical: space.x40, alignItems: 'center' }}>
            <ActivityIndicator color={color.violet} />
          </View>
        ) : res.error ? (
          <T size={14} c={color.red} style={{ marginTop: space.x24 }}>{res.error}</T>
        ) : (
          <View style={{ marginTop: space.x22 }}>
            {themes.map((t, i) => (
              <ThemeRow
                key={t.theme}
                theme={t}
                last={i === themes.length - 1}
                onPress={() => router.push(`/desk/theme/${encodeURIComponent(t.theme)}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Size is the loud number. Timing sits beside it, never folded into it. */
function ThemeRow({ theme, last, onPress }: {
  theme: DeskTheme; last: boolean; onPress: () => void;
}) {
  const big = (theme.magnitude ?? 0) >= 8;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${theme.theme}, size ${theme.magnitude ?? 0} out of 10, ${theme.timeline ?? 'no timeline'}`}
      style={({ pressed }) => ({
        flexDirection: 'row', gap: space.x14, paddingVertical: space.x14,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: alpha.ivory08,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ width: 40, alignItems: 'center' }}>
        <Num size={22} weight="bold" c={big ? color.violetLight : color.muted}>
          {theme.magnitude != null ? theme.magnitude.toFixed(0) : '—'}
        </Num>
        <T size={9} c={color.dim}>of 10</T>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x8, flexWrap: 'wrap' }}>
          <T size={15} weight="semibold" c={color.text}>{theme.theme.replace(/-/g, ' ')}</T>
          {theme.outOfFavour && (
            <View style={{
              paddingHorizontal: space.x6, paddingVertical: 1,
              borderRadius: radius.xs, backgroundColor: alpha.gold14,
            }}>
              <T size={9} weight="bold" c={color.gold}>OUT OF FAVOUR</T>
            </View>
          )}
        </View>
        {theme.reason && (
          <T size={13} lh={18} c={color.muted} numberOfLines={2} style={{ marginTop: space.x4 }}>
            {theme.reason}
          </T>
        )}
        <View style={{ flexDirection: 'row', gap: space.x14, marginTop: space.x6 }}>
          <T size={11} c={color.cyan}>{theme.timeline ?? '—'}</T>
          <T size={11} c={color.dim}>conviction {theme.conviction ?? '—'}/10</T>
          {theme.entriesTotal != null && (
            <T size={11} c={color.dim}>{theme.entriesTotal} entries</T>
          )}
        </View>
      </View>
    </Pressable>
  );
}
