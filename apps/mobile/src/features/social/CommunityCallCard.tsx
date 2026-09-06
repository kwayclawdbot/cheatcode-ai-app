import React from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { alpha, color, gradientAngle, radius } from '../../ui/tokens';
import { T, Num, Eyebrow } from '../../ui/Text';
import { TickerMark } from '../../ui/Ticker';
import { Avatar } from '../community/ui/Chrome';
import { PostBody } from '../community/ui/PostBody';
import { NOT_ADVICE_COMMUNITY_CALL } from '../legal/disclaimers';
import { BeltChip } from './BeltChip';
import { FollowButton } from './FollowButton';
import type { CommunityCall } from '../../lib/types';

/**
 * A CALL A MEMBER PUBLISHED. VOLT, AND NEVER MISTAKABLE FOR A HOUSE ALERT.
 *
 * ── THE COLOUR IS THE WHOLE POINT ───────────────────────────────────────
 * The palette grammar (docs/14) is not decoration: volt is the USER'S
 * authorship, violet is KAI'S intelligence. Kai's authorship block inside
 * `alerts/AlertCard.tsx` is a violet gradient with his orb sitting in it. This
 * is that block's mirror — the same geometry, the same weight, the volt half
 * of the pair, and the member's own avatar where the orb would be. Somebody
 * who has learned that violet means "Kai said this" gets the other half of the
 * lesson for free: volt means a person said it.
 *
 * ── AND WHAT IS NOT ON IT ───────────────────────────────────────────────
 * No grade. No score. No score bar. No medallion. Nothing graded this: a
 * member wrote it, and the app has no opinion about whether it is good. The
 * ungraded path already exists on the alert card (pass grade '—', score null,
 * no `scores`) and this card simply never draws those objects at all, which is
 * the same statement made by not making it.
 *
 * A LEVEL WITH NO NUMBER IS NOT DRAWN, for the same reason it is not drawn on
 * a house alert: a red box labelled "Stop" is read as a stop whatever is
 * printed inside it. Most member calls have no levels — that is exactly the
 * habit the composer's incentive line exists to change — and a card that
 * invented three empty cells to look complete would be lying about a risk plan
 * nobody wrote.
 *
 * The OUTCOME, once there is one, is a word and a percentage move. It is not a
 * grade wearing a different hat: "Hit target" is a fact about what the price
 * did, and it says nothing about whether the idea was any good.
 */

const DIRECTION_LABEL = { long: 'Long', short: 'Short' } as const;

function LevelCell({ label, value, c, bg, border, testID }: {
  label: string; value: string; c: string; bg: string; border: string; testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flex: 1, paddingVertical: 7, paddingHorizontal: 3, borderRadius: 10,
        backgroundColor: bg, borderWidth: 0.5, borderColor: border, alignItems: 'center',
      }}
    >
      <T size={8.5} c={color.muted}>{label}</T>
      <Num size={12} weight="semibold" c={c} style={{ marginTop: 2 }}>{value}</Num>
    </View>
  );
}

const price = (n: number | null): string | null =>
  n == null ? null : Number.isInteger(n) ? String(n) : n.toFixed(2);

/** Outcome tone. Green and red mean a financial result and only that. */
function outcomeTone(call: CommunityCall): string {
  if (call.status === 'target') return color.green;
  if (call.status === 'stop') return color.red;
  if (call.status === 'withdrawn') return color.muted;
  return color.gold;
}

