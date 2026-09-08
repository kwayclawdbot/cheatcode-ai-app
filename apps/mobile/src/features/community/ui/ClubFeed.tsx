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
import { MediaStrip, QuoteBlock, ReactionBar, ThreadLine } from './Social';
import { PostBody } from './PostBody';
import { FollowButton } from '../../social/FollowButton';
import { MemberName } from '../../social/MemberName';
import { CommunityCallCard } from '../../social/CommunityCallCard';
import { ConversationRow, type ConversationMessage } from '../../../ui/trade';

/**
 * The feed's body.
 *
 * IT USED TO BE ITS OWN PARSER, and that is exactly the problem it caused: this
 * one knew `$META` was a ticker and the room's did not, so the same post read
 * as two different things on two screens. Both now call `PostBody`. This stays
 * as a named export because the feed passes a slightly looser line height —
 * 1.5 rather than the room's 1.45 — and that is the only difference left.
 */
export function ClubBody({
  text, size = 14, onTicker,
}: { text: string; size?: number; onTicker?: (symbol: string) => void }) {
  return <PostBody text={text} size={size} lineHeight={Math.round(size * 1.5)} onTicker={onTicker} />;
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
  message, onTicker, onReact, onReply, onOpenSetup, reactionNotice, onActions, onOpenThread,
  onOpenMedia, onOpenQuote, showFollow = false,
}: {
  message: RoomMessage;
  /**
   * The compact follow control at the end of the author line.
   *
   * `ClubMessage` and `MessageRow` are SEPARATE components with separate
   * author lines — the club board draws this one, a room draws the other — so
   * the affordance had to be added twice or it would exist on one surface and
   * not the other, which is exactly the drift that produced two different
   * `$TICKER` treatments before `PostBody` was extracted.
   *
   * Off by default and decided by the caller: this component cannot tell
   * whether the author is the person reading, and Kai is never followable.
   */
  showFollow?: boolean;
  onTicker: (symbol: string) => void;
  onReact?: (kind: ReactionKind) => void;
  /** Answer this post, quoting it. */
  onReply?: () => void;
  /** The quoted post above the body was tapped. */
  onOpenQuote?: (messageId: string) => void;
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

  /*
    THE CLUB ROW IS THE KIT'S TOO, and the differences that mattered survived.

    This component and `MessageRow` were two hand-maintained author lines, and
    the file already records what that cost: the follow button had to be added
    twice, the call card had to be added twice, and `$TICKER` was drawn two
    different ways until `PostBody` was extracted. They share `ConversationRow`
    now, so the next thing is added once.

    What is NOT shared is passed explicitly rather than lost: this board's own
    name sizes, its bordered AI pill, Kai's violet rail down the content
    column, its own words for a removed post, and the fact that Kai's posts
    carry no reactions here.
  */
  const asMessage: ConversationMessage = {
    id: message.id,
    name: message.author.display_name,
    text: message.body ?? '',
    timeLabel: message.time_label,
    belt: message.author.belt ?? null,
    isKai: kai,
    handle: kai ? message.author.handle : null,
    deleted: message.deleted,
    /* Not "This message was removed." A moderated board says who did it; the
       kit owns the refusal to print the body, not the sentence about it. */
    deletedText: 'Removed by a moderator.',
    authorDeleted: message.author.author_deleted,
  };

  return (
    <ConversationRow
      message={asMessage}
      testID={`club-message-${message.id}`}
      // NOT `accessibilityRole="button"`. A message already contains buttons —
      // the $TICKER chips and the reaction pills — and on web react-native
      // renders a role of "button" as a real <button>, which cannot legally
      // contain another one. `ConversationRow` sets no role for this reason.
      onLongPress={kai ? undefined : onActions}
      contentStyle={kai ? { borderLeftWidth: 2, borderLeftColor: alpha.violet50, paddingLeft: 11 } : undefined}
      avatar={kai ? <KaiOrb size={32} /> : (
        // Drawn through the shared Avatar so a member's picture appears here
        // the moment they have one, without a second copy of the fallback.
        <Avatar size={32} initial={message.author.initial} url={message.author.avatar_url} />
      )}
      /*
        THE NAME ON THIS BOARD IS A DOOR. `MemberName` carries the route
        itself, which is why the gap could close here without the screen above
        having to learn about it. Kai gets neither belt nor door: violetLight
        is his, he has no rank, and there is no profile behind him. Nor does a
        deleted author — a door onto a removed account is a dead end.
      */
      name={kai ? (
        <T size={13} weight="bold" c={color.violetLight}>{message.author.display_name}</T>
      ) : (
        <MemberName
          name={message.author.display_name}
          userId={message.author.author_deleted ? null : message.author.user_id}
          belt={message.author.belt}
          handle={message.author.handle}
          showHandle
          size={13}
          handleSize={10.5}
          testID={`club-author-name-${message.id}`}
        />
      )}
      aiTag={kai ? (
        <View style={{ paddingHorizontal: 5, borderRadius: 4, borderWidth: 0.5, borderColor: alpha.violet50 }}>
          <T size={8.5} weight="bold" c={color.violetLight}>AI</T>
        </View>
      ) : null}
      chips={message.author.role_labels.slice(0, 2).map((r) => (
        <T key={r} size={9.5} c={color.dim}>{r}</T>
      ))}
      /* A sibling of the name, never a child of a pressable. */
      aside={showFollow && !kai && message.author.user_id ? (
        <FollowButton userId={message.author.user_id} compact testID={`club-follow-${message.id}`} />
      ) : null}
      quote={message.quote ? (
        <View style={{ marginTop: 4 }}>
          <QuoteBlock
            quote={message.quote}
            onOpen={onOpenQuote ? () => onOpenQuote(message.quote!.message_id) : undefined}
            testID={`quote-${message.id}`}
          />
        </View>
      ) : null}
      /*
        A MEMBER'S CALL, IN THE CONVERSATION. The card replaces the body rather
        than joining it: the sentence the message arrived with describes the
        same trade, and drawing both says the idea twice.
      */
      body={message.community_call ? (
        <View style={{ marginTop: 6 }} testID={`club-message-call-${message.id}`}>
          <CommunityCallCard call={message.community_call} compact />
        </View>
      ) : message.body ? (
        <View style={{ marginTop: 2 }}>
          <ClubBody text={message.body} onTicker={onTicker} />
        </View>
      ) : null}
      beneath={(
        <>
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
          {message.media.length ? <MediaStrip media={message.media} onOpen={onOpenMedia} /> : null}
        </>
      )}
      /* Kai's posts carry no reactions on this board: there is nobody to agree
         with, and an emoji on a machine's answer is not feedback anybody reads. */
      reactions={kai ? null : (
        <ReactionBar
          reactions={message.reactions}
          onToggle={onReact}
          onReply={onReply}
          testID={`reactions-${message.id}`}
        />
      )}
      thread={kai ? null : (
        <>
          {onOpenThread ? (
            <ThreadLine count={message.reply_count} onPress={onOpenThread} testID={`thread-${message.id}`} />
          ) : null}
          {/* The server's sentence when a reaction did NOT land. Never ours. */}
          {reactionNotice ? (
            <T size={9.5} c={color.gold} style={{ marginTop: 3 }}>{reactionNotice}</T>
          ) : null}
        </>
      )}
    />
  );
}
