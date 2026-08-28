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
