import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wash } from '../../../ui/Wash';
import { T, Eyebrow } from '../../../ui/Text';
import { ObjectCard } from '../../../ui/Panel';
import { Button } from '../../../ui/Button';
import { Toggle } from '../../../ui/Toggle';
import { family } from '../../../ui/fonts';
import { alpha, color, radius } from '../../../ui/tokens';
import { communityApi } from '../../../lib/community-api';
import { StackHeader } from '../../../features/community/ui/Chrome';
import { STRUCTURED_FIELDS, type Room, type StructuredIdea } from '../../../features/community/types';
import { fixtureRooms } from '../../../features/community/fixtures';
import { KaiDot } from '../../../features/community/ui/KaiDot';

/**
 * S84 structured composer.
 *
 * Two rules from 08 §7 and §10 are load-bearing here:
 *  1. Kai never publishes and never silently rewrites — it offers a draft and
 *     you press Accept or Keep mine. Post is always yours, always explicit.
 *  2. A structured trade idea requires a position disclosure before it posts.
 */

const EMPTY: StructuredIdea = {
  direction_thesis: '', entry_condition: '', invalidation: '',
  risk_size: '', target_horizon: '', evidence: [],
};

const EVIDENCE_OPTIONS = ['Chart attached', 'Relative volume', 'Catalyst / news', 'Comparable setup'];

function Field({
  label, value, placeholder, missing, onChange, testID,
}: {
  label: string; value: string; placeholder: string; missing: boolean;
  onChange: (v: string) => void; testID: string;
}) {
  return (
    <View style={{ paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: missing ? alpha.gold40 : alpha.ivory08 }}>
      <T size={11} c={missing ? color.gold : color.muted}>{label}{missing ? ' · missing' : ''}</T>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={color.dim}
        multiline
        style={{
          fontFamily: family.regular,
          fontSize: 14,
          lineHeight: 20,
          color: color.text,
          marginTop: 3,
          minHeight: 20,
          ...(({ outlineStyle: 'none' } as unknown) as object),
        }}
      />
    </View>
  );
}

