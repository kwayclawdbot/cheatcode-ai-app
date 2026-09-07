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
 *
 * ── THE WEB IS A THIRD PLATFORM AND IT DECODES DIFFERENTLY ──────────────
 * On the phone the OS decodes the picture, so anything in the camera roll
 * opens, HEIC included. On the web the BROWSER decodes it, into an `<img>` and
 * then a canvas, and no browser but Safari will open an iPhone `.heic`. What
 * came back from that was nothing: the picker reports 0×0 for a file it could
 * not measure, the manipulator then rejects with a canvas element rather than
 * an Error, and the member got a bare "That picture could not be opened." for
 * every file they had picked — including the ones that were fine.
 *
 * So each picture is now handled ON ITS OWN. One file the browser cannot read
 * costs that file and says which one and why; the rest still go up. Everything
 * that DOES decode leaves here as a JPEG, on every platform, which is why the
 * API's narrow list (image/jpeg and image/png, nothing else) is never something
 * a member has to know about.
 */
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

/** Longest edge, in pixels, of what is actually uploaded. */
export const MAX_EDGE = 2048;
/** JPEG quality. 1.0 is no compression. */
export const QUALITY = 0.8;
/** Matches the API's `message` ceiling in apps/api/src/lib/media/limits.ts. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_PER_POST = 4;

/**
 * THE AVATAR CEILING IS HALF THE MESSAGE CEILING AND NOTHING HERE KNEW IT.
 *
 * `apps/api/src/lib/media/limits.ts` sets `avatar.maxBytes` to 2 MiB — "an
 * avatar renders at 40pt; anything larger is waste" — while `message.maxBytes`
 * is 4 MiB. This file only ever knew the 4 MiB number, so a picture between the
 * two sizes sailed past every check on the phone, went up the wire on the
 * member's data plan, and came back refused by the server. That is a slow
 * failure for something the phone could have known instantly.
 *
 * Two things close it, in this order:
 *   1. `AVATAR_EDGE` — an avatar is drawn at 54 points, so 512 pixels is
 *      already three times what any screen shows at 3x. A 512-pixel JPEG at
 *      quality 0.8 lands around 60 KB, which means the ceiling below is a
 *      backstop rather than something a member will meet.
 *   2. `maxBytes` on the pick options — measured after the re-encode, so the
 *      sentence a member reads is written here in their own words instead of
 *      arriving from the server after the upload.
 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_EDGE = 512;

/**
 * How the pick is shaped for the thing it is for.
 *
 * Defaults are the post's — this is the older caller and it must keep behaving
 * exactly as it did.
 */
export type PickOptions = {
  /** Longest edge of the re-encoded JPEG. */
  maxEdge?: number;
  /** Refuse anything larger than this AFTER the re-encode. */
  maxBytes?: number;
  /**
   * What the member is picking, in their words, for the "too big" sentence:
   * "That picture is too big to use as a profile picture."
   */
  what?: string;
};

export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  /** Always image/jpeg — everything is re-encoded on the way out of here. */
  mime: string;
  name: string;
};

export type PickOutcome =
  /**
   * `skipped` is one plain sentence per file that could not be opened. It is
   * separate from `photos` because both can be non-empty at once: three good
   * pictures and one the browser would not read is a normal afternoon.
   */
  | { ok: true; photos: PickedPhoto[]; skipped: string[] }
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
export async function pickPhotos(remaining: number, options?: PickOptions): Promise<PickOutcome> {
  const maxEdge = options?.maxEdge ?? MAX_EDGE;
  const maxBytes = options?.maxBytes ?? MAX_UPLOAD_BYTES;
  const what = options?.what ?? null;

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
    const skipped: string[] = [];
    for (const asset of res.assets.slice(0, remaining)) {
      // Checked BEFORE the work, so a file the browser has already failed to
      // measure is refused with the reason rather than with a stack trace.
      const blocked = webCannotDecode(asset);
      if (blocked) { skipped.push(blocked); continue; }
      try {
        const photo = await downscale(asset, maxEdge);
        // Measured on what is actually going up, not on what was picked. A
        // 12-megapixel photo is 5 MB in the camera roll and 300 KB after the
        // re-encode above, so refusing on the original size would turn away
        // pictures that are perfectly fine.
        const tooBig = await overSize(photo.uri, maxBytes, asset, what);
        if (tooBig) { skipped.push(tooBig); continue; }
        photos.push(photo);
      } catch (e) {
        skipped.push(plainFailure(asset, e));
      }
    }
    // Nothing survived: this is a failure, not a partial success, and the
    // reasons are what the member needs to read.
    if (!photos.length) {
      return skipped.length
        ? { ok: false, reason: 'failed', plain: skipped.join(' ') }
        : { ok: false, reason: 'cancelled' };
    }
    return { ok: true, photos, skipped };
  } catch (e) {
    return {
      ok: false,
      reason: 'failed',
      plain: e instanceof Error ? `That picture could not be opened. ${e.message}` : 'That picture could not be opened.',
    };
  }
}

