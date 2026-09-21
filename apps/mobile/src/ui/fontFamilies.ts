/**
 * The loaded font faces, by the names expo-font registers them under.
 *
 * REDESIGN 2026-09-21: Geist Sans for the interface, Geist Mono for prices,
 * tickers, timestamps, percentages and R multiples (the spec's two faces — one
 * font personality, not three). Both come from `@expo-google-fonts/geist` and
 * `@expo-google-fonts/geist-mono`, plain .ttf assets that Expo Go loads
 * through expo-font with no native module.
 *
 * This module imports NOTHING on purpose: `scripts/gen-theme.mts` slices this
 * object out of the source text under plain node, so keep it a flat map of
 * single-quoted literals.
 */
export const family = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
  monoSemibold: 'GeistMono_600SemiBold',
  monoBold: 'GeistMono_700Bold',
} as const;

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold';
