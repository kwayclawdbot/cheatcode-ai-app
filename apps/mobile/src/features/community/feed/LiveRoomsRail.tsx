/**
 * THE LIVE ROOMS RAIL (V2 board, panel 3, top).
 *
 * One ring per room the API puts on the strip, in the API's order — nothing is
 * hard-coded here, so a room the owner adds (or Swing Desk, if it comes back)
 * appears on its own and nothing is drawn for a room that does not exist.
 *
 * The ring is LIT when somebody is in the room right now (`listener_count > 0`)
 * or posted in the last 15 minutes (`live`). Lit is orange — the brand — except
 * Ask Kai, whose ring is violet because that room is Kai's. The LIVE badge is
 * drawn only when the server says `live`. "N online" is the server's heartbeat
 * count, verbatim; a room nobody is in says "Quiet" rather than "0 online".
 *
 * Open circles follow the rooms: they are rooms too, time-boxed around one
 * name, and this rail is the one place a member looks for "where is everybody".
 */
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { LiveRoom } from '@shared/community';
import { T } from '../../../ui/Text';
import { alpha, color, layout, radius } from '../../../ui/tokens';
import { TickerMark } from '../../../ui/Ticker';
import { useTextScale } from '../../a11y/context';
import type { Circle } from '../../circles/types';
import {
  AskKaiGlyph, BeginnersGlyph, InvestorsGlyph, RoomGlyph, WarRoomGlyph, WinsGlyph,
} from './icons';

const RING = 58;
const ITEM_W = 72;

function glyphFor(slug: string | null, lit: boolean) {
  const c = lit ? color.action : color.textSecondary;
  switch (slug) {
    case 'traders': return <WarRoomGlyph c={c} />;
    case 'investors': return <InvestorsGlyph c={c} />;
    case 'wins': return <WinsGlyph c={c} />;
    case 'ask-kai': return <AskKaiGlyph />;
    case 'beginners': return <BeginnersGlyph c={c} />;
    default: return <RoomGlyph c={c} />;
  }
}

export const countLabel = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}K` : String(n);

function Ring({ lit, kai, live, children, testID }: {
  lit: boolean; kai: boolean; live: boolean; children: React.ReactNode; testID?: string;
}) {
  const ring = !lit ? alpha.border : kai ? color.kai : color.action;
  return (
    <View testID={testID} style={{ width: RING, height: RING + (live ? 6 : 0) }}>
      <View
        style={{
          width: RING, height: RING, borderRadius: RING / 2, borderWidth: lit ? 2.5 : 1.5, borderColor: ring,
          alignItems: 'center', justifyContent: 'center', padding: 3,
          boxShadow: lit ? `0 0 16px ${kai ? alpha.kai40 : alpha.action40}` : undefined,
        }}
      >
        <View
          style={{
            width: '100%', height: '100%', borderRadius: RING, backgroundColor: kai && lit ? color.kaiDeep : color.raised,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {children}
        </View>
      </View>
      {live ? (
        <View
          style={{
            position: 'absolute', bottom: 0, alignSelf: 'center', paddingHorizontal: 7, height: 18,
            borderRadius: 6, backgroundColor: color.action, justifyContent: 'center',
            borderWidth: 2, borderColor: color.canvas,
          }}
        >
          <T size={10} weight="bold" c={color.onAction} ls={0.6}>LIVE</T>
        </View>
      ) : null}
    </View>
  );
}

function Label({ name, sub, dot, width }: { name: string; sub: string; dot: boolean; width: number }) {
  return (
    <View style={{ alignItems: 'center', gap: 1, width }}>
      <T variant="meta" weight="semibold" c={color.textPrimary} numberOfLines={1}>{name}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.marketUp }} /> : null}
        <T size={11} c={color.textSecondary} numberOfLines={1}>{sub}</T>
      </View>
    </View>
  );
}

export function LiveRoomsRail({ rooms, circles = [], onOpenRoom, onOpenCircle, testID = 'live-rooms' }: {
  rooms: LiveRoom[];
  circles?: Circle[];
  onOpenRoom: (r: LiveRoom) => void;
  onOpenCircle?: (c: Circle) => void;
  testID?: string;
}) {
  // Labels grow with the member's text size, so the column does too; the rail
  // scrolls sideways rather than cutting "Beginners" to "Beginne…".
  const itemW = Math.round(ITEM_W * Math.max(1, useTextScale()));
  return (
    <ScrollView
      horizontal
      testID={testID}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: layout.gutter - 8, gap: 2, paddingTop: 4, paddingBottom: 10 }}
    >
      {rooms.map((r) => {
        const lit = r.listener_count > 0 || r.live;
        const kai = r.slug === 'ask-kai';
        const key = r.slug ?? r.id;
        return (
          <Pressable
            key={r.id}
            testID={`live-room-${key}`}
            accessibilityRole="button"
            accessibilityLabel={`${r.name}${r.live ? ', live' : ''}, ${r.listener_count} online`}
            onPress={() => onOpenRoom(r)}
            style={({ pressed }) => ({ alignItems: 'center', gap: 6, width: itemW, opacity: pressed ? 0.75 : 1 })}
          >
            <Ring lit={lit} kai={kai} live={r.live} testID={`live-room-${key}-ring`}>
              {glyphFor(r.slug, lit)}
            </Ring>
            <Label
              name={r.name}
              sub={r.listener_count > 0 ? `${countLabel(r.listener_count)} online` : 'Quiet'}
              dot={r.listener_count > 0}
              width={itemW}
            />
          </Pressable>
        );
      })}
      {circles.filter((c) => !c.closed).map((c) => (
        <Pressable
          key={c.id}
          testID={`live-circle-${c.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${c.name} circle, ${c.time_left_plain}`}
          onPress={() => onOpenCircle?.(c)}
          style={({ pressed }) => ({ alignItems: 'center', gap: 6, width: itemW, opacity: pressed ? 0.75 : 1 })}
        >
          <Ring lit={c.unread > 0} kai={false} live={false}>
            <TickerMark symbol={c.symbol} size={30} />
          </Ring>
          <Label name={c.symbol} sub={c.time_left_plain} dot={false} width={itemW} />
        </Pressable>
      ))}
      <View style={{ width: 4, borderRadius: radius.pill }} />
    </ScrollView>
  );
}
