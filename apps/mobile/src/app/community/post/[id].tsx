/**
 * A POST AND ITS REPLIES — `GET /community/posts/:id`, oldest reply first,
 * like a conversation, with "Show more replies" when the server has another
 * page. Threads are one level deep (the database refuses deeper), so a reply
 * here always answers the post at the top.
 *
 * The head post is the same PostCard the feed draws, so its call, chart and
 * result card look identical in both places. Replies are lighter: a smaller
 * face, the words, and a like — the conversation, not a second feed.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { CommunityPost } from '@shared/community';
import { T, color, alpha, layout } from '../../../ui/kit';
import { KeyboardDock } from '../../../ui/KeyboardDock';
import { AttachmentTray } from '../../../ui/AttachmentTray';
import { api } from '../../../lib/api';
import { env } from '../../../lib/env';
import { useAttachments } from '../../../features/media/useAttachments';
import { Avatar } from '../../../features/community/ui/Chrome';
import { MediaStrip } from '../../../features/community/ui/Social';
import { MemberName } from '../../../features/social/MemberName';
import { FeedText, PostCard } from '../../../features/community/feed/PostCard';
import { FeedStackHeader, ReplyBar } from '../../../features/community/feed/Chrome';
import { DeletePostSheet } from '../../../features/community/feed/DeletePostSheet';
import { HeartIcon } from '../../../features/community/feed/icons';
import { togglePost, type PostToggleKind } from '../../../features/community/feed/useFeed';
import { fixtureThread } from '../../../features/community/feed/fixtures';
import type { MessageMedia } from '@cheatcode/shared';

function Reply({ reply, onLike, onMore }: { reply: CommunityPost; onLike: () => void; onMore?: () => void }) {
  const a = reply.author;
  const images = reply.media.filter((m) => m.type === 'image') as unknown as MessageMedia[];
  return (
    <View testID={`reply-${reply.id}`} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: layout.gutter, paddingVertical: 8 }}>
      <Avatar initial={a?.initial ?? '·'} url={a?.avatar_url ?? null} size={32} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        {a ? (
          <MemberName
            name={a.display_name} userId={a.user_id} belt={a.belt} handle={a.handle} showHandle size={14} handleSize={12}
            suffix={<T variant="meta" c={color.textSecondary}>{reply.time_label}</T>}
          />
        ) : <T variant="meta" c={color.textSecondary}>Former member</T>}
        {reply.body ? (
          <Pressable disabled={!onMore} onLongPress={onMore} accessibilityHint={onMore ? 'Long-press for options' : undefined}>
            <FeedText text={reply.body} />
          </Pressable>
        ) : null}
        {images.length ? <MediaStrip media={images} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reply.liked ? 'Unlike' : 'Like'}
          accessibilityState={{ selected: reply.liked }}
          onPress={onLike}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, alignSelf: 'flex-start', paddingRight: 8, marginTop: -2 }}
          hitSlop={{ top: 6, bottom: 6 }}
        >
          <HeartIcon size={17} c={reply.liked ? color.action : color.textSecondary} fill={reply.liked} />
          {reply.like_count > 0 ? <T variant="meta" c={reply.liked ? color.action : color.textSecondary}>{reply.like_count}</T> : null}
        </Pressable>
      </View>
    </View>
  );
}

export default function PostThread() {
  const { id, reply } = useLocalSearchParams<{ id: string; reply?: string }>();
  const postId = String(id ?? '');
  const router = useRouter();
  const scroller = useRef<ScrollView | null>(null);
  const media = useAttachments();

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [replies, setReplies] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading');
  const [said, setSaid] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<CommunityPost | null>(null);

  const load = useCallback(async () => {
    if (env.FIXTURES) {
      const f = fixtureThread(postId);
      if (!f) { setState('gone'); return; }
      setPost(f.post); setReplies(f.replies); setCursor(null); setState('ready');
      return;
    }
    try {
      const r = await api.communityPost(postId);
      setPost(r.post); setReplies(r.replies); setCursor(r.next_cursor); setState('ready');
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'This post did not load.');
      setState('gone');
    }
  }, [postId]);

  useEffect(() => { void load(); }, [load]);

  const patch = useCallback((pid: string, fn: (p: CommunityPost) => CommunityPost) => {
    setPost((p) => (p && p.id === pid ? fn(p) : p));
    setReplies((rs) => rs.map((r) => (r.id === pid ? fn(r) : r)));
  }, []);

  const toggle = async (p: CommunityPost, kind: PostToggleKind) => {
    const refused = await togglePost(p, kind, patch);
    if (refused) setSaid(refused);
  };

  const more = async () => {
    if (!cursor) return;
    const r = await api.communityReplies(postId, cursor).catch(() => null);
    if (!r) return;
    setReplies((rs) => {
      const seen = new Set(rs.map((x) => x.id));
      return [...rs, ...r.replies.filter((x) => !seen.has(x.id))];
    });
    setCursor(r.next_cursor);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body && !media.readyIds.length) return;
    setBusy(true); setSaid(null);
    try {
      if (!env.FIXTURES) {
        const r = await api.replyToCommunityPost(postId, { body, attachment_ids: media.readyIds });
        setReplies((rs) => [...rs, r.post]);
        setPost((p) => (p ? { ...p, reply_count: p.reply_count + 1 } : p));
        if (r.plain && r.plain !== 'Posted.') setSaid(r.plain);
      }
      setDraft('');
      media.clear();
      requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'That reply did not send. Nothing was posted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }} testID="screen-post">
      <FeedStackHeader
        title="Post"
        subtitle={post ? `${post.reply_count} ${post.reply_count === 1 ? 'reply' : 'replies'}` : null}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/community' as never))}
      />
      {state === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={color.textSecondary} /></View>
      ) : state === 'gone' || !post ? (
        <View style={{ padding: layout.gutter, gap: 8 }} testID="post-gone">
          <T variant="cardTitle">This post is not available</T>
          <T variant="body" c={color.textSecondary}>{said ?? 'It may have been deleted.'}</T>
        </View>
      ) : (
        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
          <PostCard
            post={post}
            detail
            onToggle={(k) => { void toggle(post, k); }}
            onMore={post.mine ? () => setDeleting(post) : undefined}
            testID={`post-${post.id}`}
          />
          <View style={{ paddingTop: 4 }}>
            {replies.length ? replies.map((r) => (
              <Reply
                key={r.id}
                reply={r}
                onLike={() => { void toggle(r, 'like'); }}
                onMore={r.mine ? () => setDeleting(r) : undefined}
              />
            )) : (
              <T variant="body" c={color.textSecondary} style={{ padding: layout.gutter }}>No replies yet. Be the first.</T>
            )}
            {cursor ? (
              <Pressable accessibilityRole="button" onPress={() => { void more(); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: layout.gutter }}>
                <T variant="body" weight="semibold" c={color.action}>Show more replies</T>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      )}

      {post ? (
        <KeyboardDock floor={10} style={{ paddingHorizontal: layout.gutter - 8, paddingTop: 8, gap: 6, borderTopWidth: 1, borderTopColor: alpha.divider }}>
          {said && state === 'ready' ? <T variant="meta" c={color.textSecondary}>{said}</T> : null}
          {media.notice ? <T variant="meta" c={color.textSecondary}>{media.notice}</T> : null}
          <AttachmentTray attachments={media.attachments} onRemove={media.remove} />
          <ReplyBar
            value={draft}
            onChange={setDraft}
            onSend={() => { void send(); }}
            onAttach={() => { void media.pick(); }}
            busy={busy}
            autoFocus={reply === '1'}
            placeholder={post.author ? `Reply to ${post.author.display_name}…` : 'Post your reply…'}
          />
        </KeyboardDock>
      ) : null}

      <DeletePostSheet
        post={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(pid) => {
          setDeleting(null);
          if (pid === postId) { router.back(); return; }
          setReplies((rs) => rs.filter((r) => r.id !== pid));
          setPost((p) => (p ? { ...p, reply_count: Math.max(0, p.reply_count - 1) } : p));
        }}
      />
    </View>
  );
}
