import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Body } from './Text';
import { useTheme } from './ThemeProvider';

/**
 * The marker on the routine in use: a tick and "Active", with no edge or fill, so it reads as a state and never as a
 * button beside the Set active pills. The tick is the one the bar picker uses for its choice. Not red: red is for the
 * wordmark, the active tab and PRs.
 */
export function ActiveBadge() {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel="Active" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingRight: 4 }}>
      <Ionicons name="checkmark" size={20} color={colors.text} />
      <Body weight={600}>Active</Body>
    </View>
  );
}
