import React, { useMemo, useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { T, Eyebrow, Num } from '../../../ui/Text';
import { Button } from '../../../ui/Button';
import { ObjectCard } from '../../../ui/Panel';
import { KaiOrb } from '../../../ui/KaiOrb';
import { Ticker } from '../../../ui/Ticker';
import { Check, Lock } from '../../../ui/Icons';
import { family } from '../../../ui/fonts';
import { alpha, color, radius } from '../../../ui/tokens';
import type {
  AuctionScreen,
  CompetencySignal,
  CompletionScreen,
  ConceptScreen,
  ConceptVisual,
  CuratedVideo,
  KaiCheckScreen,
  LessonScreen,
  MarketApplicationScreen,
  MasteryChallengeScreen,
  OpeningScreen,
  QuizScreen,
  SortingScreen,
  VideoScreen,
} from '../types';

/**
 * THE SCREEN LIBRARY.
 * ===========================================================================
 *
 * One component per implemented screen type. Every one of them takes typed
 * content and two callbacks and holds NO lesson-specific text — the strings in
 * a lesson live in `content/*.ts`, which is what makes Days 2–7 authoring work
 * rather than engineering work.
 *
 * Palette grammar is load-bearing here and is not decorative:
 *   volt   the member acted (their selection, their answer, their progress)
 *   violet Kai spoke
 *   cyan   market data (a ticker, a price, a book)
 *   green  the buy side / a correct answer · red the sell side / a wrong one
 *
 * Every number a member reads goes through `Num`, which is the app's mono +
 * tabular face. That is not a style preference: a price set in the text face
 * is a number you cannot line up against the one below it.
 */

/* ─────────────────────────────── shared shell ───────────────────────────── */

export type ScreenReport = {
  /** What this screen measured, if it measured anything. */
  scored?: { correct: number; total: number };
  /** Signals this screen is able to report. */
  competencies?: Record<string, CompetencySignal>;
  /**
   * Set only by a screen that IS the assessment, and only with the verdict
   * against its own pass mark. Scoring and passing are different facts — a
   * quiz screen scores, an assessment screen decides — and the anti-farming
   * rule in `xp.ts` pays out on the second one.
   */
  assessment?: { passed: boolean; scorePct: number };
};

export type ScreenProps<S extends LessonScreen> = {
  screen: S;
  onAdvance: (report?: ScreenReport) => void;
};

/** The outer container every screen shares — carries its Playwright handle. */
function Frame({
  type,
  children,
}: {
  type: LessonScreen['type'];
  children: React.ReactNode;
}) {
  return (
    <View testID={`training-screen-${type}`} style={{ gap: 14 }}>
      {children}
    </View>
  );
}

/** The primary advance control. One per screen, always this testID. */
function Advance({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return <Button testID="training-next" label={label} arrow onPress={onPress} disabled={disabled} />;
}

function Body({ lines }: { lines: string[] }) {
  return (
    <View style={{ gap: 10 }}>
      {lines.map((line, i) => (
        <T key={i} size={14} lh={22} c={color.muted}>{line}</T>
      ))}
    </View>
  );
}

/** The one sentence the member must not miss. */
function KeyLine({ children }: { children: string }) {
  return (
    <View
      style={{
        borderLeftWidth: 2,
        borderLeftColor: color.volt,
        paddingLeft: 12,
        paddingVertical: 2,
      }}
    >
      <T size={14.5} weight="semibold" lh={22}>{children}</T>
    </View>
  );
}

/** Kai's aside. Violet and attributed, so it is never mistaken for narration. */
function KaiNote({ children }: { children: string }) {
  return (
    <ObjectCard tone="kai" r={radius.xl} style={{ padding: 13, gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <KaiOrb size={16} glow={false} />
        <Eyebrow c={color.violetLight}>KAI</Eyebrow>
      </View>
      <T size={13} lh={20} c={color.text}>{children}</T>
    </ObjectCard>
  );
}

/* ───────────────────────────── concept visuals ──────────────────────────── */

function ShareGrid({ v }: { v: Extract<ConceptVisual, { kind: 'share_grid' }> }) {
  const cells = v.columns * v.rows;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {Array.from({ length: cells }).map((_, i) => {
          const on = i === v.highlightIndex;
          return (
            <View
              key={i}
              style={{
                // Fixed squares that wrap, not percentage columns: a
                // percentage width plus a gap overflows the row and silently
                // drops a column, which would make "1,000,000 shares" render
                // as a ragged block.
                width: 22,
                height: 22,
                borderRadius: radius.xs,
                borderWidth: on ? 1 : 0.5,
                borderColor: on ? color.volt : alpha.ivory12,
                backgroundColor: on ? alpha.volt20 : alpha.ivory04,
              }}
            />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T size={11} c={color.dim} style={{ flex: 1 }}>{v.totalLabel}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              borderWidth: 1,
              borderColor: color.volt,
              backgroundColor: alpha.volt20,
            }}
          />
          <T size={11} weight="semibold" c={color.volt}>{v.highlightLabel}</T>
        </View>
      </View>
    </View>
  );
}

function FlowVisual({ v }: { v: Extract<ConceptVisual, { kind: 'flow' }> }) {
  return (
    <View style={{ gap: 8 }}>
      {v.steps.map((s, i) => (
        <View key={s.label} style={{ gap: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 11,
              paddingHorizontal: 13,
              borderRadius: radius.lg,
              borderWidth: 0.5,
              borderColor: alpha.ivory12,
              backgroundColor: alpha.ivory04,
            }}
          >
            <Num size={11} weight="bold" c={color.dim}>{`0${i + 1}`}</Num>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={12.5} weight="bold" ls={0.5}>{s.label}</T>
              {s.detail ? (
                <T size={11.5} c={color.muted} style={{ marginTop: 2 }}>{s.detail}</T>
              ) : null}
            </View>
          </View>
          {i < v.steps.length - 1 ? (
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 1, height: 10, backgroundColor: alpha.ivory20 }} />
            </View>
          ) : null}
        </View>
      ))}
      {v.note ? <T size={11.5} lh={18} c={color.dim}>{v.note}</T> : null}
    </View>
  );
}

function CardsVisual({ v }: { v: Extract<ConceptVisual, { kind: 'cards' }> }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {v.cards.map((c) => (
        <ObjectCard key={c.label} r={radius.lg} style={{ flexGrow: 1, flexBasis: '45%', padding: 12, gap: 6 }}>
          <T size={12} weight="bold">{c.label}</T>
          <T size={11.5} lh={17} c={color.muted}>{c.text}</T>
        </ObjectCard>
      ))}
    </View>
  );
}

function SplitVisual({ v }: { v: Extract<ConceptVisual, { kind: 'split' }> }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {[v.left, v.right].map((side) => (
        <ObjectCard key={side.title} r={radius.lg} style={{ flex: 1, padding: 12, gap: 8 }}>
          <View style={{ gap: 2 }}>
            <T size={12} weight="bold" ls={0.6}>{side.title}</T>
            <T size={10.5} c={color.dim}>{side.caption}</T>
          </View>
          <View style={{ gap: 7 }}>
            {side.lines.map((line) => (
              <T key={line} size={11.5} lh={16} c={color.muted}>{line}</T>
            ))}
          </View>
        </ObjectCard>
      ))}
    </View>
  );
}

function FormulaVisual({ v }: { v: Extract<ConceptVisual, { kind: 'formula' }> }) {
  return (
    <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }}>
      <T size={11} weight="bold" c={color.muted} ls={0.8}>{v.lhs.toUpperCase()}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {v.terms.map((term, i) => (
          <React.Fragment key={term}>
            {i > 0 ? <Num size={14} weight="bold" c={color.dim}>×</Num> : null}
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: radius.sm,
                backgroundColor: alpha.cyan10,
                borderWidth: 0.5,
                borderColor: alpha.cyan14,
              }}
            >
              <T size={12} weight="semibold" c={color.cyan}>{term}</T>
            </View>
          </React.Fragment>
        ))}
        <Num size={14} weight="bold" c={color.dim}>=</Num>
        <T size={12} weight="semibold" style={{ flexShrink: 1 }}>{v.result}</T>
      </View>
      {v.note ? <T size={11.5} lh={17} c={color.dim}>{v.note}</T> : null}
    </ObjectCard>
  );
}

