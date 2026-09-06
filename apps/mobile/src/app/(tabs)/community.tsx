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
import { communityApi, circlesApi, moderationApi, type Source } from '../../lib/community-api';
import { subscribeRoom, transportLabel, type RealtimeMode } from '../../lib/realtime';
import { useMe } from '../../features/account/useAccount';
import { ClubMessage } from '../../features/community/ui/ClubFeed';
import { MessageActionsSheet, type MessageActionsTarget } from '../../features/community/ui/MessageActionsSheet';
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
  const { profile, session } = useSession();

  /**
   * WHO IS STAFF. `/me.staff` is re-derived from `staff_members` on every call,
   * so a revoked role is gone from the next screen this person opens. It
   * decides what is DRAWN — the "+" on the circles row, the moderator actions
   * on a post — and it controls nothing: every one of those actions is a route
   * that asks the database again on its own request.
   */
  const me = useMe();
  const isStaff = me.data?.staff?.is_staff === true;
  const myUserId = session?.user?.id ?? null;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [createHint, setCreateHint] = useState<string | null>(null);
  const [source, setSource] = useState<Source>('fixtures');
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [localReactions, setLocalReactions] = useState<Record<string, string[]>>({});
  const [reactionsAreLocal, setReactionsAreLocal] = useState(false);

  /** How this feed is being kept fresh, in its own words. Never claims live. */
  const [freshness, setFreshness] = useState<RealtimeMode>('off');
  /** The API's own sentence about the last post, when it said more than "Posted." */
  const [postNotice, setPostNotice] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageActionsTarget | null>(null);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([communityApi.rooms(), circlesApi.list()]);
    setRooms(r.rooms);
    setSource(r.source);
    setNote(r.note);
    setCircles(c.circles);
    setCreateHint(c.create_hint);
    // The circles payload already answers the staff question; only ask
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
    let channel: { unsubscribe: () => void } | null = null;

    /**
     * KEEPING THE ROOM FRESH.
     *
     * `subscribeRoom` tries Supabase Realtime and falls through to a 5-second
     * poll the moment the channel does not reach SUBSCRIBED. Today it always
     * falls through — `messages` is not in the `supabase_realtime` publication
     * and migration 0031 deliberately did not put it there — so what actually
     * runs is the poll, and the header says "Refreshing every 5s" rather than
     * "Live". A room label that claims live while it polls is the small lie
     * that makes people stop trusting the big numbers.
     *
     * The poll is cheap by construction: `after_seq` is a cursor, so a quiet
     * room costs one request that returns an empty array.
     */
    const pull = async (afterSeq: number) => {
      const r = await communityApi.messages(roomId, afterSeq, 30).catch(() => null);
      if (!alive || !r) return;
      if (afterSeq === 0) { setMessages(r.messages); return; }
      if (!r.messages.length) return;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const added = r.messages.filter((m) => !seen.has(m.id));
        return added.length ? [...prev, ...added] : prev;
      });
    };

    (async () => {
      // Reading a room requires membership. Joining a core room is idempotent
      // and is what opening it has always meant.
      const room = rooms.find((r) => r.id === roomId);
      if (room && room.type === 'core' && !room.joined) await communityApi.join(roomId).catch(() => false);
      await pull(0);
      if (!alive) return;

      channel = subscribeRoom(
        roomId,
        () => {
          // Ask only for what is past the newest thing on screen.
          setMessages((prev) => {
            const top = prev.length ? Math.max(...prev.map((m) => m.seq)) : 0;
            void pull(top);
            return prev;
          });
        },
        (m) => { if (alive) setFreshness(m); },
      );
    })();

    return () => {
      alive = false;
      channel?.unsubscribe();
      setFreshness('off');
    };
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
    setPostNotice(null);
    try {
      const m = await communityApi.postMessage(
        roomId,
        { body: text, kind: 'text' },
        // The server's words, shown verbatim. Today this is the advice nudge:
        // a post that reads as telling somebody what to do with their money
        // goes up, gets flagged for a moderator, and the writer is told what
        // the room is for. The app never composes its own version of that.
        (plain) => setPostNotice(plain),
      );
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch (e) {
      // Nothing is faked. The refusal is the server's sentence.
      setPostNotice(e instanceof Error ? e.message : 'That did not post. Nothing was sent.');
    }
  };

  /* --------------------------------------------------------------- */
  /* Moderation. Drawn from /me.staff, enforced by the server.        */
  /* --------------------------------------------------------------- */

  const openActions = (m: RoomMessage) => {
    if (!roomId) return;
    setActionTarget({
      messageId: m.id,
      roomId,
      authorUserId: m.author.user_id === 'me' ? myUserId : m.author.user_id,
      authorName: m.author.display_name ?? 'Member',
      excerpt: m.body ?? '',
      mine: !!myUserId && m.author.user_id === myUserId,
    });
  };

  /** Every one of these re-loads the thread, so the screen shows what is true. */
  const afterModeration = async (plain: string): Promise<string> => {
    const r = await communityApi.messages(roomId!, 0, 30).catch(() => null);
    if (r) setMessages(r.messages);
    return plain;
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T size={10.5} c={color.dim} testID="club-presence">{presence}</T>
            {/* What is actually keeping this feed fresh, in its own words. It
                says "Refreshing every 5s" when it is polling, and only ever
                says Live when a realtime channel really is open. */}
            {transportLabel(freshness) ? (
              <>
                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color.dim }} />
                <T size={10.5} c={freshness === 'realtime' ? color.volt : color.dim} testID="club-freshness">
                  {transportLabel(freshness)}
                </T>
              </>
            ) : null}
          </View>
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
            ) : (
              // No circles open, and this account cannot open one. Say what a
              // circle is and who opens it, rather than showing a blank strip.
              <View
                testID="circles-empty"
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: alpha.ivory07 }}
              >
                <T size={11.5} lh={16} c={color.dim}>
                  No circles are open. A circle is a room the team opens around one name, with a
                  clock on it. The three rooms below are always here.
                </T>
              </View>
            )}

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
                  onActions={() => openActions(m)}
                />
              )) : (
                // An empty room says it is empty and says what to do about it.
                // Four accounts have ever existed on this database, so there is
                // nothing here to show and nothing to invent.
                <View
                  testID="club-empty"
                  style={{ borderLeftWidth: 2, borderLeftColor: alpha.ivory12, paddingLeft: 12, paddingVertical: 6, gap: 4 }}
                >
                  <T size={13.5} weight="semibold">
                    {selected ? `Nobody has posted in ${selected.name} yet.` : 'No rooms yet.'}
                  </T>
                  {selected ? (
                    <T size={12.5} lh={18} c={color.muted}>
                      Be the first. Say what you are watching and why — the room is people showing
                      their work, not advice.
                    </T>
                  ) : null}
                </View>
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

      <View style={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4, gap: 8 }}>
        {postNotice ? (
          <Pressable
            testID="club-post-notice"
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => setPostNotice(null)}
            style={{ borderLeftWidth: 2, borderLeftColor: color.gold, paddingLeft: 11, paddingVertical: 2 }}
          >
            <T size={12} lh={17} c={color.gold}>{postNotice}</T>
          </Pressable>
        ) : null}
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
        hint={createHint}
        onCreate={createCircle}
      />

      <MessageActionsSheet
        visible={!!actionTarget}
        target={actionTarget}
        staff={isStaff}
        onClose={() => setActionTarget(null)}
        onReport={async (t, reason) => {
          await communityApi.report(t.messageId, reason);
          return 'Reported. A moderator will read it. The post stays up until they decide.';
        }}
        onRemove={async (t, reason) => afterModeration(await moderationApi.removeMessage(t.messageId, reason))}
        onMute={async (t, reason) => moderationApi.muteMember(t.roomId, t.authorUserId ?? '', reason)}
        onKeep={async (t, reason) => afterModeration(await moderationApi.keepMessage(t.messageId, reason))}
      />
    </Screen>
  );
}
