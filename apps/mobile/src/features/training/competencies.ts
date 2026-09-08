import { LESSON_CONTENT } from './curriculum';
import type { CompetencyTag, LessonScreen } from './types';

/**
 * THE COMPETENCY REGISTRY — derived from the lesson content, never typed twice.
 *
 * The progress board needs a human label for `stock_ownership`. That label is
 * already written, in the lesson that measures it, next to the question that
 * measures it. Keeping a second list here would mean two places to edit and one
 * of them silently going stale, so the registry is read out of the content
 * files instead: a key exists on the board because a lesson asked for it.
 */
function tagsIn(screen: LessonScreen): CompetencyTag[] {
  switch (screen.type) {
    case 'quiz':
    case 'sorting':
      return screen.competency ? [screen.competency] : [];
    case 'kai_check':
      return [screen.competency];
    case 'mastery_challenge':
      return screen.questions
        .map((q) => q.competency)
        .filter((t): t is CompetencyTag => t !== undefined);
    default:
      return [];
  }
}

export function competencyRegistry(): CompetencyTag[] {
  const seen = new Map<string, CompetencyTag>();
  for (const content of Object.values(LESSON_CONTENT)) {
    for (const screen of content.screens) {
      for (const tag of tagsIn(screen)) {
        if (!seen.has(tag.key)) seen.set(tag.key, tag);
      }
    }
  }
  return Array.from(seen.values());
}

export function competencyLabel(key: string): string {
  return competencyRegistry().find((t) => t.key === key)?.label ?? key;
}