function Visual({ v }: { v: ConceptVisual }) {
  switch (v.kind) {
    case 'share_grid': return <ShareGrid v={v} />;
    case 'flow': return <FlowVisual v={v} />;
    case 'cards': return <CardsVisual v={v} />;
    case 'split': return <SplitVisual v={v} />;
    case 'formula': return <FormulaVisual v={v} />;
  }
}

/* ───────────────────────────────── 1 opening ────────────────────────────── */

export function OpeningView({ screen, onAdvance }: ScreenProps<OpeningScreen>) {
  return (
    <Frame type="opening">
      <Eyebrow c={color.volt}>{screen.eyebrow}</Eyebrow>
      <T size={28} weight="bold" lh={33} ls={-0.4}>{screen.title}</T>
      {screen.image ? (
        <Image
          source={screen.image}
          style={{ width: '100%', height: 190, borderRadius: radius.xl, backgroundColor: color.surface3 }}
          contentFit="cover"
        />
      ) : null}
      <Body lines={screen.body} />
      <Advance label={screen.cta ?? 'Start Lesson'} onPress={() => onAdvance()} />
    </Frame>
  );
}

/* ───────────────────────────────── 2 concept ────────────────────────────── */

export function ConceptView({ screen, onAdvance }: ScreenProps<ConceptScreen>) {
  return (
    <Frame type="concept">
      <Eyebrow c={color.volt}>{screen.eyebrow}</Eyebrow>
      <T size={23} weight="bold" lh={28} ls={-0.3}>{screen.title}</T>
      <Body lines={screen.body} />
      {screen.visual ? <Visual v={screen.visual} /> : null}
      {screen.keyLine ? <KeyLine>{screen.keyLine}</KeyLine> : null}
      {screen.kaiNote ? <KaiNote>{screen.kaiNote}</KaiNote> : null}
      <Advance label={screen.cta ?? 'Continue'} onPress={() => onAdvance()} />
    </Frame>
  );
}

/* ────────────────────────────────── 3 quiz ─────────────────────────────── */

/** One selectable answer. Volt when the member picked it; green/red once judged. */
function Option({
  option,
  state,
  onPress,
  disabled,
}: {
  option: { id: string; label: string };
  state: 'idle' | 'chosen' | 'right' | 'wrong' | 'reveal';
  onPress: () => void;
  disabled: boolean;
}) {
  const skin =
    state === 'right'
      ? { borderColor: color.green, backgroundColor: alpha.green12, fg: color.green, w: 1 }
      : state === 'wrong'
      ? { borderColor: color.red, backgroundColor: alpha.red10, fg: color.red, w: 1 }
      : state === 'reveal'
      ? { borderColor: alpha.green40, backgroundColor: alpha.green12, fg: color.green, w: 0.5 }
      : state === 'chosen'
      ? { borderColor: color.volt, backgroundColor: alpha.volt08, fg: color.volt, w: 1 }
      : { borderColor: alpha.ivory20, backgroundColor: color.surface3, fg: color.text, w: 0.5 };

  return (
    <Pressable
      testID={`training-quiz-option-${option.id}`}
      accessibilityRole="button"
      accessibilityLabel={option.label}
      accessibilityState={{ selected: state !== 'idle', disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        justifyContent: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: radius.xl,
        borderWidth: skin.w,
        borderColor: skin.borderColor,
        backgroundColor: skin.backgroundColor,
        opacity: pressed && !disabled ? 0.82 : 1,
      })}
    >
      <T size={13.5} lh={19} weight={state === 'idle' ? 'regular' : 'semibold'} c={skin.fg}>
        {option.label}
      </T>
    </Pressable>
  );
}

