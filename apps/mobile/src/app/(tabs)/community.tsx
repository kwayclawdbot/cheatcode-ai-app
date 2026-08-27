import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { alpha, color, radius } from '../../ui/tokens';
import { useSession } from '../../lib/session';
import { communityApi, type Source } from '../../lib/community-api';
import { ModeChips } from '../../features/community/ui/Chrome';
import type { Room } from '../../features/community/types';

/**
 * V3-C0 Community home.
 *
 * DEVIATION from the artboard, deliberate: the artboard's red LIVE "Market Open
 * Desk" card is Phase 2 (08 §9 live rooms). Faking it would be a promise the
 * product cannot keep, so it is replaced by one quiet line. Everything else —
 * the two sections, the `#slug` rhythm, grade chips, preview lines, counts — is
 * the artboard's.
 *
 * Presence and member counts render in muted, not the artboard's green/cyan:
 * the palette lock reserves green for financial semantics and cyan for market
 * data, and "36 members" is neither.
 */

const MODES = [
  { id: 'day_trade', label: 'Day trade' },
  { id: 'swing', label: 'Swing' },
  { id: 'invest', label: 'Investing' },
];

function CountBadge({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <View
      style={{
        minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: strong ? color.volt : alpha.ivory14,
      }}
    >
      <T size={10} weight="bold" c={strong ? color.bg : color.text}>{value}</T>
    </View>
  );
}

function RoomRowContent({ room, onPress }: { room: Room; onPress: () => void }) {
  const setup = room.setup;
  const preview = room.preview;
  return (
    <Pressable
      testID={`room-${room.slug}`}
      accessibilityRole="button"
      accessibilityLabel={`${room.name}. ${room.description ?? ''} ${room.unread ? `${room.unread} new` : ''}`}
      accessibilityHint="Opens the room"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minHeight: 44, opacity: pressed ? 0.75 : 1 })}
    >
      <Num size={15} weight="regular" c={color.muted}>#</Num>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T size={14} weight={room.type === 'setup' ? 'bold' : 'semibold'} numberOfLines={1} style={{ flexShrink: 1 }}>
            {room.name}
          </T>
          {setup?.grade_display ? (
            <T size={11} weight="bold" c={color.violet}>{setup.grade_display}</T>
          ) : null}
        </View>
        {preview ? (
          <T size={11} c={color.muted} numberOfLines={1} style={{ marginTop: 1 }}>
            {preview.who ? <T size={11} c={preview.by_kai ? color.violetLight : color.muted}>{preview.who}: </T> : null}
            {preview.text}
          </T>
        ) : room.description ? (
          <T size={11} c={color.muted} numberOfLines={1} style={{ marginTop: 1 }}>{room.description}</T>
        ) : null}
      </View>
      {room.unread > 0 ? (
        <CountBadge value={room.unread} strong />
      ) : room.discussing_count ? (
        <T size={10} c={color.muted}>{room.discussing_count} active</T>
      ) : room.member_count ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.dim }} />
          <T size={10} c={color.muted}>{room.member_count}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function Community() {
  const router = useRouter();
  const { profile } = useSession();
  const [mode, setMode] = useState<string>(profile?.primary_mode ?? 'day_trade');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [source, setSource] = useState<Source>('fixtures');
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    const r = await communityApi.rooms(m);
    setRooms(r.rooms);
    setSource(r.source);
    setNote(r.note);
    setLoading(false);
  }, []);

  useEffect(() => { setLoading(true); load(mode); }, [mode, load]);
  useFocusEffect(useCallback(() => { load(mode); }, [mode, load]));

  useEffect(() => {
    if (profile?.primary_mode) setMode(profile.primary_mode);
  }, [profile?.primary_mode]);

  const forMode = useMemo(
    () => rooms.filter((r) => r.mode === mode || r.mode == null),
    [rooms, mode],
  );
  const setupRooms = useMemo(() => forMode.filter((r) => r.type === 'setup'), [forMode]);
  const coreRooms = useMemo(() => forMode.filter((r) => r.type !== 'setup'), [forMode]);

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
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 11, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={color.violet}
            onRefresh={async () => { setRefreshing(true); await load(mode); setRefreshing(false); }}
          />
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={28} weight="bold">Cheat Code Club</T>
          <T size={11} c={color.muted}>
            {coreRooms.length + setupRooms.length} rooms
          </T>
        </View>

        <ModeChips value={mode} onChange={setMode} options={MODES} />

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
        ) : (
          <>
            <Eyebrow>SETUP ROOMS</Eyebrow>
            {setupRooms.length === 0 ? (
              <ObjectCard r={radius.xl} style={{ padding: 16 }}>
                <T size={13} lh={19} c={color.muted}>
                  No setup has a room open right now. Kai opens one when a setup is worth discussing.
                </T>
              </ObjectCard>
            ) : (
              <RowList>
                {setupRooms.map((r, i) => (
                  <Row key={r.id} last={i === setupRooms.length - 1}>
                    <RoomRowContent room={r} onPress={() => open(r)} />
                  </Row>
                ))}
              </RowList>
            )}

            <Eyebrow>ROOMS</Eyebrow>
            {coreRooms.length === 0 ? (
              <ObjectCard r={radius.xl} style={{ padding: 16 }}>
                <T size={13} c={color.muted}>No rooms are open to you in this mode yet.</T>
              </ObjectCard>
            ) : (
              <RowList>
                {coreRooms.map((r, i) => (
                  <Row key={r.id} last={i === coreRooms.length - 1}>
                    <RoomRowContent room={r} onPress={() => open(r)} />
                  </Row>
                ))}
              </RowList>
            )}
          </>
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
