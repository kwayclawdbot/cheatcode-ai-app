/**
 * A LIVE ROOM, INVITING YOU IN — drawn in the feed only when the server says a
 * room is `live` (somebody posted there in the last 15 minutes). A text room:
 * "Join" opens its chat. There is no audio, so nothing here says "listening".
 *
 * The count is the room's heartbeat count; the faces are the people who posted
 * there most recently (the server never says who is merely reading).
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import type { LiveRoom } from '@shared/community';
import { T } from '../../../ui/Text';
import { alpha, color, layout, radius, tap } from '../../../ui/tokens';
import { Participants } from './PostCard';
import { AskKaiGlyph, BeginnersGlyph, InvestorsGlyph, RoomGlyph, WarRoomGlyph, WinsGlyph } from './icons';

const glyph = (slug: string | null) =>
  slug === 'traders' ? <WarRoomGlyph size={24} />
  : slug === 'investors' ? <InvestorsGlyph size={24} />
  : slug === 'wins' ? <WinsGlyph size={24} />
  : slug === 'ask-kai' ? <AskKaiGlyph size={24} />
  : slug === 'beginners' ? <BeginnersGlyph size={24} />
  : <RoomGlyph size={24} />;

export function LiveInvite({ room, onJoin }: { room: LiveRoom; onJoin: () => void }) {
  const extra = Math.max(0, room.listener_count - room.speaker_avatars.length);
  return (
    <View style={{ paddingHorizontal: layout.gutter - 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: alpha.divider }}>
      <Pressable
        testID={`live-invite-${room.slug ?? room.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${room.name} is live, ${room.listener_count} here now. Join.`}
        onPress={onJoin}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
          borderRadius: radius.card, borderWidth: 1, borderColor: alpha.border,
          backgroundColor: pressed ? color.raised : color.surface,
        })}
      >
        <View
          style={{
            width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: color.action,
            alignItems: 'center', justifyContent: 'center', backgroundColor: color.raised,
          }}
        >
          {glyph(room.slug)}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="cardTitle" c={color.textPrimary} numberOfLines={1} style={{ flexShrink: 1 }}>{room.name}</T>
            <View style={{ paddingHorizontal: 6, height: 18, borderRadius: 5, backgroundColor: alpha.action14, justifyContent: 'center' }}>
              <T size={10} weight="bold" c={color.action} ls={0.5}>LIVE</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <T variant="meta" c={color.textSecondary}>
              {room.listener_count > 0 ? `${room.listener_count.toLocaleString()} here now` : 'Talking now'}
            </T>
            <Participants people={room.speaker_avatars} size={20} />
            {extra > 0 && room.speaker_avatars.length ? <T variant="meta" c={color.textSecondary}>{`+${extra}`}</T> : null}
          </View>
        </View>
        <View
          style={{
            minHeight: tap.min - 4, paddingHorizontal: 18, borderRadius: radius.pill,
            backgroundColor: color.action, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <T variant="body" weight="semibold" c={color.onAction}>Join</T>
        </View>
      </Pressable>
    </View>
  );
}
