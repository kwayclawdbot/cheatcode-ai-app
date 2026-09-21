/**
 * "Kai reads his replies out loud" — the voice-replies switch (lane C).
 *
 * Lives on Settings → How Kai talks to you, beside the explanation level,
 * because it is the same question: how Kai talks to you. Saved per member on
 * the server (`profiles.onboarding.prefs.voice`) so it follows them to another
 * phone. NOT DRAWN when the server says voice is off: a switch that cannot do
 * anything is the dead-button mistake in another shape.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Eyebrow, T } from '../../ui/Text';
import { Row, RowList } from '../../ui/Panel';
import { Toggle } from '../../ui/Toggle';
import { color } from '../../ui/tokens';
import { loadVoicePrefs, setVoiceReplies, useVoicePrefs } from './store';

export function VoiceRepliesRow() {
  const prefs = useVoicePrefs();
  // Settings is where a member comes to check; ask the server fresh.
  useEffect(() => { void loadVoicePrefs(true); }, []);
  if (!prefs.available) return null;
  return (
    <>
      <Eyebrow c={color.violetLight}>VOICE</Eyebrow>
      <RowList testID="settings-voice">
        <Row last>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <T size={14}>Kai reads his replies out loud</T>
            <T size={12} c={color.muted} style={{ marginTop: 2 }}>
              {prefs.error
                ?? 'Tap the mic in any Kai chat to ask out loud. With this on, he answers out loud too. Tap the mic while he talks to stop him.'}
            </T>
          </View>
          <Toggle
            testID="toggle-voice-replies"
            value={prefs.replies}
            label="Kai reads his replies out loud"
            disabled={prefs.saving}
            onChange={(v) => { void setVoiceReplies(v); }}
          />
        </Row>
      </RowList>
    </>
  );
}
