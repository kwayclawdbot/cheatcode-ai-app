import { Platform } from 'react-native';
import {
  useFonts as useSpaceGrotesk,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';

/** Round 4: mono is JetBrains Mono app-wide (was IBM Plex Mono). */
export const family = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  semibold: 'SpaceGrotesk_600SemiBold',
  bold: 'SpaceGrotesk_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemibold: 'JetBrainsMono_600SemiBold',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

/**
 * WHY THE WEB BUILD RENDERED IN TIMES.
 * ===========================================================================
 *
 * The audit inspected the public `/welcome` and `/sign-up` and found them set
 * in a SERIF face while the computed `font-family` said `SpaceGrotesk_400Regular`
 * — and recorded the cause as unverified. It is verifiable, and it is here.
 *
 * `family` above holds the names expo-font registers the loaded faces under.
 * They are bare, single-name families with no stack behind them. On web the
 * app deliberately does NOT block on the font gate (see `useAppFonts` below —
 * returning null on web kills clicks after hydration), and `public/index.html`
 * sets no `font-family` on `body`. So between first paint and the woff2
 * arriving, and PERMANENTLY if the woff2 404s or the network is slow enough
 * that somebody signs up first, the browser is handed a family it does not
 * know and falls back to its default — which is Times, a serif.
 *
 * The fix is the fallback stack every web app is supposed to have. It is
 * applied only on web: React Native resolves `fontFamily` against a registered
 * face by exact name, so a comma-separated list there matches nothing at all.
 *
 * `family` itself is left as a flat map of single-quoted literals on purpose —
 * `scripts/gen-theme.mts` slices that object out of this file's SOURCE TEXT
 * (it cannot import it; the entry point resolves to .ttf) and throws if the
 * shape changes. So the stack is a function applied at the point of use, and
 * `T` in `ui/Text.tsx` — which every piece of text in the app goes through —
 * calls it.
 */
const SANS_FALLBACK =
  '"Space Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO_FALLBACK =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/**
 * The family string to hand to a style. On native it is the face name and
 * nothing else; on web it is that name followed by a real fallback stack, so a
 * face that has not loaded yet degrades to the platform sans rather than Times.
 */
export function fontStack(name: string, mono = false): string {
  if (Platform.OS !== 'web') return name;
  return `${name}, ${mono ? MONO_FALLBACK : SANS_FALLBACK}`;
}

/**
 * Font gate.
 * OWNER MEMORY / brief: never `if (!loaded) return null` on web — that kills
 * clicks after hydration. On web we always render; the browser falls back until
 * the face loads. Only native blocks (and only for one frame).
 */
export function useAppFonts(): { ready: boolean; blocking: boolean } {
  const [loaded, error] = useSpaceGrotesk({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });
  const ready = loaded || !!error;
  return { ready, blocking: Platform.OS !== 'web' && !ready };
}
