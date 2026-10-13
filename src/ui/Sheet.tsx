import { Keyboard, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { SheetTitle } from './SheetTitle';
import { useTheme } from './ThemeProvider';
import { KEYBOARD_MARGIN, whenFieldInside } from './useSafeScroll';

type SheetProps = { visible: boolean; onClose: () => void; children: ReactNode };

/** The backdrop that always stays above a sheet, however tall its content, so a tap outside it can still close it. */
const BACKDROP_STRIP = 48;

/** The longest a sheet is waited for, should iOS not say it has gone. */
const SHEET_GONE_MS = 1000;

/** What waits for a sheet to finish going away. */
let waiting: (() => void)[] = [];

/** A sheet has finished going away (iOS's `onDismiss`): what waited for it runs now. */
function sheetGone(): void {
  const run = waiting;
  waiting = [];
  for (const go of run) go();
}

/**
 * iOS cannot present a screen, another sheet or the share sheet while a sheet is still going away: tried too soon,
 * nothing appears and nothing says so (Round 10: Share routine from ⋯ did nothing). So `go` runs once iOS says the
 * sheet has gone, or after a second should it not say. Elsewhere there is nothing to wait for.
 */
export function afterSheetCloses(go: () => void): void {
  if (Platform.OS !== 'ios') {
    setTimeout(go, 0);
    return;
  }
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    waiting = waiting.filter((w) => w !== once);
    go();
  };
  waiting.push(once);
  setTimeout(once, SHEET_GONE_MS);
}

/**
 * A panel that rises from the bottom over a dimmed page. Tapping outside it, the back gesture or VoiceOver's escape
 * gesture calls `onClose`. The panel is never taller than the window less the status bar and a 48-point strip of the
 * dimmed page, and its content scrolls when it is taller than that. A field in it that raises the keyboard (iOS) lifts
 * the panel above the keyboard, and is scrolled into view when the panel is too short to show it (R560: no iOS
 * keyboard insets, which can outlive the sheet and leave empty space on a later page). The panel moves with no
 * animation of its own: `LayoutAnimation` animates the app's whole next update on iOS, the mounting of the sheet's own
 * content with it, and the form demo's photos stopped showing (Round 12). Nothing wraps the content either: the field
 * is found inside the scroll view's own content view.
 */
export function Sheet({ visible, onClose, children }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  /** The keyboard's height while a field in the sheet has it up. */
  const [keyboard, setKeyboard] = useState(0);
  const contentRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const viewHeight = useRef(0);

  useEffect(() => {
    if (!visible || Platform.OS !== 'ios') return;
    const shown = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboard(Math.max(0, Math.round(height - e.endCoordinates.screenY)));
    });
    const didShow = Keyboard.addListener('keyboardDidShow', () => {
      whenFieldInside(contentRef.current, (top, fieldHeight) => {
        const below = top + fieldHeight + KEYBOARD_MARGIN - (offset.current + viewHeight.current);
        if (below <= 0) return;
        offset.current += below;
        scrollRef.current?.scrollTo({ y: offset.current, animated: true });
      });
    });
    const hidden = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboard(0);
    });
    return () => {
      shown.remove();
      didShow.remove();
      hidden.remove();
      setKeyboard(0);
    };
  }, [visible, height]);
  const atRest = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  };

  // The weight and reps pads have no return key, and a tap in the session keeps the keyboard up, so a set's field can
  // still have focus when a sheet opens. The keyboard would cover the sheet's buttons, so it goes away first; the blur
  // that follows saves what was typed, as leaving the field does.
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={sheetGone} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)', paddingBottom: keyboard }}>
        <Pressable accessible accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={{
            width: '100%',
            maxWidth: 512,
            maxHeight: height - insets.top - BACKDROP_STRIP - keyboard,
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
            ref={scrollRef}
            innerViewRef={contentRef as React.RefObject<View>}
            alwaysBounceVertical={false}
            keyboardShouldPersistTaps="handled"
            onLayout={(e) => {
              viewHeight.current = e.nativeEvent.layout.height;
            }}
            onScrollEndDrag={atRest}
            onMomentumScrollEnd={atRest}
            contentContainerStyle={{ padding: 16, paddingBottom: 16 + (keyboard > 0 ? 0 : insets.bottom) }}
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
