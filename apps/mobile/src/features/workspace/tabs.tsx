import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { KaiOrb } from '../../ui/KaiOrb';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { openKaiSheet } from '../kai-sheet';
import type { Scenario, SetupDetail, SymbolWorkspace } from '../../lib/types';

const ago = (iso: string | null | undefined) => {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
};

/** Tab rail — V5-W1: four equal 34px segments, volt on the selected one. */
export function WorkspaceTabs({
  tabs, value, onChange, badge, testID = 'workspace-tabs',
}: {
  tabs: { key: string; label: string }[];
  value: string;
  onChange: (k: never) => void;
  badge?: Partial<Record<string, number | null>>;
  testID?: string;
}) {
  return (
    <View testID={testID} accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4 }}>
      {tabs.map((t) => {
        const active = t.key === value;
        const n = badge?.[t.key];
        return (
          <Pressable
            key={t.key}
            testID={`tab-${t.key}`}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(t.key as never)}
            style={({ pressed }) => ({
              flex: 1, height: 34, borderRadius: 9,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
              backgroundColor: active ? alpha.volt14 : 'transparent',
              borderWidth: active ? 0.5 : 0,
              borderColor: alpha.volt50,
              opacity: pressed && !active ? 0.75 : 1,
            })}
          >
            <T size={12} weight={active ? 'bold' : 'regular'} c={active ? color.volt : color.muted}>{t.label}</T>
            {n ? (
              <View style={{ minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: alpha.violet22, alignItems: 'center', justifyContent: 'center' }}>
                <T size={9} weight="bold" c={color.violetLight}>{String(n)}</T>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** One community line on Overview: sentiment · verified claim · Join discussion. */
export function CommunityLine({ w, testID = 'community-line' }: { w: SymbolWorkspace; testID?: string }) {
  const router = useRouter();
  const bits = [
    w.community.sentiment?.label ?? null,
    w.community.verified_claims[0] ?? null,
  ].filter(Boolean) as string[];
  if (!bits.length && !w.community.room_id) return null;

  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2, paddingTop: 2 }}>
      <T size={12} lh={17} c={color.muted} style={{ flex: 1 }}>
        <T size={12} weight="semibold" c={color.violetLight}>Community</T>
        {bits.length ? ` · ${bits.join(' · ')}` : ' · no discussion yet'}
      </T>
      {w.community.room_id ? (
        <Pressable
          testID="join-discussion"
          accessibilityRole="button"
          accessibilityLabel="Join discussion"
          onPress={() => router.push(`/room/${encodeURIComponent(w.community.room_id as string)}`)}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <T size={12} weight="semibold" c={color.volt}>Join discussion</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** "See why" expands in place — the depth never becomes another screen. */
export function SeeWhyPanel({ detail, whatChanged, testID = 'see-why' }: {
  detail: SetupDetail | null; whatChanged: string[]; testID?: string;
}) {
  const lines = whatChanged.length ? whatChanged : detail?.live.narration.map((n) => n.text) ?? [];
  return (
    <ObjectCard testID={testID} r={radius.xl} style={{ padding: 14, gap: 10 }}>
      <Eyebrow c={color.violetLight}>WHY KAI SEES IT THIS WAY</Eyebrow>
      {detail?.learn.why_plain ? <T size={13} lh={19}>{detail.learn.why_plain}</T> : null}

      {lines.length ? (
        <View style={{ gap: 6 }}>
          {lines.slice(0, 4).map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color.cyan, marginTop: 7 }} />
              <T size={12.5} lh={18} c={color.muted} style={{ flex: 1 }}>{l}</T>
            </View>
          ))}
        </View>
      ) : null}

      {detail?.learn.evidence.length ? (
        <View style={{ gap: 6 }}>
          {detail.learn.evidence.map((e, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {e.ok
                ? <Check size={12} color={color.green} strokeWidth={2.6} />
                : <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: color.muted }} />}
              <T size={12} lh={17} c={e.ok ? color.text : color.muted} style={{ flex: 1 }}>{e.label}</T>
            </View>
          ))}
        </View>
      ) : null}

      {!detail?.learn.why_plain && !lines.length ? (
        <T size={12.5} lh={18} c={color.muted}>Kai has not written this one up yet.</T>
      ) : null}
    </ObjectCard>
  );
}

