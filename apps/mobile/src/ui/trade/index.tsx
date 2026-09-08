import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, View, StyleSheet, Image } from "react-native";
import Svg, {
  Line,
  Rect,
  Path,
  Circle,
  Text as SvgText,
} from "react-native-svg";
import { T, Num } from "../Text";
import { Ticker } from "../Ticker";
import { KaiOrb } from "../KaiOrb";
import { family, fontStack } from "../fonts";
import { color, alpha, belt, radius, type as typeScale } from "../tokens";
import { useMotion } from "../../features/a11y/context";
import { Focusable } from "../Focus";
import {
  LEVEL_LABEL,
  STATUS_LABEL,
  STATUS_STEPS,
  price,
  riskReward,
  tradeGeometry,
  type TradeIdea,
  type LevelKind,
  type TradeStatus,
  type KaiNote,
  type ConversationMessage,
} from "../../../../../packages/trade-ui/model";
export type { TradeIdea, LevelKind, TradeStatus, KaiNote, ConversationMessage };
/* The geometry and formatting helpers travel with the components: a caller
   deciding whether a card HAS a plan must ask the same question the ruler asks,
   not a second one of its own that is free to disagree. */
export { riskReward, price, LEVEL_LABEL, STATUS_LABEL } from "../../../../../packages/trade-ui/model";
/**
 * THE GRADE, DRAWN ONE WAY.
 *
 * Gold is the grade's colour in this product — the same gold the alert card
 * gives an A — and everything below an A is muted, because a badge that shouts
 * at every rung is a badge nobody reads. Extracted the moment a second
 * component needed it: the room used to draw its own grade in VIOLET, which
 * said "Kai" rather than "graded" and was the only surface saying it that way.
 *
 * `word` is off for the compact preview, where the row beside it is already
 * short of horizontal room and "B+" alone is unambiguous.
 */
export function GradeBadge({
  grade,
  word = true,
  whenAbsent = "hide",
}: {
  grade?: string | null;
  word?: boolean;
  /**
   * What to draw when there is no grade. `hide` is the default because the
   * room's pinned setup has always drawn nothing there and changing a shipped
   * surface is not this component's business; the alert card opts into `state`.
   */
  whenAbsent?: "hide" | "state";
}) {
  /**
   * NO GRADE IS A STATE, NOT AN ABSENCE.
   *
   * This used to return `null`, which was right while the badge only ever sat
   * beside a `GradeMedallion` that drew the ungraded case itself. On the alert
   * card the badge IS the grade, and a card that simply omits it is a card a
   * member reads as ungraded-looking rather than as ungraded — the difference
   * that matters for the unusual-options family, which is honestly ungraded
   * because nothing behind it ever scored a stock setup.
   *
   * The two testIDs are `GradeMedallion`'s, carried over deliberately: the
   * proofs assert an ungraded card shows the ring and the words "No grade" and
   * never a number, and that guarantee should hold wherever the grade is drawn
   * rather than being tied to one component. The dashes are the medallion's
   * argument in a smaller frame — a dotted outline has no amount to misread.
   */
  if (!grade) {
    if (whenAbsent === "hide") return null;
    return (
      <View
        testID="grade-ungraded-ring"
        style={[s.grade, { borderColor: alpha.ivory20, borderStyle: "dashed" }]}
      >
        <T c={color.dim} size={13} testID="grade-none">
          No grade
        </T>
      </View>
    );
  }
  const top = grade.startsWith("A");
  return (
    <View style={[s.grade, { borderColor: top ? alpha.gold40 : alpha.ivory20 }]}>
      <T c={top ? color.gold : color.muted} size={13}>
        {word ? `${grade} setup` : grade}
      </T>
    </View>
  );
}
function MemberAvatar({ message }: { message: ConversationMessage }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <View style={s.avatar}>
      {message.avatarUrl && failed !== message.avatarUrl ? (
        <Image
          source={{ uri: message.avatarUrl }}
          accessibilityLabel={message.name}
          style={{ width: 37, height: 37 }}
          onError={() => setFailed(message.avatarUrl!)}
        />
      ) : (
        <T size={16} c={color.muted}>
          {message.name.charAt(0)}
        </T>
      )}
    </View>
  );
}
const ink: Record<LevelKind, string> = {
  entry: color.cyan,
  stop: color.red,
  target: color.green,
};

