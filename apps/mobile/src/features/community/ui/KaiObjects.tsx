import React from 'react';
import { View } from 'react-native';
import { alpha, color, radius } from '../../../ui/tokens';
import { T, Num, Eyebrow } from '../../../ui/Text';
import { ObjectCard } from '../../../ui/Panel';
import { RichText } from '../../../ui/RichText';
import { Check, Info } from '../../../ui/Icons';
import { CircleX, Warn } from './Icons';
import { SentimentBar } from './Chrome';
import type { KaiRoomObject } from '../types';
import { KaiDot } from './KaiDot';

/**
 * Kai's room objects render as OBJECTS — never as a paragraph of text.
 * Sources: 08 §5 "Kai response objects", artboards V3-C1 (verification card),
 * V3-C1 summary (room summary), S81 (verification), S84 (feedback panel).
 * Everything violet here is Kai; nothing volt, because none of it is a user
 * action — the actions live outside the object.
 */

function KaiHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <KaiDot size={22} />
      <T size={12} weight="bold" c={color.violetLight} style={{ flexShrink: 1 }}>{title}</T>
      {right ? <View style={{ marginLeft: 'auto' }}>{right}</View> : null}
    </View>
  );
}

function Footnote({ children }: { children: React.ReactNode }) {
  return <T size={10} lh={14} c={color.muted}>{children}</T>;
}

/* ---------------- room_summary ---------------- */

const RESULT_TONE: Record<string, { c: string; Icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  verified: { c: color.green, Icon: Check },
  partially_verified: { c: color.gold, Icon: Warn },
  unverified: { c: color.muted, Icon: Info },
  unverifiable: { c: color.muted, Icon: Info },
  false: { c: color.red, Icon: CircleX },
};

function RoomSummary({ o }: { o: Extract<KaiRoomObject, { type: 'room_summary' }> }) {
  return (
    <ObjectCard tone="kai" r={radius.xxl} style={{ padding: 15, gap: 11 }} testID="kai-room-summary">
      <KaiHeader title={o.title} right={<T size={10} c={color.muted}>{o.window_label}</T>} />

      <View style={{ gap: 8 }}>
        {o.bull_case ? (
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <T size={13} weight="bold" c={color.green} style={{ width: 64 }}>Bull case</T>
            <T size={13} lh={18} style={{ flex: 1 }}>{o.bull_case}</T>
          </View>
        ) : null}
        {o.bear_case ? (
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <T size={13} weight="bold" c={color.red} style={{ width: 64 }}>Bear case</T>
            <T size={13} lh={18} style={{ flex: 1 }}>{o.bear_case}</T>
          </View>
        ) : null}
      </View>

      {o.sentiment ? <SentimentBar bullPct={o.sentiment.bull_pct} sample={o.sentiment.sample} compact /> : null}

      {o.themes.length ? (
        <View style={{ gap: 4 }}>
          <Eyebrow>WHAT THE ROOM KEEPS COMING BACK TO</Eyebrow>
          {o.themes.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 7 }}>
              <T size={12} c={color.muted}>·</T>
              <T size={12} lh={17} style={{ flex: 1 }}>{t}</T>
            </View>
          ))}
        </View>
      ) : null}

      {o.claims.length ? (
        <View style={{ gap: 6 }}>
          <Eyebrow>CLAIMS MADE HERE</Eyebrow>
          {o.claims.map((c, i) => {
            const t = RESULT_TONE[c.verified] ?? RESULT_TONE.unverified;
            const Icon = t.Icon;
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start' }}>
                <View style={{ paddingTop: 3 }}><Icon size={11} color={t.c} /></View>
                <View style={{ flex: 1 }}>
                  <T size={12} lh={17}>{c.claim}</T>
                  {c.plain ? <T size={10} lh={14} c={color.muted}>{c.plain}</T> : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {o.disagreements.length ? (
        <View style={{ gap: 4 }}>
          <Eyebrow>WHERE THE ROOM DISAGREES</Eyebrow>
          {o.disagreements.map((d, i) => <T key={i} size={12} lh={17}>{d}</T>)}
        </View>
      ) : null}

      {o.missed.length ? (
        <View style={{ gap: 4 }}>
          <Eyebrow c={color.gold}>WHILE YOU WERE AWAY</Eyebrow>
          {o.missed.map((t, i) => <T key={i} size={12} lh={17} c={color.gold}>{t}</T>)}
        </View>
      ) : null}

      {o.take ? (
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 8, paddingHorizontal: 11, borderRadius: 10,
            backgroundColor: 'rgba(11,11,14,0.40)', borderWidth: 0.5, borderColor: alpha.ivory08,
          }}
        >
          <T size={12} weight="bold" c={color.violetLight}>Kai</T>
          <T size={12} style={{ flex: 1 }}>{o.take}</T>
          {o.grade_display ? <T size={12} weight="bold" c={color.violet}>{o.grade_display}</T> : null}
        </View>
      ) : null}

      <Footnote>{o.footnote}</Footnote>
    </ObjectCard>
  );
}

/* ---------------- verification_card ---------------- */

function Verification({ o }: { o: Extract<KaiRoomObject, { type: 'verification_card' }> }) {
  const tone = RESULT_TONE[o.result] ?? RESULT_TONE.unverified;
  const Icon = tone.Icon;
  return (
    <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, gap: 9 }} testID="kai-verification">
      <KaiHeader
        title={o.title}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon size={11} color={tone.c} />
            <T size={10} c={tone.c}>{o.result_label}</T>
          </View>
        }
      />
      {o.claim ? (
        <T size={12} lh={17} c={color.muted}>
          <T size={12} weight="bold" c={color.muted}>Claim: </T>{o.claim}
        </T>
      ) : null}
      {o.detail ? <RichText text={o.detail} size={13} lh={19} /> : null}

      {o.sources.length ? (
        <View style={{ gap: 3 }}>
          {o.sources.map((s, i) => (
            <T key={i} size={10} c={color.muted}>
              Source: {s.label}{s.at ? ` · ${s.at}` : ''}
            </T>
          ))}
        </View>
      ) : null}

      {o.uncertainty ? <Footnote>Uncertainty: {o.uncertainty}</Footnote> : null}
      {o.effect_on_setup ? <Footnote>{o.effect_on_setup}</Footnote> : null}
      <Footnote>Community sentiment is shown separately and never changes a grade.</Footnote>
    </ObjectCard>
  );
}

