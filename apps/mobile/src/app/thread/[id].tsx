/**
 * ONE POST AND ITS COMMENTS.
 *
 * THREADS ARE ONE LEVEL DEEP IN THE DATABASE and this screen is what that
 * decision looks like: every comment here has `parent_id = the post`, and the
 * database refuses anything else (migration 0033 §1). That has not changed.
 *
 * WHAT HAS CHANGED is that you can now answer a COMMENT. Answering a comment
 * still writes a comment on the POST — same `parent_id`, same one level — and
 * records WHICH comment it was answering as a quote. The screen then draws it
 * indented under that comment. So the conversation reads as a thread while the
 * table stays flat, and there is no reply-to-a-reply-to-a-reply to get lost in:
 * an answer to an indented comment is drawn beside it, not further right.
 *
 * ONE LEVEL OF INDENT IS THE WHOLE RULE. On a phone, a second level leaves
 * about twelve characters a line.
 *
 * A REMOVED COMMENT KEEPS ITS PLACE. Its words are gone and the gap stays,
 * because a comment that answers something no longer there reads as a
 * non-sequitur unless you can see that something was removed.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Wash } from '../../ui/Wash';
import { KeyboardDock } from '../../ui/KeyboardDock';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { alpha, color, radius } from '../../ui/tokens';
import { communityApi, quoteOf } from '../../lib/community-api';
import { StackHeader } from '../../features/community/ui/Chrome';
import { MessageRow } from '../../features/community/ui/Message';
import { RoomComposer } from '../../features/community/ui/RoomComposer';
import { PinnedSetup } from '../../features/community/ui/PinnedSetup';
import { AskKaiAboutSetup } from '../../features/community/ui/AskKaiAboutSetup';
import { useAttachments } from '../../features/media/useAttachments';
import type { MessageReactions, ReactionKind, RoomMessage, RoomSetup } from '../../features/community/types';

/**
 * Which comment each answer belongs under.
 *
 * A comment quoting the POST is top level. A comment quoting another COMMENT is
 * drawn under that comment — and if it quotes one that is itself indented, it
 * is walked up to that one's top-level anchor rather than nested deeper. The
 * walk is bounded: a quote chain in a thread cannot be longer than the thread,
 * but a bound that is not written down is a loop waiting for bad data.
 */
function layOut(parentId: string, replies: RoomMessage[]) {
  const byId = new Map(replies.map((r) => [r.id, r]));
  const children = new Map<string, RoomMessage[]>();
  const top: RoomMessage[] = [];

  const anchorFor = (start: string): string => {
    let at = start;
    for (let hop = 0; hop < 8; hop++) {
      const q = byId.get(at)?.quote?.message_id;
      if (!q || q === parentId || !byId.has(q)) return at;
      at = q;
    }
    return at;
  };

  for (const r of replies) {
    const q = r.quote?.message_id;
    // Quoting the post, quoting nothing, or quoting something not on this
    // screen: it sits at the top level. A quote we cannot resolve to a sibling
    // is not a reason to hide the comment.
    if (!q || q === parentId || !byId.has(q) || q === r.id) {
      top.push(r);
      continue;
    }
    const anchor = anchorFor(q);
    if (anchor === r.id) { top.push(r); continue; }
    children.set(anchor, [...(children.get(anchor) ?? []), r]);
  }
  return { top, children };
}

