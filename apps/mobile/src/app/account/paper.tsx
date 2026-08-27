import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Screen } from '../../ui/Screen';
import { NotConnected, ScreenLoading } from '../../ui/Loading';
import { StackHeader } from '../../ui/StackHeader';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { alpha, color, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useMe } from '../../features/account/useAccount';

const usd = (n: number | null | undefined) =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthOf = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

/** Paper account — the balance, and the once-a-month reset behind a confirm. */
export default function Paper() {
  const { data, loading, error, isFixture, notAvailable, reload } = useMe();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const paper = data?.paper ?? null;
  const lastReset = monthOf(paper?.last_reset_at);
  const thisMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const alreadyResetThisMonth = lastReset === thisMonth;
  const canReset = (paper?.can_reset ?? true) && !alreadyResetThisMonth;

  const doReset = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (api.available()) {
        await api.resetPaper();
        setResult('Your practice balance is back to where it started.');
        reload();
      } else {
        setResult('Fixtures mode — connect the api-app to reset a real paper account.');
      }
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'That did not go through.');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-paper">
        <ScreenLoading />
      </Screen>
    );
  }

  return (
    <Screen variant="corner" layout="tab" testID="screen-paper">
      <StackHeader title="Paper account" subtitle="Practice money · not real" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 11 }}
        showsVerticalScrollIndicator={false}
      >
        <ObjectCard r={radius.xxl} style={{ padding: 18, gap: 6 }} testID="paper-balance">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <T size={11} c={color.muted}>Practice balance</T>
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 0.5, borderColor: alpha.cyan40 }}>
              <T size={9} weight="bold" c={color.cyan}>PAPER</T>
            </View>
          </View>
          <Num size={30} weight="semibold">{usd(paper?.equity)}</Num>
          <T size={11} c={color.muted}>Nothing here is real money and nothing here reaches a broker.</T>
        </ObjectCard>

        <RowList>
          <Row>
            <T size={13} c={color.muted} style={{ flex: 1 }}>Cash</T>
            <Num size={13}>{usd(paper?.cash)}</Num>
          </Row>
          <Row>
            <T size={13} c={color.muted} style={{ flex: 1 }}>Buying power</T>
            <Num size={13}>{usd(paper?.buying_power)}</Num>
          </Row>
          <Row>
            <T size={13} c={color.muted} style={{ flex: 1 }}>Started at</T>
            <Num size={13}>{usd(paper?.starting_balance)}</Num>
          </Row>
          <Row last>
            <T size={13} c={color.muted} style={{ flex: 1 }}>Resets used</T>
            <Num size={13}>{paper?.reset_count ?? 0}</Num>
          </Row>
        </RowList>

        <Eyebrow c={color.gold}>RESET</Eyebrow>
        <ObjectCard r={radius.xl} style={{ padding: 15, gap: 9 }}>
          <T size={13} lh={19} c={color.muted}>
            You can reset the practice balance once a calendar month. Open positions stay where they are — this only puts the cash back.
          </T>
          {alreadyResetThisMonth ? (
            <T size={12} c={color.gold}>{`Already reset in ${thisMonth}. The next one is available next month.`}</T>
          ) : null}
          <Button
            testID="cta-reset-paper"
            label="Reset practice balance"
            kind="volt"
            height={48}
            disabled={!canReset}
            onPress={() => setConfirm(true)}
          />
        </ObjectCard>

        {notAvailable ? <NotConnected what="Your paper account" /> : error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample account — the service is not connected here.</T> : null}
      </ScrollView>

      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Reset your practice balance?" testID="sheet-reset">
        <T size={13} lh={20} c={color.muted}>
          {`Cash goes back to ${usd(paper?.starting_balance)}. You get one reset a month, so this uses it.`}
        </T>
        <Button label="Yes, reset it" kind="volt" height={48} loading={busy} onPress={doReset} />
        <Button label="Leave it" kind="ghost" height={44} onPress={() => setConfirm(false)} />
      </Sheet>

      <Sheet visible={!!result} onClose={() => setResult(null)} title="Paper account">
        <T size={13} lh={20} c={color.muted}>{result}</T>
        <Button label="Done" kind="volt" height={48} onPress={() => setResult(null)} />
      </Sheet>
    </Screen>
  );
}
