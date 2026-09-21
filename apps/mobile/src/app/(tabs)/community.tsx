/**
 * COMMUNITY — rooms and a social feed (V2 board, panel 3; owner pack 21 Sept).
 *
 *   app bar      the mark · "CheatCode Community" · "N members online" · search · find people
 *   rooms rail   the Live Rooms strip, straight from `GET /community/live-rooms`
 *   tabs         For You · Following · Trade Calls · Media, each paged by cursor
 *   feed         posts; one live-room invite when a text room really is live
 *   composer     "Post to the community…" with picture, chart and @Kai
 *
 * WHAT MOVED. This tab used to BE one room's chat, with a switcher in the
 * title. The chats are now rooms on the rail, each opening its own screen
 * (`/room/[id]`), which is where the warm group chat lives — reactions,
 * replies, call cards, the @Kai composer. Reading a room still changes nothing
 * about the member's trading goal (audit F13): opening a room is navigation.
 *
 * WHAT IS REAL. Every count on this screen is the server's: "members online"
 * is `online_total`, a ring's "N online" is that room's heartbeat count, a
 * post's numbers are its rows. Nothing is padded and a quiet room says Quiet.
 * While this tab is focused the phone says it is here (`usePresence`), every
 * 60 seconds, and only in the foreground.
 *
 * NOT HERE: a Follow button on posts (it lives on the profile, which every
 * name opens), and anything audio. A live room is a text room.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { CommunityPost, FeedTab, LiveRoom } from '@shared/community';
import { Screen } from '../../ui/Screen';
import { AppBar, IconButton, SectionTabs, T, color, alpha, layout, radius } from '../../ui/kit';
import { useSession } from '../../lib/session';
import { useTextScale } from '../../features/a11y/context';
import { useMe } from '../../features/account/useAccount';
import { communityApi, circlesApi, moderationApi } from '../../lib/community-api';
import { openKaiSheet } from '../../features/kai-sheet';
import { Avatar } from '../../features/community/ui/Chrome';
import { MessageActionsSheet, type MessageActionsTarget } from '../../features/community/ui/MessageActionsSheet';
import { LiveRoomsRail } from '../../features/community/feed/LiveRoomsRail';
import { LiveInvite } from '../../features/community/feed/LiveInvite';
import { PostCard } from '../../features/community/feed/PostCard';
import { DeletePostSheet } from '../../features/community/feed/DeletePostSheet';
import { togglePost, useFeed, type PostToggleKind } from '../../features/community/feed/useFeed';
import { useLiveRooms, usePresence } from '../../features/community/feed/usePresence';
import { AddPersonIcon, ChartBarsIcon, ImageIcon, SearchIcon } from '../../features/community/feed/icons';
import type { Circle } from '../../features/circles/types';
import { BeltUpSheet, PREVIEW_BELT, useBeltUp } from '../../features/social';

const TABS: { key: FeedTab; label: string }[] = [
  { key: 'for_you', label: 'For You' },
  { key: 'following', label: 'Following' },
  { key: 'trade_calls', label: 'Trade Calls' },
  { key: 'media', label: 'Media' },
];
/** Four equal tabs; when a quarter of the screen cannot hold "Trade Calls" on one line, it says "Calls". */
const tabsFor = (width: number, scale: number) =>
  width / 4 >= 92 * scale ? TABS : TABS.map((t) => (t.key === 'trade_calls' ? { ...t, label: 'Calls' } : t));

type Row = { kind: 'post'; post: CommunityPost } | { kind: 'invite'; room: LiveRoom };

/**
 * An app-bar action drawn 36 wide so "CheatCode Community" fits beside two of
 * them on a 390 phone; the slop makes the target the full 44×44.
 */
