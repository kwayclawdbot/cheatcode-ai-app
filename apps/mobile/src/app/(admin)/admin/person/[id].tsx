import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { T, Num, Eyebrow } from '../../../../ui/Text';
import { Field } from '../../../../ui/Field';
import { Button, Chip } from '../../../../ui/Button';
import { Sheet } from '../../../../ui/Sheet';
import { DataRow, Figure, Rule } from '../../../../ui/DataRow';
import { alpha, color, space } from '../../../../ui/tokens';
import { api } from '../../../../lib/api';
import {
  Board, Section, StatusMark, IDENTITY_LABEL, money, personName, sourceLabel, stamp,
  statusLabel, usePerson, when,
} from '../../../../features/admin';

/**
 * ONE PERSON'S FILE.
 *
 * OPENING THIS PAGE IS A LOGGED ACT. `GET /admin/people/[id]` writes
 * `crm.person.read` before it answers, because the damage an admin surface does
 * is somebody opening two thousand of these on their last day, and a log of
 * writes shows that as nothing at all (brief §3). The footer says so out loud —
 * an operator should know the room has a camera.
 *
 * WHAT IS NOT ON THIS PAGE. Not one word anybody said to Kai. The block below
 * carries a conversation count and a timestamp and nothing else; reading the
 * words is a separate call that demands a reason and audits under the person's
 * name. This build has no conversation picker to hang that on, so the screen
 * says the words exist and where they are, rather than pretending they do not.
 *
 * MONEY IS THE ONLY THING IN COLOUR. Gold is a financial semantic; a status, a
 * tag and a merge conflict are not, so they are drawn in weight and in `muted`.
 */
