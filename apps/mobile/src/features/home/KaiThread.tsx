import React, { useState } from 'react';
import { View } from 'react-native';
import { alpha, color, layout, radius } from '../../ui/tokens';
import { T } from '../../ui/Text';
import { RichText } from '../../ui/RichText';
import { KaiAvatar } from '../../ui/KaiAvatar';
import { ContextChip } from '../../ui/Chips';
import { Bars, Bell, DocLines, Question, Spark, Calendar } from '../../ui/Icons';
import { chipsThatFit, clockLabel, MAX_FOLLOWUPS, type FollowUp } from './agent';

/**
 * THE THREAD'S PIECES — redesign V2, panel 1.
 *
 * A Kai turn is: his avatar, "Kai" and the time, then whatever he said — words
 * in a quiet bubble, tool cards at the full column width — then the follow-ups
 * and, only when an alert is really armed, the monitoring line. A member's turn
 * is a right-aligned bubble with the time above it and their initial beside it.
 *
 * Violet appears here only as Kai's avatar and his spark. The bubbles are the
 * raised neutral surface, because on the board Kai's words are not tinted —
 * violet on every line would make it mean nothing.
 */

const GUTTER = 38; // avatar 30 + gap 8 — tool cards line up under the words

const timeOf = (at?: string | null) => {
  if (!at) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : clockLabel(d);
};

/** Kai's header row and the column his content sits in. */
export function KaiMessage({
  at, children, dim = false, showHeader = true, testID,
}: {
  at?: string | null;
  children: React.ReactNode;
  /** Kai cannot answer right now — his mark greys, his words do not change. */
  dim?: boolean;
  /** False for a second item in the same turn: one avatar per turn. */
  showHeader?: boolean;
  testID?: string;
}) {
  const time = timeOf(at);
  return (
    <View testID={testID} style={{ gap: 6 }}>
      {showHeader ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <KaiAvatar size={30} dim={dim} />
          <T variant="meta" weight="semibold" c={color.textPrimary}>Kai</T>
          {time ? <T variant="meta" c={color.textSecondary}>{time}</T> : null}
        </View>
      ) : null}
      <View style={{ paddingLeft: GUTTER, gap: 10 }}>{children}</View>
    </View>
  );
}

/** Kai's words. Neutral raised surface, 14 radius, never violet. */
export function KaiWords({ text, streaming = false, testID }: { text: string; streaming?: boolean; testID?: string }) {
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: radius.control,
        borderTopLeftRadius: 4,
        backgroundColor: color.raised,
        borderWidth: layout.border,
        borderColor: alpha.border,
      }}
    >
      <RichText text={streaming ? `${text}▍` : text} size={15} lh={22} />
    </View>
  );
}

/** A short line Kai adds that is not an answer — "Stopped.", a history notice. */
export function KaiNote({ text, testID }: { text: string; testID?: string }) {
  return <T variant="meta" c={color.textSecondary} testID={testID}>{text}</T>;
}

/** The member's own turn: time above, bubble, their initial beside it. */
export function UserMessage({ text, at, initial, testID }: { text: string; at?: string | null; initial?: string | null; testID?: string }) {
  const time = timeOf(at);
  return (
    <View testID={testID} style={{ alignItems: 'flex-end', gap: 4 }}>
      {time ? <T variant="meta" c={color.textSecondary} style={{ marginRight: GUTTER }}>{time}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '88%' }}>
        <View
          style={{
            flexShrink: 1,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: radius.control,
            borderBottomRightRadius: 4,
            backgroundColor: color.raised,
            borderWidth: layout.border,
            borderColor: alpha.action40,
          }}
        >
          <T variant="body">{text}</T>
        </View>
        <View
          aria-hidden
          style={{
            width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
            backgroundColor: color.raised, borderWidth: layout.border, borderColor: alpha.border,
          }}
        >
          <T variant="meta" weight="semibold" c={color.textPrimary}>{(initial || 'Y').slice(0, 1).toUpperCase()}</T>
        </View>
      </View>
    </View>
  );
}

const ICON: Record<FollowUp['icon'], (c: string) => React.ReactNode> = {
  thesis: (c) => <DocLines size={16} color={c} />,
  compare: (c) => <Bars size={16} color={c} strokeWidth={1.75} />,
  alert: (c) => <Bell size={16} color={c} strokeWidth={1.75} />,
  chart: (c) => <Bars size={16} color={c} strokeWidth={1.75} />,
  question: (c) => <Question size={16} color={c} />,
  report: (c) => <Calendar size={16} color={c} strokeWidth={1.75} />,
};

/**
 * The follow-ups under a Kai response. Neutral chips — tapping one is the
 * member acting, and it is sent as their message (or opens a surface), so
 * none of them is violet.
 */
export function FollowUpChips({ chips, onPress, testID = 'kai-followups' }: {
  chips: FollowUp[];
  onPress: (f: FollowUp) => void;
  testID?: string;
}) {
  // Wrapping is fine; a third row is not. Every chip is measured where it
  // stands, and any that would start a third row is laid aside (still measured,
  // never seen or read out) — so large text drops the last chip, not the row cap.
  const [rowW, setRowW] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const list = chips.slice(0, MAX_FOLLOWUPS);
  if (!list.length) return null;
  const shown = chipsThatFit(list.map((f) => widths[f.id] ?? 0), rowW);
  return (
    <View
      testID={testID}
      onLayout={(e) => setRowW(Math.floor(e.nativeEvent.layout.width))}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
    >
      {list.map((f, i) => {
        const aside = i >= shown;
        return (
          <View
            key={f.id}
            onLayout={(e) => {
              const w = Math.ceil(e.nativeEvent.layout.width);
              setWidths((m) => (m[f.id] === w ? m : { ...m, [f.id]: w }));
            }}
            accessibilityElementsHidden={aside}
            importantForAccessibility={aside ? 'no-hide-descendants' : 'auto'}
            style={aside ? { position: 'absolute', opacity: 0, pointerEvents: 'none', left: 0, top: 0 } : { maxWidth: '100%' }}
          >
            <ContextChip
              testID={aside ? undefined : `kai-followup-${f.id}`}
              label={f.label}
              icon={ICON[f.icon](color.textPrimary)}
              accessibilityHint={f.kind === 'ask' ? 'Sends this to Kai.' : 'Opens it above the conversation.'}
              onPress={() => onPress(f)}
              style={{ paddingHorizontal: 12 }}
            />
          </View>
        );
      })}
    </View>
  );
}

/** "Kai will update you when …" — drawn only when an armed alert is behind it. */
export function MonitoringLine({ text, testID = 'kai-monitoring' }: { text: string; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="text">
      <Spark size={13} />
      <T variant="meta" c={color.textSecondary} style={{ flexShrink: 1 }}>{text}</T>
    </View>
  );
}
