/**
 * The desk's instruments.
 *
 * The brief was to make the core of a write-up readable at a glance instead of
 * as paragraphs. The temptation is six identical rounded rectangles in a grid,
 * and that is exactly the thing this app does not do: a row of soft grey boxes
 * says nothing about what is inside any of them.
 *
 * So each figure here is drawn as the thing it actually is. A grade is a
 * position on a six-step scale, so it is a scale with a mark on it. A call is a
 * direction, so it is an arrow. A horizon is a run of quarters, so it is a run
 * of quarters. A theme's size is a quantity out of ten, so it is a filled
 * measure. They sit on one continuous strip divided by hairlines — one object,
 * internally ruled — rather than as separate cards floating in a grid.
 *
 * Colour follows the app's locked grammar. Violet is Kai's judgement, cyan is
 * time and market data, green and red carry long and short, gold marks the
 * things that need attention. Nothing here borrows the alerts lane's medallion
 * or the War Room's amber.
 *
 * NOTHING IN THIS FILE COMPUTES A NUMBER. Every figure is read straight off
 * the desk's own record. Where the desk has not written one, the instrument
 * says so in words and stays empty.
 */
import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Svg, { Line, Path, Polyline } from 'react-native-svg';
import { T, Num, Eyebrow } from '../../ui/Text';
import { alpha, color, radius, space } from '../../ui/tokens';
import type { IdeaGrade } from '@shared/desk';

/* ------------------------------------------------------------------ */
/* the strip that carries them                                         */
/* ------------------------------------------------------------------ */

/**
 * The instrument strip.
 *
 * One ruled surface, not a grid of cards. The hairline above and below is what
 * makes it an object; the internal hairlines are what separate the readings.
 * A caller that wants a box should use ObjectCard instead — this is
 * deliberately not one.
 */
export function Strip({ children, style, testID }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[{
        borderTopWidth: 1, borderTopColor: alpha.ivory16,
        borderBottomWidth: 1, borderBottomColor: alpha.ivory08,
      }, style]}
    >
      {children}
    </View>
  );
}

/** One reading on the strip. Ruled off from the one above it, never boxed. */
export function Bay({ children, first = false, style }: {
  children: React.ReactNode; first?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{
        paddingVertical: space.x14,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: alpha.ivory08,
      }, style]}
    >
      {children}
    </View>
  );
}

/** Two readings side by side, split by a vertical hairline. */
export function BaySplit({ left, right, first = false }: {
  left: React.ReactNode; right: React.ReactNode; first?: boolean;
}) {
  return (
    <View style={{
      flexDirection: 'row',
      borderTopWidth: first ? 0 : 1, borderTopColor: alpha.ivory08,
    }}>
      <View style={{ flex: 1, paddingVertical: space.x14, paddingRight: space.x14 }}>{left}</View>
      <View style={{
        flex: 1, paddingVertical: space.x14, paddingLeft: space.x14,
        borderLeftWidth: 1, borderLeftColor: alpha.ivory08,
      }}>{right}</View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the grade — a scale with a mark on it                               */
/* ------------------------------------------------------------------ */

const GRADES: IdeaGrade[] = ['A+', 'A', 'B+', 'B', 'C', 'D'];
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

/**
 * Where this idea sits on the desk's own six-step scale.
 *
 * Not a medallion. A medallion says "this one is special"; this says "this one
 * is the fourth of six the desk uses", which is the honest shape of a grade —
 * most write-ups land in the middle and a screen that celebrates a C is
 * arguing with the thing it is displaying. A D is a mark on the scale like any
 * other, drawn the same way, because a low grade is a judgement the desk made
 * and not a failure of the write-up.
 *
 * Fifty-six of the fifty-seven write-ups in the brain carry no grade at all, so
 * the ungraded state is the NORMAL one and is drawn as a complete scale with
 * nothing marked — a ruler waiting for a reading, not an error.
 */
export function GradeScale({ grade }: { grade: IdeaGrade | null }) {
  const at = grade ? GRADES.indexOf(grade) : -1;
  return (
    <View accessibilityLabel={grade ? `Idea grade ${grade}, ${ORDINAL[at]} of six` : 'Not graded yet'}>
      <Eyebrow c={color.dim}>Idea grade</Eyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.x14, marginTop: space.x8 }}>
        {grade ? (
          <Num size={34} weight="bold" c={color.violetLight} style={{ lineHeight: 36 }}>{grade}</Num>
        ) : (
          // No mark. Said in words rather than as a dash, which a person reads
          // as a value that failed to load rather than as an empty scale.
          <T size={15} weight="bold" c={color.muted} style={{ lineHeight: 36, width: 62 }}>
            no mark
          </T>
        )}
        <View style={{ flex: 1, paddingBottom: space.x4 }}>
          <View style={{ flexDirection: 'row', gap: space.x6 }}>
            {GRADES.map((g, i) => {
              const on = i === at;
              return (
                <View key={g} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{
                    height: on ? 7 : 3,
                    alignSelf: 'stretch',
                    borderRadius: 2,
                    backgroundColor: on ? color.violet : alpha.ivory12,
                  }} />
                  <T size={9} weight={on ? 'bold' : 'regular'} c={on ? color.violetLight : color.dim}
                     style={{ marginTop: space.x4 }}>
                    {g}
                  </T>
                </View>
              );
            })}
          </View>
        </View>
      </View>
      <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x8 }}>
        {grade
          ? `${ORDINAL[at][0].toUpperCase()}${ORDINAL[at].slice(1)} of the six marks the desk uses. The grade is on the idea, not on this quarter.`
          : 'The desk has not put a mark on this one. Most of its write-ups carry no grade — that is a gap in the record, not a low score.'}
      </T>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the call — an arrow                                                 */
