/**
 * "You asked about AMKR. Here it is, if you want it."
 *
 * THE PROBLEM IT SOLVES, in the owner's words: "if let's say they are talking
 * about tsla but then asks about amkr, kai should be able to populate an amkr
 * card or button in chat to view amkr chart."
 *
 * The conversation drifts off the chart more often than it stays on it, and
 * until now Kai answering about a symbol you could not see was the same failure
 * as narrating a level he had not drawn: the words are about something that is
 * not in front of you, and the only way to look was to go and find it yourself.
 *
 * IT IS AN OFFER AND IT IS BUILT TO LOOK LIKE ONE. Kai does not move the chart
 * — you are reading it, and having it swap under you because a sentence
 * mentioned another ticker would be the assistant taking the wheel. So the card
 * sits in the reply and waits.
 *
 * THE PALETTE DOES THE ATTRIBUTION, which is the house law rather than a
 * decision made here. The card is VIOLET-edged because Kai is the one offering
 * it; the button on it is VOLT because pressing it is the user acting. Both are
 * true at once and the two colours say so without a word of explanation — the
 * same grammar as every other surface where the two of them meet.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T } from '../../ui/Text';
import { TickerMark } from '../../ui/Ticker';
import { alpha, color, radius } from '../../ui/tokens';

export function SymbolOfferCard({
  symbol,
  hook,
  onOpen,
  onDismiss,
  testID = 'symbol-offer',
}: {
  symbol: string;
  /** One line saying why it is here. Never a price — nothing priced it. */
  hook?: string | null;
  onOpen: (symbol: string) => void;
  onDismiss?: () => void;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        padding: 11,
        borderRadius: radius.lg,
        borderWidth: 0.5,
        // Kai's edge. Not a filled violet panel — the reply is his already, and
        // a solid block would read as an advertisement inside the conversation.
        borderColor: alpha.violet50,
        backgroundColor: alpha.ivory06,
      }}
    >
      <TickerMark symbol={symbol} size={32} />
      <View style={{ flex: 1, gap: 1 }}>
        <T size={14} weight="bold">{symbol}</T>
        <T size={11.5} c={color.muted} numberOfLines={1}>
          {hook || 'The one you asked about'}
        </T>
      </View>
      <Pressable
        testID={`symbol-offer-open-${symbol}`}
        accessibilityRole="button"
        accessibilityLabel={`View the ${symbol} chart`}
        accessibilityHint="Changes the chart to this symbol"
        onPress={() => onOpen(symbol)}
        hitSlop={8}
        style={({ pressed }) => ({
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: radius.pill,
          // Volt: the user acting. Palette law, and the only volt on the card.
          backgroundColor: alpha.volt14,
          borderWidth: 0.5,
          borderColor: `${color.volt}66`,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}
      >
        <T size={12} weight="semibold" c={color.volt}>View chart</T>
      </Pressable>
      {onDismiss ? (
        <Pressable
          testID="symbol-offer-dismiss"
          accessibilityRole="button"
          accessibilityLabel={`Dismiss the ${symbol} card`}
          onPress={onDismiss}
          hitSlop={10}
        >
          <T size={13} c={color.dim}>✕</T>
        </Pressable>
      ) : null}
    </View>
  );
}
