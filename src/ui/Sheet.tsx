import { Modal, Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { Body, Display } from './Text';
import { useTheme } from './ThemeProvider';

type SheetProps = { visible: boolean; onClose: () => void; children: ReactNode };

/** A panel that rises from the bottom over a dimmed page. Tapping outside it, or the back gesture, calls `onClose`. */
export function Sheet({ visible, onClose, children }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable accessible={false} onPress={onClose} style={{ flex: 1 }} />
        <View
          style={{
            width: '100%',
            maxWidth: 512,
            alignSelf: 'center',
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 16,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

type ConfirmSheetProps = {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A question with two answers. The confirm button is primary; cancelling, or dismissing the sheet, calls `onCancel`. */
export function ConfirmSheet({ visible, title, body, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <Sheet visible={visible} onClose={onCancel}>
      <Display weight={700} style={{ marginBottom: body ? 8 : 16 }}>
        {title}
      </Display>
      {body ? (
        <Body muted style={{ marginBottom: 16 }}>
          {body}
        </Body>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button label={confirmLabel} onPress={onConfirm} />
        <Button label={cancelLabel} onPress={onCancel} variant="secondary" />
      </View>
    </Sheet>
  );
}
