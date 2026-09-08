/**
 * WHAT AN EMPTY ROOM SAYS TO SOMEBODY WHO HAS NEVER POSTED (audit F14, P2).
 *
 * The old empty state was one sentence — "Be the first. Say what you are
 * watching and why" — under a header holding seven controls. The audit's
 * objection is exact: "A novice may have no ticker to discuss and no confidence
 * to post." Being asked to open with a stock pick is the hardest possible first
 * message, and it is asked of the people least able to write it.
 *
 * So the room still says it is empty, and then it offers TWO QUESTIONS instead
 * of one instruction. Tapping one puts those words in the composer — it does
 * NOT post them. The member reads their own question sitting in the box, can
 * change it, and presses send themselves; a tap that silently publishes under
 * somebody's name is not a starter, it is a ghostwriter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE IS INVENTED, AND THAT IS MOST OF THE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 * There is no member count, no "3 people are here", no sample conversation and
 * no placeholder avatars. Four accounts have ever existed on this database.
 * An empty room that draws faces is a lie a newcomer will believe for exactly
 * as long as it takes them to post and get no reply.
 *
 * The line under the heading is the ROOM'S OWN description, from the server
 * (migration 0045 wrote the three, an admin may edit them). A room with no
 * description gets no line rather than a cheerful one made up here.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T } from '../../../ui/Text';
import { alpha, color, radius } from '../../../ui/tokens';

/**
 * The two questions.
 *
 * The first is the audit's own suggestion, word for word, and it is the right
 * one: a stop is the first piece of jargon this product uses on somebody, it
 * appears on every setup card, and not knowing it is the most common reason a
 * beginner reads the room without posting.
 *
 * The second asks for orientation rather than knowledge, so somebody who does
 * not yet know what they do not know still has something true to say.
 *
 * TWO, NOT SIX. A wall of suggested questions is a quiz. Two reads as an
 * example of the kind of thing this room is for, which is the actual job.
 */
export const QUESTION_STARTERS = [
  'Can someone explain a stop?',
  "I'm new here — what should I look at first?",
] as const;

export function RoomWelcome({
  roomName, description, onStarter, testID,
}: {
  roomName: string;
  description?: string | null;
  /** Puts the question in the composer. Never posts it. */
  onStarter: (text: string) => void;
  testID?: string;
}) {
  return (
    <View
      testID={testID ?? 'room-welcome'}
      style={{
        gap: 10,
        borderRadius: radius.xl,
        borderWidth: 0.5,
        borderColor: alpha.ivory10,
        padding: 16,
      }}
    >
      <View style={{ gap: 4 }}>
        <T size={15} weight="bold">Nobody has posted in {roomName} yet.</T>
        {description ? (
          <T size={12.5} lh={18} c={color.muted}>{description}</T>
        ) : null}
        <T size={12.5} lh={18} c={color.muted}>
          A question is a good first post. Nobody here minds being asked.
        </T>
      </View>

      <View style={{ gap: 8 }}>
        {QUESTION_STARTERS.map((q) => (
          <Pressable
            key={q}
            testID={`starter-${q.slice(0, 12).replace(/\W+/g, '-').toLowerCase()}`}
            accessibilityRole="button"
            accessibilityLabel={q}
            accessibilityHint="Puts this question in the message box. You still send it yourself."
            onPress={() => onStarter(q)}
            style={({ pressed }) => ({
              paddingVertical: 10,
              paddingHorizontal: 13,
              borderRadius: radius.pill,
              borderWidth: 0.5,
              borderColor: alpha.volt40,
              backgroundColor: alpha.volt06,
              alignSelf: 'flex-start',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <T size={12.5} weight="semibold" c={color.volt}>{q}</T>
          </Pressable>
        ))}
      </View>

      <T size={10.5} lh={15} c={color.dim}>
        Tapping one writes it in the box below. Nothing is sent until you send it.
      </T>
    </View>
  );
}
