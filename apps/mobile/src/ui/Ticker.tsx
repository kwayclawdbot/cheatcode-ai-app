/**
 * THE TICKER OBJECT — one component, every ticker in the app.
 *
 * The standing rule (owner memory, app-wide): a ticker is NEVER plain text. It
 * appears with its logo, or vibrantly styled when there is no room for one, and
 * it does so through ONE shared component so the treatment cannot drift between
 * screens. Before this file the treatment lived as a private `LogoTile` inside
 * `features/alerts/AlertCard.tsx` — a gradient square holding the symbol's
 * first letter, which is the plain-text case wearing a costume, and which
 * nothing outside that one file could reach.
 *
 * WHERE THE MARKS COME FROM
 * -------------------------
 * `GET {apiBase}/api/v1/market/logo/{symbol}` — see the route's own header. The
 * client never holds a Polygon URL, because Polygon's brand assets answer 401
 * without the market-data key appended, and that key does not belong in a
 * phone. A symbol with no mark answers 404 and the mark below draws itself.
 *
 * THREE HONEST STATES, ONE LAYOUT
 * -------------------------------
 * The letters mark is always mounted, at full opacity, from the first frame. A
 * logo, when there is one, fades in ON TOP of it. That is the whole state
 * machine, and it is built this way for three reasons:
 *
 *   1. NOT LOADED YET never shows a hole or a spinner. A 30px spinner is an
 *      apology for a 40ms wait. The row is complete on frame one and gets
 *      better a moment later.
 *   2. NO LOGO AT ALL — every ETF on this plan (SPY, QQQ, ARKK all answer with
 *      no branding), and most small caps — is not a failure state. It is the
 *      resting state, so it is the one that got the design attention. It is
 *      what most users will see most of the time.
 *   3. Nothing reflows. The logo arriving changes no layout, so a list does not
 *      twitch as marks land.
 *
 * THE PLATE, AND THE DARK-ON-DARK PROBLEM
 * ---------------------------------------
 * Polygon's icons are not a uniform set. Apple's is a black mark on an opaque
 * white ground; Tesla's is white on opaque red; Berkshire Hathaway's is a
 * transparent PNG carrying a NAVY wordmark, which on this app's `#0B0B0E`
 * ground is very nearly invisible (all three verified against the live endpoint
 * on 2026-09-01). So every logo is composited on an ivory plate. Where the icon
 * brings its own ground — most of them — the plate is never seen. Where it does
 * not, the plate is the thing that keeps a dark mark readable.
 *
 * The alternative was to measure each mark's luminance server-side and plate
 * only the dark ones. That was rejected: it is a heuristic that fails silently
 * and invisibly, on exactly the small-cap symbols nobody is looking at, and the
 * failure mode is an invisible logo. A rule that always holds beats a guess
 * that usually does.
 *
 * WHY THE LETTERS MARK IS CYAN
 * ----------------------------
 * The palette grammar is not decorative: volt = the user, violet = Kai, cyan =
 * the market (docs/14). A ticker is market data, so cyan is not a choice, it is
 * the only correct answer — and it means every logo-less symbol in the app
 * shares one identity instead of a bag of tinted squares. The letters
 * differentiate the symbols; the treatment does not have to.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { alpha, color } from './tokens';
import { T } from './Text';
import { env } from '../lib/env';

/**
 * Session memory, module level on purpose.
 *
 * `MISSING` stops a screen full of ETFs re-requesting a 404 every time a row
 * mounts. `SEEN` skips the fade for a mark this session has already shown, so
 * scrolling back up a list is instant rather than a wall of things fading in
 * again — the animation is there to cover a first arrival, not to be a style.
 */
const MISSING = new Set<string>();
const SEEN = new Set<string>();

/** Test seam + a way for a screen to force the letters mark (the design gallery). */
export function __resetTickerMarkCache(): void {
  MISSING.clear();
  SEEN.clear();
}

export function logoUri(symbol: string): string | null {
  if (!env.apiBase) return null;
  const clean = symbol.toUpperCase().trim();
  if (!/^[A-Z0-9.-]{1,10}$/.test(clean)) return null;
  return `${env.apiBase}/api/v1/market/logo/${encodeURIComponent(clean)}`;
}

/** Below this a glyph is a smudge, not a letter. */
const MIN_GLYPH = 8.5;

/**
 * The letters mark carries THE WHOLE SYMBOL, shrunk to fit, and only truncates
 * when the whole thing would fall under the legibility floor.
 *
 * The obvious rule — "take the first three" — is worse than it looks, because a
 * prefix of a real ticker is usually another real ticker. `ARKK` clipped to
 * `ARK` names a different fund. So the type shrinks first and the symbol is cut
 * last, which means at 30px and above almost every four-letter symbol shows
 * whole. The case that still cannot win is `GOOGL` in a 22px history row, where
 * three glyphs is all that fits and `GOO` is a fragment — noted, and mitigated
 * by the fact that the full symbol is set in text immediately beside the mark
 * in every place the app uses one.
 */
