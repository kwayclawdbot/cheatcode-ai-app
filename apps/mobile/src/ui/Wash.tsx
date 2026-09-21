import React from 'react';
import { StyleSheet, View } from 'react-native';
import { color } from './tokens';

/**
 * The screen background.
 *
 * It used to paint radial violet and cyan washes behind every tabbed screen.
 * REDESIGN 2026-09-21: the spec's canvas is flat (#0C0C0F) — no decorative
 * glow, and violet is reserved for Kai actually speaking. So this now paints
 * the plain canvas and nothing else. `variant` is kept so the screens that
 * mount it did not have to change; both variants are the same flat ground.
 */
export function Wash(_props: { variant?: 'corner' | 'dome' }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.canvas }]} />;
}
