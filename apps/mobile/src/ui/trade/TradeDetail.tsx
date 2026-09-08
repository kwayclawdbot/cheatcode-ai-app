import React, { useState, type ReactNode } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { T } from "../Text";
import { Ticker } from "../Ticker";
import { color, alpha } from "../tokens";
import {
  TradeMap,
  RiskRewardRuler,
  TradeStatusStrip,
  type TradeIdea,
  type LevelKind,
} from "./index";

/** Drop-in composition. Caller supplies real Kai notes and handles the action. */
export function TradeDetail({
  idea,
  notes,
  onAsk,
  composer,
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
}) {
  const [selected, setSelected] = useState<LevelKind>("entry");
  const note = notes?.[selected];
  return (
    <View style={s.root}>
      <Ticker symbol={idea.symbol} sub={idea.company} size={44} />
      <T size={28} weight="medium" style={s.heading}>
        {idea.title}
      </T>
      <TradeMap
        idea={idea}
        selectedLevel={selected}
        onLevelSelect={setSelected}
        annotation={note ? { level: selected, text: note } : undefined}
      />
      <RiskRewardRuler idea={idea} />
      <TradeStatusStrip status={idea.status} />
      {onAsk && (
        <Pressable
          accessibilityRole="button"
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
            Ask Kai about this {selected} ↗
          </T>
        </Pressable>
      )}
      {composer}
      <T size={12} c={color.muted} style={s.source}>
        {idea.dataLabel}
      </T>
    </View>
  );
}
const s = StyleSheet.create({
  root: { backgroundColor: color.bg, padding: 18 },
  heading: { marginTop: 20 },
  ask: {
    minHeight: 48,
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: alpha.violet20,
    borderRadius: 12,
  },
  source: { marginTop: 16 },
});
