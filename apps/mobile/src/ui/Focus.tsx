/**
 * THE FOCUS RING — the third leg of F20's target convention.
 * ===========================================================================
 *
 * F20 asks for "44 x 44 logical-pixel interactive targets as a product
 * convention, with usable spacing AND FOCUS STATES". Size and spacing were
 * done screen by screen. Focus was not done at all, and it could not be: React
 * Native has no portable focus ring. `Pressable` gives you `pressed`, and
 * nothing else. On web react-native-web renders a focusable element and the
 * browser draws its own outline — which this app then removes, everywhere, with
 * the `outlineStyle: 'none'` cast that appears beside every input in the
 * source. So the one platform that had a ring for free had it deleted, and the
 * others never had one.
 *
 * WHO THIS IS FOR. Not "keyboard users" as a category — the audit's own
 * required-validation list names "keyboard and sheet focus" as a release gate,
 * and the people it decides for are: anybody driving the web build from a
 * keyboard because a trackpad is painful, anybody on a switch device, anybody
 * on a desktop browser at all (Tab is how a form gets filled fast), and
 * VoiceOver/TalkBack users, whose focus cursor is the only thing telling them
 * where they are. A control that gives no sign it is focused is a control that
 * cannot be operated without sight of a pointer.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ONE COMPONENT AND NOT A FIX PER SCREEN
 * ---------------------------------------------------------------------------
 * A ring is a convention or it is noise. Twenty screens each inventing their
 * own — a border here, a background tint there, three different greens — is
 * how an app ends up with focus states that a member cannot learn. So: ONE
 * ring, ONE colour, drawn ONE way, and every surface that wants focus adopts
 * this rather than writing its own.
 *
 * THE COLOUR IS VOLT AT 50% — `alpha.volt50`, the same value the generated CSS
 * exports as `--ring` for the gluestack chrome, so a focused sheet control and
 * a focused hand-rolled chip are ringed identically across the two styling
 * layers. Volt is right by the house grammar rather than by convenience:
 * VOLT MEANS THE USER ACTING. Focus is the user standing on a thing about to
 * act on it. Violet would say Kai put the cursor there and cyan would say the
 * ring was market data.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS AN OVERLAY AND NOT A BORDER
 * ---------------------------------------------------------------------------
 * The obvious implementation — raise `borderWidth` on focus — reflows the
 * thing it is decorating: two pixels of border eat two pixels of content, text
 * re-wraps, a rail of chips shifts sideways as the cursor moves along it. The
 * ring is therefore a sibling `View`, absolutely positioned, `pointerEvents`
 * none, inset OUTSIDE the control's box. It costs no layout, it cannot swallow
 * a press, and it sits over whatever the control's own background is.
 *
 * It also does not animate. A ring that fades in is a ring that is not there
 * yet when somebody tabs quickly, and a pulsing focus indicator is precisely
 * the forever-motion `useMotion().loop` exists to refuse.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, radius as tokenRadius } from './tokens';

/** Thickness of the ring, and how far outside the control it sits. */
const RING_WIDTH = 2;
const RING_INSET = 3;

/**
 * The focus state and the two handlers that maintain it.
 *
 * Exported separately because some controls are not `Pressable` — a `TextInput`
 * has its own focus handling and its own skin (see `ui/Field.tsx`), and a
 * screen that already tracks focus for another reason should not end up with
 * two sources of truth about it.
 *
 * `onFocus`/`onBlur` are no-ops on iOS and Android outside tvOS, which is
 * correct rather than unfortunate: there is no keyboard focus on a touch
 * screen, so the ring simply never appears there and costs one boolean.
 */
export function useFocusRing(): {
  focused: boolean;
  focusProps: { onFocus: () => void; onBlur: () => void };
} {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { focused, focusProps: { onFocus, onBlur } };
}

/**
 * The ring itself. Render it as the LAST child of a relatively-positioned
 * parent; it draws outside that parent's bounds, so the parent must not clip
 * (`overflow: 'hidden'` will eat it — give the ring a smaller inset there, or
 * put it outside the clipping view).
 *
 * `borderRadius` should be the control's own radius plus the inset, so the ring
 * stays concentric with the corner it is tracing rather than cutting it.
 */
export function FocusRing({
  visible,
  borderRadius = tokenRadius.sm,
  inset = RING_INSET,
  testID,
}: {
  visible: boolean;
  borderRadius?: number;
  inset?: number;
  testID?: string;
}) {
  if (!visible) return null;
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        top: -inset,
        left: -inset,
        right: -inset,
        bottom: -inset,
        borderWidth: RING_WIDTH,
        borderColor: alpha.volt50,
        borderRadius: borderRadius + inset,
      }}
    />
  );
}

/**
 * A `Pressable` that shows the ring when it has focus. A drop-in replacement:
 * every `Pressable` prop is passed through, including the `style` callback
 * form, so adopting it on an existing control is one word.
 *
 * `ringRadius` defaults to `radius.sm`. Pass the control's real radius —
 * `radius.pill` for a pill, `0` for a square — or the ring will not follow the
 * shape it is around.
 */
export function Focusable({
  ringRadius,
  ringInset,
  children,
  style,
  ...rest
}: PressableProps & {
  ringRadius?: number;
  ringInset?: number;
}) {
  const { focused, focusProps } = useFocusRing();
  return (
    <Pressable
      {...rest}
      {...focusProps}
      style={(state) => [
        // `position: relative` is the default in React Native, but it is stated
        // here because the ring's absolute positioning depends on it and a
        // caller passing `position: 'absolute'` in its own style would silently
        // reparent the ring to the screen.
        { position: 'relative' } as StyleProp<ViewStyle>,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {(state) => (
        <>
          {typeof children === 'function' ? children(state) : children}
          <FocusRing visible={focused} borderRadius={ringRadius} inset={ringInset} />
        </>
      )}
    </Pressable>
  );
}
