/**
 * Portal chrome — top bar, loading skeleton, annotation inspector and the
 * ticker switcher sheet. Asset-workspace.html is pixel truth.
 *
 * The timeframe rail and the Kai · Alert · Plan · Community context switcher
 * used to live here too. They belonged to the round-4 portal, which was
 * retired when the Trade section became one spine, and they were removed with
 * it — nothing rendered them any more.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { T, Num } from '../../ui/Text';
import { Sheet } from '../../ui/Sheet';
import { KaiOrb } from '../../ui/KaiOrb';
import { Button } from '../../ui/Button';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { Search } from '../../ui/Icons';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { family } from '../../ui/fonts';
import { PaperChip } from '../trade/components';
import { api } from '../../lib/api';
import type { Quote, SearchResult } from '../../lib/types';
import { kindColor } from '../chart/semantics';
import type { Annotation } from './types';
import { KIND_LABEL, PROVENANCE_LABEL } from './types';
import { publishAsk } from './ask-bus';

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
  symbol, name, quote, marketState, paper, onBack, onSwitchTicker, onOpenDrawers, onSearch, volumeLine,
  showSearch = true,
}: {
  symbol: string;
  name: string | null;
  quote: Quote | null;
  marketState: string | null;
  paper: boolean;
  onBack: () => void;
  onSwitchTicker: () => void;
  onOpenDrawers: () => void;
  /** Defaults to the ticker switcher, which is the same sheet, opened focused. */
  onSearch?: () => void;
  volumeLine?: string | null;
  /**
   * The search pill under the price. On by default, because that is what the
   * round-4 portal has always shown.
   *
   * The three-beat section turns it OFF: it has a persistent "Ask Kai about
   * META…" composer at the bottom of every beat, so the pill's own "or ask Kai"
   * is a second door to the same room, and the row it costs is a row the read
   * needs. Switching symbol is still one tap — the chevron beside the ticker.
   */
  showSearch?: boolean;
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

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 6 }}>
        <Num size={10.5} weight="regular" c={color.dim}>
          {[volumeLine, marketState].filter(Boolean).join(' · ') || (name ?? '')}
        </Num>
      </View>

      {showSearch ? <PortalSearchField onPress={onSearch ?? onSwitchTicker} /> : null}
    </View>
  );
}

/**
 * The search field in the top bar (spec 10 §7: "Top bar — ticker switcher,
 * current price, market state, paper/live account, SEARCH and drawers").
 *
 * It is a field, not an icon: the round-3 Trade landing's search moved into a
 * drawer when Trade became a chart, and an affordance the user has to go
 * looking for is the reason Trade read as a dead end. Same composer pill, same
 * magnifier, same placeholder grammar as that search — one row shorter, and
 * BELOW the price so the chart is still the dominant object on the screen.
 *
 * Tapping it opens the ticker switcher with its input focused. There is one
 * search surface in the portal, not two that disagree.
 */
function PortalSearchField({ onPress }: { onPress: () => void }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
      <Pressable
        testID="portal-search"
        accessibilityRole="search"
        accessibilityLabel="Search a symbol, a company, or ask Kai"
        onPress={onPress}
        hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
      >
        <LinearGradient
          colors={gradient.composer as unknown as readonly [string, string, ...string[]]}
          start={gradientAngle.start}
          end={gradientAngle.end}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 9, height: 36, paddingHorizontal: 13,
            borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory20,
          }}
        >
          <Search size={14} color={color.muted} />
          <T size={12.5} c={color.dim} numberOfLines={1} style={{ flex: 1 }}>
            Search symbol, company, or ask Kai
          </T>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

/**
 * The chrome, before there is anything to put in it.
 *
 * The Trade tab resolves which chart it is opening in well under a second, and
 * it shows THIS while it does — the same bars in the same places, empty. What
 * it must never show is a card asking the user to pick a symbol, which is what
 * a "Find a symbol" screen is however briefly it appears.
 */
