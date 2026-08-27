import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, color, radius } from './tokens';
import { T } from './Text';

/**
 * Bottom sheet. Used for the honest "not yet" answers (billing not configured,
 * plans arrive later) and for confirmations. One dominant action per sheet.
 */
export function Sheet({
  visible, onClose, title, children, testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: alpha.black50, justifyContent: 'flex-end' }}
      >
        <Pressable
          testID={testID}
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: color.surface2,
            borderTopLeftRadius: radius.xxxl,
            borderTopRightRadius: radius.xxxl,
            borderTopWidth: 0.5,
            borderColor: alpha.ivory16,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 22),
            gap: 12,
          }}
        >
          <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: alpha.ivory16 }} />
          {title ? <T size={17} weight="bold">{title}</T> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
