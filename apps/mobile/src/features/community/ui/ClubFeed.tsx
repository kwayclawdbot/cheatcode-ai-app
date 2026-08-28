/**
 * The Cheat Code Club feed (Community.html).
 *
 * `MessageRow` (round 2) renders the room-detail message. The club feed on the
 * Community tab is a different object: it is flatter, it turns `$TICKER` into a
 * tappable chip that opens the ticker page, it carries reaction pills, and a
 * Kai object is a bordered card inside the message rather than the whole row.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T, Num } from '../../../ui/Text';
import { KaiOrb } from '../../../ui/KaiOrb';
import { Check } from '../../../ui/Icons';
import { alpha, color, radius } from '../../../ui/tokens';
import { GradeChip } from '../../portal/grade';
import { KaiObjectView } from './KaiObjects';
import type { RoomMessage } from '../types';

/** `$META` → a cyan chip that opens the ticker page. */
export function ClubBody({
  text, size = 14, onTicker,
}: { text: string; size?: number; onTicker?: (symbol: string) => void }) {
  const parts = text.split(/(\$[A-Z]{1,5}\b|@Kai\b|\b\d{2,5}(?:\.\d{1,2})?\b)/g).filter((p) => p !== '');
  return (
    <T size={size} lh={Math.round(size * 1.5)}>
      {parts.map((p, i) => {
        if (/^\$[A-Z]{1,5}$/.test(p)) {
          const sym = p.slice(1);
          return (
            <T
              key={i}
              size={size}
              weight="semibold"
              c={color.cyan}
              testID={`ticker-chip-${sym}`}
              accessibilityRole="link"
              accessibilityLabel={`Open ${sym}`}
              onPress={() => onTicker?.(sym)}
            >
              {p}
            </T>
          );
        }
        if (p === '@Kai') {
          return <T key={i} size={size} weight="semibold" c={color.violetLight}>{p}</T>;
        }
        if (/^\d{2,5}(\.\d{1,2})?$/.test(p)) {
          return <Num key={i} size={size - 1.5} weight="regular" c={color.cyan}>{p}</Num>;
        }
        return <T key={i} size={size} lh={Math.round(size * 1.5)}>{p}</T>;
      })}
    </T>
  );
}

export type Reaction = { emoji: string; count: number; mine: boolean };

