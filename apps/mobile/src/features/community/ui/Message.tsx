import React from 'react';
import { View, Pressable } from 'react-native';
import { alpha, color, radius } from '../../../ui/tokens';
import { T, Num } from '../../../ui/Text';
import { Avatar, ClaimChip, DisclosureChip, RoleChip } from './Chrome';
import { KaiObjectView } from './KaiObjects';
import type { RoomMessage } from '../types';

/**
 * One message in a room (V3-C1 / S81).
 * Member messages and Kai messages share the avatar + name + time rhythm; only
 * Kai's body is an object. A member's market claim carries an "Unverified" chip
 * until a verification_card in the room names it (08 §10).
 */

/** Highlight the two things the artboard highlights: @Kai, and price levels. */
function Body({ text, size = 13.5 }: { text: string; size?: number }) {
  // A bare number is a price level (cyan = market data). A $ amount is money,
  // not a level, so it stays plain — matched first so it is never split.
  const parts = text.split(/(@Kai\b|\$\d[\d.,]*|\b\d{2,5}(?:\.\d{1,2})?\b)/g).filter((p) => p !== '');
  return (
    <T size={size} lh={Math.round(size * 1.45)}>
      {parts.map((p, i) => {
        if (p === '@Kai') {
          return (
            <T key={i} size={size} weight="semibold" c={color.violetLight} style={{ backgroundColor: alpha.violet20 }}>
              {' '}@Kai{' '}
            </T>
          );
        }
        if (/^\$/.test(p)) {
          return <T key={i} size={size} lh={Math.round(size * 1.45)}>{p}</T>;
        }
        if (/^\d{2,5}(\.\d{1,2})?$/.test(p)) {
          return <Num key={i} size={size - 1.5} weight="regular" c={color.cyan}>{p}</Num>;
        }
        return <T key={i} size={size} lh={Math.round(size * 1.45)}>{p}</T>;
      })}
    </T>
  );
}

const roleTone = (label: string): 'gold' | 'kai' | 'green' | 'neutral' => {
  const l = label.toLowerCase();
  if (l === 'ai') return 'kai';
  if (l.includes('educator') || l.includes('expert')) return 'gold';
  if (l.includes('verified')) return 'green';
  return 'neutral';
};

export function MessageRow({
  message, selected, onSelect, onOpenAuthor, onMore, showStructured = true,
}: {
  message: RoomMessage;
  selected?: boolean;
  onSelect?: () => void;
  onOpenAuthor?: () => void;
  onMore?: () => void;
  showStructured?: boolean;
}) {
  const m = message;
  const isKai = m.author.is_kai;
  const nameColor = isKai ? color.violetLight : m.author.role_labels.some((r) => roleTone(r) === 'gold') ? color.gold : color.text;

  return (
    <View
      testID={`message-row-${m.id}`}
      style={{
        flexDirection: 'row', gap: 10,
        paddingVertical: selected ? 8 : 0,
        paddingHorizontal: selected ? 8 : 0,
        marginHorizontal: selected ? -8 : 0,
        borderRadius: radius.lg,
        borderWidth: selected ? 0.5 : 0,
        borderColor: selected ? alpha.violet50 : 'transparent',
        backgroundColor: selected ? alpha.violet08 : 'transparent',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isKai ? 'Kai' : `Open ${m.author.display_name}'s contributor profile`}
        disabled={isKai || !onOpenAuthor}
        onPress={onOpenAuthor}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Avatar
          initial={m.author.initial}
          tone={isKai ? 'kai' : m.author.role_labels.some((r) => roleTone(r) === 'gold') ? 'educator' : 'neutral'}
        />
      </Pressable>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${m.author.display_name}'s contributor profile`}
            disabled={isKai || !onOpenAuthor}
            onPress={onOpenAuthor}
            hitSlop={{ top: 8, bottom: 8 }}
          >
            <T size={13.5} weight="bold" c={nameColor}>{m.author.display_name}</T>
          </Pressable>
          {m.author.role_labels.map((r) => <RoleChip key={r} label={r} tone={roleTone(r)} />)}
          {m.position_disclosure ? (
            <DisclosureChip label={m.position_disclosure.label} holds={m.position_disclosure.holds} />
          ) : null}
          <T size={10} c={color.muted}>{m.time_label}</T>
        </View>

        {/* The body is the tap target for selection so the row never nests a
            button inside a button (web renders both as <button>). */}
        <Pressable
          testID={`message-${m.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${m.author.display_name}, ${m.time_label}. ${m.body ?? (m.kai_object ? m.kai_object.title : '')}`}
          accessibilityHint={onSelect ? 'Select this message so Kai can act on it' : undefined}
          accessibilityState={{ selected: !!selected }}
          disabled={!onSelect && !onMore}
          onPress={onSelect}
          onLongPress={onMore}
        >
          {m.deleted ? (
            <T size={13} c={color.dim}>This message was removed.</T>
          ) : m.kai_object ? (
            <View style={{ marginTop: 2 }}>
              <KaiObjectView object={m.kai_object} />
            </View>
          ) : (
            <>
              {m.body ? <Body text={m.body} /> : null}
              {m.structured_idea && showStructured ? <StructuredBlock idea={m.structured_idea} /> : null}
            </>
          )}
        </Pressable>

        {!isKai && m.is_claim && !m.deleted ? (
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <ClaimChip
              state={
                m.verified_by?.result === 'verified' ? 'verified'
                : m.verified_by?.result === 'partially_verified' ? 'partial'
                : m.verified_by?.result === 'false' ? 'false'
                : 'unverified'
              }
              label={m.verified_by?.label}
            />
          </View>
        ) : null}

        {m.reactions.length ? (
          <View style={{ flexDirection: 'row', gap: 5, marginTop: 5 }}>
            {m.reactions.map((r, i) => {
              const c = r.tone === 'kai' ? color.violetLight : r.tone === 'market' ? color.cyan : color.muted;
              const border = r.tone === 'kai' ? alpha.violet45 : r.tone === 'market' ? alpha.cyan40 : alpha.ivory20;
              return (
                <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 0.5, borderColor: border }}>
                  <Num size={10} weight="regular" c={c}>{r.label}</Num>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** A posted structured idea, rendered as the field object it was written as. */
export function StructuredBlock({ idea }: { idea: NonNullable<RoomMessage['structured_idea']> }) {
  const rows = [
    ['Direction & thesis', idea.direction_thesis],
    ['Entry condition', idea.entry_condition],
    ['Invalidation', idea.invalidation],
    ['Risk & size', idea.risk_size],
    ['Target & horizon', idea.target_horizon],
  ].filter(([, v]) => !!v);
  return (
    <View
      style={{
        marginTop: 6, borderRadius: radius.lg, borderWidth: 0.5, borderColor: alpha.ivory16,
        paddingHorizontal: 12, paddingVertical: 2, backgroundColor: alpha.surface50,
      }}
    >
      {rows.map(([label, value], i) => (
        <View key={label} style={{ paddingVertical: 8, borderBottomWidth: i === rows.length - 1 && !idea.evidence.length ? 0 : 0.5, borderBottomColor: alpha.ivory08 }}>
          <T size={10} c={color.muted}>{label}</T>
          <T size={13} lh={18} style={{ marginTop: 2 }}>{value}</T>
        </View>
      ))}
      {idea.evidence.length ? (
        <View style={{ paddingVertical: 8, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {idea.evidence.map((e) => (
            <View key={e} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, borderWidth: 0.5, borderColor: alpha.cyan40, backgroundColor: alpha.cyan07 }}>
              <T size={11} c={color.cyan}>{e}</T>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
