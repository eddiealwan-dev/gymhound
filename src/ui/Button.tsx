import { Pressable } from 'react-native';
import { Body } from './Text';
import { useTheme } from './ThemeProvider';

type Variant = 'primary' | 'secondary' | 'quiet';

type Props = { label: string; onPress: () => void; variant?: Variant };

/** Primary is filled with `text` and labelled in `bg`. Secondary is outlined. Quiet has no chrome. */
export function Button({ label, onPress, variant = 'primary' }: Props) {
  const { colors } = useTheme();
  const fill = variant === 'primary' ? colors.text : 'transparent';
  const border = variant === 'secondary' ? colors.border : 'transparent';
  const labelColor = variant === 'primary' ? colors.bg : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
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
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Body weight={600} style={{ color: labelColor }}>
        {label}
      </Body>
    </Pressable>
  );
}
