import React from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { alpha, color, gradientAngle, radius } from '../../ui/tokens';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ChevronDown, ChevronRight } from '../../ui/Icons';
import { CallChart } from './CallChart';
import { TickerMark } from '../../ui/Ticker';
import { Avatar } from '../community/ui/Chrome';
import { PostBody } from '../community/ui/PostBody';
import { NOT_ADVICE_COMMUNITY_CALL } from '../legal/disclaimers';
import { BeltChip } from './BeltChip';
import { beltEdgeGradient } from './belts';
import { MemberName } from './MemberName';
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
 * ── THE EDGE MOVED TO THE BELT, AND ONLY THE EDGE ───────────────────────
 * The card used to be outlined in volt at half strength, which said the same
 * sentence twice: the wash, the eyebrow and the authorship block were already
 * saying "a person wrote this". The hairline was the one part of the card with
 * nothing left to add, so it was the one part free to say something new — WHICH
 * person, by rank.
 *
 * Everything volt inside the card is untouched and must stay that way. The
 * background wash, the COMMUNITY TRADE eyebrow, the authorship block and every
 * control are still volt, so the card still reads as authored by a member
 * before anybody has looked at the border at all. A belt edge on its own would
 * not carry that: four of the five rungs are quiet dyed colours a reader is not
 * meant to decode at a glance, and a card whose only statement was a pale brown
 * hairline would be a card that has stopped saying who made it.
 *
 * The ring is a `LinearGradient` at every rung rather than a `borderColor`,
 * because the black belt's edge is metal — graphite to platinum across the
 * card's own diagonal — and the four dyed belts return their colour three
 * times, which renders as a flat hairline. One geometry, one code path, no
 * branch on rank: a border that only some cards had would be a second layout
 * to keep in step with the first. Its radius and its 0.5 are exactly what the
 * volt border was, so the card weighs the same on the page as it always did.
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
 *
 * ── TWO DENSITIES, ONE CARD ─────────────────────────────────────────────
 * A call is now a MESSAGE — it arrives in the room's conversation with a real
 * `seq`, which is what lets the existing five-second poll deliver it. So the
 * same card has to sit in a chat stream as well as on a profile, and `compact`
 * is that second density rather than a second component. One card means the
 * two cannot drift, which is exactly the drift that produced two different
 * `$TICKER` treatments before `PostBody` was extracted.
 *
 * What compact drops is the AUTHORSHIP BLOCK, and only that. In a room the
 * message row above the card already carries the avatar, the name, the handle
 * and the time; repeating them inside the card would say the member's name
 * twice in two different weights, three lines apart. What survives is the part
 * that carries the meaning — the volt gradient, the volt border, and the
 * COMMUNITY TRADE eyebrow — because those are what say "a person wrote this,
 * not Kai", and that sentence is the whole reason the card exists.
 */

const DIRECTION_LABEL = { long: 'Long', short: 'Short' } as const;

/**
 * WHICH CARDS ARE OPEN, FOR AS LONG AS THE APP IS RUNNING.
 *
 * A room's message list and the Community tab both recycle their rows, so a
 * card that is scrolled past and back is a NEW component with new state. Held
 * in `useState` alone, every chart somebody opened would shut itself the moment
 * it left the screen — which reads as the app throwing away what you asked for.
 * A module-level set survives the unmount and nothing else: it is not written
 * anywhere, and a reload starts with every card closed, which is the right
 * default for a list.
 */
const expanded = new Set<string>();

