import type { TradeIdea, LevelKind } from '../../ui/trade';
import type { ReadLevel, TradeRead } from '../portal2/read';
import { money } from './useTickerNow';

/**
 * THE DESK'S READ → A TRADE IDEA. THE THIRD SEAM, AND THE SMALLEST.
 *
 * `features/alerts/trade-adapter.ts` and `features/community/trade-adapter.ts`
 * are the other two, and their headers carry the arguments this one inherits.
 * What is worth writing down here is only what is different about this wire.
 *
 * ── IT ALREADY HAS NUMBERS, AND IT ALREADY HAS ZONES ───────────────────────
 * `ReadLevel` is the one wire of the three that got this right first: `price`
 * is a number, and `price2` is "the far edge of a zone — entry 504–507" in its
 * own words. So there is no parsing to do and nothing to refuse. The zone is
 * handled the way the alert card handles it — the near edge is what the kit
 * measures with, the wire's own printed range is what the member reads — and
 * that agreement is the entire point of these three files existing.
 *
 * ── IT HAS A LEVEL THE KIT HAS NO WORD FOR ────────────────────────────────
 * `ReadLevel.key` can be `trigger`, and the kit's `LevelKind` is exactly
 * entry / stop / target. A trigger is not an entry — it is the price that
 * arms the idea, not the price you pay — so it is NOT mapped onto one.
 * `extraLevels` hands it back to the caller to print in its own words beside
 * the three, which is the honest alternative to renaming a level into a
 * neighbour that happens to have a cell free.
 *
 * ── THERE IS NO CHART HERE, ON PURPOSE ────────────────────────────────────
 * `candles` is empty and stays empty. The ticker page draws its own chart from
 * the market lane; this idea exists to feed `TradeLevels` and
 * `RiskRewardRuler`, which need the numbers and not the bars. See the import
 * comment in `Now.tsx` for why a second chart would be worse than no chart.
 */

const KIT: Partial<Record<ReadLevel['key'], LevelKind>> = {
  entry: 'entry',
  stop: 'stop',
  target: 'target',
};

/** A zone prints as the range the desk published; a price prints as itself. */
const printed = (l: ReadLevel): string =>
  l.price2 ? `${money(l.price)}–${money(l.price2)}` : money(l.price);

export function ideaFromTradeRead(read: TradeRead): {
  idea: TradeIdea;
  levelText: Partial<Record<LevelKind, string | null>>;
  extraLevels: ReadLevel[];
  /**
   * True when any level came as a range.
   *
   * The alert card refuses to draw a measured ruler off one edge of a zone,
   * because a ratio taken from the near edge is a best case dressed as the
   * case. That refusal is a rule about the app, not about the alerts screen,
   * so this surface obeys it too — and here it costs nothing, because the
   * desk's own headline states the ratio in its own words directly above.
   */
  zoned: boolean;
} {
  const idea: TradeIdea = {
    id: read.symbol,
    symbol: read.symbol,
    company: '',
    title: read.headline,
    summary: '',
    /*
     * Stated or nothing. `read.direction` is explicitly null when the wire did
     * not say, and the kit only uses direction to decide which side of the
     * entry the risk sits on — so defaulting to long where nothing was said
     * would silently flip the meaning of a short's ruler.
     */
    direction: read.direction ?? 'long',
    grade: read.gradeable ? read.grade_display : null,
    entry: null,
    stop: null,
    target: null,
    status: read.takeable ? 'entry_reached' : 'watching',
    candles: [],
    dataLabel: '',
  };
  const levelText: Partial<Record<LevelKind, string | null>> = {};
  const extraLevels: ReadLevel[] = [];
  let zoned = false;

  for (const level of read.because) {
    const kind = KIT[level.key];
    if (!kind) {
      extraLevels.push(level);
      continue;
    }
    /* The near edge is the geometry; the printed range is the label. */
    if (level.price2 != null) zoned = true;
    idea[kind] = level.price;
    levelText[kind] = printed(level);
  }
  return { idea, levelText, extraLevels, zoned };
}