/**
 * ONE TAP, THEN THE TEACHING.
 *
 * Picking an option judges it there and then — a "Check Answer" button in
 * front of a single-choice question is a tap that carries no information.
 *
 * A WRONG ANSWER DOES NOT LOCK THE SCREEN. The teaching text appears, the
 * right option is shown, and the member may either try again or carry on. This
 * is a course, not an exam: holding somebody on a question until they guess
 * right teaches guessing. What it costs them is the signal — a question never
 * answered correctly reports `developing`, which is exactly what it is, and
 * the mastery challenge at the end of the lesson is where the measurement that
 * counts happens.
 */
export function QuizView({ screen, onAdvance }: ScreenProps<QuizScreen>) {
  const [picked, setPicked] = useState<string | null>(null);
  const [judged, setJudged] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const correct = judged && picked === screen.correctId;

  const choose = (id: string) => {
    setPicked(id);
    setAttempts((n) => n + 1);
    setJudged(true);
  };

  const advance = () => {
    const signal: CompetencySignal = !correct
      ? 'developing'
      : attempts <= 1
      ? 'mastered'
      : 'strong';
    onAdvance({
      scored: { correct: correct ? 1 : 0, total: 1 },
      competencies: screen.competency ? { [screen.competency.key]: signal } : undefined,
    });
  };

  return (
    <Frame type="quiz">
      <Eyebrow c={color.volt}>{screen.eyebrow}</Eyebrow>
      {screen.title ? <T size={23} weight="bold" lh={28} ls={-0.3}>{screen.title}</T> : null}
      {screen.body ? <Body lines={screen.body} /> : null}
      {screen.visual ? <Visual v={screen.visual} /> : null}
      {screen.keyLine ? <KeyLine>{screen.keyLine}</KeyLine> : null}

      <T size={15} weight="semibold" lh={22}>{screen.prompt}</T>

      <View style={{ gap: 9 }}>
        {screen.options.map((o) => {
          const state =
            !judged
              ? picked === o.id ? 'chosen' : 'idle'
              : o.id === picked
              ? o.id === screen.correctId ? 'right' : 'wrong'
              : correct
              ? 'idle'
              : o.id === screen.correctId ? 'reveal' : 'idle';
          return (
            <Option
              key={o.id}
              option={o}
              state={state as 'idle' | 'chosen' | 'right' | 'wrong' | 'reveal'}
              disabled={correct}
              onPress={() => { if (!correct) choose(o.id); }}
            />
          );
        })}
      </View>

      {judged ? (
        <ObjectCard
          tone={correct ? 'volt' : 'default'}
          r={radius.xl}
          style={{ padding: 13, gap: 7 }}
        >
          <T size={11} weight="bold" c={correct ? color.green : color.gold} ls={0.8}>
            {correct ? 'CORRECT' : 'NOT QUITE'}
          </T>
          <T size={13} lh={20} c={color.text}>
            {correct ? screen.whenCorrect : screen.whenWrong}
          </T>
        </ObjectCard>
      ) : null}

      {judged && correct && screen.kaiNote ? <KaiNote>{screen.kaiNote}</KaiNote> : null}

      <Advance label={screen.cta ?? 'Continue'} onPress={advance} disabled={!judged} />
    </Frame>
  );
}

/* ────────────────────────────────── 4 video ────────────────────────────── */

/**
 * THE HUMAN VIDEO, HONESTLY.
 *
 * The script for this breakdown exists; the footage does not. The two obvious
 * ways to render that are both lies — a play button that does nothing tells
 * the member the app is broken, and a spinner tells them it is loading. So the
 * card is drawn as what it is: a production card for a piece that is being
 * filmed, with the outline of what it will cover printed on it, and the
 * summary card that follows it carrying the actual teaching. The lesson does
 * not depend on the video, which is the point.
 */
/** `4:12` / `1:04:30` → seconds, for the `?t=` deep link. */
export function segmentSeconds(stamp: string): number | null {
  const parts = stamp.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.length === 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1];
}

/** The watch URL with the assigned start time on it. */
export function segmentUrl(v: CuratedVideo): string {
  const t = segmentSeconds(v.segment_start);
  if (t === null) return v.youtube_url;
  const join = v.youtube_url.includes('?') ? '&' : '?';
  return `${v.youtube_url}${join}t=${t}s`;
}

/**
 * THE ASSIGNED SEGMENT.
 *
 * The member is never "sent to YouTube": they are given a section of a specific
 * video, told what to watch for, and told afterwards how the words in it map
 * onto ours. So the card leads with the segment, not the platform, and Kai's
 * normalisation note sits on it before the member leaves rather than after they
 * come back — which is the only ordering that actually prevents an instructor's
 * vocabulary from taking root.
 *
 * WHAT V1 DOES NOT DO. It does not play the video in the app. Nothing in the
 * Expo SDK plays a YouTube URL: `expo-video` handles files and streams we host,
 * and YouTube's terms require their player, which on native means embedding
 * `react-native-youtube-iframe` on top of `react-native-webview`. That is a
 * dependency, an Expo Go compatibility question and an autoplay/inline-policy
 * question per platform, and none of it is needed to teach the lesson. Cutting
 * playback at the segment END is the part that genuinely needs the player —
 * only its progress callback can stop at 10:35 — so until that lands, the end
 * timestamp is an instruction to the member rather than something enforced.
 *
 * AND IT DOES NOT LINK OUT UNTIL A PERSON SAYS SO. `owner_approved` is false
 * on every pick this curriculum has not had signed off, and an unapproved card
 * renders as what it is: a candidate under review, with its reasoning shown and
 * no way to launch it. The lesson still teaches — the summary card below the
 * video carries the concept — which is the property that makes the whole
 * curated layer safe to build before a single video is approved.
 */
