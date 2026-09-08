'use client';

import { useState } from 'react';
import type { PathId } from '@/sim/personas';
import { PathSelector } from './PathSelector';
import { Walkthrough } from './Walkthrough';

/** Mobile opens with a persona, then a reveal and a curiosity-led journey. */
export function Funnel() {
  const [path, setPath] = useState<PathId | null>(null);

  if (!path) return <PathSelector onPick={setPath} />;
  return <Walkthrough path={path} onExit={() => setPath(null)} />;
}
