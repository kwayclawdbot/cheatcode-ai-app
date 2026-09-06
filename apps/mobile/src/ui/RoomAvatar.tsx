import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from './Text';
import { TickerMark } from './Ticker';
import { alpha, color, gradientAngle } from './tokens';

/**
 * THE PICTURE ON A ROOM.
 *
 * Owner instruction, 6 Sept: "when ticker is used as circle the ticker logo
 * should be used as the room pic avatar, if it is something other than a
 * ticker the admin should add the avatar image."
 *
 * So there are exactly three answers, in this order:
 *
 *   1. AN ADMIN PUT A PICTURE ON IT.  That wins, always — someone chose it on
 *      purpose, including for a room that happens to start with a ticker-ish
 *      word.
 *   2. THE ROOM IS ABOUT A COMPANY.  Then it wears that company's logo, drawn
 *      by the ONE shared `TickerMark` — the same mark the alert card and the
 *      desk use, so a company looks like itself everywhere in the app. A
 *      circle for META shows the Meta logo, not the letter M.
 *   3. NEITHER.  A room named "#swing-ideas" has no company and no picture, so
 *      it gets its initial on a brand-tinted disc. That is a real fallback and
 *      it is allowed to be the permanent answer for a room nobody ever gave a
 *      picture to — it must never look like a broken image.
 *
 * WHERE THE PICTURE IS STORED. `rooms.config.image_url`. `config` is the
 * room's jsonb metadata bag and it already reaches the client, so wiring this
 * needed no migration and no new column. What does NOT exist yet is anywhere
 * for an admin to SET it — see the note in features/admin. Until that lands,
 * a non-ticker room shows its initial, which is case 3 working as designed.
 *
 * The mark is square for a company (a logo is not a face) and a disc for a
 * named room, so the two kinds of room never read as the same kind of object.
 */

/** Is this string a ticker, or just a word that happens to be short? */
export function isTickerish(symbol: string | null | undefined): boolean {
  const s = String(symbol ?? '').trim();
  return /^[A-Z]{1,6}$/.test(s);
}

/**
 * Pull the admin-set picture off a room's `config` bag. Anything that is not a
 * non-empty http(s) string is "no picture" — a half-written value must fall
 * through to the logo or the initial rather than render as a broken image.
 */
export function roomImageUrl(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  const raw = (config as Record<string, unknown>).image_url
    ?? (config as Record<string, unknown>).avatar_url;
  const s = typeof raw === 'string' ? raw.trim() : '';
  return /^https?:\/\//i.test(s) ? s : null;
}

export type RoomAvatarProps = {
  /** The company the room is about, when it is about one. */
  symbol?: string | null;
  /** The room's name — the initial comes from here when nothing else fits. */
  name?: string | null;
  /** An admin-set picture. Wins over everything. */
  imageUrl?: string | null;
  size?: number;
  testID?: string;
};

export function RoomAvatar({ symbol, name, imageUrl, size = 34, testID }: RoomAvatarProps) {
  const sym = String(symbol ?? '').trim().toUpperCase();

  // 1. The admin's picture.
  if (imageUrl) {
    return (
      <Image
        testID={testID}
        source={{ uri: imageUrl }}
        contentFit="cover"
        // The room's name is beside this on every surface that draws it, so
        // the picture says nothing new to a screen reader.
        accessibilityElementsHidden
        style={{
          width: size, height: size, borderRadius: size / 2, flexShrink: 0,
          borderWidth: 0.5, borderColor: alpha.ivory14,
        }}
      />
    );
  }

  // 2. The company's logo, through the one shared mark.
  if (isTickerish(sym)) {
    return (
      <View testID={testID} style={{ flexShrink: 0 }}>
        <TickerMark symbol={sym} size={size} />
      </View>
    );
  }

  // 3. The initial, on a disc that is plainly a room and not a missing image.
  const initial = (String(name ?? '').trim()[0] ?? '#').toUpperCase();
  return (
    <LinearGradient
      testID={testID}
      colors={[alpha.violet18, alpha.chip85] as unknown as readonly [string, string]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{
        width: size, height: size, borderRadius: size / 2, flexShrink: 0,
        borderWidth: 0.5, borderColor: alpha.violet45,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <T size={Math.round(size * 0.4)} weight="bold" c={color.violetLight}>{initial}</T>
    </LinearGradient>
  );
}
