import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wash } from '../../ui/Wash';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { communityApi } from '../../lib/community-api';
import { useSession } from '../../lib/session';
import { Avatar, DisclosureChip, RoleChip, Sheet, SheetRow, StackHeader } from '../../features/community/ui/Chrome';
import { Flag, MuteGlyph } from '../../features/community/ui/Icons';
import {
  BeltChip, BeltProgress, CommunityCallCard, FollowButton, MemberName, SharedTradeRow, useContributorSocial,
  secondaryHandle,
} from '../../features/social';
import type { ContributorProfile } from '../../features/community/types';

/**
 * S85 contributor profile.
 *
 * ── WHAT CHANGED, AND WHY THE OLD HEADER COMMENT IS GONE ────────────────
 * This file used to say: "the artboard's Follow is volt and implies a follows
 * table — there isn't one, so this saves the contributor to a local list on
 * this device and says so." There is one now (migration 0038), so the deviation
 * is closed: the button is the real `FollowButton`, it writes
 * `POST /follows/:id`, and the AsyncStorage list, its key and its "saved on
 * this device" notice are deleted rather than left dormant.
 *
 * The other reversal is bigger and is the owner's, not this lane's. The screen
 * used to end with "No rankings, no leaderboards, no profit contests." The app
 * now has points, belts and a board, so that line was the screen contradicting
 * the product — and a footer that argues with the tab bar is worse than no
 * footer. What survives the reversal is the half that is still true and is
 * still enforced by the schema: OUTCOMES ONLY, and never dollar P/L. The new
 * lines say that, and nothing more.
 *
 * The feedback bars stay ivory rather than the artboard's volt, unchanged:
 * volt means "your action", and a rating other people gave is not one.
 *
 * ── THIS SCREEN IS ALSO YOUR OWN PROFILE ────────────────────────────────
 * It is the only place a member's published calls are drawn, so it is where a
 * member has to be able to go and look at their own. It used to be written as
 * if the person on it were always somebody else: the header said
 * "Contributor", it drew a Follow button pointed at you (the database refuses
 * that — `follows_not_self`, migration 0038 — so the button could only ever
 * fail), and it offered to mute and report you. Comparing the route's id
 * against the signed-in one fixes all three, and adds the one thing that was
 * missing: when it is your profile and you have published nothing, the calls
 * block says so out loud instead of rendering nothing, because somebody who
 * has just published and arrived here must never be left reading a gap.
 */

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '48%' }}>
      <Num size={18} weight="semibold">{value}</Num>
      <T size={11} c={color.muted} style={{ marginTop: 2 }}>{label}</T>
    </View>
  );
}