export default function ThreadScreen() {
  const { id, quote: quoteParam } = useLocalSearchParams<{ id: string; quote?: string }>();
  const messageId = String(id ?? '');
  const router = useRouter();
  const media = useAttachments();

  const [parent, setParent] = useState<RoomMessage | null>(null);
  const [replies, setReplies] = useState<RoomMessage[]>([]);
  const [emptyCopy, setEmptyCopy] = useState('No comments yet.');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** True when the service answered with nothing at all, rather than nothing yet. */
  const [unreachable, setUnreachable] = useState(false);
  /**
   * Which message the composer is answering. The POST by default — a comment
   * box under a post that quoted nothing would be a box that does not know what
   * it is for — and a specific comment once you tap Reply on one.
   */
  const [replyTo, setReplyTo] = useState<string | null>(null);

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

  /**
   * THE SETUP THIS DISCUSSION IS ABOUT.
   *
   * The board draws the pinned setup above a focused discussion, and it is the
   * same object the room draws — same component, same numbers — because a
   * member who taps into a thread has not changed subject. It also gives the
   * Kai row below the levels it asks about.
   *
   * `/messages/:id/replies` carries the post and its comments and no room, so
   * the room is fetched by the id the post already knows. `limit: 1` because
   * the messages that come back with it are not wanted — the room is.
   *
   * NO SETUP, NO CARD. A thread on a post in a core room normally has none, and
   * nothing stands in for it.
   */
  const [setup, setSetup] = useState<RoomSetup | null>(null);
  const roomId = parent?.room_id ?? null;
  useEffect(() => {
    if (!roomId) { setSetup(null); return; }
    let alive = true;
    (async () => {
      const page = await communityApi.messages(roomId, 0, 1).catch(() => null);
      if (!alive) return;
      const room = page?.room ?? null;
      if (room?.setup) { setSetup(room.setup); return; }
      if (!room?.setup_id) { setSetup(null); return; }
      const resolved = await communityApi.roomSetup(room.setup_id).catch(() => null);
      if (alive) setSetup(resolved);
    })();
    return () => { alive = false; };
  }, [roomId]);

  /** Arrived here from a Reply tap in the room: answer what was tapped. */
  useEffect(() => {
    if (quoteParam) setReplyTo(String(quoteParam));
  }, [quoteParam]);

  const { top, children } = useMemo(
    () => layOut(parent?.id ?? messageId, replies),
    [parent?.id, messageId, replies],
  );

  /** The message the composer is quoting, resolved to something real. */
  const target = useMemo(() => {
    if (!parent) return null;
    if (!replyTo || replyTo === parent.id) return parent;
    return replies.find((r) => r.id === replyTo && !r.deleted) ?? parent;
  }, [parent, replies, replyTo]);

  const send = async (text: string) => {
    setError(null);
    if (!parent || !target) return;
    try {
      const posted = await communityApi.postMessage(
        parent.room_id ?? '',
        {
          body: text,
          // ALWAYS the post. Answering a comment is still a comment on the
          // post — the quote is what says which comment it answered.
          parent_id: parent.id,
          quote: quoteOf(target),
          attachment_ids: media.readyIds,
        },
        (plain) => setError(plain),
      );
      media.clear();
      setReplyTo(null);
      setReplies((prev) => (prev.some((m) => m.id === posted.id) ? prev : [...prev, posted]));
      // The post's own comment count changed; re-reading is one small request
      // and is cheaper than keeping a second copy of the number in sync.
      void load();
    } catch (e: any) {
      setError(e?.message ?? 'That comment did not send. Try again.');
    }
  };

  const react = async (target_: RoomMessage, kind: ReactionKind) => {
    const before = target_.reactions;
    const on = before.mine.includes(kind);
    const optimistic: MessageReactions = {
      counts: { ...before.counts, [kind]: Math.max(0, (before.counts[kind] ?? 0) + (on ? -1 : 1)) },
      mine: on ? before.mine.filter((k) => k !== kind) : [...before.mine, kind],
    };
    if (optimistic.counts[kind] === 0) delete optimistic.counts[kind];

    const write = (r: MessageReactions) => {
      if (parent && target_.id === parent.id) setParent({ ...parent, reactions: r });
      else setReplies((prev) => prev.map((m) => (m.id === target_.id ? { ...m, reactions: r } : m)));
    };

    write(optimistic);
    try {
      write(await communityApi.react(target_.id, kind));
    } catch (e: any) {
      write(before);
      setError(e?.message ?? 'That reaction did not register.');
    }
  };

  const openTicker = (symbol: string) => router.push(`/symbol/${encodeURIComponent(symbol)}` as never);

  /** One comment, plus whatever was said back to it. */
  const renderReply = (m: RoomMessage, indented: boolean) => (
    <View
      key={m.id}
      style={
        indented
          ? { marginLeft: 14, paddingLeft: 12, borderLeftWidth: 0.5, borderLeftColor: alpha.ivory12 }
          : undefined
      }
    >
      <MessageRow
        message={m}
        onOpenAuthor={m.author.user_id ? () => router.push(`/contributor/${m.author.user_id}`) : undefined}
        onReact={(k) => { void react(m, k); }}
        onReply={m.deleted ? undefined : () => setReplyTo(m.id)}
        onTicker={openTicker}
        hideThreadLine
      />
      {(children.get(m.id) ?? []).length ? (
        <View style={{ gap: 12, marginTop: 12 }}>
          {(children.get(m.id) ?? []).map((c) => renderReply(c, true))}
        </View>
      ) : null}
    </View>
  );

  const count = replies.filter((r) => !r.deleted).length;
  const subtitle = count === 0 ? 'No comments yet' : count === 1 ? '1 comment' : `${count} comments`;
  const answeringAComment = !!target && !!parent && target.id !== parent.id;

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
          {/* The setup this discussion is about, above the post it is about —
              board-community-rooms.png, right-hand screen. Same component the
              room and the feed draw, so the levels cannot disagree between the
              three places somebody meets them. */}
          {setup ? <PinnedSetup setup={setup} testID="thread-pinned-setup" /> : null}

          <MessageRow
            message={parent}
            onOpenAuthor={parent.author.user_id ? () => router.push(`/contributor/${parent.author.user_id}`) : undefined}
            onReact={(k) => { void react(parent, k); }}
            onReply={() => setReplyTo(parent.id)}
            onTicker={openTicker}
            hideThreadLine
          />

          {/* The rule that separates the post from what people said about it.
              A hairline, not a heading — the post is already the heading. */}
          <View style={{ height: 0.5, backgroundColor: alpha.ivory12, marginVertical: 2 }} />

          {replies.length === 0 ? (
            <T size={12.5} lh={18} c={color.muted} testID="thread-empty">{emptyCopy}</T>
          ) : (
            top.map((m) => renderReply(m, false))
          )}

          {error ? (
            <ObjectCard tone="gold" r={radius.lg} style={{ padding: 12 }}>
              <T size={12} c={color.gold}>{error}</T>
            </ObjectCard>
          ) : null}
        </ScrollView>
      )}

      {parent && !unreachable ? (
        /* One dock instead of the old KeyboardAvoidingView + safe-area pair: the
           14pt floor now collapses while the keyboard is up, so the reply box
           sits on the keys instead of a home indicator nobody can see. */
        <KeyboardDock floor={14} style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          {/*
            "ASK KAI TO EXPLAIN THE STOP AT 171.90" — the contextual Kai row,
            bound to the setup above and pre-seeded from its real levels. It
            draws only when there is a level to name; see AskKaiAboutSetup for
            why the question does not go to the room-scoped Kai endpoint.
          */}
          {setup ? (
            <View style={{ paddingBottom: 10 }}>
              <AskKaiAboutSetup setup={setup} />
            </View>
          ) : null}
          {media.notice ? (
            <View style={{ paddingBottom: 8 }}>
              <T size={11} c={color.gold}>{media.notice}</T>
            </View>
          ) : null}
          <RoomComposer
            roomLabel="this post"
            placeholder={answeringAComment ? 'Write your reply…' : 'Add a comment…'}
            onSend={send}
            // Kai's ROOM COMMANDS — summarise, verify, mark levels — belong to
            // the room and not to one comment, so @Kai still goes back to it.
            // The one Kai question a thread can answer for itself is the row
            // above: it is about the setup on screen rather than about the
            // conversation, which is why it can live here and these cannot.
            onKai={() => router.back()}
            onStructured={() => router.back()}
            quote={target ? quoteOf(target) : null}
            quoteLabel={
              answeringAComment
                ? `Replying to ${target!.author.handle ? `@${target!.author.handle}` : target!.author.display_name}`
                : `Replying to ${parent.author.display_name}'s post`
            }
            // Clearing goes back to answering the POST, which is what this
            // screen is for. There is no "quote nothing" state to fall into.
            onClearQuote={answeringAComment ? () => setReplyTo(null) : undefined}
            attachments={media.attachments}
            onAttach={() => { void media.pick(); }}
            onRemoveAttachment={media.remove}
          />
        </KeyboardDock>
      ) : null}
    </View>
  );
}
