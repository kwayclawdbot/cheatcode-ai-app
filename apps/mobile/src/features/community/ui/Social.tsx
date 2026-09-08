/**
 * THE SOCIAL LAYER'S FOUR PIECES: reactions, the quote block, pictures, and the
 * line that leads into a thread.
 *
 * Shared by the room screen, the club feed and a circle, so a reaction looks
 * and behaves identically wherever a message is drawn. Three copies of a
 * reaction bar is three sets of counts that drift.
 *
 * DESIGN LAW, applied rather than decorated:
 *   · Volt is the USER. A reaction is always the user's own act, so an active
 *     one is volt. Cyan is the MARKET, which is why the two chart reactions —
 *     the only ones about an instrument rather than about the post — take cyan
 *     when they are on. Violet is Kai's and appears nowhere here; Kai does not
 *     react.
 *   · Hairlines and rules. Every chip is a 0.5pt border on the background, the
 *     quote is a rule down its left edge, and the thread affordance is a rule,
 *     not a button in a box. Nothing is a rounded card inside a rounded card.
 *   · A count of zero is not drawn — AT ALL. The old bar drew every kind as a
 *     quiet outline whether or not anybody had used it, which under a six-emoji
 *     set would be a permanent row of six grey glyphs under every post. Now an
 *     unreacted post shows one word, "Like", and nothing else.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Modal, Platform, Pressable, View, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { alpha, color, radius } from '../../../ui/tokens';
import { T, Num } from '../../../ui/Text';
import {
  ALL_REACTIONS, REACTIONS, reactionDef,
  type MessageMedia, type MessageQuote, type MessageReactions, type ReactionDef, type ReactionKind,
} from '../types';

/* ------------------------------------------------------------------ */
/* Reactions                                                            */
/* ------------------------------------------------------------------ */

/** The picker's geometry, fixed because its contents are fixed: six glyphs. */
const CELL = 40;
const CELL_GAP = 2;
const PICKER_PAD = 6;
const PICKER_W = PICKER_PAD * 2 + REACTIONS.length * CELL + (REACTIONS.length - 1) * CELL_GAP;
const PICKER_H = PICKER_PAD * 2 + CELL;
/** Gap between the trigger and the popover, and from the screen edge. */
const OFFSET = 8;
const EDGE = 12;

type Anchor = { x: number; y: number; w: number; h: number };

const toneColor = (r: ReactionDef) => (r.tone === 'market' ? color.cyan : color.volt);
const toneBorder = (r: ReactionDef) => (r.tone === 'market' ? alpha.cyan40 : alpha.volt50);
const toneFill = (r: ReactionDef) => (r.tone === 'market' ? alpha.cyan10 : alpha.volt10);

/**
 * Does this person want motion at all.
 *
 * Reduced motion is not "no animation" — it is no MOVEMENT. The picker still
 * fades, it just stops springing out of the button, because that spring is the
 * part that makes somebody with vestibular sensitivity feel it.
 */
/**
 * RE-EXPORTED, NOT REIMPLEMENTED. This used to be a local copy that read the OS
 * setting and nothing else, so a member who chose "Reduce motion" in Account saw
 * the switch save and this screen keep moving — the audit's F19. The provider in
 * `features/a11y` combines the OS setting with the member's preference, and the
 * OR runs one way only: a phone set to reduce motion cannot be overridden from
 * inside the app. `ui/Skeleton.tsx` imports this name from here, so the export
 * stays put rather than making every caller move.
 */
import { useReducedMotion } from '../../a11y/context';
export { useReducedMotion };

/**
 * THE SIX, IN A ROW, OVER THE BUTTON THAT OPENED THEM.
 *
 * It is a popover and not a sheet on purpose. A sheet is a place you go; this
 * is a gesture you make, it costs one tap, and dragging the whole screen up to
 * cover the conversation you are reacting to is the wrong weight for it.
 *
 * It lives in a transparent `Modal` because a popover anchored inside a
 * scrolling message row gets clipped by the row and cannot be dismissed by
 * tapping the conversation behind it. The Modal is the tap-away surface and the
 * escape from `overflow` — none of it is drawn, so what you SEE is a small
 * floating row, which is what was asked for.
 *
 * IT GROWS FROM THE BUTTON. React Native has no `transform-origin`, so the
 * origin is moved by hand: translate to the anchor point, scale, translate
 * back. Without it the row scales from its own middle and reads as arriving
 * from nowhere rather than out of the thing you pressed.
 */
