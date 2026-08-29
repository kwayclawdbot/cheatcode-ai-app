import React, { useState } from 'react';
import { View, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { T, Num, Eyebrow } from '../../../ui/Text';
import { Field } from '../../../ui/Field';
import { Button } from '../../../ui/Button';
import { Segmented } from '../../../ui/Segmented';
import { DataRow, Rule, VRule } from '../../../ui/DataRow';
import { color, space } from '../../../ui/tokens';
import { Board, Section, stamp, useInvites, when } from '../../../features/admin';
import type { AdminInviteRow } from '../../../lib/types';

/**
 * INVITES — codes and links, because there is no email provider wired up
 * anywhere in this app and a code the owner sends by any channel works today
 * (brief §2).
 *
 * MAKING A CODE IS THE OPERATOR'S OWN ACTION, so the one filled volt button on
 * this screen is "Make the code" and everything else is a ghost. Switching a
 * code off is not drawn in red: red is a financial semantic in this palette,
 * and a revoked invite is not a loss — it is a door that closed, so it reads in
 * `dim` with the word for it.
 *
 * THE STATE IS DERIVED, NEVER STORED. `open` / `revoked` / `expired` /
 * `exhausted` are functions of the clock and the cap, computed by the API on
 * every read, which is why a code can go stale on this screen without anybody
 * writing a row.
 */
const STATE_WORD: Record<AdminInviteRow['state'], string> = {
  open: 'open',
  revoked: 'switched off',
  expired: 'expired',
  exhausted: 'all used',
};

async function copy(text: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  return false;
}

export default function AdminInvites() {
  const router = useRouter();
  const { invites, totals, loading, error, notAvailable, create, revoke, busy, actionError } = useInvites();

  const [label, setLabel] = useState('');
  const [tier, setTier] = useState<'free' | 'premium'>('premium');
  const [seats, setSeats] = useState('1');
  const [days, setDays] = useState('');
  const [made, setMade] = useState<AdminInviteRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const submit = async () => {
    const n = parseInt(seats, 10);
    const d = parseInt(days, 10);
    const row = await create({
      ...(label.trim() ? { label: label.trim() } : null),
      tier,
      // Blank seats means UNCAPPED — a public launch link — and that is a
      // different thing from one seat, so it is never defaulted silently.
      max_redemptions: Number.isFinite(n) && n > 0 ? n : null,
      ...(Number.isFinite(d) && d > 0 ? { expires_in_days: d } : null),
    });
    if (row) { setMade(row); setLabel(''); }
  };

  return (
    <Board
      testID="screen-admin-invites"
      current="invites"
      title="Invites"
      subtitle={totals ? `${totals.outstanding} outstanding · ${totals.redeemed} redeemed` : null}
      onBack={() => router.replace('/admin')}
      loading={loading && !invites.length}
      notAvailable={notAvailable}
      error={actionError ?? (invites.length ? null : error)}
    >
      {totals ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x12, paddingBottom: space.x4 }} testID="invite-totals">
          {([
            ['Open', totals.outstanding],
            ['Redeemed', totals.redeemed],
            ['Off', totals.revoked],
            ['Expired', totals.expired],
          ] as const).map(([l, n], i) => (
            <React.Fragment key={l}>
              {i ? <VRule /> : null}
              <View style={{ flex: 1, gap: 3 }}>
                <Num size={18} weight="bold">{n}</Num>
                <T size={10} weight="bold" ls={0.8} c={color.dim} numberOfLines={1}>{l.toUpperCase()}</T>
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : null}

      <Section label="MAKE A CODE" note="Send it however you like. Codes are unguessable and have no ambiguous glyphs, so one survives being read down a phone.">
        <View style={{ gap: space.x12, paddingTop: space.x8 }}>
          <Field
            testID="invite-label"
            label="What it is for"
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. September cohort"
          />
          <Segmented
            testID="invite-tier"
            options={[{ key: 'premium' as const, label: 'Premium' }, { key: 'free' as const, label: 'Free' }]}
            value={tier}
            onChange={setTier}
          />
          <View style={{ flexDirection: 'row', gap: space.x10 }}>
            <View style={{ flex: 1 }}>
              <Field
                testID="invite-seats"
                label="Seats"
                value={seats}
                onChangeText={setSeats}
                keyboardType="number-pad"
                placeholder="blank = no cap"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                testID="invite-days"
                label="Expires in days"
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
                placeholder="blank = never"
              />
            </View>
          </View>
          <Button testID="cta-make-invite" label="Make the code" kind="volt" height={52} loading={busy} onPress={submit} />
        </View>
      </Section>

      {made ? (
        <View style={{ gap: 8, paddingVertical: space.x12 }} testID="invite-made">
          <Eyebrow c={color.volt}>NEW CODE</Eyebrow>
          <Num size={26} weight="bold" testID="invite-made-code">{made.code}</Num>
          <T size={12.5} c={color.muted} lh={19}>{made.plain}</T>
          <Pressable
            testID="invite-copy"
            accessibilityRole="button"
            accessibilityLabel="Copy the link"
            onPress={async () => setCopied(await copy(made.link) ? made.link : made.link)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 8 })}
          >
            <Num size={12} weight="medium" c={color.volt} testID="invite-made-link">{made.link}</Num>
            <T size={11} c={color.dim}>{copied === made.link ? 'copied' : 'tap to copy'}</T>
          </Pressable>
          <Rule />
        </View>
      ) : null}

      <Section label="EVERY CODE">
        {invites.length ? invites.map((i, n) => (
          <DataRow
            key={i.id}
            testID={`invite-${i.code}`}
            label={<Num size={14} weight="bold">{i.code}</Num>}
            sub={i.label ?? undefined}
            meta={`${i.tier} · ${i.redeemed_count}${i.max_redemptions ? ` of ${i.max_redemptions}` : ''} redeemed · ${STATE_WORD[i.state]}${i.expires_at ? ` · until ${stamp(i.expires_at)}` : ''}`}
            valueNode={
              i.state === 'open' ? (
                <Pressable
                  testID={`invite-revoke-${i.code}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch off ${i.code}`}
                  onPress={() => revoke(i.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <T size={11.5} c={color.muted}>Switch off</T>
                </Pressable>
              ) : (
                <T size={11} c={color.dim}>{when(i.created_at)}</T>
              )
            }
            dim={i.state !== 'open'}
            last={n === invites.length - 1}
          />
        )) : <T size={12.5} c={color.muted}>No codes yet.</T>}
      </Section>
    </Board>
  );
}
