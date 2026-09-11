/**
 * THE FOUR OBJECT SURFACES — setup, alert, news, community — and the web card.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * A SURFACE IS A FOCUSED VIEW, NOT A SECOND COPY OF A SCREEN
 * ═════════════════════════════════════════════════════════════════════════════
 * Each of these already has a full screen behind it: `/setup/[id]`,
 * `/alert/[id]`, the symbol page, the room. Rebuilding those inside the
 * workspace would be four screens maintained twice, and the second copy always
 * loses — it is the one nobody remembers to update.
 *
 * So a surface shows the part of the object the CONVERSATION is about, with the
 * real numbers, and keeps one door to the full screen. The member asked Kai
 * about it; they want to see it, not to be relocated.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EVERY ONE OF THESE LOADS REAL DATA OR SAYS IT COULD NOT
 * ═════════════════════════════════════════════════════════════════════════════
 * There is no placeholder anywhere in this file. A surface that has not loaded
 * says it is loading; one that failed says so in a sentence; one that loaded
 * nothing says the thing is empty. `scripts/no-fake-data-test.mts` exists to
 * keep this true, and a workspace is exactly where a plausible-looking
 * placeholder would do the most damage — it opens BECAUSE Kai said it would,
 * so whatever is in it reads as something he vouched for.
 */
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { T, Eyebrow } from '../../../ui/Text';
import { ObjectCard } from '../../../ui/Panel';
import { Button } from '../../../ui/Button';
import { alpha, color, radius } from '../../../ui/tokens';
import { api } from '../../../lib/api';
import { communityApi } from '../../../lib/community-api';
import type { AlertDetail, GoalMode, NewsItem, SetupDetail, SymbolDetail } from '../../../lib/types';
import type { RoomMessage } from '../../community/types';

/* ==================================================================== */
/* Shared states                                                        */
/* ==================================================================== */

/**
 * The three things a surface can honestly be.
 *
 * `loading` and `missing` are separate on purpose. A request in flight is a
 * spinner; a request that answered with nothing is a stated absence. Conflating
 * them draws a failed load as a verified empty — the audit's F18, and the one
 * mistake that makes an app feel like it is lying.
 */
type Load<T> = { value: T | null; loading: boolean; missing: string | null };

