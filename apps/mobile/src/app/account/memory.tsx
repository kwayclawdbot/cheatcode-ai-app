import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Screen } from '../../ui/Screen';
import { NotConnected, ScreenLoading } from '../../ui/Loading';
import { StackHeader } from '../../ui/StackHeader';
import { T, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Toggle } from '../../ui/Toggle';
import { Sheet } from '../../ui/Sheet';
import { KaiOrb } from '../../ui/KaiOrb';
import { color, radius, alpha } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useMemory } from '../../features/account/useAccount';

const KIND_LABEL: Record<string, string> = {
  preference: 'Preference',
  pattern: 'Pattern',
  fact: 'Fact',
  lesson: 'Lesson',
  note: 'Note',
};

const when = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * What Kai remembers.
 * Everything held about you, visible and deletable, with one master switch.
 * Deleting is immediate and permanent — there is no soft "hide".
 */
export default function Memory() {
  const { profile, patchProfile } = useSession();
  const { data, loading, error, isFixture, notAvailable, reload } = useMemory();
  const [enabled, setEnabled] = useState(profile?.memory_enabled ?? true);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setEnabled(profile?.memory_enabled ?? true); }, [profile?.memory_enabled]);

  const rows = (data ?? []).filter((m) => !removed.has(m.id));

  const toggle = async (v: boolean) => {
    setEnabled(v);
    await patchProfile({ memory_enabled: v });
    if (api.available()) { try { await api.putMemorySettings(v); } catch { /* profile write already carried it */ } }
  };

  const removeOne = async (id: string) => {
    setRemoved((s) => new Set(s).add(id));
    if (api.available()) { try { await api.deleteMemory(id); } catch { /* row is already gone from the list */ } }
  };

  const removeAll = async () => {
    setBusy(true);
    setRemoved(new Set(rows.map((r) => r.id)));
    if (api.available()) { try { await api.deleteAllMemory(); } catch { /* ignored */ } }
    setBusy(false);
    setConfirmAll(false);
    reload();
  };

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-memory">
        <ScreenLoading />
      </Screen>
    );
  }

  return (
    <Screen variant="corner" layout="tab" testID="screen-memory">
      <StackHeader title="What Kai remembers" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 11 }}
        showsVerticalScrollIndicator={false}
      >
        <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <KaiOrb size={24} />
          <View style={{ flex: 1 }}>
            <T size={13} weight="semibold">Memory is {enabled ? 'on' : 'off'}</T>
            <T size={11} c={color.muted} lh={16} style={{ marginTop: 2 }}>
              {enabled
                ? 'Kai carries what you tell him between conversations.'
                : 'Every conversation starts fresh. Nothing below is used.'}
            </T>
          </View>
          <Toggle testID="toggle-memory-master" value={enabled} onChange={toggle} label="Kai memory" />
        </ObjectCard>

        <Eyebrow>{`STORED · ${rows.length}`}</Eyebrow>

        {!rows.length ? (
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>
              Kai hasn&apos;t kept anything yet. He remembers what you correct him on and the lessons you save from a debrief.
            </T>
          </ObjectCard>
        ) : (
          rows.map((m) => (
            <ObjectCard key={m.id} r={radius.xl} style={{ padding: 14, gap: 8, opacity: enabled ? 1 : 0.55 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, borderColor: alpha.violet50 }}>
                  <T size={9} c={color.violetLight}>{(KIND_LABEL[m.kind] ?? m.kind).toUpperCase()}</T>
                </View>
                {m.created_at ? <T size={10} c={color.dim}>{when(m.created_at)}</T> : null}
                <Pressable
                  testID={`forget-${m.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Forget: ${m.content}`}
                  onPress={() => removeOne(m.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ marginLeft: 'auto' }}
                >
                  <T size={12} c={color.red}>Forget</T>
                </Pressable>
              </View>
              <T size={13.5} lh={20}>{m.content}</T>
            </ObjectCard>
          ))
        )}

        {rows.length ? (
          <Button testID="cta-forget-all" label="Forget everything" kind="outline" height={46} onPress={() => setConfirmAll(true)} />
        ) : null}

        {notAvailable ? <NotConnected what="What Kai remembers" /> : error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample memory — the service is not connected here.</T> : null}
      </ScrollView>

      <Sheet visible={confirmAll} onClose={() => setConfirmAll(false)} title="Forget everything?" testID="sheet-forget-all">
        <T size={13} lh={20} c={color.muted}>
          Kai will lose every preference, pattern and lesson he holds about you. This cannot be undone.
        </T>
        <Button label="Yes, forget it all" kind="volt" height={48} loading={busy} onPress={removeAll} />
        <Button label="Keep it" kind="ghost" height={44} onPress={() => setConfirmAll(false)} />
      </Sheet>
    </Screen>
  );
}
