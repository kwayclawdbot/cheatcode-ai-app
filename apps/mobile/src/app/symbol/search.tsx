import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { openKaiSheet } from '../../features/kai-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { KaiOrb } from '../../ui/KaiOrb';
import { Search, ArrowRight } from '../../ui/Icons';
import { family } from '../../ui/fonts';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { useSymbolSearch } from '../../features/trade/useTrade';

/**
 * Symbol search.
 * A query that resolves to an instrument opens the symbol page. A query that
 * doesn't is not an error — it becomes a question for Kai, which is the honest
 * reading of "safe AI stock under $200".
 */
export default function SymbolSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const { results, pending } = useSymbolSearch(q);

  const instruments = results.filter((r) => r.kind === 'instrument');
  const question = results.find((r) => r.kind === 'kai_question');

  return (
    <Screen variant="corner" layout="tab" testID="screen-symbol-search">
      <StackHeader title="Search" subtitle="Symbol, company, or a question" />

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <LinearGradient
          colors={gradient.composer as unknown as readonly [string, string, ...string[]]}
          start={gradientAngle.start}
          end={gradientAngle.end}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory20 }}
        >
          <Search size={15} color={color.muted} />
          <TextInput
            testID="search-input"
            accessibilityLabel="Search symbols or ask Kai"
            value={q}
            onChangeText={setQ}
            placeholder="META, Apple, or “safe AI stock under $200”"
            placeholderTextColor={color.dim}
            autoFocus
            autoCorrect={false}
            style={{ flex: 1, fontFamily: family.regular, fontSize: 15, color: color.text, ...(({ outlineStyle: 'none' } as unknown) as object) }}
          />
          {pending ? <ActivityIndicator size="small" color={color.muted} /> : null}
        </LinearGradient>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 11 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!q.trim() ? (
          <ObjectCard r={radius.xl} style={{ padding: 18, gap: 8 }}>
            <T size={14} weight="bold">Type a ticker, or just ask.</T>
            <T size={13} c={color.muted} lh={19}>
              &ldquo;META&rdquo; opens the symbol. &ldquo;What moved semiconductors today?&rdquo; goes to Kai instead.
            </T>
          </ObjectCard>
        ) : null}

        {instruments.length ? (
          <>
            <Eyebrow>SYMBOLS</Eyebrow>
            <RowList style={{ paddingVertical: 2 }}>
              {instruments.map((r, i) => (
                <Row key={r.kind === 'instrument' ? r.symbol : i} last={i === instruments.length - 1} style={{ paddingVertical: 10 }}>
                  <Pressable
                    testID={`result-${r.kind === 'instrument' ? r.symbol : i}`}
                    accessibilityRole="button"
                    accessibilityLabel={r.kind === 'instrument' ? `${r.symbol} ${r.name}` : ''}
                    onPress={() => r.kind === 'instrument' && router.push(`/symbol/${encodeURIComponent(r.symbol)}`)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44 }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 9, borderWidth: 0.5, borderColor: alpha.ivory14, backgroundColor: alpha.ivory06, alignItems: 'center', justifyContent: 'center' }}>
                      <Num size={12}>{r.kind === 'instrument' ? r.symbol.slice(0, 1) : '?'}</Num>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T size={14} weight="bold">{r.kind === 'instrument' ? r.symbol : ''}</T>
                      <T size={10} c={color.muted} numberOfLines={1}>
                        {r.kind === 'instrument' ? `${r.name}${r.exchange ? ` · ${r.exchange}` : ''}` : ''}
                      </T>
                    </View>
                    <ArrowRight size={12} color={color.muted} />
                  </Pressable>
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        {question ? (
          <Pressable
            testID="ask-kai-intent"
            accessibilityRole="button"
            accessibilityLabel={`Ask Kai: ${question.kind === 'kai_question' ? question.text : ''}`}
            onPress={() =>
              openKaiSheet({ question: question.kind === 'kai_question' ? question.text : q })
            }
          >
            <ObjectCard tone="kaiCard" r={radius.xl} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <KaiOrb size={30} />
              <View style={{ flex: 1 }}>
                <T size={11} c={color.violetLight}>Ask Kai</T>
                <T size={14} weight="semibold" style={{ marginTop: 2 }} numberOfLines={2}>
                  {question.kind === 'kai_question' ? question.text : q}
                </T>
              </View>
              <ArrowRight size={13} color={color.violetLight} />
            </ObjectCard>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
