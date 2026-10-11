import { Switch } from 'react-native';
import { switchColors } from './theme';
import { useTheme } from './ThemeProvider';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** What the screen reader calls it: the words beside it. */
  accessibilityLabel: string;
};

/**
 * A switch in the theme's colours (`switchColors`), readable in both themes and never red. Used on Settings and in the
 * routine editor.
 */
export function Toggle({ value, onValueChange, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const { thumb, trackOn, trackOff } = switchColors(colors);
  return (
    <Switch
      accessibilityLabel={accessibilityLabel}
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: trackOff, true: trackOn }}
      // iOS shows the off track through `ios_backgroundColor`.
      ios_backgroundColor={trackOff}
      thumbColor={thumb}
      // react-native-web colours the thumb of a switch that is on from `activeThumbColor` (React Native has only
      // `thumbColor`) and would leave it teal. The phone ignores the extra prop.
      {...({ activeThumbColor: thumb } as object)}
    />
  );
}
