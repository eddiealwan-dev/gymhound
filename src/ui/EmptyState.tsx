import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { Button } from './Button';
import { Body } from './Text';

export type EmptyAction = {
  label: string;
  onPress: () => void;
  /** What the screen reader says instead of the label, when the label alone is ambiguous. */
  accessibilityLabel?: string;
};

/**
 * What a list or screen with nothing in it says (§18.15, R401): one muted line saying what will show here and how it
 * gets there, then at most one action, a compact secondary pill 12pt under it, as Stats' Show steps and Add a photo
 * already were. The line wraps with the phone's text size. A screen whose next step is already a button beside the
 * line (Fuel's Add food, Routines' New routine) passes no action.
 */
export function EmptyState({ text, action, style }: { text: string; action?: EmptyAction; style?: StyleProp<ViewStyle> }) {
  return (
    <View testID="empty-state" style={[{ gap: 12 }, style]}>
      <Body muted>{text}</Body>
      {action ? (
        // 4pt inset keeps the pill's 4pt hit slop inside the section. Not a row, so a long label wraps inside the pill
        // instead of running off the screen.
        <View style={{ alignItems: 'flex-start', padding: 4, margin: -4 }}>
          <Button label={action.label} variant="secondary" size="compact" accessibilityLabel={action.accessibilityLabel} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}
