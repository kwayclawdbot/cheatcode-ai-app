import React, { useId } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { alpha, color } from '../../ui/tokens';
import { T, Num } from '../../ui/Text';
import { gradeBand, displayGrade } from './bands';

/**
 * THE GRADE GAUGE — docs/10 §4 "GRADE HIERARCHY".
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * This was a bordered circle with a letter in it, a linear-gradient wash behind
 * the letter, and "87/100" set underneath in small grey. Three things were
 * wrong with it and none of them were about ornament:
 *
 *   1. THE SCORE WAS A CAPTION. A 0–100 score is a POSITION ON A SCALE, and it
 *      was being rendered as a piece of text that happened to sit near a
 *      circle. So the ring is now the scale: an open gauge whose swept length
 *      is the score. The number stays — the spec mandates it — but it is now
 *      the readout of an instrument rather than a label stuck to a badge.
 *   2. THE RING CARRIED NOTHING. A closed border is decoration; every grade got
 *      the same 360°, so the only difference between an A and a C was hue —
 *      which is precisely what the accessibility rule forbids as a sole
 *      carrier. Arc length is now a second, non-colour encoding of quality, on
 *      top of the letter, which remains the meaning.
 *   3. THE GAUGE OPENS WHERE THE NUMBER IS. The sweep is 270° with the gap at
 *      the bottom, and the score sits in that gap. The number completes the
 *      ring instead of hanging off it. That is the whole idea, and everything
 *      else here is kept quiet so it is the thing you remember.
 *
 * SEMANTICS THAT SURVIVED INTACT
 *   · THE LETTER CARRIES THE MEANING. It is the largest thing in the object and
 *     grade is never communicated by colour alone — letter, arc length, and the
 *     spoken quality word all say it independently.
 *   · GOLD NEVER MEANS PROFIT. Ring colour is SETUP QUALITY only. A bearish
 *     A-grade setup still gets gold; green and red never appear here at all.
 *   · NO COMPONENT FRACTIONS. The 0–100 score is the one number on the object.
 *
 * THE ONE DELIBERATE CHANGE: the score reads `87`, not `87/100`. The track arc
 * is drawn at full 270° behind the fill, so "out of" is stated by the object
 * instead of by four characters of punctuation. If the owner wants the literal
 * `/100` back it is one line, at the `<Num>` below.
 *
 * "NO GRADE" IS NOT "LOW GRADE"
 * ----------------------------
 * With the ingestion rescale into 60–100, the amber C family is now the most
 * common thing a user sees (roughly A 15% · B 39% · C 46%), and grey stops
 * being a bulk state and becomes what it always meant: Kai has no view of its
 * own on this object. Those are two different KINDS of statement, and until now
 * the only thing separating them was hue — the failure the spec explicitly
 * warns about.
 *
 * So an ungraded object is drawn in a different language, not at a lower
 * intensity. Three non-colour differences, any one of which carries it alone:
 *   · the ring is DOTTED, not a swept gauge. A dotted outline says there is no
 *     measurement; a short gauge says the measurement came back low.
 *   · there is NO fill arc at all. Not a small one — none.
 *   · the readout is a WORD in the text face ("No grade"), where every graded
 *     object shows a NUMBER in the mono face. In this app mono means "a
 *     quantity you can compare", so an ungraded object never borrows it.
 *
 * And the C end got the same attention as the A end for the opposite reason:
 * a 64 is a complete, resolved object with a warm face and two-thirds of a
 * gauge, not a dimmed A. What now separates A from C at a glance is ARC LENGTH,
 * which matters because `bands.ts` gives them near-identical hues (#FFD75E and
 * #FFC857) and colour alone never really told them apart.
 */

/** Degrees of sweep. The missing 90° is the gap the score sits in. */
const SWEEP = 270;
const START = -SWEEP / 2;

