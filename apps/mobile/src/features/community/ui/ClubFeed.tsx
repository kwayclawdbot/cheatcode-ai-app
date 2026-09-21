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
import { MemberName } from '../../social/MemberName';
import { CommunityCallCard } from '../../social/CommunityCallCard';
import { useRouter } from 'expo-router';
import { CHAT, ChatRow, RoleWord, chatTime } from './ChatRow';

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
  text, size = CHAT.body, onTicker,
}: { text: string; size?: number; onTicker?: (symbol: string) => void }) {
  return <PostBody text={text} size={size} lineHeight={Math.round(size * 1.42)} onTicker={onTicker} />;
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
        <T variant="meta" weight="bold">{symbol}</T>
        <GradeChip grade={grade} />
        {state ? <T variant="meta" c={color.green}>{state}</T> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {entry ? <Num variant="meta" weight="regular" c={color.cyan}>{`Entry ${entry}`}</Num> : null}
        {stop ? <Num variant="meta" weight="regular" c={color.red}>{`Stop ${stop}`}</Num> : null}
        {target ? <Num variant="meta" weight="regular" c={color.green}>{`Target ${target}`}</Num> : null}
      </View>
      <T variant="meta" weight="bold" c={color.volt}>Open setup</T>
    </Pressable>
  );
}

export function ClubMessage({
  message, onTicker, onReact, onReply, onOpenSetup, reactionNotice, onActions, onOpenThread,
  onOpenMedia, onOpenQuote, continued = false,
}: {
  message: RoomMessage;
  /**
   * The same person's next line in one turn (`continuesTurn`) — drawn without
   * the avatar and the name, the way every group chat does it.
   */
  continued?: boolean;
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
  const router = useRouter();

  /*
    THE CLUB ROW AND THE ROOM ROW SHARE ONE SHELL — `ChatRow` — and it is a
    chat shell, not the trade kit's record shell (see ChatRow's header for why
    that changed back). What is still this board's own is passed explicitly:
    Kai's violet rail down the content column, its own words for a removed
    post, and the fact that Kai's posts carry no reactions here.

    NO FOLLOW BUTTON ON THE LINE. It is on the profile, one tap away on the
    name or the picture.
  */
  const roles = message.author.role_labels.filter((r) => !(kai && r.toLowerCase() === 'ai')).slice(0, 2);

  return (
    <ChatRow
      testID={`club-message-${message.id}`}
      continued={continued}
      deleted={message.deleted}
      /* A moderated board says who did it. */
      deletedText="Removed by a moderator."
      // Press and hold for report / moderation. Kai's posts have no actions.
      onLongPress={kai ? undefined : onActions}
      contentStyle={kai ? { borderLeftWidth: 2, borderLeftColor: alpha.violet50, paddingLeft: 11 } : undefined}
      avatar={kai ? <KaiOrb size={CHAT.avatar} glow={false} /> : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${message.author.display_name}'s profile`}
          disabled={message.author.author_deleted || !message.author.user_id}
          onPress={() => router.push(`/contributor/${encodeURIComponent(message.author.user_id ?? '')}` as never)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Avatar size={CHAT.avatar} initial={message.author.initial} url={message.author.avatar_url} />
        </Pressable>
      )}
      /*
        THE NAME IS A DOOR AND IT IS DYED. `MemberName` carries the route and
        the belt ink. Kai gets neither: violetLight is his, he has no rank, and
        there is no profile behind him. Nor does a deleted author.
      */
      name={kai ? (
        <T size={CHAT.name} weight="bold" c={color.violetLight}>{message.author.display_name}</T>
      ) : (
        <MemberName
          name={message.author.display_name}
          userId={message.author.author_deleted ? null : message.author.user_id}
          belt={message.author.belt}
          stage={message.author.stage}
          size={CHAT.name}
          testID={`club-author-name-${message.id}`}
        />
      )}
      meta={(
        <>
          {kai ? <RoleWord label="AI" /> : null}
          {roles.map((r) => <RoleWord key={r} label={r} />)}
          <T size={CHAT.meta} c={color.dim}>{chatTime(message.time_label)}</T>
        </>
      )}
      body={(
        <>
          {message.quote ? (
            <View style={{ marginTop: 3 }}>
              <QuoteBlock
                quote={message.quote}
                onOpen={onOpenQuote ? () => onOpenQuote(message.quote!.message_id) : undefined}
                testID={`quote-${message.id}`}
              />
            </View>
          ) : null}
          {/*
            A MEMBER'S CALL, IN THE CONVERSATION. The card replaces the body
            rather than joining it: the sentence the message arrived with
            describes the same trade, and drawing both says the idea twice.
          */}
          {message.community_call ? (
            <View style={{ marginTop: 6 }} testID={`club-message-call-${message.id}`}>
              <CommunityCallCard call={message.community_call} compact />
            </View>
          ) : message.body ? (
            <ClubBody text={message.body} onTicker={onTicker} />
          ) : null}
        </>
      )}
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
                <T variant="meta" c={color.green}>Kai verified · live market data</T>
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
            <T variant="meta" c={color.gold} style={{ marginTop: 3 }}>{reactionNotice}</T>
          ) : null}
        </>
      )}
    />
  );
}
