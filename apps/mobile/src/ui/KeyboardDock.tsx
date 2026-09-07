import React, { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * THE BAR AT THE BOTTOM, KEPT ABOVE THE KEYBOARD.
 *
 * The bug this exists for: on an iPhone the keyboard slides up OVER a composer
 * instead of pushing it up, so the input and its Send button end up underneath
 * it. The only key you can reach is Return. Every bottom-anchored composer in
 * the app had the same shape and four of them — Home, Community, a circle, and
 * the trade portal — had no keyboard handling at all.
 *
 * ── WHY A COMPONENT AND NOT A FIX PER SCREEN ────────────────────────────
 * Four screens already wrapped their bar in a `KeyboardAvoidingView`, in four
 * copies of the same ternary, and every one of them had the same two defects
 * below. Fixing eight screens by hand would have produced eight more copies to
 * drift. This is the one place the behaviour lives.
 *
 * ── DEFECT ONE: THE SAFE-AREA FLOOR STAYS UNDER THE KEYBOARD ────────────
 * The house convention for a bottom bar is `Math.max(insets.bottom, N)` — a
 * floor, never an addition. That is right when the bar sits on the home
 * indicator and wrong the moment the keyboard is up, because the keyboard is
 * now covering the home indicator and there is nothing left to clear. Left
 * alone it leaves a ~34pt dead band between the composer and the keys on a
 * notched phone. So the floor COLLAPSES to its own minimum while the keyboard
 * is showing, and comes back when it goes.
 *
 * ── DEFECT TWO: `keyboardVerticalOffset` WAS NEVER PASSED, AND IS RIGHT ──
 * It appears zero times in the repo, and that turns out to be correct rather
 * than an oversight — but only by accident, so it is worth writing down. React
 * Native computes the padding as `frame.y + frame.height - keyboardTop`. On a
 * tab screen the navigator lays the screen out ABOVE the tab bar, so the
 * frame's bottom is already the tab bar's top and the padding comes out as
 * `keyboardHeight - tabBarHeight` — exactly the lift required. Adding the tab
 * bar height as an offset, which is the obvious thing to reach for, would
 * double-count it and lift the composer a tab bar's height too far. Hence
 * `offset` defaults to 0 and is exposed only for a surface that genuinely sits
 * under something the navigator does not know about.
 *
 * ── iOS ONLY, DELIBERATELY ──────────────────────────────────────────────
 * On web the keyboard is the browser's problem and react-native-web's
 * `KeyboardAvoidingView` is a plain View; on Android the OS resizes the window
 * itself. Both get the children with the ordinary padding and no wrapper at
 * all — not a wrapper configured to do nothing, an actual pass-through. There
 * is a scar here worth respecting: a font gate with an unguarded early return
 * once killed every click on web, and it was invisible until somebody tried to
 * use the site. So the platform check returns the SAME tree shape on every
 * platform, and only the wrapper around it differs.
 */

/** Is the software keyboard on screen right now. iOS-only; false elsewhere. */
export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    /**
     * `keyboardWillShow`, not `keyboardDidShow`: the will-events fire at the
     * start of the system animation, so the padding change rides along with
     * the keyboard instead of snapping into place after it has arrived.
     */
    const show = Keyboard.addListener('keyboardWillShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return shown;
}

/**
 * How tall the keyboard is right now, in points. 0 when it is down.
 *
 * Only needed by a surface whose HEIGHT has to change rather than its padding.
 * `KeyboardAvoidingView` translates its child, which is right for a bar and
 * wrong for a panel with a fixed height: translating a sheet that is 53% of
 * the screen by a 336pt keyboard pushes its own header off the top. Such a
 * surface has to SHRINK, and to shrink it has to know by how much.
 */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => setH(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener('keyboardWillHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

export function KeyboardDock({
  children,
  floor = 14,
  offset = 0,
  safeArea = true,
  style,
  testID,
}: {
  children: React.ReactNode;
  /**
   * The padding under the bar when the keyboard is DOWN is
   * `Math.max(insets.bottom, floor)`, matching the convention everywhere else.
   * While the keyboard is up it is just `floor`.
   */
  floor?: number;
  /** Only for a bar sitting under chrome the navigator does not lay out. */
  offset?: number;
  /**
   * WHETHER CLEARING THE HOME INDICATOR IS THIS BAR'S JOB.
   *
   * On a stack screen it is: the bar is the last thing on the display, so it
   * has to hold itself off the indicator and `Math.max(insets.bottom, floor)`
   * is right.
   *
   * ON A TAB SCREEN IT IS NOT, and this flag exists because assuming otherwise
   * produced a visible regression. `TabBar` already does its own
   * `Math.max(insets.bottom, chrome.tabBarBottom)`, and the tab bar is what
   * actually sits on the indicator — but the tab scene is still handed the
   * FULL window insets (expo-router's `BottomTabView` does not re-provide
   * `SafeAreaInsetsContext` for a scene), so a composer above the tab bar reads
   * `insets.bottom` ≈ 34 and pads for a hazard the tab bar has already
   * cleared. That opened ~26pt of dead space between the composer and the tab
   * bar on Home and Community. Passing `safeArea={false}` says "somebody below
   * me owns the inset", and the padding stays at `floor` throughout.
   */
  safeArea?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardShown();
  const paddingBottom = keyboardShown || !safeArea ? floor : Math.max(insets.bottom, floor);

  const bar = (
    <View testID={testID} style={[{ paddingBottom }, style]}>
      {children}
    </View>
  );

  if (Platform.OS !== 'ios') return bar;

  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={offset}>
      {bar}
    </KeyboardAvoidingView>
  );
}
