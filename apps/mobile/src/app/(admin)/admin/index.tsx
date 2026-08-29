import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { T, Num } from '../../../ui/Text';
import { DataRow, Figure, Rule, ShareBar, VRule } from '../../../ui/DataRow';
import { color, space } from '../../../ui/tokens';
import {
  Board, DailyBars, FunnelRow, Section, FUNNEL_ORDER, metricTone, metricValue,
  sourceLabel, stamp, useOverview, when,
} from '../../../features/admin';

/**
 * OVERVIEW — the §8 numbers, and the ones that refuse.
 *
 * Everything here is counted from rows in this database. There is no projected
 * revenue and no invented tier, and a metric the API reports as `tracked:false`
 * renders "not tracked yet" rather than a zero it did not measure — which is
 * why the figures go through `<Figure value={metricValue(m)}>` instead of being
 * formatted at the call site, where the `?? 0` eventually appears.
 *
 * No boxes. The funnel is eight rules whose widths are the proportion, the
 * metrics are a ledger, and the thirty days are columns of the same hairline.
 * That is the whole visual system, and it is the app's own.
 */
export default function AdminOverview() {
  const router = useRouter();
  const { data, loading, error, notAvailable } = useOverview();

  const peak = Math.max(1, ...(data?.funnel ?? []).map((f) => f.people));
  const mixTotal = Math.max(1, (data?.source_mix ?? []).reduce((n, m) => n + m.people, 0));
  const byStatus = new Map((data?.funnel ?? []).map((f) => [f.status, f.people]));

  return (
    <Board
      testID="screen-admin-overview"
      current="overview"
      title="Operator"
      subtitle={data?.generated_at ? `Counted ${when(data.generated_at)}` : 'The CRM, the invites and the log'}
      onBack={() => router.replace('/account')}
      loading={loading && !data}
      notAvailable={notAvailable}
      error={data ? null : error}
    >
      {data ? (
        <>
          <T size={13} c={color.muted} lh={20} testID="overview-plain">{data.plain}</T>

          <Section label="THE FUNNEL" note="Every stage is derived from rows, never stored twice.">
            {FUNNEL_ORDER.map((s, i) => (
              <FunnelRow
                key={s}
                status={s}
                people={byStatus.get(s) ?? 0}
                share={(byStatus.get(s) ?? 0) / peak}
                onPress={() => router.push(`/admin/people?status=${s}` as never)}
                last={i === FUNNEL_ORDER.length - 1}
              />
            ))}
          </Section>

          <Section label="COUNTED FROM ROWS">
            {data.metrics.map((m, i) => (
              <Figure
                key={m.key}
                testID={`metric-${m.key}`}
                label={m.label}
                note={m.plain}
                value={metricValue(m)}
                tone={metricTone(m)}
                last={i === data.metrics.length - 1}
              />
            ))}
          </Section>

          {data.daily.length ? (
            <Section label="ARRIVALS · LAST 30 DAYS">
              <View style={{ paddingTop: space.x8 }}>
                <DailyBars rows={data.daily} />
              </View>
            </Section>
          ) : null}

          {data.source_mix.length ? (
            <Section label="WHERE THEY CAME FROM">
              {data.source_mix.map((m) => (
                <View
                  key={m.source ?? 'none'}
                  style={{ gap: 6, paddingVertical: space.x10 }}
                  testID={`mix-${m.source ?? 'none'}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                    <T size={13} c={m.source ? color.text : color.muted} style={{ flex: 1 }}>{sourceLabel(m.source)}</T>
                    <Num size={13} weight="semibold">{m.people.toLocaleString('en-US')}</Num>
                  </View>
                  <ShareBar share={m.people / mixTotal} />
                </View>
              ))}
              <Rule />
            </Section>
          ) : null}

          <Section label="INVITES">
            <View
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.x12, gap: space.x12 }}
              testID="invite-totals"
            >
              {([
                ['Open', data.invites.outstanding],
                ['Redeemed', data.invites.redeemed],
                ['Off', data.invites.revoked],
                ['Expired', data.invites.expired],
              ] as const).map(([label, n], i) => (
                <React.Fragment key={label}>
                  {i ? <VRule /> : null}
                  <View style={{ flex: 1, gap: 3 }}>
                    <Num size={18} weight="bold">{n.toLocaleString('en-US')}</Num>
                    <T size={10} weight="bold" ls={0.8} c={color.dim} numberOfLines={1}>{label.toUpperCase()}</T>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <Rule />
            <DataRow
              testID="overview-to-invites"
              label="Make a code"
              sub="There is no email provider wired up. A code works today."
              onPress={() => router.push('/admin/invites' as never)}
              chevron
              last
            />
          </Section>

          <Section label="SOURCES">
            {data.sources.map((s, i) => (
              <DataRow
                key={s.source}
                testID={`overview-source-${s.source}`}
                label={s.source}
                sub={s.configured ? s.plain : `Switched off — ${s.reason ?? 'no reason given'}`}
                value={s.last_run ? when(s.last_run.finished_at ?? s.last_run.started_at) : 'never run'}
                mono={!!s.last_run}
                dim={!s.configured}
                onPress={() => router.push('/admin/sources' as never)}
                chevron
                last={i === data.sources.length - 1}
              />
            ))}
          </Section>

          <T size={10} c={color.dim} align="center" style={{ marginTop: space.x8 }}>
            {`Read at ${stamp(data.generated_at)}. Opening this board is written to the audit log.`}
          </T>
        </>
      ) : null}
    </Board>
  );
}
