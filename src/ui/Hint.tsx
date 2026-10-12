import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';
import { Body } from './Text';
import { useTheme } from './ThemeProvider';

/**
 * A one-time first-run line (§18.15, R407, R408): a card (surface, Seam edge, 16pt corners) holding one body sentence
 * and a 44pt × that dismisses it for good, as the Short on food banner's × does. No red, no icon of its own. The
 * sentence wraps with the phone's text size and the × stays at its right. `spoken` replaces the sentence for VoiceOver
 * where a glyph in it (⋯) would be read badly.
 */
export function Hint({
  text,
  spoken,
  onDismiss,
  style,
}: {
  text: string;
  spoken?: string;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      testID="hint"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 8,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 16,
          paddingLeft: 16,
          paddingRight: 4,
          paddingVertical: 4,
        },
        style,
      ]}
    >
      {/* The row's 4pt and these 8pt put the words 12pt in from the top, level with the × on their first line. */}
      <Body accessibilityLabel={spoken} style={{ flex: 1, minWidth: 0, paddingVertical: 8 }}>
        {text}
      </Body>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss tip"
        accessibilityHint="It won't show again"
        onPress={onDismiss}
        style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
      >
        <Ionicons name="close" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}
