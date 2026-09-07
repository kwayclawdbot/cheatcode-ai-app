import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { T, Num, Eyebrow } from '../../../ui/Text';
import { Field } from '../../../ui/Field';
import { Button } from '../../../ui/Button';
import { ChipRail } from '../../../ui/Segmented';
import { DataRow, Rule } from '../../../ui/DataRow';
import { Sheet } from '../../../ui/Sheet';
import { RoomAvatar, isTickerish } from '../../../ui/RoomAvatar';
import { color, space } from '../../../ui/tokens';
import { Board, Section, useRooms, useStaffRole } from '../../../features/admin';
import { pickPhotos } from '../../../features/media/pick';
import { api } from '../../../lib/api';
import type { AdminRoomRow, AdminRoomsFilter } from '../../../lib/types';

/**
 * ROOMS — the hand that was missing.
 *
 * `RoomAvatar` has always known three ways to draw a room: the picture an admin
 * chose, the company logo when the room is about a ticker, the room's initial
 * otherwise. Only two of them could ever happen, because nothing in the product
 * wrote `rooms.config.image_url`. This board writes it.
 *
 * EVERY ROW DRAWS THE REAL COMPONENT. The circle beside each room here is the
 * same `RoomAvatar` a member sees in the room list, given the same three
 * inputs — so an operator is never choosing a picture against a preview that is
 * a near-enough copy of the thing. If the mark changes, this board changes with
 * it, for free.
 *
 * AND IT SAYS WHICH OF THE THREE IS HAPPENING. A room wearing its company logo
 * and a room wearing its initial both look "fine" at 34 points, and only one of
 * them is a room somebody should probably give a picture to. The line under the
 * name says which, in the same words the component's own header uses.
 *
 * CLEARING IS A REAL ACTION, NOT A DELETE. Sending null puts the room back to
 * the logo or the initial. Nothing is missing afterwards, which is why the
 * sheet says so plainly instead of asking "are you sure".
 */

/** all / has one / has none — the filter the API takes, in the operator's words. */
type Lens = 'all' | 'yes' | 'no';

const LENS_LABEL: Record<Lens, string> = {
  all: 'Every room',
  yes: 'Has a picture',
  no: 'No picture',
};

/**
 * Which of `RoomAvatar`'s three cases this room is drawing right now.
 *
 * The ticker test is IMPORTED, never re-typed: `isTickerish` is the one rule,
 * and the `.trim().toUpperCase()` in front of it is the same normalisation the
 * component does to `symbol` before it asks. The order below is the order the
 * component returns in, which is what makes this an observation about the
 * screen rather than a second opinion about it.
 */
function drawnCase(room: AdminRoomRow): 'picture' | 'logo' | 'initial' {
  if (room.image_url) return 'picture';
  return isTickerish(String(room.name ?? '').trim().toUpperCase()) ? 'logo' : 'initial';
}

const CASE_WORD: Record<ReturnType<typeof drawnCase>, string> = {
  picture: 'wearing the picture you chose',
  logo: 'wearing its company logo',
  initial: 'showing its first letter',
};

