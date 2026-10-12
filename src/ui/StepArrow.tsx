import { Pressable } from 'react-native';
import { Display } from './Text';

/**
 * A 44pt ‹ or › that steps a date (R354): Fuel's day and History's month. The glyph is Barlow 700 at 32pt in the text
 * colour; pressed it drops to 0.8 and, at the end of the range, it fades to 0.4, is read as dimmed and ignores presses,
 * as every disabled control does.
 */
export function StepArrow({ glyph, label, disabled, onPress }: { glyph: '‹' | '›'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? () => undefined : onPress}
      style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}
    >
      <Display weight={700} style={{ fontSize: 32, lineHeight: 36 }}>
        {glyph}
      </Display>
    </Pressable>
  );
}
