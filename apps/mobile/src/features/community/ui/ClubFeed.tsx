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
import { Avatar } from './Chrome';
import type { MessageMedia, ReactionKind, RoomMessage } from '../types';
import { MediaStrip, ReactionBar, ThreadLine } from './Social';

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

/**
 * REACTIONS USED TO BE EMOJI HELD ON THE PHONE. They are neither now.
 *
 * The old bar drew whatever labels came back, defaulted to a flame, and — when
 * the POST failed, which it always did because no endpoint existed — kept the
 * tap in React state and printed "Saved on this device only" underneath. That
 * was the honest thing to do at the time and it is not needed any more: there
 * is a `message_reactions` table, the counts are on the message, and a tap
 * either lands or says it did not.
 *
 * The bar itself lives in `Social.tsx` so the room, the club feed and a circle
 * all draw the same one.
 */

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
  message, onTicker, onReact, onOpenSetup, reactionNotice, onActions, onOpenThread, onOpenMedia,
}: {
  message: RoomMessage;
  onTicker: (symbol: string) => void;
  onReact?: (kind: ReactionKind) => void;
  onOpenSetup?: (symbol: string) => void;
  /** The server's sentence when a reaction did NOT land. Never our own words. */
  reactionNotice?: string | null;
  onOpenThread?: () => void;
  onOpenMedia?: (m: MessageMedia) => void;
  /**
   * Press and hold: report it, or — if you are staff — remove it, mute the
   * person, or close the reports and leave it up. Kai's own posts have no
   * actions; there is nobody to report and nobody to mute.
   */
  onActions?: () => void;
}) {
  const kai = message.author.is_kai;
  const idea = message.structured_idea;
  const refSymbol = typeof message.refs?.symbol === 'string' ? (message.refs.symbol as string) : null;

  return (
    // NOT `accessibilityRole="button"`. A message already contains buttons — the
    // $TICKER chips and the reaction pills — and on web react-native renders a
    // role of "button" as a real <button>, which cannot legally contain another
    // one. The label and the hint still announce what press-and-hold does.
    <Pressable
      onLongPress={kai ? undefined : onActions}
      delayLongPress={350}
      accessibilityLabel={kai || !onActions ? undefined : `Post by ${message.author.display_name}`}
      accessibilityHint={kai || !onActions ? undefined : 'Press and hold to report it, or to moderate it.'}
      style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}
      testID={`club-message-${message.id}`}
    >
      {kai ? <KaiOrb size={32} /> : (
        // Drawn through the shared Avatar so a member's picture appears here
        // the moment they have one, without a second copy of the fallback.
        <Avatar size={32} initial={message.author.initial} url={message.author.avatar_url} />
      )}
      <View
        style={{
          flex: 1, minWidth: 0,
          ...(kai ? { borderLeftWidth: 2, borderLeftColor: alpha.violet50, paddingLeft: 11 } : null),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <T size={13} weight="bold" c={kai ? color.violetLight : color.text}>{message.author.display_name}</T>
          {message.author.handle ? (
            <T size={10.5} c={color.dim}>{`@${message.author.handle}`}</T>
          ) : null}
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

        {message.deleted ? (
          // The row keeps its place and loses its words (01 §14). Saying so is
          // the point: a gap with no explanation reads as a bug, and a silent
          // disappearance reads as nothing happening at all.
          <View
            testID={`club-message-removed-${message.id}`}
            style={{ marginTop: 4, borderLeftWidth: 2, borderLeftColor: alpha.ivory12, paddingLeft: 10 }}
          >
            <T size={12.5} lh={18} c={color.dim}>Removed by a moderator.</T>
          </View>
        ) : message.body ? (
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

        {!message.deleted && message.media.length ? (
          <MediaStrip media={message.media} onOpen={onOpenMedia} />
        ) : null}

        {!kai && !message.deleted ? (
          <>
            <ReactionBar
              reactions={message.reactions}
              onToggle={onReact}
              testID={`reactions-${message.id}`}
            />
            {onOpenThread ? (
              <ThreadLine count={message.reply_count} onPress={onOpenThread} testID={`thread-${message.id}`} />
            ) : null}
            {reactionNotice ? (
              <T size={9.5} c={color.gold} style={{ marginTop: 3 }}>{reactionNotice}</T>
            ) : null}
          </>
        ) : null}
      </View>
    </Pressable>
  );
}