export default function AdminPerson() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, notAvailable, reload } = usePerson(id ?? '');

  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [grant, setGrant] = useState<'grant' | 'revoke' | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const p = data?.person;
  const appUserId = p?.app_user_id ?? null;

  const act = async (key: string, run: () => Promise<string>) => {
    setBusy(key);
    try {
      setSaid(await run());
      reload();
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const submitGrant = async () => {
    if (reason.trim().length < 8) {
      setReasonError('Say why, in a few words. This is written next to your name and it does not come off.');
      return;
    }
    if (!appUserId || !grant) return;
    const action = grant;
    setGrant(null);
    setReasonError(null);
    const because = reason.trim();
    setReason('');
    await act('entitlement', async () => {
      await api.adminEntitlement(appUserId, { action, tier: 'premium', reason: because });
      return action === 'grant'
        ? 'Premium granted. Logged against your name with the reason you gave.'
        : 'Access removed. Logged against your name with the reason you gave.';
    });
  };

  return (
    <Board
      testID="screen-admin-person"
      current="people"
      title={p ? personName(p) : 'Person'}
      subtitle={p ? `${statusLabel(p.status)} · ${p.primary_tier ?? 'no tier'}` : null}
      onBack={() => router.replace('/admin/people')}
      loading={loading && !data}
      notAvailable={notAvailable}
      error={data ? null : error}
    >
      {data && p ? (
        <>
          <T size={13} c={color.muted} lh={20} testID="person-plain">{data.plain}</T>

          {data.merge_conflicts.length ? (
            <View
              testID="person-conflicts"
              style={{
                gap: 6, paddingVertical: space.x11, paddingHorizontal: space.x13,
                borderLeftWidth: 2, borderLeftColor: alpha.ivory25, backgroundColor: alpha.ivory04,
              }}
            >
              <Eyebrow>NEEDS A HUMAN</Eyebrow>
              {data.merge_conflicts.map((c) => (
                <T key={c.id} size={12.5} lh={19} c={color.muted}>{c.plain}</T>
              ))}
              <T size={11} c={color.dim} lh={16}>
                Two records each carry a different strong identity, so nothing was merged automatically.
              </T>
            </View>
          ) : null}

          <Section label="WHO THEY ARE" note="Every identity that resolves to this person.">
            {data.identities.length ? data.identities.map((i, n) => (
              <DataRow
                key={i.id || `${i.kind}:${i.value}`}
                testID={`identity-${i.kind}`}
                label={IDENTITY_LABEL[i.kind] ?? i.kind}
                sub={i.verified ? undefined : 'unverified'}
                valueNode={<Num size={11.5} weight="medium" c={color.muted} >{i.value}</Num>}
                last={n === data.identities.length - 1}
              />
            )) : <T size={12.5} c={color.muted}>No identities recorded yet.</T>}
            <Rule />
            <DataRow label="First seen" value={stamp(p.first_seen_at)} />
            <DataRow label="Last active" value={stamp(p.last_active_at)} />
            <DataRow label="Came from" value={sourceLabel(p.source)} mono={false} last />
          </Section>

          <Section label="MONEY" note="This database knows a tier. It does not know what anybody paid — that arrives with the Stripe source.">
            <Figure label="Paid to date" value={money(p.total_paid_cents)} tone={color.gold} testID="fig-paid" />
            <Figure label="Monthly recurring" value={money(p.current_mrr_cents)} tone={color.gold} testID="fig-mrr" />
            <Figure label="Lifetime value" value={money(p.ltv_cents)} tone={color.gold} testID="fig-ltv" last />
          </Section>

          <Section label="ACCESS">
            <DataRow
              label="Plan"
              value={data.subscription ? `${data.subscription.tier} · ${data.subscription.status}` : 'no account'}
              mono={false}
            />
            {data.subscription?.current_period_end ? (
              <DataRow label="Runs until" value={stamp(data.subscription.current_period_end)} />
            ) : null}
            {data.entitlements.map((e, i) => (
              <DataRow
                key={e.key}
                label={e.key.replace(/_/g, ' ')}
                value={e.value_plain}
                mono={false}
                last={i === data.entitlements.length - 1}
              />
            ))}
            {appUserId ? (
              <View style={{ flexDirection: 'row', gap: space.x10, marginTop: space.x12 }}>
                <Button
                  testID="cta-grant"
                  label="Grant premium"
                  kind="voltGhost"
                  height={44}
                  full={false}
                  style={{ flex: 1 }}
                  loading={busy === 'entitlement'}
                  onPress={() => { setGrant('grant'); setReason(''); setReasonError(null); }}
                />
                <Button
                  testID="cta-revoke"
                  label="Remove access"
                  kind="outline"
                  height={44}
                  full={false}
                  style={{ flex: 1 }}
                  onPress={() => { setGrant('revoke'); setReason(''); setReasonError(null); }}
                />
              </View>
            ) : (
              <T size={11.5} c={color.dim} lh={17} style={{ marginTop: space.x8 }}>
                There is no app account on this person yet, so there is nothing to grant. Send them a code instead.
              </T>
            )}
          </Section>

          <Section label="KAI">
            <DataRow label="Conversations" value={String(data.kai.conversations)} />
            <DataRow label="Messages" value={String(data.kai.messages)} />
            <DataRow label="Last message" value={stamp(data.kai.last_message_at)} last />
            {data.kai.plain ? (
              <T size={12} c={color.muted} lh={18} style={{ marginTop: space.x8 }}>{data.kai.plain}</T>
            ) : null}
            {/* The standing rule, said on every person, not only on the ones who
                happen to have written something: the privacy contract is a
                property of this CRM, not a fact about this human. */}
            <T size={11.5} c={color.dim} lh={17} style={{ marginTop: 6 }} testID="kai-privacy">
              Counts and timestamps only. What they said to Kai is not copied into the CRM — reading their words is a
              separate act that asks you why and is logged under your name.
            </T>
          </Section>

          <Section label="SCORES">
            {data.scores.tracked ? (
              <>
                <Figure label="Engagement" value={data.scores.engagement?.toString() ?? null} />
                <Figure label="Likely to buy" value={data.scores.buy_propensity?.toString() ?? null} />
                <Figure label="Churn risk" value={data.scores.churn_risk?.toString() ?? null} />
                <Figure label="Responsiveness" value={data.scores.responsiveness?.toString() ?? null} />
                <Figure label="Predicted lifetime value" value={money(data.scores.predicted_ltv_cents)} tone={color.gold} last />
              </>
            ) : (
              <T size={12.5} c={color.muted} lh={19} testID="scores-untracked">
                {data.scores.plain || 'Nothing computes these yet. They are ported columns, empty until a source fills them — an empty column is honest, a fabricated score is not.'}
              </T>
            )}
          </Section>

          <Section label="TAGS">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: space.x10 }}>
              {p.tags.length ? p.tags.map((t) => (
                <Pressable
                  key={t}
                  testID={`tag-${t}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove tag ${t}`}
                  onPress={() => act('tags', async () => {
                    await api.adminTags(p.id, { remove: [t] });
                    return `Removed “${t}”.`;
                  })}
                >
                  <Chip label={`${t}  ×`} muted />
                </Pressable>
              )) : <T size={12.5} c={color.muted}>No tags.</T>}
            </View>
            <Field
              testID="tag-input"
              label="Add a tag"
              value={tag}
              onChangeText={setTag}
              autoCapitalize="none"
              placeholder="e.g. beta"
              onSubmitEditing={() => {
                const t = tag.trim();
                if (!t) return;
                setTag('');
                void act('tags', async () => { await api.adminTags(p.id, { add: [t] }); return `Tagged “${t}”.`; });
              }}
            />
          </Section>

          <Section label="NOTES" note="Only staff can see these.">
            {data.notes.map((n, i) => (
              <DataRow
                key={n.id}
                label={<T size={13} lh={19}>{n.body}</T>}
                sub={`${n.author_name ?? 'Someone'} · ${when(n.created_at)}`}
                last={i === data.notes.length - 1}
              />
            ))}
            {!data.notes.length ? <T size={12.5} c={color.muted}>Nothing written down yet.</T> : null}
            <View style={{ gap: space.x10, marginTop: space.x12 }}>
              <Field
                testID="note-input"
                label="Add a note"
                value={note}
                onChangeText={setNote}
                placeholder="What happened"
              />
              <Button
                testID="cta-note"
                label="Save note"
                kind="voltGhost"
                height={44}
                disabled={!note.trim()}
                loading={busy === 'note'}
                onPress={() => {
                  const body = note.trim();
                  if (!body) return;
                  setNote('');
                  void act('note', async () => { await api.adminAddNote(p.id, body); return 'Saved.'; });
                }}
              />
            </View>
          </Section>

          <Section label="INVITES">
            {data.redemptions.map((r, i) => (
              <DataRow
                key={r.id}
                label={r.label ?? 'A code'}
                sub={`redeemed ${when(r.redeemed_at)}`}
                value={r.code ?? undefined}
                last={i === data.redemptions.length - 1}
              />
            ))}
            {!data.redemptions.length ? <T size={12.5} c={color.muted}>No codes redeemed.</T> : null}
            <Button
              testID="cta-person-invite"
              label="Make a code for this person"
              kind="voltGhost"
              height={44}
              loading={busy === 'invite'}
              style={{ marginTop: space.x12 }}
              onPress={() => act('invite', async () => {
                const inv = await api.adminCreateInvite({
                  tier: 'premium',
                  label: `For ${personName(p)}`,
                  max_redemptions: 1,
                  person_id: p.id,
                });
                return `Code ${inv.code}. It resolves back to this person when it is redeemed.`;
              })}
            />
          </Section>

          <Section label="TIMELINE" note="Every source, one thread.">
            {data.timeline.map((t, i) => (
              <DataRow
                key={t.id}
                testID={`event-${t.type}`}
                label={<T size={13} lh={19}>{t.plain || t.type.replace(/[._]/g, ' ')}</T>}
                sub={`${sourceLabel(t.source)} · ${stamp(t.occurred_at)}`}
                value={t.value_cents != null ? money(t.value_cents) : undefined}
                valueTone={color.gold}
                last={i === data.timeline.length - 1}
              />
            ))}
            {!data.timeline.length ? <T size={12.5} c={color.muted}>Nothing has happened to this person yet.</T> : null}
          </Section>

          {data.merged_from.length ? (
            <Section label="MERGED IN">
              {data.merged_from.map((m, i) => (
                <DataRow key={m.id} label={m.display_name ?? m.id} value={m.id.slice(0, 8)} last={i === data.merged_from.length - 1} />
              ))}
            </Section>
          ) : null}

          <View style={{ gap: 4, marginTop: space.x8 }}>
            <Num size={10} weight="regular" c={color.dim}>{p.id}</Num>
            <T size={10} c={color.dim} lh={15}>
              Opening this page was written to the audit log under your name.
            </T>
          </View>
        </>
      ) : null}

      <Sheet
        visible={!!grant}
        onClose={() => { setGrant(null); setReasonError(null); }}
        title={grant === 'revoke' ? 'Remove access' : 'Grant premium'}
        testID="sheet-entitlement"
      >
        <T size={12.5} lh={19} c={color.muted}>
          {grant === 'revoke'
            ? 'This drops them to free straight away, and they will see it in their own timeline.'
            : 'This turns premium on straight away, with no end date, and they will see it in their own timeline.'}
        </T>
        <Field
          testID="reason-input"
          label="Why"
          value={reason}
          onChangeText={(v) => { setReason(v); setReasonError(null); }}
          placeholder="At least a few words"
          error={reasonError}
        />
        <Button testID="cta-entitlement-confirm" label={grant === 'revoke' ? 'Remove it' : 'Grant it'} kind="volt" height={48} onPress={submitGrant} />
      </Sheet>

      <Sheet visible={!!said} onClose={() => setSaid(null)} title="Done" testID="sheet-said">
        <T size={13} lh={20} c={color.muted} testID="said-body">{said}</T>
        <Button label="Close" kind="outline" height={46} onPress={() => setSaid(null)} />
      </Sheet>
    </Board>
  );
}