export default function Compose() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = String(id ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [room, setRoom] = useState<Room | null>(fixtureRooms.find((r) => r.id === roomId) ?? null);
  const roomLabel = room ? (room.type === 'setup' ? room.name : `# ${room.name}`) : 'this room';

  // The composer is pushed straight from the room, so it looks the room up
  // itself rather than trusting a param that could be stale.
  useEffect(() => {
    let alive = true;
    communityApi.rooms().then(({ rooms }) => {
      const found = rooms.find((r) => r.id === roomId);
      if (alive && found) setRoom(found);
    });
    return () => { alive = false; };
  }, [roomId]);

  const [idea, setIdea] = useState<StructuredIdea>(EMPTY);
  const [holds, setHolds] = useState(false);
  const [disclosed, setDisclosed] = useState(false);
  const [assist, setAssist] = useState<{ feedback: string; draft: StructuredIdea } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof StructuredIdea, v: string) => setIdea((p) => ({ ...p, [k]: v }));

  const missing = useMemo(
    () => STRUCTURED_FIELDS.filter((f) => !idea[f.key].trim()).map((f) => f.label),
    [idea],
  );
  const symbol = useMemo(() => {
    const m = `${idea.direction_thesis} ${idea.entry_condition}`.match(/\b[A-Z]{2,5}\b/);
    return room?.setup?.symbol ?? (m ? m[0] : null);
  }, [idea, room]);

  const canPost = missing.length === 0 && disclosed && !posting;

  const askKai = async () => {
    setReviewing(true);
    setError(null);
    try {
      const r = await communityApi.structuredAssist(roomId, idea);
      if (r) { setAssist(r); setShowDraft(false); }
      else setError("Kai can't review drafts here yet. Your idea is untouched — you can still post it.");
    } catch (e: any) {
      setError(e?.message ?? "Kai can't review drafts right now. Your idea is untouched.");
    } finally {
      setReviewing(false);
    }
  };

  const post = async () => {
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      await communityApi.postMessage(roomId, {
        kind: 'text',
        body: idea.direction_thesis,
        structured_idea: idea,
        position_disclosure: {
          holds,
          symbol,
          label: holds ? `Holds ${symbol ?? 'this'}` : 'No position',
        },
        refs: symbol ? { symbol } : undefined,
      });
      router.back();
    } catch (e: any) {
      setError(e?.message ?? 'That did not post. Nothing was published.');
      setPosting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }} testID="screen-compose">
      <Wash variant="corner" />

      <StackHeader
        title={`New idea · ${roomLabel}`}
        onBack={() => router.back()}
        right={
          <Pressable
            testID="post-idea"
            accessibilityRole="button"
            accessibilityLabel="Post idea"
            accessibilityHint={
              missing.length ? `Still missing: ${missing.join(', ')}` :
              !disclosed ? 'Answer the position disclosure first' : undefined
            }
            accessibilityState={{ disabled: !canPost }}
            disabled={!canPost}
            onPress={post}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <T size={14} weight="bold" c={canPost ? color.volt : color.dim}>Post</T>
          </Pressable>
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 10, paddingBottom: Math.max(insets.bottom, 24) + 8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <ObjectCard r={radius.xl} style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
            {STRUCTURED_FIELDS.map((f) => (
              <Field
                key={f.key}
                testID={`field-${f.key}`}
                label={f.label}
                placeholder={f.placeholder}
                value={idea[f.key]}
                missing={!idea[f.key].trim()}
                onChange={(v) => set(f.key, v)}
              />
            ))}
            <View style={{ paddingVertical: 11 }}>
              <T size={11} c={color.muted}>Evidence</T>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {EVIDENCE_OPTIONS.map((e) => {
                  const on = idea.evidence.includes(e);
                  return (
                    <Pressable
                      key={e}
                      testID={`evidence-${e.replace(/\W+/g, '-').toLowerCase()}`}
                      accessibilityRole="button"
                      accessibilityLabel={e}
                      accessibilityState={{ selected: on }}
                      onPress={() => setIdea((p) => ({
                        ...p,
                        evidence: on ? p.evidence.filter((x) => x !== e) : [...p.evidence, e],
                      }))}
                      hitSlop={{ top: 8, bottom: 8 }}
                      style={{
                        paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7,
                        borderWidth: 0.5,
                        borderColor: on ? alpha.cyan40 : alpha.ivory24,
                        backgroundColor: on ? alpha.cyan07 : 'transparent',
                      }}
                    >
                      <T size={11} c={on ? color.cyan : color.muted}>{e}</T>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ObjectCard>

          {/* 08 §10 — required before a structured idea can post. */}
          <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }} testID="disclosure-block">
            <Eyebrow c={disclosed ? color.muted : color.gold}>
              POSITION DISCLOSURE {disclosed ? '' : '· REQUIRED'}
            </Eyebrow>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <T size={13} lh={19} style={{ flex: 1 }}>
                Do you currently hold {symbol ?? 'the thing you are writing about'}?
              </T>
              <Toggle
                testID="disclosure-toggle"
                value={holds}
                label={`I hold ${symbol ?? 'this'}`}
                onChange={(v) => { setHolds(v); setDisclosed(true); }}
              />
            </View>
            {disclosed ? (
              <T size={11} c={color.muted}>
                Your post will carry “{holds ? `Holds ${symbol ?? 'this'}` : 'No position'}”. Everyone reading it sees that.
              </T>
            ) : (
              <Pressable
                testID="disclosure-no-position"
                accessibilityRole="button"
                accessibilityLabel="I have no position"
                onPress={() => { setHolds(false); setDisclosed(true); }}
                hitSlop={{ top: 8, bottom: 8 }}
              >
                <T size={12} weight="semibold" c={color.volt}>I have no position →</T>
              </Pressable>
            )}
          </ObjectCard>

          {/* Kai's optional review. Nothing here changes the draft on its own. */}
          <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, gap: 9 }} testID="kai-review">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <KaiDot size={22} />
              <T size={12} weight="bold" c={color.violetLight}>Kai's feedback · optional</T>
            </View>

            {assist ? (
              <>
                <T size={13} lh={19}>{assist.feedback}</T>
                {showDraft ? (
                  <View style={{ gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: 'rgba(11,11,14,0.40)', borderWidth: 0.5, borderColor: alpha.ivory08 }}>
                    {STRUCTURED_FIELDS.map((f) => (
                      <View key={f.key} style={{ gap: 2 }}>
                        <T size={10} c={color.muted}>{f.label}</T>
                        <T size={13} lh={18}>{assist.draft[f.key]}</T>
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <Button
                        testID="assist-accept"
                        label="Use Kai's draft"
                        height={42}
                        style={{ flex: 1 }}
                        onPress={() => { setIdea({ ...assist.draft }); setShowDraft(false); }}
                      />
                      <Button
                        testID="assist-keep"
                        label="Keep mine"
                        kind="outline"
                        height={42}
                        style={{ flex: 1 }}
                        onPress={() => setShowDraft(false)}
                      />
                    </View>
                  </View>
                ) : (
                  <Button
                    testID="assist-review"
                    label="Review Kai's improved draft"
                    kind="kai"
                    height={38}
                    onPress={() => setShowDraft(true)}
                  />
                )}
              </>
            ) : (
              <>
                <T size={13} lh={19} c={color.muted}>
                  {missing.length
                    ? `Kai can look for gaps once you have written something. Still empty: ${missing.join(', ')}.`
                    : 'Kai can check this for missing risk, a vague entry, or a thesis that cannot be proven wrong.'}
                </T>
                <Button
                  testID="ask-kai-review"
                  label={reviewing ? 'Kai is reading…' : 'Ask Kai to review'}
                  kind="kai"
                  height={38}
                  loading={reviewing}
                  disabled={missing.length === STRUCTURED_FIELDS.length}
                  onPress={askKai}
                />
              </>
            )}

            <T size={10} c={color.muted}>Kai never publishes or rewrites without your approval.</T>
          </ObjectCard>

          {error ? (
            <ObjectCard tone="gold" r={radius.lg} style={{ padding: 12 }}>
              <T size={12} c={color.gold}>{error}</T>
            </ObjectCard>
          ) : null}

          {!canPost ? (
            <T size={11} c={color.muted}>
              {missing.length ? `Post opens when every field is filled. Still missing: ${missing.join(', ')}.` : 'Answer the position disclosure to post.'}
            </T>
          ) : null}

          {posting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={color.volt} />
              <T size={12} c={color.muted}>Posting…</T>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
