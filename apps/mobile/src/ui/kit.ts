/**
 * THE REDESIGN KIT — one import for the screen lanes.
 *
 *   import { Card, AppBar, SegmentedControl, PriceTriplet } from '../ui/kit';
 *
 * Source of truth for the look: docs/design/redesign-2026-09-21/. Every value
 * these components draw comes from ./tokens.ts. Compose screens from these;
 * do not restyle them per screen.
 */
export { AppBar, IconButton } from './AppBar';
export { BrandMark, BrandMarkButton } from './BrandMark';
export { KaiAvatar } from './KaiAvatar';
export { Card, CardStack, Divider, type CardTone } from './Card';
export { Pill, ContextChip, StatusChip, type ChipTone } from './Chips';
export { SegmentedControl, SectionTabs } from './SegmentedControl';
export { GradeBadge } from './GradeBadge';
export { PriceTriplet } from './PriceTriplet';
export { T, Num, Eyebrow } from './Text';
export { Button } from './Button';
export { hitSlopFor, minTarget } from './touch';
export {
  color, alpha, palette, radius, grid, layout, shadow, typeScale, tap,
  type TextVariant,
} from './tokens';
