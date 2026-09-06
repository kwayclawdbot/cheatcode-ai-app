/**
 * THE SOCIAL LAYER'S THREE PIECES: reactions, pictures, and the line that leads
 * into a thread.
 *
 * Shared by the room screen, the club feed and a circle, so a reaction looks
 * and behaves identically wherever a message is drawn. Three copies of a
 * reaction bar is three sets of counts that drift.
 *
 * DESIGN LAW, applied rather than decorated:
 *   · Volt is the USER. A reaction is always the user's own act, so an active
 *     one is volt. Cyan is the MARKET, which is why "Watching" — the only one
 *     that is about an instrument rather than about the post — takes cyan when
 *     it is on. Violet is Kai's and appears nowhere here; Kai does not react.
 *   · Hairlines and rules. Every chip is a 0.5pt border on the background, and
 *     the thread affordance is a rule, not a button in a box. Nothing is a
 *     rounded card sitting in a grid of rounded cards.
 *   · A count of zero is not drawn. An unreacted post shows four quiet
 *     outlines, not four zeroes.
 */
import React, { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { alpha, color, radius } from '../../../ui/tokens';
import { T, Num } from '../../../ui/Text';
import { REACTIONS, type MessageMedia, type MessageReactions, type ReactionKind } from '../types';

/* ------------------------------------------------------------------ */
/* Reactions                                                            */
/* ------------------------------------------------------------------ */

export function ReactionBar({
  reactions,
  onToggle,
  disabled,
  compact,
  testID,
}: {
  reactions: MessageReactions;
  onToggle?: (kind: ReactionKind) => void;
  disabled?: boolean;
  /** True in a dense list: only reactions somebody has actually used show. */
  compact?: boolean;
  testID?: string;
}) {
  const anyCount = REACTIONS.some((r) => (reactions.counts[r.id] ?? 0) > 0);
  const shown = compact && anyCount
    ? REACTIONS.filter((r) => (reactions.counts[r.id] ?? 0) > 0 || reactions.mine.includes(r.id))
    : REACTIONS;

  return (
    <View testID={testID ?? 'reaction-bar'} style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
      {shown.map((r) => {
        const count = reactions.counts[r.id] ?? 0;
        const on = reactions.mine.includes(r.id);
        // Volt for the user's own act; cyan for the one about the market. The
        // OFF state is deliberately quiet — a row of four bright chips under
        // every post turns the room into a scoreboard.
        const tint = on ? (r.tone === 'market' ? color.cyan : color.volt) : color.dim;
        const border = on
          ? r.tone === 'market'
            ? alpha.cyan40
            : alpha.volt50
          : alpha.ivory12;

        return (
          <Pressable
            key={r.id}
            testID={`react-${r.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${r.label}${count ? `, ${count} so far` : ''}`}
            accessibilityHint={r.plain}
            accessibilityState={{ selected: on, disabled: !!disabled }}
            disabled={disabled || !onToggle}
            onPress={() => onToggle?.(r.id)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: radius.md,
              borderWidth: 0.5,
              borderColor: border,
              opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
            })}
          >
            <T size={10.5} weight={on ? 'semibold' : 'regular'} c={tint}>
              {r.label}
            </T>
            {count > 0 ? (
              <Num size={10} weight="regular" c={tint}>
                {String(count)}
              </Num>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Pictures                                                             */
/* ------------------------------------------------------------------ */

/**
 * The pictures on a message.
 *
 * ONE picture gets the room's full width at its own aspect ratio; TWO OR MORE
 * share a row of squares. A grid of identical thumbnails would crop a chart
 * screenshot — where the axis labels at the edges are the whole point — so a
 * single image is never cropped.
 *
 * The height is reserved from `aspect` BEFORE the bytes arrive. Without it the
 * conversation jumps down the screen as each picture lands, which on a slow
 * connection makes the room unreadable while it loads.
 *
 * A picture whose signature has expired or whose object is gone renders as a
 * ruled box that says so, rather than a blank or a broken glyph.
 */
export function MediaStrip({
  media,
  onOpen,
  maxWidth,
  testID,
}: {
  media: MessageMedia[];
  onOpen?: (m: MessageMedia) => void;
  maxWidth?: number;
  testID?: string;
}) {
  const { width: screenWidth } = useWindowDimensions();
  if (!media.length) return null;

  const width = maxWidth ?? Math.min(screenWidth - 84, 320);

  if (media.length === 1) {
    const m = media[0];
    const aspect = m.aspect && m.aspect > 0 ? Math.min(m.aspect, 1.6) : 0.66;
    return (
      <View testID={testID ?? 'media-strip'} style={{ marginTop: 8 }}>
        <Frame m={m} width={width} height={Math.round(width * aspect)} onOpen={onOpen} />
      </View>
    );
  }

  const side = Math.floor((width - 6 * (Math.min(media.length, 3) - 1)) / Math.min(media.length, 3));
  return (
    <View testID={testID ?? 'media-strip'} style={{ marginTop: 8, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {media.map((m) => (
        <Frame key={m.id} m={m} width={side} height={side} onOpen={onOpen} />
      ))}
    </View>
  );
}

function Frame({
  m,
  width,
  height,
  onOpen,
}: {
  m: MessageMedia;
  width: number;
  height: number;
  onOpen?: (m: MessageMedia) => void;
}) {
  const [failed, setFailed] = useState(false);

  if (!m.url || failed) {
    return (
      <View
        testID={`media-gone-${m.id}`}
        style={{
          width,
          height,
          borderWidth: 0.5,
          borderColor: alpha.ivory12,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 10,
        }}
      >
        <T size={11} c={color.dim} style={{ textAlign: 'center' }}>
          This picture is no longer available.
        </T>
      </View>
    );
  }

  return (
    <Pressable
      testID={`media-${m.id}`}
      accessibilityRole="imagebutton"
      accessibilityLabel="Picture attached to this post. Open it full size."
      disabled={!onOpen}
      onPress={() => onOpen?.(m)}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Image
        source={{ uri: m.url }}
        onError={() => setFailed(true)}
        contentFit="cover"
        transition={140}
        style={{
          width,
          height,
          borderRadius: radius.md,
          borderWidth: 0.5,
          borderColor: alpha.ivory12,
          backgroundColor: color.surface3,
        }}
      />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* The way into a thread                                                */
/* ------------------------------------------------------------------ */

/**
 * A rule and a sentence, not a button in a box.
 *
 * It says the real number when there is one and "Comment" when there is not,
 * so a post with no comments still offers the way in without pretending there
 * is a conversation waiting.
 */
export function ThreadLine({
  count,
  onPress,
  testID,
}: {
  count: number;
  onPress: () => void;
  testID?: string;
}) {
  const label = count === 0 ? 'Comment' : count === 1 ? '1 comment' : `${count} comments`;
  return (
    <Pressable
      testID={testID ?? 'thread-line'}
      accessibilityRole="button"
      accessibilityLabel={count === 0 ? 'Comment on this post' : `Open ${label}`}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 7,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 14, height: 0.5, backgroundColor: alpha.ivory24 }} />
      <T size={11} weight={count > 0 ? 'semibold' : 'regular'} c={count > 0 ? color.text : color.muted}>
        {label}
      </T>
    </Pressable>
  );
}
