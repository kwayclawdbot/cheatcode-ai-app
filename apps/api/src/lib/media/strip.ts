/**
 * THE EXIF STRIPPER. This is the file that stops a member publishing their
 * home address.
 *
 * A photograph taken on a phone carries an EXIF block, and in that block —
 * unless the owner has turned location off for the camera, which almost nobody
 * has — are the latitude and longitude where the shutter was pressed, to about
 * five metres. Somebody posting a screenshot of their broker at the kitchen
 * table is posting their kitchen table. That is not a theoretical privacy
 * concern; it is the single most likely way this feature hurts somebody.
 *
 * It also carries the device serial in some makes, the owner's name if they set
 * one, the original capture time (which places a person somewhere at an hour),
 * and any IPTC/XMP block an editing app left behind.
 *
 * SO: NOTHING IS STORED AS IT ARRIVED. Every accepted file is rebuilt from its
 * image data, and only the blocks on an explicit keep-list survive. This is a
 * whitelist, not a blacklist, because a blacklist is a list of the metadata
 * formats somebody had heard of.
 *
 * WHY IT IS WRITTEN BY HAND AND NOT WITH A LIBRARY.
 *   · `sharp` is the usual answer. It re-encodes, which loses quality on a
 *     chart screenshot where the text matters, it is a large native binary in
 *     a serverless cold start, and it is another dependency in the trust path
 *     for something this repo can do in two hundred lines.
 *   · Rebuilding the container instead of re-encoding is LOSSLESS: the pixels
 *     are copied byte for byte and only the wrapper changes.
 *   · It doubles as the format validator. A file that cannot be walked as a
 *     real JPEG or a real PNG is refused, which is a far stronger check than
 *     believing the `Content-Type` the phone sent. A .exe renamed .jpg does not
 *     survive this function.
 *
 * WHAT IT DOES NOT COVER, SAID PLAINLY:
 *   · Only JPEG and PNG. Those are the only two types the bucket accepts
 *     (migration 0033) precisely so that this file covers everything that can
 *     get in. WebP, HEIC, GIF and every video container are refused, not
 *     silently passed through.
 *   · It removes metadata. It does not look at the PICTURE. Nothing here knows
 *     whether the image is a chart or something a moderator needs to see. That
 *     is what reporting and staff removal are for, and it is stated in the
 *     handoff rather than implied.
 */

export type StripResult =
  | { ok: true; bytes: Uint8Array; mime: 'image/jpeg' | 'image/png'; width: number; height: number; removed: string[] }
  | { ok: false; reason: string };

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

export function stripImageMetadata(input: Uint8Array): StripResult {
  if (input.length < 16) return { ok: false, reason: 'That file is too small to be a picture.' };

  if (isJpeg(input)) return stripJpeg(input);
  if (isPng(input)) return stripPng(input);

  // Named formats get a specific sentence, because "not a picture" is a
  // confusing thing to read about a photo the phone just showed you.
  if (isHeic(input)) {
    return {
      ok: false,
      reason: 'That photo is in Apple’s HEIC format, which Android phones cannot display. Pick it again and the app will convert it.',
    };
  }
  if (isWebp(input)) return { ok: false, reason: 'WebP pictures are not supported yet. JPEG and PNG are.' };
  if (isGif(input)) return { ok: false, reason: 'GIFs are not supported yet. JPEG and PNG are.' };
  if (isMp4ish(input)) return { ok: false, reason: 'Video is not supported yet — photos only for now.' };

  return { ok: false, reason: 'That is not a JPEG or a PNG.' };
}

/* ------------------------------------------------------------------ */
/* Signatures                                                           */
/* ------------------------------------------------------------------ */

const startsWith = (b: Uint8Array, sig: number[], at = 0) =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

const isJpeg = (b: Uint8Array) => startsWith(b, [0xff, 0xd8, 0xff]);
const isPng = (b: Uint8Array) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isGif = (b: Uint8Array) => startsWith(b, [0x47, 0x49, 0x46, 0x38]);
const isWebp = (b: Uint8Array) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8);
const isHeic = (b: Uint8Array) => startsWith(b, [0x66, 0x74, 0x79, 0x70], 4) && /heic|heix|hevc|mif1|msf1/.test(ascii(b, 8, 12));
const isMp4ish = (b: Uint8Array) => startsWith(b, [0x66, 0x74, 0x79, 0x70], 4);

