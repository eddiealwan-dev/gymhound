import { ScrollView, View } from 'react-native';
import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { useTheme } from './ThemeProvider';

/**
 * A scrolling page: 16px gutters, content capped at 512px and centred.
 * `footer` adds the GruntHound footer. On a short page a flexible spacer (FieldHound's `.home-spacer`, at least 32px) pushes it to the bottom of the visible area; on a long page it follows the content.
 */
export function Screen({ children, footer = false }: { children: ReactNode; footer?: boolean }) {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
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
