/**
 * DELETING YOUR OWN POST. The server's rules, said before the tap: replies go
 * with the post, an OPEN call inside it is withdrawn (it will not be scored),
 * and a call that has already RESOLVED cannot be tidied away — that delete is
 * refused, and the refusal is the server's sentence, shown here.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { CommunityPost } from '@shared/community';
import { Sheet } from '../../../ui/Sheet';
import { T } from '../../../ui/Text';
import { alpha, color, radius } from '../../../ui/tokens';
import { api } from '../../../lib/api';
import { env } from '../../../lib/env';

export function DeletePostSheet({ post, onClose, onDeleted }: {
  post: CommunityPost | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const openCall = post?.trade_call && post.trade_call.status === 'open';

  const run = async () => {
    if (!post) return;
    setBusy(true);
    setSaid(null);
    try {
      if (!env.FIXTURES) await api.deleteCommunityPost(post.id);
      onDeleted(post.id);
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'That did not delete.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={!!post} onClose={() => { setSaid(null); onClose(); }} title="Delete this post?" testID="delete-post-sheet">
      <View style={{ gap: 12 }}>
        <T variant="body" c={color.textSecondary}>
          {openCall
            ? 'The replies go with it, and the call inside it is withdrawn, so it will not be scored.'
            : 'The replies go with it.'}
        </T>
        {said ? <T variant="body" c={color.textPrimary}>{said}</T> : null}
        <Pressable
          testID="delete-post-confirm"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => { void run(); }}
          style={({ pressed }) => ({
            minHeight: 48, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: alpha.marketDown40, backgroundColor: pressed ? alpha.marketDown12 : 'transparent',
            opacity: busy ? 0.6 : 1,
          })}
        >
          <T variant="body" weight="semibold" c={color.marketDown}>{busy ? 'Deleting…' : 'Delete post'}</T>
        </Pressable>
      </View>
    </Sheet>
  );
}
