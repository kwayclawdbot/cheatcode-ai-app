/**
 * THE + BESIDE A COMPOSER, AND THE SHORT MENU IT OPENS.
 *
 * WHY IT IS A LIST AND NOT THREE BUTTONS. The bar used to carry one button per
 * thing you could attach, which is fine at one and unreadable at four: a row of
 * unlabelled glyphs where the member has to tap to find out what each one does.
 * A single + that opens a list of NAMED actions scales — a fifth action is a
 * line in an array, not another icon competing for 44 points of a phone's
 * width — and every action arrives with its own sentence, so nothing has to be
 * guessed and nothing is offered that will fail.
 *
 * MOTION. The menu scales out of the + itself rather than out of the middle of
 * the screen: the trigger is measured on press and the panel is given a
 * `transformOrigin` at the corner nearest it, so the thing you tapped is
 * visibly the thing that grew. It starts at 0.94 and not at zero — nothing in
 * the world appears from nothing — over 170ms on a strong ease-out, because a
 * menu is entering and the first frames are the ones being watched. Closing is
 * faster (120ms): the member has already decided, and waiting on an exit is the
 * part that feels slow.
 *
 * In `ui/` rather than in a feature because two composers use it — the club
 * board's `Composer` and the room's `RoomComposer` — and a menu that exists
 * twice is two lists that drift apart.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { alpha, color, radius } from './tokens';
import { T } from './Text';
import { useMotion } from '../features/a11y/context';
import { Focusable, FocusRing, useFocusRing } from './Focus';

/**
 * One line in the menu.
 *
 * `hint` is not decoration. It is where an action says what it will actually do
 * — what it costs, what it will not take — before it is tapped.
 */
export type ComposerAction = {
  id: string;
  label: string;
  hint?: string;
  /** `kai` tints the row violet. Volt is the member's own actions; violet is Kai's. */
  tone?: 'default' | 'kai';
  disabled?: boolean;
  /** Said in place of the hint while `disabled`, so a dead row explains itself. */
  disabledHint?: string;
  onPress: () => void;
};

const TRIGGER = 44;
const PANEL_WIDTH = 268;
/** Strong ease-out. The built-in curves are too weak to read as intentional. */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const ENTER_MS = 170;
const EXIT_MS = 120;

type Anchor = { x: number; y: number; width: number; height: number };

