import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HoundMark } from './HoundMark';
import { Display } from './Text';
import { useTheme } from './ThemeProvider';

/** Closes Settings by going back to the tab it was opened from. With nothing to go back to (Settings opened by address, or after a reload), it lands on Train. */
function closeSettings() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** The hound mark and the red GYMHOUND wordmark, with Settings (or, on Settings, Close) on the right. */
export function Header() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const onSettings = usePathname() === '/settings';

  return (
    <View style={{ backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View
        style={{
          width: '100%',
          maxWidth: 512,
          alignSelf: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <HoundMark size={40} />
          <Display weight={800} upper allowFontScaling={false} style={{ color: colors.red, fontSize: 32, letterSpacing: -0.5 }} numberOfLines={1}>
            GYMHOUND
          </Display>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={onSettings ? 'Close settings' : 'Settings'}
          hitSlop={4}
          onPress={onSettings ? closeSettings : () => router.push('/settings')}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name={onSettings ? 'close' : 'settings-outline'} size={22} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}
