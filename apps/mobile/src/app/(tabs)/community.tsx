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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Composer } from '../../ui/Composer';
import { useAttachments } from '../../features/media/useAttachments';
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
import type { MessageReactions, ReactionKind, Room, RoomMessage } from '../../features/community/types';
import { ModeSegmented } from '../../features/home';
import { DEFAULT_MODE } from '../../features/nav/second-tab';
import { Segmented } from '../../ui/Segmented';
import {
  BeltUpSheet, CommunityCallCard, PREVIEW_BELT, SharedTradeRow, useBeltUp, useFollowFeed,
} from '../../features/social';
import type { GoalMode } from '../../lib/types';

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

/**
 * The two feeds this tab carries.
 *
 * ROOMS is what the club has always been: three mode rooms, everybody in them.
 * FOLLOWING is the other half of a social layer — the people you chose, and
 * only them. They are the same tab because they answer the same question
 * ("what is the club saying") at two different widths, and splitting them into
 * separate tabs would make the narrow one look like a second-class room.
 *
 * It is a `Segmented`, the app's existing in-object view switch, rather than
 * anything new: this is a view of one screen, which is exactly what that
 * control already means everywhere else in the app.
 */
type FeedKey = 'rooms' | 'following';

const FEEDS: { key: FeedKey; label: string }[] = [
  { key: 'rooms', label: 'Rooms' },
  { key: 'following', label: 'Following' },
];

