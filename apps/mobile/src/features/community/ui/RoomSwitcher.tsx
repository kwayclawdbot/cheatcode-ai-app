/**
 * "FIND YOUR ROOM" — the room switcher, and the control the headbar lost.
 *
 * board-community-rooms.png, middle screen. Three chats with one line each,
 * the open circles under them, and the footnote that is really the whole point
 * of this change: "Reading a room keeps your trading preferences."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS REPLACED `ModeSegmented` (audit F13, P1)
 * ─────────────────────────────────────────────────────────────────────────────
 * The headbar used to carry the day/swing/invest segmented control, and that
 * control writes `profiles.primary_mode` through `PUT /mode`. So changing room
 * changed Home, changed the second tab and changed what Kai recommended — for
 * somebody whose intention was to read a conversation for two minutes. The
 * Beginners pill beside it changed only the room, so one header held two
 * controls that looked alike and did entirely different amounts of damage.
 *
 * This sheet is one control that does one thing: it moves you between three
 * rooms and touches nothing else. The trading goal is still changeable — it has
 * to be — from the row at the bottom, which opens the SAME chooser Home and
 * Trade use, the one that spells out what changing it does before it does it.
 * Deliberately a quiet row and not a segmented bar: a preference you change
 * every few weeks should not sit at the same weight as the thing you do every
 * time you open the tab.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DRAWS AND WHAT IT REFUSES TO
 * ─────────────────────────────────────────────────────────────────────────────
 * The rooms come from the API. The one-line description under each name is the
 * room's OWN `description`, written in migration 0045 and editable by an admin
 * — not a copy of it kept here that would drift the first time somebody edits a
 * room. A room with no description gets no second line rather than an invented
 * one.
 *
 * The unread count is the count the server sent. Member counts are not on this
 * sheet at all: they belong to the room you are in, not to a list you are
 * choosing from, and four of the numbers on the concept board are the kind this
 * codebase does not print.
 */
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle as SvgCircle, Path, Polyline } from 'react-native-svg';
import { Sheet } from '../../../ui/Sheet';
import { T } from '../../../ui/Text';
import { ChevronDown, ChevronRight, Check } from '../../../ui/Icons';
import { alpha, color, radius } from '../../../ui/tokens';
import { RoomAvatar } from '../../../ui/RoomAvatar';
import type { Circle } from '../../circles/types';
import type { Room } from '../types';

/* ------------------------------------------------------------------ */
/* The glyphs                                                          */
/* ------------------------------------------------------------------ */
/*
 * One per chat, in the colour that already means that thing in this app: cyan
 * is market data, green is a financial semantic reserved for outcomes — so the
 * investors' leaf is drawn in the house ivory rather than in green, which would
 * read as "up". Beginners is violet, the colour of being helped.
 */

const Traders = ({ c = color.cyan }: { c?: string }) => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="3 17 9 11 13 15 21 7" />
    <Polyline points="15 7 21 7 21 13" />
  </Svg>
);

const Investors = ({ c = color.text }: { c?: string }) => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 10-5 14-9 14z" />
    <Path d="M4 20c2-6 6-9 10-10" />
  </Svg>
);

const Beginners = ({ c = color.violetLight }: { c?: string }) => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 4 2 9l10 5 10-5-10-5z" />
    <Path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5" />
  </Svg>
);

function GlyphFor({ slug, active }: { slug: string | null; active: boolean }) {
  const tint = active ? color.volt : undefined;
  if (slug === 'investors') return <Investors c={tint} />;
  if (slug === 'beginners') return <Beginners c={tint} />;
  return <Traders c={tint} />;
}

/* ------------------------------------------------------------------ */
/* The headbar control this sheet hangs off                            */
/* ------------------------------------------------------------------ */

/**
 * The room's name, big, with the chevron that says it can be changed.
 *
 * F14 asked for "a readable room title and one room switcher" in place of a
 * header holding a title, a room caption, a member count, search, a Beginners
 * pill, three mode chips and a members button. This is the title and the
 * switcher; it is the same object because a name you can press is one thing to
 * understand rather than two.
 */
