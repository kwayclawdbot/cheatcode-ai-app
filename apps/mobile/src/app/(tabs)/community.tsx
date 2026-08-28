/**
 * Community — Community.html (round 4).
 *
 * The club header, a row of time-boxed CIRCLES, Kai's pinned summary, and the
 * feed of whichever mode room you have selected. The three mode rooms stay the
 * base of the club (owner decision 2026-08-27: Day Trade · Swing · Investing);
 * circles sit above them because they expire and the mode rooms do not.
 *
 * DEVIATION, deliberate: the board shows a bare feed with no room selector,
 * because the board is one screenshot. Three rooms exist, so the feed says
 * which one you are reading and lets you change it. Everything else — the
 * "N online" line, the ring clocks, `$TICKER` chips, reactions, Kai objects and
 * the "Message Cheat Code Club… $ @Kai" composer — is the board.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Composer } from '../../ui/Composer';
import { KaiOrb } from '../../ui/KaiOrb';
import { alpha, color, radius } from '../../ui/tokens';
import { useSession } from '../../lib/session';
import { communityApi, circlesApi, type Source } from '../../lib/community-api';
import { ClubMessage } from '../../features/community/ui/ClubFeed';
import { CirclesRow } from '../../features/circles/CirclesRow';
import { CreateCircleSheet } from '../../features/circles/CreateCircleSheet';
import type { Circle, CircleTtl } from '../../features/circles/types';
import type { Room, RoomMessage } from '../../features/community/types';

const MODE_ORDER = ['day_trade', 'swing', 'invest'];
const rank = (mode: string | null) => {
  const i = MODE_ORDER.indexOf(String(mode));
  return i === -1 ? MODE_ORDER.length : i;
};

const SearchIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth={2}>
    <SvgCircle cx={11} cy={11} r={7} />
    <Path d="M21 21l-4.3-4.3" />
  </Svg>
);
const MembersIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth={2}>
    <Path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <SvgCircle cx={9.5} cy={7} r={4} />
    <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
  </Svg>
);

export default function Community() {
  const router = useRouter();
  const { profile } = useSession();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [source, setSource] = useState<Source>('fixtures');
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [localReactions, setLocalReactions] = useState<Record<string, string[]>>({});
  const [reactionsAreLocal, setReactionsAreLocal] = useState(false);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([communityApi.rooms(), circlesApi.list()]);
    setRooms(r.rooms);
    setSource(r.source);
    setNote(r.note);
    setCircles(c.circles);
    // The circles payload already answers the entitlement question; only ask
    // separately when this stack's response did not carry it.
    if (typeof c.can_create === 'boolean') setCanCreate(c.can_create);
    else circlesApi.canCreate().then(setCanCreate).catch(() => setCanCreate(false));
    setLoading(false);
  }, []);

  useEffect(() => { setLoading(true); void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const coreRooms = useMemo(
    () => rooms.filter((r) => r.type === 'core').sort((a, b) => rank(a.mode) - rank(b.mode)),
    [rooms],
  );

  // The room you read first is the one matching your mode.
  useEffect(() => {
    if (roomId || !coreRooms.length) return;
    const mine = coreRooms.find((r) => r.mode === profile?.primary_mode);
    setRoomId((mine ?? coreRooms[0]).id);
  }, [coreRooms, roomId, profile?.primary_mode]);

  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    // Reading a room requires membership. Joining a core room is idempotent and
    // is what opening it has always meant.
    (async () => {
      const room = rooms.find((r) => r.id === roomId);
      if (room && room.type === 'core' && !room.joined) await communityApi.join(roomId).catch(() => false);
      const r = await communityApi.messages(roomId, 0, 30).catch(() => null);
      if (alive) setMessages(r?.messages ?? []);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, rooms.length]);

  const selected = coreRooms.find((r) => r.id === roomId) ?? null;

  /** Presence: only ever the numbers the server actually sent. */
  const online = coreRooms.reduce((s, r) => s + (r.discussing_count ?? 0), 0);
  const members = coreRooms.reduce((s, r) => s + (r.member_count ?? 0), 0);
  const presence = online > 0
    ? `${online.toLocaleString()} online`
    : members > 0 ? `${members.toLocaleString()} members` : 'the club';

  const kaiPinned = selected?.pinned.find((p) => p.kind === 'kai')?.text
    ?? (circles.length
      ? (() => {
          const syms = circles.slice(0, 3).map((c) => c.symbol);
          const list = syms.length > 1 ? `${syms.slice(0, -1).join(', ')} and ${syms[syms.length - 1]}` : syms[0];
          return `${list} ${syms.length > 1 ? 'are' : 'is'} driving today’s discussion.`;
        })()
      : null);

  const react = async (messageId: string, emoji: string) => {
    setLocalReactions((prev) => ({ ...prev, [messageId]: [...(prev[messageId] ?? []), emoji] }));
    const where = await circlesApi.react(messageId, emoji);
    if (where === 'local') setReactionsAreLocal(true);
  };

  const openCircle = (c: Circle) => router.push(`/circle/${encodeURIComponent(c.id)}` as never);

  const createCircle = async (symbol: string, ttl: CircleTtl) => {
    const c = await circlesApi.create(symbol, ttl);
    setCircles((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
    router.push(`/circle/${encodeURIComponent(c.id)}` as never);
  };

  const post = async (text: string) => {
    if (!roomId) return;
    try {
      const m = await communityApi.postMessage(roomId, { body: text, kind: 'text' });
      setMessages((prev) => [...prev, m]);
    } catch {
      /* the room screen owns the retry; the tab never fakes a posted message */
    }
  };

  return (
    <Screen variant="corner" layout="tab" testID="screen-community">
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16,
          paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: alpha.ivory07,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={16} weight="bold">Cheat Code Club</T>
          <T size={10.5} c={color.dim} testID="club-presence">{presence}</T>
        </View>
        <Pressable
          testID="club-search"
          accessibilityRole="button"
          accessibilityLabel="Search the club"
          onPress={() => router.push('/symbol/search')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <SearchIcon />
        </Pressable>
        <Pressable
          testID="club-members"
          accessibilityRole="button"
          accessibilityLabel="Members"
          onPress={() => selected && router.push(`/room/${encodeURIComponent(selected.id)}` as never)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MembersIcon />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={color.violet}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          />
        }
      >
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={color.violet} />
          </View>
        ) : (
          <>
            {circles.length || canCreate ? (
              <CirclesRow
                circles={circles}
                canCreate={canCreate}
                onOpen={openCircle}
                onCreate={() => setCreateOpen(true)}
              />
            ) : null}

            {kaiPinned ? (
              <View
                testID="kai-pinned"
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 16, marginBottom: 4,
                  paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11,
                  backgroundColor: alpha.violet08, borderLeftWidth: 2, borderLeftColor: color.violet,
                }}
              >
                <KaiOrb size={17} glow={false} />
                <T size={11.5} lh={16} c={color.muted} style={{ flex: 1 }}>
                  <T size={11.5} weight="bold" c={color.violetLight}>Kai</T>
                  {` · ${kaiPinned}`}
                </T>
              </View>
            ) : null}

            {/* Which of the three rooms this feed is. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}
              testID="room-rail"
            >
              {coreRooms.map((r) => {
                const on = r.id === roomId;
                return (
                  <Pressable
                    key={r.id}
                    testID={`room-${r.slug}`}
                    accessibilityRole="tab"
                    accessibilityLabel={r.name}
                    accessibilityState={{ selected: on }}
                    onPress={() => setRoomId(r.id)}
                    style={{
                      paddingHorizontal: 12, height: 32, borderRadius: radius.pill,
                      alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
                      backgroundColor: on ? alpha.volt14 : 'transparent',
                      borderWidth: 0.5, borderColor: on ? alpha.volt50 : alpha.ivory12,
                    }}
                  >
                    <T size={12} weight={on ? 'bold' : 'regular'} c={on ? color.volt : color.muted}>{r.name}</T>
                    {r.unread ? <Num size={10} weight="bold" c={color.dim}>{String(r.unread)}</Num> : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ paddingHorizontal: 16, gap: 14, paddingTop: 6 }}>
              {messages.length ? messages.map((m) => (
                <ClubMessage
                  key={m.id}
                  message={{
                    ...m,
                    reactions: [
                      ...m.reactions,
                      ...(localReactions[m.id] ?? []).map((e) => ({ label: e, count: 1, tone: 'neutral' as const })),
                    ],
                  }}
                  onTicker={(s) => router.push(`/symbol/${encodeURIComponent(s)}` as never)}
                  onReact={(e) => { void react(m.id, e); }}
                  onOpenSetup={(s) => router.push(`/trade/${encodeURIComponent(s)}?ctx=alert` as never)}
                  reactionsLocal={reactionsAreLocal && !!localReactions[m.id]?.length}
                />
              )) : (
                <ObjectCard r={radius.xl} style={{ padding: 16 }}>
                  <T size={13} c={color.muted}>
                    {selected ? 'Nothing has been posted here today.' : 'No rooms yet.'}
                  </T>
                </ObjectCard>
              )}
            </View>

            {note ? <T size={11} c={color.gold} style={{ paddingHorizontal: 16, paddingTop: 10 }}>{note}</T> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 12 }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.dim }} />
              <T size={10} lh={14} c={color.dim} style={{ flex: 1 }}>
                {source === 'fixtures' ? 'Example rooms · ' : ''}Claims stay unverified until Kai checks them.
              </T>
            </View>
          </>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4 }}>
        <Composer
          testID="club-composer"
          placeholder="Message Cheat Code Club… $ @Kai"
          disabled={!roomId}
          onSend={(t) => { void post(t); }}
        />
      </View>

      <CreateCircleSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        canCreate={canCreate}
        onCreate={createCircle}
      />
    </Screen>
  );
}
