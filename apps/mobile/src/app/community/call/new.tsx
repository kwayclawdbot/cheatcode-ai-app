import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../../ui/Screen';
import { StackHeader } from '../../../ui/StackHeader';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { Segmented } from '../../../ui/Segmented';
import { T, Num, Eyebrow } from '../../../ui/Text';
import { TickerMark } from '../../../ui/Ticker';
import { family } from '../../../ui/fonts';
import { alpha, color, gradient, gradientAngle, radius } from '../../../ui/tokens';
import { CommunityCallCard, usePublishCall } from '../../../features/social';
import { NOT_ADVICE_COMMUNITY_CALL } from '../../../features/legal/disclaimers';
import type { CommunityCall, SocialDirection } from '../../../lib/types';

/**
 * PUBLISHING A CALL.
 *
 * ── THE INCENTIVE IS THE DESIGN PROBLEM ─────────────────────────────────
 * A thesis with no levels is a comment. A thesis with an entry and a stop or a
 * target is a call that can be measured, and only those earn points, move a
 * belt, or appear on the board (`scoreable`, generated in migration 0038). So
 * the screen has to make that visible without lecturing: ONE line under the
 * levels that changes as you type, from "this will not count" to "this counts"
 * the moment the second number lands. Nobody reads a paragraph about scoring
 * rules; everybody notices a sentence that changed while they were typing.
 *
 * ── THE PREVIEW IS THE REAL CARD ────────────────────────────────────────
 * What is drawn below the fields is `CommunityCallCard`, the same component
 * the feed uses, fed from what has been typed so far. Not a mock-up of it. A
 * preview that is a different object from the thing published is a preview
 * that eventually lies, and this one costs nothing because the card is already
 * built to render a call with no levels and no outcome.
 *
 * ── THE SERVER'S REFUSALS, IN SENTENCES ─────────────────────────────────
 * `stop_not_below_entry` is a constraint name. It goes in a log. What a person
 * gets is "On a long, the stop has to sit below the entry — that is what makes
 * it a stop." The same rule is checked here as you type, so in the ordinary
 * case the refusal never has to travel; the translation in `useSocial.ts` is
 * the backstop for everything this screen cannot see.
 */

const THESIS_MAX = 280;

const DIRECTIONS: { key: SocialDirection; label: string }[] = [
  { key: 'long', label: 'Long' },
  { key: 'short', label: 'Short' },
];

/** A price box. Empty is a real answer and stays null, never zero. */
function LevelField({
  label, value, onChange, tint, testID,
}: {
  label: string; value: string; onChange: (v: string) => void; tint: string; testID?: string;
}) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <T size={10.5} c={color.muted}>{label}</T>
      <View
        style={{
          height: 44, borderRadius: radius.lg, paddingHorizontal: 11, justifyContent: 'center',
          borderWidth: 0.5, borderColor: value ? `${tint}66` : alpha.ivory14,
          backgroundColor: alpha.ivory035,
        }}
      >
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^0-9.]/g, ''))}
          placeholder="—"
          placeholderTextColor={color.dim}
          keyboardType="decimal-pad"
          inputMode="decimal"
          style={{
            fontFamily: family.mono,
            fontSize: 15,
            color: value ? tint : color.text,
            paddingVertical: 0,
            ...(({ outlineStyle: 'none' } as unknown) as object),
          }}
        />
      </View>
    </View>
  );
}

const toNumber = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The same four rules the database enforces, checked while somebody types.
 * Returns the sentence a person should read, or null.
 */
function levelProblem(
  direction: SocialDirection, entry: number | null, stop: number | null, target: number | null,
): string | null {
  if (entry == null) return null;
  if (direction === 'long') {
    if (stop != null && stop >= entry) {
      return 'On a long, the stop has to sit below the entry — that is what makes it a stop.';
    }
    if (target != null && target <= entry) {
      return 'On a long, the target has to sit above the entry.';
    }
  } else {
    if (stop != null && stop <= entry) {
      return 'On a short, the stop has to sit above the entry — that is where the idea is wrong.';
    }
    if (target != null && target >= entry) {
      return 'On a short, the target has to sit below the entry.';
    }
  }
  return null;
}