/* ------------------------------------------------------------------ */

type Dir = 'long' | 'short' | 'pass' | null;

/**
 * Which way the desk went, drawn as the direction it is.
 *
 * A pass is not a failure state and is not drawn as one. It gets a held bar
 * and the desk's own framing — a decision made after reading the evidence.
 * Forty-nine of the fifty-seven write-ups in the brain are passes; a screen
 * that made every one of them look like a rejection would be describing the
 * desk's ordinary work as a wall of mistakes.
 */
export function CallMark({ direction, status }: { direction: Dir; status?: string | null }) {
  const spec = {
    long: { word: 'Long', tone: color.green, sub: 'the desk expects this to work' },
    short: { word: 'Short', tone: color.red, sub: 'the desk expects this to break' },
    pass: { word: 'Passed', tone: color.gold, sub: 'read in full, then declined — a decision, not a miss' },
  }[direction ?? 'none' as never] as { word: string; tone: string; sub: string } | undefined;

  if (!spec) {
    return (
      <View accessibilityLabel="No call stated">
        <Eyebrow c={color.dim}>The call</Eyebrow>
        <T size={17} weight="bold" c={color.muted} style={{ marginTop: space.x6 }}>None stated</T>
        <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
          The write-up did not get as far as a claim.
        </T>
      </View>
    );
  }

  return (
    <View accessibilityLabel={`The call: ${spec.word}`}>
      <Eyebrow c={color.dim}>The call</Eyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x10, marginTop: space.x6 }}>
        <DirGlyph direction={direction} tone={spec.tone} />
        <T size={22} weight="bold" c={spec.tone}>{spec.word}</T>
        {status ? (
          <T size={11} weight="semibold" c={color.dim} style={{ marginLeft: 'auto' }}>
            {status.toUpperCase()}
          </T>
        ) : null}
      </View>
      <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x6 }}>{spec.sub}</T>
    </View>
  );
}

