import { Pressable } from 'react-native';
import { Body } from './Text';
import { useTheme } from './ThemeProvider';

type Variant = 'primary' | 'secondary' | 'quiet';

/** Regular is the full 48pt button. Compact is 36pt with a 4pt hitSlop, which keeps the 44pt target. */
export type ButtonSize = 'regular' | 'compact';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: ButtonSize;
  /** For one choice among several: whether it is the current one, which the screen reader then says. */
  selected?: boolean;
  /** Ignores presses and shows faded; the screen reader says it is dimmed. */
  disabled?: boolean;
  /** What the screen reader says instead of the label, when the label alone is ambiguous. */
  accessibilityLabel?: string;
  /** Caps how far the label grows with the phone's text size. */
  maxFontSizeMultiplier?: number;
};

/** Primary is filled with `text` and labelled in `bg`. Secondary is outlined. Quiet has no chrome. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  selected,
  disabled = false,
  accessibilityLabel,
  maxFontSizeMultiplier,
}: Props) {
  const { colors } = useTheme();
  const compact = size === 'compact';
  const fill = variant === 'primary' ? colors.text : 'transparent';
  const border = variant === 'secondary' ? (compact ? colors.borderStrong : colors.border) : 'transparent';
  const labelColor = variant === 'primary' ? colors.bg : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      disabled={disabled}
      hitSlop={compact ? 4 : undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: compact ? 36 : 48,
        paddingHorizontal: compact ? 12 : 20,
        borderRadius: compact ? 18 : 12,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: fill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <Body weight={600} maxFontSizeMultiplier={maxFontSizeMultiplier} style={compact ? { color: labelColor, fontSize: 15 } : { color: labelColor }}>
        {label}
      </Body>
    </Pressable>
  );
}
