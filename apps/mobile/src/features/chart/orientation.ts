/**
 * Who is allowed to rotate.
 *
 * The app is a portrait app. `app.json` nevertheless declares `default`,
 * because on iOS the Info.plist is a hard ceiling — a screen cannot rotate to an
 * orientation the binary never declared, no matter what it asks for at runtime.
 * So the plist opens the door and the APP holds it shut, everywhere except the
 * one screen that has earned it.
 *
 * THE CHART IS THAT SCREEN. A chart is wider than it is tall; that is what a
 * chart IS. Held sideways it stops being a widget on a page and becomes the
 * thing you are looking at — which is most of what "make it feel like TV" means
 * before a single pixel changes.
 *
 * Every call is fire-and-forget. Orientation is a request to the OS, not a
 * guarantee: iPad multitasking, an accessibility setting or a locked rotation
 * can all refuse it, and none of those is a reason to fail opening a chart.
 */
import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

/** The default for every screen: portrait, both ways up. */
export async function lockPortrait(): Promise<void> {
  if (!supported) return;
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch {
    /* the OS said no; the screen simply does not rotate */
  }
}

/** The stage: turn the phone and the chart goes wide. */
export async function allowLandscape(): Promise<void> {
  if (!supported) return;
  try {
    await ScreenOrientation.unlockAsync();
  } catch {
    /* rotation stays where it is */
  }
}
