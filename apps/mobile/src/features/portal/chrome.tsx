/**
 * Portal chrome — top bar, timeframe rail, context switcher, annotation
 * inspector and the ticker switcher sheet. Asset-workspace.html is pixel truth.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View, ScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { T, Num } from '../../ui/Text';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { Search } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { family } from '../../ui/fonts';
import { PaperChip } from '../trade/components';
import { api } from '../../lib/api';
import type { Quote, SearchResult } from '../../lib/types';
import { kindColor } from '../chart/semantics';
import type { Annotation, PortalContext, PortalTimeframe } from './types';
import { KIND_LABEL, PROVENANCE_LABEL } from './types';

const Chevron = ({ size = 11, c = color.muted }: { size?: number; c?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.5}>
    <Path d="M6 9l6 6 6-6" />
  </Svg>
);
const Back = ({ size = 20 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color.text} strokeWidth={2.2}>
    <Path d="M15 5l-7 7 7 7" />
  </Svg>
);
const Layers = ({ size = 16, c = color.muted }: { size?: number; c?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2}>
    <Path d="M7 4v16M12 8v8M17 6v12" />
  </Svg>
);
const Panels = ({ size = 16, c = color.muted }: { size?: number; c?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2}>
    <Path d="M4 4h16v16H4z" />
    <Path d="M10 4v16" />
  </Svg>
);

/* ------------------------------------------------------------------ */
/* Top bar                                                              */
/* ------------------------------------------------------------------ */

export function PortalTopBar({
  symbol, name, quote, marketState, paper, onBack, onSwitchTicker, onOpenDrawers, volumeLine,
}: {
  symbol: string;
  name: string | null;
  quote: Quote | null;
  marketState: string | null;
  paper: boolean;
  onBack: () => void;
  onSwitchTicker: () => void;
  onOpenDrawers: () => void;
  volumeLine?: string | null;
}) {
  const up = (quote?.change_pct ?? 0) >= 0;
  return (
    <View testID="portal-top-bar">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 }}>
        <Pressable
          testID="portal-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Back />
        </Pressable>
        <Pressable
          testID="ticker-switcher"
          accessibilityRole="button"
          accessibilityLabel={`${symbol}${name ? `, ${name}` : ''}. Switch symbol`}
          onPress={onSwitchTicker}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 }}
        >
          <T size={16} weight="bold">{symbol}</T>
          <Chevron />
        </Pressable>
        <PaperChip label={paper ? 'Paper' : 'Live'} testID="portal-paper-chip" />
        <Pressable
          testID="open-drawers"
          accessibilityRole="button"
          accessibilityLabel="Watchlist, positions and account"
          onPress={onOpenDrawers}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ minHeight: 32, justifyContent: 'center' }}
        >
          <Panels size={18} c={color.muted} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9, paddingHorizontal: 16, paddingBottom: 2 }}>
        <Num size={27} weight="semibold" c={color.cyan} testID="portal-price">
          {quote?.price != null ? quote.price.toFixed(2) : '—'}
        </Num>
        {quote?.change_pct != null ? (
          <Num size={13} weight="regular" c={up ? color.green : color.red}>
            {`${up ? '+' : ''}${quote.change_pct.toFixed(2)}%`}
          </Num>
        ) : null}
        <FreshnessMark freshness={quote?.freshness ?? 'unknown'} delayReason={quote?.delay_reason} size={10} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Num size={10.5} weight="regular" c={color.dim}>
          {[volumeLine, marketState].filter(Boolean).join(' · ') || (name ?? '')}
        </Num>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Timeframe rail                                                       */
/* ------------------------------------------------------------------ */