/**
 * Bytes as latin-1 text, for comparing identifiers.
 *
 * Chunked, and not `String.fromCharCode(...slice)`, because spreading a large
 * array into a call blows the stack — found on a real 2 MB photo, which is
 * exactly the size this code exists to handle.
 */
function ascii(b: Uint8Array, from: number, to: number): string {
  const end = Math.min(to, b.length);
  let out = '';
  for (let i = from; i < end; i += 4096) {
    out += String.fromCharCode.apply(null, Array.from(b.subarray(i, Math.min(i + 4096, end))));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* JPEG                                                                 */
/* ------------------------------------------------------------------ */

/**
 * A JPEG is SOI, then a run of marker segments, then SOS and the compressed
 * scan, then EOI. Every segment after the marker carries a two-byte
 * big-endian length that INCLUDES those two bytes.
 *
 * DROPPED: APP1 through APP15 and COM. That is EXIF (APP1), XMP (APP1 with the
 * adobe namespace), IPTC and Photoshop 8BIM blocks (APP13, which carry their
 * own copy of the GPS fields), Flashpix (APP2 without an ICC header), and any
 * comment. All of them can hold personal data and none of them are needed to
 * display the picture.
 *
 * KEPT: APP0 (JFIF, the density header), APP2 ONLY when its payload begins
 * `ICC_PROFILE\0` — a colour profile, which is a property of the camera model
 * and not of the person, and without which a Display P3 photo from an iPhone
 * renders visibly wrong. Everything from SOS onwards is copied verbatim: that
 * is the actual image.
 */
function stripJpeg(b: Uint8Array): StripResult {
  const out: Uint8Array[] = [];
  const removed: string[] = [];
  let width = 0;
  let height = 0;

  out.push(b.subarray(0, 2)); // SOI
  let i = 2;

  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return { ok: false, reason: 'That JPEG is damaged and could not be cleaned.' };

    // Fill bytes: a run of 0xFF before a marker is legal padding.
    let marker = b[i + 1];
    let markerAt = i;
    while (marker === 0xff && markerAt + 2 < b.length) {
      markerAt += 1;
      marker = b[markerAt + 1];
    }

    // Standalone markers with no payload.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(b.subarray(markerAt, markerAt + 2));
      i = markerAt + 2;
      continue;
    }

    if (marker === 0xd9) {
      out.push(b.subarray(markerAt, markerAt + 2)); // EOI
      i = markerAt + 2;
      break;
    }

    if (marker === 0xda) {
      // Start of scan: the rest of the file is entropy-coded data plus EOI.
      out.push(b.subarray(markerAt));
      i = b.length;
      break;
    }

    if (markerAt + 4 > b.length) return { ok: false, reason: 'That JPEG ends in the middle of a header.' };
    const len = (b[markerAt + 2] << 8) | b[markerAt + 3];
    if (len < 2 || markerAt + 2 + len > b.length) {
      return { ok: false, reason: 'That JPEG has a header that runs past the end of the file.' };
    }
    const segment = b.subarray(markerAt, markerAt + 2 + len);
    const payload = b.subarray(markerAt + 4, markerAt + 2 + len);

    // The frame headers carry the real dimensions. SOF0-SOF15, excluding the
    // three markers in that range that are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (payload.length >= 5) {
        height = (payload[1] << 8) | payload[2];
        width = (payload[3] << 8) | payload[4];
      }
    }

    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    const appN = marker - 0xe0;

    if (isComment) {
      removed.push('JPEG comment');
      i = markerAt + 2 + len;
      continue;
    }

    if (isApp && appN !== 0) {
      // The ICC identifier is the literal `ICC_PROFILE` followed by a NUL byte.
      // Compared byte-wise rather than by putting a raw NUL in this source: a
      // raw NUL is invisible in every editor and this repo has already lost an
      // afternoon to one standing in for a space.
      const keepIcc = appN === 2 && ascii(payload, 0, 11) === 'ICC_PROFILE' && payload[11] === 0x00;
      if (keepIcc) {
        out.push(segment);
      } else {
        removed.push(labelForApp(appN, payload));
      }
      i = markerAt + 2 + len;
      continue;
    }

    out.push(segment);
    i = markerAt + 2 + len;
  }

  if (!width || !height) return { ok: false, reason: 'That JPEG has no picture in it.' };

  return { ok: true, bytes: concat(out), mime: 'image/jpeg', width, height, removed };
}

