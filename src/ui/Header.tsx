import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { leaveGuarded } from '../state/leaveGuard';
import { HoundMark } from './HoundMark';
import { ProfileButton } from './profile/ProfileButton';
import { Display } from './Text';
import { useTheme } from './ThemeProvider';

/** Closes Settings by going back to the tab it was opened from. With nothing to go back to (Settings opened by address, or after a reload), it lands on Train. */
function closeSettings() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Below this width (a 320pt phone, Display Zoom) the hound and the round buttons are drawn smaller (ruling R-g2). */
const NARROW = 360;

/**
 * The header's round buttons' sizes and targets. Narrow, they are 36pt, 8pt apart: each reaches 4pt past its edge, so
 * it is a 44pt target, and the two reaches meet in the gap without overlapping.
 */
function roundButtonSize(width: number): { size: number; slop: number; gap: number } {
  return width < NARROW ? { size: 36, slop: 4, gap: 8 } : { size: 40, slop: 4, gap: 8 };
}

/**
 * The hound mark and the red GYMHOUND wordmark, with Profile and Settings on the right (each Close on its own page).
 * The wordmark is one line at a fixed size at every width and never cut (PRODUCT.md): on a phone under 360pt the hound
 * is 40pt and the round buttons 36pt (still 44pt targets) so it fits (design gate #13, ruling R-g2).
 */
export function Header() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const onSettings = path === '/settings';
  const onProfile = path === '/profile' || path.startsWith('/profile/');
  const { width } = useWindowDimensions();
  const narrow = width < NARROW;
  const round = roundButtonSize(width);

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
        <View testID="header-lockup" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0, marginRight: narrow ? 8 : 12 }}>
          <HoundMark size={narrow ? 40 : 48} />
          {/* Fixed and whole: no text scaling, no shrinking, no ellipsis (PRODUCT.md's one-line wordmark). */}
          <Display weight={800} upper allowFontScaling={false} style={{ color: colors.red, fontSize: 38, letterSpacing: -0.5, flexShrink: 0 }}>
            GYMHOUND
          </Display>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: round.gap }}>
          <ProfileButton onProfile={onProfile} size={round.size} hitSlop={round.slop} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={onSettings ? 'Close settings' : 'Settings'}
            hitSlop={{ top: round.slop, bottom: round.slop, left: round.slop, right: round.slop }}
            // A screen with unsaved changes (the routine editor) asks before it is left.
            onPress={onSettings ? closeSettings : () => leaveGuarded(() => router.push('/settings'))}
            style={({ pressed }) => ({
              width: round.size,
              height: round.size,
              borderRadius: round.size / 2,
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
    </View>
  );
}
