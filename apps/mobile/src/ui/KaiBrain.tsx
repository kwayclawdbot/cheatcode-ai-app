import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle, Ellipse, Line } from 'react-native-svg';
import { T } from './Text';
import { KaiOrb } from './KaiOrb';
import { alpha, color } from './tokens';
import { useReducedMotion } from '../features/a11y/context';
import { BRAIN_REGIONS, STATE_WORD, listLabels, type BrainRegion, type KaiState } from '../features/home/warroom';

/**
 * KAI'S BRAIN — the War Room's centrepiece, drawn for a phone.
 * ===========================================================================
 *
 * The desktop War Room drew this as a 3D particle field. That is too heavy for
 * a phone running in Expo Go, so this is the same idea as a light vector
 * drawing: a web of dots in two hemispheres, split into the eight regions Kai
 * reasons with. A region lights when he uses the tool behind it; the whole
 * thing breathes slowly while he is idle, so it never sits frozen.
 *
 * WHAT MOVES, AND WHAT STOPS UNDER REDUCE MOTION.
 *   - the breath (a slow scale and shimmer)       → stops
 *   - the rings (follow the mic, pulse on speech) → stop, drawn still
 *   - a region lighting or going dark             → still fades: a change of
 *     colour is not movement (see `useReducedMotion` in features/a11y)
 *
 * Every colour is a token. The one violet object in the app is Kai, and this
 * is Kai, so the brain is violet; the rings go volt while the MEMBER is talking,
 * because volt is theirs.
 *
 * This is identity, not chrome: it is hand-drawn, and it knows nothing about
 * where its state comes from. Home decides (features/home/warroom.ts).
 */

/* ───────────────────────── the drawing, computed once ───────────────────── */

const VB_W = 200;
const VB_H = 160;
const CENTER = { x: VB_W / 2, y: VB_H / 2 };

/** Where each region sits in the 200×160 drawing. Left hemisphere, then right. */
const REGION_AT: Record<BrainRegion, { x: number; y: number }> = {
  memory: { x: 72, y: 30 },
  market: { x: 52, y: 62 },
  technicals: { x: 50, y: 98 },
  alerts: { x: 68, y: 130 },
  watchlist: { x: 128, y: 30 },
  community: { x: 148, y: 62 },
  news: { x: 150, y: 98 },
  options: { x: 132, y: 130 },
};

type Pt = { x: number; y: number };
type Seg = { a: Pt; b: Pt };

/** A seeded generator, so the brain is the same brain on every render and every phone. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

type RegionShape = { hub: Pt; nodes: Pt[]; edges: Seg[] };

function buildBrain() {
  const rnd = seeded(20260921);
  const regions = {} as Record<BrainRegion, RegionShape>;
  for (const { key } of BRAIN_REGIONS) {
    const hub = REGION_AT[key];
    const nodes: Pt[] = [];
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + rnd() * 0.7;
      const r = 0.45 + rnd() * 0.55;
      nodes.push({ x: hub.x + Math.cos(ang) * 21 * r, y: hub.y + Math.sin(ang) * 14 * r });
    }
    const edges: Seg[] = nodes.map((n) => ({ a: hub, b: n }));
    nodes.forEach((n, i) => {
      let best = -1;
      let bestD = Infinity;
      nodes.forEach((m, j) => {
        if (j === i) return;
        const d = dist(n, m);
        if (d < bestD) { bestD = d; best = j; }
      });
      if (best > i) edges.push({ a: n, b: nodes[best] });
      edges.push({ a: n, b: nodes[(i + 1) % nodes.length] });
    });
    regions[key] = { hub, nodes, edges };
  }

  // The stem down the middle, and the threads that tie the regions together.
  const stem: Pt[] = [{ x: 100, y: 38 }, { x: 100, y: 80 }, { x: 100, y: 122 }];
  const links: Seg[] = [
    { a: stem[0], b: stem[1] }, { a: stem[1], b: stem[2] },
  ];
  const left: BrainRegion[] = ['memory', 'market', 'technicals', 'alerts'];
  const right: BrainRegion[] = ['watchlist', 'community', 'news', 'options'];
  for (const side of [left, right]) {
    for (let i = 0; i < side.length - 1; i++) links.push({ a: REGION_AT[side[i]], b: REGION_AT[side[i + 1]] });
    side.forEach((k) => {
      const hub = REGION_AT[k];
      const nearest = stem.reduce((p, s) => (dist(s, hub) < dist(p, hub) ? s : p), stem[0]);
      links.push({ a: hub, b: nearest });
    });
  }
  return { regions, stem, links };
}

const BRAIN = buildBrain();

const nativeDriver = Platform.OS !== 'web';

/* ───────────────────────────────── layers ───────────────────────────────── */

