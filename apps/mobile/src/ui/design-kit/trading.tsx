import React from 'react';
import { View, Pressable } from 'react-native';
import Svg, { Line, Rect, Path, Text as SvgText } from 'react-native-svg';
import { TickerMark } from '../Ticker';
import { color, alpha, useDesignPreferences } from './theme';
import { ActionButton, Badge, Divider, KitText, Row, Stack, Surface } from './primitives';
import { KitIcon } from './icons';
import { price, riskReward, tradeGeometry, STATUS_LABEL, type TradeIdea, type LevelKind } from '../../../../../packages/trade-ui/model';
export type { TradeIdea, LevelKind };
export const levelInk = { entry: color.cyan, stop: color.red, target: color.green };

export function CompanyIdentity({ symbol, company, grade, compact = false, noLogo = false }: { symbol: string; company: string; grade?: string | null; compact?: boolean; noLogo?: boolean }) {
  return <Row><TickerMark symbol={symbol} size={compact ? 38 : 48} noLogo={noLogo} /><Stack gap={0} style={{ flex: 1 }}><KitText size={compact ? 19 : 28} weight="bold" lh={compact ? 24 : 32}>{symbol}</KitText><KitText size={13} c={color.muted}>{company}</KitText></Stack>{grade && <Badge tone="gold">{grade} setup</Badge>}</Row>;
}
/** Market data, not decorative sparkline: all geometry comes from the supplied OHLC bars. */
export function TradeChart({ idea, height = 220, selected = 'entry', annotated = false }: { idea: TradeIdea; height?: number; selected?: LevelKind; annotated?: boolean }) {
  const geometry = tradeGeometry(idea); const rr = riskReward(idea);
  const { textScale } = useDesignPreferences();
  if (!geometry) return <View style={{ minHeight: 160, justifyContent: 'center' }}><KitText c={color.muted}>Chart unavailable. Levels will appear when supplied.</KitText></View>;
  const { width, height: h, candles, levels, grid, plotBottom } = geometry;
  const entry = levels.find(l => l.kind === 'entry');
  // Label leaders prevent near-identical levels from producing overlapping price pills.
  const sorted = [...levels].sort((a,b) => a.y - b.y);
  const labels = new Map<LevelKind, number>();
  let last = -30;
  sorted.forEach((level, index) => { const y = Math.max(last + 33, Math.min(level.y, plotBottom - (sorted.length - 1 - index) * 33)); labels.set(level.kind, y); last = y; });
  const chartLabel = `${idea.symbol}, ${idea.direction} setup. Entry ${price(idea.entry)}, stop ${price(idea.stop)}, target ${price(idea.target)}. ${candles.length ? `${candles.length} price candles.` : 'Price history unavailable.'}`;
  return <Stack gap={3}><View accessible accessibilityRole="image" accessibilityLabel={chartLabel}>
    <Svg width="100%" height={height * Math.min(textScale, 1.2)} viewBox={`0 0 ${width} ${h}`}>
      {grid.map(y => <Line key={y} x1={8} x2={278} y1={y} y2={y} stroke={alpha.ivory08} strokeDasharray="2 4" />)}
      {rr && entry && levels.filter(l => l.kind !== 'entry').map(l => <Rect key={l.kind} x={200} y={Math.min(l.y, entry.y)} width={78} height={Math.abs(l.y - entry.y)} fill={l.kind === 'target' ? alpha.green12 : alpha.red12} />)}
      {candles.map((c,i) => <React.Fragment key={i}><Line x1={c.x} x2={c.x} y1={c.yHigh} y2={c.yLow} stroke={c.close >= c.open ? color.cyan : color.red} strokeWidth={1} /><Rect x={c.x-c.bodyWidth/2} y={Math.min(c.yOpen,c.yClose)} width={c.bodyWidth} height={Math.max(1.5,Math.abs(c.yClose-c.yOpen))} rx={.8} fill={c.close >= c.open ? color.cyan : color.red} /></React.Fragment>)}
      {levels.map(l => <React.Fragment key={l.kind}><Line x1={8} x2={278} y1={l.y} y2={l.y} stroke={levelInk[l.kind]} strokeDasharray="5 5" strokeWidth={l.kind === selected ? 1.5 : 1} /><Path d={`M278 ${l.y} L287 ${labels.get(l.kind)}`} stroke={levelInk[l.kind]} fill="none" /><Rect x={288} y={labels.get(l.kind)!-10} width={70} height={20} rx={4} fill={levelInk[l.kind]} /><SvgText x={323} y={labels.get(l.kind)!+4} fontSize={12} fontWeight="600" textAnchor="middle" fill={color.bg}>{price(l.value, idea.pricePrecision)}</SvgText><SvgText x={323} y={labels.get(l.kind)!+22} fontSize={9} textAnchor="middle" fill={levelInk[l.kind]}>{l.kind.toUpperCase()}</SvgText></React.Fragment>)}
      {annotated && entry && <React.Fragment><Path d={`M175 ${entry.y+3} q12 20 30 30`} stroke={color.violetLight} strokeWidth={1.5} fill="none" /><SvgText x={90} y={Math.min(plotBottom-5,entry.y+52)} fontSize={12} fill={color.violetLight}>Old resistance → now support</SvgText></React.Fragment>}
      <Line x1={8} x2={278} y1={plotBottom} y2={plotBottom} stroke={alpha.ivory20} />
    </Svg></View>
    {!candles.length && <KitText size={13} c={color.muted}>Price history unavailable · supplied levels only</KitText>}
  </Stack>;
}
export function PriceLevels({ idea, selected, onSelect }: { idea: TradeIdea; selected?: LevelKind; onSelect?: (level: LevelKind) => void }) {
  const { textScale } = useDesignPreferences();
  const large = textScale > 1.1;
  return <Row gap={0} style={large ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}>{(['entry','stop','target'] as const).map((level,i) => {
    const content = <Stack gap={3}><KitText size={12} c={color.muted}>{level[0].toUpperCase()+level.slice(1)}</KitText><KitText mono size={21} weight="semibold" c={levelInk[level]}>{price(idea[level],idea.pricePrecision)}</KitText></Stack>;
    const style = { flex: large ? undefined : 1, minWidth: 0, paddingVertical: 8, paddingLeft: i && !large ? 10 : 0, borderLeftWidth: i && !large ? 1 : 0, borderLeftColor: alpha.ivory12 };
    return onSelect ? <Pressable key={level} style={style} accessibilityRole="button" accessibilityLabel={`Explain ${level} ${price(idea[level])}`} accessibilityState={{ selected: selected === level }} onPress={() => onSelect(level)}>{content}</Pressable> : <View key={level} style={style}>{content}</View>;
  })}</Row>;
}
export function RiskRewardBar({ idea }: { idea: TradeIdea }) {
  const rr = riskReward(idea);
  if (!rr) return <KitText size={13} c={color.muted}>Risk/reward unavailable · check the trade levels</KitText>;
  return <Stack gap={7}><Row gap={4}><View style={{ flex: rr.riskFraction, height: 8, backgroundColor: color.red, borderRadius: 3 }} /><View style={{ flex: 1-rr.riskFraction, height: 8, backgroundColor: color.green, borderRadius: 3 }} /></Row><Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><KitText size={12} c={color.red}>Risk 1R ({price(rr.risk)})</KitText><KitText size={12} c={color.green}>Reward {rr.ratio.toFixed(1)}R ({price(rr.reward)})</KitText></Row></Stack>;
}
export function TradeLifecycle({ status }: { status: TradeIdea['status'] }) {
  const steps = ['watching','entry_reached','active','closed'] as const; const index = steps.indexOf(status as typeof steps[number]);
  if (index < 0) return <Badge tone="risk">{STATUS_LABEL[status]}</Badge>;
  return <Row gap={0}>{steps.map((step,i) => <Stack key={step} gap={7} style={{ flex: 1, alignItems: 'center' }}><Row gap={0} style={{ width: '100%' }}><View style={{ flex: 1, height: 1, backgroundColor: i ? alpha.ivory20 : 'transparent' }} /><View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: i <= index ? color.volt : color.muted, backgroundColor: i <= index ? color.volt : color.bg }} /><View style={{ flex: 1, height: 1, backgroundColor: i < 3 ? alpha.ivory20 : 'transparent' }} /></Row><KitText size={10} c={i === index ? color.text : color.muted}>{STATUS_LABEL[step]}</KitText></Stack>)}</Row>;
}
export function TradeIdeaPreview({ idea, onOpen, noLogo = false }: { idea: TradeIdea; onOpen: () => void; noLogo?: boolean }) {
  return <Surface><CompanyIdentity symbol={idea.symbol} company={idea.company} grade={idea.grade} noLogo={noLogo} /><KitText size={14} c={color.muted}>{idea.summary}</KitText><TradeChart idea={idea} height={180} /><PriceLevels idea={idea} /><RiskRewardBar idea={idea} /><ActionButton label="Review setup" onPress={onOpen} /></Surface>;
}
export function CompactTradeRow({ idea, onOpen, noLogo = false }: { idea: TradeIdea; onOpen: () => void; noLogo?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${idea.symbol} setup`} onPress={onOpen} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: alpha.ivory12 }}><Row><View style={{ flex: 1 }}><CompanyIdentity symbol={idea.symbol} company={idea.company} compact noLogo={noLogo} /></View><Badge>{STATUS_LABEL[idea.status]}</Badge><KitIcon name="chevron" size={16} /></Row></Pressable>;
}
export function MetricStrip({ items }: { items: readonly { label: string; value: string; ink?: string }[] }) {
  return <Row gap={12} style={{ flexWrap: 'wrap' }}>{items.map(item => <Stack key={item.label} gap={4} style={{ flexGrow: 1, flexBasis: 90 }}><KitText size={12} c={color.muted}>{item.label}</KitText><KitText mono size={22} c={item.ink ?? color.text}>{item.value}</KitText></Stack>)}</Row>;
}
export function OrderSummary({ idea, quantity, execution, onQuantityChange }: { idea: TradeIdea; quantity: number; execution: 'paper' | 'live'; onQuantityChange?: (value: number) => void }) {
  const rr = riskReward(idea); const valid = Number.isInteger(quantity) && quantity > 0;
  return <Stack><Row style={{ justifyContent: 'space-between' }}><Badge tone={execution === 'live' ? 'risk' : 'neutral'}>{execution === 'paper' ? 'Paper · practice money' : 'LIVE · real money'}</Badge><KitText size={13}>{idea.direction === 'long' ? 'Buy' : 'Sell short'}</KitText></Row><Row><KitText style={{ flex: 1 }}>Shares</KitText>{onQuantityChange && <Pressable accessibilityRole="button" accessibilityLabel="Remove one share" accessibilityState={{ disabled: quantity <= 1 }} disabled={quantity <= 1} onPress={() => onQuantityChange(Math.max(1,quantity-1))} style={{ padding: 14 }}><KitText>−</KitText></Pressable>}<KitText mono size={24}>{valid ? quantity : '—'}</KitText>{onQuantityChange && <Pressable accessibilityRole="button" accessibilityLabel="Add one share" onPress={() => onQuantityChange(quantity+1)} style={{ padding: 14 }}><KitIcon name="plus" size={18} /></Pressable>}</Row><Divider /><MetricStrip items={[{ label: 'Estimated value', value: idea.entry !== null && valid ? `$${price(idea.entry*quantity)}` : '—' }, { label: 'Planned risk', value: rr && valid ? `$${price(rr.risk*quantity)}` : '—', ink: color.red }]} /><KitText size={13} c={color.muted}>A stop defines planned risk; execution price can differ.</KitText></Stack>;
}
