import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { Check, Calendar, Bell } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { fixtureAlerts } from '../../lib/fixtures';
import type { AlertsPayload } from '../../lib/types';

type AlertsView = AlertsPayload & { empty_copy?: string };

/** V3-A1-Alerts.html — Kai triages, you decide. */
export default function Alerts() {
  const [data, setData] = useState<AlertsView | null>(api.available() ? null : fixtureAlerts);

  useEffect(() => {
    let alive = true;
    if (!api.available()) return;
    api.alerts()
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData({ needs_attention: [], watching: [], resolved: [] }); });
    return () => { alive = false; };
  }, []);

  const empty = data && !data.needs_attention.length && !data.watching.length && !data.resolved.length;

  return (
    <Screen variant="corner" layout="tab" testID="screen-alerts">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 11, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={28} weight="bold">Alerts</T>
          <T size={11} c={color.muted}>Kai triages · you decide</T>
        </View>

        {empty ? (
          <ObjectCard r={radius.xxl} style={{ padding: 20, gap: 10, alignItems: 'center', marginTop: 24 }}>
            <Bell size={22} color={color.muted} />
            <T size={15} weight="bold" align="center">{data?.empty_copy ?? "Kai isn't watching anything for you yet."}</T>
            <T size={13} c={color.muted} align="center" lh={19}>
              Open a setup and tell Kai the level that matters. He'll watch it and tell you when it happens.
            </T>
          </ObjectCard>
        ) : null}

        {data?.needs_attention.map((a) => (
          <ObjectCard key={a.id} tone="gold" r={radius.xxl} style={{ paddingVertical: 14, paddingHorizontal: 15, gap: 11 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <T size={17} weight="bold">{a.symbol}</T>
              {a.grade_change ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: alpha.gold14, borderWidth: 0.5, borderColor: alpha.gold40 }}>
                  <T size={11} weight="bold" c={color.gold}>{a.grade_change}</T>
                </View>
              ) : null}
              {a.age ? <T size={10} c={color.muted} style={{ marginLeft: 'auto' }}>{a.age}</T> : null}
            </View>

            <View style={{ gap: 5 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T size={12} c={color.muted}>Now</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Num size={12} weight="regular">{a.value ?? '—'}</Num>
                  <FreshnessMark freshness={a.quote?.freshness ?? 'unknown'} size={10} />
                </View>
              </View>
              <View style={{ height: 7, borderRadius: 4, backgroundColor: alpha.ivory08 }}>
                <LinearGradient
                  colors={[color.green, color.gold, color.red] as unknown as readonly [string, string, ...string[]]}
                  locations={[0, 0.75, 1] as unknown as readonly [number, number, ...number[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ width: '88%', height: '100%', borderRadius: 4 }}
                />
                <View style={{ position: 'absolute', right: 0, top: -3, width: 2, height: 13, backgroundColor: color.red }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T size={10} c={color.muted}>{a.entry_label ?? ''}</T>
                <T size={10} c={color.red}>{a.detail}</T>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Review setup" kind="volt" height={42} style={{ flex: 1 }} />
              <Button label="Ask Kai" kind="kai" height={42} full={false} />
            </View>
          </ObjectCard>
        ))}

        {data?.watching.length ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Eyebrow c={color.cyan}>{`WATCHING · ${data.watching.length}`}</Eyebrow>
              {data.watching.some((w) => w.quote) ? (
                <FreshnessMark freshness={data.watching.find((w) => w.quote)!.quote!.freshness ?? 'unknown'} size={10} />
              ) : null}
            </View>
            <RowList>
              {data.watching.map((w, i) => (
                <Row key={w.id} last={i === data.watching.length - 1}>
                  <View style={{ width: 58 }}>
                    {w.condition_label
                      ? <Num size={12} weight="regular" c={color.cyan}>{w.condition_label}</Num>
                      : <Calendar size={14} color={color.cyan} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <T size={14} weight="semibold">{w.title}</T>
                    {w.status === 'draft' ? <T size={11} c={color.gold}>draft — activate</T> : null}
                  </View>
                  {w.value ? <Num size={11} weight="regular" c={color.muted}>{w.value}</Num> : null}
                  {w.meta ? <T size={11} c={color.muted}>{w.meta}</T> : null}
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        {data?.resolved.length ? (
          <>
            <Eyebrow c={color.green}>RESOLVED · TODAY</Eyebrow>
            {data.resolved.map((r) => (
              <ObjectCard key={r.id} r={radius.xl} style={{ paddingVertical: 12, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.75 }}>
                <Check size={14} color={color.green} strokeWidth={2.4} />
                <T size={13} style={{ flex: 1 }}>{r.title}</T>
                {r.value ? <Num size={12} weight="regular" c={color.green}>{r.value}</Num> : null}
              </ObjectCard>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
