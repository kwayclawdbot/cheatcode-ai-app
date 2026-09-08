import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Screen } from '../../ui/Screen';
import { NotConnected, ScreenLoading } from '../../ui/Loading';
import { StackHeader } from '../../ui/StackHeader';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Toggle } from '../../ui/Toggle';
import { ChipRail } from '../../ui/Segmented';
import { alpha, color, radius, tap } from '../../ui/tokens';
import { useMe, useSettingsWriter } from '../../features/account/useAccount';
import { useA11y } from '../../features/a11y';
import type { ExplainLevel } from '../../lib/types';

const LEVELS: { key: ExplainLevel; label: string }[] = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'family', label: 'Family' },
];

const SAMPLE: Record<ExplainLevel, string> = {
  beginner: 'META keeps bouncing off $480. If it closes above $504 with more people trading than usual, buyers have taken over.',
  intermediate: 'Support at 480 held three times; price reclaimed VWAP on rising relative volume. A 5m close above 504 confirms.',
  advanced: 'Triple-tap 480 into a VWAP reclaim, ORB high 504.10, ATR(14) 6.2. Entry on 5m close > 504 with RVOL ≥ 1.4×.',
  family: 'Think of $480 as the floor of a room. People keep testing it and it holds. Above $504 the room gets taller.',
};

const SCALES = [
  { key: '1', label: 'Default' },
  { key: '1.15', label: 'Larger' },
  { key: '1.3', label: 'Largest' },
];

const HOURS = ['20:00', '21:00', '22:00', '23:00'];
const MORNINGS = ['06:00', '07:00', '08:00', '09:00'];

/**
 * Settings — explanation level, quiet hours, reduced motion, text size.
 *
 * THE TWO ACCESSIBILITY ROWS NOW DO SOMETHING (audit F19). They used to write
 * `PUT /settings` and stop there, and the screen said so in a footnote: "apply
 * on the next release of the reading views". That release is this one. Both
 * controls call into `features/a11y` as well as the server, so the change is
 * visible in the sentence directly underneath the control the instant it is
 * tapped — including on this screen, which is set in `T` like every other.
 */
