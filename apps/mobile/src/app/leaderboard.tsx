import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../ui/Screen';
import { StackHeader } from '../ui/StackHeader';
import { Segmented } from '../ui/Segmented';
import { ObjectCard } from '../ui/Panel';
import { T, Num, Eyebrow } from '../ui/Text';
import { alpha, color, radius } from '../ui/tokens';
import { Avatar } from '../features/community/ui/Chrome';
import { BeltChip, MemberName, useLeaderboard } from '../features/social';
import type { LeaderboardPeriod, LeaderboardRow } from '../lib/types';

/**
 * THE BOARD.
 *
 * ── ACCURACY IS THE COLUMN THAT MATTERS ─────────────────────────────────
 * Points decide the order, because something has to. Accuracy is what the
 * board is FOR: it is the number that teaches what is being measured, which is
 * whether somebody was right — not how loud they were, not how often they
 * posted, and never how much money they made. So accuracy is set in the
 * numeric face at the size of a real figure, and points sit beside it as the
 * smaller, ordering number. A board that led with points would teach that
 * volume wins, and within a month it would be true.
 *
 * ── AND THERE IS NO MONEY ON IT ─────────────────────────────────────────
 * No P/L, no returns, no account size, in any period. The types cannot carry
 * one (see the SOCIAL section of the shared contract), which is deliberate:
 * a public ranking by profit is the single fastest way to turn a room of
 * people learning into a room of people lying.
 *
 * ── THE RULES ARE PRINTED ───────────────────────────────────────────────
 * `explainer` comes from the API, in the server's own words, because a scoring
 * system nobody can check reads as rigged — and a second copy of the formula
 * on the phone is how the printed one starts disagreeing with the one that
 * awarded the points. It is a disclosure, opened by choice, not a wall of
 * rules in front of the board.
 *
 * ── YOUR OWN ROW ────────────────────────────────────────────────────────
 * Pinned at the bottom when it is off-screen, drawn once and never twice. The
 * API sends `you` for exactly this and the adapter drops it when the row is
 * already in the list, because seeing yourself at rank 3 and rank 18 at the
 * same time reads as a broken ranking.
 */

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

function Row({ row, pinned = false }: { row: LeaderboardRow; pinned?: boolean }) {
  const router = useRouter();
  const you = row.is_you;
  return (
    <Pressable
      testID={`board-row-${row.rank}`}
      accessibilityRole="button"
      accessibilityLabel={[
        `Rank ${row.rank}`,
        row.author.display_name,
        row.accuracy != null ? `${row.accuracy}% accurate` : 'nothing resolved yet',
        `${row.points} points`,
      ].join(', ')}
      onPress={() => router.push(`/contributor/${encodeURIComponent(row.author.user_id)}` as never)}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 12, paddingHorizontal: pinned ? 13 : 0,
        borderRadius: pinned ? radius.lg : 0,
        ...(pinned
          ? { borderWidth: 0.5, borderColor: alpha.volt50, backgroundColor: alpha.volt08 }
          : { borderBottomWidth: 0.5, borderBottomColor: alpha.ivory08 }),
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {/* Rank is a number you compare, so it is in the numeric face and
          right-aligned in a fixed column — otherwise 1 and 10 do not line up
          and the list stops reading as an order. */}
      <Num size={13} weight="semibold" c={you ? color.volt : color.muted} style={{ width: 26, textAlign: 'right' }}>
        {String(row.rank)}
      </Num>
      <Avatar initial={row.author.initial} url={row.author.avatar_url} size={30} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/*
            THE BELT INK, AND NO SECOND DOOR. The whole row is already the
            Pressable that opens the profile, and on web a role of "button"
            renders as a real <button> which cannot contain another — so
            `MemberName` is given no `userId` here and is asked only for the
            colour.

            YOUR OWN ROW STAYS VOLT. The rank, the accuracy figure and the
            row's border are all volt on it already, because volt is the user:
            tinting one word of that row a belt colour would read as a
            rendering fault rather than as a rank, and you do not need to be
            told your own belt on a list you are scanning for other people's.
          */}
          {you ? (
            <T size={13} weight="semibold" numberOfLines={1} c={color.volt}>
              {row.author.handle ? `@${row.author.handle}` : row.author.display_name}
            </T>
          ) : (
            <MemberName
              name={row.author.handle ? `@${row.author.handle}` : row.author.display_name}
              belt={row.author.belt}
              size={13}
              weight="semibold"
              testID={`board-row-name-${row.rank}`}
            />
          )}
          {you ? <T size={10} c={color.dim}>you</T> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <BeltChip belt={row.author.belt} />
          <T size={10} c={color.dim}>{`${row.wins} of ${row.resolved} resolved`}</T>
        </View>
      </View>

      {/* THE POINT OF THE BOARD. Accuracy loud, points quiet beside it. */}
      <View style={{ alignItems: 'flex-end' }}>
        {row.accuracy != null ? (
          <Num size={17} weight="bold" c={you ? color.volt : color.text} testID={`board-accuracy-${row.rank}`}>
            {`${row.accuracy}%`}
          </Num>
        ) : (
          // Nothing has resolved. That is not "0% accurate" — a dash says so.
          <T size={15} c={color.dim} testID={`board-accuracy-${row.rank}`}>—</T>
        )}
        <T size={10} c={color.dim}>{`${row.points} pts`}</T>
      </View>
    </Pressable>
  );
}

