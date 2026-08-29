import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { T, Num } from '../../../ui/Text';
import { Button } from '../../../ui/Button';
import { ChipRail } from '../../../ui/Segmented';
import { DataRow, Rule } from '../../../ui/DataRow';
import { color, space } from '../../../ui/tokens';
import { Board, Section, stamp, useAudit, when } from '../../../features/admin';

/**
 * AUDIT — what staff did, including reading.
 *
 * The table is append-only for the service role: INSERT and SELECT and nothing
 * else, TRUNCATE included. This API can read the log and can never rewrite it,
 * which is the property that makes it worth reading at all.
 *
 * READING THE LOG IS ITSELF LOGGED, and the row carries the filter — so a
 * search through one person's history is visible as exactly that. That is not
 * ceremony: "who went looking, and for whom" is the question an audit trail
 * exists to answer, and it is the one an unaudited audit screen cannot.
 *
 * WRITES AND READS SIT IN ONE LIST ON PURPOSE. A log that shows only writes
 * renders somebody opening two thousand people's files on their last day as
 * nothing at all.
 */
const LENSES: { key: string; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'crm.person.read', label: 'Files opened' },
  { key: 'admin.people.search', label: 'Searches' },
  { key: 'invite.create', label: 'Codes made' },
  { key: 'invite.redeem', label: 'Codes redeemed' },
  { key: 'entitlement.grant', label: 'Access granted' },
  { key: 'entitlement.revoke', label: 'Access removed' },
  { key: 'crm.sync.run', label: 'Syncs' },
  { key: 'crm.person.transcript', label: 'Transcripts read' },
];

export default function AdminAudit() {
  const router = useRouter();
  const params = useLocalSearchParams<{ target_id?: string }>();
  const [lens, setLens] = useState('all');

  const filter = useMemo(
    () => ({ ...(lens === 'all' ? null : { action: lens }), ...(params.target_id ? { target_id: params.target_id } : null) }),
    [lens, params.target_id]
  );
  const { data, entries, loading, error, notAvailable, hasMore, more } = useAudit(filter);

  return (
    <Board
      testID="screen-admin-audit"
      current="audit"
      title="Audit"
      subtitle={entries.length ? `${entries.length} entries` : null}
      onBack={() => router.replace('/admin')}
      loading={loading && !data}
      notAvailable={notAvailable}
      error={data ? null : error}
    >
      <ChipRail testID="audit-lens" options={LENSES} value={lens} onChange={setLens} />

      <Section label="WHAT STAFF DID">
        {entries.length ? entries.map((e, i) => (
          <DataRow
            key={e.id}
            testID={`audit-${e.action}`}
            label={<T size={13} lh={19}>{e.plain || e.action.replace(/[._]/g, ' ')}</T>}
            sub={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Num size={10} weight="medium" c={color.muted}>{e.action}</Num>
                {e.target_kind ? <T size={10} c={color.dim}>{`on ${e.target_kind}`}</T> : null}
                {!e.actor_name && e.actor_user_id ? (
                  <Num size={9.5} weight="regular" c={color.dim}>{e.actor_user_id.slice(0, 8)}</Num>
                ) : null}
              </View>
            }
            meta={e.reason ? `“${e.reason}”` : undefined}
            valueNode={
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Num size={10.5} weight="medium" c={color.muted}>{when(e.created_at)}</Num>
                <Num size={9.5} weight="regular" c={color.dim}>{stamp(e.created_at)}</Num>
              </View>
            }
            onPress={e.target_kind === 'crm_person' && e.target_id ? () => router.push(`/admin/person/${e.target_id}` as never) : undefined}
            last={i === entries.length - 1}
          />
        )) : (
          <T size={12.5} c={color.muted}>{data?.plain ?? 'Nothing logged yet that matches.'}</T>
        )}
      </Section>

      {hasMore ? (
        <>
          <Rule />
          <Button testID="audit-more" label="Show more" kind="outline" height={46} onPress={more} style={{ marginTop: space.x8 }} />
        </>
      ) : null}

      <T size={10} c={color.dim} lh={15}>
        This log cannot be edited or deleted by anything in this app, including this screen. Reading it wrote a row.
      </T>
    </Board>
  );
}
