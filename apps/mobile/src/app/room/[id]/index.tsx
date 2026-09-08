import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Wash } from '../../../ui/Wash';
import { KeyboardDock } from '../../../ui/KeyboardDock';
import { T } from '../../../ui/Text';
import { ObjectCard } from '../../../ui/Panel';
import { color, radius, alpha } from '../../../ui/tokens';
import { RoomAvatar, roomImageUrl } from '../../../ui/RoomAvatar';
import { communityApi } from '../../../lib/community-api';
import { useSession } from '../../../lib/session';
import { subscribeRoom, transportLabel, type RealtimeMode } from '../../../lib/realtime';
import {
  CatchUpPill, NewMessagesRule, PinnedStrip, RoomStateNote, Sheet, SheetRow, StackHeader, SentimentBar,
} from '../../../features/community/ui/Chrome';
import { MessageRow } from '../../../features/community/ui/Message';
import { MessageListSkeleton } from '../../../features/community/ui/Skeleton';
import { KaiObjectView } from '../../../features/community/ui/KaiObjects';
import { CasePair, PinnedSetup } from '../../../features/community/ui/PinnedSetup';
import { RoomComposer } from '../../../features/community/ui/RoomComposer';
import { RoomWelcome } from '../../../features/community/ui/RoomWelcome';
import { KAI_COMMANDS, EMPTY_REACTIONS, type KaiCommand, type KaiRoomObject, type MessageReactions, type ReactionKind, type Room, type RoomMessage } from '../../../features/community/types';
import { useAttachments } from '../../../features/media/useAttachments';
import {
  fixtureAlertPreview, fixtureComparison, fixtureExplain, fixtureRooms,
} from '../../../features/community/fixtures';

/**
 * V3-C1 setup room + S81 core room, one screen.
 *
 * Live updates: Supabase Realtime `postgres_changes` on `messages` filtered by
 * room_id, with an automatic 5s poll fallback (src/lib/realtime.ts) — the
 * header says which one is actually running rather than claiming "live".
 *
 * DEVIATIONS from V3-C1, deliberate:
 *  · sentiment renders colour-free (green/red are reserved for financial
 *    semantics) and always carries "sentiment is not evidence";
 *  · the price line is a level strip against the real last price, not an
 *    invented squiggle (see PinnedSetup);
 *  · the composer's right circle is Send, not the mic — voice is not shipped.
 */

const KAI_FIXTURES: Partial<Record<KaiCommand, KaiRoomObject>> = {
  compare: fixtureComparison,
  explain: fixtureExplain,
  to_alert: fixtureAlertPreview,
};

function fixtureVerification(selected: RoomMessage | null): KaiRoomObject {
  return {
    type: 'verification_card',
    title: 'Kai · Verification',
    claim: selected?.body ?? 'The claim above.',
    result: 'unverified',
    result_label: 'Not verified',
    detail: "I can't check this one against market data yet — live evaluation starts when the market feed goes live.",
    sources: [],
    as_of: null,
    uncertainty: 'Until it is checked, treat it as an opinion.',
    effect_on_setup: 'No effect on the grade.',
    message_id: selected?.id ?? null,
  };
}

