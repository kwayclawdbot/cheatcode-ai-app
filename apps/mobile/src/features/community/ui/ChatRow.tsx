import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, color, radius } from '../../../ui/tokens';
import { T } from '../../../ui/Text';
import type { RoomMessage } from '../types';

/**
 * ONE LINE OF A GROUP CHAT — the shell both chat surfaces draw.
 *
 * WHY THIS EXISTS (owner, 21 Sept, on the live app): "the community chat ui is
 * different also it looks techy and had follow button on each chat text,
 * doesnt feel community like it used to."
 *
 * What it "used to" be is the 6 Sept room (8db311d): avatar, name, a small
 * time right beside the name, and the words straight underneath — the rhythm
 * of every group chat people already use. Two later changes took that away:
 *
 *   · 1cfb671 (6 Sept, evening) put a volt Follow pill on the author line of
 *     every message from anybody else. At a normal text size it sat at the
 *     end of the line; at the owner's 130% it wrapped onto a line of its own,
 *     so every message opened with a button.
 *   · 659aeb9 (8 Sept) moved both chats onto the trade kit's
 *     `ConversationRow`. That shell was built for trade objects: it pushes the
 *     time to the far edge, puts an 8pt gap between the name and the words,
 *     and prints the handle and bordered role chips on the same line — a
 *     header that reads like a record, not a person talking.
 *
 * So the chats have their own shell again, and it keeps the two rules the kit
 * shell was right to hold in one place:
 *
 *   · THE BELT LAW. The caller passes the name, and the name must be dyed
 *     (`MemberName` does it; Kai stays violet). This file never colours a name.
 *   · THE DELETED REFUSAL. A removed message prints the caller's sentence and
 *     nothing else — no body, no card, no pictures, no reactions, no thread.
 *
 * And it adds the one thing a chat has that a feed of records does not:
 * CONSECUTIVE MESSAGES FROM ONE PERSON ARE ONE TURN. The second and third
 * lines sit under the first without repeating the avatar and the name — see
 * `continuesTurn` for exactly when.
 *
 * FOLLOW IS NOT HERE, ON PURPOSE. Following is a decision about a person, and
 * it lives where the person is: tap the name (or the picture) and the profile
 * has the button. A chat line is for what somebody said.
 */

/** The chat's measurements. One place, so the two surfaces cannot drift. */
export const CHAT = {
  avatar: 36,
  gutter: 10,
  name: 14.5,
  body: 15,
  bodyLh: 21,
  meta: 11.5,
  /** How much a continued line pulls up into the list's gap. */
  continuedPull: -8,
} as const;

/** Two lines from the same person this close together read as one turn. */
const TURN_WINDOW_MS = 5 * 60 * 1000;

/**
 * "Today at 9:40" → "9:40". Every message in a live chat is today's; saying so
 * on each line is the kind of repetition that makes a chat read like a log.
 * Anything else ("Yesterday at 9:40", a date) is kept as the server wrote it.
 */
export function chatTime(label: string | null | undefined): string {
  return String(label ?? '').replace(/^today at\s+/i, '');
}

/**
 * Does `m` continue `prev`'s turn? Only when it is plainly the same person
 * still talking:
 *   · same member (a real user id — a deleted author has none to compare),
 *   · neither is Kai (his answers are objects and always get their own header),
 *   · neither was removed (a removed line should not borrow a live header),
 *   · `m` carries no Kai object or call card (a trade object gets a header),
 *   · and it came within five minutes.
 */
export function continuesTurn(prev: RoomMessage | null | undefined, m: RoomMessage): boolean {
  if (!prev) return false;
  if (m.author.is_kai || prev.author.is_kai) return false;
  if (!m.author.user_id || m.author.user_id !== prev.author.user_id) return false;
  if (m.deleted || prev.deleted || m.author_deleted) return false;
  if (m.kai_object || m.community_call) return false;
  const gap = Date.parse(m.created_at) - Date.parse(prev.created_at);
  return Number.isFinite(gap) && gap >= 0 && gap <= TURN_WINDOW_MS;
}

/** A role, said quietly: a word in the header, not a bordered badge. */
export function RoleWord({ label }: { label: string }) {
  const l = label.toLowerCase();
  const c = l === 'ai' ? color.violetLight
    : l.includes('educator') || l.includes('expert') ? color.gold
    : l.includes('verified') ? color.green
    : color.muted;
  return <T size={CHAT.meta} weight="medium" c={c}>{label}</T>;
}

export function ChatRow({
  avatar,
  name,
  meta,
  continued = false,
  selected = false,
  deleted = false,
  deletedText = 'This message was removed.',
  body,
  beneath,
  reactions,
  thread,
  onLongPress,
  contentStyle,
  testID,
}: {
  /** The picture, already a door to the profile where there is one. */
  avatar: React.ReactNode;
  /** The name, already dyed with the belt (see the header). */
  name: React.ReactNode;
  /** After the name: role word, disclosure, the time. Kept small. */
  meta?: React.ReactNode;
  /** The same person's next line — no avatar, no header. */
  continued?: boolean;
  selected?: boolean;
  deleted?: boolean;
  deletedText?: string;
  body?: React.ReactNode;
  beneath?: React.ReactNode;
  reactions?: React.ReactNode;
  thread?: React.ReactNode;
  onLongPress?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const content = (
    <View style={[{ flex: 1, minWidth: 0 }, contentStyle]}>
      {continued ? null : (
        <View
          style={{
            flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
            columnGap: 7, rowGap: 2, marginBottom: 2,
          }}
        >
          {name}
          {meta}
        </View>
      )}
      {deleted ? (
        <T variant="meta" c={color.dim} testID={testID ? `${testID}-removed` : undefined}>{deletedText}</T>
      ) : (
        <>
          {body}
          {beneath}
          {reactions}
          {thread}
        </>
      )}
    </View>
  );

  const rowStyle: StyleProp<ViewStyle> = [
    { flexDirection: 'row', gap: CHAT.gutter },
    continued ? { marginTop: CHAT.continuedPull } : null,
    selected ? {
      backgroundColor: alpha.violet08, borderRadius: radius.lg,
      marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 6,
    } : null,
  ];

  const inner = (
    <>
      {/* The avatar column stays even on a continued line, so the words of one
          turn line up under each other instead of jumping left. */}
      <View style={{ width: CHAT.avatar }}>{continued ? null : avatar}</View>
      {content}
    </>
  );

  /* No accessibilityRole on the long-press wrapper: a row contains buttons, and
     react-native-web renders role="button" as a <button>, which cannot hold
     another one. */
  return onLongPress ? (
    <Pressable testID={testID} onLongPress={onLongPress} delayLongPress={350} style={rowStyle}>
      {inner}
    </Pressable>
  ) : (
    <View testID={testID} style={rowStyle}>{inner}</View>
  );
}