/** θ measured from 12 o'clock, clockwise, in a y-down coordinate system. */
function pointOn(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const a = pointOn(cx, cy, r, from);
  const b = pointOn(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export type GradeMedallionProps = {
  /** Letter grade as issued by the grading engine: "A−", "B+", "C+", "B". */
  grade?: string | null;
  /** 0–100 supporting score. Sweeps the gauge and reads out in the gap. */
  score?: number | null;
  /** Diameter in px. Boards use 90; spec allows 72–88 for tighter rows. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function GradeMedallion({ grade, score, size = 90, style, testID }: GradeMedallionProps) {
  const band = gradeBand(grade, score);
  const letter = displayGrade(grade);
  const graded = letter !== '—';
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const pct = hasScore ? Math.max(0, Math.min(100, score as number)) : null;
  // `useId()` returns `:r3:` on web, and a colon inside `url(#…)` is not a
  // reference the browser will resolve. Strip it down to an id both renderers
  // accept — two medallions on one screen must not share a gradient.
  const gradientId = `gradeWash${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const stroke = size * 0.062;
  const c = size / 2;
  const r = c - stroke / 2 - size * 0.02;

  const letterSize = Math.round(size * (letter.length > 1 ? 0.345 : 0.4));
  const scoreSize = Math.max(9, Math.round(size * 0.155));

  return (
    <View
      testID={testID ?? 'grade-medallion'}
      accessibilityRole="image"
      accessibilityLabel={
        !graded
          ? 'Not graded — Kai has no view of its own on this one.'
          : `Grade ${letter.replace('−', ' minus')}${hasScore ? `, score ${Math.round(pct as number)} out of one hundred` : ''}. ${band.quality}.`
      }
      style={[{ width: size, height: size }, style]}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          {/* Light from above, the way every physical dial is lit. Not a linear
              wash across the face — that reads as a gradient applied to a shape
              rather than as a shape that is lit. */}
          <RadialGradient id={gradientId} cx="50%" cy="30%" r="78%">
            <Stop offset="0" stopColor={band.ring} stopOpacity={graded ? 0.17 : 0.05} />
            <Stop offset="1" stopColor={band.ring} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* The face. Dark enough to seat the letter on any card veil. */}
        <Circle cx={c} cy={c} r={r} fill="#17171C" fillOpacity={0.62} />
        <Circle cx={c} cy={c} r={r} fill={`url(#${gradientId})`} />

        {graded ? (
          /* The scale. Always the full 270°, so the score has something to be
             "out of" without spelling it — and drawn as a HAIRLINE, not at the
             fill's weight. At equal weight the unfilled remainder reads as a
             second grey object sitting next to the gauge instead of as the rest
             of the same scale; thinning it puts the fill on top of a track,
             which is how a dial has always worked. */
          <Path
            d={arcPath(c, c, r, START, START + SWEEP)}
            stroke={alpha.ivory20}
            strokeWidth={stroke * 0.42}
            strokeLinecap="round"
            fill="none"
          />
        ) : (
          /* Not a gauge at zero — a different object. A dotted outline has no
             "amount" to read, which is the whole point: there is no
             measurement here, rather than a measurement that came back low. */
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={alpha.ivory20}
            strokeWidth={stroke * 0.42}
            strokeLinecap="round"
            strokeDasharray={`0.5 ${stroke * 1.5}`}
            fill="none"
            testID="grade-ungraded-ring"
          />
        )}

        {pct !== null ? (
          <>
            {/* A-family emphasis is a wide, faint halo on the SAME path rather
                than a platform shadow: it renders identically on web and
                native, and it grows with the score instead of ringing the
                whole object. */}
            {band.glow ? (
              <Path
                d={arcPath(c, c, r, START, START + (SWEEP * pct) / 100)}
                stroke={band.ring}
                strokeWidth={stroke * 2.6}
                strokeOpacity={0.13}
                strokeLinecap="round"
                fill="none"
              />
            ) : null}
            <Path
              d={arcPath(c, c, r, START, START + (SWEEP * pct) / 100)}
              stroke={band.ring}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              testID="grade-gauge"
            />
          </>
        ) : null}
      </Svg>

      {/* The letter, optically centred against letter+readout as a pair. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <T
          size={graded ? letterSize : size * 0.3}
          weight="bold"
          c={band.letter}
          lh={(graded ? letterSize : size * 0.3) * 1.02}
          ls={-letterSize * 0.03}
          style={{ marginTop: hasScore ? -size * 0.085 : graded ? 0 : -size * 0.055 }}
          testID="grade-letter"
        >
          {letter}
        </T>
        {/* A WORD where a graded object shows a NUMBER. In this app the mono
            face means "a quantity you can compare", so an object with nothing
            to compare never borrows it — the typeface says which kind of thing
            this is before you have read either. It sits inside the ring rather
            than in a gap, because the ungraded ring has no gap: it is a closed
            dotted outline, not a gauge that happens to be empty. */}
        {!graded ? (
          <T size={Math.max(8.5, size * 0.115)} weight="medium" c={color.dim} testID="grade-none">
            No grade
          </T>
        ) : null}
      </View>

      {/* The readout, seated in the gap the gauge leaves for it. */}
      {hasScore ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: size * 0.085, alignItems: 'center' }}>
          <Num size={scoreSize} weight="medium" c={color.muted} testID="grade-score">
            {String(Math.round(pct as number))}
          </Num>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The dense inline variant — history rows, Kai objects, the club feed.
 *
 * ONE FAMILY, NOT TWO DESIGNS. The medallion's gauge is a rule bent into a
 * circle; at chip scale it is straightened back out. Same letter face, same
 * band colour, same "the length is the score" idea, and no box around it —
 * house style composes with typography and rules rather than putting a border
 * on everything small. A 270° arc at 11px would be mush, so it is not drawn.
 */
export function GradeChip({ grade, score, testID }: { grade?: string | null; score?: number | null; testID?: string }) {
  const letter = displayGrade(grade);
  // An empty chip is worse than no chip. Ungraded objects say so in words
  // elsewhere; they do not need a dash in a badge.
  if (letter === '—') return null;

  const band = gradeBand(grade, score);
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const pct = hasScore ? Math.max(0, Math.min(100, score as number)) : 100;
  const width = 24;

  return (
    <View
      testID={testID ?? 'grade-chip'}
      accessibilityLabel={`Grade ${letter}${hasScore ? `, score ${Math.round(pct)} out of one hundred` : ''}, ${band.quality}`}
      // The letter's optical centre sits above the centre of letter+rule, so
      // the block is nudged down to line the LETTER up with the row's other
      // text rather than lining up the block.
      style={{ alignItems: 'center', gap: 2.5, marginTop: 3 }}
    >
      <T size={13} weight="bold" c={band.letter} lh={14} ls={-0.2}>
        {letter}
      </T>
      <View style={{ width, height: 2, borderRadius: 1, backgroundColor: alpha.ivory12, overflow: 'hidden' }}>
        <View
          style={{
            width: (width * pct) / 100,
            height: 2,
            borderRadius: 1,
            backgroundColor: band.ring,
            opacity: hasScore ? 1 : 0.45,
          }}
        />
      </View>
    </View>
  );
}
