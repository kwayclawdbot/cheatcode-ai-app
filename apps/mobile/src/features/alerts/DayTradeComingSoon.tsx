/**
 * DAY TRADE, ARCHIVED AS COMING SOON — owner ruling, 2026-09-06.
 *
 * WHAT THIS REPLACES. Until today, switching to Day Trade drew the ordinary
 * alerts board. Two things were wrong with that and only one of them was
 * visible: the board was empty of anything same-day, AND the twelve cards it
 * did show were SWING picks under a heading that said "these are same-day
 * alerts". An empty screen reads as broken; a mislabelled one is worse.
 *
 * WHAT IS TRUE, AND WHY THE COPY SAYS ONLY THIS MUCH:
 *   - The opening-range engine is switched off. The last `kai_orb_bullish`
 *     alert this product sent was 2026-08-04, and the intraday cron was
 *     disabled on 2026-08-03 pending the fix the 2026-07-29 audit asked for.
 *   - Two intraday families — `kai_long_or_break` and
 *     `kai_long_pullback_or_break` — DO still fire; eleven of them since
 *     5 August. They are record-only: they enter the app once they have a
 *     result, and they were never a published same-day trade plan with a stop
 *     and a target. So this screen must not say "nothing intraday is running",
 *     because that is false. It says there is nothing to ACT on, which is true.
 *   - There is no date. Nobody has given one, so inventing one here would be
 *     the same offence as printing a price nobody measured.
 *
 * NOTHING IS DELETED, and the screen says so, because "coming soon" next to a
 * mode a person has used before reads like their history went with it. The 317
 * stored day-trade setups are untouched.
 *
 * THE WAY OUT IS ON THE SCREEN. The mode chip is in the header, exactly where
 * it sits on the alerts board, and there is one explicit button to Swing —
 * which is live today. A coming-soon page with no exit is the dead end this
 * was written to remove, not a smaller version of it.
 *
 * Rules, not cards: a hairline and an eyebrow above each block, the same
 * grammar the delivery panel and the section rules use everywhere else. Volt
 * is the user's own action — the mode chip and the switch — and nothing here
 * is coloured as market data, because there is no market data on it.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Screen } from '../../ui/Screen';
import { T, Eyebrow } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { alpha, color } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { ModeControl } from '../home/ModeSheet';
import { secondTab } from '../nav/second-tab';
import type { GoalMode } from '../../lib/types';

/** A rule, an eyebrow, and the sentences under it. The app's section grammar. */
function Block({ label, children, testID }: {
  label: string; children: React.ReactNode; testID?: string;
}) {
  return (
    <View style={{ gap: 9, paddingTop: 4 }} testID={testID}>
      <View style={{ height: 0.5, backgroundColor: alpha.ivory08 }} />
      <Eyebrow>{label}</Eyebrow>
      {children}
    </View>
  );
}

export function DayTradeComingSoon({ mode }: { mode: GoalMode }) {
  const { patchProfile } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const second = secondTab(mode);

  /**
   * The one-tap exit. It writes the same way the mode sheet does — `PUT /mode`
   * then the local profile — so there is one path for changing mode and not a
   * second one that could drift from it.
   */
  const goSwing = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (api.available()) await api.setMode('swing');
      await patchProfile({ primary_mode: 'swing' });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [patchProfile]);

  return (
    <Screen variant="corner" layout="tab" testID="screen-day-trade-soon">
      <View style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 6, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <T size={28} weight="bold">{second.title}</T>
          <ModeControl mode={mode} testID="day-trade-soon-mode-chip" />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
        testID="day-trade-soon-body"
      >
        <View style={{ gap: 8, paddingTop: 4 }}>
          {/* The heading above already says Day Trade, and so does the chip
              beside it. Saying it a third time here reads like a form letter,
              so this line carries only the new information. */}
          <T size={19} weight="bold" lh={26} testID="day-trade-soon-title">
            Not live yet.
          </T>
          <T size={13.5} lh={21} c={color.muted}>
            Kai&apos;s same-day picker is being reworked, and until that lands he does not publish an
            intraday idea with an entry, a stop and a target. So there is nothing on this screen to
            act on — not because something broke, but because he is not calling any.
          </T>
        </View>

        <Block label="WHAT IS RUNNING TODAY" testID="day-trade-soon-swing">
          <T size={13} lh={20} c={color.muted}>
            Swing is live. Same alerts, longer horizon — Kai publishes them on the morning scan and
            they run for days rather than hours.
          </T>
          <Button
            testID="day-trade-soon-switch"
            label="Switch to Swing"
            kind="voltGhost"
            height={46}
            loading={busy}
            onPress={() => { void goSwing(); }}
          />
          {error ? <T size={11} c={color.red}>{error}</T> : null}
        </Block>

        <Block label="YOUR RECORD" testID="day-trade-soon-record">
          <T size={13} lh={20} c={color.muted}>
            Nothing has been deleted. Every same-day alert this product has sent is still stored,
            and it comes back with the picker.
          </T>
        </Block>

        <T size={10.5} lh={16} c={color.dim} testID="day-trade-soon-nodate">
          There is no date for this yet, and a made-up one would be worth less than saying so.
        </T>
      </ScrollView>
    </Screen>
  );
}