function CuratedSegmentCard({ video }: { video: CuratedVideo }) {
  const approved = video.owner_approved;
  const unverified = video.segment_needs_review === true;

  const open = (url: string) => {
    Linking.openURL(url).catch(() => {
      /* No browser, or a malformed URL. Nothing to recover — the lesson does
         not depend on the video, so failing quietly is the honest outcome. */
    });
  };

  return (
    <ObjectCard r={radius.xl} style={{ padding: 14, gap: 11 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            paddingHorizontal: 9,
            paddingVertical: 5,
            borderRadius: radius.pill,
            borderWidth: 0.5,
            borderColor: approved ? alpha.gold40 : alpha.ivory16,
            backgroundColor: approved ? alpha.gold12 : 'transparent',
          }}
        >
          <T size={9.5} weight="bold" c={approved ? color.gold : color.dim} ls={0.8}>
            {approved ? 'ASSIGNED SEGMENT' : 'AWAITING REVIEW'}
          </T>
        </View>
        <T size={10.5} c={color.dim} style={{ flex: 1 }} numberOfLines={1}>
          {video.channel}
        </T>
      </View>

      <T size={14} weight="semibold" lh={20}>{video.title}</T>

      {/* The segment, as a number the member can hold on to. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Num size={19} weight="bold" c={color.volt}>
          {`${video.segment_start}–${video.segment_end}`}
        </Num>
        <T size={11} c={color.dim}>{`of ${video.full_length}`}</T>
      </View>

      {unverified ? (
        <View style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start' }}>
          <T size={11} weight="bold" c={color.gold} ls={0.6}>NEEDS REVIEW</T>
          <T size={11.5} lh={17} c={color.muted} style={{ flex: 1 }}>
            These timestamps have not been checked against the video yet.
          </T>
        </View>
      ) : null}

      <View style={{ gap: 3 }}>
        <T size={11} weight="bold" c={color.muted} ls={0.8}>WHAT TO WATCH FOR</T>
        <T size={12.5} lh={19} c={color.text}>{video.focus_note}</T>
      </View>

      {approved ? (
        <View style={{ gap: 8 }}>
          <Button
            label={`Open ${video.segment_start} on YouTube`}
            onPress={() => open(segmentUrl(video))}
          />
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {video.backup_url ? (
              <Pressable onPress={() => open(video.backup_url!)}>
                <T size={11.5} weight="semibold" c={color.muted}>Mirror</T>
              </Pressable>
            ) : null}
            {video.deeper_url ? (
              <Pressable onPress={() => open(video.deeper_url!)}>
                <T size={11.5} weight="semibold" c={color.muted}>Go deeper (optional)</T>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <T size={11.5} lh={17} c={color.dim}>
          This pick is waiting on sign-off, so it does not open yet. The lesson
          below teaches the concept without it.
        </T>
      )}

      {/* Kai pulls the vocabulary home. Violet, because Kai said it. */}
      <KaiNote>{video.kai_normalization}</KaiNote>
    </ObjectCard>
  );
}

export function VideoView({ screen, onAdvance }: ScreenProps<VideoScreen>) {
  const ready = screen.status === 'ready';
  const curated = screen.status === 'curated' ? screen.curated : undefined;
  return (
    <Frame type="video">
      <Eyebrow c={color.gold}>{screen.eyebrow} · {screen.duration}</Eyebrow>
      <T size={23} weight="bold" lh={28} ls={-0.3}>{screen.title}</T>
      <T size={12.5} c={color.muted}>With {screen.presenter}</T>

      {curated ? <CuratedSegmentCard video={curated} /> : null}

      {/* Our own footage: the poster, and the honest production state over it. */}
      {!curated && screen.poster !== undefined ? (
      <View
        style={{
          borderRadius: radius.xl,
          overflow: 'hidden',
          backgroundColor: color.surface3,
          borderWidth: 0.5,
          borderColor: alpha.ivory16,
        }}
      >
        <Image
          source={screen.poster}
          style={{ width: '100%', height: 190, opacity: ready ? 1 : 0.42 }}
          contentFit="cover"
        />
        {!ready ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              top: 0,
              backgroundColor: alpha.bg82,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 22,
              gap: 9,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingHorizontal: 11,
                paddingVertical: 6,
                borderRadius: radius.pill,
                borderWidth: 0.5,
                borderColor: alpha.gold40,
                backgroundColor: alpha.gold12,
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.gold }} />
              <T size={10} weight="bold" c={color.gold} ls={0.8}>IN PRODUCTION</T>
            </View>
            <T size={12.5} lh={18} align="center" c={color.muted}>{screen.statusNote}</T>
          </View>
        ) : null}
      </View>
      ) : null}

      <ObjectCard r={radius.xl} style={{ padding: 14, gap: 9 }}>
        <T size={11} weight="bold" c={color.muted} ls={0.8}>WHAT IT COVERS</T>
        {screen.outline.map((line, i) => (
          <View key={line} style={{ flexDirection: 'row', gap: 10 }}>
            <Num size={11} weight="bold" c={color.dim}>{`0${i + 1}`}</Num>
            <T size={12.5} lh={19} c={color.muted} style={{ flex: 1 }}>{line}</T>
          </View>
        ))}
      </ObjectCard>

      <ObjectCard tone="voltCard" r={radius.xl} style={{ padding: 14, gap: 10 }}>
        <T size={12.5} weight="bold">{screen.afterCard.title}</T>
        {screen.afterCard.rows.map((r) => (
          <View key={r.label} style={{ gap: 2 }}>
            <T size={12} weight="semibold" c={color.volt}>{r.label}</T>
            <T size={12.5} lh={19} c={color.muted}>{r.text}</T>
          </View>
        ))}
      </ObjectCard>

      <Advance label={screen.cta ?? 'Continue'} onPress={() => onAdvance()} />
    </Frame>
  );
}

