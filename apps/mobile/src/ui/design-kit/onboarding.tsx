import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { color, alpha, useDesignPreferences } from './theme';
import { KitText, Row, Stack, Badge } from './primitives';
import { KitIcon } from './icons';
import { KaiOrb } from '../KaiOrb';
import { ProgressRing } from './learning';

function RevealBeat({ children, index }: { children: React.ReactNode; index: number }) {
  const { reducedMotion } = useDesignPreferences(); const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, delay: index*130, duration: 380, useNativeDriver: true }); animation.start();
    return () => animation.stop();
  },[reducedMotion,index,progress]);
  return <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange:[0,1], outputRange:[14,0] }) }] }}>{children}</Animated.View>;
}
/** Four different product objects in a structured composition, not four stacked cards. */
export function ProductReveal() {
  return <Stack gap={26}>
    <RevealBeat index={0}><Stack gap={10}><Row><KitIcon name="bolt" ink={color.cyan} /><KitText size={13} c={color.muted}>01 / DAILY TRADE IDEAS</KitText></Row><Row style={{ alignItems: 'baseline', justifyContent: 'space-between' }}><KitText size={36} weight="bold">A clear setup.</KitText><Badge tone="gold">A</Badge></Row><Row gap={6}><View style={{ flex: 1, height: 5, backgroundColor: color.red, borderRadius: 3 }} /><View style={{ flex: 2.6, height: 5, backgroundColor: color.green, borderRadius: 3 }} /></Row><Row style={{ justifyContent: 'space-between' }}><KitText size={12} c={color.cyan}>Entry</KitText><KitText size={12} c={color.red}>Stop</KitText><KitText size={12} c={color.green}>Target</KitText></Row></Stack></RevealBeat>
    <RevealBeat index={1}><Row style={{ alignItems: 'flex-start' }}><View style={{ flex: 1, paddingTop: 6 }}><KitText size={11} c={color.muted}>02 / COMMUNITY</KitText><KitText size={22} weight="semibold">Talk it through.</KitText></View><View style={{ width: 100, height: 72 }}>{['R','T','J'].map((name,i) => <View key={name} style={{ position: 'absolute', left: i*26, top: i%2*18, width: 46, height: 46, borderRadius: 23, backgroundColor: color.surface2, borderWidth: 2, borderColor: color.bg, alignItems: 'center', justifyContent: 'center' }}><KitText>{name}</KitText></View>)}</View></Row></RevealBeat>
    <RevealBeat index={2}><Stack gap={8}><KitText size={11} c={color.muted}>03 / INVEST OR TRADE</KitText><KitText size={22} weight="semibold">Your pace. Your plan.</KitText><Row gap={5}>{[22,29,24,38,34,48,43,61,57,75,70,91,86].map((height,i) => <View key={i} style={{ flex: 1, height: height*.5, alignSelf: 'flex-end', borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: alpha.cyan40 }} />)}</Row></Stack></RevealBeat>
    <RevealBeat index={3}><Row><ProgressRing progress={.68} size={58}><KitIcon name="book" ink={color.volt} /></ProgressRing><Stack gap={5} style={{ flex: 1 }}><KitText size={11} c={color.muted}>04 / LEARN WITH KAI</KitText><KitText size={22} weight="semibold">Build real skill.</KitText></Stack><KaiOrb size={36} /></Row></RevealBeat>
  </Stack>;
}
export function PersonalPlan({ interests, name, priceLabel, availability }: { interests: readonly string[]; name: string; priceLabel: string; availability: string }) {
  return <Stack gap={24}><Stack gap={14}>{interests.map(interest => <Row key={interest}><KitIcon name="check" size={19} ink={color.volt} /><KitText style={{ flex: 1 }}>{interest}</KitText></Row>)}</Stack><View style={{ height: 1, backgroundColor: alpha.ivory12 }} /><Stack gap={4}><KitText size={13} c={color.muted}>{availability}</KitText><KitText size={30} weight="bold">{name}</KitText><KitText mono size={38}>{priceLabel}</KitText></Stack></Stack>;
}