export default function Community() {
  const router = useRouter();
  const params = useLocalSearchParams<{ feed?: string; belt?: string }>();
  const { profile, session } = useSession();
  /** The one global mode, read the same way every other screen reads it. */
  const mode = (profile?.primary_mode as GoalMode) ?? DEFAULT_MODE;

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

  /** The belt moment. Read from the server; `?belt=1` forces the preview. */
  const beltUp = useBeltUp(myUserId);
  const [beltPreview, setBeltPreview] = useState<typeof PREVIEW_BELT | null>(
    params.belt === '1' ? PREVIEW_BELT : null,
  );

  /**
   * Which feed is on screen. `?feed=following` picks the Following half.
   *
   * THE PARAM IS WATCHED, NOT READ ONCE. A `useState` initializer runs the
   * first time this component mounts and never again, and this is a TAB — it
   * is already mounted long before anything links into it. So a
   * `router.replace('/community?feed=following')` from somewhere else in the
   * app changed the address bar, re-rendered this screen, and left the reader
   * looking at Rooms, which is the feed they were already on. Nothing errored
   * and nothing was missing; the app simply ignored where it had been asked to
   * go. The effect below makes the param mean what it says every time it
   * changes, while leaving the segmented control free the rest of the time.
   */
  const [feed, setFeed] = useState<FeedKey>(params.feed === 'following' ? 'following' : 'rooms');
  useEffect(() => {
    if (params.feed === 'following') setFeed('following');
    else if (params.feed === 'rooms') setFeed('rooms');
  }, [params.feed]);
  const following = useFollowFeed();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  /**
   * When a reaction did NOT land. There used to be a device-local store here
   * and a line under the post saying "saved on this device only" — honest, and
   * unnecessary now that reactions are a real table. What is left is the
   * server's own refusal, shown against the post it belongs to.
   */
  const [reactionNotice, setReactionNotice] = useState<Record<string, string>>({});
  const media = useAttachments();

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

  /**
   * OPTIMISTIC, THEN CORRECTED. The chip flips on the tap — a reaction that
   * waits for a round trip feels broken — and the server's answer is written
   * over it when it arrives. On a failure the old state goes back and the
   * server's sentence appears under the post; nothing is left looking as if it
   * counted when it did not.
   */
  const react = async (messageId: string, kind: ReactionKind) => {
    const before = messages.find((m) => m.id === messageId)?.reactions;
    if (!before) return;

    const on = before.mine.includes(kind);
    const optimistic: MessageReactions = {
      counts: { ...before.counts, [kind]: Math.max(0, (before.counts[kind] ?? 0) + (on ? -1 : 1)) },
      mine: on ? before.mine.filter((k) => k !== kind) : [...before.mine, kind],
    };
    if (optimistic.counts[kind] === 0) delete optimistic.counts[kind];

    setReactionNotice((prev) => { const next = { ...prev }; delete next[messageId]; return next; });
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: optimistic } : m)));

    try {
      const settled = await communityApi.react(messageId, kind);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: settled } : m)));
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: before } : m)));
      setReactionNotice((prev) => ({
        ...prev,
        [messageId]: e instanceof Error ? e.message : 'That did not register.',
      }));
    }
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
        { body: text, kind: 'text', attachment_ids: media.readyIds },
        // The server's words, shown verbatim. Today this is the advice nudge:
        // a post that reads as telling somebody what to do with their money
        // goes up, gets flagged for a moderator, and the writer is told what
        // the room is for. The app never composes its own version of that.
        (plain) => setPostNotice(plain),
      );
      // Cleared only once the post is accepted — clearing first would throw
      // away pictures the member would then have to pick again.
      media.clear();
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
          flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 16,
          paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: alpha.ivory07,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={16} weight="bold" numberOfLines={1}>Cheat Code Club</T>
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

        {/*
          Mode lives in the headbar now (owner, 6 Sept), between search and the
          people button. It is the same global setting the chip and the sheet
          write — `PUT /mode` — and on this screen it also opens the room that
          belongs to the mode you picked, so the control is never a switch that
          appears to do nothing. The rail below stays: it carries the unread
          counts, and tapping either keeps the other in step.
        */}
        <ModeSegmented
          mode={mode}
          testID="club-mode-segmented"
          onChanged={(m) => {
            const room = coreRooms.find((r) => r.mode === m);
            if (room) setRoomId(room.id);
          }}
        />

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

      {/* WHICH FEED, AND THE TWO SOCIAL ACTIONS.
          It sits above the scroll view rather than inside it because it is
          chrome for the screen, not content in it — scrolling away the control
          that says which feed you are reading is how people get lost. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 9 }}>
        <Segmented options={FEEDS} value={feed} onChange={setFeed} testID="community-feed" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            testID="community-publish-call"
            accessibilityRole="button"
            accessibilityLabel="Publish a call"
            accessibilityHint="Your own trade idea, with your name on it."
            onPress={() => router.push('/community/call/new' as never)}
            style={({ pressed }) => ({
              height: 30, paddingHorizontal: 13, borderRadius: radius.pill,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: alpha.volt55, backgroundColor: alpha.volt10,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <T size={11.5} weight="semibold" c={color.volt}>Publish a call</T>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            testID="community-board"
            accessibilityRole="button"
            accessibilityLabel="The board"
            accessibilityHint="Members ranked on how often their calls were right."
            onPress={() => router.push('/leaderboard' as never)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
          >
            <T size={11.5} weight="semibold" c={color.muted}>The board</T>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={color.violet}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              following.reload();
              setRefreshing(false);
            }}
          />
        }
      >
        {feed === 'following' ? (
          <FollowingFeed
            feed={following}
            myUserId={myUserId}
            onPublish={() => router.push('/community/call/new' as never)}
          />
        ) : loading ? (
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
                  message={m}
                  onTicker={(s) => router.push(`/symbol/${encodeURIComponent(s)}` as never)}
                  onReact={(k) => { void react(m.id, k); }}
                  onOpenSetup={(s) => router.push(`/trade/${encodeURIComponent(s)}?ctx=alert` as never)}
                  onOpenThread={() => router.push(`/thread/${encodeURIComponent(m.id)}` as never)}
                  // Reply goes where the comments are, with the post already
                  // quoted. One conversation, one destination.
                  onReply={() => router.push(`/thread/${encodeURIComponent(m.id)}?quote=${encodeURIComponent(m.id)}` as never)}
                  onOpenQuote={(qid) => router.push(`/thread/${encodeURIComponent(qid)}` as never)}
                  reactionNotice={reactionNotice[m.id] ?? null}
                  onActions={() => openActions(m)}
                  // Never on your own post, and never on Kai's — the component
                  // handles Kai, the screen is the only thing that knows which
                  // of these people is the person reading.
                  showFollow={!!myUserId && m.author.user_id !== myUserId && m.author.user_id !== 'me'}
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
            {/*
              The standing "Claims stay unverified until Kai checks them"
              disclaimer was removed here (owner, 6 Sept). It said the same
              thing under every feed, every time, so it had stopped being read.
              Nothing that makes a real claim is now unlabelled: each post that
              Kai has actually looked at still carries its own ClaimChip
              (Unverified / Partly verified / Verified by Kai), which is the
              per-claim statement rather than a blanket one.
            */}
            {source === 'fixtures' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 12 }}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.dim }} />
                <T size={10} lh={14} c={color.dim} style={{ flex: 1 }}>Example rooms</T>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* The composer posts INTO A ROOM, so it is not drawn over a feed that
          has no room to post into. The Following feed's own action is
          "Publish a call", which is above and is a different act. */}
      {feed === 'rooms' ? (
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
        {media.notice ? (
          <T size={11} c={color.gold} style={{ paddingBottom: 8 }}>{media.notice}</T>
        ) : null}
        <Composer
          testID="club-composer"
          placeholder="Message Cheat Code Club… $ @Kai"
          disabled={!roomId}
          onSend={(t) => { void post(t); }}
          attachments={media.attachments}
          onAttach={() => { void media.pick(); }}
          onRemoveAttachment={media.remove}
        />
      </View>
      ) : null}

      <CreateCircleSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        canCreate={canCreate}
        hint={createHint}
        onCreate={createCircle}
      />

      {/*
        MOVING UP A BELT — the one rare moment in this layer that is allowed a
        little movement, and it lives here because this is where the social
        layer lives. `?belt=1` forces it, the way `?sim=readfail` forces the
        portal's failure state: a rare screen nobody has opened is a screen
        nobody has designed.
      */}
      <BeltUpSheet
        visible={!!beltPreview || !!beltUp.block}
        belt={(beltPreview ?? beltUp.block)?.key ?? 'white'}
        label={(beltPreview ?? beltUp.block)?.label}
        onClose={() => { setBeltPreview(null); beltUp.dismiss(); }}
        onSeeBoard={() => {
          setBeltPreview(null);
          beltUp.dismiss();
          router.push('/leaderboard' as never);
        }}
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

