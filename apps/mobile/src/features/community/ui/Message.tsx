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
import { ConversationRow, type ConversationMessage } from '../../../ui/trade';

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

  /*
    THE ROW IS THE KIT'S NOW, AND THE ROOM'S FEATURES CAME WITH IT.

    `docs/trade-ui-MIGRATION.md` step 4 recorded that this could not move,
    because `RoomMessage` carries twenty-odd fields and `ConversationMessage`
    had eight, and putting the kit's preview here would have deleted a dozen
    shipped features to gain a shared shell. That objection was correct about
    the shape it was arguing against and is answered by a different one: the
    kit owns the SHELL and takes the rest as SLOTS, so not one of those
    features is reimplemented — every component below is the same component
    this row has always drawn, passed through.

    What moved into the kit is what two independent implementations were most
    likely to drift on: the row geometry, the order of the header line, the
    BELT LAW on the name, and the refusal to draw a removed message's body,
    reactions, media or thread line. That refusal used to be four separate
    `!m.deleted &&` guards in this file, each of which had to be remembered;
    it is one rule in one place now.
  */
  const asMessage: ConversationMessage = {
    id: m.id,
    name: m.author.display_name,
    text: m.body ?? '',
    timeLabel: m.time_label,
    belt: m.author.belt ?? null,
    isKai,
    /* Kai and a deleted author print their handle plainly here; a member's is
       inside `MemberName`, where it is part of the same door as the name. */
    handle: isKai || !m.author.user_id ? m.author.handle : null,
    deleted: m.deleted,
    deletedText: 'This message was removed.',
    authorDeleted: m.author_deleted,
  };

  return (
    <ConversationRow
      message={asMessage}
      testID={`message-row-${m.id}`}
      selected={!!selected}
      avatar={(
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
      )}
      /*
        NAME AND USERNAME ARE ONE DOOR. `MemberName` holds both and routes
        itself, and it dyes the name with the belt — the kit's default does the
        same thing, so the law holds whichever of the two draws it.

        Kai keeps violetLight, keeps his role chip, and is not a door: he is not
        a member and there is no profile behind him. A deleted author has no
        `user_id`, so they are not a door either.

        AN EDUCATOR'S NAME IS NOT GOLD. A name can carry one claim and the belt
        is the one the owner asked for; gold was doing the work of the RoleChip
        printed right beside it.
      */
      name={isKai || !m.author.user_id ? (
        <T size={13.5} weight="bold" c={nameColor}>{m.author.display_name}</T>
      ) : (
        <MemberName
          name={m.author.display_name}
          userId={m.author.user_id}
          belt={m.author.belt}
          stage={m.author.stage}
          handle={m.author.handle}
          showHandle
          size={13.5}
          handleSize={11.5}
          testID={`message-author-name-${m.id}`}
        />
      )}
      /* Kai's role chip already says "AI" on this surface, so the kit's own
         marker is suppressed rather than printed a second time beside it. */
      aiTag={null}
      chips={(
        <>
          {m.author.role_labels.map((r) => <RoleChip key={r} label={r} tone={roleTone(r)} />)}
          {m.position_disclosure ? (
            <DisclosureChip label={m.position_disclosure.label} holds={m.position_disclosure.holds} />
          ) : null}
        </>
      )}
      /*
        Follow is a SIBLING of the name's pressable and never a child of it: on
        web a role of "button" renders as a real <button>, and one cannot
        contain another. Same rule as MediaStrip and the call card below.
      */
      aside={showFollow && !isKai && m.author.user_id ? (
        <FollowButton userId={m.author.user_id} compact testID={`message-follow-${m.id}`} />
      ) : null}
      body={(
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
          {m.kai_object ? (
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
      beneath={(
        <>
          {/*
            A MEMBER'S CALL IS THE BODY, WHEN THERE IS ONE — drawn in place of
            the words, because the body it arrived with describes the same
            trade and printing both would say the idea twice.

            IT SITS OUTSIDE THE SELECTION PRESSABLE for the nesting rule above.
            The cost is that a call cannot be long-pressed for the moderation
            sheet from this row; it can still be reacted to, replied to and
            opened as a thread, and the club feed's row does offer the actions.
          */}
          {m.community_call ? (
            <View style={{ marginTop: 4 }} testID={`message-call-${m.id}`}>
              <CommunityCallCard call={m.community_call} compact />
            </View>
          ) : null}
          {/* Pictures sit OUTSIDE the selection Pressable: tapping a photo opens
              the photo, and nesting a pressable inside a pressable makes that
              ambiguous on iOS and illegal markup on web. */}
          {m.media.length ? <MediaStrip media={m.media} onOpen={onOpenMedia} /> : null}
          {!isKai && m.is_claim ? (
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
        </>
      )}
      reactions={(
        <ReactionBar reactions={m.reactions} onToggle={onReact} onReply={onReply} testID={`reactions-${m.id}`} />
      )}
      thread={!hideThreadLine && onOpenThread ? (
        <ThreadLine count={m.reply_count} onPress={onOpenThread} testID={`thread-${m.id}`} />
      ) : null}
    />
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
