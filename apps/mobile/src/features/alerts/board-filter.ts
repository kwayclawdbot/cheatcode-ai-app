import type { AlertCard } from '../../lib/types';
import { gradeFamily } from '../grade/bands';
import { isShort } from './card-model';

/**
 * THE ALERTS BOARD FILTER — local to the board, never saved.
 *
 * Grade "A and above" is the grade FAMILY (the same bands the badge colours
 * with), so an "A−" is in and a "B+" is not, and an ungraded card is out: a
 * filter for A-grade setups that let through cards with no grade would be
 * answering a different question. "Saved only" reads the member's bookmarks.
 */
export type BoardFilter = {
  grade: 'any' | 'a';
  direction: 'any' | 'long' | 'short';
  saved: boolean;
};

export const NO_FILTER: BoardFilter = { grade: 'any', direction: 'any', saved: false };

export const filterIsActive = (f: BoardFilter): boolean =>
  f.grade !== 'any' || f.direction !== 'any' || f.saved;

export function applyBoardFilter(list: readonly AlertCard[], f: BoardFilter, saved: ReadonlySet<string>): AlertCard[] {
  return list.filter((a) => {
    if (f.grade === 'a') {
      const fam = gradeFamily(a.grade === '—' ? null : a.grade, a.score);
      if (!(fam === 'a-high' || fam === 'a-low') || a.grade === '—') return false;
    }
    if (f.direction !== 'any' && (isShort(a) ? 'short' : 'long') !== f.direction) return false;
    if (f.saved && !saved.has(a.id)) return false;
    return true;
  });
}
