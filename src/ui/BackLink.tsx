import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Body } from './Text';
import { useTheme } from './ThemeProvider';

/**
 * The chevron and the name of where it goes, above a screen's title ("Train" on Routines, "Routines" on a routine).
 * The screen reader hears "Back to {label}".
 */
export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        minWidth: 44,
        minHeight: 44,
        // The chevron's own whitespace sits in the gutter, so the glyph lines up with the title below.
        marginLeft: -8,
        paddingRight: 8,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name="chevron-back" size={28} color={colors.text} />
      <Body weight={600} style={{ flexShrink: 1 }}>
        {label}
      </Body>
    </Pressable>
  );
}
