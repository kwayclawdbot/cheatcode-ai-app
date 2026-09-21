import React from 'react';
import { Pressable, View } from 'react-native';
import { alpha, color, layout, radius, tap } from '../../ui/tokens';
import { T } from '../../ui/Text';
import { Card, Divider } from '../../ui/Card';
import { TickerMark } from '../../ui/Ticker';
import { ChevronRight, Spark, Calendar } from '../../ui/Icons';
import type { AgentOpen, BriefRow, TodayBrief } from './agent';

/**
 * TODAY'S BRIEF — a chat tool card (redesign V2, panel 1).
 *
 * Kai's opening message carries it: one row per thing worth a look — the
 * ticker (always with its logo), a state said in two or three words, one line
 * under it, and a chevron that opens the detail. The card wears Kai's violet
 * outline because Kai assembled it; the rows inside are ordinary controls, so
 * the label ink follows meaning — orange where the member has a move, red
 * where something failed, off-white for a date.
 *
 * It is a reusable tool card, not a Home widget: anything that can hand it a
 * `TodayBrief` (the opening, or Kai later in the thread) draws the same thing.
 */

const TONE_INK: Record<BriefRow['tone'], string> = {
  action: color.action,
  neutral: color.textPrimary,
  down: color.marketDown,
};

function RowMark({ row }: { row: BriefRow }) {
  if (row.kind === 'earnings' || !row.symbol) {
    // A date is not a company, so it gets the calendar tile the board draws.
    return (
      <View
        style={{
          width: 32, height: 32, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: color.raised, borderWidth: layout.border, borderColor: alpha.border,
        }}
      >
        <Calendar size={17} color={color.action} strokeWidth={1.75} />
      </View>
    );
  }
  return <TickerMark symbol={row.symbol} size={32} />;
}

export function BriefRowView({ row, onOpen, testID }: { row: BriefRow; onOpen: (o: AgentOpen) => void; testID?: string }) {
  const open = row.open;
  const label = `${row.title}. ${row.label}.${row.sub ? ` ${row.sub}.` : ''}`;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={open ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityHint={open ? (open.kind === 'surface' ? 'Opens it above the conversation.' : 'Opens the detail.') : undefined}
      disabled={!open}
      onPress={open ? () => onOpen(open) : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10,
        minHeight: tap.min + 12, paddingVertical: 8,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <RowMark row={row} />
      {/* The ticker column is a fixed width so the state labels line up. */}
      {/* At least 50 so the state labels line up; never truncated, because a
          ticker cut to "ME…" is not a ticker. Large text wraps the label instead. */}
      <T variant="body" weight="bold" numberOfLines={1} style={{ minWidth: 50, flexShrink: 0 }}>{row.title}</T>
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* 14 rather than body's 15: the board sets the state a step under the
            ticker so "Approaching entry" fits beside a logo at 360 wide. */}
        <T variant="body" size={14} lh={19} weight="semibold" c={TONE_INK[row.tone]} numberOfLines={2}>{row.label}</T>
        {row.sub ? <T variant="meta" c={color.textSecondary} numberOfLines={2}>{row.sub}</T> : null}
      </View>
      {open ? <ChevronRight size={16} color={color.textSecondary} /> : null}
    </Pressable>
  );
}

export function TodayBriefCard({ brief, onOpen, title = "Today's Brief", testID = 'today-brief' }: {
  brief: TodayBrief;
  onOpen: (o: AgentOpen) => void;
  /** The same card carries "Also watching" when Kai hands over the rest of the list. */
  title?: string;
  testID?: string;
}) {
  return (
    <Card tone="kai" testID={testID} style={{ paddingVertical: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <Spark size={18} />
        <T variant="cardTitle" style={{ flex: 1 }} accessibilityRole="header">{title}</T>
        <T variant="meta" c={color.textSecondary}>{brief.dateLabel}</T>
      </View>
      {brief.rows.map((row, i) => (
        <View key={row.id}>
          {i > 0 ? <Divider /> : null}
          <BriefRowView row={row} onOpen={onOpen} testID={`today-brief-row-${i}`} />
        </View>
      ))}
      {brief.footnote ? (
        <T variant="meta" c={color.textSecondary} style={{ marginTop: brief.rows.length ? 6 : 2 }} testID={`${testID}-footnote`}>
          {brief.footnote}
        </T>
      ) : null}
    </Card>
  );
}
