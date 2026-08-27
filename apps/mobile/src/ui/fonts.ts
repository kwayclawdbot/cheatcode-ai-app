import { Platform } from 'react-native';
import {
  useFonts as useSpaceGrotesk,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';

export const family = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  semibold: 'SpaceGrotesk_600SemiBold',
  bold: 'SpaceGrotesk_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemibold: 'IBMPlexMono_600SemiBold',
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
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  const ready = loaded || !!error;
  return { ready, blocking: Platform.OS !== 'web' && !ready };
}
