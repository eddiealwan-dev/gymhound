import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { finishedWorkoutCount } from '../../../src/db/repositories/onboardingRepo';
import { workoutCountText } from '../../../src/domain/profile';
import { deviceLocale } from '../../../src/platform/locale';
import { useDbQuery } from '../../../src/state/dataVersion';
import { Avatar, useProfile } from '../../../src/ui/profile/Avatar';
import { Dashboard } from '../../../src/ui/profile/Dashboard';
import { Screen } from '../../../src/ui/Screen';
import { Body, Display, ScreenTitle } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';

/**
 * The Profile (R566, R567), opened from the header's Profile button: a card with the photo, name, finished workouts and
 * goal, which opens Edit profile, then the dashboard.
 */
export default function Profile() {
  const { colors } = useTheme();
  const profile = useProfile();
  const workouts = useDbQuery(finishedWorkoutCount);
  const count = workoutCountText(workouts, deviceLocale());
  const named = profile.name !== '';
  const spoken = [named ? profile.name : 'No name yet', count, profile.goal !== '' ? `Goal: ${profile.goal}` : null].filter((x) => x !== null).join('. ');
  // Past 1.3× text the words take the card's whole width under the photo, rather than a sliver beside it (R562).
  const stacked = useWindowDimensions().fontScale > 1.3;
  const chevron = <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />;
  const words = (
    <View style={{ flex: stacked ? undefined : 1, minWidth: 0, gap: 2 }}>
      {named ? (
        <Display weight={700} style={{ fontSize: 26 }}>
          {profile.name}
        </Display>
      ) : (
        <Body weight={600}>Add your name and a goal</Body>
      )}
      <Body muted>{count}</Body>
      {profile.goal !== '' ? <Body style={{ marginTop: 4 }}>{profile.goal}</Body> : null}
    </View>
  );

  return (
    <Screen footer>
      <ScreenTitle>Profile</ScreenTitle>
      <View style={{ gap: 32, marginTop: 24 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit profile. ${spoken}`}
          onPress={() => router.push('/profile/edit')}
          style={({ pressed }) => ({
            flexDirection: stacked ? 'column' : 'row',
            alignItems: stacked ? 'stretch' : 'center',
            gap: 16,
            padding: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {stacked ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Avatar size={72} photo={profile.photo} name={profile.name} />
                {chevron}
              </View>
              {words}
            </>
          ) : (
            <>
              <Avatar size={72} photo={profile.photo} name={profile.name} />
              {words}
              {chevron}
            </>
          )}
        </Pressable>
        <Dashboard widgets={profile.widgets} weeklyGoal={profile.weeklyGoal} />
      </View>
    </Screen>
  );
}
