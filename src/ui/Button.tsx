import { Pressable } from 'react-native';
import { Body } from './Text';
import { useTheme } from './ThemeProvider';

type Variant = 'primary' | 'secondary' | 'quiet';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** For one choice among several: whether it is the current one, which the screen reader then says. */
  selected?: boolean;
  /** Ignores presses and shows faded; the screen reader says it is dimmed. */
  disabled?: boolean;
};

/** Primary is filled with `text` and labelled in `bg`. Secondary is outlined. Quiet has no chrome. */
export function Button({ label, onPress, variant = 'primary', selected, disabled = false }: Props) {
  const { colors } = useTheme();
  const fill = variant === 'primary' ? colors.text : 'transparent';
  const border = variant === 'secondary' ? colors.border : 'transparent';
  const labelColor = variant === 'primary' ? colors.bg : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: fill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <Body weight={600} style={{ color: labelColor }}>
        {label}
      </Body>
    </Pressable>
  );
}