/* ───────────────────────────────── 5 auction ────────────────────────────── */

function LadderRow({
  price,
  size,
  side,
  highlight,
}: {
  price: number;
  size: number;
  side: 'bid' | 'ask';
  highlight?: boolean;
}) {
  const tint = side === 'bid' ? color.green : color.red;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.sm,
        borderWidth: highlight ? 1 : 0,
        borderColor: highlight ? color.green : undefined,
        backgroundColor: highlight
          ? alpha.green12
          : side === 'bid'
          ? alpha.green12
          : alpha.red10,
      }}
    >
      <T size={10} weight="bold" c={tint} ls={0.7} style={{ width: 26 }}>
        {side === 'bid' ? 'BID' : 'ASK'}
      </T>
      <Num size={14} weight="bold" c={tint} style={{ flex: 1 }}>{`$${price.toFixed(2)}`}</Num>
      <Num size={11.5} weight="regular" c={color.dim}>{size.toLocaleString('en-US')}</Num>
    </View>
  );
}

export function AuctionView({ screen, onAdvance }: ScreenProps<AuctionScreen>) {
  const [lifted, setLifted] = useState(false);
  // Asks print high-to-low above the last price, bids high-to-low below it —
  // the way a book is read, cheapest offer nearest the middle.
  const asks = useMemo(() => [...screen.asks].sort((a, b) => b.price - a.price), [screen.asks]);
  const bids = useMemo(() => [...screen.bids].sort((a, b) => b.price - a.price), [screen.bids]);
  const remainingAsks = lifted ? asks.filter((a) => a.price !== screen.lift.price) : asks;

  return (
    <Frame type="auction">
      <Eyebrow c={color.volt}>{screen.eyebrow}</Eyebrow>
      <T size={23} weight="bold" lh={28} ls={-0.3}>{screen.title}</T>
      <Body lines={screen.body} />

      <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }}>
        {screen.symbol ? (
          <Ticker symbol={screen.symbol} size={28} sub={screen.companyName ?? null} />
        ) : (
          <Eyebrow c={color.cyan}>{screen.bookLabel}</Eyebrow>
        )}

        <View style={{ gap: 4 }}>
          {remainingAsks.map((a) => (
            <LadderRow key={a.price} price={a.price} size={a.size} side="ask" />
          ))}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: radius.sm,
              borderWidth: 0.5,
              borderColor: alpha.cyan40,
              backgroundColor: alpha.cyan10,
            }}
          >
            <T size={10} weight="bold" c={color.cyan} ls={0.7} style={{ width: 26 }}>LAST</T>
            <Num size={17} weight="bold" c={color.cyan} style={{ flex: 1 }}>
              {`$${(lifted ? screen.lift.price : screen.last).toFixed(2)}`}
            </Num>
            {lifted ? <T size={10} weight="bold" c={color.green} ls={0.7}>LIFTED</T> : null}
          </View>

          {bids.map((b) => (
            <LadderRow key={b.price} price={b.price} size={b.size} side="bid" />
          ))}
        </View>

        <T size={11.5} lh={17} c={color.dim}>{screen.caption}</T>

        {/* The demonstration, not the primary action — the screen keeps one
            filled button, and it is Continue. */}
        {!lifted ? (
          <Pressable
            testID="training-auction-lift"
            accessibilityRole="button"
            accessibilityLabel={screen.lift.label}
            onPress={() => setLifted(true)}
            style={({ pressed }) => ({
              alignItems: 'center',
              paddingVertical: 11,
              borderRadius: radius.pill,
              borderWidth: 0.5,
              borderColor: alpha.green40,
              backgroundColor: pressed ? alpha.green12 : 'transparent',
            })}
          >
            <T size={12.5} weight="semibold" c={color.green}>{screen.lift.label} →</T>
          </Pressable>
        ) : null}
      </ObjectCard>

      {lifted ? (
        <ObjectCard tone="volt" r={radius.xl} style={{ padding: 13, gap: 7 }}>
          <T size={11} weight="bold" c={color.green} ls={0.8}>{screen.lift.label.toUpperCase()}</T>
          <T size={13} lh={20}>{screen.lift.explain}</T>
        </ObjectCard>
      ) : null}

      <Advance label={screen.cta ?? 'Continue'} onPress={() => onAdvance()} />
    </Frame>
  );
}

/* ───────────────────────────────── 6 sorting ────────────────────────────── */

