import type { ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeProvider';

/**
 * The panel the rest row and the work clock share (Task 7b: the work clock is the rest row's twin): a surface panel
 * with a Strong Seam edge, its time on the left and its pills wrapping at the right. `minHeight` holds the height it had
 * while running once it shows its end line, so the rows below don't jump. The caller sets the outer margins.
 */
export function ClockPanel({
  children,
  minHeight,
  onLayout,
  margins,
}: {
  children: ReactNode;
  minHeight: number | undefined;
  onLayout: ((e: LayoutChangeEvent) => void) | undefined;
  margins: Pick<ViewStyle, 'marginTop' | 'marginBottom' | 'marginVertical'>;
}) {
  const { colors } = useTheme();
  return (
    <View
      onLayout={onLayout}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        columnGap: 8,
        // The pills' 4pt hitSlops, stacked on two lines, must not overlap.
        rowGap: 8,
        minHeight,
        ...margins,
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

/**
 * The panel's pills, wrapped as one group at the end, so one never sits alone on the second line; when the group alone
 * is wider than the panel (AX2 on 320pt), it wraps inside itself rather than being clipped.
 */
export function ClockPills({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        rowGap: 8,
        columnGap: 8,
        maxWidth: '100%',
        flexShrink: 0,
      }}
    >
      {children}
    </View>
  );
}

/** The panel's 3pt text-colour track along its foot: `fraction` (0 to 1) of the width. Hidden from VoiceOver. */
export function ClockTrack({ fraction }: { fraction: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        height: 3,
        width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
        backgroundColor: colors.text,
      }}
    />
  );
}