/**
 * A CHART ANNOTATION HAS A DEFINED MOTION BEHAVIOUR NOW (audit F19).
 *
 * F19's change asks for motion behaviour to be DEFINED "for sheets, chart
 * annotations and feedback", and the acceptance criterion is that OS reduced
 * motion is never overridden by anything in the app. This note is the chart
 * annotation: Kai's sentence about a level, appearing over a trade map that has
 * usually just moved underneath it.
 *
 * So the behaviour is stated rather than left to chance. It arrives — a short
 * fade with six pixels of settle, so it reads as something Kai said about the
 * chart rather than a paragraph that was always there and the eye missed. Under
 * reduced motion the whole budget goes to zero and it is simply present: same
 * text, same position, same everything, one frame instead of two hundred
 * milliseconds. It never starts from `scale(0)`; things in this product do not
 * appear out of nothing.
 */
export function KaiAnnotation({
  note,
  onAsk,
}: {
  note: KaiNote;
  onAsk?: (level: LevelKind) => void;
}) {
  const a = useRef(new Animated.Value(0)).current;
  const { duration, distance } = useMotion();

  // Keyed on the note's own text: a map that swaps which level Kai is talking
  // about is a new annotation arriving, not the same one re-rendering.
  useEffect(() => {
    a.setValue(0);
    const anim = Animated.timing(a, {
      toValue: 1,
      duration: duration(220),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [a, duration, note.text, note.level]);

  return (
    <Animated.View
      style={[
        s.kai,
        {
          opacity: a,
          transform: [
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [distance(6), 0] }) },
          ],
        },
      ]}
    >
      <KaiOrb size={24} glow={false} />
      <View style={s.flex}>
        <T size={12} c={color.violetLight}>
          Kai · {LEVEL_LABEL[note.level]}
        </T>
        <T size={16} lh={23} c={color.violetLight} style={{ marginTop: 6 }}>
          {note.text}
        </T>
        {onAsk && (
          <Focusable
            accessibilityRole="button"
            onPress={() => onAsk(note.level)}
            style={s.touch}
            ringInset={2}
            ringRadius={6}
          >
            <T size={14} c={color.violetLight}>
              Ask about this level ↗
            </T>
          </Focusable>
        )}
      </View>
    </Animated.View>
  );
}
export function TradeMap({
  idea,
  compact = false,
  selectedLevel = "entry",
  onLevelSelect,
  annotation,
  beforeLevels,
  levelText,
}: {
  idea: TradeIdea;
  compact?: boolean;
  selectedLevel?: LevelKind;
  onLevelSelect?: (level: LevelKind) => void;
  annotation?: KaiNote;
  /**
   * WHAT THE CELL PRINTS, when the caller's own words are truer than the number.
   *
   * The chart needs a number for every level; the cell does not. A wire that
   * sends an entry ZONE — `'504–507'` — is telling a member something the
   * geometry cannot hold, and printing the near edge alone would quietly
   * narrow a zone into a price. So the line is drawn at the number and the
   * cell prints the string, and the two never disagree because neither is
   * derived from the other.
   *
   * Absent, or absent for one level, the cell prints the formatted number as
   * it always did.
   */
  levelText?: Partial<Record<LevelKind, string | null>>;
  /**
   * Drawn between the chart and the three level cells.
   *
   * The alert card's lifecycle row sits exactly here on the owner's board, and
   * this is a slot rather than a `status` prop for the reason `PinnedTradePreview`
   * already documents: the kit owns what the three levels ARE, it does not own
   * what a particular caller happens to know about the state around them.
   */
  beforeLevels?: ReactNode;
}) {
  const [width, setWidth] = useState(340);
  const g = tradeGeometry(idea, compact);
  const labels =
    g?.levels.filter(
      (l) =>
        l.kind === selectedLevel ||
        g.levels.every(
          (other) => other.kind === l.kind || Math.abs(other.y - l.y) > 30,
        ),
    ) ?? [];
  return (
    <View
      style={s.map}
      onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
    >
      {g ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${idea.symbol}. ${g.candles.length ? "Price history and trade levels." : "Price history unavailable. Levels only."} ${g.levels.map((l) => `${LEVEL_LABEL[l.kind]} ${price(l.value, idea.pricePrecision)}`).join(". ")}`}
        >
          <Svg
            width={width}
            height={(width * g.height) / g.width}
            viewBox={`0 0 ${g.width} ${g.height}`}
          >
            {g.grid.map((y) => (
              <Line
                key={y}
                x1={8}
                x2={278}
                y1={y}
                y2={y}
                stroke={alpha.ivory08}
              />
            ))}
            {riskReward(idea) &&
              (["stop", "target"] as const).map((kind) => {
                const a = g.levels.find((l) => l.kind === "entry"),
                  b = g.levels.find((l) => l.kind === kind);
                return a && b ? (
                  <Rect
                    key={kind}
                    x={8}
                    width={270}
                    y={Math.min(a.y, b.y)}
                    height={Math.abs(a.y - b.y)}
                    fill={ink[kind]}
                    opacity={0.05}
                  />
                ) : null;
              })}
            {compact ? (
              <Path
                d={g.line}
                fill="none"
                stroke={color.cyan}
                strokeWidth={2}
              />
            ) : (
              g.candles.map((c) => (
                <React.Fragment key={c.time}>
                  <Line
                    x1={c.x}
                    x2={c.x}
                    y1={c.yHigh}
                    y2={c.yLow}
                    stroke={c.close >= c.open ? color.cyan : color.red}
                  />
                  <Rect
                    x={c.x - c.bodyWidth / 2}
                    y={Math.min(c.yOpen, c.yClose)}
                    width={c.bodyWidth}
                    height={Math.max(1, Math.abs(c.yClose - c.yOpen))}
                    fill={c.close >= c.open ? color.cyan : color.red}
                  />
                </React.Fragment>
              ))
            )}
            {g.levels.map((l) => (
              <Line
                key={l.kind}
                x1={8}
                x2={278}
                y1={l.y}
                y2={l.y}
                stroke={ink[l.kind]}
                strokeWidth={selectedLevel === l.kind ? 1.7 : 1}
                strokeDasharray="5 4"
              />
            ))}
            {labels.map((l) => (
              <React.Fragment key={l.kind}>
                {/*
                  THE PRICE ON THE MAP IS THE LAST BARE FAMILY ON THE CHART
                  (audit F19/F20). `react-native-svg` on web emits a real
                  `<text font-family="...">`, so a single-name family that has
                  not loaded resolves to the browser default and the levels
                  beside the trade map render in Times — on the one component
                  in the product whose whole job is to make a number readable.
                  `fontStack` puts the mono stack behind it; on native it is
                  still the exact registered face name and nothing else.
                */}
                <SvgText
                  fontFamily={fontStack(family.monoMedium, true)}
                  x={286}
                  y={l.y - 3}
                  fontSize={12}
                  fill={ink[l.kind]}
                >
                  {price(l.value, idea.pricePrecision)}
                </SvgText>
                <SvgText
                  fontFamily={fontStack(family.regular)}
                  x={286}
                  y={l.y + 12}
                  fontSize={10}
                  fill={ink[l.kind]}
                >
                  {LEVEL_LABEL[l.kind].toUpperCase()}
                </SvgText>
              </React.Fragment>
            ))}
            {g.candles.length > 0 &&
              g.levels
                .filter((l) => l.kind === selectedLevel)
                .map((l) => (
                  <Circle
                    key={l.kind}
                    cx={g.candles[g.candles.length - 1].x}
                    cy={l.y}
                    r={5}
                    fill={color.bg}
                    stroke={color.violetLight}
                    strokeWidth={2}
                  />
                ))}
          </Svg>
        </View>
      ) : (
        <View style={s.empty}>
          <T c={color.muted}>Chart and levels unavailable</T>
        </View>
      )}
      {g && !g.candles.length && (
        <T c={color.muted}>Price history unavailable</T>
      )}
      {beforeLevels}
      {!compact && (
        <TradeLevels
          idea={idea}
          levelText={levelText}
          selectedLevel={selectedLevel}
          onLevelSelect={onLevelSelect}
        />
      )}
      {annotation && <KaiAnnotation note={annotation} />}
    </View>
  );
}
/**
 * THE THREE LEVELS, AS NUMBERS — the smallest piece of the trade language.
 *
 * Extracted from `TradeMap` when the ticker page needed it: that page already
 * draws a chart of its own, so a second one would have been two pictures of
 * the same prices arguing about which was the real one. What it wanted was the
 * LEVELS in the app's one vocabulary — the same order, the same three inks,
 * the same refusal below — without a chart or a card around them.
 *
 * A LEVEL WITH NO NUMBER IS NOT DRAWN. These used to render unconditionally
 * and fall back to an em-dash, which puts a red cell labelled "Stop" on a card
 * that has no stop — and a red cell labelled Stop is read as a stop, whatever
 * is printed inside it. For an engine that produces no exit levels at all (the
 * unusual-options family) that is not cosmetic: it is the kit implying a risk
 * plan nothing behind it ever computed. This is the alert card's own
 * long-standing rule, moved into the kit when the card moved onto the kit.
 */
export function TradeLevels({
  idea,
  levelText,
  selectedLevel = "entry",
  onLevelSelect,
}: {
  idea: TradeIdea;
  levelText?: Partial<Record<LevelKind, string | null>>;
  selectedLevel?: LevelKind;
  onLevelSelect?: (level: LevelKind) => void;
}) {
  const drawn = (["entry", "stop", "target"] as const).filter(
    (kind) => typeof idea[kind] === "number" && Number.isFinite(idea[kind] as number),
  );
  if (!drawn.length) return null;
  return (
    <View style={s.levels}>
      {drawn.map((kind) => {
        const shown = levelText?.[kind] ?? price(idea[kind], idea.pricePrecision);
        const content = (
          <>
            <T size={12} c={ink[kind]}>
              {LEVEL_LABEL[kind]}
            </T>
            <Num size={16} c={ink[kind]} style={{ marginTop: 6 }}>
              {shown}
            </Num>
          </>
        );
        return onLevelSelect ? (
          <Focusable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={`${LEVEL_LABEL[kind]} ${shown}`}
            accessibilityState={{ selected: selectedLevel === kind }}
            onPress={() => onLevelSelect(kind)}
            style={[s.level, selectedLevel === kind && s.selected]}
            // Three columns 6px apart, so the ring stays tight; the level
            // cells are square-cornered, so it traces a square.
            ringInset={2}
            ringRadius={0}
          >
            {content}
          </Focusable>
        ) : (
          <View key={kind} style={s.level}>
            {content}
          </View>
        );
      })}
    </View>
  );
}
export function RiskRewardRuler({ idea }: { idea: TradeIdea }) {
  const r = riskReward(idea);
  return r ? (
    <View
      style={{ marginTop: 12 }}
      accessible
      accessibilityLabel={`Planned risk 1R. Reward ${r.ratio.toFixed(1)}R.`}
    >
      <View style={s.ruler}>
        <View style={{ flex: r.riskFraction, backgroundColor: color.red }} />
        <View
          style={{ flex: 1 - r.riskFraction, backgroundColor: color.green }}
        />
      </View>
      <View style={[s.row, { marginTop: 8 }]}>
        <T c={color.red}>
          Risk <Num c={color.red}>1R</Num>
        </T>
        <T c={color.green}>
          Reward <Num c={color.green}>{r.ratio.toFixed(1)}R</Num>
        </T>
      </View>
    </View>
  ) : (
    <T c={color.muted}>Risk/reward unavailable · Check trade levels</T>
  );
}
/**
 * THE LIFECYCLE, AT TWO SIZES.
 *
 * `steps` is the four-dot rail from the trade-idea board — it is worth a
 * screen's width because on the detail page the member is deciding, and seeing
 * the three states this idea has NOT reached yet is most of what tells them
 * whether it is an idea or an order.
 *
 * `pill` is the same fact in one line, for the alert card, where four labelled
 * dots per card down a scrolling list would be four times the furniture and a
 * quarter of the information. It is the row the owner's board draws under the
 * chart. Both read from `STATUS_LABEL`, so the word a member learns on the card
 * is the word they meet again on the page.
 *
 * Terminal states have no "next", so the pill goes muted and drops the chevron
 * rather than implying somewhere left to go.
 */
export function TradeStatusStrip({
  status,
  variant = "steps",
  label,
  hint,
  onPress,
  testID,
}: {
  status: TradeStatus;
  variant?: "steps" | "pill";
  /**
   * The caller's own word for this state, when it has one.
   *
   * The kit's six statuses are a shape — where a trade sits on its lifecycle —
   * and the alert wire's nine `AlertCardState`s collapse onto them. Collapsing
   * is right for the geometry and wrong for the label: "Forming" and "Order
   * pending" both land on this kit's `watching`/`active`, and printing the
   * kit's word instead of the server's would tell a member their resting order
   * is merely an idea. The server names the state; the kit places it.
   */
  label?: string;
  /** Caller-supplied detail, e.g. "Entry approaching". Never inferred here. */
  hint?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const word = label ?? STATUS_LABEL[status];
  const index = STATUS_STEPS.indexOf(status);
  if (variant === "pill") {
    const live = index >= 0 && status !== "closed";
    const tone = live
      ? color.volt
      : status === "invalidated" || status === "expired"
        ? color.red
        : color.muted;
    const body = (
      <>
        <View style={[s.pillDot, { borderColor: tone }]}>
          {(status === "active" || status === "entry_reached") && (
            <View style={[s.pillDotCore, { backgroundColor: tone }]} />
          )}
        </View>
        <T size={14} weight="semibold" c={tone}>
          {word}
        </T>
        {hint ? (
          <T size={14} c={color.muted} style={s.flex} numberOfLines={1}>
            · {hint}
          </T>
        ) : (
          <View style={s.flex} />
        )}
        {onPress && (
          <T size={16} c={color.muted}>
            ›
          </T>
        )}
      </>
    );
    const a11y = `Trade status: ${word}${hint ? `. ${hint}` : ""}`;
    return onPress ? (
      /* Focusable, not Pressable: every other control in this kit gained a
         focus ring with the accessibility lane, and a single control opting out
         is how a keyboard user finds the one place the ring disappears. */
      <Focusable
        accessibilityRole="button"
        accessibilityLabel={a11y}
        onPress={onPress}
        testID={testID}
        style={s.pillStatus}
        ringRadius={radius.lg}
      >
        {body}
      </Focusable>
    ) : (
      <View accessible accessibilityLabel={a11y} testID={testID} style={s.pillStatus}>
        {body}
      </View>
    );
  }
  if (index < 0)
    return (
      <T c={color.muted} testID={testID} style={{ paddingVertical: 18 }}>
        {word}
      </T>
    );
  return (
    <View
      style={s.status}
      testID={testID}
      accessible
      accessibilityLabel={`Trade status: ${word}`}
    >
      {STATUS_STEPS.map((step, i) => (
        <View key={step} style={s.statusStep}>
          <View
            style={[
              s.statusLine,
              { left: i === 0 ? "50%" : 0, right: i === 3 ? "50%" : 0 },
            ]}
          />
          <View
            style={[
              s.dot,
              {
                backgroundColor:
                  i === index ? color.volt : i < index ? color.muted : color.bg,
                borderColor: i === index ? color.volt : color.muted,
              },
            ]}
          />
          <T
            size={12}
            align="center"
            c={i === index ? color.volt : color.muted}
          >
            {STATUS_LABEL[step]}
          </T>
        </View>
      ))}
    </View>
  );
}
/**
 * THE DEFAULT TRADE OBJECT (audit F06).
 *
 * The order below is the owner's board, and it is an argument, not a taste:
 * the setup type and the headline say what was found, the identity says what it
 * was found in, and the map, the levels and the ruler are the plan. Everything
 * a member needs to decide is above the fold — where the entry is, where the
 * idea fails, what it is worth, and whether this is an idea or an order — and
 * nothing below the fold is needed to make that decision.
 *
 * Every slot exists because a family genuinely differs, not to make the
 * template configurable:
 *
 *   `lead`      replaces the price map, for a family whose object is not a
 *               stock path — an options card leads with the contract.
 *   `status`    the lifecycle row, drawn between the chart and the levels.
 *   `plan`      what stands in for the ruler when a family has no exit plan.
 *               A blank ruler would read as a broken ruler; the server's own
 *               sentence reads as the truth.
 *   `children`  the evidence, once a member has asked for it.
 *
 * A caller that omits `unframed` gets the bordered panel; the alert card draws
 * its own grade-banded frame and passes it, because a panel inside a panel is
 * the thing the house style spends most of its time refusing.
 */
export function SetupPreview({
  idea,
  onExplore,
  eyebrow,
  actionLabel,
  actionFilled = true,
  lead,
  status,
  plan,
  children,
  showMap = true,
  showSource = true,
  unframed = false,
  testID,
  levelText,
  gradeWhenAbsent = "hide",
}: {
  idea: TradeIdea;
  onExplore?: (idea: TradeIdea) => void;
  /** The setup type, e.g. "SWING SETUP · LONG". Caller's words. */
  eyebrow?: string;
  actionLabel?: string;
  actionFilled?: boolean;
  lead?: ReactNode;
  status?: ReactNode;
  plan?: ReactNode;
  children?: ReactNode;
  /** Off for a family with no price plan at all, so nothing draws an empty chart. */
  showMap?: boolean;
  /** The source/as-of line. Off where the caller draws its own footer below
   *  the fold — the alert card keeps freshness under its expander, where it
   *  has always been, so the story still runs straight into the button. */
  showSource?: boolean;
  unframed?: boolean;
  testID?: string;
  /** See `TradeMap`. The caller's words for a level the number cannot hold. */
  levelText?: Partial<Record<LevelKind, string | null>>;
  gradeWhenAbsent?: "hide" | "state";
}) {
  const hasPlan = riskReward(idea) !== null;
  return (
    <View style={unframed ? undefined : s.setup} testID={testID}>
      {eyebrow ? (
        <T
          size={typeScale.eyebrow.size}
          weight="bold"
          ls={typeScale.eyebrow.ls}
          c={color.muted}
          style={s.eyebrow}
        >
          {eyebrow.toUpperCase()}
        </T>
      ) : null}
      <T size={24} weight="medium" ls={-0.7} lh={29}>
        {idea.title}
      </T>
      {idea.summary ? (
        <T c={color.muted} size={15} lh={22} style={{ marginTop: 8 }}>
          {idea.summary}
        </T>
      ) : null}
      <View style={[s.row, { marginTop: 16 }]}>
        <Ticker
          symbol={idea.symbol}
          size={44}
          sub={idea.company || undefined}
          style={s.flex}
        />
        <GradeBadge grade={idea.grade} whenAbsent={gradeWhenAbsent} />
      </View>
      {lead}
      {showMap ? (
        <TradeMap idea={idea} beforeLevels={status} levelText={levelText} />
      ) : status ? (
        <View style={{ marginTop: 12 }}>{status}</View>
      ) : null}
      {plan ?? (hasPlan ? <RiskRewardRuler idea={idea} /> : null)}
      {children}
      {onExplore && (
        <Focusable
          accessibilityRole="button"
          onPress={() => onExplore(idea)}
          testID={testID ? `${testID}-action` : undefined}
          style={[
            s.primary,
            actionFilled ? null : { backgroundColor: "transparent", borderWidth: 1, borderColor: alpha.ivory24 },
          ]}
          ringRadius={12}
        >
          <T c={actionFilled ? color.bg : color.text} weight="semibold" size={16}>
            {actionLabel ?? "Explore this idea →"}
          </T>
        </Focusable>
      )}
      {showSource ? (
        <T size={12} c={color.muted} style={{ marginTop: 14 }}>
          {idea.dataLabel}
        </T>
      ) : null}
    </View>
  );
}
/**
 * COMPACT TRADE CONTEXT — the object as it appears inside a discussion.
 *
 * `meta` and `children` are slots, not features. The kit owns what a trade
 * object IS on every surface — the ticker and its logo, the grade, the status,
 * the headline, and the three levels in one order with one set of colours. It
 * does not own what a particular room happens to know: a last price, a watcher
 * count, a band drawn from a levels-only endpoint. Those come in through the
 * slots, so the room keeps its own facts without the kit growing a `watching`
 * prop it would then have to explain on the alert card and the ticker page too.
 *
 * This is the same shape `ConversationPreview` already uses for `composer`.
 */
export function PinnedTradePreview({
  idea,
  onOpen,
  meta,
  children,
}: {
  idea: TradeIdea;
  onOpen?: (idea: TradeIdea) => void;
  /** Room-specific facts drawn top-right, under the status. */
  meta?: ReactNode;
  /** Drawn below the levels — e.g. a room's own band chart. */
  children?: ReactNode;
}) {
  const content = (
    <>
      <View style={s.row}>
        <Ticker
          symbol={idea.symbol}
          size={34}
          sub={idea.company || undefined}
          style={s.flex}
        />
        <GradeBadge grade={idea.grade} word={false} />
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <T size={12} c={color.muted}>
            {STATUS_LABEL[idea.status]}
          </T>
          {meta}
        </View>
      </View>
      <T style={{ marginVertical: 12 }}>{idea.title}</T>
      <View style={s.pinLevels}>
        {(["entry", "stop", "target"] as const).map((k) => (
          <View key={k}>
            <T size={12} c={ink[k]}>
              {LEVEL_LABEL[k]}
            </T>
            <Num size={15} c={ink[k]} style={{ marginTop: 5 }}>
              {price(idea[k], idea.pricePrecision)}
            </Num>
          </View>
        ))}
      </View>
      {children}
    </>
  );
  return onOpen ? (
    <Focusable
      accessibilityRole="button"
      accessibilityLabel={`Open ${idea.symbol} trade`}
      onPress={() => onOpen(idea)}
      style={s.pin}
      ringRadius={16}
    >
      {content}
    </Focusable>
  ) : (
    <View style={s.pin}>{content}</View>
  );
}
/** Accept the existing app composer as a slot: this UI never sends network requests. */
export function ConversationPreview({
  messages,
  composer,
}: {
  messages: readonly ConversationMessage[];
  composer?: ReactNode;
}) {
  return (
    <View style={{ marginTop: 20 }}>
      <View style={{ gap: 28 }}>
        {messages.map((m) => (
          <View key={m.id} style={s.message}>
            {m.isKai ? (
              <KaiOrb size={32} glow={false} />
            ) : (
              <MemberAvatar message={m} />
            )}
            <View style={s.flex}>
              <View style={s.messageHeader}>
                {/*
                 * SIGNAL IS LIT, BELT IS DYED — the law in features/social/belts.ts.
                 *
                 * The belt is the NAME's colour, never a chip beside it. This kit
                 * shipped with the reverse (plain name, bordered chip) and the room
                 * it is going into inks the name, so the two would have spent the
                 * rest of their lives disagreeing about what a belt looks like.
                 *
                 * `belt.white` is #FFF7E8 — the same ivory `color.text` already was
                 * — so a member with no rung, and a member on the bottom rung, both
                 * render exactly as this component rendered them before. That is
                 * the point of the ladder: four ivory names are what make the fifth
                 * one legible as earned.
                 *
                 * Kai keeps violet. Kai has no rung and never will.
                 */}
                <T
                  weight="semibold"
                  c={m.isKai ? color.violetLight : belt[m.belt ?? "white"]}
                >
                  {m.name}
                </T>
                {m.isKai && (
                  <T size={11} c={color.violetLight}>
                    AI
                  </T>
                )}
                <T size={12} c={color.muted} style={{ marginLeft: "auto" }}>
                  {m.timeLabel}
                </T>
              </View>
              {m.replyToName && (
                <T size={12} c={color.muted} style={s.reply}>
                  Replying to {m.replyToName}
                </T>
              )}
              <T size={16} lh={24} c={m.isKai ? color.violetLight : color.text}>
                {m.text}
              </T>
            </View>
          </View>
        ))}
      </View>
      {composer}
    </View>
  );
}
const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  setup: {
    padding: 18,
    borderWidth: 1,
    borderColor: alpha.ivory12,
    borderRadius: 18,
    backgroundColor: color.bg,
  },
  grade: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: alpha.gold40,
    borderRadius: 8,
  },
  map: { marginVertical: 12 },
  levels: { flexDirection: "row", gap: 6 },
  level: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderColor: alpha.ivory12,
  },
  selected: { borderColor: color.violetLight, backgroundColor: alpha.violet08 },
  ruler: {
    flexDirection: "row",
    gap: 3,
    height: 7,
    borderRadius: 5,
    overflow: "hidden",
  },
  primary: {
    marginTop: 20,
    minHeight: 48,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.volt,
    borderRadius: 12,
  },
  kai: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    marginVertical: 18,
    borderLeftWidth: 2,
    borderColor: color.violet,
    backgroundColor: alpha.violet08,
  },
  touch: { minHeight: 44, justifyContent: "center" },
  pillStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 44,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: alpha.ivory12,
    borderRadius: radius.lg,
    backgroundColor: alpha.ivory035,
  },
  pillDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  pillDotCore: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { marginBottom: 10 },
  status: { flexDirection: "row", marginVertical: 26 },
  statusStep: { flex: 1, alignItems: "center", gap: 10 },
  statusLine: {
    position: "absolute",
    top: 5,
    height: 1,
    backgroundColor: alpha.ivory20,
  },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  pin: {
    padding: 16,
    borderWidth: 1,
    borderColor: alpha.ivory12,
    borderRadius: 16,
    backgroundColor: color.bg,
  },
  pinLevels: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  message: { flexDirection: "row", gap: 12 },
  messageHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  avatar: {
    width: 37,
    height: 37,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: alpha.ivory20,
    backgroundColor: color.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  reply: {
    borderLeftWidth: 1,
    borderColor: alpha.ivory20,
    paddingLeft: 8,
    marginBottom: 8,
  },
  empty: { minHeight: 150, alignItems: "center", justifyContent: "center" },
});
