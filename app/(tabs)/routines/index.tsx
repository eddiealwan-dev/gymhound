import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useDb } from '../../../src/db/DbProvider';
import { listRoutines, setActiveRoutine } from '../../../src/db/repositories/routinesRepo';
import type { RoutineSummary } from '../../../src/db/repositories/routinesRepo';
import { getActiveWorkoutId } from '../../../src/db/repositories/workoutsRepo';
import { bumpData, useDbQuery } from '../../../src/state/dataVersion';
import { Button } from '../../../src/ui/Button';
import { Screen } from '../../../src/ui/Screen';
import { Body, Display } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';
import { WorkoutInProgressSheet } from '../../../src/ui/WorkoutInProgressSheet';

/** Back to where Routines was opened from (Train). With nothing to go back to (opened by address, or reloaded), it lands on Train. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/');
}

/** The chevron and "Train" above the title. Routines is not on the dock, so this is the way back. */
function BackToTrain() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to Train"
      hitSlop={4}
      onPress={leave}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        minWidth: 44,
        minHeight: 44,
        // The chevron's own whitespace sits in the gutter, so the glyph lines up with the title below.
        marginLeft: -8,
        paddingRight: 8,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name="chevron-back" size={28} color={colors.text} />
      <Body weight={600}>Train</Body>
    </Pressable>
  );
}

/** The marker on the routine in use. Not a button, and not red: red is for the wordmark, the active tab and PRs. */
function ActiveBadge() {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 14, paddingVertical: 8 }}>
      <Body weight={600}>Active</Body>
    </View>
  );
}

function RoutineRow({ routine, onSetActive }: { routine: RoutineSummary; onSetActive: () => void }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 80,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body weight={600}>{routine.name}</Body>
        <Body muted style={{ fontSize: 14 }}>
          {routine.dayCount === 1 ? '1 day' : `${routine.dayCount} days`}
        </Body>
      </View>
      {routine.isActive ? <ActiveBadge /> : <Button label="Set active" variant="secondary" onPress={onSetActive} />}
    </View>
  );
}

/**
 * The premade routines, each with a way to make it the active one. Your own routines arrive in a later task. While a
 * workout runs, the routine can't change: Set active says to finish or discard it first (R80), rather than changing a
 * routine Train won't show until then.
 */
export default function Routines() {
  const db = useDb();
  const premade = useDbQuery(listRoutines).filter((routine) => routine.isPremade);
  const [blocked, setBlocked] = useState(false);
  return (
    <Screen>
      <BackToTrain />
      <Display>Routines</Display>
      <Body weight={600} muted style={{ marginTop: 16, marginBottom: 8 }}>
        Premade
      </Body>
      <View style={{ gap: 8 }}>
        {premade.map((routine) => (
          <RoutineRow
            key={routine.id}
            routine={routine}
            onSetActive={() => {
              if (getActiveWorkoutId(db) !== null) {
                setBlocked(true);
                return;
              }
              setActiveRoutine(db, routine.id);
              bumpData();
            }}
          />
        ))}
      </View>
      <WorkoutInProgressSheet visible={blocked} onClose={() => setBlocked(false)} />
    </Screen>
  );
}
