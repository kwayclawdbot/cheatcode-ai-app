import React, { useId } from 'react';
import { View, Pressable } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Path, Line, Rect } from 'react-native-svg';
import { color, alpha, belt } from './theme';
import { ActionButton, Badge, Divider, KitText, Row, Stack } from './primitives';
import { KitIcon } from './icons';
export type BeltRank = keyof typeof belt;
export function ProgressRing({ progress, size = 160, children, ink = color.volt, label = 'Progress' }: { progress: number; size?: number; children?: React.ReactNode; ink?: string; label?: string }) {
  const value = Number.isFinite(progress) ? Math.min(1, Math.max(0,progress)) : 0; const r = 45; const circumference = 2*Math.PI*r;
  return <View accessibilityLabel={`${label}: ${Math.round(value*100)} percent`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}><Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}><Circle cx={50} cy={50} r={r} fill="none" stroke={alpha.ivory12} strokeWidth={3} /><Circle cx={50} cy={50} r={r} fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${circumference*value} ${circumference}`} rotation={-90} origin="50,50" /></Svg>{children}</View>;
}
/** Procedural woven belt, scalable SVG. This is a rank object, never a trade signal. */
export function BeltEmblem({ rank = 'white', size = 150 }: { rank?: BeltRank; size?: number }) {
  const id = `belt-${useId().replace(/:/g,'')}`; const ink = belt[rank];
  return <Svg width={size} height={size*.6} viewBox="0 0 200 120" accessibilityLabel={`${rank} belt`}>
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={ink} /><Stop offset=".5" stopColor={ink} stopOpacity={.7} /><Stop offset="1" stopColor={ink} stopOpacity={.95} /></LinearGradient></Defs>
    <Path d="M12 40 190 33 189 65 12 72Z" fill={`url(#${id})`} /><Path d="M86 56 119 65 94 116 68 99Z" fill={`url(#${id})`} /><Path d="m106 56 24-11 38 57-26 14Z" fill={`url(#${id})`} /><Path d="m86 34 36-6 14 37-36 14Z" fill={`url(#${id})`} />
    {Array.from({length:6},(_,i) => <Line key={i} x1={16} y1={44+i*4} x2={184} y2={38+i*4} stroke={color.bg} strokeOpacity={.12} strokeWidth={.8} />)}
    <Path d="m96 37 20-3 12 27-21 10Z" stroke={color.bg} strokeOpacity={.2} fill="none" />
  </Svg>;
}
/** 100 ownership tiles are a visualization; accessible stepper offers 48px targets. */
export function OwnershipGrid({ selected, onChange, total = 100 }: { selected: number; onChange?: (value: number) => void; total?: number }) {
  const denominator = Number.isFinite(total) ? Math.max(1,Math.min(100,Math.floor(total))) : 100;
  const count = Number.isFinite(selected) ? Math.max(0,Math.min(denominator,Math.floor(selected))) : 0;
  return <Stack gap={18}><View accessible accessibilityRole="image" accessibilityLabel={`${count} of ${denominator} shares selected. You own ${Math.round(count/denominator*100)} percent of this example company.`} style={{ gap: 5, width: '100%', maxWidth: 286, alignSelf: 'center' }}>
    {Array.from({ length: Math.ceil(denominator/10) },(_,row) => <Row key={row} gap={5}>{Array.from({ length: Math.min(10,denominator-row*10) },(_,col) => <View key={col} style={{ flex: 1, aspectRatio: 1, borderRadius: 4, backgroundColor: row*10+col < count ? color.volt : alpha.ivory16, borderTopWidth: 1, borderColor: alpha.ivory20 }} />)}</Row>)}
  </View><KitText size={13} c={color.muted} align="center">Example company · {denominator} shares total</KitText>
    {onChange && <Row style={{ justifyContent: 'center' }}><Pressable accessibilityRole="button" accessibilityLabel="Own one fewer share" accessibilityState={{ disabled: count === 0 }} disabled={count === 0} onPress={() => onChange(count-1)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><KitText size={24}>−</KitText></Pressable><KitText mono size={24}>{count} shares</KitText><Pressable accessibilityRole="button" accessibilityLabel="Own one more share" accessibilityState={{ disabled: count === denominator }} disabled={count === denominator} onPress={() => onChange(count+1)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><KitIcon name="plus" /></Pressable></Row>}
    <Row style={{ justifyContent: 'center', alignItems: 'baseline' }}><KitText mono size={38} c={color.volt}>{Math.round(count/denominator*100)}%</KitText><KitText c={color.muted}>ownership</KitText></Row>
  </Stack>;
}
export type Lesson = { id: string; title: string; description: string; duration: string; state: 'available' | 'complete' | 'locked' | 'coming'; };
export function LessonPath({ lessons, onOpen }: { lessons: readonly Lesson[]; onOpen: (id: string) => void }) {
  return <Stack gap={0}>{lessons.map((lesson,i) => <Pressable key={lesson.id} accessibilityRole="button" accessibilityLabel={`${lesson.title}, ${lesson.state}`} accessibilityState={{ disabled: lesson.state === 'locked' || lesson.state === 'coming' }} disabled={lesson.state === 'locked' || lesson.state === 'coming'} onPress={() => onOpen(lesson.id)} style={{ flexDirection: 'row', gap: 16, minHeight: 90 }}>
    <Stack gap={0} style={{ alignItems: 'center', width: 44 }}><View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: lesson.state === 'available' ? color.volt : alpha.ivory06, borderWidth: 1, borderColor: lesson.state === 'complete' ? color.green : alpha.ivory12 }}>{lesson.state === 'available' ? <KitText c={color.bg} weight="bold">{i+1}</KitText> : <KitIcon name={lesson.state === 'complete' ? 'check' : 'lock'} size={18} ink={lesson.state === 'complete' ? color.green : color.muted} />}</View>{i < lessons.length-1 && <View style={{ flex: 1, width: 1, backgroundColor: alpha.ivory20 }} />}</Stack><Stack gap={3} style={{ flex: 1, paddingBottom: 22 }}><KitText weight="medium">{lesson.title}</KitText><KitText size={13} c={color.muted}>{lesson.description}</KitText><KitText size={12} c={lesson.state === 'available' ? color.volt : color.muted}>{lesson.state === 'coming' ? 'Coming next' : lesson.state === 'locked' ? 'Complete the previous lesson' : lesson.duration}</KitText></Stack>
  </Pressable>)}</Stack>;
}
export type Skill = { id: string; label: string; complete: boolean; evidence: string };
export function SkillChecklist({ skills }: { skills: readonly Skill[] }) {
  return <Stack gap={0}>{skills.map(skill => <Row key={skill.id} style={{ minHeight: 68, paddingVertical: 12, borderBottomWidth: 1, borderColor: alpha.ivory12 }}><View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: skill.complete ? color.green : color.muted, alignItems: 'center', justifyContent: 'center' }}>{skill.complete && <KitIcon name="check" size={15} ink={color.green} />}</View><Stack gap={3} style={{ flex: 1 }}><KitText>{skill.label}</KitText><KitText size={12} c={color.muted}>{skill.evidence}</KitText></Stack></Row>)}</Stack>;
}
export function CandleAnatomy({ selected, onSelect }: { selected: 'body' | 'wick'; onSelect: (part: 'body' | 'wick') => void }) {
  return <Stack><View accessible accessibilityRole="image" accessibilityLabel="An up candle: the body spans open to close; the wick spans low to high." style={{ alignItems: 'center' }}><Svg width="100%" height={190} viewBox="0 0 340 190"><Line x1={120} x2={120} y1={12} y2={178} stroke={color.cyan} strokeWidth={3} /><Rect x={96} y={48} width={48} height={91} rx={4} fill={color.cyan} /><Line x1={152} x2={204} y1={48} y2={48} stroke={color.muted} /><Line x1={152} x2={204} y1={139} y2={139} stroke={color.muted} /><Path d={selected === 'body' ? 'M78 48H66v91h12' : 'M105 12H78v35h12'} fill="none" stroke={color.violetLight} strokeWidth={2} /></Svg></View><Row><View style={{ flex: 1 }}><ActionButton label="Body" variant={selected === 'body' ? 'primary' : 'secondary'} icon={false} onPress={() => onSelect('body')} /></View><View style={{ flex: 1 }}><ActionButton label="Wick" variant={selected === 'wick' ? 'primary' : 'secondary'} icon={false} onPress={() => onSelect('wick')} /></View></Row><KitText c={color.muted}>{selected === 'body' ? 'The body shows the distance from open to close.' : 'The wick shows the highest and lowest prices reached.'}</KitText></Stack>;
}
export function VideoLesson({ title, creator, duration, onPlay, onTranscript }: { title: string; creator: string; duration: string; onPlay: () => void; onTranscript: () => void }) {
  return <Stack><Pressable accessibilityRole="button" accessibilityLabel={`Play ${title}, ${duration}`} onPress={onPlay} style={{ minHeight: 185, borderRadius: 16, borderWidth: 1, borderColor: alpha.ivory12, backgroundColor: alpha.cyan07, padding: 20, justifyContent: 'space-between' }}><Row style={{ justifyContent: 'space-between' }}><Badge>Companion video</Badge><KitText size={12}>{duration}</KitText></Row><View style={{ alignItems: 'center', padding: 10 }}><KitIcon name="play" size={36} /></View><KitText size={22} weight="semibold">{title}</KitText></Pressable><Row style={{ justifyContent: 'space-between' }}><KitText size={13} c={color.muted}>{creator}</KitText><Pressable accessibilityRole="button" onPress={onTranscript} style={{ paddingVertical: 12 }}><KitText size={13} c={color.violetLight}>Read transcript</KitText></Pressable></Row></Stack>;
}