export function ComposerActions({
  actions,
  disabled,
  testID,
  accessibilityLabel = 'Add to this post',
}: {
  actions: ComposerAction[];
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [open, setOpen] = useState(false);
  const t = useRef(new Animated.Value(0)).current;
  const { width: screenW, height: screenH } = useWindowDimensions();

  /**
   * THE MENU GROWS OUT OF THE + — UNLESS SOMEBODY ASKED IT NOT TO (F19).
   *
   * `duration(0)` puts the panel straight onto its final frame, so it appears
   * and disappears on exactly the same trigger and `hide`'s completion callback
   * still fires and still unmounts the modal. What goes is the scale-up and the
   * six pixels of travel; the transform is left in place at its resting value
   * so there is one layout to maintain rather than two.
   */
  const { duration, distance, reduced } = useMotion();

  // The trigger keeps its own `Pressable` rather than becoming a `Focusable`,
  // because `trigger` is a ref this component measures on every open and
  // `Focusable` does not forward one. Same ring, drawn by hand.
  const { focused, focusProps } = useFocusRing();

  const show = useCallback(() => {
    const run = () => {
      setOpen(true);
      t.setValue(0);
      Animated.timing(t, { toValue: 1, duration: duration(ENTER_MS), easing: EASE_OUT, useNativeDriver: true }).start();
    };
    // Measured EVERY time rather than once: the composer moves when the
    // keyboard opens and when a picture tray appears above it, and a menu that
    // grows out of where the button used to be is worse than no animation.
    if (trigger.current?.measureInWindow) {
      trigger.current.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
        run();
      });
    } else {
      run();
    }
  }, [t, duration]);

  const hide = useCallback(() => {
    Animated.timing(t, { toValue: 0, duration: duration(EXIT_MS), easing: EASE_OUT, useNativeDriver: true }).start(
      ({ finished }) => { if (finished) setOpen(false); }
    );
  }, [t, duration]);

  // Escape closes it on the web. `Modal`'s `onRequestClose` is the ANDROID back
  // button and nothing else, so without this a keyboard has no way out of a
  // menu it can open — and the composer is a keyboard surface by definition.
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hide]);

  const choose = useCallback((a: ComposerAction) => {
    // Close first, act second. A screen pushing in underneath a menu that is
    // still on top of it is the kind of thing nobody can describe afterwards.
    hide();
    setTimeout(a.onPress, EXIT_MS);
  }, [hide]);

  /**
   * WHERE THE PANEL SITS. Above the trigger and aligned to its left edge, which
   * is where a composer's + lives — bottom-left of the screen — so the menu
   * opens into the empty space rather than off the edge of it. The clamps are
   * for the narrow-phone case, not the ordinary one.
   */
  const left = anchor ? Math.min(Math.max(12, anchor.x), Math.max(12, screenW - PANEL_WIDTH - 12)) : 12;
  const bottom = anchor ? Math.max(12, screenH - anchor.y + 8) : 88;

  return (
    <>
      <Pressable
        ref={trigger}
        testID={testID ?? 'composer-plus'}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Pictures, a call, and what Kai can do here."
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        disabled={disabled}
        onPress={show}
        {...focusProps}
        style={({ pressed }) => ({
          position: 'relative',
          width: TRIGGER, height: TRIGGER, borderRadius: TRIGGER / 2,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 0.5, borderColor: open ? alpha.volt50 : alpha.ivory24,
          backgroundColor: open ? alpha.volt10 : 'transparent',
          opacity: disabled ? 0.45 : 1,
          // Press feedback. Subtle on purpose — this button is tapped often.
          transform: [{ scale: pressed && !disabled ? 0.94 : 1 }],
        })}
      >
        <PlusGlyph tint={open ? color.volt : color.text} />
        <FocusRing visible={focused && !disabled} borderRadius={TRIGGER / 2} />
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={hide}>
        {/* A press target that closes, with only enough shade to lift the
            panel off the feed. A sheet's 50% black would say "this took over
            the screen", which is a different and larger promise than four
            rows hanging off a button. */}
        <Pressable
          testID="composer-plus-backdrop"
          accessibilityLabel="Close"
          onPress={hide}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.28)' }}
        />
        <Animated.View
          testID="composer-plus-menu"
          style={{
            position: 'absolute',
            left,
            bottom,
            width: PANEL_WIDTH,
            borderRadius: radius.xl,
            backgroundColor: color.surface2,
            borderWidth: 0.5,
            borderColor: alpha.ivory16,
            paddingHorizontal: 14,
            paddingVertical: 4,
            // Depth, not drama: the panel sits ABOVE the feed and the shadow is
            // the only thing that says so once the shade behind it is this light.
            shadowColor: '#000',
            shadowOpacity: 0.45,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
            // Out of the +, not out of the middle of nowhere.
            transformOrigin: 'bottom left',
            opacity: t,
            transform: [
              { scale: t.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 1 : 0.94, 1] }) },
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [distance(6), 0] }) },
            ],
          }}
        >
          {actions.map((a, i) => (
            <ActionRow key={a.id} action={a} last={i === actions.length - 1} onChoose={choose} />
          ))}
        </Animated.View>
      </Modal>
    </>
  );
}

function ActionRow({
  action, last, onChoose,
}: {
  action: ComposerAction;
  last: boolean;
  onChoose: (a: ComposerAction) => void;
}) {
  const tint = action.tone === 'kai' ? color.violetLight : color.text;
  const hint = action.disabled ? (action.disabledHint ?? action.hint) : action.hint;
  return (
    <Focusable
      testID={`composer-action-${action.id}`}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!action.disabled }}
      disabled={action.disabled}
      onPress={() => onChoose(action)}
      style={({ pressed }) => ({
        minHeight: 48,
        justifyContent: 'center',
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: alpha.ivory08,
        opacity: action.disabled ? 0.45 : pressed ? 0.7 : 1,
      })}
      // Inset 1, not the default 3: these rows sit inside a panel with 14px of
      // padding and a ring that reached the panel's own edge would read as the
      // panel being focused rather than the row.
      ringInset={1}
      ringRadius={radius.sm}
    >
      <T size={14} weight="semibold" c={tint}>{action.label}</T>
      {hint ? <T size={11} lh={15} c={color.muted} style={{ marginTop: 2 }}>{hint}</T> : null}
    </Focusable>
  );
}

/**
 * The + drawn as two rules rather than a font glyph, so it keeps the same
 * hairline weight as the borders around it at every scale.
 */
function PlusGlyph({ tint }: { tint: string }) {
  return (
    <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 16, height: 1.6, borderRadius: 1, backgroundColor: tint }} />
      <View style={{ position: 'absolute', width: 1.6, height: 16, borderRadius: 1, backgroundColor: tint }} />
    </View>
  );
}
