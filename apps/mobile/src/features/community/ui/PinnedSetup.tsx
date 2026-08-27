import React from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect, Circle } from 'react-native-svg';
import { alpha, color, radius } from '../../../ui/tokens';
import { T, Num } from '../../../ui/Text';
import { ObjectCard } from '../../../ui/Panel';
import { FreshnessMark } from '../../../ui/FreshnessMark';
import { Eye } from './Icons';
import type { RoomSetup } from '../types';

/**
 * The pinned setup at the top of a setup room (V3-C1).
 *
 * DEVIATION, deliberate: the artboard draws an intraday price line. This lane
 * has no candles endpoint (that is MOBILE-A's `/market/candles`) and inventing
 * a squiggle would be fake market data, which the spec forbids. So the object
 * plots the REAL last price as a marker against the plan's three levels —
 * target / confirmation / invalidation — keeping the artboard's band geometry
 * and labels, and carrying its freshness mark instead of a LIVE tag it cannot
 * honestly claim.
 */

const H = 92;

function yFor(value: number, hi: number, lo: number) {
  if (hi === lo) return H / 2;
  const t = (hi - value) / (hi - lo);
  return 6 + t * (H - 12);
}

export function PinnedSetup({
  setup, watching, testID,
}: { setup: RoomSetup; watching?: number | null; testID?: string }) {
  const target = setup.target != null ? Number(setup.target) : null;
  const entry = setup.entry != null ? Number(setup.entry) : null;
  const invalid = setup.invalid != null ? Number(setup.invalid) : null;
  const last = setup.price != null ? Number(setup.price) : null;

  const values = [target, entry, invalid, last].filter((v): v is number => v != null && Number.isFinite(v));
  const hi = values.length ? Math.max(...values) : 1;
  const lo = values.length ? Math.min(...values) : 0;
  const pad = (hi - lo) * 0.12 || 1;
  const top = hi + pad;
  const bottom = lo - pad;

  return (
    <ObjectCard testID={testID ?? 'pinned-setup'} r={radius.xl} style={{ padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T size={14} weight="bold">{setup.symbol}</T>
          {setup.grade_display ? (
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
              <T size={11} weight="bold" c={color.violet}>{setup.grade_display}</T>
            </View>
          ) : null}
          {setup.price ? <Num size={13} weight="semibold">{setup.price}</Num> : null}
          {setup.change_pct ? <Num size={11} weight="regular" c={color.muted}>{setup.change_pct}</Num> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <FreshnessMark freshness={setup.freshness} size={10} testID={`pinned-freshness-${setup.symbol}`} />
          {watching != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Eye size={11} />
              <T size={10} c={color.muted}>{watching} watching</T>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ position: 'relative' }}>
        <Svg width="100%" height={H} viewBox={`0 0 330 ${H}`} preserveAspectRatio="none">
          {target != null ? (
            <Line x1={0} y1={yFor(target, top, bottom)} x2={330} y2={yFor(target, top, bottom)} stroke={color.green} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
          ) : null}
          {entry != null ? (
            <Rect x={0} y={yFor(entry, top, bottom) - 4.5} width={330} height={9} fill="rgba(50,214,255,0.12)" />
          ) : null}
          {invalid != null ? (
            <Line x1={0} y1={yFor(invalid, top, bottom)} x2={330} y2={yFor(invalid, top, bottom)} stroke={color.red} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
          ) : null}
          {last != null ? (
            <>
              <Line x1={0} y1={yFor(last, top, bottom)} x2={330} y2={yFor(last, top, bottom)} stroke={color.cyan} strokeWidth={0.6} strokeDasharray="2 3" opacity={0.5} />
              <Circle cx={300} cy={yFor(last, top, bottom)} r={3} fill={color.cyan} />
            </>
          ) : null}
        </Svg>

        {setup.target ? (
          <View style={{ position: 'absolute', right: 4, top: 0, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, backgroundColor: color.greenTint, borderWidth: 0.5, borderColor: alpha.green40 }}>
            <Num size={9} weight="regular" c={color.green}>{setup.target} target</Num>
          </View>
        ) : null}
        {setup.entry ? (
          <View style={{ position: 'absolute', left: 4, top: '40%', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, backgroundColor: color.cyanTint, borderWidth: 0.5, borderColor: alpha.cyan40 }}>
            <Num size={9} weight="regular" c={color.cyan}>{setup.entry} confirm</Num>
          </View>
        ) : null}
        {setup.invalid ? (
          <View style={{ position: 'absolute', right: 4, bottom: 0, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, backgroundColor: color.redTint, borderWidth: 0.5, borderColor: alpha.red40 }}>
            <Num size={9} weight="regular" c={color.red}>{setup.invalid} invalid</Num>
          </View>
        ) : null}
      </View>

      <T size={10} c={color.muted}>
        Levels from Kai's plan · the marker is the last price we have, not a live chart
      </T>
    </ObjectCard>
  );
}

/** Bull / bear case pair from the artboard's two-up grid. */
export function CasePair({ bull, bear }: { bull: string; bear: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1, borderRadius: radius.xl, padding: 13, backgroundColor: color.greenTint, borderWidth: 0.5, borderColor: alpha.green40 }}>
        <T size={10} weight="bold" ls={0.8} c={color.green}>BULL CASE</T>
        <T size={13} lh={18} style={{ marginTop: 6 }}>{bull}</T>
      </View>
      <View style={{ flex: 1, borderRadius: radius.xl, padding: 13, backgroundColor: color.redTint, borderWidth: 0.5, borderColor: alpha.red40 }}>
        <T size={10} weight="bold" ls={0.8} c={color.red}>BEAR CASE</T>
        <T size={13} lh={18} style={{ marginTop: 6 }}>{bear}</T>
      </View>
    </View>
  );
}