function Reactions({
  reactions, onReact, testID,
}: { reactions: Reaction[]; onReact?: (emoji: string) => void; testID?: string }) {
  const shown = reactions.length ? reactions : [{ emoji: '🔥', count: 0, mine: false }];
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
      {shown.map((r) => (
        <Pressable
          key={r.emoji}
          testID={`react-${r.emoji}`}
          accessibilityRole="button"
          accessibilityLabel={`React ${r.emoji}${r.count ? `, ${r.count} so far` : ''}`}
          accessibilityState={{ selected: r.mine }}
          onPress={() => onReact?.(r.emoji)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill,
            backgroundColor: r.mine ? alpha.volt10 : alpha.ivory06,
            borderWidth: 0.5, borderColor: r.mine ? alpha.volt40 : alpha.ivory10,
          }}
        >
          <T size={11}>{r.emoji}</T>
          {r.count ? <Num size={11} weight="regular" c={color.muted}>{String(r.count)}</Num> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** The Kai setup object the board shows inside Priya's message. */
export function SetupObjectCard({
  symbol, grade, state, entry, stop, target, onOpen,
}: {
  symbol: string; grade: string | null; state: string | null;
  entry: string | null; stop: string | null; target: string | null;
  onOpen: () => void;
}) {
  return (
    <Pressable
      testID={`setup-object-${symbol}`}
      accessibilityRole="button"
      accessibilityLabel={`${symbol} setup, grade ${grade ?? 'not graded'}. Open setup`}
      onPress={onOpen}
      style={{
        marginTop: 7, borderRadius: 13, paddingVertical: 11, paddingHorizontal: 13, gap: 6,
        backgroundColor: alpha.gold04, borderWidth: 1, borderColor: alpha.gold50,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <T size={13} weight="bold">{symbol}</T>
        <GradeChip grade={grade} />
        {state ? <T size={10.5} c={color.green}>{state}</T> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {entry ? <Num size={10.5} weight="regular" c={color.cyan}>{`Entry ${entry}`}</Num> : null}
        {stop ? <Num size={10.5} weight="regular" c={color.red}>{`Stop ${stop}`}</Num> : null}
        {target ? <Num size={10.5} weight="regular" c={color.green}>{`Target ${target}`}</Num> : null}
      </View>
      <T size={11.5} weight="bold" c={color.volt}>Open setup</T>
    </Pressable>
  );
}

export function ClubMessage({
  message, onTicker, onReact, onOpenSetup, reactionsLocal,
}: {
  message: RoomMessage;
  onTicker: (symbol: string) => void;
  onReact?: (emoji: string) => void;
  onOpenSetup?: (symbol: string) => void;
  /** true when reactions are held on this device only */
  reactionsLocal?: boolean;
}) {
  const kai = message.author.is_kai;
  const idea = message.structured_idea;
  const refSymbol = typeof message.refs?.symbol === 'string' ? (message.refs.symbol as string) : null;

  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }} testID={`club-message-${message.id}`}>
      {kai ? <KaiOrb size={32} /> : (
        <View
          style={{
            width: 32, height: 32, borderRadius: 16, backgroundColor: alpha.chip85,
            borderWidth: 0.5, borderColor: alpha.ivory14, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <T size={12} weight="bold">{message.author.initial}</T>
        </View>
      )}
      <View
        style={{
          flex: 1, minWidth: 0,
          ...(kai ? { borderLeftWidth: 2, borderLeftColor: alpha.violet50, paddingLeft: 11 } : null),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <T size={13} weight="bold" c={kai ? color.violetLight : color.text}>{message.author.display_name}</T>
          {kai ? (
            <View style={{ paddingHorizontal: 5, borderRadius: 4, borderWidth: 0.5, borderColor: alpha.violet50 }}>
              <T size={8.5} weight="bold" c={color.violetLight}>AI</T>
            </View>
          ) : null}
          {message.author.role_labels.slice(0, 2).map((r) => (
            <T key={r} size={9.5} c={color.dim}>{r}</T>
          ))}
          <T size={10} c={color.dim}>{message.time_label}</T>
        </View>

        {message.body ? (
          <View style={{ marginTop: 2 }}>
            <ClubBody text={message.body} onTicker={onTicker} />
          </View>
        ) : null}

        {idea && refSymbol ? (
          <SetupObjectCard
            symbol={refSymbol}
            grade={typeof message.refs?.grade_display === 'string' ? (message.refs.grade_display as string) : null}
            state={typeof message.refs?.state_label === 'string' ? (message.refs.state_label as string) : null}
            entry={idea.entry_condition || null}
            stop={idea.invalidation || null}
            target={idea.target_horizon || null}
            onOpen={() => onOpenSetup?.(refSymbol)}
          />
        ) : null}

        {kai && message.kai_object ? (
          <View style={{ marginTop: 6, gap: 6 }}>
            <KaiObjectView object={message.kai_object} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Check size={11} color={color.green} strokeWidth={3} />
              <T size={11} c={color.green}>Kai verified · live market data</T>
            </View>
          </View>
        ) : null}

        {!kai ? (
          <>
            <Reactions
              reactions={message.reactions.map((r) => ({
                // Round-2 payloads sometimes label a reaction with its own
                // count; a bare number is not an emoji, so fall back per tone.
                emoji: /^\d+$/.test(r.label) ? (r.tone === 'market' ? '💬' : r.tone === 'kai' ? '✅' : '🔥') : r.label,
                count: r.count,
                mine: false,
              }))}
              onReact={onReact}
              testID={`reactions-${message.id}`}
            />
            {reactionsLocal ? (
              <T size={9.5} c={color.dim} style={{ marginTop: 3 }}>Saved on this device only</T>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}