export function CommunityCallCard({
  call, onFollowChanged, showFollow = false, onWithdraw, testID,
}: {
  call: CommunityCall;
  /** Draws the follow control in the author line. Off on your own cards. */
  showFollow?: boolean;
  onFollowChanged?: (following: boolean) => void;
  /** Present only on your OWN open call. Withdrawing is not deleting. */
  onWithdraw?: () => void;
  testID?: string;
}) {
  const router = useRouter();
  const entry = price(call.entry);
  const stop = price(call.stop);
  const target = price(call.target);
  const hasLevels = !!(entry || stop || target);
  const resolved = call.status !== 'open';
  const tone = outcomeTone(call);

  return (
    <LinearGradient
      testID={testID ?? `community-call-${call.id}`}
      colors={[alpha.volt10, alpha.surface65]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{
        borderRadius: radius.xxxl, borderWidth: 0.5, borderColor: alpha.volt50,
        padding: 15, gap: 11,
      }}
    >
      {/*
        THE AUTHORSHIP BLOCK — the volt mirror of Kai's violet one.
        The follow control sits INSIDE this block but OUTSIDE the name's own
        pressable: on web react-native renders accessibilityRole="button" as a
        real <button>, and one cannot contain another.
      */}
      <LinearGradient
        colors={[alpha.volt18, alpha.volt05]}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 9,
          paddingVertical: 9, paddingHorizontal: 11, borderRadius: 13,
          borderWidth: 0.5, borderColor: alpha.volt55,
        }}
        testID={`community-call-author-${call.id}`}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${call.author.display_name}'s profile`}
          onPress={() => router.push(`/contributor/${encodeURIComponent(call.author.user_id)}` as never)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Avatar initial={call.author.initial} url={call.author.avatar_url} size={30} />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Eyebrow c={color.volt}>COMMUNITY TRADE</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <T size={13} weight="bold" numberOfLines={1}>{call.author.display_name}</T>
            {call.author.handle ? (
              <T size={10.5} c={color.dim} testID={`call-handle-${call.id}`}>{`@${call.author.handle}`}</T>
            ) : null}
            <BeltChip belt={call.author.belt} testID={`call-belt-${call.id}`} />
            <T size={10} c={color.dim}>{call.time_label}</T>
          </View>
        </View>

        {showFollow ? (
          <FollowButton
            userId={call.author.user_id}
            compact
            onChanged={onFollowChanged}
            testID={`call-follow-${call.id}`}
          />
        ) : null}
      </LinearGradient>

      {/* The instrument. Never plain text — the mark, then the symbol. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TickerMark symbol={call.symbol} size={30} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${call.symbol}, open the ticker`}
          onPress={() => router.push(`/symbol/${encodeURIComponent(call.symbol)}` as never)}
          style={{ flex: 1, minWidth: 0 }}
          testID={`call-ticker-${call.id}`}
        >
          <T size={16} weight="bold">{call.symbol}</T>
          <T size={10} c={color.muted}>
            {DIRECTION_LABEL[call.direction]}
            {call.scoreable ? ' · counts toward their record' : ' · no levels, so it cannot score'}
          </T>
        </Pressable>

        {resolved ? (
          <View
            testID={`call-outcome-${call.id}`}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7,
              borderWidth: 0.5, borderColor: `${tone}66`,
            }}
          >
            <T size={10.5} weight="semibold" c={tone}>{call.outcome_label ?? call.status}</T>
            {call.result_pct != null ? (
              <Num size={10.5} weight="semibold" c={tone}>
                {`${call.result_pct > 0 ? '+' : ''}${call.result_pct.toFixed(1)}%`}
              </Num>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ONLY THE LEVELS THAT EXIST. Same colours as the house card, because a
          stop is a stop whoever wrote it: entry cyan, stop red, target green. */}
      {hasLevels ? (
        <View style={{ flexDirection: 'row', gap: 6 }} testID={`call-levels-${call.id}`}>
          {entry ? <LevelCell label="Entry" value={entry} c={color.cyan} bg={color.cyanTint} border={alpha.cyan40} testID={`call-entry-${call.id}`} /> : null}
          {stop ? <LevelCell label="Stop" value={stop} c={color.red} bg={color.redTint} border={alpha.red40} testID={`call-stop-${call.id}`} /> : null}
          {target ? <LevelCell label="Target" value={target} c={color.green} bg={color.greenTint} border={alpha.green40} testID={`call-target-${call.id}`} /> : null}
        </View>
      ) : null}

      {/* Their words, through the one parser, so a $cashtag is a cashtag. */}
      {call.thesis ? (
        <PostBody
          text={call.thesis}
          size={13}
          onTicker={(s) => router.push(`/symbol/${encodeURIComponent(s)}` as never)}
          testID={`call-thesis-${call.id}`}
        />
      ) : null}

      {onWithdraw && call.status === 'open' ? (
        <Pressable
          testID={`call-withdraw-${call.id}`}
          accessibilityRole="button"
          accessibilityLabel="Withdraw this call"
          accessibilityHint="It stays on your record, marked withdrawn."
          onPress={onWithdraw}
          style={({ pressed }) => ({
            alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center',
            paddingHorizontal: 12, borderRadius: radius.pill,
            borderWidth: 0.5, borderColor: alpha.ivory24, opacity: pressed ? 0.7 : 1,
          })}
        >
          <T size={11.5} weight="semibold" c={color.muted}>Withdraw</T>
        </Pressable>
      ) : null}

      <T size={10} c={color.dim} testID={`call-not-advice-${call.id}`}>
        {NOT_ADVICE_COMMUNITY_CALL}
      </T>
    </LinearGradient>
  );
}
