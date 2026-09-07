import React from 'react';
import { View, Pressable } from 'react-native';
import { alpha, color, radius } from '../../../ui/tokens';
import { T } from '../../../ui/Text';
import { Avatar, ClaimChip, DisclosureChip, RoleChip } from './Chrome';
import { KaiObjectView } from './KaiObjects';
import type { MessageMedia, ReactionKind, RoomMessage } from '../types';
import { MediaStrip, QuoteBlock, ReactionBar, ThreadLine } from './Social';
import { PostBody } from './PostBody';
import { FollowButton } from '../../social/FollowButton';
import { MemberName } from '../../social/MemberName';
import { CommunityCallCard } from '../../social/CommunityCallCard';

/**
 * One message in a room (V3-C1 / S81).
 * Member messages and Kai messages share the avatar + name + time rhythm; only
 * Kai's body is an object. A member's market claim carries an "Unverified" chip
 * until a verification_card in the room names it (08 §10).
 *
 * The body used to be parsed HERE, by a private `Body` that knew about `@Kai`
 * and price levels but not about `$NVDA` — while the club feed's own parser
 * knew about all three. The same sentence therefore read differently depending
 * on which screen you opened it on. Both now call `PostBody`, which is the one
 * parser, and this file no longer has an opinion about text.
 */

const roleTone = (label: string): 'gold' | 'kai' | 'green' | 'neutral' => {
  const l = label.toLowerCase();
  if (l === 'ai') return 'kai';
  if (l.includes('educator') || l.includes('expert')) return 'gold';
  if (l.includes('verified')) return 'green';
  return 'neutral';
};