function ScenarioTiles({ scenarios, testID = 'scenarios' }: { scenarios: Scenario[]; testID?: string }) {
  if (!scenarios.length) return null;
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: 8 }}>
      {scenarios.slice(0, 2).map((s, i) => {
        const c = s.tone === 'good' ? color.green : s.tone === 'bad' ? color.red : color.muted;
        const bg = s.tone === 'good' ? color.greenTint : s.tone === 'bad' ? color.redTint : color.surface3;
        const bd = s.tone === 'good' ? alpha.green40 : s.tone === 'bad' ? alpha.red40 : alpha.ivory12;
        return (
          <View key={i} style={{ flex: 1, borderRadius: radius.lg, backgroundColor: bg, borderWidth: 0.5, borderColor: bd, padding: 11, gap: 3 }}>
            <T size={10} c={color.muted}>{s.label}</T>
            {s.amount ? <Num size={16} weight="semibold" c={c}>{s.amount}</Num> : null}
            <T size={11} lh={16} c={color.muted}>{s.plain}</T>
          </View>
        );
      })}
    </View>
  );
}

/** Kai tab — interpretation, scenarios, what he read, and Kai in place. */
export function KaiTab({ w, testID = 'tab-body-kai' }: { w: SymbolWorkspace; testID?: string }) {
  return (
    <View testID={testID} style={{ gap: 11 }}>
      <ObjectCard tone="kai" r={radius.xxl} style={{ padding: 15, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <KaiOrb size={20} />
          <T size={12} weight="bold" c={color.violetLight}>{`Kai on ${w.symbol}`}</T>
          {w.kai.grade ? (
            <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.sm, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
              <T size={11} weight="bold" c={color.violet}>{w.kai.grade}</T>
            </View>
          ) : null}
          {w.kai.last_updated ? <T size={10} c={color.muted} style={{ marginLeft: 'auto' }}>{ago(w.kai.last_updated)}</T> : null}
        </View>
        <T size={13.5} lh={20} testID="kai-interpretation">
          {w.kai.interpretation ?? `Kai has not written a read on ${w.symbol} yet.`}
        </T>
      </ObjectCard>

      <ScenarioTiles scenarios={w.kai.scenarios} />

      {w.kai.research_refs.length ? (
        <>
          <Eyebrow c={color.cyan}>WHAT KAI READ</Eyebrow>
          <ObjectCard r={radius.xl} style={{ paddingHorizontal: 15, paddingVertical: 4 }}>
            {w.kai.research_refs.map((n, i) => (
              <View
                key={n.id}
                style={{
                  paddingVertical: 11,
                  borderBottomWidth: i === w.kai.research_refs.length - 1 ? 0 : 0.5,
                  borderBottomColor: alpha.ivory08,
                }}
              >
                <T size={13} lh={18} numberOfLines={2}>{n.title}</T>
                {n.source || n.published_utc ? (
                  <T size={10} c={color.muted} style={{ marginTop: 3 }}>
                    {[n.source, ago(n.published_utc)].filter(Boolean).join(' · ')}
                  </T>
                ) : null}
              </View>
            ))}
          </ObjectCard>
        </>
      ) : null}

      <Button
        testID="kai-tab-ask"
        label={`Ask Kai about ${w.symbol}`}
        kind="kai"
        height={46}
        icon={<KaiOrb size={16} glow={false} />}
        onPress={() => openKaiSheet({
          context: { kind: 'symbol', symbol: w.symbol, id: w.overview.setup_module?.id },
          question: `What do you see on ${w.symbol} right now?`,
        })}
      />
    </View>
  );
}

/** Plan tab — the numbers first, then what each outcome costs. */
export function PlanTab({ w, testID = 'tab-body-plan' }: { w: SymbolWorkspace; testID?: string }) {
  const router = useRouter();
  const p = w.plan.suggested;
  const risk = w.plan.daily_risk;
  const setupQ = w.overview.setup_module ? `&setup=${encodeURIComponent(w.overview.setup_module.id)}` : '';

  if (!p) {
    return (
      <View testID={testID} style={{ gap: 11 }}>
        <ObjectCard r={radius.xxl} style={{ padding: 16, gap: 6 }}>
          <T size={15} weight="bold">No plan yet</T>
          <T size={13} lh={19} c={color.muted}>
            {`Kai has no entry, stop or target for ${w.symbol} at the moment. Build one and he will attach the stop for you.`}
          </T>
        </ObjectCard>
        <Button
          testID="plan-build"
          label="Build a plan"
          kind="volt"
          height={48}
          onPress={() => router.push(`/plan/new?symbol=${encodeURIComponent(w.symbol)}${setupQ}`)}
        />
      </View>
    );
  }

  const pct = risk && risk.cap > 0 ? Math.min(1, risk.used / risk.cap) : 0;

  return (
    <View testID={testID} style={{ gap: 11 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, paddingVertical: 11, borderRadius: radius.lg, backgroundColor: color.cyanTint, borderWidth: 0.5, borderColor: alpha.cyan40, alignItems: 'center' }}>
          <T size={10} c={color.muted}>Entry</T>
          <Num size={16} weight="semibold" c={color.cyan}>{p.entry != null ? String(p.entry) : '—'}</Num>
        </View>
        <View style={{ flex: 1, paddingVertical: 11, borderRadius: radius.lg, backgroundColor: color.greenTint, borderWidth: 0.5, borderColor: alpha.green40, alignItems: 'center' }}>
          <T size={10} c={color.muted}>Target</T>
          <Num size={16} weight="semibold" c={color.green}>{p.targets[0] != null ? String(p.targets[0]) : '—'}</Num>
        </View>
        <View style={{ flex: 1, paddingVertical: 11, borderRadius: radius.lg, backgroundColor: color.redTint, borderWidth: 0.5, borderColor: alpha.red40, alignItems: 'center' }}>
          <T size={10} c={color.muted}>Stop</T>
          <Num size={16} weight="semibold" c={color.red}>{p.stop != null ? String(p.stop) : '—'}</Num>
        </View>
      </View>

      {/* Size and reward-to-risk are two separate facts, and the server may
          already send either as a full sentence — never bolt a suffix onto one. */}
      {p.size ? <T size={12.5} lh={18} c={color.muted} testID="plan-size">{p.size}</T> : null}
      {p.rr ? (
        <T size={12.5} lh={18} c={color.muted} testID="plan-rr">
          {/^[\d.]+\s*:\s*1$/.test(p.rr) ? `${p.rr} reward to risk` : p.rr}
        </T>
      ) : null}

      <ScenarioTiles scenarios={p.scenarios} testID="plan-scenarios" />

      {risk ? (
        <View style={{ gap: 5 }} testID="daily-cap">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={11} c={color.muted}>Daily risk used</T>
            <Num size={11} weight="regular" c={color.muted}>{`$${risk.used.toFixed(0)} of $${risk.cap.toFixed(0)}`}</Num>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: alpha.ivory08, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: pct > 0.8 ? color.red : color.volt }} />
          </View>
        </View>
      ) : null}

      <T size={11} lh={16} c={color.dim}>
        The stop attaches automatically when the order goes in. Paper orders only — fills use delayed prices.
      </T>

      <Button
        testID="plan-primary"
        label={w.plan.existing_plan_id ? 'Review order' : 'Build a plan'}
        kind="volt"
        height={48}
        arrow
        onPress={() => router.push(
          w.plan.existing_plan_id
            ? `/order/new?symbol=${encodeURIComponent(w.symbol)}&side=buy_to_open&plan=${encodeURIComponent(w.plan.existing_plan_id)}${setupQ}`
            : `/plan/new?symbol=${encodeURIComponent(w.symbol)}${setupQ}`,
        )}
      />
      <Button
        testID="plan-ask-kai"
        label="Ask Kai to check this"
        kind="kai"
        height={42}
        onPress={() => openKaiSheet({
          context: { kind: 'symbol', symbol: w.symbol, id: w.overview.setup_module?.id },
          question: `Does this plan on ${w.symbol} fit my risk?`,
        })}
      />
    </View>
  );
}

