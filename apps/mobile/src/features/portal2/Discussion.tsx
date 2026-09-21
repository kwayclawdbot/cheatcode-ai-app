/**
 * DISCUSSION — what members are saying about this symbol, from the APIs that
 * already carry it. Nothing new is fetched that the Community tab does not
 * already read:
 *
 *   the portal's community block ... the setup's own discussion room, its open
 *                                    circle, the members' sentiment line and the
 *                                    claims Kai has checked (`/trade/portal`)
 *   the room itself ................ its latest messages (`/rooms/:id/messages`)
 *
 * It says who is talking and never mixes that with Kai's grade: the header line
 * is the portal's own "members, not Kai" label. When no room exists for the
 * symbol, the tab says so and offers the one honest next step — post a call —
 * instead of showing some other room's chatter under this ticker.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Card, CardStack, Divider, T, Button, color, layout } from '../../ui/kit';
import { communityApi, relativeLabel } from '../../lib/community-api';
import type { RoomMessage } from '../community/types';
import type { PortalCommunity } from '../portal/types';

type Load = { state: 'idle' | 'loading' | 'ready' | 'failed'; messages: RoomMessage[] };

const SHOW = 8;

export function DiscussionTab({
  symbol, community, onNavigate,
}: {
  symbol: string;
  community: PortalCommunity | null;
  onNavigate: (route: string) => void;
}) {
  const roomId = community?.room_id ?? null;
  const [load, setLoad] = useState<Load>({ state: roomId ? 'loading' : 'idle', messages: [] });

  useEffect(() => {
    if (!roomId) { setLoad({ state: 'idle', messages: [] }); return; }
    let alive = true;
    setLoad({ state: 'loading', messages: [] });
    communityApi.messages(roomId, 0, 30)
      .then((r) => {
        if (!alive) return;
        if (r.source === 'unreachable') { setLoad({ state: 'failed', messages: [] }); return; }
        const shown = r.messages.filter((m) => !m.deleted && (m.body?.trim() || m.community_call)).slice(-SHOW).reverse();
        setLoad({ state: 'ready', messages: shown });
      })
      .catch(() => { if (alive) setLoad({ state: 'failed', messages: [] }); });
    return () => { alive = false; };
  }, [roomId]);

  const circle = community?.circle_id ? { id: community.circle_id, name: community.circle_name } : null;

  return (
    <CardStack testID="trade-discussion">
      <Card style={{ gap: 6 }} testID="discussion-summary">
        <T variant="meta" c={color.textSecondary}>{community?.label_plain ?? 'Members, not Kai. It never changes the grade.'}</T>
        <T variant="body">
          {community?.summary ?? `Nobody has written down an idea about ${symbol} yet.`}
        </T>
        {community?.bullish_pct != null || community?.message_count != null ? (
          <T variant="meta" c={color.textSecondary} testID="discussion-counts">
            {[
              community?.message_count != null ? `${community.message_count} messages today` : null,
              community?.bullish_pct != null ? `${community.bullish_pct}% bullish` : null,
            ].filter(Boolean).join(' · ')}
          </T>
        ) : null}
      </Card>

      {community?.claims?.length ? (
        <Card style={{ gap: 10 }} testID="discussion-claims">
          <T variant="cardTitle">Claims Kai checked</T>
          {community.claims.map((c, i) => (
            <View key={`${c.claim}-${i}`} style={{ gap: 2 }}>
              {i > 0 ? <Divider style={{ marginBottom: 8 }} /> : null}
              <T variant="body">{c.claim}</T>
              <T variant="meta" c={color.textSecondary}>{`${c.verdict} — ${c.plain}`}</T>
            </View>
          ))}
        </Card>
      ) : null}

      {roomId ? (
        <Card padded={false} testID="discussion-room">
          <View style={{ padding: layout.cardPad, paddingBottom: 8 }}>
            <T variant="cardTitle">{`Latest in the ${symbol} room`}</T>
          </View>
          {load.state === 'loading' ? (
            <T variant="meta" c={color.textSecondary} style={{ paddingHorizontal: layout.cardPad, paddingBottom: layout.cardPad }}>Loading the room…</T>
          ) : load.state === 'failed' ? (
            <T variant="meta" c={color.textSecondary} style={{ paddingHorizontal: layout.cardPad, paddingBottom: layout.cardPad }} testID="discussion-failed">
              The room did not load just now. Open it to try again.
            </T>
          ) : load.messages.length ? (
            load.messages.map((m, i) => (
              <View key={m.id} testID="discussion-message" style={{ paddingHorizontal: layout.cardPad, paddingVertical: 10, gap: 3 }}>
                {i > 0 ? <Divider style={{ position: 'absolute', top: 0, left: layout.cardPad, right: layout.cardPad }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <T variant="body" weight="semibold" c={m.author.is_kai ? color.kaiInk : color.textPrimary} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {m.author.display_name}
                  </T>
                  {m.author.handle ? <T variant="meta" c={color.textSecondary} numberOfLines={1}>{`@${m.author.handle}`}</T> : null}
                  <T variant="meta" c={color.textSecondary}>{relativeLabel(m.created_at) || m.time_label}</T>
                </View>
                <T variant="body" numberOfLines={4}>
                  {m.body?.trim() || (m.community_call ? `Posted a ${m.community_call.direction} call on ${m.community_call.symbol}.` : '')}
                </T>
              </View>
            ))
          ) : (
            <T variant="meta" c={color.textSecondary} style={{ paddingHorizontal: layout.cardPad, paddingBottom: layout.cardPad }} testID="discussion-empty">
              {`Nobody has posted in the ${symbol} room yet.`}
            </T>
          )}
        </Card>
      ) : (
        <Card testID="discussion-no-room" style={{ gap: 6 }}>
          <T variant="cardTitle">{`No room for ${symbol} yet`}</T>
          <T variant="body" c={color.textSecondary}>
            A room opens when a setup on this symbol is graded. Until then, a call you post shows up in the Community feed.
          </T>
        </Card>
      )}

      <View style={{ gap: 8 }}>
        {roomId ? (
          <Button kind="outline" height={48} label={`Open the ${symbol} room`} onPress={() => onNavigate(`/room/${encodeURIComponent(roomId)}`)} testID="discussion-open-room" />
        ) : null}
        {circle ? (
          <Button kind="outline" height={48} label={`Open ${circle.name ?? 'the circle'}`} onPress={() => onNavigate(`/circle/${encodeURIComponent(circle.id)}`)} testID="discussion-open-circle" />
        ) : null}
        <Button kind="ghost" height={44} label={`Post a call on ${symbol}`} onPress={() => onNavigate(`/community/call/new?symbol=${encodeURIComponent(symbol)}`)} testID="discussion-post-call" />
      </View>
    </CardStack>
  );
}
