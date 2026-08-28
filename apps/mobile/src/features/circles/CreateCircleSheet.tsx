/**
 * "Create a circle" — gated behind the `circles_create` entitlement.
 *
 * The sheet is REAL: it takes a symbol and a life span and opens the room. On a
 * plan without the entitlement it says what the feature is and what it needs,
 * and the primary action is disabled — never a silently dead button.
 */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Sheet } from '../../ui/Sheet';
import { T } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { alpha, color, radius } from '../../ui/tokens';
import { family } from '../../ui/fonts';
import { Segmented } from '../../ui/Segmented';
import { TTL_OPTIONS, type CircleTtl } from './types';

export function CreateCircleSheet({
  visible, onClose, canCreate, onCreate, defaultSymbol = '',
}: {
  visible: boolean;
  onClose: () => void;
  canCreate: boolean;
  onCreate: (symbol: string, ttl: CircleTtl) => Promise<void>;
  defaultSymbol?: string;
}) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [ttl, setTtl] = useState<CircleTtl>('3d');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(s, ttl);
      setSymbol('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That circle could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Open a circle" testID="create-circle-sheet">
      <T size={13} lh={19} c={color.muted}>
        A circle is a room with a clock: it gathers everyone watching one symbol, and closes itself
        when the idea is over.
      </T>

      <View style={{ gap: 7 }}>
        <T size={11} c={color.muted}>Symbol</T>
        <TextInput
          testID="create-circle-symbol"
          accessibilityLabel="Symbol for the circle"
          value={symbol}
          onChangeText={setSymbol}
          editable={canCreate && !busy}
          autoCapitalize="characters"
          placeholder="META"
          placeholderTextColor={color.dim}
          style={{
            height: 46, borderRadius: radius.lg, paddingHorizontal: 14,
            borderWidth: 0.5, borderColor: alpha.ivory20, backgroundColor: alpha.ivory06,
            fontFamily: family.regular, fontSize: 15, color: color.text,
          }}
        />
      </View>

      <View style={{ gap: 7 }}>
        <T size={11} c={color.muted}>How long it stays open</T>
        <Segmented
          testID="create-circle-ttl"
          value={ttl}
          onChange={(v) => setTtl(v)}
          options={TTL_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
        />
        <T size={11} c={color.dim}>{TTL_OPTIONS.find((o) => o.key === ttl)?.plain}</T>
      </View>

      {!canCreate ? (
        <T size={12} lh={18} c={color.gold} testID="create-circle-gated">
          Opening your own circle is part of the premium plan. You can join every circle on the club
          today — this only controls who can start one.
        </T>
      ) : null}
      {error ? <T size={12} c={color.red}>{error}</T> : null}

      <Button
        label="Open the circle"
        height={48}
        disabled={!canCreate || !symbol.trim() || busy}
        loading={busy}
        testID="create-circle-submit"
        onPress={() => { void submit(); }}
      />
    </Sheet>
  );
}