function fixtureLevels(messages: RoomMessage[]): KaiRoomObject {
  const levels = new Set<string>();
  for (const m of messages) {
    for (const l of String(m.body ?? '').match(/\b\d{2,5}(?:\.\d{1,2})?\b/g) ?? []) levels.add(l);
  }
  const list = [...levels].slice(0, 6);
  return {
    type: 'explain',
    title: 'Levels this room keeps naming',
    lines: list.length
      ? list.map((l) => ({ label: l, text: 'Mentioned in the conversation above.' }))
      : [{ label: null, text: 'Nobody has named a price level in this window yet.' }],
    footnote: 'How often a number is repeated is not evidence that it matters.',
  };
}

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = String(id ?? '');
  const router = useRouter();
  /** Whose posts are somebody else's — the only thing the follow control needs. */
  const { session } = useSession();
  const myUserId = session?.user?.id ?? null;
  const scroller = useRef<ScrollView | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [transport, setTransport] = useState<RealtimeMode>('off');
  const [selected, setSelected] = useState<string | null>(null);
  const [kaiSheet, setKaiSheet] = useState(false);
  const [moreSheet, setMoreSheet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [showCatchUp, setShowCatchUp] = useState(false);
  /** True when we are online but the room service answered with nothing. */
  const [exampleData, setExampleData] = useState(false);
  /**
   * The service answered with nothing and we are NOT in fixtures mode.
   * Before this existed the room fell back to example messages, so a member
   * with a dead connection read invented posts as the conversation.
   */
  const [unreachable, setUnreachable] = useState(false);
  /** Bumped by Try again; the initial-load effect keys on it. */
  const [reloadTick, setReloadTick] = useState(0);
  /** A question starter's words, on their way into the composer. Never posted. */
  const [draft, setDraft] = useState('');
  const [draftNonce, setDraftNonce] = useState(0);
  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  const lastSeq = useRef(0);
  const focusedOnce = useRef(false);
  const media = useAttachments();

  const merge = useCallback((incoming: RoomMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      const next = [...byId.values()].sort((a, b) => a.seq - b.seq || a.created_at.localeCompare(b.created_at));
      lastSeq.current = next.reduce((max, m) => Math.max(max, m.seq), lastSeq.current);
      return next;
    });
  }, []);

  /** Initial page. */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ rooms }, page] = await Promise.all([
        communityApi.rooms(),
        communityApi.messages(roomId, 0, 50),
      ]);
      if (!alive) return;
      const found = page.room ?? rooms.find((r) => r.id === roomId) ?? fixtureRooms.find((r) => r.id === roomId) ?? null;
      if (found && page.catchUp) found.unread = page.catchUp.count;
      setRoom(found);
      // A setup room's object lives on the setup, not on the room row.
      if (found?.setup_id && !found.setup) {
        communityApi.roomSetup(found.setup_id).then((setup) => {
          if (alive && setup) setRoom((r) => (r ? { ...r, setup, type: 'setup' } : r));
        });
      }
      setMuted(!!found?.muted_until);
      setShowCatchUp(!!found && found.unread > 0);
      merge(page.messages);
      setExampleData(page.source === 'fixtures');
      setUnreachable(page.source === 'unreachable');
      setLoading(false);
      // With nothing new, drop straight to the latest message like any chat.
      // With a backlog, stay at the top so the pinned intelligence and the
      // catch-up pill are the first things you see (08 §3, §5).
      if (!found || found.unread === 0) {
        requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: false }));
      }
    })();
    return () => { alive = false; };
  }, [roomId, merge, reloadTick]);

  /** Live updates, or the 5s poll that stands in for them. */
  const pull = useCallback(async () => {
    try {
      const page = await communityApi.messages(roomId, lastSeq.current, 50);
      merge(page.messages);
    } catch {
      /* a failed refresh is not worth an error banner — the next tick retries */
    }
  }, [roomId, merge]);

  useEffect(() => {
    const ch = subscribeRoom(roomId, pull, setTransport);
    return () => ch.unsubscribe();
  }, [roomId, pull]);

  /** Coming back from the structured composer: pick up what was just posted. */
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) { focusedOnce.current = true; return; }
      pull().then(() => requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: false })));
    }, [pull]),
  );

  /** 08 §10 — a claim stays unverified until a verification_card names it. */
  const verified = useMemo(() => {
    const map: Record<string, { result: any; label: string }> = {};
    for (const m of messages) {
      const o = m.kai_object;
      if (o?.type === 'verification_card' && o.message_id) {
        map[o.message_id] = { result: o.result, label: o.result_label === 'Confirmed' ? 'Verified by Kai' : o.result_label };
      }
    }
    return map;
  }, [messages]);

  const decorated = useMemo(
    () => messages.map((m) => ({ ...m, verified_by: verified[m.id] ?? null })),
    [messages, verified],
  );

  /** The latest room summary drives the pinned bull/bear + sentiment block. */
  const summary = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const o = messages[i].kai_object;
      if (o?.type === 'room_summary') return o;
    }
    return null;
  }, [messages]);

  const firstUnreadIdx = useMemo(() => {
    if (!room || room.last_read_seq <= 0) return -1;
    return decorated.findIndex((m) => m.seq > room.last_read_seq);
  }, [decorated, room]);

  const selectedMessage = decorated.find((m) => m.id === selected) ?? null;
  const isSetupRoom = room?.type === 'setup' && !!room.setup;
  const title = room ? (room.type === 'setup' ? `${room.setup?.symbol ?? room.name} room` : `# ${room.name}`) : 'Room';

  /*
   * THE ROOM'S PICTURE.
   *
   * A room about a company wears that company's logo; anything else wears the
   * picture an admin gave it, or its initial. The symbol comes from the setup
   * where there is one and otherwise off the front of the name, which is how
   * the server derives it too (`symbolFromName`, round4/circles.ts) — a circle
   * is named "META Circle", so the ticker is the first word.
   */
  const roomSymbol = room?.type === 'setup'
    ? (room.setup?.symbol ?? (String(room.name).match(/^([A-Z]{1,6})\b/)?.[1] ?? null))
    : null;
  const roomImage = roomImageUrl(room?.config);

  const subtitle = room
    ? [
        room.discussing_count ? `${room.discussing_count} discussing` : null,
        room.unread > 0 ? `${room.unread} new since you left` : null,
        transportLabel(transport),
      ].filter(Boolean).join(' · ')
    : '';

  const send = async (text: string) => {
    setError(null);
    const ids = media.readyIds;
    try {
      const posted = await communityApi.postMessage(
        roomId,
        { body: text, attachment_ids: ids },
        (plain) => setError(plain),
      );
      // Only cleared once the post is actually accepted. Clearing first would
      // throw away pictures the member would then have to pick again.
      media.clear();
      merge([{ ...posted, seq: posted.seq || lastSeq.current + 1 }]);
      requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
    } catch (e: any) {
      setError(e?.message ?? 'That message did not send. Try again.');
    }
  };

  /**
   * A reaction, flipped straight away and corrected by the server's answer.
   * On a failure the previous state goes back and the server's own sentence is
   * shown — the room never keeps a count that did not happen.
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

    const write = (r: MessageReactions) =>
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: r } : m)));

    write(optimistic);
    try {
      write(await communityApi.react(messageId, kind));
    } catch (e: any) {
      write(before);
      setError(e?.message ?? 'That reaction did not register.');
    }
  };

  const runKai = async (cmd: KaiCommand) => {
    setKaiSheet(false);
    setBusy(cmd);
    setError(null);
    try {
      let object = await communityApi.kai(roomId, cmd, {}, selected ?? undefined);
      if (!object) {
        object =
          cmd === 'verify' ? fixtureVerification(selectedMessage)
          : cmd === 'mark_levels' ? fixtureLevels(messages)
          : cmd === 'summarize'
            ? (messages.map((m) => m.kai_object).reverse().find((o) => o?.type === 'room_summary') ?? null)
          : KAI_FIXTURES[cmd] ?? null;
      }
      if (object) {
        const now = new Date().toISOString();
        merge([{
          id: `kai-${Date.now()}`,
          room_id: roomId,
          seq: lastSeq.current + 1,
          kind: 'kai_object',
          created_at: now,
          time_label: 'just now',
          author: { user_id: 'kai', display_name: 'Kai', handle: null, avatar_url: null, initial: 'K', role_labels: ['AI'], is_kai: true, author_deleted: false },
          body: null, refs: null, structured_idea: null, position_disclosure: null,
          kai_object: object, community_call: null, deleted: false, is_claim: false,
          reactions: EMPTY_REACTIONS, reply_count: 0, parent_id: null, quote: null,
          media: [], author_deleted: false,
        }]);
        requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
      } else {
        setError("Kai could not answer that here. Nothing was posted.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Kai could not answer that here. Nothing was posted.");
    } finally {
      setBusy(null);
      setSelected(null);
    }
  };

  const toggleMute = async () => {
    setMoreSheet(false);
    const next = !muted;
    setMuted(next);
    try { await communityApi.setMute(roomId, next); } catch { setMuted(!next); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }} testID="screen-room">
      <Wash variant="corner" />

      <StackHeader
        title={title}
        subtitle={
          <View style={{ alignItems: 'center', gap: 2 }}>
            <T size={10} c={color.muted}>{subtitle || ' '}</T>
            <RoomStateNote slowModeS={room?.config.slow_mode_s} restricted={room?.config.posting_restricted} />
          </View>
        }
        onBack={() => router.back()}
        leading={room ? (
          <RoomAvatar
            symbol={roomSymbol}
            name={room.name}
            imageUrl={roomImage}
            size={28}
            testID="room-avatar"
          />
        ) : undefined}
        right={room?.setup?.grade_display ? <T size={16} weight="bold" c={color.violet}>{room.setup.grade_display}</T> : undefined}
        onRight={() => setMoreSheet(true)}
        rightLabel="Room options"
      />

      {/*
        A SKELETON, NOT A SPINNER. The spinner that was here was centred in an
        otherwise empty room: it said something was happening and nothing about
        what, drew the same picture whether the room held one post or two
        hundred, and threw the whole screen away and rebuilt it when the answer
        landed. The skeleton stands in the messages' own place, so the list
        arrives into the space it was already occupying instead of replacing a
        blank.
      */}
      {loading ? (
        <MessageListSkeleton testID="room-loading" />
      ) : (
        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {exampleData ? (
            <ObjectCard tone="gold" r={radius.lg} style={{ padding: 12 }} testID="example-data">
              <T size={12} lh={17} c={color.gold}>
                Example conversation. The room service isn't connected yet, so nothing here was written by a member.
              </T>
            </ObjectCard>
          ) : null}

          {/* Could not be reached. Say so, and offer the one thing that helps. */}
          {unreachable ? (
            <ObjectCard r={radius.lg} style={{ padding: 16, gap: 10 }} testID="room-unreachable">
              <T size={13.5} weight="bold">We couldn't load this room</T>
              <T size={12} lh={18} c={color.muted}>
                Nothing was reached, so nothing is shown — what you would be looking at otherwise is
                invented, and a room of invented posts is worse than an empty one. Your connection or
                the service is the usual reason.
              </T>
              <Pressable
                testID="room-retry"
                accessibilityRole="button"
                accessibilityLabel="Try loading the room again"
                onPress={() => { setUnreachable(false); setLoading(true); reload(); }}
                style={({ pressed }) => ({
                  alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center',
                  paddingHorizontal: 16, borderRadius: radius.pill,
                  borderWidth: 1, borderColor: alpha.volt55, backgroundColor: alpha.volt10,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <T size={12} weight="semibold" c={color.volt}>Try again</T>
              </Pressable>
            </ObjectCard>
          ) : null}

          {/* Pinned intelligence (08 §3) */}
          {isSetupRoom && room?.setup ? (
            <PinnedSetup setup={room.setup} watching={room.member_count} />
          ) : null}
          {room?.pinned.map((p, i) => <PinnedStrip key={i} kind={p.kind} text={p.text} />)}

          {summary ? (
            <View style={{ gap: 10 }}>
              {summary.bull_case && summary.bear_case ? (
                <CasePair bull={summary.bull_case} bear={summary.bear_case} />
              ) : null}
              {summary.sentiment ? (
                <SentimentBar bullPct={summary.sentiment.bull_pct} sample={summary.sentiment.sample} />
              ) : null}
            </View>
          ) : null}

          {showCatchUp && room && room.unread > 0 ? (
            <CatchUpPill
              testID="catch-up"
              count={room.unread}
              onPress={() => {
                setShowCatchUp(false);
                scroller.current?.scrollToEnd({ animated: true });
              }}
            />
          ) : null}

          {decorated.length === 0 ? (
            /*
             * The same welcome the Community feed shows (audit F14). One
             * sentence telling a newcomer to "ask a question" is advice; two
             * questions they can put in the box and edit is a start. Same
             * component in both places so the empty room does not read as two
             * different products.
             */
            <RoomWelcome
              testID="room-empty"
              roomName={room?.name ?? 'this room'}
              description={room?.description ?? null}
              onStarter={(q) => { setDraft(q); setDraftNonce((n) => n + 1); }}
            />
          ) : (
            decorated.map((m, i) => (
              <View key={m.id} style={{ gap: 12 }}>
                {i === firstUnreadIdx ? <NewMessagesRule label={`NEW MESSAGES · ${m.time_label.replace(/^.*at /, '')}`} /> : null}
                <MessageRow
                  message={m}
                  selected={selected === m.id}
                  onSelect={() => setSelected(selected === m.id ? null : m.id)}
                  onOpenAuthor={() => router.push(`/contributor/${m.author.user_id}`)}
                  onMore={() => { setSelected(m.id); setMoreSheet(true); }}
                  onReact={(k) => { void react(m.id, k); }}
                  onOpenThread={() => router.push(`/thread/${encodeURIComponent(m.id)}` as never)}
                  // Reply lands on the same screen as the comment count, with
                  // the post already quoted. Comments and replies are the same
                  // conversation; giving them two destinations would split it.
                  onReply={() => router.push(`/thread/${encodeURIComponent(m.id)}?quote=${encodeURIComponent(m.id)}` as never)}
                  onTicker={(sym) => router.push(`/symbol/${encodeURIComponent(sym)}` as never)}
                  onOpenQuote={(qid) => router.push(`/thread/${encodeURIComponent(qid)}` as never)}
                  // Follow, right where you meet the person — a room is where
                  // you decide somebody is worth reading. Never on your own
                  // post; the component refuses Kai's on its own.
                  showFollow={!!myUserId && m.author.user_id !== myUserId && m.author.user_id !== 'me'}
                />
              </View>
            ))
          )}

          {busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={color.violet} />
              <T size={12} c={color.violetLight}>Kai is working on it…</T>
            </View>
          ) : null}

          {error ? (
            <ObjectCard tone="gold" r={radius.lg} style={{ padding: 12 }}>
              <T size={12} c={color.gold}>{error}</T>
            </ObjectCard>
          ) : null}
        </ScrollView>
      )}

      {/* One dock instead of the old KeyboardAvoidingView + safe-area pair: the
          14pt floor now collapses while the keyboard is up, so the bar sits on
          the keys rather than a home indicator that is no longer visible. */}
      <KeyboardDock floor={14} style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        {selectedMessage ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
            <View style={{ width: 3, height: 22, borderRadius: 2, backgroundColor: color.violet }} />
            <T size={11} c={color.violetLight} numberOfLines={1} style={{ flex: 1 }}>
              Selected: {selectedMessage.author.display_name} — {selectedMessage.body ?? 'a Kai object'}
            </T>
          </View>
        ) : null}
        {media.notice ? (
          <View style={{ paddingBottom: 8 }}>
            <T size={11} c={color.gold}>{media.notice}</T>
          </View>
        ) : null}
        <RoomComposer
          roomLabel={room?.type === 'setup' ? `${room.setup?.symbol ?? room.name} room` : `# ${room?.name ?? 'room'}`}
          onSend={send}
          onKai={() => setKaiSheet(true)}
          onStructured={() => router.push(`/room/${roomId}/compose`)}
          // The + menu's Kai row runs ONE command — the catch-up summary —
          // through the same `runKai` the sheet uses, so a refusal arrives in
          // the service's own words in the same place as every other one.
          // Nothing is fired without a tap: this call costs credits.
          onAskKai={() => { void runKai('summarize'); }}
          draft={draft}
          draftNonce={draftNonce}
          callSymbol={room?.setup?.symbol ?? null}
          disabled={!!room?.config.posting_restricted}
          disabledReason={room?.config.posting_restricted ? 'Posting is restricted in this room right now. You can still read and ask Kai.' : null}
          attachments={media.attachments}
          onAttach={() => { void media.pick(); }}
          onRemoveAttachment={media.remove}
        />
      </KeyboardDock>

      <Sheet
        testID="kai-sheet"
        visible={kaiSheet}
        onClose={() => setKaiSheet(false)}
        title="Ask Kai in this room"
        subtitle={selectedMessage ? `Acting on ${selectedMessage.author.display_name}'s message` : 'Pick a message first for the two that need one.'}
      >
        {KAI_COMMANDS.map((c, i) => (
          <SheetRow
            key={c.id}
            testID={`kai-cmd-${c.id}`}
            tone="kai"
            label={c.label}
            hint={c.needs_message && !selected ? 'Select a message in the room first.' : c.hint}
            disabled={c.needs_message && !selected}
            onPress={() => runKai(c.id)}
            last={i === KAI_COMMANDS.length - 1}
          />
        ))}
      </Sheet>

      <Sheet
        testID="room-sheet"
        visible={moreSheet}
        onClose={() => setMoreSheet(false)}
        title={selectedMessage ? 'This message' : 'Room options'}
      >
        {selectedMessage ? (
          <>
            <SheetRow
              testID="open-contributor"
              label={`Open ${selectedMessage.author.display_name}'s profile`}
              hint="Role labels, contribution history, disclosures. No rankings."
              onPress={() => { setMoreSheet(false); router.push(`/contributor/${selectedMessage.author.user_id}`); }}
            />
            <SheetRow
              testID="report-message"
              tone="danger"
              label="Report this message"
              hint="Goes to a moderator. Market claims are kept for the audit trail."
              onPress={async () => {
                setMoreSheet(false);
                try { await communityApi.report(selectedMessage.id, 'user_report'); setError('Reported. A moderator will look at it.'); }
                catch (e: any) { setError(e?.message ?? 'That report did not send.'); }
              }}
            />
          </>
        ) : null}
        <SheetRow
          testID="mute-room"
          label={muted ? 'Unmute this room' : 'Mute this room'}
          hint={muted ? 'You will hear about it again.' : 'It stays in your list — it just stops nudging you.'}
          onPress={toggleMute}
          last
        />
      </Sheet>
    </View>
  );
}
