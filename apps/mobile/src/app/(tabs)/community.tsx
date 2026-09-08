/**
 * Community — the club: three chats, a row of time-boxed CIRCLES, and the feed
 * of whichever room you are reading.
 *
 * THREE CHATS (owner, 8 Sept, in their words: "Just make it traders chat,
 * investors chat and beginners chat"). It was four — Beginners plus one room
 * per desk — and migration 0045 merged Day Trade and Swing into Traders and
 * took `mode` off all three rooms. Circles sit above them because they expire
 * and the chats do not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * "ONE SWITCH, NOT TWO" WAS HALF RIGHT, AND THIS IS THE HALF THAT IS BEING
 * REVERSED (audit F13, P1)
 * ─────────────────────────────────────────────────────────────────────────────
 * The 7 Sept version of this header argued that a rail of day/swing/invest
 * pills in the feed and a day/swing/invest control in the headbar were one
 * question asked twice, and deleted the rail. That reasoning still holds. What
 * it got wrong is WHICH ONE SURVIVED.
 *
 * `ModeSegmented` writes `profiles.primary_mode` through `PUT /mode`. It is a
 * GLOBAL setting: it changes Home, it changes what the second tab is, and it
 * changes what Kai looks for. Leaving it as the room switcher meant that
 * reading the investing conversation for two minutes came back as a changed
 * research screen and different recommendations — for somebody whose intention
 * was to read. The audit's sentence is "A swing trader checking an investing
 * conversation can return to a changed research screen and different
 * recommendations without intending to change their goal", and the board's own
 * footnote is the fix: "Reading a room keeps your trading preferences."
 *
 * So the mode control is gone from this header and the ROOM is the switch:
 * `RoomTitleButton` opens `RoomSwitcherSheet`, which moves you between the
 * three chats and touches nothing else. The Beginners pill is gone with it —
 * it was the tell that this header held two controls that looked alike and did
 * different amounts of damage — and Beginners is now a named row in the sheet,
 * with a line saying what it is for.
 *
 * THE TRADING GOAL DID NOT DISAPPEAR. It is the last row of that sheet, and it
 * opens the same `ModeSheet` Home and Trade open — the one that spells out
 * every effect before the change is made. It is deliberately quiet: a
 * preference somebody changes every few weeks should not sit at the same weight
 * as the thing they do every time they open the tab.
 *
 * THE ROOM IS REMEMBERED SEPARATELY, on the device, by slug — see
 * `features/community/last-room.ts` for why that is not a column on `profiles`.
 * The mode still picks the FIRST room somebody sees and never picks another one
 * again.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE ROOM IS READABLE NOW (audit F14, P2)
 * ─────────────────────────────────────────────────────────────────────────────
 * The header held a title, a room caption, a member count, a search button, a
 * Beginners pill, three mode chips and a members button. It now holds the
 * room's name at heading size with one switcher on it, and two icon buttons.
 * An empty room offers two question starters instead of asking a newcomer to
 * name a stock — `RoomWelcome`, and nothing in it is invented.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Composer } from '../../ui/Composer';
import { KeyboardDock } from '../../ui/KeyboardDock';
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
import type { MessageReactions, ReactionKind, Room, RoomMessage, RoomSetup } from '../../features/community/types';
import { PinnedSetup } from '../../features/community/ui/PinnedSetup';
import { RoomSwitcherSheet, RoomTitleButton } from '../../features/community/ui/RoomSwitcher';
import { RoomWelcome } from '../../features/community/ui/RoomWelcome';
import { chatRank, ROOM_FOR_MODE } from '../../features/community/rooms';
import { useLastRoom } from '../../features/community/last-room';
import { ModeSheet, MODE_LABEL } from '../../features/home';
import { DEFAULT_MODE } from '../../features/nav/second-tab';
import { BeltUpSheet, PREVIEW_BELT, useBeltUp } from '../../features/social';
import type { GoalMode } from '../../lib/types';

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
 * THE ROOMS/FOLLOWING TOGGLE IS GONE, AND COMMUNITY IS THE ROOMS AGAIN
 * (owner, 7 Sept).
 *
 * The toggle offered two answers to one question and made the reader choose
 * before they had read anything. Worse, the thing it was protecting — a
 * member's published call — had no way of reaching the conversation at all: it
 * lived only in a feed you had to go and switch to. A call now arrives IN the
 * room as a message carrying its own card, which is where people already are,
 * so the second destination stopped being worth a control.
 *
 * FOLLOWING ITSELF IS NOT GONE. It never was a page; it is a graph. The follow
 * button is still on every author line and every profile, the counts are still
 * on profiles, and publishing a call still fans out to everybody who follows
 * you — following now governs who gets told, which is what it was always
 * actually for. What it no longer has is a tab of its own.
 */