export function SortingView({ screen, onAdvance }: ScreenProps<SortingScreen>) {
  const [selected, setSelected] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [misses, setMisses] = useState(0);

  const remaining = screen.cards.filter((c) => !placed[c.id]);
  const done = remaining.length === 0;

  const place = (bucketId: string) => {
    if (!selected) return;
    const card = screen.cards.find((c) => c.id === selected);
    if (!card) return;
    if (card.bucketId !== bucketId) {
      // A wrong drop is teaching, not a dead end: the card stays in hand and
      // the miss is counted so the competency signal stays honest.
      setMisses((n) => n + 1);
      return;
    }
    setPlaced((p) => ({ ...p, [card.id]: bucketId }));
    setSelected(null);
  };

  const advance = () => {
    const signal: CompetencySignal = misses === 0 ? 'mastered' : misses <= 2 ? 'strong' : 'developing';
    onAdvance({
      scored: { correct: screen.cards.length, total: screen.cards.length + misses },
      competencies: screen.competency ? { [screen.competency.key]: signal } : undefined,
    });
  };

  return (
    <Frame type="sorting">
      <Eyebrow c={color.volt}>{screen.eyebrow}</Eyebrow>
      <T size={23} weight="bold" lh={28} ls={-0.3}>{screen.title}</T>
      <T size={13.5} lh={20} c={color.muted}>{screen.prompt}</T>

      <View style={{ gap: 9 }}>
        {remaining.map((c) => {
          const on = selected === c.id;
          return (
            <Pressable
              key={c.id}
              testID={`training-sort-card-${c.id}`}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              accessibilityState={{ selected: on }}
              onPress={() => setSelected(on ? null : c.id)}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 13,
                borderRadius: radius.xl,
                borderWidth: on ? 1 : 0.5,
                borderColor: on ? color.volt : alpha.ivory20,
                backgroundColor: on ? alpha.volt08 : color.surface3,
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <T size={13.5} lh={19} c={on ? color.volt : color.text}>{c.label}</T>
            </Pressable>
          );
        })}
        {remaining.length > 0 && misses > 0 ? (
          <T size={11.5} c={color.gold}>
            That card belongs in the other bucket — read it once more and try again.
          </T>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {screen.buckets.map((b) => {
          const inside = screen.cards.filter((c) => placed[c.id] === b.id);
          return (
            <Pressable
              key={b.id}
              testID={`training-sort-bucket-${b.id}`}
              accessibilityRole="button"
              accessibilityLabel={b.label}
              disabled={!selected}
              onPress={() => place(b.id)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 132,
                padding: 12,
                gap: 9,
                borderRadius: radius.xl,
                borderWidth: selected ? 1 : 0.5,
                borderStyle: 'dashed',
                borderColor: selected ? color.volt : alpha.ivory20,
                backgroundColor: pressed ? alpha.volt08 : alpha.ivory04,
              })}
            >
              <View style={{ gap: 2 }}>
                <T size={12} weight="bold" ls={0.6}>{b.label}</T>
                <T size={10.5} c={color.dim}>{b.caption}</T>
              </View>
              {inside.map((c) => (
                <View
                  key={c.id}
                  style={{
                    gap: 4,
                    padding: 9,
                    borderRadius: radius.md,
                    borderWidth: 0.5,
                    borderColor: alpha.green40,
                    backgroundColor: alpha.green12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Check size={11} color={color.green} />
                    <T size={10.5} lh={14} c={color.green} style={{ flex: 1 }}>{c.label}</T>
                  </View>
                  <T size={10} lh={14} c={color.muted}>{c.why}</T>
                </View>
              ))}
            </Pressable>
          );
        })}
      </View>

      <Advance label={screen.cta ?? 'Continue'} onPress={advance} disabled={!done} />
    </Frame>
  );
}

/* ──────────────────────────────── 7 kai check ───────────────────────────── */

export type KaiCheckOutcome =
  | { status: 'ok'; text: string }
  | { status: 'unavailable'; text: string };

/**
 * The free-response screen. It asks Kai for a real assessment and, when Kai
 * cannot give one, says so and offers the member an honest way past it.
 *
 * WHY THE SELF-ASSESSMENT EXISTS. Today the Anthropic account behind Kai is
 * out of credit, so this call returns "credit balance is too low" every time.
 * The wrong answers to that are (a) block the lesson on an outage the member
 * did not cause, or (b) print something encouraging and let them think Kai
 * read it. So the card prints Kai's own unavailability sentence, and the
 * member records — for themselves — that they explained it. That is stored as
 * the competency signal `passed`, which is exactly what it is: not machine
 * scored. When credit returns, the real path lights up with no code change.
 */
export function KaiCheckView({
  screen,
  onAdvance,
  onSubmit,
}: ScreenProps<KaiCheckScreen> & {
  onSubmit: (answer: string) => Promise<KaiCheckOutcome>;
}) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<KaiCheckOutcome | null>(null);
  const [selfAssessed, setSelfAssessed] = useState(false);
  const [focused, setFocused] = useState(false);

  const canSubmit = answer.trim().length >= 12 && !busy;
  const canAdvance = outcome?.status === 'ok' || selfAssessed;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await onSubmit(answer.trim()));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame type="kai_check">
      <Eyebrow c={color.violetLight}>{screen.eyebrow}</Eyebrow>
      <T size={23} weight="bold" lh={28} ls={-0.3}>{screen.title}</T>
      <T size={13.5} lh={20} c={color.muted}>{screen.prompt}</T>

      <View
        style={{
          minHeight: 128,
          borderRadius: radius.xl,
          borderWidth: focused ? 1 : 0.5,
          borderColor: focused ? alpha.violet55 : alpha.ivory20,
          backgroundColor: color.surface3,
          padding: 14,
        }}
      >
        <TextInput
          testID="training-kai-input"
          accessibilityLabel={screen.prompt}
          value={answer}
          onChangeText={setAnswer}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          editable={!busy}
          placeholder={screen.placeholder}
          placeholderTextColor={color.dim}
          style={{
            flex: 1,
            minHeight: 100,
            fontFamily: family.regular,
            fontSize: 15,
            lineHeight: 22,
            color: color.text,
            textAlignVertical: 'top',
            ...(({ outlineStyle: 'none' } as unknown) as object),
          }}
        />
      </View>

      {outcome ? (
        <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, gap: 9 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <KaiOrb size={16} glow={false} />
            <Eyebrow c={color.violetLight}>KAI</Eyebrow>
          </View>
          {outcome.status === 'ok' ? (
            <T testID="training-kai-reply" size={13.5} lh={21}>{outcome.text}</T>
          ) : (
            <T testID="training-kai-unavailable" size={13.5} lh={21} c={color.muted}>
              {outcome.text}
            </T>
          )}
        </ObjectCard>
      ) : null}

      {outcome?.status === 'unavailable' ? (
        <Pressable
          testID="training-kai-selfassess"
          accessibilityRole="checkbox"
          accessibilityLabel={screen.selfAssessLabel}
          accessibilityState={{ checked: selfAssessed }}
          onPress={() => setSelfAssessed((s) => !s)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 11,
            padding: 13,
            borderRadius: radius.xl,
            borderWidth: selfAssessed ? 1 : 0.5,
            borderColor: selfAssessed ? color.volt : alpha.ivory20,
            backgroundColor: selfAssessed ? alpha.volt08 : color.surface3,
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: radius.xs,
              borderWidth: 1,
              borderColor: selfAssessed ? color.volt : alpha.ivory24,
              backgroundColor: selfAssessed ? color.volt : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selfAssessed ? <Check size={13} color={color.bg} /> : null}
          </View>
          <T size={13.5} c={selfAssessed ? color.volt : color.text} style={{ flex: 1 }}>
            {screen.selfAssessLabel}
          </T>
        </Pressable>
      ) : null}

      {canAdvance ? (
        <Advance
          label={screen.cta ?? 'Continue'}
          // `passed` either way, and deliberately: a free-response answer is
          // not machine-scored, so it never earns `mastered`. Whether Kai read
          // it or the member vouched for it, the honest signal is the same.
          onPress={() => onAdvance({ competencies: { [screen.competency.key]: 'passed' } })}
        />
      ) : (
        <Button
          testID="training-kai-submit"
          label={busy ? 'Sending to Kai…' : 'Ask Kai to Check It'}
          loading={busy}
          disabled={!canSubmit}
          onPress={() => { void submit(); }}
        />
      )}
    </Frame>
  );
}