function markGlyphs(symbol: string, size: number): { text: string; fontSize: number } {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return { text: '—', fontSize: size * 0.32 };
  // Mono advance is ~0.62em, and the tile keeps ~18% of itself as padding.
  const inner = size * 0.82;
  const fits = Math.max(1, Math.floor(inner / (0.62 * MIN_GLYPH)));
  const text = clean.slice(0, Math.min(clean.length, fits));
  return { text, fontSize: Math.min(size * 0.32, inner / (0.62 * text.length)) };
}

export type TickerMarkProps = {
  symbol: string;
  /** Tile edge in px. 30 is the row size; 40+ for headers. */
  size?: number;
  /** Force the letters mark — the design gallery uses it to show the state. */
  noLogo?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The square mark. Logo when there is one, letters when there is not.
 */
export function TickerMark({ symbol, size = 30, noLogo = false, style, testID }: TickerMarkProps) {
  const sym = symbol.toUpperCase().trim();
  const uri = noLogo ? null : logoUri(sym);
  const already = SEEN.has(sym);

  const [failed, setFailed] = useState(() => !uri || MISSING.has(sym));
  const fade = useRef(new Animated.Value(already ? 1 : 0)).current;

  useEffect(() => {
    setFailed(!uri || MISSING.has(sym));
    fade.setValue(SEEN.has(sym) ? 1 : 0);
  }, [sym, uri, fade]);

  const onLoad = useCallback(() => {
    SEEN.add(sym);
    // ease-out: the mark is arriving, so the movement belongs at the front.
    // Native driver on device; web has no RCTAnimation and only warns about it.
    Animated.timing(fade, {
      toValue: 1,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [sym, fade]);

  const onError = useCallback(() => {
    MISSING.add(sym);
    setFailed(true);
  }, [sym]);

  const radius = Math.round(size * 0.3);
  const { text: glyphs, fontSize: glyphSize } = markGlyphs(sym, size);

  return (
    <View
      testID={testID ?? `ticker-mark-${sym}`}
      accessible
      accessibilityLabel={sym}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          // The edge lives on each layer, not on the container, so a logo can
          // cover the letters mark's cyan hairline completely. A tile that
          // shows a green Nvidia square inside a cyan ring is two marks.
          backgroundColor: color.cyanTint,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: radius,
          borderWidth: 0.5,
          borderColor: alpha.cyan14,
        }}
        pointerEvents="none"
      />
      <T
        mono
        weight="bold"
        size={glyphSize}
        c={color.cyan}
        ls={-glyphSize * 0.045}
        lh={glyphSize * 1.1}
        testID={`ticker-glyphs-${sym}`}
      >
        {glyphs}
      </T>

      {uri && !failed ? (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: fade,
            backgroundColor: color.text,
            borderRadius: radius,
            borderWidth: 0.5,
            // Neutral, not cyan: cyan is the letters mark's own identity, and
            // a brand mark should not be ringed in someone else's colour.
            borderColor: alpha.ivory14,
            overflow: 'hidden',
          }}
          pointerEvents="none"
        >
          <Image
            source={{ uri }}
            onLoad={onLoad}
            onError={onError}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            style={{ width: '100%', height: '100%' }}
            testID={`ticker-logo-${sym}`}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

export type TickerProps = {
  symbol: string;
  /** Tile edge. The symbol's type size is derived from it. */
  size?: number;
  /** The muted line under the symbol — company, mode, direction. */
  sub?: string | null;
  onPress?: () => void;
  noLogo?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Mark + symbol + an optional supporting line. The symbol itself is Space
 * Grotesk rather than mono: it is a NAME, and the mono face in this app means
 * "this is a number you can compare" (prices, levels, times, scores). A ticker
 * set in the numeric face reads as data, which is exactly what it is not.
 *
 * A long symbol truncates the SUPPORTING line, never the symbol — `GOOGL` and
 * `BRK.B` are not optional characters.
 */
export function Ticker({ symbol, size = 30, sub, onPress, noLogo, style, testID }: TickerProps) {
  const sym = symbol.toUpperCase().trim();
  const symbolSize = useMemo(() => Math.round(size * 0.53), [size]);

  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Math.round(size * 0.33) }}>
      <TickerMark symbol={sym} size={size} noLogo={noLogo} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={symbolSize} weight="bold" numberOfLines={1}>
          {sym}
        </T>
        {sub ? (
          <T size={Math.max(9.5, size * 0.34)} c={color.muted} numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View testID={testID ?? `ticker-${sym}`} style={style}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID ?? `ticker-${sym}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${sym}, ${sub}` : sym}
      style={style}
    >
      {body}
    </Pressable>
  );
}
