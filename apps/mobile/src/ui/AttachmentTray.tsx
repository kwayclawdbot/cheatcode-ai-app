/**
 * The row of pictures sitting above a composer while they upload, and the
 * button that adds one.
 *
 * In `ui/` rather than in the community feature because two different
 * composers use it — the club board's `Composer` and the room's
 * `RoomComposer` — and a tray that exists twice is two sets of upload states
 * that drift apart.
 *
 * THE THUMBNAIL IS THE LOCAL FILE. It draws immediately, with no round trip,
 * and it stays put whether the upload succeeds or fails. Underneath it sits the
 * SERVER'S sentence about that file — what it removed, or why it would not take
 * it — never a rewritten version of it.
 */
import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { alpha, color, radius } from './tokens';
import { T } from './Text';

/** One picture the member has picked, and where it is in its journey. */
export type Attachment = {
  /** Local key while it uploads. Stable for the life of the row. */
  key: string;
  /** The on-device file, shown as the thumbnail. */
  uri: string;
  /** The server's asset id. Null until the upload lands. */
  assetId: string | null;
  state: 'uploading' | 'ready' | 'failed';
  /** The server's own words about this file. */
  note: string | null;
};

export function AttachmentTray({
  attachments,
  onRemove,
  testID,
}: {
  attachments: Attachment[];
  onRemove?: (key: string) => void;
  testID?: string;
}) {
  if (!attachments.length) return null;

  return (
    <View
      testID={testID ?? 'composer-attachments'}
      style={{ flexDirection: 'row', gap: 8, paddingBottom: 8, flexWrap: 'wrap' }}
    >
      {attachments.map((a) => (
        <View key={a.key} style={{ width: 56 }}>
          <View style={{ width: 56, height: 56 }}>
            <Image
              source={{ uri: a.uri }}
              contentFit="cover"
              style={{
                width: 56,
                height: 56,
                borderRadius: radius.md,
                borderWidth: 0.5,
                borderColor: a.state === 'failed' ? alpha.ivory24 : alpha.ivory12,
                // A picture that is still going up, or that would not go up, is
                // dimmed. Nothing is ever drawn as if it had landed when it has not.
                opacity: a.state === 'ready' ? 1 : 0.45,
              }}
            />
            {a.state === 'uploading' ? (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="small" color={color.volt} />
              </View>
            ) : null}
            <Pressable
              testID={`composer-attachment-remove-${a.key}`}
              accessibilityRole="button"
              accessibilityLabel="Remove this picture"
              onPress={() => onRemove?.(a.key)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                position: 'absolute',
                top: -5,
                right: -5,
                width: 18,
                height: 18,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: color.bg,
                borderWidth: 0.5,
                borderColor: alpha.ivory24,
              }}
            >
              <T size={10} weight="bold" c={color.muted}>×</T>
            </Pressable>
          </View>
          {a.note ? (
            <T size={8.5} lh={11} c={a.state === 'failed' ? color.gold : color.dim} numberOfLines={3}>
              {a.note}
            </T>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * The add-a-picture button.
 *
 * NOT MOUNTED ANYWHERE ANY MORE. Both composers now put picking a photo behind
 * the + menu (`ui/ComposerActions.tsx`) as a NAMED row, because a bar of
 * unlabelled glyphs stops scaling at about two of them. Kept here, unused, only
 * so a screen that wants a bare one-purpose camera button has it; anything that
 * belongs beside the other things you can post belongs in the menu instead.
 *
 * Its accessibility hint carries the promise the server keeps — that the
 * location comes off — BEFORE anything is picked, rather than as a note
 * afterwards. Somebody deciding whether to post a photo of their desk should be
 * able to find that out first.
 */
export function AttachButton({
  onPress,
  disabled,
  limit,
  testID,
}: {
  onPress: () => void;
  disabled?: boolean;
  limit: number;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID ?? 'composer-attach'}
      accessibilityRole="button"
      accessibilityLabel="Add a picture"
      accessibilityHint={`Up to ${limit}. Location data is removed from every picture before it is stored.`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 0.5,
        borderColor: alpha.ivory24,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      <PhotoGlyph />
    </Pressable>
  );
}

/**
 * A photograph, drawn as a rule and a mark rather than a filled icon — the same
 * weight as the + beside it, so neither shouts at the other.
 */
function PhotoGlyph() {
  return (
    <View
      style={{
        width: 17,
        height: 14,
        borderWidth: 1.4,
        borderColor: color.text,
        borderRadius: 3,
        overflow: 'hidden',
        justifyContent: 'flex-end',
      }}
    >
      <View
        style={{
          width: 9,
          height: 9,
          borderWidth: 1.4,
          borderColor: color.text,
          transform: [{ rotate: '45deg' }],
          marginBottom: -5,
          marginLeft: 2,
        }}
      />
    </View>
  );
}