function useLoad<T>(run: () => Promise<T>, deps: unknown[], missingPlain: string): Load<T> {
  const [state, setState] = useState<Load<T>>({ value: null, loading: true, missing: null });
  useEffect(() => {
    let alive = true;
    setState({ value: null, loading: true, missing: null });
    run()
      .then((v) => { if (alive) setState({ value: v, loading: false, missing: null }); })
      .catch(() => { if (alive) setState({ value: null, loading: false, missing: missingPlain }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function Status({ text }: { text: string }) {
  return (
    <View style={{ padding: 18 }}>
      <T size={14} c={color.dim}>{text}</T>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 }}>
      <T size={13} c={color.dim}>{label}</T>
      <T size={13} weight="semibold" mono>{value}</T>
    </View>
  );
}

const money = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `$${Number(n).toFixed(2)}`;

/* ==================================================================== */
/* Setup                                                                */
/* ==================================================================== */

/**
 * The graded setup, as the thing you decide from.
 *
 * Entry, stop and targets are shown together because they are one decision, and
 * the numbers are copied straight off the row — this surface computes nothing.
 * An ungraded symbol never reaches here: the server refuses `show_setup` for an
 * id that does not resolve.
 */
export function SetupSurface({ setupId, onRoute }: { setupId: string; onRoute?: (r: string) => void }) {
  const router = useRouter();
  const s = useLoad<SetupDetail>(
    () => api.setupDetail(setupId),
    [setupId],
    'I could not load that setup just now.',
  );
  if (s.loading) return <Status text="Loading the setup…" />;
  if (s.missing || !s.value) return <Status text={s.missing ?? 'That setup is not there any more.'} />;

  const d = s.value;
  const go = () => (onRoute ?? ((r: string) => router.push(r as never)))(`/setup/${encodeURIComponent(d.id)}`);

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T size={20} weight="bold">{d.symbol}</T>
        <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
          <T size={12} weight="bold" c={color.violet}>{d.grade_display}</T>
        </View>
        <T size={12} c={color.dim}>{d.state_label}</T>
      </View>
      {/* A price with no freshness on it is a mistake anywhere in this product. */}
      {d.quote ? (
        <T size={13} c={color.dim}>
          {money(d.quote.price)} · {d.quote.freshness ?? 'freshness unknown'}
        </T>
      ) : (
        <T size={13} c={color.dim}>No price on this one right now.</T>
      )}
      <ObjectCard r={radius.xl} style={{ padding: 12 }}>
        <Eyebrow>The plan</Eyebrow>
        <Row label="Entry" value={d.plan.entry_condition ?? money(d.plan.entry)} />
        <Row label="Stop" value={money(d.plan.stop)} />
        {d.plan.targets.map((t, i) => (
          <Row key={`${t.price}-${i}`} label={t.label ? `Target · ${t.label}` : `Target ${i + 1}`} value={money(t.price)} />
        ))}
        {d.plan.risk_reward ? <Row label="Reward : risk" value={d.plan.risk_reward} /> : null}
      </ObjectCard>
      {d.live.technical ? <T size={13} c={color.dim}>{d.live.technical}</T> : null}
      <Button label="Open the full setup" onPress={go} />
    </ScrollView>
  );
}

/* ==================================================================== */
/* Alert                                                                */
/* ==================================================================== */

/**
 * One alert, and the honest state of it.
 *
 * `monitoring_plain` is repeated as written rather than paraphrased. There is
 * no alert-evaluation worker in this release, so an active alert is ARMED with
 * no feed behind it — and a surface that said "watching" would be making a
 * promise the system cannot keep.
 */
export function AlertSurface({ alertId, onRoute }: { alertId: string; onRoute?: (r: string) => void }) {
  const router = useRouter();
  const a = useLoad<AlertDetail>(
    () => api.alertDetail(alertId),
    [alertId],
    'I could not load that alert just now.',
  );
  if (a.loading) return <Status text="Loading the alert…" />;
  if (a.missing || !a.value) return <Status text={a.missing ?? 'That alert is not there any more.'} />;

  const d = a.value;
  const go = () => (onRoute ?? ((r: string) => router.push(r as never)))(`/alert/${encodeURIComponent(d.id)}`);

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
      <T size={20} weight="bold">{d.symbol}</T>
      <T size={15}>{d.natural_language || d.summary_plain}</T>
      {d.monitoring_plain ? <T size={13} c={color.dim}>{d.monitoring_plain}</T> : null}
      {d.structured.length ? (
        <ObjectCard r={radius.xl} style={{ padding: 12 }}>
          <Eyebrow>The condition</Eyebrow>
          {d.structured.map((r) => <Row key={r.label} label={r.label} value={r.value} />)}
        </ObjectCard>
      ) : null}
      <Button label="Open the full alert" onPress={go} />
    </ScrollView>
  );
}

/* ==================================================================== */
/* News                                                                 */
/* ==================================================================== */

/**
 * WHAT HAS BEEN WRITTEN ABOUT THIS TICKER — with the publisher on every line.
 *
 * A headline is a claim by a publication, never a fact this app established, so
 * the publisher and the date are as prominent as the words. Tapping one opens it
 * in the phone's browser: the page itself is not fetched here and is not
 * pretended to be — Kai can read an allowlisted page with his own tool, and a
 * member reading an article should have the real article, ads and all.
 */
export function NewsSurface({ symbol, mode, onRoute }: { symbol: string; mode: GoalMode; onRoute?: (r: string) => void }) {
  const router = useRouter();
  const s = useLoad<SymbolDetail>(
    () => api.symbolDetail(symbol, mode),
    [symbol, mode],
    `I could not load the news on ${symbol} just now.`,
  );
  if (s.loading) return <Status text={`Loading the news on ${symbol}…`} />;
  if (s.missing || !s.value) return <Status text={s.missing ?? 'No news came back.'} />;

  const news: NewsItem[] = s.value.evidence?.news ?? [];
  if (!news.length) return <Status text={`Nothing has been written about ${symbol} recently.`} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
      <Eyebrow>{`What has been written about ${symbol}`}</Eyebrow>
      {news.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => { if (n.url) void Linking.openURL(n.url); }}
          accessibilityRole="link"
          style={({ pressed }) => ({ opacity: pressed && n.url ? 0.6 : 1 })}
        >
          <ObjectCard r={radius.xl} style={{ padding: 12, gap: 6 }}>
            <T size={14} weight="semibold">{n.title}</T>
            <T size={12} c={color.dim}>
              {[n.source, n.published_utc ? n.published_utc.slice(0, 10) : null].filter(Boolean).join(' · ') || 'Source not named'}
            </T>
          </ObjectCard>
        </Pressable>
      ))}
      <Button
        label={`Open ${symbol}`}
        onPress={() => (onRoute ?? ((r: string) => router.push(r as never)))(`/symbol/${encodeURIComponent(symbol)}`)}
      />
    </ScrollView>
  );
}

