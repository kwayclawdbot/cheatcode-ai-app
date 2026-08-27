import React, { useEffect, useState } from 'react';
import { View, ScrollView, Modal, Pressable } from 'react-native';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { alpha, color, radius } from '../../ui/tokens';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import { fixtureRooms } from '../../lib/fixtures';
import type { RoomRow } from '../../lib/types';

/**
 * V3-C0-Community-home.html, honest stub.
 * Rooms come from Supabase `rooms` under RLS. The LIVE block is Phase 2, so it
 * is not drawn at all rather than faked.
 */
export default function Community() {
  const [rooms, setRooms] = useState<RoomRow[]>(env.FIXTURES || !supabase ? fixtureRooms : []);
  const [sheet, setSheet] = useState<RoomRow | null>(null);

  useEffect(() => {
    let alive = true;
    if (env.FIXTURES || !supabase) return;
    supabase
      .from('rooms')
      .select('id, slug, name, description, mode, type')
      .order('name')
      .then(({ data }) => {
        if (!alive || !data) return;
        setRooms((data as { id: string; slug: string | null; name: string; description: string | null; mode: string | null }[])
          .map((r) => ({ id: r.id, slug: r.slug ?? r.name, name: r.name, topic: r.description, mode: r.mode })));
      });
    return () => { alive = false; };
  }, []);

  return (
    <Screen variant="corner" layout="tab" testID="screen-community">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 11, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={28} weight="bold">Cheat Code Club</T>
          <T size={11} c={color.muted}>Opening soon</T>
        </View>

        <ObjectCard tone="kai" r={radius.xxl} style={{ paddingVertical: 13, paddingHorizontal: 15 }}>
          <T size={13} lh={19} c={color.violetLight}>
            The rooms are set up and Kai is ready to summarise them. Posting and live sessions open in the next release.
          </T>
        </ObjectCard>

        <Eyebrow>ROOMS</Eyebrow>
        {rooms.length === 0 ? (
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted}>No rooms are open to you yet.</T>
          </ObjectCard>
        ) : (
          <RowList>
            {rooms.map((r, i) => (
              <Row key={r.id} last={i === rooms.length - 1}>
                <Pressable
                  testID={`room-${r.slug}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.name}. ${r.topic ?? ''}`}
                  onPress={() => setSheet(r)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minHeight: 44 }}
                >
                  <Num size={15} weight="regular" c={color.muted}>#</Num>
                  <View style={{ flex: 1 }}>
                    <T size={14} weight="semibold">{r.name}</T>
                    {r.topic ? <T size={11} c={color.muted} style={{ marginTop: 1 }}>{r.topic}</T> : null}
                  </View>
                  {r.member_hint ? <T size={10} c={color.muted}>{r.member_hint}</T> : null}
                </Pressable>
              </Row>
            ))}
          </RowList>
        )}
      </ScrollView>

      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => setSheet(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        >
          <ObjectCard r={radius.xxxl} style={{ margin: 16, padding: 20, gap: 12 }}>
            <T size={20} weight="bold">Rooms open in the next release</T>
            <T size={14} lh={21} c={color.muted}>
              #{sheet?.name} is set up and waiting. When it opens, Kai will summarise what happened while you were away
              so you never have to scroll back.
            </T>
            <Button testID="sheet-close" label="Got it" height={48} onPress={() => setSheet(null)} />
          </ObjectCard>
        </Pressable>
      </Modal>
    </Screen>
  );
}
