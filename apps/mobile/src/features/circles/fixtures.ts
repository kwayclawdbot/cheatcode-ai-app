/** Circle fixtures — the Community + Setup-room boards. Fixtures mode only. */
import type { Circle, CircleDetail } from './types';

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

export const fixtureCircles: Circle[] = [
  {
    id: 'circle-meta',
    symbol: 'META',
    name: 'META Breakout',
    pattern: 'Breakout',
    time_left_plain: '2d left',
    progress: 0.65,
    expires_at: hoursFromNow(48),
    members: 28,
    unread: 28,
    setup_id: 'seed-meta',
    grade_display: 'A−',
    last_activity_plain: 'Kai verified the volume claim',
    closed: false,
  },
  {
    id: 'circle-cpi',
    symbol: 'CPI',
    name: 'CPI print',
    pattern: 'Catalyst',
    time_left_plain: '8h left',
    progress: 0.15,
    expires_at: hoursFromNow(8),
    members: 128,
    unread: 128,
    setup_id: null,
    grade_display: null,
    last_activity_plain: 'Positioning ahead of the print',
    closed: false,
  },
  {
    id: 'circle-nvda',
    symbol: 'NVDA',
    name: 'NVDA earnings',
    pattern: 'Earnings',
    time_left_plain: '8d left',
    progress: 0.84,
    expires_at: hoursFromNow(24 * 8),
    members: 74,
    unread: 0,
    setup_id: null,
    grade_display: 'B+',
    last_activity_plain: 'Two claims still verifying',
    closed: false,
  },
];

export const fixtureCircleDetail = (id: string): CircleDetail => {
  const circle = fixtureCircles.find((c) => c.id === id) ?? fixtureCircles[0];
  return {
    circle,
    locked: null,
    levels: [
      { label: '520 target', price: 520, kind: 'target' },
      { label: '504 confirm', price: 504, kind: 'entry' },
      { label: '498 invalid', price: 498, kind: 'stop' },
    ],
    quote: { price: 504.62, change_pct: 2.14, freshness: 'delayed' },
    watching: 28,
    kai_read: 'Buyers reclaimed 504 on 1.6× volume and have held it for three candles. Losing 498 ends the idea.',
    messages: [
      {
        id: 'c1', author: 'Jordan', initial: 'J', role: 'EDUCATOR', at: '9:40',
        body: 'Reclaimed VWAP on strong volume. Watching 501 for the entry.',
        is_kai: false, verification: null,
        reactions: [{ emoji: '🔺', count: 14, mine: false }],
      },
      {
        id: 'c2', author: 'Kai', initial: 'K', role: null, at: '9:41',
        body: 'Real — 1.6× the 20-day average, not just the open.',
        is_kai: true,
        verification: { title: 'Volume check · META', result_plain: 'Confirmed', body: 'Real — 1.6× the 20-day average, not just the open.' },
        reactions: [],
      },
      {
        id: 'c3', author: 'Priya', initial: 'P', role: null, at: '9:44',
        body: 'Took a starter here. Stop under 498, adding if it holds into the afternoon.',
        is_kai: false, verification: null,
        reactions: [{ emoji: '🔥', count: 6, mine: false }],
      },
    ],
  };
};