function labelForApp(appN: number, payload: Uint8Array): string {
  const head = ascii(payload, 0, 30);
  if (appN === 1 && head.startsWith('Exif')) return 'EXIF (camera, date, GPS location)';
  if (appN === 1 && head.includes('adobe.com/xap')) return 'XMP';
  if (appN === 13) return 'IPTC / Photoshop';
  if (appN === 2) return 'APP2';
  return `APP${appN}`;
}

/* ------------------------------------------------------------------ */
/* PNG                                                                  */
/* ------------------------------------------------------------------ */

/**
 * A PNG is an 8-byte signature followed by chunks: 4-byte big-endian length,
 * 4-byte ASCII type, the data, and a 4-byte CRC over type+data.
 *
 * This is a KEEP-LIST, not a drop-list, and the difference matters: a PNG can
 * legally carry any chunk type at all, so an unknown chunk is thrown away
 * rather than trusted. The kept set is the chunks a decoder needs to render
 * the image the way the author saw it.
 *
 * Notably dropped: eXIf (yes, PNGs carry EXIF — an iPhone screenshot of a
 * photo can), tEXt / zTXt / iTXt (arbitrary text, which is where editors write
 * the author's name, the source file path and XMP), and tIME.
 *
 * Nothing is re-encoded, so no CRC has to be recomputed: kept chunks are
 * copied whole, including their original CRC.
 */
const PNG_KEEP = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND', // required / image data
  'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs', // rendering
  'acTL', 'fcTL', 'fdAT', // APNG frames — dropping these would break animation
]);

function stripPng(b: Uint8Array): StripResult {
  const out: Uint8Array[] = [b.subarray(0, 8)];
  const removed: string[] = [];
  let width = 0;
  let height = 0;
  let sawIhdr = false;
  let sawIend = false;
  let i = 8;

  while (i + 8 <= b.length) {
    const len = readU32(b, i);
    const type = ascii(b, i + 4, i + 8);
    const end = i + 12 + len;
    if (len > b.length || end > b.length) {
      return { ok: false, reason: 'That PNG has a block that runs past the end of the file.' };
    }

    if (type === 'IHDR') {
      if (len < 13) return { ok: false, reason: 'That PNG has a damaged header.' };
      width = readU32(b, i + 8);
      height = readU32(b, i + 12);
      sawIhdr = true;
    }

    if (PNG_KEEP.has(type)) {
      out.push(b.subarray(i, end));
    } else {
      removed.push(type === 'eXIf' ? 'EXIF (camera, date, GPS location)' : `PNG ${type} block`);
    }

    if (type === 'IEND') {
      sawIend = true;
      i = end;
      break;
    }
    i = end;
  }

  if (!sawIhdr || !width || !height) return { ok: false, reason: 'That PNG has no picture in it.' };
  if (!sawIend) {
    // A truncated PNG still renders in most decoders, which is exactly why it
    // must not be stored: half a file that half-works is a support ticket.
    return { ok: false, reason: 'That PNG is incomplete — it may not have finished copying.' };
  }

  return { ok: true, bytes: concat(out), mime: 'image/png', width, height, removed };
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

function readU32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * Used by the proof script and by nothing in the request path: does this byte
 * stream still contain anything that looks like a metadata block? A blunt
 * check on purpose — it is asserting the ABSENCE of something, so it should be
 * over-eager rather than clever.
 */
export function looksLikeItStillHasMetadata(b: Uint8Array): string[] {
  const found: string[] = [];
  const text = ascii(b, 0, Math.min(b.length, 200_000));
  if (text.includes('Exif\u0000')) found.push('Exif header');
  if (text.includes('eXIf')) found.push('PNG eXIf chunk');
  if (text.includes('http://ns.adobe.com/xap')) found.push('XMP packet');
  if (text.includes('Photoshop 3.0')) found.push('IPTC/8BIM block');
  if (text.includes('GPSLatitude') || text.includes('GPSLongitude')) found.push('GPS tag name');
  return found;
}
