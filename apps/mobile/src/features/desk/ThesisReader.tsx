/**
 * The argument, read as the sections it was written in.
 *
 * A thesis is four to eleven thousand characters. The old screen printed the
 * whole thing as one block, which is why it read as a wall — but the desk had
 * already broken it up. Every write-up is filed under the same named headings,
 * so this shows the index first and opens one section at a time.
 *
 * The verdict opens by default, because "what did it conclude" is the question
 * a person arrives with. Everything else is one tap away and nobody has to
 * scroll past eleven thousand characters to reach it.
 *
 * Nothing is summarised, shortened, reworded or reordered. The headings are
 * the desk's own, in the desk's own order, and the body under each is verbatim.
 * Where a write-up has no headings at all, this says so and shows it whole.
 */
import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { T, Num, Eyebrow } from '../../ui/Text';
import { alpha, color, radius, space } from '../../ui/tokens';
import { Prose } from './ui';
import { parseThesis, openingSection, sectionGloss } from './thesis';

export function ThesisReader({ thesis }: { thesis: string | null }) {
  const parsed = useMemo(() => parseThesis(thesis), [thesis]);
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(parsed.sectioned ? [openingSection(parsed.sections)] : []),
  );

  if (!thesis || !thesis.trim()) return null;

  const allOpen = parsed.sectioned && open.size === parsed.sections.length;
  const longest = Math.max(1, ...parsed.sections.map((s) => s.words));

  const toggle = (i: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <View
      testID="desk-thesis"
      style={{ marginTop: space.x30, paddingTop: space.x20, borderTopWidth: 1, borderTopColor: alpha.ivory12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x12 }}>
        <View style={{ flex: 1 }}>
          <Eyebrow c={color.violetLight}>The argument</Eyebrow>
          <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
            Every figure quoted below comes from a named filing period or a real
            daily bar. Nothing in it was estimated.
          </T>
        </View>
        {parsed.sectioned && parsed.sections.length > 1 && (
          <Pressable
            onPress={() => setOpen(allOpen ? new Set() : new Set(parsed.sections.map((_, i) => i)))}
            accessibilityRole="button"
            testID="desk-thesis-toggle-all"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingTop: space.x2 })}
          >
            <T size={12} weight="semibold" c={color.volt}>
              {allOpen ? 'Close all' : 'Read it all'}
            </T>
          </Pressable>
        )}
      </View>

      {/* ── no headings: say so, then show it whole ───────────── */}
      {!parsed.sectioned ? (
        <View style={{ marginTop: space.x16 }} testID="desk-thesis-unsectioned">
          <View style={{
            paddingLeft: space.x12, borderLeftWidth: 2, borderLeftColor: alpha.gold40,
          }}>
            <T size={13} lh={19} c={color.muted}>
              This one was not filed in sections, so there is nothing to break it
              into. It is shown whole, exactly as it was written.
            </T>
          </View>
          <View style={{ marginTop: space.x12 }}>
            <Prose text={parsed.preamble} />
          </View>
        </View>
      ) : (
        <>
          {parsed.preamble ? (
            <View style={{ marginTop: space.x14 }}>
              <Prose text={parsed.preamble} />
            </View>
          ) : null}

          <View style={{ marginTop: space.x16 }}>
            {parsed.sections.map((s, i) => {
              const isOpen = open.has(i);
              const gloss = sectionGloss(s.name);
              return (
                <View
                  key={`${s.name}-${i}`}
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: isOpen ? alpha.violet45 : alpha.ivory12,
                  }}
                >
                  <Pressable
                    onPress={() => toggle(i)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={`${s.name}, ${s.words} words`}
                    testID={`desk-thesis-section-${i}`}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: space.x12,
                      paddingVertical: space.x14, opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Num size={11} weight="bold" c={isOpen ? color.violetLight : color.dim} style={{ width: 16 }}>
                      {String(i + 1).padStart(2, '0')}
                    </Num>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T size={14} weight="bold" c={isOpen ? color.text : color.muted} ls={0.4}>
                        {s.name}
                      </T>
                      {gloss ? (
                        <T size={11.5} c={color.dim} style={{ marginTop: space.x2 }}>{gloss}</T>
                      ) : null}
                    </View>

                    {/* how long this section is, drawn — not a ranking */}
                    <View style={{ width: 44, alignItems: 'flex-end', gap: space.x4 }}>
                      <View style={{
                        height: 3, borderRadius: 2, width: `${Math.max(12, (s.words / longest) * 100)}%`,
                        backgroundColor: isOpen ? color.violet : alpha.ivory20,
                      }} />
                      <T size={9} c={color.dim}>{s.words}w</T>
                    </View>

                    <View style={{
                      width: 20, height: 20, borderRadius: radius.sm,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isOpen ? alpha.violet20 : alpha.ivory06,
                    }}>
                      <T size={13} weight="bold" c={isOpen ? color.violetLight : color.muted}>
                        {isOpen ? '−' : '+'}
                      </T>
                    </View>
                  </Pressable>

                  {isOpen && (
                    <View style={{ paddingBottom: space.x18, paddingLeft: space.x26 }}>
                      {s.body ? (
                        <Prose text={s.body} />
                      ) : (
                        <T size={13} lh={19} c={color.dim}>
                          The desk wrote this heading and left it empty.
                        </T>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ borderTopWidth: 1, borderTopColor: alpha.ivory12 }} />
          </View>
        </>
      )}
    </View>
  );
}
