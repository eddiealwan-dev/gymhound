import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { leaveGuarded } from '../state/leaveGuard';
import { Body } from './Text';
import { useTheme } from './ThemeProvider';

/** A tab: its route, and the screens opened from it that keep it highlighted (`within`). */
type Item = { route: string; label: string; icon: keyof typeof Ionicons.glyphMap; within?: string[] };

/**
 * The four fixed tabs. A body detail is opened from Stats, so Stats stays highlighted there. Any other route (Settings,
 * Routines and a saved workout) is reached from elsewhere and highlights nothing.
 */
const ITEMS: Item[] = [
  { route: 'index', label: 'Train', icon: 'barbell-outline' },
  { route: 'history/index', label: 'History', icon: 'time-outline' },
  { route: 'stats', label: 'Stats', icon: 'stats-chart-outline', within: ['body/[kind]'] },
  { route: 'fuel', label: 'Fuel', icon: 'nutrition-outline' },
];

/**
 * The bottom tab bar. The focused tab's icon and label are red, the rest are muted. On a screen within a tab, tapping
 * the tab goes back to it.
 */
export function Dock({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const focusedName = state.routes[state.index]?.name;

  return (
    <View style={{ backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: insets.bottom }}>
      <View style={{ width: '100%', maxWidth: 512, alignSelf: 'center', flexDirection: 'row' }}>
        {ITEMS.map((item) => {
          const route = state.routes.find((r) => r.name === item.route);
          if (!route) return null;
          const onTab = focusedName === item.route;
          const focused = onTab || (focusedName !== undefined && (item.within ?? []).includes(focusedName));
          const color = focused ? colors.red : colors.textMuted;
          // A screen with unsaved changes (the routine editor) asks before it is left.
          const onPress = () =>
            leaveGuarded(() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!onTab && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            });
          return (
            <Pressable
              key={item.route}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={({ pressed }) => ({ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: pressed ? 0.8 : 1 })}
            >
              <Ionicons name={item.icon} size={24} color={color} />
              <Body weight={600} style={{ fontSize: 12, color }}>
                {item.label}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
