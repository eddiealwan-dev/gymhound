import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { Display } from './Text';
import { useTheme } from './ThemeProvider';

/**
 * The top of an editor that rises as a modal (your own exercise, your own food, and their locked forms): the title as
 * a heading, and a 44pt Close (×) on the right whose glyph ends on the gutter, 24pt over the form. One component, so
 * the editors keep one header (R357).
 */
export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -8, marginBottom: 24 }}>
      <Display weight={700} accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </Display>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={4}
        onPress={onClose}
        style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
      >
        <Ionicons name="close" size={28} color={colors.text} />
      </Pressable>
    </View>
  );
}
