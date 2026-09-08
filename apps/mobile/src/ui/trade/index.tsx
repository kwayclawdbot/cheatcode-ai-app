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
import { color, alpha, belt } from "../tokens";
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
}: {
  idea: TradeIdea;
  compact?: boolean;
  selectedLevel?: LevelKind;
  onLevelSelect?: (level: LevelKind) => void;
  annotation?: KaiNote;
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
export function TradeStatusStrip({ status }: { status: TradeStatus }) {
  const index = STATUS_STEPS.indexOf(status);
  if (index < 0)
    return (
      <T c={color.muted} style={{ paddingVertical: 18 }}>
        {STATUS_LABEL[status]}
      </T>
    );
  return (
    <View
      style={s.status}
      accessible
      accessibilityLabel={`Trade status: ${STATUS_LABEL[status]}`}
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
export function SetupPreview({
  idea,
  onExplore,
}: {
  idea: TradeIdea;
  onExplore?: (idea: TradeIdea) => void;
}) {
  return (
    <View style={s.setup}>
      <View style={s.row}>
        <Ticker
          symbol={idea.symbol}
          size={44}
          sub={idea.company}
          style={s.flex}
        />
        {idea.grade && (
          <View
            style={[
              s.grade,
              {
                borderColor: idea.grade.startsWith("A")
                  ? alpha.gold40
                  : alpha.ivory20,
              },
            ]}
          >
            <T
              c={idea.grade.startsWith("A") ? color.gold : color.muted}
              size={13}
            >
              {idea.grade} setup
            </T>
          </View>
        )}
      </View>
      <T size={24} weight="medium" ls={-0.7} style={{ marginTop: 22 }}>
        {idea.title}
      </T>
      <TradeMap idea={idea} />
      <RiskRewardRuler idea={idea} />
      <T c={color.muted} size={15} lh={23} style={{ marginTop: 18 }}>
        {idea.summary}
      </T>
      <T size={12} c={color.muted} style={{ marginTop: 10 }}>
        {idea.direction === "long" ? "Long" : "Short"} ·{" "}
        {STATUS_LABEL[idea.status]}
      </T>
      {onExplore && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onExplore(idea)}
          style={s.primary}
        >
          <T c={color.bg} weight="semibold" size={16}>
            Explore this idea →
          </T>
        </Pressable>
      )}
      <T size={12} c={color.muted} style={{ marginTop: 14 }}>
        {idea.dataLabel}
      </T>
    </View>
  );
}
export function PinnedTradePreview({
  idea,
  onOpen,
}: {
  idea: TradeIdea;
  onOpen?: (idea: TradeIdea) => void;
}) {
  const content = (
    <>
      <View style={s.row}>
        <Ticker
          symbol={idea.symbol}
          size={34}
          sub={idea.company}
          style={s.flex}
        />
        <T size={12} c={color.muted}>
          {STATUS_LABEL[idea.status]}
        </T>
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
                <T
                  weight="semibold"
                  c={m.isKai ? color.violetLight : color.text}
                >
                  {m.name}
                </T>
                {m.belt && (
                  <View style={[s.belt, { borderColor: belt[m.belt] }]}>
                    <T size={11} c={color.muted}>
                      {m.belt} belt
                    </T>
                  </View>
                )}
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
  belt: { borderLeftWidth: 3, paddingLeft: 6 },
  reply: {
    borderLeftWidth: 1,
    borderColor: alpha.ivory20,
    paddingLeft: 8,
    marginBottom: 8,
  },
  empty: { minHeight: 150, alignItems: "center", justifyContent: "center" },
});