function ReactionPicker({
  anchor, mine, onPick, onClose,
}: {
  anchor: Anchor;
  mine: ReactionKind[];
  onPick: (kind: ReactionKind) => void;
  onClose: () => void;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== 'web';

  // Above the trigger where there is room, below it where there is not — a
  // popover that runs off the top of the screen is worse than one that flips.
  const above = anchor.y - PICKER_H - OFFSET > EDGE || anchor.y > winH / 2;
  const top = above ? anchor.y - PICKER_H - OFFSET : anchor.y + anchor.h + OFFSET;
  const left = Math.min(Math.max(anchor.x - PICKER_PAD, EDGE), Math.max(EDGE, winW - PICKER_W - EDGE));

  // The anchor point in coordinates relative to the popover's own centre —
  // horizontally the middle of the button, vertically whichever edge faces it.
  const originX = Math.max(-PICKER_W / 2, Math.min(PICKER_W / 2, anchor.x + anchor.w / 2 - (left + PICKER_W / 2)));
  const originY = above ? PICKER_H / 2 : -PICKER_H / 2;

  useEffect(() => {
    // Enter on a spring — barely any bounce. This is a control, not a toy, and
    // a picker that wobbles under a post about somebody's money is the wrong
    // register entirely.
    Animated.spring(t, {
      toValue: 1,
      stiffness: 340,
      damping: 24,
      mass: 0.7,
      useNativeDriver: native,
    }).start();
  }, [t, native]);

  /** Exit is a fast fade, never a spring. Slow to decide, quick to answer. */
  const dismiss = useCallback((then?: () => void) => {
    Animated.timing(t, { toValue: 0, duration: 110, useNativeDriver: native }).start(() => {
      then?.();
      onClose();
    });
  }, [t, native, onClose]);

  const opacity = t.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <Modal transparent visible animationType="none" onRequestClose={() => dismiss()}>
      {/* The whole screen catches the tap-away. It draws nothing: dimming the
          room would make this feel like a sheet, and it is not one. */}
      <Pressable
        testID="reaction-picker-dismiss"
        accessibilityLabel="Close the reactions"
        onPress={() => dismiss()}
        style={{ flex: 1 }}
      />
      <Animated.View
        testID="reaction-picker"
        accessibilityRole="menu"
        accessibilityLabel="Pick a reaction"
        style={{
          position: 'absolute',
          top,
          left,
          width: PICKER_W,
          height: PICKER_H,
          flexDirection: 'row',
          alignItems: 'center',
          padding: PICKER_PAD,
          gap: CELL_GAP,
          borderRadius: radius.pill,
          borderWidth: 0.5,
          borderColor: alpha.ivory20,
          // Opaque, not the translucent panel gradient: this floats over live
          // conversation and a see-through row of emoji is unreadable.
          backgroundColor: color.surface,
          opacity,
          transform: reduced ? [] : [
            { translateX: originX }, { translateY: originY },
            { scale },
            { translateX: -originX }, { translateY: -originY },
          ],
        }}
      >
        {REACTIONS.map((r) => {
          const on = mine.includes(r.id);
          return (
            <Pressable
              key={r.id}
              testID={`react-pick-${r.id}`}
              accessibilityRole="menuitem"
              accessibilityLabel={r.label}
              accessibilityHint={on ? 'You already gave this one. Tap to take it back.' : r.plain}
              accessibilityState={{ selected: on }}
              onPress={() => dismiss(() => onPick(r.id))}
              style={({ pressed }) => ({
                width: CELL,
                height: CELL,
                borderRadius: CELL / 2,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: on ? 0.5 : 0,
                borderColor: on ? toneBorder(r) : 'transparent',
                backgroundColor: on ? toneFill(r) : pressed ? alpha.ivory08 : 'transparent',
                // The press itself, felt rather than seen. Small, because the
                // target is small: a big squash on a 40pt circle looks broken.
                transform: [{ scale: pressed ? 0.9 : 1 }],
              })}
            >
              <T size={21}>{r.emoji}</T>
            </Pressable>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

/**
 * THE ACTION ROW UNDER A POST: Like, Reply, and what people have already said.
 *
 * One "Like" button, one "Reply" button, then one pill per emoji SOMEBODY HAS
 * ACTUALLY USED. A kind at zero is not a quiet outline waiting to be filled in,
 * it is absent — with six kinds the alternative is a permanent grey strip under
 * every post in the room, which is a scoreboard nobody asked for.
 *
 * The pills are tappable in their own right, which is the fast path: adding to
 * a reaction that is already there should not cost a trip through the picker.
 *
 * It is still called `ReactionBar` because four screens import it under that
 * name and renaming it would be churn for its own sake. What it is is the row.
 */
export function ReactionBar({
  reactions,
  onToggle,
  onReply,
  disabled,
  testID,
}: {
  reactions: MessageReactions;
  onToggle?: (kind: ReactionKind) => void;
  /** Answer this post, quoting it. Absent = this surface does not reply. */
  onReply?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const trigger = useRef<View | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const { width: winW, height: winH } = useWindowDimensions();

  // Ordered by the picker's own order, then the two legacy kinds, so the row
  // never re-shuffles as counts change. A pill that moves when somebody else
  // reacts is a pill you tap by mistake.
  const shown = ALL_REACTIONS
    .map((r) => ({ r, count: reactions.counts[r.id] ?? 0, on: reactions.mine.includes(r.id) }))
    .filter((x) => x.count > 0 || x.on);

  const open = () => {
    /**
     * measureInWindow, not measure: the popover is positioned in the Modal's
     * own coordinate space, which is the window, not this row's parent.
     *
     * The fallback is not defensive padding. If the measurement is unavailable
     * or comes back as zeros — which react-native-web can do for a node it has
     * not laid out yet — the alternative is a Like button that does nothing
     * when tapped, which is the worst outcome available. A picker over the
     * bottom of the screen still works; it is just not anchored.
     */
    const node = trigger.current as (View & { measureInWindow?: typeof View.prototype.measureInWindow }) | null;
    const loose: Anchor = { x: winW / 2 - 20, y: winH - 170, w: 40, h: 24 };
    if (!node?.measureInWindow) { setAnchor(loose); return; }
    node.measureInWindow((x, y, w, h) => {
      setAnchor(w > 0 || h > 0 ? { x, y, w, h } : loose);
    });
  };

  const anyMine = reactions.mine.length > 0;

  return (
    <View testID={testID ?? 'reaction-bar'} style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <Pressable
        ref={trigger}
        testID="react-open"
        accessibilityRole="button"
        accessibilityLabel="Like"
        accessibilityHint={
          anyMine
            ? `You reacted with ${reactions.mine.map((k) => reactionDef(k)?.label ?? k).join(', ')}. Opens the reactions.`
            : 'Opens six reactions: agree, disagree, fire, nailed it, going up, going down.'
        }
        accessibilityState={{ disabled: !!disabled, expanded: !!anchor }}
        disabled={disabled || !onToggle}
        onPress={open}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: radius.md,
          borderWidth: 0.5,
          borderColor: anyMine ? alpha.volt50 : alpha.ivory12,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        })}
      >
        {/*
          GREY UNTIL YOU HAVE SAID SOMETHING, THEN YOUR OWN WORD FOR IT.

          Unreacted it is the word "Like" set in `color.dim` on a plain ivory
          hairline — deliberately the quietest thing in the row, because under a
          feed of posts this button repeats more than any other object on the
          screen and a lit control on every one of them is the clutter the row
          was just cleared of.

          Reacted, it stops saying "Like" and SHOWS WHAT YOU GAVE. The word is
          a prompt and is only useful before you have answered it; afterwards
          the honest label is the emoji itself, which is also the fastest way to
          read your own state back at a glance. Somebody with more than one
          reaction gets the first and a count, rather than a row of emoji that
          would grow the button every time they tapped again — the pills below
          already carry the full picture, and this button only has to answer
          "have I reacted, and with what".
        */}
        {anyMine ? (
          <>
            <T size={11}>{reactionDef(reactions.mine[0])?.emoji ?? '👍'}</T>
            {reactions.mine.length > 1 ? (
              <Num size={10} weight="medium" c={color.volt}>{`+${reactions.mine.length - 1}`}</Num>
            ) : null}
          </>
        ) : (
          <T size={10.5} c={color.dim}>Like</T>
        )}
      </Pressable>

      {onReply ? (
        <Pressable
          testID="reply-open"
          accessibilityRole="button"
          accessibilityLabel="Reply"
          accessibilityHint="Opens the composer with this post quoted above what you write."
          accessibilityState={{ disabled: !!disabled }}
          disabled={disabled}
          onPress={onReply}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          style={({ pressed }) => ({
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: radius.md,
            borderWidth: 0.5,
            borderColor: alpha.ivory12,
            opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
          })}
        >
          <T size={10.5} c={color.dim}>Reply</T>
        </Pressable>
      ) : null}

      {shown.map(({ r, count, on }) => {
        const tint = on ? toneColor(r) : color.muted;
        return (
          <Pressable
            key={r.id}
            testID={`react-${r.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${r.label}${count ? `, ${count}` : ''}`}
            accessibilityHint={on ? 'You gave this one. Tap to take it back.' : r.plain}
            accessibilityState={{ selected: on, disabled: !!disabled }}
            disabled={disabled || !onToggle}
            onPress={() => onToggle?.(r.id)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 7,
              paddingVertical: 3,
              borderRadius: radius.md,
              borderWidth: 0.5,
              // The user's own reaction is the one that has to be legible at a
              // glance: tinted ground AND coloured edge, against a plain
              // hairline for everybody else's.
              borderColor: on ? toneBorder(r) : alpha.ivory12,
              backgroundColor: on ? toneFill(r) : 'transparent',
              opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
            })}
          >
            <T size={11}>{r.emoji}</T>
            {count > 0 ? (
              <Num size={10} weight={on ? 'medium' : 'regular'} c={tint}>
                {String(count)}
              </Num>
            ) : null}
          </Pressable>
        );
      })}

      {anchor && onToggle ? (
        <ReactionPicker
          anchor={anchor}
          mine={reactions.mine}
          onPick={onToggle}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The quote block                                                      */
/* ------------------------------------------------------------------ */

/**
 * THE POST BEING ANSWERED, CARRIED ON THE ANSWER.
 *
 * A rule down the left and the words set quiet — not a card. A quoted post
 * inside a message inside a feed of messages is already two levels of nesting;
 * putting a bordered, rounded, tinted box around it would make three, and the
 * quote would then compete with the reply that is the actual point.
 *
 * It is deliberately NOT the composer's text. The member's own words go in the
 * input; the quote is a separate object above them, so backspacing at the start
 * of a reply cannot chew into somebody else's sentence.
 */
export function QuoteBlock({
  quote,
  onOpen,
  compact,
  testID,
}: {
  quote: MessageQuote;
  /** Absent = the quote is not tappable (the composer's preview). */
  onOpen?: () => void;
  /** True in the composer, where the room's own type is already smaller. */
  compact?: boolean;
  testID?: string;
}) {
  const size = compact ? 11.5 : 12;
  const body = (
    <View
      style={{
        borderLeftWidth: 2,
        borderLeftColor: alpha.ivory24,
        paddingLeft: 9,
        paddingVertical: 1,
        gap: 1,
      }}
    >
      <T size={size - 1} weight="semibold" c={color.muted} numberOfLines={1}>
        {quote.handle ? `${quote.author_name} @${quote.handle}` : quote.author_name}
      </T>
      {quote.deleted ? (
        // The words are gone everywhere they were, including here. A quote that
        // keeps repeating a post a moderator removed makes the removal
        // pointless — it just scatters copies of it through the thread.
        <T size={size} lh={Math.round(size * 1.4)} c={color.dim}>This post was removed.</T>
      ) : (
        <T size={size} lh={Math.round(size * 1.4)} c={color.muted} numberOfLines={3}>
          {quote.text}
        </T>
      )}
    </View>
  );

  if (!onOpen) {
    return <View testID={testID ?? 'quote-block'} style={{ marginBottom: 6 }}>{body}</View>;
  }
  return (
    <Pressable
      testID={testID ?? 'quote-block'}
      accessibilityRole="button"
      accessibilityLabel={`Quoting ${quote.author_name}: ${quote.deleted ? 'this post was removed' : quote.text}`}
      accessibilityHint="Opens the post being answered."
      onPress={onOpen}
      style={({ pressed }) => ({ marginBottom: 6, opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
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
 * A rule and a sentence, not a button in a box — AND ONLY WHEN THERE IS A
 * CONVERSATION TO POINT AT.
 *
 * This used to say "Comment" when the count was zero, which put a prompt under
 * every single post in the room. Read one at a time it is an invitation; read
 * as a feed it is the same grey word repeating down the whole screen, and it
 * was the first thing the owner asked to be rid of.
 *
 * The rule it now follows is the one `ReactionBar` above already states for
 * reaction pills, in almost these words: a thing at zero is not a quiet outline
 * waiting to be filled in, it is ABSENT. That law was written for six emoji
 * kinds and simply never applied to the thread line beside them, which is why
 * the pills were clean and this was not.
 *
 * Nothing is lost by going. The way to start a thread is REPLY, which sits in
 * the row above, quotes the post and is present on every surface this line
 * appears on. The way into an existing thread is this line, which appears the
 * moment there is an existing thread. What disappears is only the offer to be
 * the first to comment — and a post whose answer is worth writing does not
 * need to ask.
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
  if (count <= 0) return null;
  const label = count === 1 ? '1 comment' : `${count} comments`;
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
      <T size={11} weight="semibold" c={color.text}>{label}</T>
    </Pressable>
  );
}
