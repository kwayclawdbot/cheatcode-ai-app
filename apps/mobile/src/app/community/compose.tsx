/**
 * POST TO THE COMMUNITY — words, up to four pictures, up to two charts, and
 * (when a chart carries a plan) the structured call that goes with it.
 *
 * A CHART IS DATA, NOT A PICTURE. The member picks a symbol and a timeframe
 * and, if they want, the levels; the post stores exactly that and every phone
 * draws it from live bars (packages/shared/community.ts, ChartAttachment). No
 * screenshot, so nothing stale and nobody's account in the corner.
 *
 * @KAI HELPS, IT DOES NOT POST. The @Kai control opens Kai with the draft as
 * the question; whatever Kai says, the member decides what goes up. One orange
 * action on this screen: Post.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ChartLevel, ChartTimeframe } from '@shared/community';
import { T, Num, color, alpha, layout, radius, tap, typeScale } from '../../ui/kit';
import { family } from '../../ui/fonts';
import { KeyboardDock } from '../../ui/KeyboardDock';
import { AttachmentTray } from '../../ui/AttachmentTray';
import { useSession } from '../../lib/session';
import { api, type NewPostBody } from '../../lib/api';
import { env } from '../../lib/env';
import { useAttachments } from '../../features/media/useAttachments';
import { useTextScale } from '../../features/a11y/context';
import { openKaiSheet } from '../../features/kai-sheet';
import { Avatar } from '../../features/community/ui/Chrome';
import { PostChart } from '../../features/community/feed/PostObjects';
import { ChartBarsIcon, CloseIcon, ImageIcon } from '../../features/community/feed/icons';

const TIMEFRAMES: ChartTimeframe[] = ['5m', '15m', '1h', '1D', '1W'];
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const MAX_CHARTS = 2;

type DraftChart = { symbol: string; timeframe: ChartTimeframe; levels: ChartLevel[] };

function Field({ value, onChange, placeholder, testID, mono, width }: {
  value: string; onChange: (s: string) => void; placeholder: string; testID: string; mono?: boolean; width?: number;
}) {
  const scale = useTextScale();
  return (
    <View style={{ width, flex: width ? undefined : 1, minWidth: 0 }}>
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={color.textSecondary}
      autoCapitalize="characters"
      autoCorrect={false}
      keyboardType={mono ? 'decimal-pad' : 'default'}
      style={{
        width: '100%', minWidth: 0, minHeight: tap.min, borderRadius: radius.control, borderWidth: 1,
        borderColor: alpha.border, backgroundColor: color.canvas, paddingHorizontal: 12, color: color.textPrimary,
        fontFamily: mono ? family.mono : family.medium, fontSize: typeScale.body.size * scale, outlineStyle: 'none',
      } as never}
    />
    </View>
  );
}

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        minHeight: 36, minWidth: 44, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1,
        borderColor: on ? alpha.action40 : alpha.border, backgroundColor: on ? alpha.action10 : color.surface,
        alignItems: 'center', justifyContent: 'center',
      }}
      hitSlop={{ top: 4, bottom: 4 }}
    >
      <Num variant="meta" weight="semibold" c={on ? color.action : color.textPrimary}>{label}</Num>
    </Pressable>
  );
}

/** The chart picker: a symbol, a timeframe, and the plan's levels if there is one. */
function ChartPicker({ onAttach, onCancel }: { onAttach: (c: DraftChart, asCall: 'long' | 'short' | null) => void; onCancel: () => void }) {
  const [symbol, setSymbol] = useState('');
  const [tf, setTf] = useState<ChartTimeframe>('1D');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [asCall, setAsCall] = useState<'long' | 'short' | null>(null);
  const sym = symbol.trim().toUpperCase().replace(/^\$/, '');
  const ok = SYMBOL_RE.test(sym);
  const num = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
  const levels: ChartLevel[] = [
    num(entry) != null ? { price: num(entry)!, kind: 'entry' as const } : null,
    num(stop) != null ? { price: num(stop)!, kind: 'stop' as const } : null,
    num(target) != null ? { price: num(target)!, kind: 'target' as const } : null,
  ].filter(Boolean) as ChartLevel[];
  const canCall = num(entry) != null && (num(stop) != null || num(target) != null);

  return (
    <View testID="chart-picker" style={{ gap: 12, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: alpha.border, backgroundColor: color.surface }}>
      <T variant="cardTitle">Attach a chart</T>
      <Field value={symbol} onChange={setSymbol} placeholder="Symbol, e.g. NVDA" testID="chart-symbol" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {TIMEFRAMES.map((t) => <Chip key={t} label={t} on={t === tf} onPress={() => setTf(t)} testID={`chart-tf-${t}`} />)}
      </View>
      <T variant="meta" c={color.textSecondary}>Levels (optional). They are drawn on the chart.</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field value={entry} onChange={setEntry} placeholder="Entry" testID="chart-entry" mono />
        <Field value={stop} onChange={setStop} placeholder="Stop" testID="chart-stop" mono />
        <Field value={target} onChange={setTarget} placeholder="Target" testID="chart-target" mono />
      </View>
      {canCall ? (
        <View style={{ gap: 8 }}>
          <T variant="meta" c={color.textSecondary}>Post it as a call too? It is tracked and scored like any call.</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="No" on={asCall === null} onPress={() => setAsCall(null)} testID="chart-call-none" />
            <Chip label="Long" on={asCall === 'long'} onPress={() => setAsCall('long')} testID="chart-call-long" />
            <Chip label="Short" on={asCall === 'short'} onPress={() => setAsCall('short')} testID="chart-call-short" />
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          testID="chart-cancel"
          accessibilityRole="button"
          onPress={onCancel}
          style={{ flex: 1, minHeight: tap.min, borderRadius: radius.control, borderWidth: 1, borderColor: alpha.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <T variant="body" weight="semibold">Cancel</T>
        </Pressable>
        <Pressable
          testID="chart-attach"
          accessibilityRole="button"
          accessibilityState={{ disabled: !ok }}
          disabled={!ok}
          onPress={() => onAttach({ symbol: sym, timeframe: tf, levels }, canCall ? asCall : null)}
          style={{
            flex: 1, minHeight: tap.min, borderRadius: radius.control, borderWidth: 1,
            borderColor: ok ? alpha.action40 : alpha.border, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <T variant="body" weight="semibold" c={ok ? color.action : color.textSecondary}>Attach chart</T>
        </Pressable>
      </View>
    </View>
  );
}

export default function Compose() {
  const router = useRouter();
  const params = useLocalSearchParams<{ attach?: string }>();
  const { profile } = useSession();
  const scale = useTextScale();
  const media = useAttachments();

  const [body, setBody] = useState('');
  const [charts, setCharts] = useState<DraftChart[]>([]);
  const [call, setCall] = useState<{ symbol: string; direction: 'long' | 'short'; levels: ChartLevel[] } | null>(null);
  const [picking, setPicking] = useState(params.attach === 'chart');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    if (params.attach === 'image') void media.pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = useMemo(
    () => !busy && (body.trim().length > 0 || media.readyIds.length > 0 || charts.length > 0),
    [busy, body, media.readyIds.length, charts.length],
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/community' as never));

  const post = async () => {
    if (!ready) return;
    setBusy(true); setSaid(null);
    const lv = (k: ChartLevel['kind']) => call?.levels.find((l) => l.kind === k)?.price ?? null;
    const payload: NewPostBody = {
      body: body.trim(),
      attachment_ids: media.readyIds.length ? media.readyIds : undefined,
      charts: charts.length ? charts : undefined,
      trade_call: call ? { symbol: call.symbol, direction: call.direction, entry: lv('entry'), stop: lv('stop'), target: lv('target') } : undefined,
    };
    try {
      if (!env.FIXTURES) {
        const r = await api.createCommunityPost(payload);
        if (r.plain && r.plain !== 'Posted.') setSaid(r.plain);
      }
      media.clear();
      router.replace('/community' as never);
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'That did not post. Nothing was sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }} testID="screen-compose">
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter - 12, paddingTop: 12, paddingBottom: 6, gap: 4 }}>
        <Pressable testID="compose-close" accessibilityRole="button" accessibilityLabel="Close" onPress={close}
          style={{ width: tap.min, height: tap.min, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <T variant="cardTitle" style={{ flex: 1 }}>New post</T>
        <Pressable
          testID="compose-post"
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={() => { void post(); }}
          hitSlop={{ top: 4, bottom: 4 }}
          style={{
            minHeight: 40, paddingHorizontal: 20, borderRadius: radius.pill, marginRight: 8,
            backgroundColor: ready ? color.action : alpha.action14, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <T variant="body" weight="semibold" c={ready ? color.onAction : color.action}>{busy ? 'Posting…' : 'Post'}</T>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingBottom: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Avatar initial={(profile?.display_name ?? 'Y').charAt(0).toUpperCase()} size={40} />
          <TextInput
            testID="compose-body"
            value={body}
            onChangeText={setBody}
            placeholder="Post to the community…"
            placeholderTextColor={color.textSecondary}
            multiline
            autoFocus={!params.attach}
            maxLength={4000}
            style={{
              flex: 1, minHeight: 96, color: color.textPrimary, fontFamily: family.regular, textAlignVertical: 'top',
              fontSize: 17 * scale, lineHeight: 24 * scale, paddingTop: 8, outlineStyle: 'none',
            } as never}
          />
        </View>

        <AttachmentTray attachments={media.attachments} onRemove={media.remove} />

        {charts.map((c, i) => (
          <View key={`${c.symbol}-${i}`} testID={`compose-chart-preview-${i}`} style={{ gap: 6 }}>
            <PostChart symbol={c.symbol} timeframe={c.timeframe} levels={c.levels} height={130} />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCharts((cs) => cs.filter((_, j) => j !== i));
                if (call?.symbol === c.symbol) setCall(null);
              }}
              hitSlop={{ top: 4, bottom: 4 }}
              style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}
            >
              <T variant="meta" c={color.textSecondary}>Remove chart</T>
            </Pressable>
          </View>
        ))}
        {call ? (
          <T testID="compose-call-note" variant="meta" c={color.textSecondary}>
            {`Posting as a call: ${call.symbol} ${call.direction === 'long' ? 'Long' : 'Short'}. It is tracked and scored from the moment it goes up.`}
          </T>
        ) : null}

        {picking ? (
          <ChartPicker
            onCancel={() => setPicking(false)}
            onAttach={(c, asCall) => {
              setCharts((cs) => [...cs, c].slice(0, MAX_CHARTS));
              if (asCall) setCall({ symbol: c.symbol, direction: asCall, levels: c.levels });
              setPicking(false);
            }}
          />
        ) : null}

        {said ? <T variant="body" c={color.textPrimary}>{said}</T> : null}
        {media.notice ? <T variant="meta" c={color.textSecondary}>{media.notice}</T> : null}
      </ScrollView>

      <KeyboardDock floor={10} style={{ paddingHorizontal: layout.gutter - 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: alpha.divider }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable testID="compose-image" accessibilityRole="button" accessibilityLabel="Add a picture" onPress={() => { void media.pick(); }}
            style={{ width: tap.min, height: tap.min, alignItems: 'center', justifyContent: 'center' }}>
            <ImageIcon />
          </Pressable>
          <Pressable testID="compose-chart" accessibilityRole="button" accessibilityLabel="Attach a chart"
            disabled={charts.length >= MAX_CHARTS} onPress={() => setPicking(true)}
            style={{ width: tap.min, height: tap.min, alignItems: 'center', justifyContent: 'center', opacity: charts.length >= MAX_CHARTS ? 0.4 : 1 }}>
            <ChartBarsIcon />
          </Pressable>
          <Pressable
            testID="compose-kai"
            accessibilityRole="button"
            accessibilityLabel="Ask Kai to help with this post"
            onPress={() => openKaiSheet({
              context: { kind: 'home', label: 'Kai · help with a post' },
              question: body.trim() ? `Help me make this post clearer before I share it: "${body.trim()}"` : undefined,
            })}
            style={{ minHeight: tap.min, paddingHorizontal: 10, justifyContent: 'center' }}
          >
            <T variant="body" weight="semibold" c={color.kaiInk}>@Kai</T>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Num variant="meta" weight="regular" c={color.textSecondary}>{`${body.length}/4000`}</Num>
        </View>
      </KeyboardDock>
    </View>
  );
}