export function MessageRow({
  message, selected, onSelect, onOpenAuthor, onMore, showStructured = true,
  onReact, onReply, onOpenThread, onOpenMedia, onTicker, onOpenQuote, hideThreadLine,
  showFollow = false,
}: {
  message: RoomMessage;
  selected?: boolean;
  onSelect?: () => void;
  onOpenAuthor?: () => void;
  onMore?: () => void;
  showStructured?: boolean;
  /**
   * Draw the compact follow control at the end of the author line. Off by
   * default, and the CALLER decides — this component cannot know whether the
   * author is the person reading, and offering to follow yourself is the
   * silliest thing a social feature can do. Never true for Kai either: he is
   * not a member and there is nothing to subscribe to.
   */
  showFollow?: boolean;
  onReact?: (kind: ReactionKind) => void;
  /** Answer this one, quoting it. Absent = this surface does not reply. */
  onReply?: () => void;
  onOpenThread?: () => void;
  onOpenMedia?: (m: MessageMedia) => void;
  /** A `$NVDA` in the body was tapped. Absent = the token is not a link. */
  onTicker?: (symbol: string) => void;
  /** The quoted post above the body was tapped. */
  onOpenQuote?: (messageId: string) => void;
  /**
   * True inside a thread, where the count line would be a lie — a comment
   * cannot be commented on, only quoted.
   */
  hideThreadLine?: boolean;
}) {
  const m = message;
  const isKai = m.author.is_kai;
  const nameColor = isKai ? color.violetLight : m.author.role_labels.some((r) => roleTone(r) === 'gold') ? color.gold : color.text;

  return (
    <View
      testID={`message-row-${m.id}`}
      style={{
        flexDirection: 'row', gap: 10,
        paddingVertical: selected ? 8 : 0,
        paddingHorizontal: selected ? 8 : 0,
        marginHorizontal: selected ? -8 : 0,
        borderRadius: radius.lg,
        borderWidth: selected ? 0.5 : 0,
        borderColor: selected ? alpha.violet50 : 'transparent',
        backgroundColor: selected ? alpha.violet08 : 'transparent',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isKai ? 'Kai' : `Open ${m.author.display_name}'s contributor profile`}
        disabled={isKai || !onOpenAuthor}
        onPress={onOpenAuthor}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Avatar
          initial={m.author.initial}
          url={m.author.avatar_url}
          tone={isKai ? 'kai' : m.author.role_labels.some((r) => roleTone(r) === 'gold') ? 'educator' : 'neutral'}
        />
      </Pressable>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/*
            NAME AND USERNAME ARE ONE DOOR NOW. The name has always opened the
            profile here; the `@handle` sat outside that pressable and did
            nothing, which is the same word for the same person behaving two
            ways an inch apart. `MemberName` holds both and routes itself, so
            `onOpenAuthor` is no longer what makes the name work — it is kept
            because the AVATAR still uses it, and because a caller that has a
            reason to send somebody elsewhere still can.

            Kai keeps violetLight, keeps his role chip, and is not a door: he
            is not a member and there is no profile behind him. A deleted
            author has no `user_id`, so they are not a door either.

            AN EDUCATOR'S NAME IS NO LONGER GOLD. A name can carry one claim
            and the belt is the one the owner asked for; gold was doing the
            work of the RoleChip that is still printed right beside it, and
            "Educator" in words is a stronger statement than a hue anybody has
            to be taught. Kai and a deleted author keep `nameColor` because
            neither of them has a rung to show instead.
          */}
          {isKai || !m.author.user_id ? (
            <T size={13.5} weight="bold" c={nameColor}>{m.author.display_name}</T>
          ) : (
            <MemberName
              name={m.author.display_name}
              userId={m.author.user_id}
              belt={m.author.belt}
              handle={m.author.handle}
              showHandle
              size={13.5}
              handleSize={11.5}
              testID={`message-author-name-${m.id}`}
            />
          )}
          {/* Kai's own line still prints its username the plain way — his name
              is not a member's name and it never wears a belt. */}
          {(isKai || !m.author.user_id) && m.author.handle ? (
            <T size={11.5} c={color.dim} testID={`message-handle-${m.id}`}>{`@${m.author.handle}`}</T>
          ) : null}
          {m.author.role_labels.map((r) => <RoleChip key={r} label={r} tone={roleTone(r)} />)}
          {m.position_disclosure ? (
            <DisclosureChip label={m.position_disclosure.label} holds={m.position_disclosure.holds} />
          ) : null}
          <T size={10} c={color.muted}>{m.time_label}</T>
          {/*
            Follow, at the end of the author line. It is a SIBLING of the name's
            pressable and never a child of it: on web a role of "button" renders
            as a real <button>, and one cannot contain another. This is the same
            rule that keeps MediaStrip outside the body pressable below.
          */}
          {showFollow && !isKai && m.author.user_id ? (
            <View style={{ marginLeft: 'auto' }}>
              <FollowButton userId={m.author.user_id} compact testID={`message-follow-${m.id}`} />
            </View>
          ) : null}
        </View>

        {/*
          A MEMBER'S CALL IS THE BODY, WHEN THERE IS ONE.

          A call reaches the room as an ordinary `text` message carrying a
          resolved `community_call`, which is why the existing five-second
          `after_seq` poll delivers it with nothing new subscribed to. So the
          card is drawn in place of the words — the body it arrived with is a
          sentence describing the same trade, and printing both would say the
          idea twice.

          IT SITS OUTSIDE THE SELECTION PRESSABLE, exactly as MediaStrip does
          below and for the same reason: the card contains its own buttons (the
          author, the ticker, a $cashtag in the thesis), and on web
          react-native renders accessibilityRole="button" as a real <button>,
          which cannot legally contain another one. The cost is that a call
          cannot be long-pressed for the moderation sheet from this row; it can
          still be reacted to, replied to and opened as a thread, and the club
          feed's row — whose wrapper deliberately carries no button role — does
          offer the actions.
        */}
        {!m.deleted && m.community_call ? (
          <View style={{ marginTop: 4 }} testID={`message-call-${m.id}`}>
            <CommunityCallCard call={m.community_call} compact />
          </View>
        ) : (
        /* The body is the tap target for selection so the row never nests a
           button inside a button (web renders both as <button>). */
        <Pressable
          testID={`message-${m.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${m.author.display_name}, ${m.time_label}. ${m.body ?? (m.kai_object ? m.kai_object.title : '')}`}
          accessibilityHint={onSelect ? 'Select this message so Kai can act on it' : undefined}
          accessibilityState={{ selected: !!selected }}
          disabled={!onSelect && !onMore}
          onPress={onSelect}
          onLongPress={onMore}
        >
          {m.deleted ? (
            <T size={13} c={color.dim}>This message was removed.</T>
          ) : m.kai_object ? (
            <View style={{ marginTop: 2 }}>
              <KaiObjectView object={m.kai_object} />
            </View>
          ) : (
            <>
              {/* The post being answered goes ABOVE the answer, the way a
                  quotation does on paper. Below it, the reply would read as an
                  afterthought about something you had already finished. */}
              {m.quote ? (
                <View style={{ marginTop: 3 }}>
                  <QuoteBlock
                    quote={m.quote}
                    onOpen={onOpenQuote ? () => onOpenQuote(m.quote!.message_id) : undefined}
                    testID={`quote-${m.id}`}
                  />
                </View>
              ) : null}
              {m.body ? <PostBody text={m.body} onTicker={onTicker} /> : null}
              {m.structured_idea && showStructured ? <StructuredBlock idea={m.structured_idea} /> : null}
            </>
          )}
        </Pressable>
        )}

        {/* Pictures sit OUTSIDE the selection Pressable: tapping a photo opens
            the photo, and nesting a pressable inside a pressable makes that
            ambiguous on iOS and illegal markup on web. */}
        {!m.deleted && m.media.length ? <MediaStrip media={m.media} onOpen={onOpenMedia} /> : null}

        {!isKai && m.is_claim && !m.deleted ? (
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <ClaimChip
              state={
                m.verified_by?.result === 'verified' ? 'verified'
                : m.verified_by?.result === 'partially_verified' ? 'partial'
                : m.verified_by?.result === 'false' ? 'false'
                : 'unverified'
              }
              label={m.verified_by?.label}
            />
          </View>
        ) : null}

        {/* A removed post takes its reactions and its thread line with it.
            There is nothing left to agree with, and offering to comment on a
            gap is an invitation to argue with the moderation. */}
        {!m.deleted ? (
          <>
            <ReactionBar reactions={m.reactions} onToggle={onReact} onReply={onReply} testID={`reactions-${m.id}`} />
            {!hideThreadLine && onOpenThread ? (
              <ThreadLine count={m.reply_count} onPress={onOpenThread} testID={`thread-${m.id}`} />
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

/** A posted structured idea, rendered as the field object it was written as. */
export function StructuredBlock({ idea }: { idea: NonNullable<RoomMessage['structured_idea']> }) {
  const rows = [
    ['Direction & thesis', idea.direction_thesis],
    ['Entry condition', idea.entry_condition],
    ['Invalidation', idea.invalidation],
    ['Risk & size', idea.risk_size],
    ['Target & horizon', idea.target_horizon],
  ].filter(([, v]) => !!v);
  return (
    <View
      style={{
        marginTop: 6, borderRadius: radius.lg, borderWidth: 0.5, borderColor: alpha.ivory16,
        paddingHorizontal: 12, paddingVertical: 2, backgroundColor: alpha.surface50,
      }}
    >
      {rows.map(([label, value], i) => (
        <View key={label} style={{ paddingVertical: 8, borderBottomWidth: i === rows.length - 1 && !idea.evidence.length ? 0 : 0.5, borderBottomColor: alpha.ivory08 }}>
          <T size={10} c={color.muted}>{label}</T>
          <T size={13} lh={18} style={{ marginTop: 2 }}>{value}</T>
        </View>
      ))}
      {idea.evidence.length ? (
        <View style={{ paddingVertical: 8, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {idea.evidence.map((e) => (
            <View key={e} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, borderWidth: 0.5, borderColor: alpha.cyan40, backgroundColor: alpha.cyan07 }}>
              <T size={11} c={color.cyan}>{e}</T>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
