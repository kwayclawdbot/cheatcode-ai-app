import React, { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
export { color, alpha, belt } from '../tokens';

/** Layout grammar. Color remains owned by ../tokens.ts. */
export const layout = {
  gutter: 20, gap: 16, section: 24, touch: 48, radius: 16,
  line: 1, contentMax: 560,
} as const;
export const typography = {
  display: 34, title: 28, heading: 22, body: 16, caption: 13, label: 11,
} as const;
export type KitPreferences = { textScale: number; reducedMotion: boolean };
const Preferences = createContext<KitPreferences>({ textScale: 1, reducedMotion: true });

/** Respects OS motion preference; caller can also reduce motion, never override OS. */
export function DesignKitProvider({ children, textScale = 1, reducedMotion = false }: {
  children: React.ReactNode; textScale?: number; reducedMotion?: boolean;
}) {
  const [osReduced, setOSReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setOSReduced(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setOSReduced);
    return () => { mounted = false; listener.remove(); };
  }, []);
  const scale = Number.isFinite(textScale) ? Math.max(1, Math.min(1.6, textScale)) : 1;
  return <Preferences.Provider value={{ textScale: scale, reducedMotion: osReduced || reducedMotion }}>{children}</Preferences.Provider>;
}
export const useDesignPreferences = () => useContext(Preferences);
