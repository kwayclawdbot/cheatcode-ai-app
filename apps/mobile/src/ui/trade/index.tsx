import React, { useState, type ReactNode } from "react";
import { View, Pressable, StyleSheet, Image } from "react-native";
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
import { family } from "../fonts";
import { color, alpha, belt, radius, type as typeScale } from "../tokens";
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

export function KaiAnnotation({
  note,
  onAsk,
}: {
  note: KaiNote;
  onAsk?: (level: LevelKind) => void;
}) {
  return (
    <View style={s.kai}>
      <KaiOrb size={24} glow={false} />
      <View style={s.flex}>
        <T size={12} c={color.violetLight}>
          Kai · {LEVEL_LABEL[note.level]}
        </T>
        <T size={16} lh={23} c={color.violetLight} style={{ marginTop: 6 }}>
          {note.text}
        </T>
        {onAsk && (
          <Pressable
            accessibilityRole="button"
            onPress={() => onAsk(note.level)}
            style={s.touch}
          >
            <T size={14} c={color.violetLight}>
              Ask about this level ↗
            </T>
          </Pressable>
        )}
      </View>
    </View>
  );
}
export function TradeMap({
  idea,
  compact = false,
  selectedLevel = "entry",
  onLevelSelect,
  annotation,
  beforeLevels,
}: {
  idea: TradeIdea;
  compact?: boolean;
  selectedLevel?: LevelKind;
  onLevelSelect?: (level: LevelKind) => void;
  annotation?: KaiNote;
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
                <SvgText
                  fontFamily={family.monoMedium}
                  x={286}
                  y={l.y - 3}
                  fontSize={12}
                  fill={ink[l.kind]}
                >
                  {price(l.value, idea.pricePrecision)}
                </SvgText>
                <SvgText
                  fontFamily={family.regular}
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
        <View style={s.levels}>
          {(["entry", "stop", "target"] as const).map((kind) => {
            const content = (
              <>
                <T size={12} c={ink[kind]}>
                  {LEVEL_LABEL[kind]}
                </T>
                <Num size={16} c={ink[kind]} style={{ marginTop: 6 }}>
                  {price(idea[kind], idea.pricePrecision)}
                </Num>
              </>
            );
            return onLevelSelect ? (
              <Pressable
                key={kind}
                accessibilityRole="button"
                accessibilityLabel={`${LEVEL_LABEL[kind]} ${price(idea[kind], idea.pricePrecision)}`}
                accessibilityState={{ selected: selectedLevel === kind }}
                onPress={() => onLevelSelect(kind)}
                style={[s.level, selectedLevel === kind && s.selected]}
              >
                {content}
              </Pressable>
            ) : (
              <View key={kind} style={s.level}>
                {content}
              </View>
            );
          })}
        </View>
      )}
      {annotation && <KaiAnnotation note={annotation} />}
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11y}
        onPress={onPress}
        testID={testID}
        style={s.pillStatus}
      >
        {body}
      </Pressable>
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
  unframed = false,
  testID,
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
  unframed?: boolean;
  testID?: string;
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
      {lead ?? <TradeMap idea={idea} beforeLevels={status} />}
      {lead && status ? <View style={{ marginTop: 12 }}>{status}</View> : null}
      {plan ?? (hasPlan ? <RiskRewardRuler idea={idea} /> : null)}
      {children}
      {onExplore && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onExplore(idea)}
          testID={testID ? `${testID}-action` : undefined}
          style={[
            s.primary,
            actionFilled ? null : { backgroundColor: "transparent", borderWidth: 1, borderColor: alpha.ivory24 },
          ]}
        >
          <T c={actionFilled ? color.bg : color.text} weight="semibold" size={16}>
            {actionLabel ?? "Explore this idea →"}
          </T>
        </Pressable>
      )}
      <T size={12} c={color.muted} style={{ marginTop: 14 }}>
        {idea.dataLabel}
      </T>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${idea.symbol} trade`}
      onPress={() => onOpen(idea)}
      style={s.pin}
    >
      {content}
    </Pressable>
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