export function TimeframeRail({
  value, options, onChange, exact = true, onToggleAnnotations, annotationsHidden,
}: {
  value: PortalTimeframe;
  options: PortalTimeframe[];
  onChange: (t: PortalTimeframe) => void;
  exact?: boolean;
  onToggleAnnotations?: () => void;
  annotationsHidden?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} testID="timeframe-rail">
      {options.map((t) => {
        const on = t === value;
        return (
          <Pressable
            key={t}
            testID={`tf-${t}`}
            accessibilityRole="button"
            accessibilityLabel={`${t} chart`}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t)}
            hitSlop={{ top: 10, bottom: 10, left: 2, right: 2 }}
            style={{
              height: 23,
              paddingHorizontal: 8,
              borderRadius: radius.sm,
              backgroundColor: on ? alpha.cyan14 : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Num size={10} weight={on ? 'bold' : 'regular'} c={on ? color.cyan : color.dim}>{t}</Num>
          </Pressable>
        );
      })}
      <View style={{ flex: 1 }} />
      {!exact ? <T size={9} c={color.gold}>coarser bars</T> : null}
      <Pressable
        testID="toggle-annotations"
        accessibilityRole="button"
        accessibilityLabel={annotationsHidden ? 'Show Kai levels' : 'Hide Kai levels'}
        onPress={onToggleAnnotations}
        hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
        style={{ marginLeft: 10 }}
      >
        <Layers size={15} c={annotationsHidden ? color.dim : color.violetLight} />
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Context switcher — Kai · Alert · Plan · Community                    */
/* ------------------------------------------------------------------ */

const CONTEXTS: { key: PortalContext; label: string }[] = [
  { key: 'kai', label: 'Kai' },
  { key: 'alert', label: 'Alert' },
  { key: 'plan', label: 'Plan' },
  { key: 'community', label: 'Community' },
];

export function ContextSwitcher({
  value, onChange, disabled,
}: { value: PortalContext; onChange: (c: PortalContext) => void; disabled?: Partial<Record<PortalContext, boolean>> }) {
  return (
    <View
      testID="context-switcher"
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderBottomColor: alpha.ivory08 }}
    >
      {CONTEXTS.map((c) => {
        const on = c.key === value;
        const off = disabled?.[c.key];
        return (
          <Pressable
            key={c.key}
            testID={`ctx-${c.key}`}
            accessibilityRole="tab"
            accessibilityLabel={c.label}
            accessibilityState={{ selected: on, disabled: !!off }}
            onPress={() => onChange(c.key)}
            style={{
              paddingBottom: 8,
              marginBottom: -1,
              borderBottomWidth: 2,
              borderBottomColor: on ? color.volt : 'transparent',
              minHeight: 32,
            }}
          >
            <T size={13} weight={on ? 'bold' : 'semibold'} c={on ? color.text : off ? color.dim : color.muted}>
              {c.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Annotation inspector — reason + provenance + hide/delete (§7)        */
/* ------------------------------------------------------------------ */

export function AnnotationSheet({
  annotation, onClose, onHide, onDelete, onExplain,
}: {
  annotation: Annotation | null;
  onClose: () => void;
  onHide: (a: Annotation) => void;
  onDelete: (a: Annotation) => void;
  onExplain: (a: Annotation) => void;
}) {
  const a = annotation;
  return (
    <Sheet visible={!!a} onClose={onClose} testID="annotation-sheet">
      {a ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View
              style={{
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm,
                backgroundColor: `${kindColor(a.kind)}1F`, borderWidth: 0.5, borderColor: `${kindColor(a.kind)}88`,
              }}
            >
              <T size={11} weight="bold" c={kindColor(a.kind)}>{KIND_LABEL[a.kind]}</T>
            </View>
            <Num size={18} weight="semibold" c={kindColor(a.kind)} testID="annotation-price">
              {a.price2 != null && a.price != null
                ? `${a.price.toFixed(2)}–${a.price2.toFixed(2)}`
                : a.price != null ? a.price.toFixed(2) : '—'}
            </Num>
            {a.status === 'invalidated' ? <T size={11} c={color.red}>No longer valid</T> : null}
          </View>

          <T size={13.5} lh={20} testID="annotation-reason">
            {a.reason ?? 'No reason was recorded for this level.'}
          </T>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: a.provenance === 'kai' ? color.violet : color.dim }} />
            <T size={11.5} c={color.muted} testID="annotation-provenance">
              {PROVENANCE_LABEL[a.provenance]}
              {a.timeframe ? ` · ${a.timeframe} chart` : ''}
            </T>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Explain" kind="kai" height={42} testID="annotation-explain" onPress={() => onExplain(a)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Hide" kind="outline" height={42} testID="annotation-hide" onPress={() => onHide(a)} />
            </View>
          </View>
          <Pressable
            testID="annotation-delete"
            accessibilityRole="button"
            accessibilityLabel="Delete this annotation"
            onPress={() => onDelete(a)}
            style={{ alignSelf: 'center', minHeight: 40, justifyContent: 'center' }}
          >
            <T size={12} weight="semibold" c={color.red}>Delete</T>
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Ticker switcher                                                      */
/* ------------------------------------------------------------------ */

export function TickerSwitcherSheet({
  visible, onClose, onPick, watchlist, recent,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (symbol: string) => void;
  watchlist: { symbol: string; name: string | null }[];
  recent: { symbol: string; name: string | null }[];
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!visible) { setQ(''); setHits([]); }
  }, [visible]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 1 || !api.available()) { setHits([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      api.search(term).then((r) => { if (alive) setHits(r); }).catch(() => { if (alive) setHits([]); });
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const local = [...watchlist, ...recent].filter(
    (s, i, arr) => arr.findIndex((x) => x.symbol === s.symbol) === i
      && (!q.trim() || s.symbol.includes(q.trim().toUpperCase()) || (s.name ?? '').toLowerCase().includes(q.trim().toLowerCase())),
  );
  const remote = hits.filter((h): h is Extract<SearchResult, { kind: 'instrument' }> => h.kind === 'instrument')
    .filter((h) => !local.some((l) => l.symbol === h.symbol));

  const rows = [...local, ...remote.map((r) => ({ symbol: r.symbol, name: r.name }))];

  return (
    <Sheet visible={visible} onClose={onClose} title="Open a symbol" testID="ticker-switcher-sheet">
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 14,
          borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory20, backgroundColor: alpha.ivory06,
        }}
      >
        <Search size={15} color={color.muted} />
        <TextInput
          testID="ticker-search-input"
          accessibilityLabel="Search symbols"
          value={q}
          onChangeText={setQ}
          autoCapitalize="characters"
          placeholder="Symbol or company"
          placeholderTextColor={color.muted}
          style={{ flex: 1, fontFamily: family.regular, fontSize: 14, color: color.text }}
        />
      </View>
      <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
        {rows.length ? rows.map((s) => (
          <Pressable
            key={s.symbol}
            testID={`switch-to-${s.symbol}`}
            accessibilityRole="button"
            accessibilityLabel={`Open ${s.symbol}`}
            onPress={() => onPick(s.symbol)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, borderBottomWidth: 0.5, borderBottomColor: alpha.ivory08 }}
          >
            <T size={14} weight="bold" style={{ width: 62 }}>{s.symbol}</T>
            <T size={12} c={color.muted} numberOfLines={1} style={{ flex: 1 }}>{s.name ?? ''}</T>
          </Pressable>
        )) : (
          <T size={12.5} c={color.muted} style={{ paddingVertical: 14 }}>
            {q.trim() ? 'Nothing matched that.' : 'Your watchlist and recent symbols show up here.'}
          </T>
        )}
      </ScrollView>
    </Sheet>
  );
}
