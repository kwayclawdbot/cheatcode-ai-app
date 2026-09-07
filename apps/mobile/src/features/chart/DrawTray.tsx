/**
 * The drawing tools.
 *
 * WHY IT IS A RAIL AND NOT A TOOLBAR. A horizontal bar across the top or bottom
 * of a chart eats the one dimension a chart cannot spare — price at the bottom,
 * the symbol and the close at the top — and on a phone in landscape it takes a
 * tenth of the screen. A narrow vertical rail on the LEFT edge costs 36 points
 * of width, sits against the one margin with nothing in it (the price axis is on
 * the right, the timeframe rail bottom-centre), and is where every chart
 * application a trader has ever used puts its tools.
 *
 * IT IS NOT A CARD. No panel, no shadow, no container: four buttons on the
 * surface colour with a hairline, in a column. A floating rounded rectangle over
 * the chart would read as a dialog that arrived, and this is furniture that was
 * always there.
 *
 * VOLT IS THE ONLY ACCENT IN HERE, and that is the palette law rather than a
 * choice: volt means the user, violet means Kai. A tool that is out is volt
 * because the next thing to happen is the user authoring something, and the mark
 * it produces is volt for the same reason. Nothing else in this component is
 * coloured at all.
 *
 * THE GLYPHS ARE THE SHAPES THEMSELVES. A horizontal rule, a diagonal, a
 * rectangle — drawn as three primitives rather than borrowed from an icon set,
 * because the thing each tool makes IS a line or a box and any icon would be a
 * metaphor for something we can just show. There is no icon library in this app
 * and adding one for three lines would be the wrong trade.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { T } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';

export type DrawToolName = 'level' | 'trendline' | 'zone' | null;

const TOOLS: { id: Exclude<DrawToolName, null>; label: string; hint: string }[] = [
  { id: 'level', label: 'Level', hint: 'Tap the chart to put a horizontal line at that price' },
  { id: 'trendline', label: 'Trend', hint: 'Drag between two points to draw a sloping line' },
  { id: 'zone', label: 'Zone', hint: 'Drag to shade an area between two prices' },
];

function Glyph({ tool, on }: { tool: Exclude<DrawToolName, null>; on: boolean }) {
  const c = on ? color.volt : color.muted;
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      {tool === 'level' ? (
        <Line x1={1} y1={8} x2={15} y2={8} stroke={c} strokeWidth={1.6} strokeLinecap="round" />
      ) : tool === 'trendline' ? (
        <Line x1={2} y1={13} x2={14} y2={3} stroke={c} strokeWidth={1.6} strokeLinecap="round" />
      ) : (
        <Rect x={1.8} y={4} width={12.4} height={8} rx={1.5} stroke={c} strokeWidth={1.4} fill={`${c}22`} />
      )}
    </Svg>
  );
}

export function DrawTray({
  tool,
  onPick,
  canDelete,
  onDelete,
  bottom = 0,
  left = 0,
  testID = 'draw-tray',
}: {
  tool: DrawToolName;
  onPick: (t: DrawToolName) => void;
  /** True only when the SELECTED drawing is one the user made. Kai's are not deletable here. */
  canDelete: boolean;
  onDelete: () => void;
  bottom?: number;
  left?: number;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      /**
       * ANCHORED TO THE PENCIL WHEN THERE IS ONE, so the tools read as coming
       * OUT of the thing that was tapped rather than appearing in the middle of
       * the plot. It also keeps them in the one corner of the chart with nothing
       * in it — floating at 28% put them straight on top of the entry and
       * trigger chips, which is the clutter this whole pass is about.
       */
      style={{
        position: 'absolute',
        left: left + 8,
        ...(bottom ? { bottom, flexDirection: 'column-reverse' } : { top: '28%' }),
        gap: 6,
      }}
    >
      {TOOLS.map((t) => {
        const on = tool === t.id;
        return (
          <Pressable
            key={t.id}
            testID={`draw-tool-${t.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            accessibilityHint={t.hint}
            hitSlop={8}
            // Tapping the tool that is already out puts it away. A tool you
            // cannot cancel without drawing something is a trap.
            onPress={() => onPick(on ? null : t.id)}
            style={({ pressed }) => ({
              width: 34,
              height: 34,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm,
              borderWidth: 0.5,
              borderColor: on ? `${color.volt}66` : alpha.ivory12,
              backgroundColor: on ? `${color.volt}1A` : alpha.surface75,
              // Instant, physical feedback. 0.94 rather than a colour change:
              // the finger is already covering the button, so the only feedback
              // it can see is the shape moving.
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            <Glyph tool={t.id} on={on} />
          </Pressable>
        );
      })}

      {/*
        DELETE APPEARS ONLY WHEN THERE IS SOMETHING OF YOURS TO DELETE.
        A permanently visible bin next to a chart is an invitation to lose work,
        and one that is greyed out most of the time is a control teaching you it
        does not work. It arrives with the selection and leaves with it.
      */}
      {canDelete ? (
        <Pressable
          testID="draw-delete"
          accessibilityRole="button"
          accessibilityLabel="Remove this drawing"
          hitSlop={8}
          onPress={onDelete}
          style={({ pressed }) => ({
            width: 34,
            height: 34,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.sm,
            borderWidth: 0.5,
            borderColor: `${color.red}55`,
            backgroundColor: alpha.surface75,
            marginTop: 4,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <Svg width={14} height={14} viewBox="0 0 14 14">
            <Line x1={3} y1={3} x2={11} y2={11} stroke={color.red} strokeWidth={1.6} strokeLinecap="round" />
            <Line x1={11} y1={3} x2={3} y2={11} stroke={color.red} strokeWidth={1.6} strokeLinecap="round" />
          </Svg>
        </Pressable>
      ) : null}

      {/*
        One line of instruction, and only while a tool is out. It is the
        difference between a tool that works and a tool that works once you have
        guessed how — and it costs nothing when no tool is out, because it is not
        there.
      */}
      {tool ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 42,
            top: 4,
            maxWidth: 190,
            paddingHorizontal: 8,
            paddingVertical: 5,
            borderRadius: radius.sm,
            backgroundColor: alpha.bg82,
          }}
        >
          <T size={10.5} c={color.muted}>
            {tool === 'level'
              ? 'Tap the chart to place a line'
              : tool === 'trendline'
                ? 'Drag from one point to another'
                : 'Drag to shade an area'}
          </T>
        </View>
      ) : null}
    </View>
  );
}
