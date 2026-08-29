import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { T, Num } from '../../../ui/Text';
import { Field } from '../../../ui/Field';
import { Button } from '../../../ui/Button';
import { ChipRail } from '../../../ui/Segmented';
import { DataRow, Rule } from '../../../ui/DataRow';
import { color, space } from '../../../ui/tokens';
import {
  Board, Section, StatusMark, FUNNEL_ORDER, personName, sourceLabel, statusLabel,
  usePeople, useSegments, when,
} from '../../../features/admin';
import type { AdminPeopleFilter, CrmStatus } from '../../../lib/types';

/**
 * PEOPLE — search, filters, saved segments, and never a list of 2,507.
 *
 * The list is keyset-paged: "Show more" walks an opaque cursor the server
 * issued, and there is no page size on this screen to raise. That is not a
 * courtesy to the database — an admin screen that can pull the whole table in
 * one request is a screen that exports the whole table by accident.
 *
 * IT SAYS WHAT IT SEARCHED. The API returns `searched`, and the footnote under
 * the field repeats it verbatim, so nobody concludes from an empty result that
 * a person is not in the CRM when the truth is that their ticker interest was
 * never a searchable field.
 *
 * Status is drawn in TYPE, not in colour. `paying` is bold, the two that are
 * over are dim, the rest are muted — no pill borrows green or red, because
 * nothing on this row is money (brief §9).
 */
export default function AdminPeople() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string; tag?: string; segment_id?: string }>();

  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<CrmStatus | 'all'>(
    FUNNEL_ORDER.includes(params.status as CrmStatus) ? (params.status as CrmStatus) : 'all'
  );
  const [segmentId, setSegmentId] = useState<string | undefined>(params.segment_id);

  // The search waits for the typing to stop. Every keystroke is a `staffed()`
  // request that writes an audit row; a per-keystroke search would fill the log
  // with "admin.people.search" and hide the searches a human actually ran.
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 350);
    return () => clearTimeout(t);
  }, [typed]);

  const filter = useMemo<AdminPeopleFilter>(() => ({
    ...(q ? { q } : null),
    ...(status !== 'all' ? { status } : null),
    ...(params.tag ? { tag: params.tag } : null),
    ...(segmentId ? { segment_id: segmentId } : null),
  }), [q, status, params.tag, segmentId]);

  const { data, people, loading, error, notAvailable, hasMore, loadingMore, more } = usePeople(filter);
  const segments = useSegments();

  const subtitle = data
    ? data.total != null ? `${data.total.toLocaleString('en-US')} matching` : 'more than we count in one go'
    : null;

  return (
    <Board
      testID="screen-admin-people"
      current="people"
      title="People"
      subtitle={subtitle}
      onBack={() => router.replace('/admin')}
      loading={loading && !data}
      notAvailable={notAvailable}
      error={data ? null : error}
    >
      <Field
        testID="people-search"
        label="Search"
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Name, email or phone"
      />
      {data?.searched.length ? (
        <T size={10.5} c={color.dim} style={{ marginTop: -8 }} testID="people-searched">
          {`Searched ${data.searched.join(', ')}. Nothing else.`}
        </T>
      ) : null}

      <ChipRail
        testID="people-status"
        options={[{ key: 'all' as const, label: 'Everyone' }, ...FUNNEL_ORDER.map((s) => ({ key: s, label: statusLabel(s) }))]}
        value={status}
        onChange={(k) => { setStatus(k as CrmStatus | 'all'); setSegmentId(undefined); }}
      />

      {segments.data && segments.data.length ? (
        <Section label="SAVED SEGMENTS" note="A segment is a filter, not a list — it re-runs every time.">
          {segments.data.map((s, i) => (
            <DataRow
              key={s.id}
              testID={`segment-${s.id}`}
              label={s.name}
              sub={s.ignored_keys.length ? `Ignoring ${s.ignored_keys.join(', ')} — this API does not know that field` : undefined}
              value={segmentId === s.id ? 'on' : undefined}
              mono={false}
              valueTone={segmentId === s.id ? color.volt : undefined}
              onPress={() => { setSegmentId(segmentId === s.id ? undefined : s.id); setStatus('all'); }}
              last={i === (segments.data?.length ?? 0) - 1}
            />
          ))}
        </Section>
      ) : null}

      {people.length ? (
        <Section label={q || status !== 'all' || segmentId ? 'MATCHES' : 'EVERYONE'}>
          {people.map((p, i) => (
            <DataRow
              key={p.id}
              testID={`person-${p.id}`}
              accessibilityLabel={`${personName(p)}, ${statusLabel(p.status)}`}
              label={personName(p)}
              sub={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <StatusMark status={p.status} />
                  <T size={11} c={color.dim}>·</T>
                  <T size={11} c={color.muted} numberOfLines={1} style={{ flex: 1 }}>
                    {`${p.primary_tier ?? 'no tier'} · ${sourceLabel(p.source)}`}
                  </T>
                </View>
              }
              valueNode={
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Num size={11} weight="medium" c={color.muted}>{when(p.last_active_at)}</Num>
                  {p.tags.length ? <T size={10} c={color.dim}>{p.tags.slice(0, 2).join(' · ')}</T> : null}
                </View>
              }
              onPress={() => router.push(`/admin/person/${p.id}` as never)}
              chevron
              dim={p.status === 'blocked' || p.status === 'churned'}
              last={i === people.length - 1}
            />
          ))}
        </Section>
      ) : (
        <T size={13} c={color.muted} lh={20} testID="people-empty">
          {data?.plain ?? 'Nobody matches that.'}
        </T>
      )}

      {hasMore ? (
        <>
          <Rule />
          <Button
            testID="people-more"
            label={loadingMore ? 'Reading…' : 'Show more'}
            kind="outline"
            height={46}
            loading={loadingMore}
            onPress={more}
            style={{ marginTop: space.x8 }}
          />
        </>
      ) : null}
    </Board>
  );
}