export default function NewCommunityCall() {
  const router = useRouter();
  const params = useLocalSearchParams<{ symbol?: string }>();
  const [symbol, setSymbol] = useState(
    typeof params.symbol === 'string' ? params.symbol.toUpperCase() : '',
  );
  const [direction, setDirection] = useState<SocialDirection>('long');
  const [entryText, setEntryText] = useState('');
  const [stopText, setStopText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [thesis, setThesis] = useState('');
  const [done, setDone] = useState<CommunityCall | null>(null);

  const publisher = usePublishCall();

  const entry = toNumber(entryText);
  const stop = toNumber(stopText);
  const target = toNumber(targetText);
  const scoreable = entry != null && (stop != null || target != null);
  const problem = levelProblem(direction, entry, stop, target);

  const cleanSymbol = symbol.trim().toUpperCase();
  const ready = cleanSymbol.length >= 1 && cleanSymbol.length <= 10 && thesis.trim().length > 0 && !problem;

  /** The preview IS the card. Same component, same rules, no second design. */
  const preview: CommunityCall = useMemo(() => ({
    id: 'preview',
    author: {
      user_id: 'you', handle: null, display_name: 'You', avatar_url: null,
      initial: 'Y', belt: 'white',
    },
    symbol: cleanSymbol || '—',
    direction,
    entry,
    stop,
    target,
    thesis: thesis.trim(),
    scoreable,
    status: 'open',
    result_pct: null,
    outcome_label: 'Still open',
    published_at: new Date().toISOString(),
    time_label: 'now',
    resolved_at: null,
  }), [cleanSymbol, direction, entry, stop, target, thesis, scoreable]);

  const publish = async () => {
    const call = await publisher.publish({
      symbol: cleanSymbol,
      direction,
      entry,
      stop,
      target,
      thesis: thesis.trim(),
    });
    if (call) setDone(call);
  };

  return (
    <Screen variant="dome" layout="tab" testID="screen-community-call-new">
      <StackHeader title="Publish a call" subtitle="Your idea, with your name on it" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 14 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* THE INSTRUMENT. The mark appears the moment there is a symbol to
            draw one for — a ticker is never plain text, including here. */}
        <View style={{ gap: 7 }}>
          <T size={13} c={color.muted}>Ticker</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            {cleanSymbol ? (
              <TickerMark symbol={cleanSymbol} size={44} testID="composer-ticker-mark" />
            ) : (
              <View
                style={{
                  width: 44, height: 44, borderRadius: 13,
                  borderWidth: 0.5, borderColor: alpha.ivory12, backgroundColor: alpha.ivory035,
                }}
              />
            )}
            <LinearGradient
              colors={gradient.composer as unknown as readonly [string, string, ...string[]]}
              start={gradientAngle.start}
              end={gradientAngle.end}
              style={{
                flex: 1, height: 52, borderRadius: radius.pill, paddingHorizontal: 18,
                justifyContent: 'center', borderWidth: 0.5, borderColor: alpha.ivory20,
              }}
            >
              <TextInput
                testID="composer-symbol"
                accessibilityLabel="Ticker"
                value={symbol}
                onChangeText={(v) => setSymbol(v.replace(/[^A-Za-z.]/g, '').toUpperCase().slice(0, 10))}
                placeholder="META"
                placeholderTextColor={color.dim}
                autoCapitalize="characters"
                autoCorrect={false}
                style={{
                  fontFamily: family.bold,
                  fontSize: 17,
                  letterSpacing: 0.4,
                  color: color.text,
                  paddingVertical: 0,
                  ...(({ outlineStyle: 'none' } as unknown) as object),
                }}
              />
            </LinearGradient>
          </View>
        </View>

        <View style={{ gap: 7 }}>
          <T size={13} c={color.muted}>Direction</T>
          <Segmented
            options={DIRECTIONS}
            value={direction}
            onChange={setDirection}
            testID="composer-direction"
          />
        </View>

        {/* THE LEVELS, AND THE ONE LINE THAT SAYS WHY THEY MATTER. */}
        <View style={{ gap: 9 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T size={13} c={color.muted} style={{ flex: 1 }}>Levels</T>
            <T size={11} c={color.dim}>optional</T>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <LevelField label="Entry" value={entryText} onChange={setEntryText} tint={color.cyan} testID="composer-entry" />
            <LevelField label="Stop" value={stopText} onChange={setStopText} tint={color.red} testID="composer-stop" />
            <LevelField label="Target" value={targetText} onChange={setTargetText} tint={color.green} testID="composer-target" />
          </View>

          {/*
            THE INCENTIVE. One line, and it changes while you type — which is
            the whole reason it works. It is not a rule box and it does not
            explain the points system; the leaderboard does that.
          */}
          <View
            testID="composer-scoreable"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: 9, paddingHorizontal: 12, borderRadius: radius.lg,
              borderWidth: 0.5,
              borderColor: scoreable ? alpha.volt50 : alpha.ivory12,
              backgroundColor: scoreable ? alpha.volt08 : 'transparent',
            }}
          >
            <View
              style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: scoreable ? color.volt : color.dim,
              }}
            />
            <T size={12} lh={17} c={scoreable ? color.volt : color.muted} style={{ flex: 1 }}>
              {scoreable
                ? 'This one counts. It can score, move your belt and reach the board.'
                : 'An entry plus a stop or a target is what makes a call count. Without them it is a comment.'}
            </T>
          </View>

          {problem ? (
            <T size={12} lh={17} c={color.red} testID="composer-level-error">{problem}</T>
          ) : null}
        </View>

        {/* THE THESIS. One line is the format — the box is short on purpose. */}
        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T size={13} c={color.muted} style={{ flex: 1 }}>Why</T>
            <Num
              size={11}
              c={thesis.length > THESIS_MAX - 30 ? color.gold : color.dim}
              testID="composer-counter"
            >
              {`${thesis.length}/${THESIS_MAX}`}
            </Num>
          </View>
          <LinearGradient
            colors={gradient.composer as unknown as readonly [string, string, ...string[]]}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={{
              borderRadius: radius.xxl, borderWidth: 0.5, borderColor: alpha.ivory20,
              paddingHorizontal: 16, paddingVertical: 13,
            }}
          >
            <TextInput
              testID="composer-thesis"
              accessibilityLabel="Why you are taking this trade"
              value={thesis}
              onChangeText={(v) => setThesis(v.slice(0, THESIS_MAX))}
              placeholder="Held 480 three times and just reclaimed VWAP. I want the 504 break on volume."
              placeholderTextColor={color.dim}
              multiline
              numberOfLines={3}
              style={{
                fontFamily: family.regular,
                fontSize: 15,
                lineHeight: 22,
                color: color.text,
                minHeight: 62,
                textAlignVertical: 'top',
                ...(({ outlineStyle: 'none' } as unknown) as object),
              }}
            />
          </LinearGradient>
          <T size={11} c={color.dim}>
            A $TICKER in your sentence becomes a link. {NOT_ADVICE_COMMUNITY_CALL}
          </T>
        </View>

        {/* WHAT THE ROOM WILL SEE. The card itself, not a picture of it. */}
        <Eyebrow c={color.volt}>WHAT THE ROOM WILL SEE</Eyebrow>
        <View pointerEvents="none" testID="composer-preview">
          <CommunityCallCard call={preview} testID="community-call-preview" />
        </View>

        {publisher.error ? (
          <T size={12.5} lh={18} c={color.red} testID="composer-publish-error">{publisher.error}</T>
        ) : null}

        <Button
          testID="composer-publish"
          label="Publish it"
          kind="volt"
          height={52}
          disabled={!ready}
          loading={publisher.busy}
          onPress={publish}
          accessibilityHint="Puts this call in the club with your name on it. It stays on your record."
        />

        <Pressable
          testID="composer-cancel"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => router.back()}
          style={({ pressed }) => ({ minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <T size={13} c={color.muted}>Cancel</T>
        </Pressable>
      </ScrollView>

      <Sheet
        visible={!!done}
        onClose={() => { setDone(null); router.replace('/community?feed=following'); }}
        title="Published"
        testID="sheet-call-published"
      >
        <T size={13} lh={20} c={color.muted}>
          {done?.scoreable
            ? 'It is in the club, and it counts. It resolves when price reaches your stop or your target.'
            : 'It is in the club. Without an entry and a stop or a target it will not score — you can publish another with levels any time.'}
        </T>
        <Button
          label="Back to the club"
          kind="volt"
          height={48}
          onPress={() => { setDone(null); router.replace('/community?feed=following'); }}
        />
      </Sheet>
    </Screen>
  );
}
