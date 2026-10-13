import { useEffect, useRef } from 'react';
import { Text } from 'react-native';
import { focusOn } from '../platform/announce';
import { Body } from './Text';
import { fonts } from './theme';
import { useTheme } from './ThemeProvider';

/**
 * Every sheet's title (Display 700, 28), a header VoiceOver and TalkBack move to when it appears: the sheet opening, or
 * a question taking the sheet's place. It moves them through `focusOn`, which does nothing on the web (React Native Web
 * has no sendAccessibilityEvent, and calling it there blanked the app).
 *
 * One spacing for every sheet (R351): a title alone sits 16pt over what follows; with a `subtitle` (the exercise or
 * food it is about, or what a question will do) the title sits 4pt over the muted subtitle, which sits 16pt over what
 * follows. `marginBottom` changes that last gap only.
 */
export function SheetTitle({ children, subtitle, marginBottom = 16 }: { children: string; subtitle?: string | null; marginBottom?: number }) {
  const { colors } = useTheme();
  const ref = useRef<Text>(null);
  useEffect(() => {
    focusOn(ref.current);
  }, []);
  const hasSubtitle = subtitle != null && subtitle !== '';
  return (
    <>
      <Text ref={ref} accessibilityRole="header" style={{ fontFamily: fonts.display700, fontSize: 28, color: colors.text, marginBottom: hasSubtitle ? 4 : marginBottom }}>
        {children}
      </Text>
      {hasSubtitle ? (
        <Body muted style={{ marginBottom }}>
          {subtitle}
        </Body>
      ) : null}
    </>
  );
}
