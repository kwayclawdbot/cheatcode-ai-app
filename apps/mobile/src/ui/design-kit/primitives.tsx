import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { T, type TProps } from '../Text';
import { KaiOrb } from '../KaiOrb';
import { color, alpha, layout, useDesignPreferences } from './theme';
import { KitIcon, type IconName } from './icons';

export function KitText({ size = 16, lh, ...props }: TProps) {
  const { textScale } = useDesignPreferences();
  return <T {...props} size={size * textScale} lh={(lh ?? size * 1.4) * textScale} />;
}
export function Stack({ children, gap = 16, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}
export function Row({ children, style, gap = 12 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[s.row, { gap }, style]}>{children}</View>;
}
export function Eyebrow({ children }: { children: ReactNode }) { return <KitText size={11} ls={2} c={color.muted}>{children}</KitText>; }
export function SectionHeading({ title, subtitle, eyebrow }: { title: string; subtitle?: string; eyebrow?: string }) {
  return <Stack gap={6}>{eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}<KitText size={28} weight="bold" lh={32}>{title}</KitText>{subtitle && <KitText c={color.muted}>{subtitle}</KitText>}</Stack>;
}
export function Divider() { return <View style={{ height: 1, backgroundColor: alpha.ivory12 }} />; }
export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.surface, style]}>{children}</View>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'kai' | 'positive' | 'risk' }) {
  const inks = { neutral: color.muted, gold: color.gold, kai: color.violetLight, positive: color.green, risk: color.red };
  return <View style={[s.badge, { borderColor: inks[tone] }]}><KitText size={11} c={inks[tone]}>{children}</KitText></View>;
}
export function IconButton({ name, label, onPress }: { name: IconName; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.iconButton, { opacity: pressed ? .55 : 1 }]}><KitIcon name={name} /></Pressable>;
}
export function ActionButton({ label, onPress, variant = 'primary', icon = 'arrow', disabled, busy }: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'kai' | 'danger'; icon?: IconName | false; disabled?: boolean; busy?: boolean;
}) {
  const primary = variant === 'primary';
  const ink = primary ? color.bg : variant === 'kai' ? color.violetLight : variant === 'danger' ? color.red : color.text;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [s.button, { backgroundColor: primary ? color.volt : variant === 'kai' ? alpha.violet08 : alpha.ivory04, borderColor: primary ? color.volt : variant === 'kai' ? alpha.violet45 : alpha.ivory12, opacity: disabled ? .4 : pressed ? .7 : 1 }]}>
    <KitText weight="semibold" c={ink} style={{ flexShrink: 1 }}>{label}</KitText>{busy ? <ActivityIndicator color={ink} /> : icon && <KitIcon name={icon} ink={ink} size={20} />}
  </Pressable>;
}
export function SelectionRow({ title, detail, selected, icon, onPress, disabled = false }: {
  title: string; detail?: string; selected?: boolean; icon?: IconName; onPress: () => void; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.selection, { borderColor: selected ? color.volt : alpha.ivory12, backgroundColor: selected ? alpha.volt04 : 'transparent', opacity: disabled ? .5 : pressed ? .6 : 1 }]}>
    {icon && <KitIcon name={icon} ink={selected ? color.volt : color.muted} />}<Stack gap={3} style={{ flex: 1 }}><KitText weight="medium">{title}</KitText>{detail && <KitText size={13} c={color.muted}>{detail}</KitText>}</Stack><KitIcon name={selected ? 'check' : 'chevron'} size={18} ink={selected ? color.volt : color.muted} />
  </Pressable>;
}
export function SegmentedControl({ options, value, onChange }: { options: readonly { id: string; label: string; count?: number }[]; value: string; onChange: (value: string) => void }) {
  return <Row gap={0} style={{ borderBottomWidth: 1, borderBottomColor: alpha.ivory12 }}>{options.map(option => <Pressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: value === option.id }} onPress={() => onChange(option.id)} style={[s.segment, { borderBottomColor: value === option.id ? color.volt : 'transparent' }]}><KitText size={14} weight={value === option.id ? 'semibold' : 'regular'} c={value === option.id ? color.text : color.muted}>{option.label}{option.count === undefined ? '' : ` ${option.count}`}</KitText></Pressable>)}</Row>;
}
export type MainTab = 'home' | 'alerts' | 'community' | 'trade' | 'account';
export function BottomNavigation({ active, invest = false, onChange }: { active: MainTab; invest?: boolean; onChange: (tab: MainTab) => void }) {
  const names: MainTab[] = ['home', 'alerts', 'community', 'trade', 'account'];
  return <Row gap={0} style={s.nav}>{names.map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: tab === active }} onPress={() => onChange(tab)} style={s.navItem}><KitIcon name={tab === 'alerts' && invest ? 'search' : tab} ink={tab === active ? color.volt : color.muted} size={22} /><KitText size={10} c={tab === active ? color.volt : color.muted}>{tab === 'alerts' && invest ? 'Research' : tab.charAt(0).toUpperCase() + tab.slice(1)}</KitText></Pressable>)}</Row>;
}
/** Draft clears only after success, and is retained on failure. No canned AI response. */
export function MessageComposer({ onSend, kind = 'kai', placeholder, disabled = false }: { onSend: (text: string) => Promise<void>; kind?: 'kai' | 'community'; placeholder?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const sending = useRef(false);
  const { textScale } = useDesignPreferences();
  async function send() {
    const text = draft.trim(); if (!text || disabled || sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try { await onSend(text); setDraft(current => current === draft ? '' : current); }
    catch { setError('Message not sent. Your draft is saved here. Try again.'); }
    finally { sending.current = false; setBusy(false); }
  }
  return <Stack gap={6}><Row gap={10} style={[s.composer, { borderColor: kind === 'kai' ? alpha.violet45 : alpha.ivory20 }]}>
    {kind === 'kai' && <KaiOrb size={28} />}
    <TextInput accessibilityLabel={kind === 'kai' ? 'Message Kai' : 'Message room'} placeholder={placeholder ?? (kind === 'kai' ? 'Ask Kai…' : 'Message the room…')} placeholderTextColor={color.muted} value={draft} onChangeText={setDraft} editable={!disabled} multiline style={[s.input, { fontSize: 16 * textScale }]} />
    <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Sending message' : 'Send message'} accessibilityState={{ disabled: disabled || busy || !draft.trim(), busy }} disabled={disabled || busy || !draft.trim()} onPress={send} style={[s.iconButton, { opacity: draft.trim() && !disabled ? 1 : .4 }]}>{busy ? <ActivityIndicator color={color.muted} /> : <KitIcon name="send" ink={kind === 'kai' ? color.violetLight : color.text} />}</Pressable>
  </Row>{error && <KitText accessibilityRole="alert" size={13} c={color.red}>{error}</KitText>}</Stack>;
}
export function ScreenFrame({ title, children, leading, trailing, dock, navigation, contentKey, insets = { top: 0, bottom: 0 } }: {
  title: string; children: ReactNode; leading?: ReactNode; trailing?: ReactNode; dock?: ReactNode; navigation?: ReactNode; contentKey?: string; insets?: { top: number; bottom: number };
}) {
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [contentKey]);
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <Row gap={4} style={s.header}><View style={{ width: 48 }}>{leading}</View><KitText weight="semibold" size={18} style={{ flex: 1, textAlign: 'center' }}>{title}</KitText><View style={{ minWidth: 48, alignItems: 'flex-end' }}>{trailing}</View></Row>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Stack gap={24}>{children}</Stack></ScrollView>
      {dock && <View style={s.dock}>{dock}</View>}{navigation}
    </View>
  </KeyboardAvoidingView>;
}
export function SettingToggle({ title, detail, value, onChange }: { title: string; detail?: string; value: boolean; onChange: (value: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={s.setting}><Stack gap={3} style={{ flex: 1 }}><KitText>{title}</KitText>{detail && <KitText size={13} c={color.muted}>{detail}</KitText>}</Stack><View style={{ width: 48, height: 28, borderRadius: 16, padding: 3, backgroundColor: value ? color.volt : alpha.ivory20, alignItems: value ? 'flex-end' : 'flex-start' }}><View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: value ? color.bg : color.text }} /></View></Pressable>;
}
export function FormField({ label, value, onChange, secure = false, error, email = false }: { label: string; value: string; onChange: (value: string) => void; secure?: boolean; error?: string; email?: boolean }) {
  const { textScale } = useDesignPreferences();
  return <Stack gap={7}><KitText size={13} c={color.muted}>{label}</KitText><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} secureTextEntry={secure} autoCapitalize="none" keyboardType={email ? 'email-address' : 'default'} autoComplete={email ? 'email' : secure ? 'new-password' : 'off'} style={[s.field, { fontSize: 16 * textScale }]} />{error && <KitText size={13} c={color.red}>{error}</KitText>}</Stack>;
}
export function FeedbackState({ title, message, icon = 'wifi', action }: { title: string; message: string; icon?: IconName; action?: ReactNode }) {
  return <Stack gap={18} style={{ paddingVertical: 24 }}><KitIcon name={icon} size={36} ink={color.muted} /><SectionHeading title={title} subtitle={message} />{action}</Stack>;
}
export function LoadingState({ label = 'Loading your workspace…' }: { label?: string }) {
  return <Row><ActivityIndicator color={color.violetLight} /><KitText accessibilityRole="alert" c={color.muted}>{label}</KitText></Row>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  surface: { borderWidth: 1, borderColor: alpha.ivory12, borderRadius: 16, padding: 16, backgroundColor: alpha.ivory035, gap: 16 },
  badge: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  button: { minHeight: 52, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13 },
  iconButton: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  selection: { minHeight: 64, borderBottomWidth: 1, paddingVertical: 14, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 14 },
  segment: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, padding: 5 },
  nav: { borderTopWidth: 1, borderColor: alpha.ivory12, paddingTop: 4, paddingBottom: 6, paddingHorizontal: 6 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 54 },
  composer: { minHeight: 56, borderWidth: 1, borderRadius: 16, paddingLeft: 12, paddingRight: 2, backgroundColor: alpha.ivory035 },
  input: { flex: 1, minWidth: 0, minHeight: 44, maxHeight: 112, paddingVertical: 12, color: color.text, fontFamily: 'SpaceGrotesk_400Regular' },
  header: { minHeight: 64, paddingHorizontal: 12 },
  content: { paddingHorizontal: layout.gutter, paddingTop: 10, paddingBottom: 24, width: '100%', maxWidth: layout.contentMax, alignSelf: 'center' },
  dock: { paddingHorizontal: layout.gutter, paddingTop: 8, paddingBottom: 10, gap: 8, width: '100%', maxWidth: layout.contentMax, alignSelf: 'center' },
  setting: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 72, paddingVertical: 14, borderBottomWidth: 1, borderColor: alpha.ivory12 },
  field: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: alpha.ivory20, color: color.text, padding: 14, fontFamily: 'SpaceGrotesk_400Regular', backgroundColor: alpha.ivory04 },
});
