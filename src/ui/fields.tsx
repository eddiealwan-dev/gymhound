import { TextInput } from 'react-native';
import { Body } from './Text';
import { fonts } from './theme';
import { useTheme } from './ThemeProvider';

/**
 * "Check this number" under a field. The caller announces it on both phones, so it has no live region: TalkBack would
 * read it a second time.
 */
export function CheckLine({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return <Body muted>Check this number</Body>;
}

/**
 * The compact number field the body, water and Fuel screens share: Barlow, centred, a heavier muted underline when the
 * number needs a look.
 */
export function BodyField({
  value,
  onChangeText,
  onSubmit,
  accessibilityLabel,
  invalid,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  accessibilityLabel: string;
  invalid: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmit}
      keyboardType="decimal-pad"
      // iOS adds its own Done bar above the number pad with this key (R43).
      returnKeyType="done"
      accessibilityLabel={accessibilityLabel}
      // Capped so a value like "182.5" stays whole in the field at the largest text size.
      maxFontSizeMultiplier={1.5}
      style={{
        minWidth: 112,
        minHeight: 44,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        // Red is reserved, so a number that needs another look gets a heavier muted underline.
        ...(invalid ? { borderBottomWidth: 2, borderBottomColor: colors.textMuted } : null),
        backgroundColor: colors.surface,
        color: colors.text,
        fontFamily: fonts.display700,
        fontSize: 20,
        fontVariant: ['tabular-nums'],
        textAlign: 'center',
      }}
    />
  );
}
