/**
 * `/design-check` — the review harness for the ticker mark and the grade gauge.
 *
 * The owner reviews design before it ships, and a claim is not a review. This
 * route renders, in the real running app on the real fonts and the real
 * palette, the states nothing else puts on one screen: every grade band beside
 * the band it replaced, the chip in a dense row, and a ticker with a real logo,
 * with no logo, and with a long symbol.
 *
 * THE "BEFORE" COLUMNS ARE THE OLD CODE, COPIED VERBATIM. `WasMedallion`,
 * `WasChip` and `WasLogoTile` below are the previous implementations, moved
 * here rather than described. A before/after where the "before" is a
 * reconstruction from memory is a sales pitch; this one is a diff you can look
 * at. They live only in this file and only in a dev build, so nothing ships
 * two medallions.
 *
 * DEV / FIXTURES ONLY, like `/stage-check`.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradientAngle, radius } from '../ui/tokens';
import { Eyebrow, Num, T } from '../ui/Text';
import { Ticker, TickerMark } from '../ui/Ticker';
import { GradeChip, GradeMedallion } from '../features/grade';
import { gradeBand, displayGrade } from '../features/grade/bands';
import { env } from '../lib/env';

/* ------------------------------------------------------------------ */
/* BEFORE — the previous implementations, verbatim                      */
/* ------------------------------------------------------------------ */

function WasLogoTile({ symbol }: { symbol: string }) {
  return (
    <LinearGradient
      colors={[alpha.ivory10, alpha.chip85]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{ width: 30, height: 30, borderRadius: 9, borderWidth: 0.5, borderColor: alpha.ivory14, alignItems: 'center', justifyContent: 'center' }}
    >
      <T size={13} weight="bold">{symbol.slice(0, 1)}</T>
    </LinearGradient>
  );
}

function WasMedallion({ grade, score, size = 90 }: { grade?: string | null; score?: number | null; size?: number }) {
  const band = gradeBand(grade, score);
  const letter = displayGrade(grade);
  const letterSize = Math.round(size * (letter.length > 1 ? 0.378 : 0.4));
  const scoreSize = Math.max(8, Math.round(size * 0.1));
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: Math.max(2, size * 0.028), borderColor: band.ring,
        overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
        ...(band.glow
          ? { shadowColor: band.ring, shadowOpacity: 0.3, shadowRadius: size * 0.29, shadowOffset: { width: 0, height: 0 } }
          : null),
      }}
    >
      <LinearGradient
        colors={[band.wash, alpha.surface95]}
        start={{ x: 0.35, y: 0.3 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <T size={letterSize} weight="bold" c={band.letter} lh={letterSize}>{letter}</T>
      {typeof score === 'number' ? (
        <Num size={scoreSize} weight="regular" c={color.muted} style={{ marginTop: 2 }}>{`${Math.round(score)}/100`}</Num>
      ) : null}
    </View>
  );
}

