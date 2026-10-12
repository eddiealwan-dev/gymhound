import { ScrollView, View } from 'react-native';
import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { useTheme } from './ThemeProvider';
import { useSafeScroll } from './useSafeScroll';

/**
 * A scrolling page: 16px gutters, content capped at 512px and centred.
 * `footer` adds the GruntHound footer. On a short page a flexible spacer (FieldHound's `.home-spacer`, at least 32px) pushes it to the bottom of the visible area; on a long page it follows the content.
 * On iOS the page scrolls clear of the keyboard, so a field low on it (Settings' custom bar) is not hidden under it;
 * only the page in view does, and its content can never be left out of reach (`useSafeScroll`, R510).
 * `under` is drawn beneath the page, which paints over it: a share card being captured (§18.17) exists on screen, so
 * it is drawn, but is never seen.
 */
export function Screen({ children, footer = false, under }: { children: ReactNode; footer?: boolean; under?: ReactNode }) {
  const { colors } = useTheme();
  if (under !== undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {under}
        <Screen footer={footer}>{children}</Screen>
      </View>
    );
  }
  return <Page footer={footer}>{children}</Page>;
}

function Page({ children, footer }: { children: ReactNode; footer: boolean }) {
  const { colors } = useTheme();
  const { ref, scrollProps } = useSafeScroll();
  return (
    <ScrollView
      ref={ref}
      {...scrollProps}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexGrow: 1, width: '100%', maxWidth: 512, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: footer ? 0 : 16 }}>
        {children}
        {footer ? (
          <>
            <View style={{ flex: 1, minHeight: 32 }} />
            <Footer />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}
