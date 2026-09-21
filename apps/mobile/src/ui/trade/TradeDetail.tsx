import React, { useState, type ReactNode } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { T } from "../Text";
import { Ticker } from "../Ticker";
import { color, alpha, radius, type as typeScale } from "../tokens";
import {
  TradeMap,
  RiskRewardRuler,
  TradeStatusStrip,
  GradeBadge,
  CompactIdentity,
  KaiAnnotation,
  TradeLevels,
  riskReward,
  type TradeIdea,
  type LevelKind,
} from "./index";
import { validCandles } from "../../../../../packages/trade-ui/model";

/**
 * THE TRADE IDEA, EXPANDED.
 *
 * This is `SetupPreview` after a member has asked for more, and the difference
 * between the two is exactly one thing: here the three levels are SELECTABLE,
 * and choosing one puts Kai's sentence about that level on the chart. A
 * preview answers "what is this and should I care"; this answers "why is the
 * stop there".
 *
 * Which is why it is the same object rather than a second page. The card's
 * "view setup details" grows the preview into this in place — same identity,
 * same headline, same chart in the same position — so nothing jumps and a
 * member never has to re-find what they were looking at. `children` is where
 * the evidence goes, below the idea and above the action.
 *
 * `notes` is real Kai text or nothing. A level with no note simply draws no
 * annotation; the component never writes a sentence about a level on Kai's
 * behalf, because a made-up rationale is worse than a missing one.
 */