export function RoomTitleButton({
  name, onPress, testID,
}: { name: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID ?? 'room-title'}
      accessibilityRole="button"
      accessibilityLabel={`${name}. Change room`}
      accessibilityHint="Opens the list of rooms. It does not change what you trade."
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, flexShrink: 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <T size={20} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T>
        {/* Down, not right: it opens a list in place rather than pushing a
            screen. The two chevrons mean different things and this app is
            consistent about which is which. */}
        <View style={{ transform: [{ translateY: 1 }] }}>
          <ChevronDown size={11} color={color.muted} />
        </View>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* The sheet                                                           */
/* ------------------------------------------------------------------ */

export function RoomSwitcherSheet({
  visible, onClose, rooms, selectedId, onPick,
  circles, onOpenCircle, onSeeCircles,
  goalLabel, onChangeGoal,
}: {
  visible: boolean;
  onClose: () => void;
  /** The core rooms, already in the order the directory returned them. */
  rooms: Room[];
  selectedId: string | null;
  onPick: (room: Room) => void;
  circles: Circle[];
  onOpenCircle: (c: Circle) => void;
  /** Closes the sheet and leaves the member on the full circles row. */
  onSeeCircles: () => void;
  /** "Swing" — what the member's trading goal is set to right now. */
  goalLabel: string;
  onChangeGoal: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Find your room" testID="room-switcher">
      <View style={{ gap: 6 }}>
        {rooms.length === 0 ? (
          // Nothing was loaded. Say that; the alternative is a sheet listing
          // three rooms that may not be the three this database has.
          <T size={12.5} lh={18} c={color.muted} testID="room-switcher-empty">
            The rooms could not be loaded, so none are listed. Close this and try again.
          </T>
        ) : null}

        {rooms.map((r) => {
          const active = r.id === selectedId;
          return (
            <Pressable
              key={r.id}
              testID={`room-switcher-${r.slug ?? r.id}`}
              accessibilityRole="button"
              accessibilityLabel={r.name}
              accessibilityHint={r.description ?? undefined}
              accessibilityState={{ selected: active }}
              onPress={() => onPick(r)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 12, paddingHorizontal: 13,
                borderRadius: radius.xl,
                borderWidth: active ? 1 : 0.5,
                borderColor: active ? alpha.volt60 : alpha.ivory10,
                backgroundColor: active ? alpha.volt08 : 'transparent',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <GlyphFor slug={r.slug} active={active} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <T size={15} weight="bold" c={active ? color.volt : color.text} numberOfLines={1}>
                  {r.name}
                </T>
                {r.description ? (
                  <T size={12} lh={16} c={color.muted} numberOfLines={2}>{r.description}</T>
                ) : null}
              </View>
              {/* The count the server sent, or nothing. Never a dot that means
                  "probably something". */}
              {r.unread > 0 ? (
                <View
                  style={{
                    minWidth: 20, paddingHorizontal: 6, height: 19, borderRadius: 10,
                    alignItems: 'center', justifyContent: 'center', backgroundColor: color.volt,
                  }}
                >
                  <T size={9.5} weight="bold" c={color.bg}>{r.unread > 99 ? '99+' : String(r.unread)}</T>
                </View>
              ) : null}
              {active ? <Check size={15} color={color.volt} strokeWidth={2.6} /> : (
                <ChevronRight size={10} color={color.dim} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ------------------------------------------------------------ */}
      {/* Circles                                                       */}
      {/* ------------------------------------------------------------ */}
      {circles.length ? (
        <View style={{ gap: 8, paddingTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T size={13} weight="bold" style={{ flex: 1 }}>Circles</T>
            {/*
              "See all" goes back to the Community feed, where the same strip
              sits at the top and scrolls. There is no circles INDEX screen in
              this app, and a link to a route that does not exist is worse than
              no link — so this one goes somewhere that is really there.
            */}
            <Pressable
              testID="room-switcher-circles-all"
              accessibilityRole="button"
              accessibilityLabel="See all circles"
              accessibilityHint="Closes this and shows the circles row on the feed."
              onPress={onSeeCircles}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.65 : 1 })}
            >
              <T size={11.5} weight="semibold" c={color.muted}>See all</T>
              <ChevronRight size={9} color={color.muted} />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', gap: 14, paddingRight: 8 }}
          >
            {circles.map((c) => (
              <Pressable
                key={c.id}
                testID={`room-switcher-circle-${c.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}, ${c.time_left_plain}`}
                onPress={() => onOpenCircle(c)}
                style={({ pressed }) => ({ width: 60, alignItems: 'center', gap: 5, opacity: pressed ? 0.75 : 1 })}
              >
                <RoomAvatar symbol={c.symbol} name={c.name} imageUrl={c.image_url ?? null} size={44} />
                <T size={10.5} weight="semibold" align="center" numberOfLines={1}>{c.symbol}</T>
                <T size={9} c={color.dim} align="center" style={{ marginTop: -3 }}>{c.time_left_plain}</T>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* ------------------------------------------------------------ */}
      {/* The footnote, which is the promise this whole change makes    */}
      {/* ------------------------------------------------------------ */}
      <View style={{ borderTopWidth: 0.5, borderTopColor: alpha.ivory10, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ paddingTop: 2 }}>
            <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color.dim} strokeWidth={2}>
              <SvgCircle cx={12} cy={12} r={3} />
              <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
            </Svg>
          </View>
          <T size={11.5} lh={16} c={color.dim} style={{ flex: 1 }} testID="room-switcher-footnote">
            Reading a room keeps your trading preferences. Nothing here changes what Kai looks for,
            what your second tab shows, or what Home says.
          </T>
        </View>

        {/*
          AND THE PLACE THE TRADING GOAL DID NOT DISAPPEAR TO. It opens the same
          sheet Home and Trade open, which names every effect of the change
          before it is made — the "explicit preference control, with clear
          confirmation of its effect" the audit asked for.
        */}
        <Pressable
          testID="room-switcher-goal"
          accessibilityRole="button"
          accessibilityLabel={`Trading goal: ${goalLabel}. Change it`}
          accessibilityHint="Changes what Kai looks for across the whole app. It does not change which room you are reading."
          onPress={onChangeGoal}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 11, paddingHorizontal: 13,
            borderRadius: radius.lg, borderWidth: 0.5, borderColor: alpha.ivory10,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={12.5} weight="semibold">Trading goal · {goalLabel}</T>
            <T size={11} lh={15} c={color.dim}>What Kai looks for everywhere else. Changed here, on purpose.</T>
          </View>
          <ChevronRight size={10} color={color.muted} />
        </Pressable>
      </View>
    </Sheet>
  );
}
