import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wash } from '../../ui/Wash';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { communityApi } from '../../lib/community-api';
import { Avatar, DisclosureChip, RoleChip, Sheet, SheetRow, StackHeader } from '../../features/community/ui/Chrome';
import { Flag, MuteGlyph } from '../../features/community/ui/Icons';
import type { ContributorProfile } from '../../features/community/types';

/**
 * S85 contributor profile.
 *
 * 08 §8 is the whole brief for this screen: evidence-based context, never
 * points, streaks, leaderboards or profit contests. There is no rank on this
 * screen and no P/L anywhere — the counts describe behaviour (did they say what
 * would prove them wrong, did they disclose the outcome), not performance.
 *
 * DEVIATIONS: the artboard's "Follow" is volt and implies a follows table —
 * there isn't one, so this saves the contributor to a local list on this device
 * and says so. The feedback bars are ivory rather than the artboard's volt,
 * because volt means "your action" and a rating other people gave is not one.
 */

const SAVED_KEY = 'cc.saved_contributors.v1';

async function readSaved(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

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

  const [profile, setProfile] = useState<ContributorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exampleData, setExampleData] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ profile: p, source }, list] = await Promise.all([communityApi.contributor(id), readSaved()]);
      if (!alive) return;
      setProfile(p);
      setExampleData(communityApi.available() && source === 'fixtures');
      setMuted(p.muted);
      setSaved(list.includes(id));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id]);

  const toggleSave = useCallback(async () => {
    const list = await readSaved();
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
    setSaved(next.includes(id));
    setNotice(next.includes(id)
      ? 'Saved on this device. Following across devices arrives with the next release.'
      : 'Removed from your saved list.');
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }} testID="screen-contributor">
      <Wash variant="corner" />
      <StackHeader
        title="Contributor"
        onBack={() => router.back()}
        onRight={() => setSheet(true)}
        rightLabel="Contributor options"
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar
              initial={profile.initial}
              size={60}
              tone={profile.role_labels.some((r) => roleTone(r) === 'gold') ? 'educator' : 'neutral'}
            />
            <View style={{ flex: 1 }}>
              <T size={20} weight="bold">{profile.display_name}</T>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
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

          <ObjectCard r={radius.xl} style={{ padding: 14, flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 12 }}>
            {profile.history.map((h) => <StatCell key={h.label} label={h.label} value={h.value} />)}
          </ObjectCard>
          <T size={10} c={color.muted} style={{ marginTop: -6 }}>
            Contribution history — what they posted and disclosed. Not a rank, and never profit.
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

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <Button
              testID="save-contributor"
              label={saved ? 'Saved' : 'Save'}
              accessibilityHint="Keeps this contributor on a list stored on this device."
              height={44}
              style={{ flex: 1 }}
              onPress={toggleSave}
            />
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

          <T size={10} lh={15} c={color.dim}>
            No rankings, no leaderboards, no profit contests. What you see is what they wrote and what they disclosed.
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
