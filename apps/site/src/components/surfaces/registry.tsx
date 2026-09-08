import type { ComponentType, ReactNode } from 'react';
import type { PathId } from '@/sim/personas';
import * as L from './learn';
import * as S from './swing';
import * as P from './pro';

/**
 * Beat id → the surface it shows. Ids are the ones declared in personas.ts and
 * are also the screenshot names under proof/.
 */
const SURFACES: Record<PathId, Record<string, ComponentType>> = {
  learn: {
    'kai-intro': L.KaiIntro,
    path: L.SevenDayPath,
    lesson: L.Lesson,
    pick: L.BeginnerPick,
    practice: L.Practice,
    belt: L.BeltMove,
    community: L.BeginnersRoom,
  },
  swing: {
    alerts: S.AlertsBoard,
    alert: S.AlertOpen,
    'ask-kai': S.AskKai,
    room: S.Room,
    track: S.Tracked,
  },
  pro: {
    chart: P.ChartPlain,
    analysis: P.ChartAnalyzed,
    plan: P.TradePlan,
    graded: P.Graded,
    belt: P.Progression,
    leaderboard: P.Leaderboard,
  },
};

export function renderBeat(path: PathId, beatId: string): ReactNode {
  const Surface = SURFACES[path][beatId];
  return Surface ? <Surface /> : null;
}