export default function Settings() {
  const { data, loading, notAvailable, reload } = useMe();
  const { save, error } = useSettingsWriter(reload);
  const a11y = useA11y();

  const [level, setLevel] = useState<ExplainLevel>('beginner');
  const [quiet, setQuiet] = useState(false);
  const [start, setStart] = useState('21:00');
  const [end, setEnd] = useState('07:00');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [scale, setScale] = useState('1');

  useEffect(() => {
    if (!data) return;
    setLevel(data.settings.explanation_level);
    setQuiet(!!data.settings.quiet_hours.enabled);
    setStart(data.settings.quiet_hours.start ?? '21:00');
    setEnd(data.settings.quiet_hours.end ?? '07:00');
    setReducedMotion(data.settings.accessibility.reduced_motion);
    setScale(String(data.settings.accessibility.text_scale ?? 1));
    // What the server holds is the truth across devices, so the live
    // preference adopts it the moment `/me` lands rather than waiting for the
    // member to touch a control they have already set on another phone.
    a11y.adopt({
      reducedMotion: data.settings.accessibility.reduced_motion,
      textScale: data.settings.accessibility.text_scale ?? 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const modes = Object.entries(data?.settings.notifications?.per_mode ?? {}) as [string, boolean][];

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-settings">
        <ScreenLoading />
      </Screen>
    );
  }

  return (
    <Screen variant="corner" layout="tab" testID="screen-settings">
      <StackHeader title="How Kai talks to you" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 11 }}
        showsVerticalScrollIndicator={false}
      >
        <Eyebrow c={color.violetLight}>EXPLANATION LEVEL</Eyebrow>
        <ChipRail
          options={LEVELS}
          value={level}
          onChange={(k) => { setLevel(k); void save({ explanation_level: k }); }}
          tone="kai"
          testID="settings-level"
        />
        <ObjectCard r={radius.xl} style={{ padding: 14 }}>
          <T size={11} c={color.muted} ls={0.6}>SAMPLE</T>
          <T size={15} lh={22} style={{ marginTop: 6 }}>{SAMPLE[level]}</T>
        </ObjectCard>

        <Eyebrow c={color.gold}>QUIET HOURS</Eyebrow>
        <RowList>
          <Row last={!quiet}>
            <View style={{ flex: 1 }}>
              <T size={14}>Hold notifications overnight</T>
              <T size={12} c={color.muted} style={{ marginTop: 2 }}>Anything urgent still waits for you in the morning.</T>
            </View>
            <Toggle
              testID="toggle-quiet"
              value={quiet}
              label="Quiet hours"
              onChange={(v) => { setQuiet(v); void save({ quiet_hours: { enabled: v, start, end } }); }}
            />
          </Row>
          {quiet ? (
            <>
              <Row>
                <T size={14} c={color.muted} style={{ flex: 1 }}>From</T>
                <View style={{ flexDirection: 'row', gap: tap.gap }}>
                  {HOURS.map((h) => (
                    <Pressable
                      key={h}
                      testID={`quiet-start-${h}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Quiet hours start ${h}`}
                      accessibilityState={{ selected: h === start }}
                      onPress={() => { setStart(h); void save({ quiet_hours: { enabled: true, start: h, end } }); }}
                      style={{ minHeight: tap.min, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: radius.sm, borderWidth: 0.5, borderColor: h === start ? alpha.volt55 : alpha.ivory12, backgroundColor: h === start ? alpha.volt10 : 'transparent' }}
                    >
                      <Num size={12} weight="regular" c={h === start ? color.volt : color.muted}>{h}</Num>
                    </Pressable>
                  ))}
                </View>
              </Row>
              <Row last>
                <T size={14} c={color.muted} style={{ flex: 1 }}>Until</T>
                <View style={{ flexDirection: 'row', gap: tap.gap }}>
                  {MORNINGS.map((h) => (
                    <Pressable
                      key={h}
                      testID={`quiet-end-${h}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Quiet hours end ${h}`}
                      accessibilityState={{ selected: h === end }}
                      onPress={() => { setEnd(h); void save({ quiet_hours: { enabled: true, start, end: h } }); }}
                      style={{ minHeight: tap.min, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: radius.sm, borderWidth: 0.5, borderColor: h === end ? alpha.volt55 : alpha.ivory12, backgroundColor: h === end ? alpha.volt10 : 'transparent' }}
                    >
                      <Num size={12} weight="regular" c={h === end ? color.volt : color.muted}>{h}</Num>
                    </Pressable>
                  ))}
                </View>
              </Row>
            </>
          ) : null}
        </RowList>

        {modes.length ? (
          <>
            <Eyebrow>NOTIFY ME ABOUT</Eyebrow>
            <RowList>
              {modes.map(([m, on], i) => (
                <Row key={m} last={i === modes.length - 1}>
                  <T size={14} style={{ flex: 1 }}>{m.replace(/_/g, ' ')}</T>
                  <Toggle
                    testID={`notify-${m}`}
                    value={!!on}
                    label={`Notify about ${m}`}
                    onChange={(v) => void save({ notification: { per_mode: { ...(data?.settings.notifications?.per_mode ?? {}), [m]: v } } })}
                  />
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        <Eyebrow>ACCESSIBILITY</Eyebrow>
        <RowList>
          <Row>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <T size={14}>Reduce motion</T>
              <T size={12} c={color.muted} style={{ marginTop: 2 }}>
                {a11y.systemReducedMotion
                  /* The OR runs one way only: the phone can turn motion off for
                     the app, the app can never turn it back on. Saying so is
                     better than rendering a switch that appears to do nothing. */
                  ? 'Your phone is set to reduce motion, so the app already has. This switch cannot turn it back on.'
                  : 'Sheets stop sliding, cards stop cascading, nothing pulses.'}
              </T>
            </View>
            <Toggle
              testID="toggle-reduced-motion"
              value={reducedMotion || a11y.systemReducedMotion}
              label="Reduce motion"
              onChange={(v) => {
                setReducedMotion(v);
                a11y.set({ reducedMotion: v });
                void save({ accessibility: { reduced_motion: v, text_scale: Number(scale) } });
              }}
            />
          </Row>
          <Row last>
            <T size={14} style={{ flex: 1 }}>Text size</T>
            <View style={{ flexDirection: 'row', gap: tap.gap }}>
              {SCALES.map((s) => (
                <Pressable
                  key={s.key}
                  testID={`text-scale-${s.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Text size ${s.label}`}
                  accessibilityState={{ selected: s.key === scale }}
                  onPress={() => {
                    setScale(s.key);
                    a11y.set({ textScale: Number(s.key) });
                    void save({ accessibility: { reduced_motion: reducedMotion, text_scale: Number(s.key) } });
                  }}
                  /* F20's 44x44 convention. The chip is drawn at its old
                     weight; it is the TOUCHABLE box that grew. */
                  style={{ minHeight: tap.min, minWidth: tap.min, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 0.5, borderColor: s.key === scale ? alpha.volt55 : alpha.ivory12, backgroundColor: s.key === scale ? alpha.volt10 : 'transparent' }}
                >
                  <T size={12} c={s.key === scale ? color.volt : color.muted}>{s.label}</T>
                </Pressable>
              ))}
            </View>
          </Row>
        </RowList>
        {/* This sentence is set in `T` like everything else, so it is itself the
            demonstration: pick Largest and the explanation of what Largest does
            gets larger while you are reading it. */}
        <T size={12} c={color.dim} lh={18}>
          Both apply everywhere in the app straight away and stay set the next time you open it. Text size is on top of
          whatever size your phone is already set to — the app never overrides that.
        </T>

        {notAvailable ? <NotConnected what="Your saved settings" /> : null}
        {error ? <T size={13} c={color.red}>{error}</T> : null}
      </ScrollView>
    </Screen>
  );
}