/** The whole web, drawn quietly. What is lit is drawn again on top of it. */
function BaseLayer({ offline }: { offline: boolean }) {
  const ink = offline ? color.dim : color.violet;
  const dot = offline ? color.dim : color.violetLight;
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {/* Two hemispheres, the outline of the thing. */}
      <Ellipse cx={72} cy={80} rx={52} ry={74} stroke={ink} strokeOpacity={offline ? 0.18 : 0.22} strokeWidth={0.6} strokeDasharray="1.5 3" fill="none" />
      <Ellipse cx={128} cy={80} rx={52} ry={74} stroke={ink} strokeOpacity={offline ? 0.18 : 0.22} strokeWidth={0.6} strokeDasharray="1.5 3" fill="none" />
      {BRAIN.links.map((s, i) => (
        <Line key={`l${i}`} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={ink} strokeOpacity={offline ? 0.2 : 0.3} strokeWidth={0.6} />
      ))}
      {BRAIN_REGIONS.map(({ key }) => {
        const r = BRAIN.regions[key];
        return (
          <React.Fragment key={key}>
            {r.edges.map((s, i) => (
              <Line key={`${key}e${i}`} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={ink} strokeOpacity={offline ? 0.16 : 0.26} strokeWidth={0.5} />
            ))}
            {r.nodes.map((n, i) => (
              <Circle key={`${key}n${i}`} cx={n.x} cy={n.y} r={1.3} fill={dot} fillOpacity={offline ? 0.3 : 0.4} />
            ))}
            <Circle cx={r.hub.x} cy={r.hub.y} r={1.9} fill={dot} fillOpacity={offline ? 0.35 : 0.55} />
          </React.Fragment>
        );
      })}
      {BRAIN.stem.map((n, i) => (
        <Circle key={`s${i}`} cx={n.x} cy={n.y} r={1.6} fill={dot} fillOpacity={offline ? 0.3 : 0.5} />
      ))}
    </Svg>
  );
}

/** One region, lit: brighter threads, brighter dots, a glow behind the hub. */
function LitLayer({ region }: { region: BrainRegion }) {
  const r = BRAIN.regions[region];
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <Circle cx={r.hub.x} cy={r.hub.y} r={24} fill={color.violet} fillOpacity={0.14} />
      <Circle cx={r.hub.x} cy={r.hub.y} r={12} fill={color.violet} fillOpacity={0.18} />
      {r.edges.map((s, i) => (
        <Line key={i} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={color.violetLight} strokeOpacity={0.85} strokeWidth={0.7} />
      ))}
      {r.nodes.map((n, i) => (
        <Circle key={`n${i}`} cx={n.x} cy={n.y} r={1.9} fill={color.violetLight} />
      ))}
      <Circle cx={r.hub.x} cy={r.hub.y} r={2.8} fill={color.text} />
    </Svg>
  );
}

/* ──────────────────────────────── the brain ─────────────────────────────── */

export type KaiBrainProps = {
  state: KaiState;
  lit: readonly BrainRegion[];
  /** 0–1, the member's voice while the mic is listening. Ignored otherwise. */
  level?: number;
  /** Height of the drawing itself, labels beside it. */
  height?: number;
  /** Larger text or a short screen: tighter labels so the drawing keeps its share. */
  compact?: boolean;
  testID?: string;
};