/**
 * Web only: is this a file the browser has already shown it cannot read?
 *
 * TWO SIGNALS, BOTH FROM THINGS THAT ALREADY HAPPENED. The picker measures
 * every image by loading it into an `<img>` and reports 0×0 when that load
 * failed — a real photograph is never 0×0 — and an iPhone `.heic` names itself
 * in its type and its filename. Neither is a guess about the future.
 *
 * Returns the sentence to show, or null when there is nothing wrong.
 */
function webCannotDecode(asset: ImagePicker.ImagePickerAsset): string | null {
  if (Platform.OS !== 'web') return null;

  const name = (asset.fileName ?? '').trim();
  const mime = (asset.mimeType ?? '').toLowerCase();
  const looksHeic = /heic|heif/.test(mime) || /\.(heic|heif)$/i.test(name);
  const unmeasurable = (asset.width ?? 0) === 0 && (asset.height ?? 0) === 0;

  if (!looksHeic && !unmeasurable) return null;
  const subject = name ? `“${name}”` : 'That picture';
  if (looksHeic) {
    return `${subject} is an iPhone .heic picture, and this browser cannot open one — only Safari can. On your phone the app opens it fine; here, export it as a JPEG or PNG first.`;
  }
  return `${subject} could not be opened by this browser. JPEG and PNG always work.`;
}

/**
 * Is the re-encoded file over the ceiling? Returns the sentence to show, or
 * null when it is fine or when the size could not be established.
 *
 * WHY `fetch` AND NOT A FILESYSTEM CALL. On the web the picked uri is a
 * `blob:` URL and `fetch` is the only way to read it back — it is already what
 * `api.uploadAvatar` does to build the multipart part, so this adds no new
 * mechanism. On the phone the uri is `file://`; React Native's fetch usually
 * reads one, and where it does not, this returns null.
 *
 * A NULL IS NOT A PASS, IT IS A "DO NOT KNOW". Nothing here decides anything:
 * the server measures the bytes it actually received and refuses with its own
 * plain sentence (`apps/api/src/lib/media/limits.ts`). This exists so that in
 * the common case the member is told before the upload rather than after it.
 */
async function overSize(
  uri: string,
  maxBytes: number,
  asset: ImagePicker.ImagePickerAsset,
  what: string | null,
): Promise<string | null> {
  let size = 0;
  try {
    const blob = await (await fetch(uri)).blob();
    size = blob.size ?? 0;
  } catch {
    return null;
  }
  if (!size || size <= maxBytes) return null;

  const name = (asset.fileName ?? '').trim();
  const subject = name ? `“${name}”` : 'That picture';
  const limit = `${Math.round(maxBytes / (1024 * 1024))} MB`;
  const forWhat = what ? ` to use as ${what}` : '';
  return `${subject} is still too big${forWhat} — ${limit} is the limit and it comes to ${plainBytes(size)}. A smaller photo, or a screenshot of it, will go up fine.`;
}

/** A file size in the words a person uses for one. */
function plainBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What to say when the re-encode itself failed. */
function plainFailure(asset: ImagePicker.ImagePickerAsset, e: unknown): string {
  const name = (asset.fileName ?? '').trim();
  const subject = name ? `“${name}”` : 'That picture';
  // The web manipulator rejects with a CANVAS ELEMENT, not an Error, so
  // `e.message` is not something that can be assumed to exist here.
  const detail = e instanceof Error && e.message ? ` ${e.message}` : '';
  return `${subject} could not be opened.${detail || ' JPEG and PNG always work.'}`;
}

/**
 * Re-encode to a JPEG whose longest edge is at most MAX_EDGE.
 *
 * `resize` is given ONE dimension and null for the other, which is how this API
 * is told to keep the aspect ratio. Passing both would silently distort a
 * screenshot, and a squashed chart is worse than a large one.
 */
async function downscale(asset: ImagePicker.ImagePickerAsset, maxEdge: number): Promise<PickedPhoto> {
  const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
  const context = ImageManipulator.manipulate(asset.uri);

  if (longest > maxEdge) {
    if ((asset.width ?? 0) >= (asset.height ?? 0)) context.resize({ width: maxEdge });
    else context.resize({ height: maxEdge });
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