/**
 * THE FOLLOWING FEED — calls and shared trades from the people you chose.
 *
 * TWO EMPTY STATES, AND THEY ARE NOT THE SAME SCREEN. "You follow nobody" is a
 * thing the reader can fix in one tap and the offer is to go and find people.
 * "Nobody you follow has posted" is a quiet day and there is nothing to fix —
 * the offer there is to publish something yourself. Collapsing the two into one
 * "Nothing here" would make a quiet day look like a broken feature, and a
 * broken feature look like a quiet day.
 *
 * Newest first, and the two object types keep their different weights: a call
 * is a volt card because somebody is making an argument, a shared trade is a
 * plain row because it is a record.
 *
 * YOUR OWN CALLS ARE NOT IN THIS FEED, AND THE EMPTY STATE SAYS WHERE THEY
 * ARE. Following means the people you chose; the database will not even let
 * you follow yourself (`follows_not_self`, migration 0038), so a call you just
 * published can never appear here. Before the "Your calls" offer below there
 * was no route to your own profile anywhere in the app, so somebody who
 * published a call and landed on an empty Following feed had no way to reach
 * the thing they had just written and reasonably concluded it had not saved.
 */
function FollowingFeed({
  feed, myUserId, onPublish,
}: {
  feed: ReturnType<typeof useFollowFeed>;
  /** Null before the session has loaded — the offer is simply not drawn. */
  myUserId: string | null;
  onPublish: () => void;
}) {
  const router = useRouter();

  if (feed.loading && !feed.data) {
    return (
      <View style={{ paddingVertical: 40, alignItems: 'center' }}>
        <ActivityIndicator color={color.violet} />
      </View>
    );
  }

  if (feed.error) {
    return (
      <View style={{ padding: 16 }} testID="following-error">
        <T size={13} lh={19} c={color.muted}>{feed.error}</T>
      </View>
    );
  }

  const data = feed.data;

  if (!data || !data.items.length) {
    const nobody = data?.follows_nobody ?? true;
    return (
      <View
        testID={nobody ? 'following-empty-nobody' : 'following-empty-quiet'}
        style={{ paddingHorizontal: 16, paddingVertical: 26, gap: 8 }}
      >
        <T size={14.5} weight="semibold">
          {nobody ? 'You are not following anybody yet.' : 'Nobody you follow has posted yet.'}
        </T>
        <T size={12.5} lh={18.5} c={color.muted}>
          {data?.empty_plain
            ?? (nobody
              ? 'Follow a few members and this becomes their calls and their trades, newest first. Tap a name in the rooms to see what they have published.'
              : 'A quiet day on your list. You could be the one who posts.')}
        </T>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Pressable
            testID="following-empty-action"
            accessibilityRole="button"
            accessibilityLabel={nobody ? 'Read the rooms' : 'Publish a call'}
            onPress={nobody ? () => router.push('/community' as never) : onPublish}
            style={({ pressed }) => ({
              height: 38, paddingHorizontal: 15, borderRadius: radius.pill,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: alpha.volt55, backgroundColor: alpha.volt10,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <T size={12.5} weight="semibold" c={color.volt}>
              {nobody ? 'Read the rooms' : 'Publish a call'}
            </T>
          </Pressable>
          {/* THE WAY BACK TO YOUR OWN CALLS. This feed is the people you
              chose and never you, so without this there is no door from here
              to the thing you published a minute ago. Quiet outline, not
              volt: volt is the action you are being offered, and reading your
              own record is not the one this screen is asking for. */}
          {myUserId ? (
            <Pressable
              testID="following-empty-mine"
              accessibilityRole="button"
              accessibilityLabel="Your calls"
              onPress={() => router.push(`/contributor/${myUserId}` as never)}
              style={({ pressed }) => ({
                height: 38, paddingHorizontal: 15, borderRadius: radius.pill,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 0.5, borderColor: alpha.ivory24,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <T size={12.5} weight="semibold" c={color.muted}>Your calls</T>
            </Pressable>
          ) : null}
          <Pressable
            testID="following-empty-board"
            accessibilityRole="button"
            accessibilityLabel="The board"
            onPress={() => router.push('/leaderboard' as never)}
            style={({ pressed }) => ({
              height: 38, paddingHorizontal: 15, borderRadius: radius.pill,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 0.5, borderColor: alpha.ivory24,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <T size={12.5} weight="semibold" c={color.muted}>The board</T>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 12 }} testID="following-feed">
      {data.items.map((item) => (
        item.kind === 'call'
          ? <CommunityCallCard key={`call-${item.call.id}`} call={item.call} showFollow />
          : <SharedTradeRow key={`trade-${item.trade.id}`} trade={item.trade} />
      ))}
      {feed.isFixture ? (
        <T size={10} c={color.dim} align="center">Example feed — the service is not connected here.</T>
      ) : null}
    </View>
  );
}
