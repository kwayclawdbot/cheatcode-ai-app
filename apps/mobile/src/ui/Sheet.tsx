import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, View } from 'react-native';
import { alpha, color, radius } from './tokens';
import { KeyboardDock } from './KeyboardDock';
import { T } from './Text';
import { useMotion } from '../features/a11y/context';

/** The house curve — the same bezier the Home wake-up cascade uses. */
const CURVE = Easing.bezier(0.22, 1, 0.36, 1);
const RISE = 28;
const DURATION = 200;
/** RN-web has no native driver; asking for one only prints a warning. */
const NATIVE = Platform.OS !== 'web';

/**
 * Bottom sheet. Used for the honest "not yet" answers (billing not configured,
 * plans arrive later) and for confirmations. One dominant action per sheet.
 *
 * ---------------------------------------------------------------------------
 * WHAT REDUCED MOTION DOES TO A SHEET (audit F19)
 * ---------------------------------------------------------------------------
 * A sheet is the one piece of chrome in the app whose whole identity is a
 * movement: it comes up from the bottom edge, which is what tells you it is a
 * layer over the screen rather than a new screen. So it is the right place to
 * define what "reduce motion" means, and the definition is the house one —
 * NO MOVEMENT, NOT NO ANIMATION.
 *
 *   motion on   the backdrop cross-fades and the panel RISES 28px into place
 *   motion off  the backdrop cross-fades and the panel is simply THERE
 *
 * The panel does not pop, flash or shrink into view when motion is off. It
 * arrives with the same fade the Modal was already doing, at its final
 * position, in the same final state either way. One layout, two journeys.
 *
 * That preference is the OR of the OS setting and the member's toggle, so a
 * phone set to reduce motion gets a still sheet no matter what the member has
 * saved in the app — see `features/a11y`.
 */
export function Sheet({
  visible, onClose, title, children, testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const { distance, duration } = useMotion();
  const rise = distance(RISE);
  const t = useRef(new Animated.Value(rise === 0 ? 1 : 0)).current;

  useEffect(() => {
    if (!visible) { t.setValue(rise === 0 ? 1 : 0); return; }
    Animated.timing(t, {
      toValue: 1,
      duration: duration(DURATION),
      easing: CURVE,
      useNativeDriver: NATIVE,
    }).start();
  }, [visible, rise, duration, t]);

  const translateY = rise === 0 ? 0 : t.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: alpha.black50, justifyContent: 'flex-end' }}
      >
        <Animated.View style={{ transform: [{ translateY }] }}>
          <Pressable
            testID={testID}
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: color.surface2,
              borderTopLeftRadius: radius.xxxl,
              borderTopRightRadius: radius.xxxl,
              borderTopWidth: 0.5,
              borderColor: alpha.ivory16,
              paddingHorizontal: 20,
              paddingTop: 14,
            }}
          >
            {/*
              The dock is INSIDE the panel, not around it: several sheets hold a
              text field, and the panel's own surface has to keep filling the space
              behind the keyboard rather than floating above it. Being inside also
              leaves the backdrop's tap-to-dismiss intact — the panel Pressable
              still swallows every touch that lands on the padding.
            */}
            <KeyboardDock floor={22} style={{ gap: 12 }}>
              <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: alpha.ivory16 }} />
              {title ? <T size={17} weight="bold">{title}</T> : null}
              {children}
            </KeyboardDock>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
