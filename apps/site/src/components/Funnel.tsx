'use client';

import { useState } from 'react';
import type { PathId } from '@/sim/personas';
import { PathSelector } from './PathSelector';
import { Walkthrough } from './Walkthrough';

/**
 * The mobile experience. Not a shrunk landing page — it behaves like the app:
 * the selector is the first thing, the walkthrough is the second, the plan is
 * the third. There is no marketing scroll to get lost in.
 */
export function Funnel() {
  const [path, setPath] = useState<PathId | null>(null);

  if (!path) return <PathSelector onPick={setPath} />;
  return <Walkthrough path={path} onExit={() => setPath(null)} />;
}
