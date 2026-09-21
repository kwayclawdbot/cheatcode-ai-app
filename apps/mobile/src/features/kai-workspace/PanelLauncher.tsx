/**
 * OPENING A PANEL WITHOUT ASKING KAI.
 *
 * Kai can put any of the panels on screen, but a member who just wants NVDA's
 * options should not have to phrase it as a question. This is the thumb's way
 * in: one sheet, a ticker, five rows. It applies the SAME workspace actions Kai
 * emits (`workspace.apply`), so a panel opened here and one Kai opened are one
 * surface in one strip — and what is on screen still travels up with the next
 * question, so "what do you make of this?" works either way.
 *
 * It navigates nowhere. Like the host, it only changes what the workspace
 * shows, and the conversation underneath stays exactly where it was.
 *
 * The house `Sheet` and `Field` are the chrome here — they already exist, and a
 * second sheet from a component library beside them would be the odd one out.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { KaiWorkspaceAction } from '@cheatcode/shared';
import { Sheet } from '../../ui/Sheet';
import { Field } from '../../ui/Field';
import { DataRow } from '../../ui/DataRow';
import { T } from '../../ui/Text';
import { color } from '../../ui/tokens';
import { workspace } from './store';

const SHAPE = /^[A-Z][A-Z0-9.\-]{0,11}$/;

type Entry = {
  key: 'quote' | 'earnings' | 'options' | 'watchlist' | 'portfolio';
  label: string;
  sub: string;
  needsSymbol: boolean;
  action: (symbol: string) => KaiWorkspaceAction;
};

const ENTRIES: Entry[] = [
  { key: 'quote', label: 'Quote', sub: "Price, change, the day's range and volume", needsSymbol: true, action: (symbol) => ({ type: 'show_quote', symbol }) },
  { key: 'earnings', label: 'Earnings', sub: 'Recent quarters, and the next date when it is known', needsSymbol: true, action: (symbol) => ({ type: 'show_earnings', symbol }) },
  { key: 'options', label: 'Options', sub: 'Listed strikes near the price, and what the flow bought', needsSymbol: true, action: (symbol) => ({ type: 'show_options', symbol }) },
  { key: 'watchlist', label: 'Your watchlist', sub: 'What you follow, priced', needsSymbol: false, action: () => ({ type: 'show_watchlist' }) },
  { key: 'portfolio', label: 'Your positions', sub: 'Your paper trades and how they are doing', needsSymbol: false, action: () => ({ type: 'show_portfolio' }) },
];

/** The small top-bar control that opens the sheet. Dim, like its neighbours. */
export function PanelLauncherButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open a panel"
      testID="home-panels-open"
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 0.55 })}
    >
      <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={4} width={7} height={7} rx={1.5} stroke={color.text} strokeWidth={1.8} />
        <Rect x={13} y={4} width={7} height={7} rx={1.5} stroke={color.text} strokeWidth={1.8} />
        <Rect x={4} y={13} width={7} height={7} rx={1.5} stroke={color.text} strokeWidth={1.8} />
        <Path d="M16.5 13.5v6M13.5 16.5h6" stroke={color.text} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    </Pressable>
  );
}

export function PanelLauncher({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [symbol, setSymbol] = useState('');

  // Start from whatever ticker is already on screen: a member looking at the
  // NVDA chart who opens this wants NVDA's options, not an empty box.
  useEffect(() => {
    if (!visible) return;
    const onScreen = workspace.toState().symbol;
    if (onScreen) setSymbol(onScreen.toUpperCase());
  }, [visible]);

  const sym = symbol.trim().toUpperCase();
  const valid = SHAPE.test(sym);

  const choose = (e: Entry) => {
    if (e.needsSymbol && !valid) return;
    workspace.apply(e.action(sym));
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Open a panel" testID="panel-launcher">
      <View style={{ gap: 10 }}>
        <Field
          label="Ticker"
          value={symbol}
          onChangeText={(t) => setSymbol(t.toUpperCase())}
          placeholder="NVDA"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          testID="panel-launcher-symbol"
          error={symbol && !valid ? 'That is not shaped like a ticker.' : null}
        />
        <View>
          {ENTRIES.map((e, i) => {
            const blocked = e.needsSymbol && !valid;
            return (
              <DataRow
                key={e.key}
                last={i === ENTRIES.length - 1}
                testID={`panel-launcher-${e.key}`}
                label={e.needsSymbol && valid ? `${e.label} · ${sym}` : e.label}
                sub={blocked ? 'Type a ticker above first' : e.sub}
                dim={blocked}
                chevron={!blocked}
                onPress={() => choose(e)}
              />
            );
          })}
        </View>
        <T variant="meta" c={color.dim}>It opens above the conversation. Kai can see what you opened.</T>
      </View>
    </Sheet>
  );
}
