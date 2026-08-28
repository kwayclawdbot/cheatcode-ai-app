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
    case 'trigger':
    case 'entry':
    case 'support':
    case 'resistance':
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