/* ==================================================================== */
/* Community                                                            */
/* ==================================================================== */

/**
 * WHAT THE ROOM IS SAYING — read-only, and attributed.
 *
 * DELIBERATELY NOT A COMPOSER. Posting is a moderated pipeline with rate limits,
 * a spam precheck and a disclosure requirement, and half of it inside a
 * workspace panel would be the half that skips a step. Reading is the thing the
 * conversation needed; the room itself is one tap away and has the composer.
 */
export function CommunitySurface({ roomId, onRoute }: { roomId: string | null; onRoute?: (r: string) => void }) {
  const router = useRouter();
  const m = useLoad<{ messages: RoomMessage[]; roomName: string | null }>(
    async () => {
      if (!roomId) throw new Error('no room');
      const r = await communityApi.messages(roomId, 0, 30);
      return { messages: r.messages.slice(-30), roomName: r.room?.name ?? null };
    },
    [roomId],
    'I could not read that room just now.',
  );
  if (!roomId) return <Status text="No room was named, so there is nothing to read." />;
  if (m.loading) return <Status text="Reading the room…" />;
  if (m.missing || !m.value) return <Status text={m.missing ?? 'That room did not answer.'} />;
  if (!m.value.messages.length) return <Status text="Nothing has been said in there recently." />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
      <Eyebrow>{m.value.roomName ?? 'The room'}</Eyebrow>
      {m.value.messages.map((msg) => (
        <View key={msg.id} style={{ gap: 3 }}>
          <T size={12} c={color.dim}>{msg.author?.handle ?? msg.author?.display_name ?? 'a member'}</T>
          <T size={14}>{msg.body || '(this message was removed)'}</T>
        </View>
      ))}
      <Button
        label="Open the room"
        onPress={() => (onRoute ?? ((r: string) => router.push(r as never)))(`/room/${encodeURIComponent(roomId)}`)}
      />
    </ScrollView>
  );
}

/* ==================================================================== */
/* Web                                                                  */
/* ==================================================================== */

/**
 * A PAGE KAI READ, AND THE HONEST WAY TO OFFER IT.
 *
 * The app does not render arbitrary web pages, and this does not pretend to. An
 * in-app WebView would put a third party's scripts inside a signed-in session
 * for the sake of a panel, and a sanitised copy of the text would be Kai's
 * reading of the page dressed up as the page itself.
 *
 * So the surface is the SOURCE: which site, which page, and a button that hands
 * it to the phone's browser. Kai already read it — he has the text, and he is
 * the one talking. This is the receipt.
 */
export function WebSurface({ url, title }: { url: string; title: string | null }) {
  let host = url;
  try { host = new URL(url).hostname; } catch { /* keep the raw string */ }
  return (
    <View style={{ padding: 18, gap: 12 }}>
      <Eyebrow>The page Kai read</Eyebrow>
      <T size={16} weight="semibold">{title ?? host}</T>
      <T size={13} c={color.dim}>{host}</T>
      <Button label="Open it in your browser" onPress={() => { void Linking.openURL(url); }} />
    </View>
  );
}
