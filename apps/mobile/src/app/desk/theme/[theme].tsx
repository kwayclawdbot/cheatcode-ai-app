/**
 * One theme, in depth.
 *
 * The judgement, then the running argument the desk has kept since April, then
 * every company it wrote up under this theme, then the companies those
 * write-ups said fit it better than what they were handed.
 *
 * That last section is the honest one. Every lead the desk has ever named is
 * still unscored — nothing feeds them back through the pipeline — so the
 * screen says that plainly rather than implying they were considered and
 * dismissed.
 */
import React, { useCallback } from 'react';
import { ScrollView, View, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../ui/Screen';
import { T, Num, Eyebrow } from '../../../ui/Text';
import { TickerMark } from '../../../ui/Ticker';
import { alpha, color, radius, space } from '../../../ui/tokens';
import { api } from '../../../lib/api';
import { env } from '../../../lib/env';
import { fixtureDeskTheme } from '../../../lib/fixtures';
import { useResource } from '../../../lib/useResource';
import { GradeMark, Prose } from '../../../features/desk/ui';
import { Bay, Strip, ThemeGauges } from '../../../features/desk/instruments';
import { ThesisReader } from '../../../features/desk/ThesisReader';
import type { DeskThemeResponse } from '@shared/desk';

export default function DeskThemeDetail() {
  const { theme } = useLocalSearchParams<{ theme: string }>();
  const router = useRouter();
  const name = theme ?? '';

  const load = useCallback(() => api.deskTheme(name), [name]);
  const res = useResource<DeskThemeResponse>(load, env.FIXTURES ? fixtureDeskTheme(name) : null, [name]);

  if (res.loading) {
    return (
      <Screen variant="dome" layout="stack">
        <View style={{ paddingVertical: space.x40, alignItems: 'center' }}>
          <ActivityIndicator color={color.violet} />
        </View>
      </Screen>
    );
  }
  if (res.error || !res.data) {
    return (
      <Screen variant="dome" layout="stack">
        <T size={15} c={color.text}>{res.error ?? 'That theme is not being tracked.'}</T>
        <Pressable onPress={() => router.back()} style={{ marginTop: space.x16 }}>
          <T size={14} c={color.volt}>Back</T>
        </Pressable>
      </Screen>
    );
  }

  const { theme: t, note, writtenUp, leads } = res.data;
  const unscored = leads.filter((l) => !l.scoredOn).length;

  return (
    <Screen variant="dome" layout="stack" testID="desk-theme-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 70 }}>
        <Eyebrow c={color.violetLight}>Theme</Eyebrow>
        <T size={24} weight="bold" c={color.text} style={{ marginTop: space.x6 }}>
          {t.theme.replace(/-/g, ' ')}
        </T>

        {t.reason ? (
          <T size={16} lh={24} c={color.text} style={{ marginTop: space.x12 }}>{t.reason}</T>
        ) : null}

        {/* The judgement, drawn. One ruled strip, not a row of cards. */}
        <Strip style={{ marginTop: space.x20 }} testID="desk-theme-panel">
          <Bay first>
            <ThemeGauges
              magnitude={t.magnitude}
              timeline={t.timeline}
              conviction={t.conviction}
              trajectory={t.trajectory}
              outOfFavour={t.outOfFavour}
            />
            <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x14 }}>
              Size and how sure are scored separately and never averaged. A big
              theme the desk is not yet sure about is still a big theme, and
              nothing is marked down for landing years out.
            </T>
          </Bay>
        </Strip>

        {t.outOfFavour && (
          <View style={{
            marginTop: space.x14, padding: space.x12, borderRadius: radius.md,
            borderWidth: 0.5, borderColor: alpha.ivory16, backgroundColor: alpha.ivory06,
          }}>
            <Eyebrow c={color.gold}>Out of favour</Eyebrow>
            <T size={13} lh={19} c={color.muted} style={{ marginTop: space.x6 }}>
              Attention has moved on. The desk keeps mining it — a big theme
              cooling off is often the entry, because the thesis survives news
              cycles the attention does not.
            </T>
          </View>
        )}

        {/* ── the companies ────────────────────────────────────── */}
        {writtenUp.length > 0 && (
          <View style={{ marginTop: space.x30 }}>
            <Eyebrow c={color.muted}>Written up under this theme</Eyebrow>
            {/* How each one actually did belongs here more than anywhere — a
                theme is only worth what the names under it returned. Not one
                of them has reached its horizon, so the list says so once,
                at the top, rather than showing a column of blanks. */}
            {writtenUp.every((w) => w.outcome == null) ? (
              <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
                None of these has been settled yet. The desk only marks a call
                right or wrong once its horizon has actually run out, and the
                oldest write-up here is still months short of that.
              </T>
            ) : null}
            <View style={{ marginTop: space.x8 }}>
              {writtenUp.map((w, i) => (
                <Pressable
                  key={`${w.ticker}-${i}`}
                  onPress={() => router.push(`/desk/pick/${w.ticker}`)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: space.x12,
                    paddingVertical: space.x12,
                    borderBottomWidth: i === writtenUp.length - 1 ? 0 : 1,
                    borderBottomColor: alpha.ivory08,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <TickerMark symbol={w.ticker} size={28} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x8 }}>
                      <Num size={15} weight="bold" c={color.text}>{w.ticker}</Num>
                      {w.themeRank === 1 && (
                        <T size={10} weight="bold" c={color.violetLight}>BEST FIT</T>
                      )}
                    </View>
                    <T size={12} c={color.dim} numberOfLines={1}>{w.company ?? '—'}</T>
                  </View>
                  {/* The result, only when the desk settled it. Green and red
                      are the desk being right and wrong; a pass that was
                      measured but never scored is neither. */}
                  {w.outcome ? (
                    <View style={{ alignItems: 'flex-end' }}>
                      <T
                        size={11}
                        weight="bold"
                        c={w.outcome === 'hit' ? color.green : w.outcome === 'miss' ? color.red : color.muted}
                      >
                        {w.outcome === 'hit' ? 'RIGHT' : w.outcome === 'miss' ? 'WRONG' : 'MEASURED'}
                      </T>
                      {typeof w.excessPct === 'number' ? (
                        <Num
                          size={12}
                          weight="bold"
                          c={w.excessPct > 0 ? color.green : color.red}
                        >
                          {`${w.excessPct > 0 ? '+' : ''}${w.excessPct.toFixed(1)}%`}
                        </Num>
                      ) : null}
                    </View>
                  ) : null}
                  <GradeMark grade={w.grade} size={13} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── the leads ────────────────────────────────────────── */}
        {leads.length > 0 && (
          <View style={{ marginTop: space.x30 }}>
            <Eyebrow c={color.muted}>Named as fitting better</Eyebrow>
            <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
              Companies a write-up put forward after reading the evidence and
              finding the fit wanting. They are leads, not picks — naming one
              does not promote it.
              {unscored === leads.length
                ? ' None of them has been scored yet: nothing feeds them back through the pipeline.'
                : ''}
            </T>
            <View style={{ marginTop: space.x10 }}>
              {leads.map((l, i) => (
                <View
                  key={`${l.ticker}-${i}`}
                  style={{
                    paddingVertical: space.x11,
                    borderBottomWidth: i === leads.length - 1 ? 0 : 1,
                    borderBottomColor: alpha.ivory08,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x8 }}>
                    <Num size={14} weight="bold" c={color.cyan}>{l.ticker}</Num>
                    {l.nominatedBy && (
                      <T size={11} c={color.dim}>from the {l.nominatedBy} write-up</T>
                    )}
                  </View>
                  {l.reason && (
                    <T size={13} lh={19} c={color.muted} style={{ marginTop: space.x4 }}>
                      {l.reason}
                    </T>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── the running argument ─────────────────────────────── */}
        {note && (
          <View style={{
            marginTop: space.x30, paddingTop: space.x20,
            borderTopWidth: 1, borderTopColor: alpha.ivory12,
          }}>
            <Eyebrow c={color.violetLight}>The running argument</Eyebrow>
            <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
              Dated entries the desk has kept as the story developed. Newest
              material is at the bottom, the way it was written.
            </T>
            <View style={{ marginTop: space.x12 }}>
              <Prose text={note} />
            </View>
          </View>
        )}

      </ScrollView>
    </Screen>
  );
}
