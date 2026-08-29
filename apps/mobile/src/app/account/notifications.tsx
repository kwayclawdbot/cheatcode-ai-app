import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { NotConnected, ScreenLoading } from '../../ui/Loading';
import { StackHeader } from '../../ui/StackHeader';
import { T, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { ChipRail } from '../../ui/Segmented';
import { Bell, ArrowRight, Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useNotifications } from '../../features/account/useAccount';
import { clearBadge, DeliveryPanel, usePush } from '../../features/notifications';
import type { NotificationGroup, NotificationRow } from '../../lib/types';

type Filter = 'all' | NotificationGroup;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'action_required', label: 'Needs you' },
  { key: 'changes', label: 'Changes' },
  { key: 'fyi', label: 'FYI' },
];

const GROUP_META: Record<NotificationGroup, { label: string; c: string }> = {
  action_required: { label: 'NEEDS YOU', c: color.gold },
  changes: { label: 'CHANGES', c: color.cyan },
  fyi: { label: 'FOR YOUR INFORMATION', c: color.muted },
};

const when = (iso: string | null | undefined) => {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
};

/**
 * Notification inbox (S72). Grouped by what it asks of you, not by feature.
 * Opening a row marks it read and follows its deep link.
 *
 * Round 5 adds the delivery header: whether these also reach a phone or a
 * browser, and — when they cannot — which of the several reasons it is. The
 * inbox itself is unchanged by any of it, which is the point: a suppressed
 * push is still a row here in the morning.
 */
export default function Notifications() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const { data, loading, error, isFixture, notAvailable, reload } = useNotifications(filter === 'all' ? undefined : filter);
  const [readLocal, setReadLocal] = useState<Set<string>>(new Set());
  const push = usePush();

  // The badge counts what the user has not looked at, and they are looking now.
  useEffect(() => { clearBadge(); }, []);

  const rows = data ?? [];
  const groups: NotificationGroup[] = ['action_required', 'changes', 'fyi'];

  const open = async (n: NotificationRow) => {
    setReadLocal((s) => new Set(s).add(n.id));
    if (api.available()) { try { await api.markNotificationRead(n.id); } catch { /* the row is already dimmed */ } }
    if (n.route) router.push(n.route as never);
  };

  const markAll = async () => {
    const unread = rows.filter((n) => !n.read_at && !readLocal.has(n.id));
    setReadLocal((s) => { const next = new Set(s); unread.forEach((n) => next.add(n.id)); return next; });
    if (!api.available()) return;
    await Promise.all(unread.map((n) => api.markNotificationRead(n.id).catch(() => undefined)));
    reload();
  };

  const unreadCount = rows.filter((n) => !n.read_at && !readLocal.has(n.id)).length;

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-notifications">
        <ScreenLoading />
      </Screen>
    );
  }

  return (
    <Screen variant="corner" layout="tab" testID="screen-notifications">
      <StackHeader
        title="Notifications"
        subtitle={unreadCount ? `${unreadCount} unread` : 'All caught up'}
        right={unreadCount ? (
          <Pressable
            testID="mark-all-read"
            accessibilityRole="button"
            accessibilityLabel="Mark all read"
            onPress={markAll}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <T size={12} c={color.volt}>Mark all read</T>
          </Pressable>
        ) : undefined}
      />

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <ChipRail options={FILTERS} value={filter} onChange={setFilter} testID="notif-filter" />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 11 }}
        showsVerticalScrollIndicator={false}
      >
        <DeliveryPanel push={push} />

        <View style={{ height: 0.5, backgroundColor: alpha.ivory08, marginTop: 4 }} />

        {!rows.length ? (
          <ObjectCard r={radius.xxl} style={{ padding: 20, gap: 10, alignItems: 'center', marginTop: 20 }}>
            <Bell size={22} color={color.muted} />
            <T size={15} weight="bold" align="center">Nothing here right now.</T>
            <T size={13} c={color.muted} align="center" lh={19}>
              Kai only pings you when something changes that you decided mattered.
            </T>
          </ObjectCard>
        ) : null}

        {groups.map((g) => {
          const items = rows.filter((n) => n.group === g);
          if (!items.length) return null;
          const meta = GROUP_META[g];
          return (
            <View key={g} style={{ gap: 9 }}>
              <Eyebrow c={meta.c}>{meta.label}</Eyebrow>
              {items.map((n) => {
                const read = !!n.read_at || readLocal.has(n.id);
                return (
                  <Pressable
                    key={n.id}
                    testID={`notif-${n.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={n.title}
                    onPress={() => open(n)}
                  >
                    <ObjectCard
                      tone={g === 'action_required' && !read ? 'gold' : 'default'}
                      r={radius.xl}
                      style={{ paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', gap: 11, alignItems: 'flex-start', opacity: read ? 0.6 : 1 }}
                    >
                      <View style={{ paddingTop: 3 }}>
                        {read
                          ? <Check size={13} color={color.dim} strokeWidth={2.4} />
                          : <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: meta.c }} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <T size={14} weight="semibold">{n.title}</T>
                        {n.body ? <T size={12} c={color.muted} lh={18} style={{ marginTop: 3 }}>{n.body}</T> : null}
                        {n.created_at ? <T size={10} c={color.dim} style={{ marginTop: 5 }}>{when(n.created_at)}</T> : null}
                      </View>
                      {n.route ? <View style={{ paddingTop: 3 }}><ArrowRight size={12} color={color.muted} /></View> : null}
                    </ObjectCard>
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        {notAvailable ? <NotConnected what="Notifications" /> : error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample notifications — the service is not connected here.</T> : null}
      </ScrollView>
    </Screen>
  );
}
