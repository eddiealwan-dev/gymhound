import { Ionicons } from '@expo/vector-icons';
import type { ReactElement } from 'react';
import { Image, Platform, View } from 'react-native';
import { getSettings } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { dashboardWidgets, initials, type WidgetId } from '../../domain/profile';
import { profilePhotoExists, profilePhotoUri } from '../../platform/profilePhotoFile';
import { useDbQuery } from '../../state/dataVersion';
import { Display } from '../Text';
import { useTheme } from '../ThemeProvider';

export type Profile = { name: string; goal: string; photo: string | null; widgets: WidgetId[]; weeklyGoal: number | null };

/** The profile as the screens show it (R566). A photo whose file is gone (a restored snapshot), or any photo on the web, is none. */
export function readProfile(db: Db): Profile {
  const s = getSettings(db);
  const photo = s.profilePhoto !== null && Platform.OS !== 'web' && profilePhotoExists(s.profilePhoto) ? s.profilePhoto : null;
  return { name: s.profileName, goal: s.profileGoal, photo, widgets: dashboardWidgets(s.profileWidgets), weeklyGoal: s.weeklyWorkoutGoal };
}

export function useProfile(): Profile {
  return useDbQuery(readProfile);
}

/**
 * The profile photo in a circle `size` across (R566), or its stand-in on the raised surface: the name's initials in
 * Barlow, or with no name the person glyph. Decorative: whatever holds it names it.
 */
export function Avatar({ size, photo, name, plain = false }: { size: number; photo: string | null; name: string; plain?: boolean }): ReactElement {
  const { colors } = useTheme();
  const letters = initials(name);
  const circle = { width: size, height: size, borderRadius: size / 2 };
  // `plain`: the header's button, drawn as the Settings button beside it is (surface, text-colour glyph).
  const fill = plain ? colors.surface : colors.surfaceRaised;
  const ink = plain ? colors.text : colors.textMuted;
  if (photo !== null) {
    return (
      <Image
        testID="profile-photo"
        accessible={false}
        source={{ uri: profilePhotoUri(photo) }}
        style={{ ...circle, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}
      />
    );
  }
  return (
    <View
      testID="profile-photo-standin"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ ...circle, backgroundColor: fill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
    >
      {letters !== '' ? (
        // Inside a fixed circle: the letters keep their size at large text, which the name beside it shows.
        <Display weight={700} allowFontScaling={false} style={{ fontSize: Math.round(size * 0.42), color: ink }}>
          {letters}
        </Display>
      ) : (
        <Ionicons name={plain ? 'person-outline' : 'person'} size={plain ? 22 : Math.round(size * 0.5)} color={ink} />
      )}
    </View>
  );
}
