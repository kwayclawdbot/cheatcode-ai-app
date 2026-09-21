import React from 'react';
import { View, Pressable } from 'react-native';
import { alpha, color, radius } from '../../../ui/tokens';
import { T } from '../../../ui/Text';
import { Avatar, ClaimChip } from './Chrome';
import { KaiObjectView } from './KaiObjects';
import type { MessageMedia, ReactionKind, RoomMessage } from '../types';
import { MediaStrip, QuoteBlock, ReactionBar, ThreadLine } from './Social';
import { PostBody } from './PostBody';
import { MemberName } from '../../social/MemberName';
import { CallObject } from '../feed/PostObjects';
import { CHAT, ChatRow, RoleWord, chatTime } from './ChatRow';

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
  continued = false,
}: {
  message: RoomMessage;
  selected?: boolean;
  onSelect?: () => void;
  onOpenAuthor?: () => void;
  onMore?: () => void;
  showStructured?: boolean;
  /**
   * The same person's next line in one turn (`continuesTurn`) — drawn without
   * the avatar and the name, the way every group chat does it.
   */
  continued?: boolean;
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
  const educator = m.author.role_labels.some((r) => roleTone(r) === 'gold');
  /* Kai's own "AI" label is his whole introduction; a second one would be noise. */
  const roles = m.author.role_labels.filter((r) => !(isKai && r.toLowerCase() === 'ai'));

  /*
    A CHAT LINE, NOT A RECORD. The shell is `ChatRow` — see its header for the
    history. What this file decides is the content: whose door the name is, and
    what goes under the words.

    FOLLOW IS NOT ON THIS LINE. It was, on every message from anybody else,
    from 6 Sept; the owner's word for the result was "techy". It lives on the
    profile, which the name and the picture both open.
  */
  return (
    <ChatRow
      testID={`message-row-${m.id}`}
      continued={continued}
      selected={!!selected}
      deleted={m.deleted}
      deletedText="This message was removed."
      avatar={(
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isKai ? 'Kai' : `Open ${m.author.display_name}'s profile`}
          disabled={isKai || !onOpenAuthor}
          onPress={onOpenAuthor}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Avatar
            size={CHAT.avatar}
            initial={m.author.initial}
            url={m.author.avatar_url}
            tone={isKai ? 'kai' : educator ? 'educator' : 'neutral'}
          />
        </Pressable>
      )}
      /*
        NAME IS A DOOR, AND IT IS DYED. `MemberName` routes itself and inks the
        name with the belt. Kai keeps violetLight and is not a door: he is not a
        member and there is no profile behind him. A deleted author has no
        `user_id`, so they are not a door either. The handle stays on the
        profile — in a chat the name is enough to know who is talking.
      */
      name={isKai || !m.author.user_id ? (
        <T size={CHAT.name} weight="bold" c={isKai ? color.violetLight : color.text}>{m.author.display_name}</T>
      ) : (
        <MemberName
          name={m.author.display_name}
          userId={m.author.user_id}
          belt={m.author.belt}
          stage={m.author.stage}
          size={CHAT.name}
          testID={`message-author-name-${m.id}`}
        />
      )}
      meta={(
        <>
          {isKai ? <RoleWord label="AI" /> : null}
          {roles.map((r) => <RoleWord key={r} label={r} />)}
          <T size={CHAT.meta} c={color.dim}>{chatTime(m.time_label)}</T>
          {m.position_disclosure ? (
            <T
              size={CHAT.meta}
              c={m.position_disclosure.holds ? color.gold : color.muted}
              accessibilityLabel={`Position disclosure: ${m.position_disclosure.label}`}
            >
              {`· ${m.position_disclosure.label}`}
            </T>
          ) : null}
        </>
      )}
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
            <View style={{ marginTop: 4 }}>
              <KaiObjectView object={m.kai_object} />
            </View>
          ) : (
            <>
              {/* The post being answered goes ABOVE the answer, the way a
                  quotation does on paper. */}
              {m.quote ? (
                <View style={{ marginTop: 3 }}>
                  <QuoteBlock
                    quote={m.quote}
                    onOpen={onOpenQuote ? () => onOpenQuote(m.quote!.message_id) : undefined}
                    testID={`quote-${m.id}`}
                  />
                </View>
              ) : null}
              {/* A member's call is drawn as its card below, IN PLACE of the
                  sentence it arrived with — both describe the same trade, and
                  printing the two says the idea twice. */}
              {/* A call arrives with a generated sentence that restates its
                  levels; the compact call object below already shows them, so
                  the line says the member's THESIS instead — the why, which the
                  card does not carry (V1 board: the talk, then the plan). */}
              {m.community_call ? (
                m.community_call.thesis ? (
                  <PostBody text={m.community_call.thesis} size={CHAT.body} lineHeight={CHAT.bodyLh} onTicker={onTicker} />
                ) : null
              ) : m.body ? (
                <PostBody text={m.body} size={CHAT.body} lineHeight={CHAT.bodyLh} onTicker={onTicker} />
              ) : null}
              {m.structured_idea && showStructured ? <StructuredBlock idea={m.structured_idea} /> : null}
            </>
          )}
        </Pressable>
      )}
      beneath={(
        <>
          {/* Outside the selection Pressable: the card holds its own buttons. */}
          {m.community_call ? (
            <View style={{ marginTop: 6 }} testID={`message-call-${m.id}`}>
              <CallObject
                call={m.community_call}
                testID={`message-call-object-${m.id}`}
                onOpen={onTicker ? () => onTicker(m.community_call!.symbol) : undefined}
              />
            </View>
          ) : null}
          {/* Pictures sit OUTSIDE the selection Pressable: tapping a photo opens
              the photo, and nesting a pressable inside a pressable makes that
              ambiguous on iOS and illegal markup on web. */}
          {m.media.length ? <MediaStrip media={m.media} onOpen={onOpenMedia} /> : null}
          {!isKai && m.is_claim ? (
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
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
          <T variant="meta" c={color.muted}>{label}</T>
          <T variant="meta" lh={18} style={{ marginTop: 2 }}>{value}</T>
        </View>
      ))}
      {idea.evidence.length ? (
        <View style={{ paddingVertical: 8, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {idea.evidence.map((e) => (
            <View key={e} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, borderWidth: 0.5, borderColor: alpha.cyan40, backgroundColor: alpha.cyan07 }}>
              <T variant="meta" c={color.cyan}>{e}</T>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