export default function AdminRooms() {
  const router = useRouter();

  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [lens, setLens] = useState<Lens>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  /** What went wrong while picking or uploading — before the API is involved. */
  const [pickError, setPickError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // The search waits for the typing to stop, for the same reason it does on the
  // People board: every read here is a `staffed()` request that writes an audit
  // row, and a search per keystroke buries the searches a person actually ran.
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 350);
    return () => clearTimeout(t);
  }, [typed]);

  const filter = useMemo<AdminRoomsFilter>(() => ({
    ...(q ? { q } : null),
    ...(lens !== 'all' ? { has_image: lens } : null),
  }), [q, lens]);

  const {
    data, rooms, totals, loading, error, notAvailable, hasMore, loadingMore, more,
    setAvatar, busy, actionError,
  } = useRooms(filter);
  // Choosing a room's picture is an `admin` act. `support` sees every room and
  // what each one is drawing, which is the half of this board that is a report.
  const { canWrite } = useStaffRole();

  // The open room is looked up by id rather than held as a row, so the sheet
  // redraws itself the instant `setAvatar` puts the server's new row on screen.
  const open = rooms.find((r) => r.id === openId) ?? null;

  const closeSheet = () => { setOpenId(null); setPickError(null); };

  const choose = async (room: AdminRoomRow) => {
    setPickError(null);
    const outcome = await pickPhotos(1);
    if (!outcome.ok) {
      // Backing out of the picker is not a failure and gets no sentence.
      if (outcome.reason !== 'cancelled') setPickError(outcome.plain);
      return;
    }
    const photo = outcome.photos[0];
    if (!photo) return;
    setUploading(true);
    try {
      // Two steps, in this order, and the second only if the first worked: the
      // file has to exist at an address before that address can be written onto
      // the room. `uploadAvatar` hands back the STABLE url — the one that keeps
      // working — and that is what the room stores.
      const url = await api.uploadAvatar(photo);
      await setAvatar(room.id, url);
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'That picture would not upload. Try another one.');
    } finally {
      setUploading(false);
    }
  };

  const working = uploading || busy;

  return (
    <Board
      testID="screen-admin-rooms"
      current="rooms"
      title="Rooms"
      subtitle={totals ? `${totals.without_image} of ${totals.all} have no picture` : null}
      onBack={() => router.replace('/admin')}
      loading={loading && !data}
      notAvailable={notAvailable}
      error={actionError ?? (rooms.length ? null : error)}
    >
      <Field
        testID="rooms-search"
        label="Search"
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Room name or slug"
      />

      <ChipRail
        testID="rooms-lens"
        options={(['all', 'yes', 'no'] as const).map((k) => ({ key: k, label: LENS_LABEL[k] }))}
        value={lens}
        onChange={setLens}
      />

      {rooms.length ? (
        <Section
          label={q || lens !== 'all' ? 'MATCHES' : 'EVERY ROOM'}
          note={canWrite ? 'Tap a room to give it a picture. A room with no picture is not broken — it wears its company logo, or its first letter.' : null}
        >
          {rooms.map((room, i) => {
            const drawn = drawnCase(room);
            return (
              <DataRow
                key={room.id}
                testID={`room-${room.id}`}
                accessibilityLabel={`${room.name}, ${CASE_WORD[drawn]}`}
                lead={
                  <RoomAvatar
                    testID={`room-avatar-${room.id}`}
                    symbol={room.name}
                    name={room.name}
                    imageUrl={room.image_url}
                    size={34}
                  />
                }
                label={room.name}
                sub={
                  <T size={11} c={drawn === 'initial' ? color.muted : color.dim} numberOfLines={1}>
                    {`${room.slug ? `#${room.slug}` : room.type} · ${CASE_WORD[drawn]}`}
                  </T>
                }
                valueNode={
                  <T size={11} c={drawn === 'picture' ? color.volt : color.dim}>
                    {drawn === 'picture' ? 'chosen' : 'none chosen'}
                  </T>
                }
                onPress={canWrite ? () => { setOpenId(room.id); setPickError(null); } : undefined}
                chevron={canWrite}
                last={i === rooms.length - 1}
              />
            );
          })}
        </Section>
      ) : (
        <T size={13} c={color.muted} lh={20} testID="rooms-empty">
          {data?.plain ?? 'No rooms match that.'}
        </T>
      )}

      {!canWrite ? (
        <T size={12.5} c={color.muted} lh={19}>
          Choosing a room’s picture is an admin act. You can see every room and what each one is showing today.
        </T>
      ) : null}

      {hasMore ? (
        <>
          <Rule />
          <Button
            testID="rooms-more"
            label={loadingMore ? 'Reading…' : 'Show more'}
            kind="outline"
            height={46}
            loading={loadingMore}
            onPress={more}
            style={{ marginTop: space.x8 }}
          />
        </>
      ) : null}

      <Sheet visible={!!open} onClose={closeSheet} title={open?.name ?? 'Room'} testID="sheet-room-picture">
        {open ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x12, paddingVertical: space.x4 }}>
              <RoomAvatar
                testID="sheet-room-avatar"
                symbol={open.name}
                name={open.name}
                imageUrl={open.image_url}
                size={56}
              />
              <View style={{ flex: 1, gap: 3 }}>
                <Eyebrow c={color.dim}>{open.type.toUpperCase()}</Eyebrow>
                <T size={12.5} c={color.muted} lh={19} testID="sheet-room-case">
                  {`Right now this room is ${CASE_WORD[drawnCase(open)]}.`}
                </T>
                {open.slug ? <Num size={11} weight="medium" c={color.dim}>{`#${open.slug}`}</Num> : null}
              </View>
            </View>

            <Button
              testID="cta-room-choose"
              label={open.image_url ? 'Choose a different picture' : 'Choose a picture'}
              kind="volt"
              height={52}
              loading={working}
              onPress={() => choose(open)}
            />

            {open.image_url ? (
              <>
                <T size={12} c={color.muted} lh={18}>
                  Clearing the picture leaves no gap. The room goes back to its company logo, or to its first
                  letter when it is not about a company.
                </T>
                <Button
                  testID="cta-room-clear"
                  label="Clear the picture"
                  kind="outline"
                  height={46}
                  disabled={working}
                  onPress={() => setAvatar(open.id, null)}
                />
              </>
            ) : null}

            {pickError ? (
              <T size={12} c={color.muted} lh={18} testID="room-picture-error">{pickError}</T>
            ) : null}
            {actionError ? (
              <T size={12} c={color.muted} lh={18} testID="room-save-error">{actionError}</T>
            ) : null}

            <Button label="Done" kind="ghost" height={44} onPress={closeSheet} />
          </>
        ) : null}
      </Sheet>
    </Board>
  );
}