export function PortalChromeSkeleton({ label }: { label?: string }) {
  const bar = (w: number | string, h: number) => (
    <View style={{ width: w as number, height: h, borderRadius: radius.sm, backgroundColor: alpha.ivory08 }} />
  );
  return (
    <View testID="portal-skeleton">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 }}>
        <Back />
        {bar(64, 16)}
        <View style={{ flex: 1 }} />
        {bar(46, 18)}
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 6, gap: 7 }}>
        {bar(128, 26)}
        {bar(150, 10)}
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 9, height: 36, paddingHorizontal: 13,
            borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory20, backgroundColor: alpha.ivory06,
          }}
        >
          <Search size={14} color={color.muted} />
          <T size={12.5} c={color.dim}>Search symbol, company, or ask Kai</T>
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, gap: 11 }}>
        <View
          style={{
            height: 196, borderRadius: radius.lg, borderWidth: 0.5,
            borderColor: alpha.ivory08, backgroundColor: alpha.ivory04 ?? alpha.ivory06,
            alignItems: 'center', justifyContent: 'center', gap: 10,
          }}
        >
          <ActivityIndicator size="small" color={color.muted} />
          <T size={11.5} c={color.dim} testID="portal-skeleton-label">{label ?? 'Opening your chart…'}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 24 }}>
          {bar(28, 13)}{bar(34, 13)}{bar(30, 13)}{bar(66, 13)}
        </View>
      </View>
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
  visible, onClose, onPick, watchlist, recent, onAskKai,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (symbol: string) => void;
  watchlist: { symbol: string; name: string | null }[];
  recent: { symbol: string; name: string | null }[];
  /** Defaults to the ask bus, which the portal's Kai thread is listening on. */
  onAskKai?: (question: string) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchResult[]>([]);
  const input = useRef<TextInput | null>(null);

  useEffect(() => {
    if (!visible) { setQ(''); setHits([]); return; }
    // The sheet IS the search field: it opens focused with the keyboard up, so
    // tapping search in the top bar costs one tap, not two. The frame of delay
    // is the modal's own mount — focusing before it is on screen does nothing.
    const t = setTimeout(() => input.current?.focus(), 60);
    return () => clearTimeout(t);
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

  const term = q.trim();
  const searching = term.length > 0 && !hits.length && api.available();
  // A query that resolves to no instrument is not an error — it is a question.
  // `/trade/search` already answers with one; this is the same reading, offline.
  const question = hits.find((h) => h.kind === 'kai_question');
  const ask = () => {
    if (!term) return;
    const asked = question?.kind === 'kai_question' && question.text ? question.text : `What should I know about ${term}?`;
    onClose();
    (onAskKai ?? publishAsk)(asked);
  };

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
          ref={input}
          testID="ticker-search-input"
          accessibilityLabel="Search a symbol, a company, or ask Kai"
          value={q}
          onChangeText={setQ}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => {
            const exact = rows.find((r) => r.symbol === term.toUpperCase()) ?? rows[0];
            if (exact) onPick(exact.symbol);
            else ask();
          }}
          placeholder="Symbol, company, or ask Kai"
          placeholderTextColor={color.muted}
          style={{ flex: 1, fontFamily: family.regular, fontSize: 14, color: color.text, ...(({ outlineStyle: 'none' } as unknown) as object) }}
        />
        {searching ? <ActivityIndicator size="small" color={color.muted} /> : null}
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
            {term ? 'No symbol matched that.' : 'Your watchlist and recent symbols show up here.'}
          </T>
        )}

        {term ? (
          <Pressable
            testID="ticker-ask-kai"
            accessibilityRole="button"
            accessibilityLabel={`Ask Kai about ${term}`}
            onPress={ask}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 46 }}
          >
            <KaiOrb size={18} glow={false} />
            <T size={12.5} c={color.violetLight} numberOfLines={1} style={{ flex: 1 }}>
              {`Ask Kai about “${term}”`}
            </T>
          </Pressable>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
