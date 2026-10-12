import { Keyboard, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useEffect, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { SheetTitle } from './SheetTitle';
import { useTheme } from './ThemeProvider';

type SheetProps = { visible: boolean; onClose: () => void; children: ReactNode };

/** The backdrop that always stays above a sheet, however tall its content, so a tap outside it can still close it. */
const BACKDROP_STRIP = 48;

/**
 * iOS cannot present a screen or another sheet while a sheet is still going away, so the next one opens a moment
 * after the first closes. Elsewhere there is nothing to wait for.
 */
export function afterSheetCloses(go: () => void): void {
  setTimeout(go, Platform.OS === 'ios' ? 400 : 0);
}

/**
 * A panel that rises from the bottom over a dimmed page. Tapping outside it, the back gesture or VoiceOver's escape
 * gesture calls `onClose`. The panel is never taller than the window less the status bar and a 48-point strip of the
 * dimmed page, and its content scrolls when it is taller than that.
 */
export function Sheet({ visible, onClose, children }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // The weight and reps pads have no return key, and a tap in the session keeps the keyboard up, so a set's field can
  // still have focus when a sheet opens. The keyboard would cover the sheet's buttons, so it goes away first; the blur
  // that follows saves what was typed, as leaving the field does.
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable accessible accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={{
            width: '100%',
            maxWidth: 512,
            maxHeight: height - insets.top - BACKDROP_STRIP,
            alignSelf: 'center',
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}
        >
          <ScrollView
            alwaysBounceVertical={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }}
          >
            {children}
          </ScrollView>
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
  /** Which answer is the primary button, drawn first. Default 'confirm'; 'cancel' when cancelling is the safe answer. */
  primary?: 'confirm' | 'cancel';
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A question with two answers. The primary answer comes first and the other second as secondary: confirm by default,
 * or cancel with `primary="cancel"`. Cancelling, or dismissing the sheet, calls `onCancel`.
 */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  primary = 'confirm',
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const confirm = { key: 'confirm', label: confirmLabel, onPress: onConfirm };
  const cancel = { key: 'cancel', label: cancelLabel, onPress: onCancel };
  /** The primary answer first. */
  const answers = primary === 'cancel' ? [cancel, confirm] : [confirm, cancel];
  return (
    <Sheet visible={visible} onClose={onCancel}>
      <SheetTitle subtitle={body}>{title}</SheetTitle>
      <View style={{ gap: 8 }}>
        {answers.map(({ key, label, onPress }, i) => (
          <Button key={key} label={label} onPress={onPress} variant={i === 0 ? 'primary' : 'secondary'} />
        ))}
      </View>
    </Sheet>
  );
}