function FeedbackBar({ label, score, outOf }: { label: string; score: number; outOf: number }) {
  const pct = Math.max(0, Math.min(100, (score / outOf) * 100));
  return (
    <View
      accessibilityLabel={`${label}: ${score} out of ${outOf}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      <T size={12} c={color.muted} style={{ width: 76 }}>{label}</T>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: alpha.ivory08 }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: alpha.ivory25 }} />
      </View>
      <Num size={11} weight="medium">{score.toFixed(1)}</Num>
    </View>
  );
}

const roleTone = (label: string): 'gold' | 'kai' | 'green' | 'neutral' => {
  const l = label.toLowerCase();
  if (l.includes('verified')) return 'green';
  if (l.includes('educator') || l.includes('expert') || l.includes('moderator')) return 'gold';
  return 'neutral';
};

export default function Contributor() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const id = String(userId ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /**
   * Is this me? The comparison has to survive a missing session — signed out,
   * or the id not loaded yet — as "not me", because drawing somebody else's
   * screen for a moment is recoverable and hiding a Follow button that should
   * be there is not obvious to anybody.
   */
  const { session } = useSession();
  const isMe = !!id && id === session?.user?.id;

  const [profile, setProfile] = useState<ContributorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exampleData, setExampleData] = useState(false);

  /** The community half — follow state, record, belt, calls, shared trades. */
  const social = useContributorSocial(id);
  const record = social.data?.record ?? null;
  const author = social.data?.author ?? null;
  const follow = social.data?.follow ?? null;

  useEffect(() => {
    let alive = true;
    (async () => {
      const { profile: p, source } = await communityApi.contributor(id);
      if (!alive) return;
      setProfile(p);
      setExampleData(source === 'fixtures');
      // `p` is null when the service could not be reached — the screen's own
      // empty state says so rather than a fixture profile wearing a real name.
      setMuted(p?.muted ?? false);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id]);

  const handle = author?.handle ?? profile?.handle ?? null;
  const followers = follow?.follower_count ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }} testID="screen-contributor">
      <Wash variant="corner" />
      <StackHeader
        title={isMe ? 'Your profile' : 'Contributor'}
        onBack={() => router.back()}
        onRight={isMe ? undefined : () => setSheet(true)}
        rightLabel={isMe ? undefined : 'Contributor options'}
      />

      {loading || !profile ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.violet} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingTop: 14, gap: 12, paddingBottom: Math.max(insets.bottom, 24) }}
          showsVerticalScrollIndicator={false}
        >
          {exampleData ? (
            <ObjectCard tone="gold" r={radius.lg} style={{ padding: 12 }} testID="example-data">
              <T size={12} lh={17} c={color.gold}>
                Example profile. The contributor service isn't connected yet.
              </T>
            </ObjectCard>
          ) : null}

          {/*
            IDENTITY. The username is drawn here for the first time — it was
            never on this screen, which meant the one name a member is actually
            addressed by in a room was missing from their own profile.
            The follow control sits BESIDE the identity block, never inside a
            pressable, so web never nests one button in another.
          */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar
              initial={author?.initial ?? profile.initial}
              url={author?.avatar_url ?? null}
              size={60}
              tone={profile.role_labels.some((r) => roleTone(r) === 'gold') ? 'educator' : 'neutral'}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              {/* The belt ink, and deliberately NOT a door: you are already
                  standing on this profile, and a name that opens the screen it
                  is printed on is an affordance that does nothing. */}
              <MemberName
                name={profile.display_name}
                belt={author?.belt}
                stage={author?.stage}
                size={20}
                testID="contributor-name"
              />
              {secondaryHandle(profile.display_name, handle) ? (
                <T size={12.5} c={color.muted} testID="contributor-handle">
                  {secondaryHandle(profile.display_name, handle)}
                </T>
              ) : handle ? null : (
                <T size={12.5} c={color.dim} testID="contributor-handle">No username</T>
              )}
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {author ? <BeltChip belt={author.belt} testID="contributor-belt" /> : null}
                {followers != null ? (
                  <T size={11} c={color.muted} testID="contributor-followers">
                    <Num size={11} weight="semibold">{String(followers)}</Num>
                    {followers === 1 ? ' follower' : ' followers'}
                  </T>
                ) : null}
                {profile.verified_identity ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 0.5, borderColor: alpha.green40 }}>
                    <Check size={9} color={color.green} />
                    <T size={10} c={color.green}>Verified identity</T>
                  </View>
                ) : null}
                {profile.role_labels
                  .filter((r) => !/verified/i.test(r))
                  .map((r) => <RoleChip key={r} label={r} tone={roleTone(r)} />)}
              </View>
            </View>
          </View>

          {/* THE PRIMARY ACTION, up here where the identity is, because that
              is the question this screen answers first: do I want to see what
              this person publishes? On your own profile there is no such
              question and no such button — following yourself is not a thing
              the database will do. */}
          {isMe ? null : <FollowButton userId={id} initial={follow} testID="follow-contributor" />}

          {/* THE RECORD. Outcomes, and the ladder they add up to. */}
          {record ? (
            <>
              <Eyebrow c={color.volt}>RECORD</Eyebrow>
              <ObjectCard r={radius.xl} style={{ padding: 15, gap: 14 }} testID="contributor-record">
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    {record.accuracy != null ? (
                      <Num size={28} weight="bold" testID="record-accuracy">{`${record.accuracy}%`}</Num>
                    ) : (
                      <T size={22} c={color.dim} testID="record-accuracy">—</T>
                    )}
                    <T size={11} c={color.muted} style={{ marginTop: 2 }}>
                      {record.accuracy != null ? 'of resolved calls hit the target' : 'nothing has resolved yet'}
                    </T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Num size={18} weight="semibold" c={color.volt}>{String(record.points)}</Num>
                    <T size={11} c={color.muted}>points</T>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 18 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                    <Num size={13} weight="semibold" c={color.green}>{String(record.wins)}</Num>
                    <T size={11} c={color.muted}>hit target</T>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                    <Num size={13} weight="semibold" c={color.red}>{String(record.losses)}</Num>
                    <T size={11} c={color.muted}>stopped</T>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                    <Num size={13} weight="semibold">{String(record.resolved)}</Num>
                    <T size={11} c={color.muted}>resolved</T>
                  </View>
                </View>

                <View style={{ paddingTop: 12, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 }}>
                  <BeltProgress block={record.belt} testID="contributor-belt-progress" />
                </View>

                {/* WHY A SMALL SAMPLE IS SAID OUT LOUD. Four calls and three
                    wins is 75%, and printed beside a member with two hundred
                    it is a lie of arithmetic. The server flags it; the screen
                    prints the flag. */}
                {record.in_warmup ? (
                  <T size={11} lh={16} c={color.gold} testID="record-warmup">
                    Early days — too few resolved calls for this to mean much yet.
                  </T>
                ) : null}
              </ObjectCard>
            </>
          ) : null}

          {/* THEIR CALLS. The same card the feed draws, so a call read here is
              the call read there.

              ON YOUR OWN PROFILE THE EMPTY CASE IS SAID, NOT SKIPPED. This is
              where you are sent after publishing, and a heading that simply
              is not drawn looks exactly like a call that did not save. On
              somebody else's profile the block still disappears: "they have
              not published anything" is not news you came here for. The line
              is drawn only once the answer has arrived — while it is loading
              there is nothing honest to say about how many calls exist. */}
          {social.data?.calls.length ? (
            <>
              <Eyebrow c={color.volt}>PUBLISHED CALLS</Eyebrow>
              <View style={{ gap: 10 }} testID="contributor-calls">
                {social.data.calls.map((c) => <CommunityCallCard key={c.id} call={c} />)}
              </View>
            </>
          ) : isMe && social.data ? (
            <>
              <Eyebrow c={color.volt}>PUBLISHED CALLS</Eyebrow>
              <T size={12.5} lh={18.5} c={color.muted} testID="contributor-calls-empty">
                You have not published a call yet. When you do it lands here, and in the feed of
                everybody who follows you.
              </T>
            </>
          ) : null}

          {/* THEIR TRADES. Levels and outcomes; there is no size and no dollar
              anywhere in the type, so there is none to leak here. */}
          {social.data?.trades.length ? (
            <>
              <Eyebrow>TRADES</Eyebrow>
              <View style={{ gap: 8 }} testID="contributor-trades">
                {social.data.trades.map((t) => <SharedTradeRow key={t.id} trade={t} />)}
              </View>
              <T size={10} c={color.dim} style={{ marginTop: -4 }}>
                Trades they chose to show. Direction and levels only — never size, and never dollars.
              </T>
            </>
          ) : null}

          <Eyebrow>CONTRIBUTION HISTORY</Eyebrow>
          <ObjectCard r={radius.xl} style={{ padding: 14, flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 12 }}>
            {profile.history.map((h) => <StatCell key={h.label} label={h.label} value={h.value} />)}
          </ObjectCard>
          <T size={10} c={color.muted} style={{ marginTop: -6 }}>
            What they posted and disclosed. Outcomes only — never profit, and never account size.
          </T>

          {profile.feedback.length ? (
            <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }}>
              <Eyebrow>COMMUNITY FEEDBACK</Eyebrow>
              {profile.feedback.map((f) => (
                <FeedbackBar key={f.label} label={f.label} score={f.score} outOf={f.out_of} />
              ))}
              <T size={10} c={color.muted}>{profile.feedback_note}</T>
            </ObjectCard>
          ) : null}

          {profile.recent.length ? (
            <>
              <Eyebrow>RECENT POSTS · WITH DISCLOSURES</Eyebrow>
              <ObjectCard r={radius.xl} style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
                {profile.recent.map((m, i) => (
                  <View
                    key={m.id}
                    style={{
                      paddingVertical: 11,
                      borderBottomWidth: i === profile.recent.length - 1 ? 0 : 0.5,
                      borderBottomColor: alpha.ivory08,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <T size={11} c={color.muted}>#{m.room_name} · {m.time_label}</T>
                      {m.disclosure ? <DisclosureChip label={m.disclosure.label} holds={m.disclosure.holds} /> : null}
                    </View>
                    <T size={13} lh={19}>{m.body}</T>
                  </View>
                ))}
              </ObjectCard>
            </>
          ) : null}

          {notice ? (
            <ObjectCard r={radius.lg} style={{ padding: 12 }}>
              <T size={12} c={color.muted}>{notice}</T>
            </ObjectCard>
          ) : null}

          {/* Mute and report keep their places; Save and its device-local
              notice are gone with the follows table's arrival. Neither is
              offered on your own profile — muting yourself does nothing and
              reporting yourself sends a moderator a report about the person
              who filed it. */}
          {isMe ? null : (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2, justifyContent: 'flex-end' }}>
              <Pressable
                testID="mute-contributor"
                accessibilityRole="button"
                accessibilityLabel={muted ? 'Unmute contributor' : 'Mute contributor'}
                onPress={() => { setMuted(!muted); setNotice(!muted ? 'Muted. Their posts stay in the room, quietly.' : 'Unmuted.'); }}
                style={({ pressed }) => ({
                  width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                  borderWidth: 0.5, borderColor: muted ? alpha.gold50 : alpha.ivory24, opacity: pressed ? 0.8 : 1,
                })}
              >
                <MuteGlyph size={16} color={muted ? color.gold : color.muted} />
              </Pressable>
              <Pressable
                testID="report-contributor"
                accessibilityRole="button"
                accessibilityLabel="Report contributor"
                onPress={() => setSheet(true)}
                style={({ pressed }) => ({
                  width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                  borderWidth: 0.5, borderColor: alpha.red40, opacity: pressed ? 0.8 : 1,
                })}
              >
                <Flag size={16} />
              </Pressable>
            </View>
          )}

          <T size={10} lh={15} c={color.dim} testID="contributor-footer">
            Outcomes only. A call counts when it had an entry and a level to be wrong at — nothing here is
            profit, and no number on this screen is money.
          </T>
        </ScrollView>
      )}

      <Sheet
        testID="contributor-sheet"
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Report a problem"
        subtitle="A moderator reviews every report. Market claims are kept for the audit trail."
      >
        {['Spam or promotion', 'Unverified claim presented as fact', 'Undisclosed position', 'Harassment'].map((reason, i, all) => (
          <SheetRow
            key={reason}
            testID={`report-${reason.replace(/\W+/g, '-').toLowerCase()}`}
            tone="danger"
            label={reason}
            last={i === all.length - 1}
            onPress={async () => {
              setSheet(false);
              const first = profile?.recent[0]?.id;
              try {
                if (first) await communityApi.report(first, reason);
                setNotice('Reported. A moderator will look at it.');
              } catch {
                setNotice('That report did not send. Try again in a moment.');
              }
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}
