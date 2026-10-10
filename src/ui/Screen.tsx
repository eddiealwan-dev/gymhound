import { ScrollView, View } from 'react-native';
import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { useTheme } from './ThemeProvider';

/** A scrolling page: 16px gutters, content capped at 512px and centred. `footer` adds the GruntHound line at the end. */
export function Screen({ children, footer = false }: { children: ReactNode; footer?: boolean }) {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: 512, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: footer ? 0 : 16 }}>
        {children}
        {footer ? <Footer /> : null}
      </View>
    </ScrollView>
  );
}
