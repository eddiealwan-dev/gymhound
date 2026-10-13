import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { leaveGuarded } from '../../state/leaveGuard';
import { useTheme } from '../ThemeProvider';
import { Avatar, useProfile } from './Avatar';

/** Closes the Profile by going back to where it was opened from; with nothing behind it, Train. */
function closeProfile() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * The header's Profile button (R566), left of Settings: the profile photo in a 40pt circle, else the name's initials,
 * else the person glyph, drawn as Settings is. On the Profile it is Close, as Settings' button is on Settings.
 */
export function ProfileButton({ onProfile }: { onProfile: boolean }) {
  const { colors } = useTheme();
  const profile = useProfile();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={onProfile ? 'Close profile' : 'Profile'}
      hitSlop={4}
      // A screen with unsaved changes (the routine editor) asks before it is left, as Settings does (R89).
      onPress={onProfile ? closeProfile : () => leaveGuarded(() => router.push('/profile'))}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, opacity: pressed ? 0.8 : 1 })}
    >
      {onProfile ? (
        <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={22} color={colors.text} />
        </View>
      ) : (
        <Avatar size={40} photo={profile.photo} name={profile.name} plain />
      )}
    </Pressable>
  );
}
