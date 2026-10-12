import { useEffect, useRef } from 'react';
import { Text } from 'react-native';
import { focusOn } from '../platform/announce';
import { fonts } from './theme';
import { useTheme } from './ThemeProvider';

/**
 * A sheet's title as ConfirmSheet draws it (Display 700, 28), a header VoiceOver and TalkBack move to when it appears:
 * the sheet opening, or a question taking the sheet's place. It moves them through `focusOn`, which does nothing on the
 * web (React Native Web has no sendAccessibilityEvent, and calling it there blanked the app).
 */
export function SheetTitle({ children, marginBottom = 16 }: { children: string; marginBottom?: number }) {
  const { colors } = useTheme();
  const ref = useRef<Text>(null);
  useEffect(() => {
    focusOn(ref.current);
  }, []);
  return (
    <Text ref={ref} accessibilityRole="header" style={{ fontFamily: fonts.display700, fontSize: 28, color: colors.text, marginBottom }}>
      {children}
    </Text>
  );
}
