import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { T, Num, Eyebrow } from '../../../ui/Text';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { DataRow, Rule } from '../../../ui/DataRow';
import { alpha, color, space } from '../../../ui/tokens';
import { Board, Section, stamp, useSources, useStaffRole, useSyncRunner, when } from '../../../features/admin';

/**
 * SOURCES — three connectors, one of them switched on.
 *
 * A SOURCE THAT IS SWITCHED OFF IS STILL A SOURCE (brief §5). `kai_sms` and
 * `stripe` are registered, implement the same interface, and report exactly why
 * they are off — no read-only Stripe key; the foreign database import is not
 * authorised yet. They are drawn dim, with their reason in plain words, rather
 * than left out: a connector that exists and is off is a different thing from a
 * feature that is missing, and only one of those gets rebuilt from scratch by
 * somebody next quarter.
 *
 * "Dry run" is the same act that writes nothing. It answers "what would this do
 * right now", and the answer is recorded, which is the only kind of answer
 * worth having about an ingest that touches every person in the CRM.
 */
const SOURCE_TITLE: Record<string, string> = {
  app: 'This app',
  kai_sms: 'K.AI SMS',
  stripe: 'Stripe',
};

export default function AdminSources() {
  const router = useRouter();
  const { data, loading, error, notAvailable, reload } = useSources();
  const runner = useSyncRunner(reload);
  // An ingest writes to every person in the CRM, so running one is `admin` and
  // above. `support` sees the same state and the same counts.
  const { canWrite } = useStaffRole();

  return (
    <Board
      testID="screen-admin-sources"
      current="sources"
      title="Sources"
      subtitle="Where people come from"
      onBack={() => router.replace('/admin')}
      loading={loading && !data}
      notAvailable={notAvailable}
      error={data ? null : error}
    >
      {(data ?? []).map((s) => (
        <Section key={s.source} label={(SOURCE_TITLE[s.source] ?? s.source).toUpperCase()}>
          <View style={{ gap: 6, paddingVertical: space.x10 }} testID={`source-${s.source}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Num size={11} weight="medium" c={s.configured ? color.text : color.dim}>{s.source}</Num>
              <T size={11} c={color.dim}>·</T>
              <T size={11.5} c={s.configured ? color.muted : color.dim} testID={`source-state-${s.source}`}>
                {s.configured ? 'switched on' : 'switched off'}
              </T>
            </View>
            <T size={12.5} c={color.muted} lh={19}>{s.plain}</T>
            {!s.configured && s.reason ? (
              <T size={11.5} c={color.dim} lh={17} testID={`source-reason-${s.source}`}>{s.reason}</T>
            ) : null}
          </View>

          <Rule />

          {s.last_run ? (
            <>
              <DataRow
                label="Last run"
                sub={s.last_run.dry_run ? 'dry run — nothing was written' : undefined}
                value={`${when(s.last_run.finished_at ?? s.last_run.started_at)} · ${s.last_run.state}`}
                mono={false}
              />
              <View
                style={{ flexDirection: 'row', gap: space.x14, paddingVertical: space.x11, borderBottomWidth: 0.5, borderBottomColor: alpha.ivory08 }}
                testID={`source-counts-${s.source}`}
              >
                {([
                  ['looked at', s.last_run.counts.scanned],
                  ['created', s.last_run.counts.created],
                  ['matched', s.last_run.counts.resolved],
                  ['unchanged', s.last_run.counts.skipped],
                  ['refused', s.last_run.counts.conflicted],
                ] as const).map(([l, n]) => (
                  <View key={l} style={{ gap: 3 }}>
                    <Num size={15} weight="bold">{n}</Num>
                    <T size={9.5} c={color.dim}>{l}</T>
                  </View>
                ))}
              </View>
              {s.last_run.error ? <T size={11.5} c={color.muted} style={{ paddingTop: space.x8 }}>{s.last_run.error}</T> : null}
              <T size={10} c={color.dim} style={{ paddingTop: space.x8 }}>{`Started ${stamp(s.last_run.started_at)}`}</T>
            </>
          ) : (
            <T size={12.5} c={color.muted} style={{ paddingVertical: space.x10 }}>This source has never run.</T>
          )}

          {s.configured && canWrite ? (
            <View style={{ flexDirection: 'row', gap: space.x10, marginTop: space.x12 }}>
              <Button
                testID={`sync-${s.source}`}
                label="Sync now"
                kind="voltGhost"
                height={44}
                full={false}
                style={{ flex: 1 }}
                loading={runner.running === s.source}
                onPress={() => runner.run(s.source, false)}
              />
              <Button
                testID={`dry-${s.source}`}
                label="Dry run"
                kind="outline"
                height={44}
                full={false}
                style={{ flex: 1 }}
                onPress={() => runner.run(s.source, true)}
              />
            </View>
          ) : null}
        </Section>
      ))}

      <View style={{ gap: 4, marginTop: space.x8 }}>
        <Eyebrow c={color.dim}>WHEN THE SMS SOURCE IS SWITCHED ON</Eyebrow>
        <T size={11.5} c={color.dim} lh={17}>
          It copies counts and timestamps only. Nineteen thousand private messages do not get duplicated into a
          marketing tool.
        </T>
      </View>

      <Sheet visible={!!runner.result} onClose={runner.dismiss} title="The run" testID="sheet-sync">
        <T size={13} lh={20} c={color.muted} testID="sync-result">{runner.result?.plain}</T>
        <Button label="Close" kind="outline" height={46} onPress={runner.dismiss} />
      </Sheet>
    </Board>
  );
}
