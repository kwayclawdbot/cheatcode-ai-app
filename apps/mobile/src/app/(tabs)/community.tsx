import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { alpha, color, radius } from '../../ui/tokens';
import { useSession } from '../../lib/session';
import { communityApi, type Source } from '../../lib/community-api';
import type { Room } from '../../features/community/types';

/**
 * V3-C0 Community home.
 *
 * OWNER DECISION 2026-08-26: Community is THREE rooms — Day Trade, Swing,
 * Investing — and every member sees all three. What that removed:
 *   · the mode chip row, because there is nothing left to filter;
 *   · the SETUP ROOMS section, which is not surfaced this release.
 * The member's primary mode is still worth saying out loud, so the matching row
 * carries a quiet "your mode" label. It is a signpost, not a filter — the other
 * two rows are just as reachable.
 *
 * DEVIATION from the artboard, deliberate and unchanged: the artboard's red LIVE
 * "Market Open Desk" card is Phase 2 (08 §9 live rooms). Faking it would be a
 * promise the product cannot keep, so it is replaced by one quiet line.
 *
 * Presence and member counts render in muted, not the artboard's green/cyan:
 * the palette lock reserves green for financial semantics and cyan for market
 * data, and "36 members" is neither.
 */

/** Shortest horizon first — the order the API returns and the screen re-asserts. */
const MODE_ORDER = ['day_trade', 'swing', 'invest'];
const rank = (mode: string | null) => {
  const i = MODE_ORDER.indexOf(String(mode));
  return i === -1 ? MODE_ORDER.length : i;
};

function CountBadge({ value }: { value: number }) {
  return (
    <View
      style={{
        minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center', backgroundColor: color.volt,
      }}
    >
      <T size={11} weight="bold" c={color.bg}>{value}</T>
    </View>
  );
}

/**
 * One of the three. Bigger than the old directory row on purpose — with three
 * rooms instead of nineteen, each one is a destination rather than a list item.
 */
function RoomRow({ room, yours, onPress }: { room: Room; yours: boolean; onPress: () => void }) {
  const preview = room.preview;
  const active = room.discussing_count ?? 0;
  const members = room.member_count ?? 0;
  return (
    <Pressable
      testID={`room-${room.slug}`}
      accessibilityRole="button"
      accessibilityLabel={
        `${room.name}. ${room.description ?? ''} ` +
        `${members} ${members === 1 ? 'member' : 'members'}. ` +
        `${room.unread ? `${room.unread} new.` : ''}${yours ? ' Your mode.' : ''}`
      }
      accessibilityHint="Opens the room"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'flex-start', gap: 11,
        flex: 1, minHeight: 62, paddingVertical: 12, opacity: pressed ? 0.75 : 1,
      })}
    >
      {/* The hash sits ON the room name's line, the way a channel list reads —
          not floated against the middle of a three-line block. */}
      <Num size={20} weight="regular" c={color.dim} style={{ marginTop: 1 }}>#</Num>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <T size={17} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{room.name}</T>
          {yours ? (
            <View
              style={{
                paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
                borderWidth: 0.5, borderColor: alpha.ivory25,
              }}
            >
              <T size={9} c={color.muted}>your mode</T>
            </View>
          ) : null}
        </View>

        {preview ? (
          <T size={12} c={color.muted} numberOfLines={1}>
            {preview.who ? <T size={12} c={preview.by_kai ? color.violetLight : color.muted}>{preview.who}: </T> : null}
            {preview.text}
          </T>
        ) : room.description ? (
          <T size={12} lh={17} c={color.muted} numberOfLines={2}>{room.description}</T>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.dim }} />
          <T size={10} c={color.dim}>
            {members} {members === 1 ? 'member' : 'members'}
            {active ? ` · ${active} active` : ''}
          </T>
        </View>
      </View>

      {room.unread > 0 ? (
        <View style={{ marginTop: 2 }}><CountBadge value={room.unread} /></View>
      ) : null}
    </Pressable>
  );
}

export default function Community() {
  const router = useRouter();
  const { profile } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [source, setSource] = useState<Source>('fixtures');
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  // No mode argument: the directory is the same three rooms for everyone.
  const load = useCallback(async () => {
    const r = await communityApi.rooms();
    setRooms(r.rooms);
    setSource(r.source);
    setNote(r.note);
    setLoading(false);
  }, []);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  /**
   * Core rooms only, shortest horizon first. Setup rooms are filtered here as
   * well as server-side so a cached or fixture payload cannot put one back on
   * the screen.
   */
  const coreRooms = useMemo(
    () => rooms.filter((r) => r.type === 'core').sort((a, b) => rank(a.mode) - rank(b.mode)),
    [rooms],
  );

  const open = async (room: Room) => {
    setJoining(room.id);
    try {
      if (room.type === 'core' && !room.joined) await communityApi.join(room.id);
    } catch {
      /* opening the room shows the real error — never block navigation on it */
    } finally {
      setJoining(null);
    }
    router.push(`/room/${room.id}`);
  };

  return (
    <Screen variant="corner" layout="tab" testID="screen-community">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 13, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={color.violet}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          />
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={28} weight="bold">Cheat Code Club</T>
          <T size={11} c={color.muted}>{coreRooms.length} rooms</T>
        </View>

        {/* The artboard's LIVE card is Phase 2. One honest line, not a fake. */}
        <ObjectCard r={radius.xl} style={{ paddingVertical: 12, paddingHorizontal: 15 }}>
          <T size={12} lh={18} c={color.muted}>
            Live sessions arrive in a later release. Rooms, Kai summaries and structured ideas work today.
          </T>
        </ObjectCard>

        {note ? <T size={11} c={color.gold}>{note}</T> : null}

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={color.violet} />
          </View>
        ) : coreRooms.length === 0 ? (
          <ObjectCard r={radius.xl} style={{ padding: 16 }}>
            <T size={13} c={color.muted}>No rooms yet.</T>
          </ObjectCard>
        ) : (
          <RowList>
            {coreRooms.map((r, i) => (
              <Row key={r.id} last={i === coreRooms.length - 1}>
                <RoomRow
                  room={r}
                  yours={Boolean(profile?.primary_mode) && r.mode === profile?.primary_mode}
                  onPress={() => open(r)}
                />
              </Row>
            ))}
          </RowList>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.dim }} />
          <T size={10} lh={14} c={color.dim} style={{ flex: 1 }}>
            {source === 'fixtures' ? 'Example rooms · ' : ''}Claims stay unverified until Kai checks them.
          </T>
        </View>

        {joining ? <T size={11} c={color.muted}>Joining…</T> : null}
      </ScrollView>
    </Screen>
  );
}