function WasChip({ grade, score }: { grade?: string | null; score?: number | null }) {
  const band = gradeBand(grade, score);
  return (
    <View
      style={{
        paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5,
        borderWidth: 0.5, borderColor: band.cardBorder, backgroundColor: band.cardVeil,
      }}
    >
      <T size={10} weight="bold" c={band.letter}>{displayGrade(grade)}</T>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Harness chrome — rules and labels, no boxes                          */
/* ------------------------------------------------------------------ */

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <View testID={`section-${id}`} style={{ gap: 12, paddingTop: 22, paddingBottom: 10, borderTopWidth: 0.5, borderTopColor: alpha.ivory12 }}>
      <View style={{ gap: 4 }}>
        <Eyebrow c={color.muted}>{title}</Eyebrow>
        {note ? <T size={11.5} c={color.dim} lh={17}>{note}</T> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Ordered by how often a user actually meets each one, after the ingestion
 * rescale into 60–100: C 46%, B 39%, A 15%. The commonest state is at the top
 * of the sheet because that is the one that has to survive being looked at
 * forty times a day.
 */
const BANDS: { grade: string; score: number | null; label: string; share: string }[] = [
  { grade: 'C', score: 61, label: 'C · 61', share: 'C family · ~46% of the feed' },
  { grade: 'C+', score: 67, label: 'C+ · 67', share: 'C family' },
  { grade: 'B', score: 74, label: 'B · 74', share: 'B family · ~39%' },
  { grade: 'B+', score: 82, label: 'B+ · 82', share: 'B family' },
  { grade: 'A−', score: 87, label: 'A− · 87', share: 'A family · ~15%' },
  { grade: 'A', score: 91, label: 'A · 91', share: 'A family' },
  { grade: 'A+', score: 96, label: 'A+ · 96', share: 'A family' },
  { grade: '', score: null, label: 'no grade', share: 'no view of its own — not a low score' },
];

/** Real marks, no marks, and a symbol that is five characters long. */
const WITH_LOGO = ['AAPL', 'NVDA', 'TSLA', 'MSFT'];
const NO_LOGO = ['SPY', 'QQQ', 'ARKK'];
const LONG = ['GOOGL', 'BRK.B', 'IONQ'];

export default function DesignCheck() {
  if (!env.FIXTURES && !env.DEV_TOOLS) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <T c={color.muted} align="center">This harness only runs in a development build.</T>
      </View>
    );
  }

  return (
    <ScrollView
      testID="screen-design-check"
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 54, paddingBottom: 60, gap: 4 }}
    >
      <T size={26} weight="bold" ls={-0.4}>Ticker &amp; grade</T>
      <T size={12.5} c={color.muted} lh={18} style={{ marginBottom: 8 }}>
        Left column is what shipped before. Right column is the proposal. Same fonts, same palette, same screen.
      </T>

      {/* ---------------------------------------------------------- */}
      <Section
        id="grade"
        title="GRADE · BEFORE / AFTER"
        note="The letter still carries the meaning. The ring now carries the score, so quality is stated three ways — letter, arc length, spoken quality word — and never by colour alone. A and C sit two shades apart in the locked palette (#FFD75E, #FFC857); arc length is what actually tells them apart at a glance."
      >
        {BANDS.map((b) => (
          <View
            key={b.label}
            testID={`band-${b.label}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 8 }}
          >
            <WasMedallion grade={b.grade || null} score={b.score} size={78} />
            <GradeMedallion grade={b.grade || null} score={b.score} size={78} testID={`medallion-${b.label}`} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={13} weight="bold">{b.label}</T>
              <T size={11} c={color.muted}>{gradeBand(b.grade || null, b.score).quality}</T>
              <T size={10} c={color.dim}>{b.share}</T>
            </View>
          </View>
        ))}
      </Section>

      {/* ---------------------------------------------------------- */}
      <Section
        id="chip"
        title="CHIP · DENSE ROW"
        note="One family, not two designs: the medallion's gauge is a rule bent into a circle, and at chip scale it straightens back out. No box — the row already has enough boxes."
      >
        <View style={{ gap: 10 }}>
          <T size={10.5} c={color.dim}>before</T>
          {BANDS.slice(0, 4).map((b) => (
            <View key={`was-${b.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T size={15} weight="bold">{['NVDA', 'SOFI', 'PLTR', 'GOOGL'][BANDS.indexOf(b)] ?? 'NVDA'}</T>
              <WasChip grade={b.grade || null} score={b.score} />
              <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, borderWidth: 0.5, borderColor: alpha.green50 }}>
                <T size={10} c={color.green}>Target hit</T>
              </View>
              <T size={10} c={color.muted} style={{ marginLeft: 'auto' }}>2d ago</T>
            </View>
          ))}
        </View>

        <View style={{ gap: 10, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 }}>
          <T size={10.5} c={color.dim}>after</T>
          {BANDS.slice(0, 4).map((b) => (
            <View key={`is-${b.label}`} testID={`chip-row-${b.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TickerMark symbol={['NVDA', 'SOFI', 'PLTR', 'GOOGL'][BANDS.indexOf(b)] ?? 'NVDA'} size={22} />
              <T size={15} weight="bold">{['NVDA', 'SOFI', 'PLTR', 'GOOGL'][BANDS.indexOf(b)] ?? 'NVDA'}</T>
              <GradeChip grade={b.grade || null} score={b.score} />
              <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, borderWidth: 0.5, borderColor: alpha.green50 }}>
                <T size={10} c={color.green}>Target hit</T>
              </View>
              <T size={10} c={color.muted} style={{ marginLeft: 'auto' }}>2d ago</T>
            </View>
          ))}
        </View>
      </Section>

      {/* ---------------------------------------------------------- */}
      <Section
        id="ticker-before"
        title="TICKER · BEFORE"
        note="A gradient square holding the symbol's first letter. Four of these in a list and the column reads as one repeated shape."
      >
        <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          {[...WITH_LOGO, ...NO_LOGO, ...LONG].map((s) => (
            <View key={`was-${s}`} style={{ alignItems: 'center', gap: 5, width: 54 }}>
              <WasLogoTile symbol={s} />
              <T size={10} c={color.muted}>{s}</T>
            </View>
          ))}
        </View>
      </Section>

      <Section
        id="ticker-logo"
        title="TICKER · AFTER · REAL LOGO"
        note="Sourced through the API so the market-data key stays on the server. The ivory plate is what keeps a dark transparent mark — Berkshire's navy wordmark, say — from disappearing into the page."
      >
        <View testID="ticker-with-logo" style={{ gap: 12 }}>
          {WITH_LOGO.map((s) => (
            <Ticker key={s} symbol={s} size={38} sub="Swing · Long · Shares" />
          ))}
        </View>
      </Section>

      <Section
        id="ticker-none"
        title="TICKER · AFTER · NO MARK EXISTS"
        note="Every ETF on this data plan answers with no branding at all, and so do most small caps. This is the resting state, not a failure state — cyan because a ticker is market data, and the palette grammar is not negotiable."
      >
        <View testID="ticker-no-logo" style={{ gap: 12 }}>
          {NO_LOGO.map((s) => (
            <Ticker key={s} symbol={s} size={38} sub="Index ETF · Watching" />
          ))}
        </View>
      </Section>

      <Section
        id="ticker-long"
        title="TICKER · AFTER · LONG SYMBOLS"
        note="The symbol never truncates; the supporting line does. The mark carries three glyphs at row size and four at header size."
      >
        <View testID="ticker-long" style={{ gap: 12 }}>
          {LONG.map((s) => (
            <Ticker key={s} symbol={s} size={38} sub="Alphabet Inc. Class A · Swing · Long · Shares · triggered 09:41" />
          ))}
        </View>
      </Section>

      <Section
        id="ticker-sizes"
        title="TICKER · SIZES"
        note="One component. 22 in a history row, 30 in an alert card's identity line, 44 on a ticker page header."
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
          {[22, 30, 38, 44, 56].map((n) => (
            <View key={n} style={{ alignItems: 'center', gap: 6 }}>
              <TickerMark symbol="NVDA" size={n} />
              <Num size={9} c={color.dim}>{String(n)}</Num>
            </View>
          ))}
          {[22, 30, 38, 44, 56].map((n) => (
            <View key={`f-${n}`} style={{ alignItems: 'center', gap: 6 }}>
              <TickerMark symbol="ARKK" size={n} noLogo />
              <Num size={9} c={color.dim}>{String(n)}</Num>
            </View>
          ))}
        </View>
      </Section>

      <Section
        id="context"
        title="IN CONTEXT · ALERT CARD HEAD"
        note="The two objects together, at the sizes the alert card actually uses."
      >
        <LinearGradient
          colors={[gradeBand('A−', 87).cardVeil, alpha.surface70]}
          start={gradientAngle.start}
          end={gradientAngle.end}
          style={{ borderRadius: radius.xxxl, borderWidth: 1, borderColor: gradeBand('A−', 87).cardBorder, padding: 15, gap: 11 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TickerMark symbol="NVDA" size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={16} weight="bold">NVDA</T>
              <T size={10} c={color.muted}>Nvidia Corp · Swing · Long · Shares</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T size={10.5} c={color.muted}>09:41</T>
              <T size={11} weight="bold" c={color.green}>Entry reached</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
            <GradeMedallion grade="A−" score={87} size={90} testID="medallion-context" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={16} weight="bold" lh={20}>Held the breakout retest on rising volume</T>
              <T size={12.5} c={color.muted} lh={18} style={{ marginTop: 6 }}>
                Price came back to 178.40 and buyers took it. That is the level the whole plan was built on.
              </T>
            </View>
          </View>
        </LinearGradient>
      </Section>
    </ScrollView>
  );
}
