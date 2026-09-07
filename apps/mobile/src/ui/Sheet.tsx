import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { alpha, color, radius } from './tokens';
import { KeyboardDock } from './KeyboardDock';
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
          }}
        >
          {/*
            The dock is INSIDE the panel, not around it: several sheets hold a
            text field, and the panel's own surface has to keep filling the space
            behind the keyboard rather than floating above it. Being inside also
            leaves the backdrop's tap-to-dismiss intact — the panel Pressable
            still swallows every touch that lands on the padding.
          */}
          <KeyboardDock floor={22} style={{ gap: 12 }}>
            <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: alpha.ivory16 }} />
            {title ? <T size={17} weight="bold">{title}</T> : null}
            {children}
          </KeyboardDock>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