export default function LeaderboardScreen() {
  const board = useLeaderboard('week');
  const [rulesOpen, setRulesOpen] = useState(false);
  const data = board.data;

  return (
    <Screen variant="corner" layout="tab" testID="screen-leaderboard">
      <StackHeader title="The board" subtitle="Ranked on being right" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <Segmented
          options={PERIODS}
          value={board.period}
          onChange={board.setPeriod}
          testID="board-period"
        />

        {board.loading && !data ? (
          <View style={{ paddingVertical: 44, alignItems: 'center' }}>
            <ActivityIndicator color={color.violet} />
          </View>
        ) : board.error ? (
          <T size={13} lh={19} c={color.muted} testID="board-error">{board.error}</T>
        ) : data && data.rows.length ? (
          <>
            {/* The column header exists so "79%" is never an unlabelled
                number. It is the only header the list gets. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 2 }}>
              <T size={10} c={color.dim} style={{ flex: 1 }}>MEMBER</T>
              <T size={10} c={color.dim}>ACCURACY</T>
            </View>

            <ObjectCard r={radius.xl} style={{ paddingHorizontal: 14, paddingVertical: 2 }} testID="board-rows">
              {data.rows.map((r) => <Row key={`${r.rank}-${r.author.user_id}`} row={r} />)}
            </ObjectCard>

            {data.you ? (
              <View style={{ gap: 6 }} testID="board-you">
                <T size={10.5} c={color.dim}>WHERE YOU ARE</T>
                <Row row={data.you} pinned />
              </View>
            ) : null}
          </>
        ) : (
          <View style={{ paddingVertical: 30, gap: 6 }} testID="board-empty">
            <T size={14} weight="semibold">Nobody is on the board yet.</T>
            <T size={12.5} lh={18} c={color.muted}>
              {data?.empty_plain
                ?? 'A call reaches the board once it has an entry and a stop or a target, and price has resolved it one way or the other.'}
            </T>
          </View>
        )}

        {/* HOW POINTS WORK — the server's own sentences, opened by choice. */}
        {data?.explainer.lines.length ? (
          <View style={{ gap: 8, paddingTop: 4 }}>
            <Pressable
              testID="board-rules-toggle"
              accessibilityRole="button"
              accessibilityLabel={rulesOpen ? 'Hide how points work' : 'How points work'}
              accessibilityState={{ expanded: rulesOpen }}
              onPress={() => setRulesOpen((v) => !v)}
              style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
            >
              <T size={12} weight="semibold" c={color.muted}>
                {rulesOpen ? 'Hide how points work' : 'How points work'}
              </T>
            </Pressable>

            {rulesOpen ? (
              <ObjectCard r={radius.xl} style={{ padding: 15, gap: 11 }} testID="board-rules">
                {data.explainer.lines.map((l, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 9 }}>
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: alpha.volt55, marginTop: 7 }} />
                    <T size={12.5} lh={18.5} c={color.muted} style={{ flex: 1 }}>{l}</T>
                  </View>
                ))}

                {data.explainer.belts.length ? (
                  <View style={{ gap: 7, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 }}>
                    <Eyebrow c={color.dim}>THE LADDER</Eyebrow>
                    {data.explainer.belts.map((b) => (
                      <View key={b.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <BeltChip belt={b.key} label={b.label} />
                        <Num size={11.5} c={color.muted}>{`${b.min_points} pts`}</Num>
                      </View>
                    ))}
                  </View>
                ) : null}
              </ObjectCard>
            ) : null}
          </View>
        ) : null}

        {/* The standing promise, said once at the foot of the board. */}
        <T size={10} lh={15} c={color.dim} testID="board-footer">
          Outcomes only. The board never shows profit, returns or account size — being right is what is
          measured here.
        </T>

        {board.isFixture ? (
          <T size={10} c={color.dim} align="center">Example board — the service is not connected here.</T>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