function BarAction({ label, onPress, children, testID }: {
  label: string; onPress: () => void; children: React.ReactNode; testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ left: 4, right: 4 }}
      style={({ pressed }) => ({ width: 36, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      {children}
    </Pressable>
  );
}

/** Where the invite sits: after the second post, so it never pushes the first one down. */
const INVITE_AFTER = 2;

export default function Community() {
  const router = useRouter();
  const params = useLocalSearchParams<{ belt?: string; tab?: string }>();
  const { profile, session } = useSession();
  const me = useMe();
  const isStaff = me.data?.staff?.is_staff === true;
  const myUserId = session?.user?.id ?? null;

  const [tab, setTab] = useState<FeedTab>(
    TABS.some((t) => t.key === params.tab) ? (params.tab as FeedTab) : 'for_you',
  );
  const feed = useFeed(tab);
  const live = useLiveRooms();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const [actionTarget, setActionTarget] = useState<MessageActionsTarget | null>(null);
  const [deleting, setDeleting] = useState<CommunityPost | null>(null);

  // "I am here" while this tab is focused; the strip refreshes on the same beat.
  usePresence(null, () => { void live.reload(); });

  useFocusEffect(useCallback(() => {
    circlesApi.list().then((c) => setCircles(c.circles)).catch(() => setCircles([]));
  }, []));

  /** The belt moment lives with the social layer. `?belt=1` forces the preview. */
  const beltUp = useBeltUp(myUserId);
  const [beltPreview, setBeltPreview] = useState<typeof PREVIEW_BELT | null>(params.belt === '1' ? PREVIEW_BELT : null);

  /**
   * "CheatCode Community" is the board's title and it fits a 390 phone at 100%.
   * On a narrower phone, or with larger text, the brand mark beside it already
   * says CheatCode, so the title keeps the word that says where you are.
   */
  const { width } = useWindowDimensions();
  const scale = useTextScale();
  const fullTitle = width >= 380 * scale;

  const rooms = live.data?.rooms ?? [];
  const online = live.data?.online_total ?? 0;

  /** The one room worth an invite: live, with the most people in it. */
  const inviteRoom = useMemo(
    () => [...rooms].filter((r) => r.live).sort((a, b) => b.listener_count - a.listener_count)[0] ?? null,
    [rooms],
  );

  const rows: Row[] = useMemo(() => {
    const out: Row[] = feed.posts.map((post) => ({ kind: 'post', post }));
    if (tab === 'for_you' && inviteRoom && out.length) {
      out.splice(Math.min(INVITE_AFTER, out.length), 0, { kind: 'invite', room: inviteRoom });
    }
    return out;
  }, [feed.posts, tab, inviteRoom]);

  const openRoom = (r: { route?: string; id: string }) => router.push((r.route ?? `/room/${r.id}`) as never);
  const openPost = (p: CommunityPost) => router.push(`/community/post/${encodeURIComponent(p.id)}` as never);

  const onToggle = async (p: CommunityPost, kind: PostToggleKind) => {
    setNotices((n) => { const next = { ...n }; delete next[p.id]; return next; });
    const refused = await togglePost(p, kind, feed.patchPost);
    if (refused) setNotices((n) => ({ ...n, [p.id]: refused }));
  };

  const onMore = (p: CommunityPost) => {
    if (p.mine) { setDeleting(p); return; }
    setActionTarget({
      messageId: p.id, roomId: p.room.id, authorUserId: p.author?.user_id ?? null,
      authorName: p.author?.display_name ?? 'Member', excerpt: p.body ?? '', mine: false,
    });
  };

  const compose = (q = '') => router.push(`/community/compose${q}` as never);

  const header = (
    <View>
      {rooms.length ? (
        <LiveRoomsRail
          rooms={rooms}
          circles={circles}
          onOpenRoom={openRoom}
          onOpenCircle={(c) => router.push(`/circle/${encodeURIComponent(c.id)}` as never)}
        />
      ) : live.source === 'unreachable' ? (
        <T variant="meta" c={color.textSecondary} style={{ paddingHorizontal: layout.gutter, paddingVertical: 12 }}>
          The rooms did not load. Pull down to try again.
        </T>
      ) : (
        <View style={{ height: 100, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.textSecondary} />
        </View>
      )}
      <SectionTabs tabs={tabsFor(width, scale)} value={tab} onChange={setTab} testID="feed-tabs" style={{ paddingHorizontal: 4 }} />
      {feed.source === 'fixtures' ? (
        <T variant="meta" c={color.textSecondary} style={{ paddingHorizontal: layout.gutter, paddingTop: 8 }}>Example posts</T>
      ) : null}
    </View>
  );

  const empty = !feed.loaded ? (
    <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={color.textSecondary} /></View>
  ) : feed.source === 'unreachable' ? (
    <View testID="community-unreachable" style={{ padding: layout.gutter, gap: 8 }}>
      <T variant="cardTitle">We couldn't load the feed</T>
      <T variant="body" c={color.textSecondary}>Nothing was reached, so nothing is shown. {feed.error ?? ''}</T>
      <Pressable testID="community-retry" accessibilityRole="button" onPress={() => { void feed.refresh(); void live.reload(); }} style={{ minHeight: 44, justifyContent: 'center' }}>
        <T variant="body" weight="semibold" c={color.action}>Try again</T>
      </Pressable>
    </View>
  ) : (
    <View testID="community-empty" style={{ padding: layout.gutter, gap: 6 }}>
      <T variant="body" c={color.textSecondary}>{feed.empty ?? 'Nothing here yet.'}</T>
    </View>
  );

  return (
    <Screen variant="corner" layout="tab" testID="screen-community">
      <AppBar
        title={fullTitle ? 'CheatCode Community' : 'Community'}
        status={{ text: online > 0 ? `${online.toLocaleString()} ${online === 1 ? 'member' : 'members'} online` : 'The club', live: online > 0 }}
        actions={(
          <View style={{ flexDirection: 'row', marginRight: -8 }}>
            <BarAction testID="club-search" label="Search" onPress={() => router.push('/symbol/search')}>
              <SearchIcon />
            </BarAction>
            <BarAction testID="club-find-people" label="Find people to follow" onPress={() => router.push('/leaderboard' as never)}>
              <AddPersonIcon />
            </BarAction>
          </View>
        )}
      />

      <FlatList
        testID="community-feed-list"
        data={rows}
        keyExtractor={(r) => (r.kind === 'post' ? r.post.id : `invite-${r.room.id}`)}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item }) =>
          item.kind === 'invite' ? (
            <LiveInvite room={item.room} onJoin={() => openRoom(item.room)} />
          ) : (
            <PostCard
              post={item.post}
              onOpen={() => openPost(item.post)}
              onReply={() => router.push(`/community/post/${encodeURIComponent(item.post.id)}?reply=1` as never)}
              onToggle={(k) => { void onToggle(item.post, k); }}
              onMore={() => onMore(item.post)}
              notice={notices[item.post.id] ?? null}
            />
          )}
        onEndReached={() => { void feed.loadMore(); }}
        onEndReachedThreshold={0.6}
        ListFooterComponent={feed.loadingMore ? (
          <View style={{ paddingVertical: 20 }}><ActivityIndicator color={color.textSecondary} /></View>
        ) : <View style={{ height: 12 }} />}
        refreshControl={(
          <RefreshControl
            refreshing={feed.refreshing}
            tintColor={color.textSecondary}
            onRefresh={() => { void feed.refresh(); void live.reload(); }}
          />
        )}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      />

      {/* THE COMPOSER BAR. It is a door, not a text box: posting is a screen of
          its own (pictures, a chart, a call), and a half-typed post should not
          live under the thumb of somebody scrolling. */}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: layout.gutter - 6,
          paddingVertical: 8, borderTopWidth: 1, borderTopColor: alpha.divider, backgroundColor: alpha.dock,
        }}
      >
        <Avatar initial={(profile?.display_name ?? 'Y').charAt(0).toUpperCase()} size={34} />
        <Pressable
          testID="community-compose"
          accessibilityRole="button"
          accessibilityLabel="Post to the community"
          onPress={() => compose()}
          style={{
            flex: 1, minHeight: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: alpha.border,
            backgroundColor: color.surface, justifyContent: 'center', paddingHorizontal: 12,
          }}
        >
          <T variant="body" size={14} c={color.textSecondary} numberOfLines={1}>Post to the community…</T>
        </Pressable>
        <IconButton testID="community-compose-image" icon={<ImageIcon />} accessibilityLabel="Post a picture" onPress={() => compose('?attach=image')} style={{ width: 36 }} />
        <IconButton testID="community-compose-chart" icon={<ChartBarsIcon />} accessibilityLabel="Post a chart" onPress={() => compose('?attach=chart')} style={{ width: 36 }} />
        <Pressable
          testID="community-compose-kai"
          accessibilityRole="button"
          accessibilityLabel="Ask Kai to help with a post"
          onPress={() => openKaiSheet({ context: { kind: 'home', label: 'Kai · help with a post' } })}
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}
        >
          <T variant="body" size={14} weight="semibold" c={color.kaiInk}>@Kai</T>
        </Pressable>
      </View>

      <DeletePostSheet
        post={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => { feed.removePost(id); setDeleting(null); }}
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
        onRemove={async (t, reason) => {
          const plain = await moderationApi.removeMessage(t.messageId, reason);
          feed.removePost(t.messageId);
          return plain;
        }}
        onMute={async (t, reason) => moderationApi.muteMember(t.roomId, t.authorUserId ?? '', reason)}
        onKeep={async (t, reason) => moderationApi.keepMessage(t.messageId, reason)}
      />

      <BeltUpSheet
        visible={!!beltPreview || !!beltUp.block}
        belt={(beltPreview ?? beltUp.block)?.key ?? 'white'}
        label={(beltPreview ?? beltUp.block)?.label}
        onClose={() => { setBeltPreview(null); beltUp.dismiss(); }}
        onSeeBoard={() => { setBeltPreview(null); beltUp.dismiss(); router.push('/leaderboard' as never); }}
      />
    </Screen>
  );
}

