import React from 'react';
import { T } from './Text';
import { color } from './tokens';
import type { Weight } from './fonts';

/**
 * Kai writes with two inline marks, and only two:
 *   **bold**   the decision or the thing that matters
 *   `B+`       a grade or Kai-owned token, rendered violet (Kai's colour)
 * Anything else is plain. No markdown parser, no HTML — the artboards use
 * exactly these two emphases and nothing more.
 */
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

export function RichText({
  text, size = 14, lh, c = color.text, weight = 'regular',
}: { text: string; size?: number; lh?: number; c?: string; weight?: Weight }) {
  const parts = text.split(TOKEN).filter((p) => p !== '');
  return (
    <T size={size} lh={lh} c={c} weight={weight}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <T key={i} size={size} lh={lh} c={c} weight="bold">{p.slice(2, -2)}</T>;
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return <T key={i} size={size} lh={lh} c={color.violet} weight="bold">{p.slice(1, -1)}</T>;
        }
        return <T key={i} size={size} lh={lh} c={c} weight={weight}>{p}</T>;
      })}
    </T>
  );
}