export function KaiBrain({ state, lit, level = 0, height = 150, compact = false, testID = 'kai-brain' }: KaiBrainProps) {
  const reduced = useReducedMotion();
  const offline = state === 'offline';
  const litSet = useMemo(() => new Set(lit), [lit]);

  /* The breath: a slow loop that never stops unless motion is off or Kai is. */
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    breath.stopAnimation();
    if (reduced || offline) { breath.setValue(0.5); return; }
    const period = state === 'thinking' ? 1100 : 3200;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: period, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
      Animated.timing(breath, { toValue: 0, duration: period, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [breath, reduced, offline, state]);

  /* Each region fades in and out. A fade is allowed under reduced motion. */
  const regionOn = useRef(BRAIN_REGIONS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const anims = BRAIN_REGIONS.map(({ key }, i) => Animated.timing(regionOn[i], {
      toValue: litSet.has(key) ? 1 : 0,
      duration: 450,
      easing: Easing.out(Easing.quad),
      useNativeDriver: nativeDriver,
    }));
    Animated.parallel(anims).start();
  }, [litSet, regionOn]);

  /* The rings: they follow the mic, pulse while Kai speaks, and rest otherwise. */
  const ring = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    ring.stopAnimation();
    if (reduced || offline) { ring.setValue(1); return; }
    if (state === 'speaking') {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(ring, { toValue: 1.2, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }),
        Animated.timing(ring, { toValue: 1, duration: 620, easing: Easing.in(Easing.quad), useNativeDriver: nativeDriver }),
      ]));
      loop.start();
      return () => loop.stop();
    }
    if (state !== 'listening') {
      Animated.timing(ring, { toValue: 1, duration: 300, useNativeDriver: nativeDriver }).start();
    }
    return undefined;
  }, [ring, state, reduced, offline]);
  useEffect(() => {
    if (reduced || offline || state !== 'listening') return;
    const v = Math.max(0, Math.min(1, level));
    Animated.spring(ring, { toValue: 1 + v * 0.6, speed: 28, bounciness: 4, useNativeDriver: nativeDriver }).start();
  }, [ring, level, state, reduced, offline]);

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] });
  const shimmer = breath.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] });
  const ringFade = ring.interpolate({ inputRange: [1, 1.6], outputRange: [0.9, 0.35], extrapolate: 'clamp' });

  const ringInk = offline ? alpha.ivory12 : state === 'listening' ? alpha.volt50 : alpha.violet45;
  const innerRing = height * 0.42;
  const outerRing = height * 0.7;

  const litKeys = BRAIN_REGIONS.map((r) => r.key).filter((k) => litSet.has(k));
  const a11yLabel = `Kai's brain. ${STATE_WORD[state]}.${litKeys.length ? ` Lit: ${listLabels(litKeys)}.` : ''}`;

  const label = (key: BrainRegion, text: string, side: 'left' | 'right') => {
    const on = litSet.has(key);
    const dot = (
      <View
        style={{
          width: 5, height: 5, borderRadius: 3,
          backgroundColor: on ? color.violetLight : alpha.ivory16,
        }}
      />
    );
    return (
      <View
        key={key}
        testID={on ? `kai-brain-lit-${key}` : `kai-brain-region-${key}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 4 : 5, justifyContent: side === 'left' ? 'flex-end' : 'flex-start' }}
      >
        {side === 'right' ? dot : null}
        <T mono size={11} weight={on ? 'bold' : 'medium'} ls={compact ? 0.2 : 0.6} lh={compact ? 13 : undefined} c={on ? color.violetLight : color.dim} numberOfLines={1}>
          {text.toUpperCase()}
        </T>
        {side === 'left' ? dot : null}
      </View>
    );
  };

  const column = (keys: typeof BRAIN_REGIONS, side: 'left' | 'right') => (
    <View style={{ justifyContent: 'space-between', paddingVertical: compact ? 0 : height * 0.1, flexShrink: 0 }}>
      {keys.map((r) => label(r.key, r.label, side))}
    </View>
  );

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
      style={{ flexDirection: 'row', alignItems: 'stretch', height, gap: 6 }}
    >
      {column(BRAIN_REGIONS.slice(0, 4), 'left')}
      <View style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, transform: [{ scale }] }}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <BaseLayer offline={offline} />
          </View>
          {BRAIN_REGIONS.map(({ key }, i) => (
            <Animated.View
              key={key}
              pointerEvents="none"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: regionOn[i] }}
            >
              <Animated.View style={{ flex: 1, opacity: shimmer }}>
                <LitLayer region={key} />
              </Animated.View>
            </Animated.View>
          ))}
        </Animated.View>
        {/* The rings sit around the middle of the brain, on the stem. */}
        {[outerRing, innerRing].map((d, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: d, height: d, borderRadius: d / 2,
              borderWidth: 1,
              borderColor: ringInk,
              opacity: i === 0 ? ringFade : 1,
              transform: [{ scale: i === 0 ? ring : ring.interpolate({ inputRange: [1, 1.6], outputRange: [1, 1.25] }) }],
            }}
          />
        ))}
        <View style={{ opacity: offline ? 0.35 : 1 }}>
          <KaiOrb size={20} glow={!offline} />
        </View>
      </View>
      {column(BRAIN_REGIONS.slice(4), 'right')}
    </View>
  );
}

/* ─────────────────────────────── status light ───────────────────────────── */

/** The colour of each state. Volt is the member talking; violet is Kai working. */
export function stateInk(state: KaiState): string {
  switch (state) {
    case 'ready': return color.green;
    case 'thinking':
    case 'speaking': return color.violetLight;
    case 'listening': return color.volt;
    default: return color.dim;
  }
}

/**
 * The top bar's status light: a dot and a word. The dot pulses while something
 * is happening and holds still when Kai is ready or offline — and always holds
 * still under reduce motion.
 */
export function KaiStatusLight({ state, testID = 'kai-status' }: { state: KaiState; testID?: string }) {
  const reduced = useReducedMotion();
  const ink = stateInk(state);
  const pulse = useRef(new Animated.Value(1)).current;
  const busy = state === 'thinking' || state === 'speaking' || state === 'listening';
  useEffect(() => {
    pulse.stopAnimation();
    if (reduced || !busy) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: nativeDriver }),
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: nativeDriver }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced, busy]);
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`Kai status: ${STATE_WORD[state]}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Animated.View
        style={{
          width: 7, height: 7, borderRadius: 4, backgroundColor: ink, opacity: pulse,
          shadowColor: ink, shadowOpacity: state === 'offline' ? 0 : 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
        }}
      />
      <T mono size={11} weight="semibold" ls={0.6} c={state === 'offline' ? color.muted : ink} testID={`${testID}-word`}>
        {STATE_WORD[state].toUpperCase()}
      </T>
    </View>
  );
}

/* ──────────────────────────────── HUD frame ─────────────────────────────── */

/**
 * The heads-up-display frame: four corner brackets and a small monospace label.
 * A frame, not a card — no fill, no border along the sides — so the brain reads
 * as something on the glass rather than a panel in a list.
 */
export function HudFrame({
  label, right, children, dim = false, compact = false, style, testID,
}: {
  label: string;
  /** Tighter padding and a smaller header gap, for large text or short screens. */
  compact?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  dim?: boolean;
  style?: object;
  testID?: string;
}) {
  const ink = dim ? alpha.ivory16 : alpha.violet45;
  const arm = 12;
  const corner = (pos: 'tl' | 'tr' | 'bl' | 'br') => (
    <View
      key={pos}
      pointerEvents="none"
      style={{
        position: 'absolute', width: arm, height: arm, borderColor: ink,
        top: pos[0] === 't' ? 0 : undefined,
        bottom: pos[0] === 'b' ? 0 : undefined,
        left: pos[1] === 'l' ? 0 : undefined,
        right: pos[1] === 'r' ? 0 : undefined,
        borderTopWidth: pos[0] === 't' ? 1 : 0,
        borderBottomWidth: pos[0] === 'b' ? 1 : 0,
        borderLeftWidth: pos[1] === 'l' ? 1 : 0,
        borderRightWidth: pos[1] === 'r' ? 1 : 0,
      }}
    />
  );
  return (
    <View testID={testID} style={[{ paddingHorizontal: 10, paddingTop: compact ? 4 : 8, paddingBottom: compact ? 5 : 10 }, style]}>
      {corner('tl')}{corner('tr')}{corner('bl')}{corner('br')}
      {/* Compact drops the label row: the bar above already reads KAI · WAR ROOM,
          and on large text those 18 points are what keep the first button in view. */}
      {compact && !right ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <T mono size={11} weight="semibold" ls={1.1} c={color.dim}>{label}</T>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}
