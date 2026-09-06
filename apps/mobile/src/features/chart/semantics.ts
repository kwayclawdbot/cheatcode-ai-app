/**
 * Annotation semantics → tokens (14 palette lock).
 *
 * The API sends MEANING (`kind`), never a colour. This is the one place the
 * mapping lives, so a level can never be drawn in a colour that means something
 * else on another screen:
 *   cyan  = market information (entry, support, resistance, trigger)
 *   red   = risk (stop, invalidation)
 *   green = the positive outcome (target)
 *   violet = Kai's own commentary (note)
 *   muted = an indicator overlay — context, not a level
 */
import { color } from '../../ui/tokens';
import type { AnnotationKind } from '../portal/types';

export const kindColor = (k: AnnotationKind): string => {
  switch (k) {
    case 'stop':
    case 'invalidation':
      return color.red;
    case 'target':
      return color.green;
    case 'note':
      return color.violetLight;
    /**
     * AN OVERLAY IS BACKGROUND, AND IT HAS TO LOOK LIKE IT.
     *
     * Averages are the most-drawn thing on the chart and the least decisive: no
     * average is where you enter, where you get out, or where you were wrong.
     * Drawing them in cyan would give a moving line the same weight as the
     * trigger, and four of them would drown it — which is the second half of why
     * the chart read as noise even once the shape was right.
     *
     * `muted` IS ALREADY IN THE PALETTE. It is the warm grey the app uses for
     * secondary text, so nothing is added to the fourteen and nothing borrows a
     * meaning it does not have. It reads as "context" next to cyan, red and
     * green, which is exactly what an average is. The curves are told apart from
     * each other by their labels and by weight, never by hue — one family, one
     * meaning.
     */
    case 'indicator':
      return color.muted;
    /**
     * A ZONE TAKES ITS MEANING FROM WHERE IT IS, and the chart page is the only
     * thing that knows where price is, so the tone is decided there (see
     * `zoneColour` in chart-web/src/03-annotations.js): an area under price is
     * acting as support and over it as resistance, the same rule
     * `computedLevels` uses on the server. Cyan is the neutral answer for
     * anything asking here without that context — a zone is market information,
     * never risk and never a target.
     */
    case 'zone':
      return color.cyan;
    case 'trigger':
    case 'entry':
    case 'support':
    case 'resistance':
    // The shape kinds carry no financial meaning of their own —
    // a trendline is a trendline whether it runs under support or over
    // resistance, and a circle is a circle wherever it lands — so they read as
    // market information, never as risk and never as a target. A zone that IS
    // about risk gets its meaning from the level kind it was built from, not
    // from being a rectangle.
    case 'trendline':
    case 'box':
    case 'vertical':
    case 'circle':
    case 'arrow':
    default:
      return color.cyan;
  }
};

/** Grade families (spec §4). Never used to mean profit — quality only. */
export const gradeColor = (grade: string | null | undefined): string => {
  const g = String(grade ?? '').trim().toUpperCase();
  if (g.startsWith('A')) return color.gold;
  if (g.startsWith('B')) return color.violet;
  if (g.startsWith('C')) return color.gold;
  return color.muted;
};
