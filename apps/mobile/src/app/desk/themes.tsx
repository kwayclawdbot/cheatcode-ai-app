/**
 * Every theme the desk is reading, largest first.
 *
 * Sorted on size alone. A 5y+ theme sits above a "now" theme when it is
 * bigger, because size and timing are judged separately and never averaged —
 * marking something down for being early is the failure this whole system
 * exists to avoid. Humanoid robotics scores 9.5 on one entry in seven days and
 * ranks 43rd by how much is being written about it; counting activity finds
 * themes that are already crowded.
 *
 * The list draws size as a filled measure and timing as a position on a clock,
 * side by side and never combined, so that the rule above is visible in the
 * picture rather than only stated in the paragraph at the top.
 */
import React, { useCallback } from 'react';
import { ScrollView, View, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { alpha, color, radius, space, type as typeScale } from '../../ui/tokens';
import { api } from '../../lib/api';
import { env } from '../../lib/env';
import { fixtureDeskThemes } from '../../lib/fixtures';
import { useResource } from '../../lib/useResource';
import type { DeskTheme, DeskThemesResponse } from '@shared/desk';

const TIME_AXIS = ['now', '1-2y', '3-5y', '5y+'];

export default function DeskThemes() {
  const router = useRouter();
  const load = useCallback(() => api.deskThemes(), []);
  const res = useResource<DeskThemesResponse>(load, env.FIXTURES ? fixtureDeskThemes : null, []);
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
          <View style={{ marginTop: space.x22, borderTopWidth: 1, borderTopColor: alpha.ivory16 }}>
            {themes.map((t) => (
              <ThemeRow
                key={t.theme}
                theme={t}
                onPress={() => router.push(`/desk/theme/${encodeURIComponent(t.theme)}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * One theme.
 *
 * The number is loud because size is what the sort is on. The measure under it
 * is the same number drawn, so the difference between a 9.5 and a 5 is visible
 * without reading either. Timing sits beside it on its own clock and is never
 * folded in.
 */
function ThemeRow({ theme, onPress }: { theme: DeskTheme; onPress: () => void }) {
  const m = theme.magnitude ?? 0;
  const big = m >= 8;
  const at = theme.timeline ? TIME_AXIS.indexOf(theme.timeline.toLowerCase()) : -1;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${theme.theme.replace(/-/g, ' ')}, size ${theme.magnitude ?? 0} out of 10, ${theme.timeline ?? 'no timing'}`}
      style={({ pressed }) => ({
        paddingVertical: space.x16,
        borderBottomWidth: 1, borderBottomColor: alpha.ivory08,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', gap: space.x14 }}>
        {/* size, as a number and as the same number drawn */}
        <View style={{ width: 58 }}>
          <Num size={24} weight="bold" c={big ? color.violetLight : color.muted} style={{ lineHeight: 26 }}>
            {theme.magnitude != null ? theme.magnitude.toFixed(1) : '—'}
          </Num>
          <T size={9} c={color.dim}>of 10</T>
          <View style={{ flexDirection: 'row', gap: 1.5, marginTop: space.x6 }}>
            {Array.from({ length: 10 }, (_, i) => {
              const full = m >= i + 1;
              const half = !full && m > i;
              return (
                <View key={i} style={{
                  flex: 1, height: 18, borderRadius: 1,
                  backgroundColor: alpha.ivory08, overflow: 'hidden',
                }}>
                  {(full || half) && (
                    <View style={{
                      height: full ? 18 : 9, marginTop: full ? 0 : 9,
                      backgroundColor: big ? color.violet : color.violetLight,
                      opacity: big ? 1 : 0.5,
                    }} />
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x8, flexWrap: 'wrap' }}>
            <T size={16} weight="bold" c={color.text} style={{ flexShrink: 1 }}>
              {theme.theme.replace(/-/g, ' ')}
            </T>
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

          {/* timing, on its own clock — never averaged into the size */}
          <View style={{ marginTop: space.x10 }}>
            {at < 0 ? (
              <T size={11} c={theme.timeline ? color.cyan : color.dim}>{theme.timeline ?? 'timing not judged'}</T>
            ) : (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {TIME_AXIS.map((t, i) => (
                    <React.Fragment key={t}>
                      {i > 0 && <View style={{ flex: 1, height: 1, backgroundColor: alpha.ivory12 }} />}
                      <View style={{
                        width: i === at ? 7 : 4, height: i === at ? 7 : 4, borderRadius: 4,
                        backgroundColor: i === at ? color.cyan : alpha.ivory25,
                      }} />
                    </React.Fragment>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', marginTop: space.x4 }}>
                  {TIME_AXIS.map((t, i) => (
                    <T key={t} size={9} c={i === at ? color.cyan : color.dim}
                       align={i === 0 ? 'left' : i === TIME_AXIS.length - 1 ? 'right' : 'center'}
                       style={{ flex: 1 }}>
                      {t}
                    </T>
                  ))}
                </View>
              </View>
            )}
          </View>

          <T size={11} c={color.dim} style={{ marginTop: space.x8 }}>
            how sure {theme.conviction ?? '—'}/10
            {theme.entriesTotal != null ? ` · ${theme.entriesTotal} entries kept` : ''}
          </T>
        </View>
      </View>
    </Pressable>
  );
}
