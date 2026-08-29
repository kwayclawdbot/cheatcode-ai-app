import React, { useEffect, useState } from 'react';
import { View, ScrollView, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { KaiOrb } from '../../ui/KaiOrb';
import { family } from '../../ui/fonts';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { useAlertActions, useAlertBuilder } from '../../features/alerts/useAlerts';
import { PushPrimingBlock, usePrimingGate } from '../../features/notifications';

const EXAMPLES = [
  'Watch META for a break above 504',
  'Tell me if NVDA loses 902',
  'Let me know when AAPL reports earnings',
];

/**
 * Natural-language alert builder.
 * You write the sentence; Kai shows the structured condition he read out of it
 * BEFORE anything is armed. Nothing is created until you press Activate.
 */
export default function NewAlert() {
  const params = useLocalSearchParams<{ symbol?: string; setup_id?: string; level?: string; text?: string }>();
  const router = useRouter();
  const [text, setText] = useState(
    typeof params.text === 'string' && params.text
      ? params.text
      : params.symbol
        ? `Watch ${params.symbol}${params.level ? ` for a break above ${params.level}` : ''}`
        : '',
  );
  const { preview, pending, error, build, clear } = useAlertBuilder();
  const actions = useAlertActions();
  const [done, setDone] = useState(false);
  /**
   * The one priming moment (§4.3). It is due only after the alert is actually
   * armed — the act that implies wanting the buzz — and only once ever. It
   * rides inside the confirmation sheet the user is already reading, so this
   * is one sheet at one moment, not a second one appearing over the first.
   */
  const priming = usePrimingGate(done);

  // Prefilled from a setup or a symbol page: read it once so the preview is
  // already on screen when the sheet opens.
  useEffect(() => {
    if (text && !preview) {
      void build(text, {
        symbol: typeof params.symbol === 'string' ? params.symbol : undefined,
        setup_id: typeof params.setup_id === 'string' ? params.setup_id : undefined,
        level: params.level ? Number(params.level) : undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activate = async () => {
    if (!preview) return;
    await actions.activate(preview.alert_id || 'draft-local');
    if (!actions.upgradeNeeded) setDone(true);
  };

  return (
    <Screen variant="dome" layout="tab" testID="screen-alert-new">
      <StackHeader title="New alert" subtitle="Tell Kai what to watch" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <KaiOrb size={24} />
          <T size={14} lh={21} style={{ flex: 1 }}>
            Write it the way you&apos;d say it. I&apos;ll show you exactly what I understood before I start watching.
          </T>
        </ObjectCard>

        <LinearGradient
          colors={gradient.composer as unknown as readonly [string, string, ...string[]]}
          start={gradientAngle.start}
          end={gradientAngle.end}
          style={{ borderRadius: radius.xxl, borderWidth: 0.5, borderColor: alpha.ivory20, paddingHorizontal: 16, paddingVertical: 14 }}
        >
          <TextInput
            testID="alert-nl-input"
            accessibilityLabel="What should Kai watch?"
            value={text}
            onChangeText={(v) => { setText(v); if (preview) clear(); }}
            placeholder="Watch META for a break above 504"
            placeholderTextColor={color.dim}
            multiline
            numberOfLines={3}
            style={{
              fontFamily: family.regular,
              fontSize: 16,
              lineHeight: 23,
              color: color.text,
              minHeight: 66,
              textAlignVertical: 'top',
              ...(({ outlineStyle: 'none' } as unknown) as object),
            }}
          />
        </LinearGradient>

        {!preview ? (
          <>
            <Eyebrow>OR START FROM ONE OF THESE</Eyebrow>
            <View style={{ gap: 8 }}>
              {EXAMPLES.map((e) => (
                <Pressable
                  key={e}
                  testID={`example-${e.split(' ')[1]}`}
                  accessibilityRole="button"
                  accessibilityLabel={e}
                  onPress={() => { setText(e); void build(e); }}
                  style={({ pressed }) => ({
                    borderWidth: 0.5, borderColor: alpha.ivory14, borderRadius: radius.lg,
                    paddingHorizontal: 13, paddingVertical: 12, minHeight: 44, justifyContent: 'center',
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <T size={13} c={color.muted}>{e}</T>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {preview ? (
          <>
            <Eyebrow c={color.violetLight}>WHAT KAI UNDERSTOOD</Eyebrow>
            <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }} testID="alert-preview">
              <T size={14} lh={21}>{preview.summary_plain}</T>
              {preview.structured.length ? (
                <RowList style={{ marginTop: 2 }}>
                  {preview.structured.map((p, i) => (
                    <Row key={`${p.label}${i}`} last={i === preview.structured.length - 1}>
                      <T size={13} c={color.muted} style={{ flex: 1 }}>{p.label}</T>
                      <Num size={12.5}>{p.value}</Num>
                    </Row>
                  ))}
                </RowList>
              ) : (
                <T size={12} c={color.gold}>
                  I couldn&apos;t find a symbol and a level in that. Name the ticker and the price you care about.
                </T>
              )}
            </ObjectCard>
            <T size={11} c={color.muted} lh={17}>
              Once it&apos;s active Kai arms the condition. Live evaluation starts when market data goes live.
            </T>
          </>
        ) : null}

        {error ? <T size={12} c={color.red}>{error}</T> : null}
        {actions.error ? <T size={12} c={color.red}>{actions.error}</T> : null}

        {preview && preview.structured.length ? (
          <Button testID="cta-activate" label="Activate this alert" kind="volt" height={52} loading={actions.busyId !== null} onPress={activate} />
        ) : (
          <Button
            testID="cta-read-it"
            label="Show me what you understood"
            kind="volt"
            height={52}
            disabled={!text.trim()}
            loading={pending}
            onPress={() => build(text.trim(), {
              symbol: typeof params.symbol === 'string' ? params.symbol : undefined,
              setup_id: typeof params.setup_id === 'string' ? params.setup_id : undefined,
            })}
          />
        )}
      </ScrollView>

      <Sheet visible={done} onClose={() => { setDone(false); router.replace('/alerts'); }} title="Kai is watching it" testID="sheet-activated">
        <T size={13} lh={20} c={color.muted}>{preview?.summary_plain}</T>
        {priming.due ? (
          <PushPrimingBlock
            summaryPlain={preview?.summary_plain}
            onDone={() => { void priming.close(); setDone(false); router.replace('/alerts'); }}
          />
        ) : (
          <Button label="Back to alerts" kind="volt" height={48} onPress={() => { setDone(false); router.replace('/alerts'); }} />
        )}
      </Sheet>

      <Sheet visible={!!actions.upgradeNeeded} onClose={actions.dismissUpgrade} title="That needs the premium plan">
        <T size={13} lh={20} c={color.muted}>{actions.upgradeNeeded}</T>
        <Button label="See what premium adds" kind="volt" height={48} onPress={() => { actions.dismissUpgrade(); router.push('/account/subscription'); }} />
      </Sheet>
    </Screen>
  );
}
