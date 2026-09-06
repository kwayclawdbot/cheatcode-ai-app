/**
 * PICKING A PHOTO ON THE PHONE.
 *
 * SDK 57 API, checked against the versioned docs rather than remembered:
 *   · `mediaTypes` takes an ARRAY of media-type strings. The `MediaTypeOptions`
 *     enum every older example uses is deprecated in this version.
 *   · ImageManipulator is the contextual API — `manipulate()` → `renderAsync()`
 *     → `saveAsync()`. `manipulateAsync()` is deprecated.
 *
 * WHAT THE DOWNSCALE IS AND IS NOT DOING.
 * Re-encoding here drops EXIF as a side effect, and that is worth having, but
 * it is NOT what protects anybody. Anything running on the member's phone is a
 * suggestion: a modified build, a proxy, or a plain HTTP client can skip it
 * entirely. The server strips every file it accepts, and that is the guarantee
 * (apps/api/src/lib/media/strip.ts). This exists for two ordinary reasons —
 * a 4032-pixel photo costs the member's data plan to send and renders no better
 * at 350 points wide, and the API refuses anything over 4 MB, so shrinking
 * first is the difference between a post and an error.
 *
 * WHY 2048 AND 0.8. 2048 is comfortably above what any phone screen shows at
 * 3x, so a chart screenshot stays legible when it is opened full-size, and JPEG
 * at 0.8 keeps thin candle wicks and axis text readable while landing an
 * ordinary photo well under a megabyte. Both are decisions, not defaults, and
 * both are cheap to change here because nothing else depends on them.
 *
 * VIDEO IS NOT OFFERED. `mediaTypes` is `['images']` and there is no branch
 * that handles a video asset, because the server refuses one — the reasons are
 * written out in migration 0033 and they are not reasons the phone can fix.
 */
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

/** Longest edge, in pixels, of what is actually uploaded. */
export const MAX_EDGE = 2048;
/** JPEG quality. 1.0 is no compression. */
export const QUALITY = 0.8;
/** Matches the API's ceiling in apps/api/src/lib/media/limits.ts. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_PER_POST = 4;

export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  /** Always image/jpeg — everything is re-encoded on the way out of here. */
  mime: string;
  name: string;
};

export type PickOutcome =
  | { ok: true; photos: PickedPhoto[] }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'denied'; plain: string }
  | { ok: false; reason: 'failed'; plain: string };

/**
 * Open the library, let the member pick up to `remaining` photos, and hand back
 * downscaled JPEGs ready to upload.
 *
 * PERMISSION IS ASKED FOR, NEVER ASSUMED, and a refusal is a normal answer
 * rather than an error state: the member said no, the composer carries on
 * without pictures, and the sentence tells them where to change their mind.
 * On iOS the answer can also be "some of them" (`accessPrivileges: 'limited'`),
 * which is a YES — the picker shows the selection they chose and nothing here
 * should treat it as a refusal.
 */
export async function pickPhotos(remaining: number): Promise<PickOutcome> {
  if (remaining <= 0) {
    return { ok: false, reason: 'failed', plain: `You can add ${MAX_PER_POST} pictures to a post.` };
  }

  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.accessPrivileges !== 'limited') {
      return {
        ok: false,
        reason: 'denied',
        plain:
          Platform.OS === 'ios'
            ? 'Cheat Code AI does not have access to your photos. You can turn it on in Settings → Cheat Code AI → Photos.'
            : 'Cheat Code AI does not have access to your photos. You can turn it on in your phone’s app settings.',
      };
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      // SDK 57: an array of media-type strings. Images only — see the header.
      mediaTypes: ['images'],
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      // The picker's own `quality` is not used: the manipulator below does the
      // resizing AND the compression, so doing it twice would just cost quality.
      quality: 1,
      exif: false,
    });

    if (res.canceled) return { ok: false, reason: 'cancelled' };

    const photos: PickedPhoto[] = [];
    for (const asset of res.assets.slice(0, remaining)) {
      photos.push(await downscale(asset));
    }
    return { ok: true, photos };
  } catch (e) {
    return {
      ok: false,
      reason: 'failed',
      plain: e instanceof Error ? `That picture could not be opened. ${e.message}` : 'That picture could not be opened.',
    };
  }
}

/**
 * Re-encode to a JPEG whose longest edge is at most MAX_EDGE.
 *
 * `resize` is given ONE dimension and null for the other, which is how this API
 * is told to keep the aspect ratio. Passing both would silently distort a
 * screenshot, and a squashed chart is worse than a large one.
 */
async function downscale(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> {
  const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
  const context = ImageManipulator.manipulate(asset.uri);

  if (longest > MAX_EDGE) {
    if ((asset.width ?? 0) >= (asset.height ?? 0)) context.resize({ width: MAX_EDGE });
    else context.resize({ height: MAX_EDGE });
  }

  const rendered = await context.renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY });

  return {
    uri: out.uri,
    width: out.width,
    height: out.height,
    mime: 'image/jpeg',
    name: `photo-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`,
  };
}
