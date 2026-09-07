import React from 'react';
import { Stack } from 'expo-router';
import { color } from '../../ui/tokens';

/**
 * The package shipped `TrainingProvider` here. It now lives at the app root
 * (`src/app/_layout.tsx`) because Home and the Account board read the learner
 * profile too, and a provider scoped to this group would have handed them a
 * second, silently-diverging copy of it. This layout is now only the stack.
 */
export default function TrainingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />
  );
}