export function TradeDetail({
  idea,
  notes,
  onAsk,
  composer,
  children,
  eyebrow,
  askLabel,
  lead,
  plan,
  status,
  showMap = true,
  showSource = true,
  levelText,
  unframed = false,
  showIdentity = true,
  gradeWhenAbsent = "hide",
  compact = false,
  side,
  extra,
  gradeMuted = false,
  gradeSuffix,
  identityRight,
  testID,
}: {
  idea: TradeIdea;
  notes?: Partial<Record<LevelKind, string>>;
  onAsk?: (context: {
    ideaId: string;
    symbol: string;
    level: LevelKind;
    value: number | null;
  }) => void;
  composer?: ReactNode;
  /** Evidence and longer discussion, drawn under the idea. */
  children?: ReactNode;
  eyebrow?: string;
  askLabel?: string;
  /**
   * Drawn ABOVE the price map — the object a family leads with when a stock
   * path is not it. An options card leads with the contract and may still have
   * a price plan underneath; `showMap` is what removes the map, not this.
   */
  lead?: ReactNode;
  /** Stands in for the ruler where a family has no exit plan to draw. */
  plan?: ReactNode;
  /**
   * The lifecycle, drawn between the chart and the levels — the same slot
   * `SetupPreview` puts it in, so a card growing from the preview into this
   * view does not move it. Supplying it replaces the four-dot strip below the
   * ruler, which would otherwise say the same thing twice on one card.
   */
  status?: ReactNode;
  /** Off for a family with no price plan at all, so nothing draws an empty chart. */
  showMap?: boolean;
  /** The source/as-of line. Off where the caller draws its own footer below
   *  the fold — the alert card keeps freshness under its expander, where it
   *  has always been, so the story still runs straight into the button. */
  showSource?: boolean;
  /** Drop the page padding and ground, for use inside a card that has its own. */
  unframed?: boolean;
  showIdentity?: boolean;
  /** See `TradeMap`. The caller's words for a level the number cannot hold. */
  levelText?: Partial<Record<LevelKind, string | null>>;
  gradeWhenAbsent?: "hide" | "state";
  /**
   * THE ALERT CARD, OPENED — sized to fit ONE screen with its action visible.
   *
   * Owner, 21 September: "the expanded alert card is way too big for screen."
   * The full layout here is a page (a 28pt heading, a paragraph, a 292-high
   * chart, a 48pt Ask button); on a card it put the button two screens down.
   * Compact keeps the same identity row as the collapsed card so nothing jumps,
   * draws the short chart with the SAME selectable levels, and leaves long
   * prose to the caller's "Why" disclosure in `children`.
   */
  compact?: boolean;
  side?: string;
  /** Drawn under the status line — the Day Trade contract row. */
  extra?: ReactNode;
  gradeMuted?: boolean;
  gradeSuffix?: string;
  identityRight?: ReactNode;
  testID?: string;
}) {
  const [selected, setSelected] = useState<LevelKind>("entry");
  /** Compact only: Kai's sentence about a level waits until a level is chosen. */
  const [touched, setTouched] = useState(false);
  const note = notes?.[selected];
  if (compact) {
    return (
      <View testID={testID} style={{ gap: 8 }}>
        <CompactIdentity
          idea={idea}
          side={side}
          gradeWhenAbsent={gradeWhenAbsent}
          gradeMuted={gradeMuted}
          gradeSuffix={gradeSuffix}
          right={identityRight}
        />
        {idea.title ? (
          <T size={typeScale.choiceTitle.size} lh={23} weight="semibold" numberOfLines={2}>
            {idea.title}
          </T>
        ) : null}
        {status}
        {extra}
        {/*
          THE CHART ONLY WHEN THERE IS A PRICE PATH TO DRAW. With no bars the
          map is three dashed lines that repeat the level row under it, and on
          a phone that repetition was the difference between the action being
          on screen or not. The levels themselves are ALWAYS here — the same
          row as the collapsed card, now tappable for Kai's note on each.
        */}
        {showMap && validCandles(idea.candles).length ? (
          <TradeMap idea={idea} compact selectedLevel={selected} levelText={levelText} showLevels={false} />
        ) : null}
        <TradeLevels
          idea={idea}
          levelText={levelText}
          dense
          // Nothing is highlighted until the member picks a level.
          selectedLevel={touched ? selected : ("" as LevelKind)}
          onLevelSelect={notes && Object.keys(notes).length ? (l) => { setSelected(l); setTouched(true); } : undefined}
        />
        {/* Kai's note is a paragraph, and on a card it arrived open by default
            and pushed the action off the screen. It now appears when the member
            picks a level — the same sentence, asked for. */}
        {touched && note ? <KaiAnnotation note={{ level: selected, text: note }} /> : null}
        {plan ?? (riskReward(idea) ? <RiskRewardRuler idea={idea} dense /> : null)}
        {children}
      </View>
    );
  }
  return (
    <View style={unframed ? undefined : s.root} testID={testID}>
      {eyebrow ? (
        <T
          size={typeScale.eyebrow.size}
          weight="bold"
          ls={typeScale.eyebrow.ls}
          c={color.muted}
          style={{ marginBottom: 10 }}
        >
          {eyebrow.toUpperCase()}
        </T>
      ) : null}
      {showIdentity ? (
        <View style={s.identity}>
          <Ticker
            symbol={idea.symbol}
            sub={idea.company || undefined}
            size={44}
            style={s.flex}
          />
          <GradeBadge grade={idea.grade} whenAbsent={gradeWhenAbsent} />
        </View>
      ) : null}
      <T variant="screenTitle" weight="medium" ls={-0.8} lh={33} style={s.heading}>
        {idea.title}
      </T>
      {idea.summary ? (
        <T c={color.muted} variant="body" lh={22} style={{ marginTop: 8 }}>
          {idea.summary}
        </T>
      ) : null}
      {lead}
      {showMap ? (
        <TradeMap
          idea={idea}
          selectedLevel={selected}
          onLevelSelect={setSelected}
          annotation={note ? { level: selected, text: note } : undefined}
          beforeLevels={status}
          levelText={levelText}
        />
      ) : status ? (
        <View style={{ marginTop: 12 }}>{status}</View>
      ) : null}
      {plan ?? <RiskRewardRuler idea={idea} />}
      {status ? null : (
        <TradeStatusStrip
          status={idea.status}
          testID={testID ? `${testID}-status` : undefined}
        />
      )}
      {children}
      {onAsk && (
        <Pressable
          accessibilityRole="button"
          testID={testID ? `${testID}-ask` : undefined}
          style={s.ask}
          onPress={() =>
            onAsk({
              ideaId: idea.id,
              symbol: idea.symbol,
              level: selected,
              value: idea[selected],
            })
          }
        >
          <T c={color.violetLight} variant="body">
            {askLabel ?? `Ask Kai about this ${selected} ↗`}
          </T>
        </Pressable>
      )}
      {composer}
      {showSource ? (
        <T variant="meta" c={color.muted} style={s.source}>
          {idea.dataLabel}
        </T>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  root: { backgroundColor: color.bg, padding: 18 },
  flex: { flex: 1, minWidth: 0 },
  identity: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  heading: { marginTop: 20 },
  ask: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: alpha.violet45,
    borderRadius: radius.lg,
  },
  source: { marginTop: 16 },
});