/** Community tab — what members are saying, and what has been verified. */
export function CommunityTab({ w, testID = 'tab-body-community' }: { w: SymbolWorkspace; testID?: string }) {
  const router = useRouter();
  const s = w.community.sentiment;

  return (
    <View testID={testID} style={{ gap: 11 }}>
      <ObjectCard r={radius.xxl} style={{ padding: 15, gap: 10 }}>
        <T size={13.5} lh={20} testID="thread-summary">
          {w.community.thread_summary ?? `No one has posted about ${w.symbol} yet.`}
        </T>
        {s ? (
          <View style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={11} c={color.muted}>{s.label}</T>
              <T size={11} c={color.dim}>{`${s.sample} members`}</T>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: alpha.red14, overflow: 'hidden' }}>
              <View style={{ width: `${Math.max(0, Math.min(100, s.split))}%`, height: '100%', backgroundColor: color.green }} />
            </View>
          </View>
        ) : null}
      </ObjectCard>

      {w.community.verified_claims.length ? (
        <>
          <Eyebrow c={color.green}>VERIFIED BY KAI</Eyebrow>
          <ObjectCard r={radius.xl} style={{ paddingHorizontal: 15, paddingVertical: 4 }}>
            {w.community.verified_claims.map((c, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 11,
                  borderBottomWidth: i === w.community.verified_claims.length - 1 ? 0 : 0.5,
                  borderBottomColor: alpha.ivory08,
                }}
              >
                <Check size={13} color={color.green} strokeWidth={2.6} />
                <T size={12.5} lh={18} style={{ flex: 1 }}>{c}</T>
              </View>
            ))}
          </ObjectCard>
        </>
      ) : null}

      {w.community.room_id ? (
        <Button
          testID="community-join"
          label="Join discussion"
          kind="volt"
          height={48}
          arrow
          onPress={() => router.push(`/room/${encodeURIComponent(w.community.room_id as string)}`)}
        />
      ) : (
        <T size={12} lh={18} c={color.muted}>Discussion opens when a room covers this symbol.</T>
      )}

      <Button
        testID="community-ask-kai"
        label="Ask Kai what members are seeing"
        kind="kai"
        height={42}
        onPress={() => openKaiSheet({
          context: { kind: w.community.room_id ? 'room' : 'symbol', id: w.community.room_id ?? undefined, symbol: w.symbol },
          question: `Summarise what members are saying about ${w.symbol}.`,
        })}
      />
    </View>
  );
}

/** The decision chain, kept visible on the symbol (audit §9 / rule 9). */
export function HistoryRail({ w, testID = 'workspace-history' }: { w: SymbolWorkspace; testID?: string }) {
  const router = useRouter();
  if (!w.history.length) return null;
  return (
    <View testID={testID}>
      <Eyebrow c={color.dim} style={{ paddingBottom: 8 }}>HOW YOU GOT HERE</Eyebrow>
      {w.history.map((h) => {
        const row = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 2, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 }}>
            <T size={12.5} lh={18} c={color.muted} style={{ flex: 1 }}>{h.label}</T>
            {h.at ? <T size={10} c={color.dim}>{ago(h.at)}</T> : null}
          </View>
        );
        return h.route ? (
          <Pressable key={h.id} accessibilityRole="button" accessibilityLabel={h.label} onPress={() => router.push(h.route as string)}>
            {row}
          </Pressable>
        ) : (
          <View key={h.id}>{row}</View>
        );
      })}
    </View>
  );
}
