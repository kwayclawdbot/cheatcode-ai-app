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
  type TradeIdea,
  type LevelKind,
} from "./index";

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
  testID?: string;
}) {
  const [selected, setSelected] = useState<LevelKind>("entry");
  const note = notes?.[selected];
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
      <T size={28} weight="medium" ls={-0.8} lh={33} style={s.heading}>
        {idea.title}
      </T>
      {idea.summary ? (
        <T c={color.muted} size={15} lh={22} style={{ marginTop: 8 }}>
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
          <T c={color.violetLight} size={16}>
            {askLabel ?? `Ask Kai about this ${selected} ↗`}
          </T>
        </Pressable>
      )}
      {composer}
      {showSource ? (
        <T size={12} c={color.muted} style={s.source}>
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
