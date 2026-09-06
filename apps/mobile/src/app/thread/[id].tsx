/**
 * ONE POST AND ITS COMMENTS.
 *
 * THREADS ARE ONE LEVEL DEEP and this screen is what that decision looks like:
 * the post at the top with a rule under it, the comments below in the order
 * they were written, and a composer that always answers the POST. There is no
 * reply-to-a-reply affordance anywhere on it, because there is no such thing —
 * the database refuses one (migration 0033 §1), and an affordance that leads to
 * a refusal is worse than no affordance.
 *
 * A REMOVED COMMENT KEEPS ITS PLACE. Its words are gone and the gap stays,
 * because a comment that answers something no longer there reads as a
 * non-sequitur unless you can see that something was removed.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wash } from '../../ui/Wash';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { alpha, color, radius } from '../../ui/tokens';
import { communityApi } from '../../lib/community-api';
import { StackHeader } from '../../features/community/ui/Chrome';
import { MessageRow } from '../../features/community/ui/Message';
import { RoomComposer } from '../../features/community/ui/RoomComposer';
import { useAttachments } from '../../features/media/useAttachments';
import type { MessageReactions, ReactionKind, RoomMessage } from '../../features/community/types';

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const messageId = String(id ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const media = useAttachments();

  const [parent, setParent] = useState<RoomMessage | null>(null);
  const [replies, setReplies] = useState<RoomMessage[]>([]);
  const [emptyCopy, setEmptyCopy] = useState('No comments yet.');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** True when the service answered with nothing at all, rather than nothing yet. */
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(async () => {
    const r = await communityApi.replies(messageId);
    if (!r) {
      setUnreachable(true);
      setLoading(false);
      return;
    }
    setParent(r.parent);
    setReplies(r.replies);
    setEmptyCopy(r.empty_copy);
    setUnreachable(false);
    setLoading(false);
  }, [messageId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (text: string) => {
    setError(null);
    if (!parent) return;
    try {
      const posted = await communityApi.postMessage(
        parent.room_id ?? '',
        { body: text, parent_id: parent.id, attachment_ids: media.readyIds },
        (plain) => setError(plain),
      );
      media.clear();
      setReplies((prev) => (prev.some((m) => m.id === posted.id) ? prev : [...prev, posted]));
      // The post's own comment count changed; re-reading is one small request
      // and is cheaper than keeping a second copy of the number in sync.
      void load();
    } catch (e: any) {
      setError(e?.message ?? 'That comment did not send. Try again.');
    }
  };

  const react = async (target: RoomMessage, kind: ReactionKind) => {
    const before = target.reactions;
    const on = before.mine.includes(kind);
    const optimistic: MessageReactions = {
      counts: { ...before.counts, [kind]: Math.max(0, (before.counts[kind] ?? 0) + (on ? -1 : 1)) },
      mine: on ? before.mine.filter((k) => k !== kind) : [...before.mine, kind],
    };
    if (optimistic.counts[kind] === 0) delete optimistic.counts[kind];

    const write = (r: MessageReactions) => {
      if (parent && target.id === parent.id) setParent({ ...parent, reactions: r });
      else setReplies((prev) => prev.map((m) => (m.id === target.id ? { ...m, reactions: r } : m)));
    };

    write(optimistic);
    try {
      write(await communityApi.react(target.id, kind));
    } catch (e: any) {
      write(before);
      setError(e?.message ?? 'That reaction did not register.');
    }
  };

  const count = replies.filter((r) => !r.deleted).length;
  const subtitle = count === 0 ? 'No comments yet' : count === 1 ? '1 comment' : `${count} comments`;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }} testID="screen-thread">
      <Wash variant="corner" />

      <StackHeader title="Comments" subtitle={<T size={10} c={color.muted}>{subtitle}</T>} onBack={() => router.back()} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.violet} />
        </View>
      ) : unreachable || !parent ? (
        <View style={{ flex: 1, padding: 16 }}>
          <ObjectCard tone="gold" r={radius.lg} style={{ padding: 14 }} testID="thread-unreachable">
            <T size={12.5} lh={18} c={color.gold}>
              This conversation could not be loaded. Nothing was lost — go back and try again.
            </T>
          </ObjectCard>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 12 }}>
          <MessageRow
            message={parent}
            onOpenAuthor={parent.author.user_id ? () => router.push(`/contributor/${parent.author.user_id}`) : undefined}
            onReact={(k) => { void react(parent, k); }}
            hideThreadLine
          />

          {/* The rule that separates the post from what people said about it.
              A hairline, not a heading — the post is already the heading. */}
          <View style={{ height: 0.5, backgroundColor: alpha.ivory12, marginVertical: 2 }} />

          {replies.length === 0 ? (
            <T size={12.5} lh={18} c={color.muted} testID="thread-empty">{emptyCopy}</T>
          ) : (
            replies.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                onOpenAuthor={m.author.user_id ? () => router.push(`/contributor/${m.author.user_id}`) : undefined}
                onReact={(k) => { void react(m, k); }}
                hideThreadLine
              />
            ))
          )}

          {error ? (
            <ObjectCard tone="gold" r={radius.lg} style={{ padding: 12 }}>
              <T size={12} c={color.gold}>{error}</T>
            </ObjectCard>
          ) : null}
        </ScrollView>
      )}

      {parent && !unreachable ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 14) }}>
            {media.notice ? (
              <View style={{ paddingBottom: 8 }}>
                <T size={11} c={color.gold}>{media.notice}</T>
              </View>
            ) : null}
            <RoomComposer
              roomLabel="this post"
              placeholder="Add a comment…"
              onSend={send}
              // Kai and the structured composer belong to the room, not to a
              // comment. Both are one tap away on the post itself.
              onKai={() => router.back()}
              onStructured={() => router.back()}
              attachments={media.attachments}
              onAttach={() => { void media.pick(); }}
              onRemoveAttachment={media.remove}
            />
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}