/** Long rises, short falls, a pass is held level. Drawn, not iconography. */
function DirGlyph({ direction, tone }: { direction: Dir; tone: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
      {direction === 'long' && (
        <>
          <Polyline points="3,21 10,14 15,17 23,7" fill="none" stroke={tone} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M16 7 L23 7 L23 14" fill="none" stroke={tone} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {direction === 'short' && (
        <>
          <Polyline points="3,5 10,12 15,9 23,19" fill="none" stroke={tone} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M16 19 L23 19 L23 12" fill="none" stroke={tone} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {direction === 'pass' && (
        <>
          <Line x1={3} y1={13} x2={19} y2={13} stroke={tone} strokeWidth={2} strokeLinecap="round" />
          <Line x1={22} y1={6} x2={22} y2={20} stroke={tone} strokeWidth={2} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* the horizon — a run of quarters                                     */
/* ------------------------------------------------------------------ */

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const HORIZON_WORDS: Record<string, string> = {
  '1q': 'one quarter', '2q': 'two quarters', '3q': 'three quarters', '4q': 'four quarters',
};

/**
 * How long the desk is giving it, drawn as the time it is.
 *
 * Every horizon in the brain today is either two quarters or nothing at all, so
 * the missing case gets the same care as the filled one.
 */
export function HorizonTrack({ horizon }: { horizon: string | null }) {
  const n = horizon ? Number(String(horizon).replace(/[^0-9]/g, '')) : 0;
  const filled = Number.isFinite(n) ? Math.min(Math.max(n, 0), 4) : 0;
  return (
    <View accessibilityLabel={horizon ? `Horizon ${HORIZON_WORDS[horizon] ?? horizon}` : 'No horizon set'}>
      <Eyebrow c={color.dim}>Time frame</Eyebrow>
      <T size={17} weight="bold" c={filled ? color.text : color.muted} style={{ marginTop: space.x6 }}>
        {filled ? (HORIZON_WORDS[horizon!] ?? horizon) : 'Open ended'}
      </T>
      <View style={{ flexDirection: 'row', gap: space.x4, marginTop: space.x8 }}>
        {QUARTERS.map((q, i) => (
          <View key={q} style={{ flex: 1 }}>
            <View style={{
              height: 4, borderRadius: 2,
              backgroundColor: i < filled ? color.cyan : alpha.ivory12,
            }} />
            <T size={9} c={i < filled ? color.cyan : color.dim} style={{ marginTop: space.x4 }}>{q}</T>
          </View>
        ))}
      </View>
      {!filled && (
        <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x6 }}>
          No horizon was written down for this one.
        </T>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the potential move — the reserved measure                           */
/* ------------------------------------------------------------------ */

/**
 * How far the desk thinks this could travel.
 *
 * THE DESK DOES NOT COMPUTE THIS YET. The slot is drawn at full weight beside
 * the grade and the horizon so that the day the brain writes the number it
 * lands here and nothing has to be redesigned. Until then it is an open
 * measure: a run that starts at today and breaks into a dashed line with no
 * end on it, which is the honest picture of a distance nobody has measured.
 *
 * It is wired to `potentialMovePct` and to nothing else. It is NOT derived
 * from market cap, from the theme's size, from the grade, or from the `score`
 * the desk ranks candidates by — `score` has no units and is not a return, and
 * an earlier version of this screen showed it here labelled "Move potential",
 * which was wrong and is gone. A number that looks computed and is not would
 * cost more than an empty measure ever could.
 */
export function PotentialMove({ pct }: { pct: number | null }) {
  const known = typeof pct === 'number' && Number.isFinite(pct);
  return (
    <View accessibilityLabel={known ? `Potential move ${pct}%` : 'Potential move, not computed yet'}>
      <Eyebrow c={color.dim}>Potential move</Eyebrow>
      <T size={known ? 22 : 17} weight="bold" c={known ? color.violetLight : color.muted}
         style={{ marginTop: space.x6 }}>
        {known ? `${pct! > 0 ? '+' : ''}${pct!.toFixed(0)}%` : 'Not measured yet'}
      </T>
      <View style={{ marginTop: space.x8 }}>
        <Svg width="100%" height={16} viewBox="0 0 120 16" preserveAspectRatio="none">
          {/* today */}
          <Line x1={1} y1={3} x2={1} y2={13} stroke={known ? color.violet : alpha.ivory25}
            strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {known ? (
            <>
              <Line x1={1} y1={8} x2={112} y2={8} stroke={color.violet} strokeWidth={2}
                vectorEffect="non-scaling-stroke" />
              <Line x1={112} y1={3} x2={112} y2={13} stroke={color.violet} strokeWidth={2}
                vectorEffect="non-scaling-stroke" />
            </>
          ) : (
            <>
              <Line x1={1} y1={8} x2={26} y2={8} stroke={alpha.ivory25} strokeWidth={2}
                vectorEffect="non-scaling-stroke" />
              <Line x1={26} y1={8} x2={112} y2={8} stroke={alpha.ivory16} strokeWidth={2}
                strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </Svg>
      </View>
      {!known && (
        <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
          The desk does not publish a target. This is the place one will sit
          when the brain starts working it out — it is left empty rather than
          filled with a guess.
        </T>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the theme — size, timing and which way it is heading                */
/* ------------------------------------------------------------------ */

/** The timings the desk actually writes, in order. Anything else stays as words. */
const TIME_AXIS = ['now', '1-2y', '3-5y', '5y+'];

const TRAJECTORY_WORDS: Record<string, string> = {
  ESCALATING: 'gathering pace',
  INFLECTING: 'turning',
  STABLE: 'steady',
  'DE-ESCALATING': 'losing pace',
};

/**
 * How big the claim is and when it lands — the theme's numbers, not the
 * company's.
 *
 * Size and timing are drawn as two separate readings because the desk scores
 * them separately and never averages them. A nine-and-a-half at five years out
 * is a nine-and-a-half; nothing here marks it down for being early, which is
 * the whole reason the desk exists.
 */
export function ThemeGauges({ magnitude, timeline, conviction, trajectory, outOfFavour }: {
  magnitude: number | null; timeline: string | null; conviction: number | null;
  trajectory?: string | null; outOfFavour?: boolean;
}) {
  return (
    <View>
      <SizeMeter magnitude={magnitude} />
      <View style={{ flexDirection: 'row', gap: space.x20, marginTop: space.x14 }}>
        <View style={{ flex: 1.3 }}><TimeAxis timeline={timeline} /></View>
        <View style={{ flex: 1 }}><ConvictionMeter conviction={conviction} /></View>
      </View>
      {(trajectory || outOfFavour) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x8, marginTop: space.x12 }}>
          {trajectory ? (
            <T size={12} c={color.muted}>
              Heading: <T size={12} weight="semibold" c={color.violetLight}>
                {TRAJECTORY_WORDS[trajectory.toUpperCase()] ?? trajectory.toLowerCase()}
              </T>
            </T>
          ) : null}
          {outOfFavour ? (
            <T size={12} c={color.gold}>· attention has moved on</T>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** Ten segments; the desk's score fills them. Half-points fill a half segment. */
export function SizeMeter({ magnitude, label = 'How big if it is right' }: {
  magnitude: number | null; label?: string;
}) {
  const m = magnitude ?? 0;
  const big = m >= 8;
  return (
    <View accessibilityLabel={`Theme size ${magnitude ?? 'unscored'} out of 10`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x8 }}>
        <Eyebrow c={color.dim}>{label}</Eyebrow>
        <Num size={15} weight="bold" c={big ? color.violetLight : color.text} style={{ marginLeft: 'auto' }}>
          {magnitude != null ? magnitude.toFixed(1) : '—'}
        </Num>
        <T size={10} c={color.dim}>of 10</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 3, marginTop: space.x8 }}>
        {Array.from({ length: 10 }, (_, i) => {
          const full = m >= i + 1;
          const half = !full && m > i;
          return (
            <View key={i} style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: alpha.ivory08, overflow: 'hidden' }}>
              {(full || half) && (
                <View style={{
                  height: 8, width: full ? '100%' : '50%',
                  backgroundColor: big ? color.violet : color.violetLight,
                  opacity: big ? 1 : 0.55,
                }} />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Where on the clock it lands. Off-axis wording is shown as written. */
export function TimeAxis({ timeline }: { timeline: string | null }) {
  const at = timeline ? TIME_AXIS.indexOf(timeline.toLowerCase()) : -1;
  return (
    <View accessibilityLabel={`Timing ${timeline ?? 'unknown'}`}>
      <Eyebrow c={color.dim}>When it lands</Eyebrow>
      {at < 0 ? (
        <T size={15} weight="semibold" c={timeline ? color.cyan : color.dim} style={{ marginTop: space.x6 }}>
          {timeline ?? 'not judged'}
        </T>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.x10 }}>
            {TIME_AXIS.map((t, i) => (
              <React.Fragment key={t}>
                {i > 0 && (
                  <View style={{ flex: 1, height: 1, backgroundColor: alpha.ivory12 }} />
                )}
                <View style={{
                  width: i === at ? 9 : 5, height: i === at ? 9 : 5,
                  borderRadius: 5,
                  backgroundColor: i === at ? color.cyan : alpha.ivory25,
                }} />
              </React.Fragment>
            ))}
          </View>
          <View style={{ flexDirection: 'row', marginTop: space.x6 }}>
            {TIME_AXIS.map((t, i) => (
              <T key={t} size={9} c={i === at ? color.cyan : color.dim}
                 align={i === 0 ? 'left' : i === TIME_AXIS.length - 1 ? 'right' : 'center'}
                 style={{ flex: 1 }}>
                {t}
              </T>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/** How sure the desk is — scored apart from size, and never folded into it. */
export function ConvictionMeter({ conviction }: { conviction: number | null }) {
  const c = conviction ?? 0;
  return (
    <View accessibilityLabel={`Conviction ${conviction ?? 'unscored'} out of 10`}>
      <Eyebrow c={color.dim}>How sure</Eyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x4, marginTop: space.x6 }}>
        <Num size={15} weight="bold" c={color.text}>{conviction != null ? conviction : '—'}</Num>
        <T size={10} c={color.dim}>of 10</T>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: alpha.ivory08, marginTop: space.x8 }}>
        <View style={{
          height: 4, borderRadius: 2, width: `${Math.min(c, 10) * 10}%`,
          backgroundColor: color.violetLight, opacity: 0.7,
        }} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the reasons — a ledger, not bullets                                 */
/* ------------------------------------------------------------------ */

/**
 * What the screen found for and against, as two ruled columns of evidence.
 *
 * The count is stated and NOT drawn as a bar: five reasons for and one against
 * is a list of six things, not a five-to-one verdict, and a proportion bar
 * would invent a weighting the desk never applied.
 */
export function Ledger({ why, blockers }: { why: string[]; blockers: string[] }) {
  if (!why.length && !blockers.length) return null;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x8 }}>
        <Eyebrow c={color.muted}>What the screen found</Eyebrow>
        <T size={11} c={color.dim} style={{ marginLeft: 'auto' }}>
          {why.length} for · {blockers.length} against
        </T>
      </View>
      <View style={{ marginTop: space.x12 }}>
        {why.map((w, i) => <LedgerLine key={`w${i}`} tone={color.green} mark="+" text={w} />)}
        {blockers.map((b, i) => <LedgerLine key={`b${i}`} tone={color.red} mark="−" text={b} />)}
      </View>
    </View>
  );
}

function LedgerLine({ tone, mark, text }: { tone: string; mark: string; text: string }) {
  return (
    <View style={{
      flexDirection: 'row', gap: space.x10,
      paddingVertical: space.x9, paddingLeft: space.x10,
      borderLeftWidth: 2, borderLeftColor: tone, marginBottom: space.x6,
      backgroundColor: tone === color.green ? alpha.green12 : alpha.red10,
      borderTopRightRadius: radius.xs, borderBottomRightRadius: radius.xs,
    }}>
      <Num size={13} weight="bold" c={tone}>{mark}</Num>
      <T size={13} lh={19} c={color.text} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* dated things ahead — a spine with dots on it                        */
/* ------------------------------------------------------------------ */

/** The things with dates on them, drawn along a line because that is what they are. */
export function CatalystSpine({ items }: { items: { when: string; what: string }[] }) {
  if (!items.length) return null;
  return (
    <View>
      <Eyebrow c={color.muted}>Dated ahead</Eyebrow>
      <View style={{ marginTop: space.x12 }}>
        {items.map((c, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.x12 }}>
            <View style={{ width: 12, alignItems: 'center' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.cyan, marginTop: 4 }} />
              {i < items.length - 1 && (
                <View style={{ flex: 1, width: 1, backgroundColor: alpha.cyan40, marginTop: 2 }} />
              )}
            </View>
            <View style={{ flex: 1, paddingBottom: i < items.length - 1 ? space.x16 : 0 }}>
              <Num size={12} weight="bold" c={color.cyan}>{c.when}</Num>
              <T size={13} lh={19} c={color.muted} style={{ marginTop: space.x2 }}>{c.what}</T>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the price track — where it is between the two levels                */
/* ------------------------------------------------------------------ */

/**
 * Price against the level that arms it and the level that kills it.
 *
 * Drawn only when the desk has written both levels down. A track with one end
 * missing would be a picture of a distance nobody knows.
 */
export function LevelTrack({ price, trigger, invalidation }: {
  price: number | null; trigger: number | null; invalidation: number | null;
}) {
  if (price == null || trigger == null || invalidation == null || trigger <= invalidation) return null;
  const t = Math.max(0, Math.min(1, (price - invalidation) / (trigger - invalidation)));
  return (
    <View accessibilityLabel={`Price ${price} between ${invalidation} and ${trigger}`} style={{ width: 96 }}>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: alpha.ivory12 }}>
        <View style={{
          position: 'absolute', left: `${t * 100}%`, top: -2.5,
          width: 8, height: 8, borderRadius: 4, marginLeft: -4,
          backgroundColor: color.cyan,
        }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.x4 }}>
        <T size={9} c={color.red}>kills</T>
        <T size={9} c={color.green}>arms</T>
      </View>
    </View>
  );
}