/* ─────────────────────────── 8 market application ───────────────────────── */

export function MarketApplicationView({ screen, onAdvance }: ScreenProps<MarketApplicationScreen>) {
  const [revealed, setRevealed] = useState(false);
  return (
    <Frame type="market_application">
      <Eyebrow c={color.cyan}>{screen.eyebrow}</Eyebrow>
      <T size={23} weight="bold" lh={28} ls={-0.3}>{screen.title}</T>

      <ObjectCard r={radius.xl} style={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ticker symbol={screen.symbol} size={38} sub={screen.companyName} />
          <View style={{ alignItems: 'flex-end' }}>
            <Num size={19} weight="bold" c={color.cyan}>{`$${screen.quote.price.toFixed(2)}`}</Num>
            <T size={10.5} c={color.dim}>Market cap {screen.quote.marketCapLabel}</T>
          </View>
        </View>
        <T size={10.5} c={color.dim}>{screen.quote.asOf}</T>

        <View style={{ height: 0.5, backgroundColor: alpha.ivory12 }} />

        <View style={{ gap: 9 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T size={12.5} c={color.muted} style={{ flex: 1 }}>You buy</T>
            <Num size={13.5} weight="bold">{`${screen.scenario.shares} shares`}</Num>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T size={12.5} c={color.muted} style={{ flex: 1 }}>That costs</T>
            <Num size={13.5} weight="bold">{screen.scenario.costLabel}</Num>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T size={12.5} c={color.muted} style={{ flex: 1 }}>Price moves to</T>
            <Num size={13.5} weight="bold" c={color.green}>
              {`$${screen.scenario.movedPrice.toFixed(2)}`}
            </Num>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T size={12.5} c={color.muted} style={{ flex: 1 }}>Your shares are worth</T>
            <Num size={13.5} weight="bold" c={color.green}>{screen.scenario.movedValueLabel}</Num>
          </View>
        </View>
      </ObjectCard>

      <T size={15} weight="semibold" lh={22}>{screen.scenario.question}</T>

      {revealed ? (
        <ObjectCard tone="volt" r={radius.xl} style={{ padding: 13 }}>
          <T size={13} lh={20}>{screen.scenario.answer}</T>
        </ObjectCard>
      ) : (
        <Pressable
          testID="training-application-reveal"
          accessibilityRole="button"
          accessibilityLabel="Show me the answer"
          onPress={() => setRevealed(true)}
          style={({ pressed }) => ({
            alignItems: 'center',
            paddingVertical: 13,
            borderRadius: radius.xl,
            borderWidth: 0.5,
            borderStyle: 'dashed',
            borderColor: alpha.ivory24,
            backgroundColor: pressed ? alpha.ivory06 : 'transparent',
          })}
        >
          <T size={13} weight="semibold" c={color.muted}>Tap to see the answer</T>
        </Pressable>
      )}

      <ObjectCard r={radius.xl} style={{ padding: 14, gap: 9 }}>
        {screen.takeaways.map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: 9 }}>
            <Check size={12} color={color.volt} />
            <T size={12.5} lh={19} c={color.muted} style={{ flex: 1 }}>{line}</T>
          </View>
        ))}
      </ObjectCard>

      <Advance label={screen.cta ?? 'Continue'} onPress={() => onAdvance()} />
    </Frame>
  );
}

/* ───────────────────────── 9 mastery challenge ─────────────────────────── */

