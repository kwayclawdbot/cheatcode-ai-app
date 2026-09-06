/**
 * WHAT A MEMBER WROTE, WITH THE FOUR THINGS THAT ARE NOT PROSE PICKED OUT.
 *
 * The room and the club feed used to carry two different parsers. They drifted:
 * the feed turned `$META` into a cyan chip and the room did not, so the same
 * sentence read as two different things depending on which screen you opened it
 * on. This is the one parser, and both screens now call it.
 *
 * FOUR MARKS, AND THE ORDER THEY ARE MATCHED IN MATTERS:
 *
 *   $NVDA    a ticker      -> the inline ticker token (vibrant, tappable)
 *   @Kai     a mention     -> violet, because violet is Kai's
 *   $58      money         -> PLAIN, and matched before a bare number so a
 *                            dollar amount is never mistaken for a price level
 *   504      a price level -> cyan mono, because cyan is market data
 *
 * `$` DOES DOUBLE DUTY and that is the whole reason the order is written down.
 * `$NVDA` is an instrument; `$58` is money. Letters after the dollar mean the
 * first, digits mean the second, and nothing else has to be guessed.
 *
 * NOTHING HERE MUTATES WHAT WAS STORED. The body in the database is the body the
 * member typed, cashtag casing and all; the uppercase `$NVDA` is a rendering
 * decision made fresh every time this runs. Rewriting posts to normalise them
 * would edit people's words, and this app does not edit people's words.
 */
import React from 'react';
import { alpha, color } from '../../../ui/tokens';
import { T, Num } from '../../../ui/Text';
import { Cashtag } from '../../../ui/Ticker';

/**
 * Case-insensitive on input, because nobody holds shift to type a ticker in a
 * chat, and one to five letters because that is the length of a US symbol. The
 * `\b` is what stops `$ABCDEFG` from being read as `$ABCDE` plus a fragment.
 */
const CASHTAG = /^\$[A-Za-z]{1,5}$/;
const MONEY = /^\$\d/;
const LEVEL = /^\d{2,5}(\.\d{1,2})?$/;

const SPLIT = /(\$[A-Za-z]{1,5}\b|@Kai\b|\$\d[\d.,]*|\b\d{2,5}(?:\.\d{1,2})?\b)/g;

export function PostBody({
  text,
  size = 13.5,
  lineHeight,
  onTicker,
  testID,
}: {
  text: string;
  size?: number;
  /** Defaults to a 1.45 ramp — the room's rhythm. The feed passes 1.5. */
  lineHeight?: number;
  /** Absent = the ticker still gets its token, it just does not lead anywhere. */
  onTicker?: (symbol: string) => void;
  testID?: string;
}) {
  const lh = lineHeight ?? Math.round(size * 1.45);
  const parts = text.split(SPLIT).filter((p) => p !== '');

  return (
    <T size={size} lh={lh} testID={testID}>
      {parts.map((p, i) => {
        if (CASHTAG.test(p)) {
          return <Cashtag key={i} symbol={p.slice(1)} size={size} onPress={onTicker} />;
        }
        if (p === '@Kai') {
          return (
            <T key={i} size={size} lh={lh} weight="semibold" c={color.violetLight} style={{ backgroundColor: alpha.violet20 }}>
              {' @Kai '}
            </T>
          );
        }
        // Money stays in the sentence's own face. It is not a level to compare
        // against, so setting it in the numeric face would say it was one.
        if (MONEY.test(p)) return <T key={i} size={size} lh={lh}>{p}</T>;
        if (LEVEL.test(p)) return <Num key={i} size={size - 1.5} weight="regular" c={color.cyan}>{p}</Num>;
        return <T key={i} size={size} lh={lh}>{p}</T>;
      })}
    </T>
  );
}

/** The symbols a post names, in the order they appear, de-duplicated. */
export function cashtagsIn(text: string | null | undefined): string[] {
  const found = String(text ?? '').match(/\$[A-Za-z]{1,5}\b/g) ?? [];
  return [...new Set(found.map((c) => c.slice(1).toUpperCase()))];
}
