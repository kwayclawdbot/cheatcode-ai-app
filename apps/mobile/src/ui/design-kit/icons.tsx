import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { color } from './theme';

/** One optical grid, round 1.7px strokes; no emoji or font-icon dependency. */
const paths = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  alerts: 'M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3V9m4 12h4',
  community: 'M3 21v-2a5 5 0 0 1 5-5h2m4 0h2a5 5 0 0 1 5 5v2M8 14a4 4 0 1 0 0-8m8 8a4 4 0 1 0 0-8',
  trade: 'M5 5v14M12 2v20M19 7v12M3 8h4v6H3zM10 7h4v8h-4zM17 10h4v5h-4z',
  account: 'M3 22v-2a9 9 0 0 1 18 0v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  arrow: 'M4 12h15m-6-6 6 6-6 6', back: 'M20 12H5m6-6-6 6 6 6',
  chevron: 'm9 5 7 7-7 7', down: 'm5 9 7 7 7-7',
  menu: 'M3 6h18M3 12h14M3 18h10', plus: 'M12 4v16M4 12h16',
  send: 'm3 3 19 9-19 9 4-9-4-9m4 9h15', close: 'm5 5 14 14M5 19 19 5',
  check: 'm4 12 5 5L20 6', bookmark: 'M6 3h12v19l-6-4-6 4V3',
  book: 'M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-2-7-2-10 1v16',
  play: 'm8 4 12 8-12 8V4', search: 'm16 16 6 6M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  lock: 'M5 10h14v12H5zM8 10V6a4 4 0 0 1 8 0v4',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-8l1-7',
  clock: 'M12 6v7l4 2', more: 'M4 12h1m6 0h1m6 0h1',
  wifi: 'M2 7a16 16 0 0 1 20 0M5 11a11 11 0 0 1 14 0M8 15a6 6 0 0 1 8 0M12 19h.1',
  flag: 'M5 22V3c5-4 9 4 15 0v10c-6 4-10-4-15 0',
} as const;
export type IconName = keyof typeof paths;
export function KitIcon({ name, size = 22, ink = color.text }: { name: IconName; size?: number; ink?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    {name === 'clock' && <Circle cx={12} cy={12} r={10} fill="none" stroke={ink} strokeWidth={1.7} />}
    <Path d={paths[name]} fill="none" stroke={ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