/* ---------------- alert_preview ---------------- */

function AlertPreview({
  o, onActivate, onDiscard,
}: {
  o: Extract<KaiRoomObject, { type: 'alert_preview' }>;
  onActivate?: () => void;
  onDiscard?: () => void;
}) {
  return (
    <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, gap: 10 }} testID="kai-alert-preview">
      <KaiHeader title={o.title} />
      <T size={14} lh={20}>{o.natural_language}</T>

      <View style={{ gap: 6, padding: 11, borderRadius: 10, backgroundColor: 'rgba(11,11,14,0.40)', borderWidth: 0.5, borderColor: alpha.ivory08 }}>
        <Eyebrow>WHAT KAI WILL WATCH</Eyebrow>
        {o.condition_lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 7 }}>
            <T size={12} c={color.cyan}>·</T>
            <Num size={12} weight="regular" c={color.text} style={{ flex: 1 }}>{l}</Num>
          </View>
        ))}
        <View style={{ height: 0.5, backgroundColor: alpha.ivory08, marginVertical: 2 }} />
        <T size={11} c={color.muted}>Data: {o.data_dependency}</T>
        <T size={11} c={color.muted}>Fires: {o.frequency} · {o.expires_label}</T>
      </View>

      {o.summary_plain ? <T size={13} lh={19}>{o.summary_plain}</T> : null}
      {o.monitoring_note ? <Footnote>{o.monitoring_note}</Footnote> : null}
      <Footnote>Nothing is bought or sold. You approve before it arms.</Footnote>
    </ObjectCard>
  );
}

/* ---------------- comparison ---------------- */

function Comparison({ o }: { o: Extract<KaiRoomObject, { type: 'comparison' }> }) {
  return (
    <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, gap: 11 }} testID="kai-comparison">
      <KaiHeader title={o.title} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, gap: 6, padding: 11, borderRadius: radius.lg, backgroundColor: color.greenTint, borderWidth: 0.5, borderColor: alpha.green40 }}>
          <Eyebrow c={color.green}>BULL CASE</Eyebrow>
          {o.bull.map((b, i) => <T key={i} size={12} lh={17}>{b}</T>)}
        </View>
        <View style={{ flex: 1, gap: 6, padding: 11, borderRadius: radius.lg, backgroundColor: color.redTint, borderWidth: 0.5, borderColor: alpha.red40 }}>
          <Eyebrow c={color.red}>BEAR CASE</Eyebrow>
          {o.bear.map((b, i) => <T key={i} size={12} lh={17}>{b}</T>)}
        </View>
      </View>
      {o.bull_plain || o.bear_plain ? (
        <View style={{ gap: 6 }}>
          {o.bull_plain ? <T size={12} lh={17} c={color.muted}>{o.bull_plain}</T> : null}
          {o.bear_plain ? <T size={12} lh={17} c={color.muted}>{o.bear_plain}</T> : null}
        </View>
      ) : null}
      {o.conclusion ? <T size={13} lh={19}>{o.conclusion}</T> : null}
      <Footnote>{o.footnote}</Footnote>
    </ObjectCard>
  );
}

/* ---------------- explain / briefing ---------------- */

function Explain({ o }: { o: Extract<KaiRoomObject, { type: 'explain' }> }) {
  return (
    <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, gap: 10 }} testID="kai-explain">
      <KaiHeader title={o.title} />
      <View style={{ gap: 8 }}>
        {o.lines.map((l, i) => (
          <View key={i} style={{ gap: 2 }}>
            {l.label ? <T size={11} weight="bold" c={color.violetLight}>{l.label}</T> : null}
            <T size={13} lh={19}>{l.text}</T>
          </View>
        ))}
      </View>
      {o.footnote ? <Footnote>{o.footnote}</Footnote> : null}
    </ObjectCard>
  );
}

/* ---------------- dispatcher ---------------- */

export function KaiObjectView({
  object, onActivateAlert,
}: { object: KaiRoomObject; onActivateAlert?: () => void }) {
  switch (object.type) {
    case 'room_summary': return <RoomSummary o={object} />;
    case 'verification_card': return <Verification o={object} />;
    case 'alert_preview': return <AlertPreview o={object} onActivate={onActivateAlert} />;
    case 'comparison': return <Comparison o={object} />;
    case 'explain': return <Explain o={object} />;
    default: return null;
  }
}
