import React from 'react';
import { View, Image, Pressable, ScrollView } from 'react-native';
import { KaiOrb } from '../KaiOrb';
import { color, alpha, belt } from './theme';
import { KitText, Row, Stack, Badge } from './primitives';
import { ProgressRing, type BeltRank } from './learning';
import { KitIcon } from './icons';
import type { ConversationMessage } from '../../../../../packages/trade-ui/model';
export type { ConversationMessage };
export function Avatar({ name, uri, size = 36 }: { name: string; uri?: string; size?: number }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [uri]);
  return <View style={{ width: size, height: size, borderRadius: size/2, backgroundColor: alpha.ivory12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>{uri && !failed ? <Image source={{ uri }} accessibilityLabel={name} onError={() => setFailed(true)} style={{ width: size, height: size }} /> : <KitText size={size*.38} c={color.muted}>{name.split(' ').map(n => n[0]).slice(0,2).join('')}</KitText>}</View>;
}
export function KaiMessage({ text, compact = false, label = 'Kai' }: { text: string; compact?: boolean; label?: string }) {
  return <Row gap={12} style={{ alignItems: 'flex-start', ...(compact ? { borderLeftWidth: 2, borderLeftColor: color.violet, padding: 12, borderRadius: 10, backgroundColor: alpha.violet08 } : {}) }}><KaiOrb size={compact ? 28 : 38} /><Stack gap={4} style={{ flex: 1 }}><KitText size={12} c={color.violetLight} weight="medium">{label}</KitText><KitText size={compact ? 14 : 16}>{text}</KitText></Stack></Row>;
}
export type CircleRoom = { id: string; title: string; remainingLabel: string; remainingFraction: number; membersLabel: string; initials: string };
export function CircleStories({ rooms, onOpen }: { rooms: readonly CircleRoom[]; onOpen: (id: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false}><Row gap={16} style={{ alignItems: 'flex-start' }}>{rooms.map(room => <Pressable key={room.id} accessibilityRole="button" accessibilityLabel={`${room.title}, ${room.remainingLabel}, ${room.membersLabel}`} onPress={() => onOpen(room.id)} style={{ width: 76, alignItems: 'center', gap: 5 }}><ProgressRing progress={room.remainingFraction} size={66} ink={color.muted} label="Time remaining"><Avatar name={room.initials} size={48} /></ProgressRing><KitText size={12} align="center">{room.title}</KitText><KitText size={10} c={color.muted}>{room.remainingLabel}</KitText></Pressable>)}</Row></ScrollView>;
}
export function ConversationThread({ messages }: { messages: readonly ConversationMessage[] }) {
  return <Stack gap={22}>{messages.map(message => message.isKai ? <KaiMessage key={message.id} text={message.text} compact /> : <Row key={message.id} gap={12} style={{ alignItems: 'flex-start' }}><Avatar name={message.name} uri={message.avatarUrl} /><Stack gap={5} style={{ flex: 1 }}><Row gap={8} style={{ flexWrap: 'wrap' }}><KitText size={14} weight="semibold" c={message.belt ? belt[message.belt] : color.text}>{message.name}</KitText>{message.belt && <KitText size={10} c={color.muted}>{message.belt[0].toUpperCase()+message.belt.slice(1)} Belt</KitText>}<KitText size={10} c={color.muted}>{message.timeLabel}</KitText></Row>{message.replyToName && <KitText size={12} c={color.muted}>Replying to {message.replyToName}</KitText>}<KitText>{message.text}</KitText></Stack></Row>)}</Stack>;
}
export type ConversationHistoryItem = { id: string; title: string; preview: string; group: string; pinned?: boolean };
export function ThreadHistory({ threads, selected, onOpen }: { threads: readonly ConversationHistoryItem[]; selected?: string; onOpen: (id: string) => void }) {
  let group = '';
  return <Stack gap={6}>{threads.map(thread => { const show = thread.group !== group; group = thread.group; return <React.Fragment key={thread.id}>{show && <KitText size={11} c={color.muted} ls={1.5} style={{ marginTop: 14, marginBottom: 6 }}>{thread.group.toUpperCase()}</KitText>}<Pressable accessibilityRole="button" accessibilityState={{ selected: thread.id === selected }} onPress={() => onOpen(thread.id)} style={{ paddingVertical: 16, borderBottomWidth: 1, borderColor: alpha.ivory12 }}><Row><Stack gap={4} style={{ flex: 1 }}><KitText>{thread.title}</KitText><KitText size={13} c={color.muted}>{thread.preview}</KitText></Stack><KitIcon name={thread.pinned ? 'bookmark' : 'chevron'} size={18} ink={color.muted} /></Row></Pressable></React.Fragment>; })}</Stack>;
}
export function MemberProfile({ name, rank, subtitle }: { name: string; rank: BeltRank; subtitle: string }) {
  return <Row><Avatar name={name} size={58} /><Stack gap={4} style={{ flex: 1 }}><KitText size={24} weight="bold">{name}</KitText><Badge>{rank[0].toUpperCase()+rank.slice(1)} Belt</Badge><KitText size={13} c={color.muted}>{subtitle}</KitText></Stack></Row>;
}
