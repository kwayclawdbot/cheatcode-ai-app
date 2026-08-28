import React from 'react';
import { View, Pressable, TextInput, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { alpha, color, radius } from '../../ui/tokens';
import { T, Eyebrow } from '../../ui/Text';
import { family } from '../../ui/fonts';
import type { ConversationRow } from '../../lib/types';

/**
 * The conversations drawer — prototype "Home" board.
 * Search · + New conversation · PINNED · RECENT. It is Kai's history, so the
 * screen behind it stays mounted: opening the drawer never resets the thread.
 */

const SearchGlyph = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Circle cx={11} cy={11} r={7} stroke={color.muted} strokeWidth={2} />
    <Path d="M21 21l-4.3-4.3" stroke={color.muted} strokeWidth={2} />
  </Svg>
);

const PlusGlyph = ({ c = color.volt }: { c?: string }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14M5 12h14" stroke={c} strokeWidth={2.4} />
  </Svg>
);

const PinGlyph = ({ on }: { on: boolean }) => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
    <Path d="M12 17v5M9 3h6l1 7 3 2H5l3-2 1-7z" stroke={on ? color.violetLight : color.dim} strokeWidth={2} />
  </Svg>
);

function Row({ row, active, onOpen, onPin }: {
  row: ConversationRow; active: boolean; onOpen: () => void; onPin: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={row.title}
        testID={`conversation-${row.id}`}
        style={{
          flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 11,
          ...(active
            ? { backgroundColor: alpha.ivory06, borderWidth: 0.5, borderColor: alpha.ivory14 }
            : row.pinned
            ? { backgroundColor: alpha.violet10, borderWidth: 0.5, borderColor: alpha.violet45 }
            : null),
        }}
      >
        <T size={13} weight={active || row.pinned ? 'semibold' : 'regular'} c={active || row.pinned ? color.text : color.muted} numberOfLines={1}>
          {row.title}
        </T>
      </Pressable>
      <Pressable
        onPress={onPin}
        accessibilityRole="button"
        accessibilityLabel={row.pinned ? `Unpin ${row.title}` : `Pin ${row.title}`}
        testID={`conversation-pin-${row.id}`}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}
        style={{ paddingHorizontal: 8, paddingVertical: 10 }}
      >
        <PinGlyph on={row.pinned} />
      </Pressable>
    </View>
  );
}

export function ConversationsDrawer({
  visible, onClose, pinned, recent, q, onQuery, activeId, onOpen, onPin, onNew, loading,
}: {
  visible: boolean;
  onClose: () => void;
  pinned: ConversationRow[];
  recent: ConversationRow[];
  q: string;
  onQuery: (v: string) => void;
  activeId?: string | null;
  onOpen: (row: ConversationRow) => void;
  onPin: (row: ConversationRow) => void;
  onNew: () => void;
  loading?: boolean;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close conversations"
        testID="threads-backdrop"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha.black50 }}
      />
      <View
        testID="threads-drawer"
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: 300,
          backgroundColor: '#121216', borderRightWidth: 1, borderRightColor: alpha.ivory10,
          paddingTop: Math.max(insets.top, 66), paddingHorizontal: 14, paddingBottom: Math.max(insets.bottom, 24),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, height: 42, paddingHorizontal: 13, borderRadius: radius.lg, backgroundColor: alpha.ivory05, borderWidth: 0.5, borderColor: alpha.ivory14 }}>
          <SearchGlyph />
          <TextInput
            testID="threads-search"
            accessibilityLabel="Search conversations"
            value={q}
            onChangeText={onQuery}
            placeholder="Search conversations"
            placeholderTextColor={color.muted}
            style={{ flex: 1, fontFamily: family.regular, fontSize: 13, color: color.text, ...(({ outlineStyle: 'none' } as unknown) as object) }}
          />
        </View>

        <Pressable
          onPress={onNew}
          accessibilityRole="button"
          testID="threads-new"
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 9, height: 42, marginTop: 9,
            paddingHorizontal: 13, borderRadius: radius.lg,
            backgroundColor: alpha.volt10, borderWidth: 0.5, borderColor: alpha.volt50,
          }}
        >
          <PlusGlyph />
          <T size={13} weight="bold" c={color.volt}>New conversation</T>
        </Pressable>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {pinned.length ? (
            <>
              <Eyebrow c={color.muted} style={{ marginTop: 18, marginBottom: 7, marginLeft: 4 }}>PINNED</Eyebrow>
              <View testID="threads-pinned" style={{ gap: 2 }}>
                {pinned.map((c) => (
                  <Row key={c.id} row={c} active={c.id === activeId} onOpen={() => onOpen(c)} onPin={() => onPin(c)} />
                ))}
              </View>
            </>
          ) : null}

          <Eyebrow c={color.muted} style={{ marginTop: 18, marginBottom: 7, marginLeft: 4 }}>RECENT</Eyebrow>
          <View testID="threads-recent">
            {recent.length ? (
              recent.map((c) => <Row key={c.id} row={c} active={c.id === activeId} onOpen={() => onOpen(c)} onPin={() => onPin(c)} />)
            ) : (
              <T size={12} c={color.dim} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                {loading ? 'Loading…' : q ? 'No conversation matches that.' : 'Your conversations will appear here.'}
              </T>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
