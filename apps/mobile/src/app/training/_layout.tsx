import React from 'react';
import { Stack } from 'expo-router';
import { TrainingProvider } from '../../features/training/store';
import { color } from '../../ui/tokens';

export default function TrainingLayout() {
  return (
    <TrainingProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />
    </TrainingProvider>
  );
}