export default function Community() {
  const router = useRouter();
  const params = useLocalSearchParams<{ belt?: string }>();
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

  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  /** The room switcher, and the explicit trading-goal chooser it offers. */
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  /**
   * The setup pinned to the room being read, when there is one.
   *
   * A core room usually has none — `rooms.setup_id` is normally null on all
   * three — and then nothing draws. This is the honest version of the board's
   * "Pinned setup" card: it appears when a real setup is attached and never as
   * a decorative placeholder.
   */
  const [pinnedSetup, setPinnedSetup] = useState<RoomSetup | null>(null);
  /**
   * Words put in the composer by something other than the keyboard — today,
   * one of the empty room's question starters. `draftNonce` is what lets the
   * SAME question be offered twice; without it a second tap restores nothing.
   */
  const [draft, setDraft] = useState('');
  const [draftNonce, setDraftNonce] = useState(0);
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

  /**
   * The three chats, in the order the owner said them: Traders, Investors,
   * Beginners. `chatRank` is the same order the API's directory uses, and
   * anything this build has never heard of sorts last rather than vanishing.
   *
   * BEGINNERS NO LONGER HAS TO BE HOISTED TO THE TOP. It used to be sorted
   * first here, because a mode-less room fell to the end of a list keyed by
   * mode and got buried under the desks. There is no list keyed by mode any
   * more: the three rooms are three named rows in a sheet, each with a line
   * saying what it is for, and a new member reads "Beginners Chat — simple
   * questions, plain answers" rather than having to notice a pill.
   */
  const coreRooms = useMemo(
    () => rooms.filter((r) => r.type === 'core').sort((a, b) => chatRank(a.slug) - chatRank(b.slug)),
    [rooms],
  );

  /** The chat that is not a desk. Absent on a stack without 0043/0045. */
  const beginnersRoom = useMemo(
    () => coreRooms.find((r) => r.slug === 'beginners') ?? null,
    [coreRooms],
  );

  const stage = profile?.stage ?? 'beginner';

  /**
   * The room this device was last reading. Kept by SLUG, on the device, and
   * deliberately nowhere near `profiles` — see `last-room.ts`.
   */
  const lastRoom = useLastRoom(myUserId);

  /**
   * OPENING A ROOM IS NAVIGATION AND NOTHING ELSE. No profile write, no
   * `PUT /mode`, no request at all beyond the messages for the room being
   * opened. This is the whole of audit F13's fix in one function.
   */
  const openRoom = useCallback((room: Room) => {
    setRoomId(room.id);
    lastRoom.remember(room.slug);
  }, [lastRoom]);

  /**
   * WHICH ROOM YOU LAND IN, ONCE, ON THE FIRST FRAME THAT KNOWS ENOUGH.
   *
   * In order, and the order is the argument:
   *
   *   1. THE ROOM YOU WERE LAST IN. Somebody who chose a room chose it; the app
   *      re-deciding on their behalf every time they open the tab is the
   *      behaviour F13 is about, only slower.
   *   2. BEGINNERS, if their stage (0042) is `beginner`. The funnel is built on
   *      this: their desk is one tap away, but the room where questions are
   *      welcome is the one they should meet first, not the one where people
   *      are posting entries and stops. It applies to a member who has never
   *      picked a room — never over a choice they made.
   *   3. THE CHAT THEIR DESK OPENS INTO — `ROOM_FOR_MODE`, which is the phone's
   *      copy of the map 0045 asserts and rooms-bridge.ts publishes calls with.
   *
   * AND THEN NEVER AGAIN. Changing the trading goal does NOT move the room any
   * more, which is the reverse of what this effect used to do. A member who
   * sets their goal to Invest while reading Beginners stays in Beginners: they
   * changed what Kai looks for, not what they are reading. The two facts are
   * independent and this is the line where the app stops confusing them.
   *
   * IT WAITS FOR BOTH THE PROFILE AND THE DEVICE'S MEMORY. `mode` and `stage`
   * both have a stand-in until the profile arrives, and `lastRoom` is an async
   * read; resolving before either lands puts the member in one room and then
   * moves them, which looks exactly like the app changing the room by itself.
   */
  const landedRef = useRef(false);
  useEffect(() => {
    if (landedRef.current) return;
    if (!coreRooms.length) return;
    if (!profile) return;
    if (!lastRoom.ready) return;

    landedRef.current = true;

    const remembered = lastRoom.slug
      ? (coreRooms.find((r) => r.slug === lastRoom.slug) ?? null)
      : null;
    const forStage = stage === 'beginner' ? beginnersRoom : null;
    const forMode = coreRooms.find((r) => r.slug === ROOM_FOR_MODE[mode]) ?? null;

    const room = remembered ?? forStage ?? forMode ?? coreRooms[0];
    setRoomId(room.id);
    /*
     * THE LANDING IS REMEMBERED TOO, which is what makes "and then never again"
     * literally true. Without this line a member who never opens the switcher
     * would be re-landed by rules 2 and 3 on every launch — so changing their
     * trading goal would still move their room, one app-open later. That is the
     * same bug F13 describes with a delay on it.
     */
    lastRoom.remember(room.slug);
  }, [coreRooms, mode, stage, beginnersRoom, profile, lastRoom.ready, lastRoom.slug, lastRoom.remember]);

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

  /**
   * Resolve the room's pinned setup, the same way the room screen does: the
   * directory carries `setup_id`, the object itself lives on `/setups/:id`.
   * No setup id, no request and no card.
   */
  useEffect(() => {
    if (!selected?.setup_id) { setPinnedSetup(null); return; }
    if (selected.setup) { setPinnedSetup(selected.setup); return; }
    let alive = true;
    setPinnedSetup(null);
    communityApi.roomSetup(selected.setup_id).then((s) => { if (alive) setPinnedSetup(s); }).catch(() => {});
    return () => { alive = false; };
  }, [selected?.setup_id, selected?.setup]);

  /** Presence: only ever the numbers the server actually sent. */
  const online = coreRooms.reduce((s, r) => s + (r.discussing_count ?? 0), 0);
  const members = coreRooms.reduce((s, r) => s + (r.member_count ?? 0), 0);
  const presence = online > 0
    ? `${online.toLocaleString()} online`
    : members > 0 ? `${members.toLocaleString()} members` : 'the club';

  /**
   * A REAL PIN, OR NOTHING (owner, 7 Sept).
   *
   * This used to fall back to a sentence built out of the circle symbols —
   * "META, NVDA and AMD are driving today's discussion." — whenever the room
   * had no pin. It read as Kai having looked at the conversation. It had not:
   * it never opened a single message, it was a template with the top three
   * circles dropped into it, and because circles are almost always open the
   * fallback was almost always what you saw. A bar that appears every time and
   * says something plausible every time is the most expensive kind of wrong,
   * because it teaches people to believe the next thing it says.
   *
   * What is left is the pin a MODERATOR actually pinned, which is a real
   * object, written by a person, that a room may or may not have. So the bar is
   * no longer permanent: no pin, no bar.
   *
   * The replacement for synthesis is not a bar at all — it is `summarize`,
   * which reads the room's real recent messages and answers in the room. That
   * lives on the composer, and is another lane's work.
   */
  const kaiPinned = selected?.pinned.find((p) => p.kind === 'kai')?.text ?? null;

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
          {/* The club is still the club; it is an eyebrow rather than the
              heading, because the thing a reader needs to find on this screen
              is which ROOM they are in (F14). */}
          <T size={10} weight="semibold" ls={0.7} c={color.dim} numberOfLines={1}>CHEAT CODE CLUB</T>
          {/*
            THE ROOM'S NAME IS THE HEADING, AND IT IS THE SWITCH.
            One control where there used to be five: a Beginners pill, three
            mode chips, and a caption that named the room without letting you
            change it. Pressing this opens the three chats; it writes nothing.
          */}
          {selected ? (
            <RoomTitleButton
              name={selected.name}
              onPress={() => setSwitcherOpen(true)}
              testID="club-room-name"
            />
          ) : (
            <T size={20} weight="bold" numberOfLines={1}>Community</T>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T size={10.5} c={color.dim} testID="club-presence">{presence}</T>
            {/*
              "REFRESHING EVERY 5S" IS GONE. The mechanism is untouched — the
              poll still runs and `useFreshness` still reports it — but the
              label was the app narrating its own plumbing. Nobody reading a
              room needs to be told the interval, and it sat in the header of
              every room all day saying the same six words.

              LIVE SURVIVES, because that one is not plumbing: it is the
              difference between a conversation arriving as it is typed and a
              conversation arriving up to five seconds late, and that changes
              whether you wait before replying. It appears only when a realtime
              channel really is open, which is what made the polling half say
              nothing worth the space.
            */}
            {freshness === 'realtime' ? (
              <>
                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color.dim }} />
                <T size={10.5} c={color.volt} testID="club-freshness">
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
          THE MODE CONTROL AND THE BEGINNERS PILL WERE BOTH HERE, AND BOTH ARE
          GONE (audit F13).

          `ModeSegmented` wrote `PUT /mode` — the member's GLOBAL mode, which
          follows them onto Home and the alert boards — so it changed the room
          AND everything else, while the Beginners pill beside it changed only
          the room. Two controls that looked alike, one of which quietly
          rewrote a preference. Both are replaced by the room title above,
          which opens the switcher; the trading goal lives in the last row of
          that sheet, where changing it is a deliberate act with its effects
          spelled out.
        */}
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

      {/* THE THREE SOCIAL ACTIONS. No feed switch above them any more: this
          screen is the rooms, and a call published from here lands in one of
          them. "Your calls" is the door the old Following feed's empty state
          used to be — the only route to what you published yourself — and it
          could not leave with the feed. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 9 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/*
            PUBLISH A CALL MOVED INTO THE COMPOSER'S PLUS.

            It was the loudest thing on this screen — the only volt-filled
            control above the rooms — and it asked for the rarest action on it.
            Publishing now lives in the + beside the message box, next to Add a
            picture and Post an idea, which is where somebody already is when
            they have something to say. That path exists on this screen and in
            every room, so nothing is reachable only from a place that no longer
            has a button.
          */}
          {/* Quiet outline, not volt: volt is the action being offered, and
              reading your own record is not the one this screen is asking
              for. Absent until the session has an id, because
              `/contributor/` with nothing after it is a broken screen. */}
          {myUserId ? (
            <Pressable
              testID="community-my-calls"
              accessibilityRole="button"
              accessibilityLabel="Your calls"
              accessibilityHint="Everything you have published, on your own profile."
              onPress={() => router.push(`/contributor/${myUserId}` as never)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
              <T size={11.5} weight="semibold" c={color.muted}>Your calls</T>
            </Pressable>
          ) : null}
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
              setRefreshing(false);
            }}
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

            {/* The room rail was here. It is gone — see the header of this
                file. The room's name at the top of the screen is both the
                label and the switch. */}

            {/*
              THE PINNED SETUP, AT THE TOP OF THE FEED (board, left screen).

              `PinnedSetup` has existed and been good since the setup rooms
              shipped, and it was rendered in exactly one place — the room
              screen. This is the second of its two new call sites; the third is
              the thread. It draws only when the room really has a setup
              attached (`rooms.setup_id`), which a core room usually does not,
              and nothing stands in for it when it does not.
            */}
            {pinnedSetup ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                <PinnedSetup
                  setup={pinnedSetup}
                  watching={selected?.member_count ?? null}
                  testID="club-pinned-setup"
                />
              </View>
            ) : null}

            <View style={{ paddingHorizontal: 16, gap: 14, paddingTop: 12 }}>
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
              )) : selected ? (
                /*
                 * AN EMPTY ROOM OFFERS A QUESTION, NOT AN INSTRUCTION (F14).
                 *
                 * What was here asked the reader to "say what you are watching
                 * and why", which is the hardest possible first message and was
                 * being asked of the people least able to write it. Nothing
                 * about the honesty changed: no members, no activity, no sample
                 * conversation — four accounts have ever existed on this
                 * database and there is still nothing to show.
                 */
                <RoomWelcome
                  testID="club-empty"
                  roomName={selected.name}
                  description={selected.description}
                  onStarter={(q) => { setDraft(q); setDraftNonce((n) => n + 1); }}
                />
              ) : (
                <View testID="club-empty" style={{ borderLeftWidth: 2, borderLeftColor: alpha.ivory12, paddingLeft: 12, paddingVertical: 6 }}>
                  <T size={13.5} weight="semibold">No rooms yet.</T>
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

            {/*
              UNREACHABLE IS NOT EMPTY, AND IT IS NOT EXAMPLE DATA EITHER.
              This screen used to fall back to `fixtureRooms` whenever the
              service failed, so a dead connection produced a club full of
              invented rooms that looked exactly like the real one.
            */}
            {source === 'unreachable' ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 10 }} testID="community-unreachable">
                <T size={15} weight="bold">We couldn't load the club</T>
                <T size={12} lh={18} c={color.muted}>
                  Nothing was reached, so nothing is shown. The rooms below would have been made up,
                  and an invented club is worse than an empty screen.
                </T>
                <Pressable
                  testID="community-retry"
                  accessibilityRole="button"
                  accessibilityLabel="Try loading the club again"
                  onPress={() => { void load(); }}
                  style={({ pressed }) => ({
                    alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center',
                    paddingHorizontal: 16, borderRadius: radius.pill,
                    borderWidth: 1, borderColor: alpha.volt55, backgroundColor: alpha.volt10,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <T size={12} weight="semibold" c={color.volt}>Try again</T>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* The composer posts INTO A ROOM, and this screen is always a room now,
          so it is always drawn. The dock keeps it above the keyboard rather than
          under it, which is where it used to land. */}
      <KeyboardDock floor={8} safeArea={false} style={{ paddingHorizontal: 16, paddingTop: 4, gap: 8 }}>
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
          /* The box names the room it posts into, not the club. Somebody who
             has just switched rooms should be able to see where their message
             is going without looking back up at the header. */
          placeholder={selected ? `Message ${selected.name}… $ @Kai` : 'Message the club… $ @Kai'}
          disabled={!roomId}
          onSend={(t) => { void post(t); }}
          /* A question starter arrives here as a draft the member can edit and
             then send themselves. Nothing is posted by a tap on a suggestion. */
          draft={draft}
          draftNonce={draftNonce}
          attachments={media.attachments}
          onAttach={() => { void media.pick(); }}
          onRemoveAttachment={media.remove}
        />
      </KeyboardDock>

      {/*
        THE ROOM SWITCHER. The one control that changes what you are reading,
        and the only place on this screen the trading goal can be changed —
        through the same sheet Home and Trade use, which names every effect
        before it makes the change.

        The goal sheet is opened AFTER this one closes rather than on top of it.
        Two stacked modals is a stack somebody has to unwind twice, and on
        Android the back gesture picks the wrong one.
      */}
      <RoomSwitcherSheet
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        rooms={coreRooms}
        selectedId={roomId}
        onPick={(r) => { openRoom(r); setSwitcherOpen(false); }}
        circles={circles}
        onOpenCircle={(c) => { setSwitcherOpen(false); openCircle(c); }}
        onSeeCircles={() => setSwitcherOpen(false)}
        goalLabel={MODE_LABEL[mode]}
        onChangeGoal={() => { setSwitcherOpen(false); setGoalOpen(true); }}
      />

      {/*
        CHANGING THE TRADING GOAL IS STILL POSSIBLE AND IS NOW DELIBERATE.
        `ModeSheet` writes `PUT /mode` exactly as it always did; what changed is
        that nothing on this screen does it by accident. No `onChanged` handler:
        the room does not move when the goal moves, which is the whole of F13.
      */}
      <ModeSheet visible={goalOpen} onClose={() => setGoalOpen(false)} mode={mode} />

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