export function MasteryChallengeView({ screen, onAdvance }: ScreenProps<MasteryChallengeScreen>) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [signals, setSignals] = useState<Record<string, CompetencySignal>>({});

  const q = screen.questions[index];
  const total = screen.questions.length;
  const last = index === total - 1;

  const next = () => {
    if (!picked) return;
    const right = picked === q.correctId;
    const nextCorrect = correct + (right ? 1 : 0);
    const nextSignals = q.competency
      ? { ...signals, [q.competency.key]: (right ? 'strong' : 'developing') as CompetencySignal }
      : signals;

    if (!last) {
      setCorrect(nextCorrect);
      setSignals(nextSignals);
      setPicked(null);
      setIndex(index + 1);
      return;
    }
    // No teaching text anywhere in here — this screen measures, it does not
    // teach. The result lands on the completion screen.
    //
    // The assessment verdict is reported alongside the raw score because this
    // screen is the one that decides whether the lesson's competency was
    // actually earned: below `passPct`, the run banks no assessment XP and the
    // day gate stays shut. See `xp.ts`.
    const scorePct = total > 0 ? Math.round((nextCorrect / total) * 100) : 0;
    onAdvance({
      scored: { correct: nextCorrect, total },
      competencies: nextSignals,
      assessment: { passed: scorePct >= screen.passPct, scorePct },
    });
  };

  return (
    <Frame type="mastery_challenge">
      <Eyebrow c={color.volt}>{screen.eyebrow}</Eyebrow>
      <T size={23} weight="bold" lh={28} ls={-0.3}>{screen.title}</T>
      {index === 0 ? <T size={13} lh={20} c={color.muted}>{screen.intro}</T> : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {screen.questions.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= index ? color.volt : alpha.ivory12,
            }}
          />
        ))}
        <Num size={11} c={color.muted}>{`${index + 1}/${total}`}</Num>
      </View>

      <T size={16} weight="semibold" lh={23}>{q.prompt}</T>

      <View style={{ gap: 9 }}>
        {q.options.map((o) => (
          <Option
            key={o.id}
            option={o}
            state={picked === o.id ? 'chosen' : 'idle'}
            disabled={false}
            onPress={() => setPicked(o.id)}
          />
        ))}
      </View>

      <Advance
        label={last ? screen.cta ?? 'See Your Result' : 'Next Question'}
        onPress={next}
        disabled={!picked}
      />
    </Frame>
  );
}

/* ─────────────────────────────── 10 completion ──────────────────────────── */

export function CompletionView({
  screen,
  scorePct,
  masteryPct,
  skillLabel,
  onFinish,
  onSecondary,
}: {
  screen: CompletionScreen;
  scorePct: number | null;
  masteryPct: number;
  skillLabel: string;
  onFinish: () => void;
  onSecondary: () => void;
}) {
  return (
    <View testID="training-complete" style={{ gap: 14 }}>
      <View testID="training-screen-completion" style={{ gap: 14 }}>
        <View style={{ alignItems: 'center', gap: 11, paddingTop: 12 }}>
          <View
            style={{
              width: 108,
              height: 108,
              borderRadius: 54,
              borderWidth: 2,
              borderColor: color.volt,
              backgroundColor: alpha.volt10,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {scorePct === null ? (
              <Check size={40} color={color.volt} />
            ) : (
              <Num testID="training-mastery-pct" size={30} weight="bold" c={color.volt}>
                {`${scorePct}%`}
              </Num>
            )}
          </View>
          <Eyebrow c={color.volt}>LESSON COMPLETE</Eyebrow>
          <T size={26} weight="bold" align="center" ls={-0.4}>{screen.title}</T>
          <T size={12.5} c={color.muted} align="center">
            {skillLabel} mastery is now <T size={12.5} weight="bold" c={color.text}>{masteryPct}%</T>
          </T>
        </View>

        <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }}>
          <T size={12} weight="bold">What you now know</T>
          {screen.knowNow.map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: 9 }}>
              <Check size={12} color={color.volt} />
              <T size={12.5} lh={19} c={color.muted} style={{ flex: 1 }}>{line}</T>
            </View>
          ))}
        </ObjectCard>

        <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, gap: 9 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <KaiOrb size={16} glow={false} />
            <Eyebrow c={color.violetLight}>KAI</Eyebrow>
          </View>
          <T size={13.5} lh={21}>{screen.kaiMessage}</T>
        </ObjectCard>

        <Button testID="training-next" label={screen.nextLabel} arrow onPress={onFinish} />
        <Button label={screen.secondaryCta} kind="outline" onPress={onSecondary} />
      </View>
    </View>
  );
}

/* ──────────────────────── the honest "not built" panel ──────────────────── */

/**
 * Reached only if a lesson file uses a screen type that has no renderer yet.
 * It is impossible to reach through Day 1 Lesson 1, and it exists so that the
 * failure mode of authoring ahead of the engine is a clear sentence rather
 * than a blank screen or a crash.
 */
export function UnbuiltScreenView({
  type,
  onSkip,
}: {
  type: LessonScreen['type'];
  onSkip: () => void;
}) {
  return (
    <Frame type={type}>
      <ObjectCard r={radius.xl} style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Lock size={15} color={color.gold} />
          <T size={13} weight="bold" c={color.gold}>This screen type is not built yet</T>
        </View>
        <T size={12.5} lh={19} c={color.muted}>
          The lesson asks for a <T size={12.5} weight="bold" c={color.text}>{type}</T> screen. Its
          content shape is defined, but the engine has no renderer for it, so there is nothing
          honest to show you here.
        </T>
      </ObjectCard>
      <Button testID="training-next" label="Skip This Screen" onPress={onSkip} />
    </Frame>
  );
}