function LevelCell({ label, value, c, bg, border, compact, testID }: {
  label: string; value: string; c: string; bg: string; border: string;
  compact?: boolean; testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flex: 1, paddingVertical: compact ? 5 : 7, paddingHorizontal: 3,
        borderRadius: compact ? 8 : 10,
        backgroundColor: bg, borderWidth: 0.5, borderColor: border, alignItems: 'center',
      }}
    >
      <T size={8.5} c={color.muted}>{label}</T>
      <Num size={compact ? 11 : 12} weight="semibold" c={c} style={{ marginTop: compact ? 1 : 2 }}>
        {value}
      </Num>
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
  call, onFollowChanged, showFollow = false, onWithdraw, compact = false, testID,
}: {
  call: CommunityCall;
  /** Draws the follow control in the author line. Off on your own cards. */
  showFollow?: boolean;
  onFollowChanged?: (following: boolean) => void;
  /** Present only on your OWN open call. Withdrawing is not deleting. */
  onWithdraw?: () => void;
  /**
   * The chat density. The card loses its authorship block — the message row it
   * sits in already named the author — and tightens. It keeps the volt, the
   * border and the COMMUNITY TRADE eyebrow, because those are the card.
   */
  compact?: boolean;
  testID?: string;
}) {
  const router = useRouter();
  const entry = price(call.entry);
  const stop = price(call.stop);
  const target = price(call.target);
  const hasLevels = !!(entry || stop || target);
  const resolved = call.status !== 'open';
  const tone = outcomeTone(call);
  const [open, setOpen] = React.useState(() => expanded.has(call.id));

  const toggleChart = React.useCallback(() => {
    setOpen((was) => {
      const now = !was;
      if (now) expanded.add(call.id); else expanded.delete(call.id);
      return now;
    });
  }, [call.id]);

  /** The outcome, once there is one. Same object at both densities. */
  const outcome = resolved ? (
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
  ) : null;

  /**
   * THE EDGE IS THE AUTHOR'S BELT, drawn as a ring rather than a border.
   *
   * A `borderColor` cannot hold a gradient, and the black belt's edge has to be
   * one — see the note at the top of this file, and `beltEdgeGradient`. So the
   * hairline is a `LinearGradient` half a point thick with the card sitting
   * inside it. The outer radius is the radius the card has always had and the
   * inner one is that minus the ring's own width, which is what keeps the two
   * curves concentric instead of leaving a bright corner.
   *
   * THE CARD IS GIVEN THE PAGE GROUND TO SIT ON, and that line is doing real
   * work. The card's own wash is translucent — volt at 10% over surface at 65%
   * — so with the ring behind it the belt would come through the entire card
   * face at about a sixth strength. That is a FILL, which is the one thing a
   * belt colour is never allowed to be: a brown-tinted card reads as a state,
   * like a warning or a stale price, rather than as a rank. Painting the ground
   * under the wash composites the card exactly as it did when it sat directly
   * on the screen, so the belt is confined to the half point it is meant to own.
   *
   * THE RING'S testID IS `call-edge-…`, NOT `community-call-edge-…`, and that
   * is not a style choice. `proof-social-trading.mjs` selects the card with
   * `[data-testid^="community-call-"]` and takes `.first()`; this ring is the
   * card's ANCESTOR, so an id sharing that prefix would quietly hand every
   * existing assertion a different element than the one it was written
   * against. Those assertions would keep passing — descendant queries resolve
   * through the ring either way — while no longer being about the card.
   */
  const edgeRadius = compact ? radius.xxl : radius.xxxl;

  return (
    <LinearGradient
      testID={`call-edge-${call.id}`}
      colors={beltEdgeGradient(call.author.belt)}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{ borderRadius: edgeRadius, padding: 0.5 }}
    >
    <LinearGradient
      testID={testID ?? `community-call-${call.id}`}
      colors={[alpha.volt10, alpha.surface65]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{
        borderRadius: edgeRadius - 0.5,
        borderWidth: 0,
        backgroundColor: color.bg,
        padding: compact ? 11 : 15, gap: compact ? 8 : 11,
      }}
    >
      {/*
        IN CHAT, THE EYEBROW IS THE WHOLE AUTHORSHIP STATEMENT. The row above
        this card carries the avatar, the name, the handle and the time, so the
        block below would repeat every one of them. What cannot be dropped is
        the word: without COMMUNITY TRADE in volt, a bordered card in a stream
        of plain messages reads as something the house published.
      */}
      {compact ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Eyebrow c={color.volt}>COMMUNITY TRADE</Eyebrow>
          <View style={{ flex: 1 }} />
          {outcome}
        </View>
      ) : null}

      {/*
        THE AUTHORSHIP BLOCK — the volt mirror of Kai's violet one.
        The follow control sits INSIDE this block but OUTSIDE the name's own
        pressable: on web react-native renders accessibilityRole="button" as a
        real <button>, and one cannot contain another.
      */}
      {compact ? null : (
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
          {/*
            THE NAME IS THE DOOR, not just the avatar beside it. It was the
            avatar alone here, which is a rule nobody can learn: on the alerts
            board the name opened the profile, on this card it did nothing. The
            belt chip and the time ride along as the name's own suffix so they
            stay on one line with it and wrap together.
          */}
          <MemberName
            name={call.author.display_name}
            userId={call.author.user_id}
            belt={call.author.belt}
            handle={call.author.handle}
            showHandle
            size={13}
            handleSize={10.5}
            testID={`call-author-name-${call.id}`}
            suffix={
              <>
                <BeltChip belt={call.author.belt} testID={`call-belt-${call.id}`} />
                <T size={10} c={color.dim}>{call.time_label}</T>
              </>
            }
          />
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
      )}

      {/* The instrument. Never plain text — the mark, then the symbol. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 10 }}>
        <TickerMark symbol={call.symbol} size={compact ? 24 : 30} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${call.symbol}, open the ticker`}
          onPress={() => router.push(`/symbol/${encodeURIComponent(call.symbol)}` as never)}
          style={{ flex: 1, minWidth: 0 }}
          testID={`call-ticker-${call.id}`}
        >
          <T size={compact ? 14 : 16} weight="bold">{call.symbol}</T>
          <T size={10} c={color.muted}>
            {DIRECTION_LABEL[call.direction]}
            {call.scoreable ? ' · counts toward their record' : ' · no levels, so it cannot score'}
          </T>
        </Pressable>

        {/* At the chat density the outcome has already been drawn beside the
            eyebrow, where there is room for it. */}
        {compact ? null : outcome}
      </View>

      {/* ONLY THE LEVELS THAT EXIST. Same colours as the house card, because a
          stop is a stop whoever wrote it: entry cyan, stop red, target green. */}
      {hasLevels ? (
        <View style={{ flexDirection: 'row', gap: 6 }} testID={`call-levels-${call.id}`}>
          {entry ? <LevelCell label="Entry" value={entry} c={color.cyan} bg={color.cyanTint} border={alpha.cyan40} compact={compact} testID={`call-entry-${call.id}`} /> : null}
          {stop ? <LevelCell label="Stop" value={stop} c={color.red} bg={color.redTint} border={alpha.red40} compact={compact} testID={`call-stop-${call.id}`} /> : null}
          {target ? <LevelCell label="Target" value={target} c={color.green} bg={color.greenTint} border={alpha.green40} compact={compact} testID={`call-target-${call.id}`} /> : null}
        </View>
      ) : null}

      {/* Their words, through the one parser, so a $cashtag is a cashtag. */}
      {call.thesis ? (
        <PostBody
          text={call.thesis}
          size={compact ? 12.5 : 13}
          onTicker={(s) => router.push(`/symbol/${encodeURIComponent(s)}` as never)}
          testID={`call-thesis-${call.id}`}
        />
      ) : null}

      {/*
        THE CHART, ON REQUEST.

        It sits after the thesis because it is the evidence for the words, not
        the headline: the levels are already stated as cells above, and the
        chart is where you go to see what they were drawn against.

        NOTHING IS FETCHED UNTIL THIS OPENS. `CallChart` is mounted, not
        hidden, so a collapsed card issues no request and holds no chart — a
        room with twenty calls in it costs exactly as much to scroll as it did
        before this existed, and only the cards somebody actually asked about
        cost anything at all.
      */}
      <View style={{ gap: compact ? 8 : 11 }}>
        <Pressable
          testID={`call-chart-toggle-${call.id}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={
            open
              ? `Hide the ${call.symbol} chart`
              : hasLevels
                ? `Show the ${call.symbol} chart with this call's levels drawn on it`
                : `Show the ${call.symbol} chart`
          }
          onPress={toggleChart}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            alignSelf: 'flex-start', minHeight: 30,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <T size={11} weight="semibold" c={color.muted}>
            {open ? 'Hide chart' : 'Chart'}
          </T>
          {open
            ? <ChevronDown size={9} color={color.muted} />
            : <ChevronRight size={9} color={color.muted} />}
        </Pressable>

        {open ? (
          <CallChart call={call} compact={compact} testID={`call-chart-${call.id}`} />
        ) : null}
      </View>

      {/* Withdrawing belongs where you are reading your own record, not in the
          middle of somebody else's conversation. */}
      {!compact && onWithdraw && call.status === 'open' ? (
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

      {/* The one quiet line, at both densities. A card small enough to sit in a
          chat stream is not a card small enough to stop saying this. */}
      <T size={compact ? 9.5 : 10} c={color.dim} testID={`call-not-advice-${call.id}`}>
        {NOT_ADVICE_COMMUNITY_CALL}
      </T>
    </LinearGradient>
    </LinearGradient>
  );
}
