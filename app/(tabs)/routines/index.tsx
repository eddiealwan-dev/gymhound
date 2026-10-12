import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useDb } from '../../../src/db/DbProvider';
import { listRoutines, setActiveRoutine } from '../../../src/db/repositories/routinesRepo';
import type { RoutineSummary } from '../../../src/db/repositories/routinesRepo';
import { listSavedWorkouts } from '../../../src/db/repositories/savedWorkoutsRepo';
import type { SavedWorkoutSummary } from '../../../src/db/repositories/savedWorkoutsRepo';
import { getActiveWorkoutId } from '../../../src/db/repositories/workoutsRepo';
import { bumpData, useDbQuery } from '../../../src/state/dataVersion';
import { ActiveBadge } from '../../../src/ui/ActiveBadge';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { useRoutineLimit } from '../../../src/ui/RoutineLimit';
import { Screen } from '../../../src/ui/Screen';
import { useStartSaved } from '../../../src/ui/StartSaved';
import { Body, Label, ScreenTitle } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';
import { WorkoutInProgressSheet } from '../../../src/ui/WorkoutInProgressSheet';

/** Back to where Routines was opened from (Train). With nothing to go back to (opened by address, or reloaded), it lands on Train. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/');
}

const dayCount = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/**
 * A routine: its name and days, which open its detail (the chevron says so), and Set active as a compact pill (36pt
 * with a 4pt hit slop, a 44pt target), the size of a row's own action elsewhere (the rest pills, Finish); the routine
 * in use shows the Active mark instead. The pill is beside the name, never inside it, so the screen reader reaches both.
 */
function RoutineRow({ routine, onSetActive }: { routine: RoutineSummary; onSetActive: () => void }) {
  const { colors } = useTheme();
  const days = dayCount(routine.dayCount);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${routine.name}, ${days}`}
        onPress={() => router.push(`/routines/${routine.id}`)}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight={600}>{routine.name}</Body>
          <Body muted style={{ fontSize: 14 }}>
            {days}
          </Body>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      {routine.isActive ? <ActiveBadge /> : <Button label="Set active" variant="secondary" size="compact" onPress={onSetActive} />}
    </View>
  );
}

const exerciseCount = (n: number) => (n === 1 ? '1 exercise' : `${n} exercises`);

/**
 * A saved workout (R122): its name and how many exercises, which open its detail, and Start as a compact pill beside
 * it, as Set active is on a routine.
 */
function SavedRow({ saved, onStart }: { saved: SavedWorkoutSummary; onStart: () => void }) {
  const { colors } = useTheme();
  const count = exerciseCount(saved.exerciseCount);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${saved.name}, ${count}`}
        onPress={() => router.push(`/saved/${saved.id}`)}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight={600}>{saved.name}</Body>
          <Body muted style={{ fontSize: 14 }}>
            {count}
          </Body>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      <Button label="Start" variant="secondary" size="compact" accessibilityLabel={`Start ${saved.name}`} onPress={onStart} />
    </View>
  );
}

/**
 * Routines (§8.6): the premades, then your own with **New routine**. A routine opens its detail. While a workout runs,
 * the routine can't change: Set active says to finish or discard it first (R80), rather than changing a routine Train
 * won't show until then. New routine keeps to the free limit (R88). Saved workouts follow (R122): they are free and
 * don't count toward the limit (R118); Start waits for a workout in progress too.
 */
export default function Routines() {
  const db = useDb();
  const routines = useDbQuery(listRoutines);
  const premade = routines.filter((routine) => routine.isPremade);
  const yours = routines.filter((routine) => !routine.isPremade);
  const [blocked, setBlocked] = useState(false);
  const limit = useRoutineLimit();
  const saved = useDbQuery(listSavedWorkouts);
  const starter = useStartSaved();

  const setActive = (id: string) => {
    if (getActiveWorkoutId(db) !== null) {
      setBlocked(true);
      return;
    }
    setActiveRoutine(db, id);
    bumpData();
  };

  const row = (routine: RoutineSummary) => <RoutineRow key={routine.id} routine={routine} onSetActive={() => setActive(routine.id)} />;

  return (
    <Screen>
      {/* Routines is not on the dock, so this is the way back. */}
      <BackLink label="Train" onPress={leave} />
      <ScreenTitle>Routines</ScreenTitle>
      {/* The group heading Settings uses, so "Premade" reads as a heading and not as a routine's name. */}
      <Label style={{ marginTop: 24, marginBottom: 8 }}>Premade</Label>
      <View style={{ gap: 8 }}>{premade.map(row)}</View>
      <Label style={{ marginTop: 32, marginBottom: 8 }}>Yours</Label>
      <View style={{ gap: 8 }}>
        {yours.map(row)}
        <Button label="New routine" variant="secondary" onPress={() => limit.whenRoomFor(() => router.push('/routines/edit/new'))} />
      </View>
      <Label style={{ marginTop: 32, marginBottom: 8 }}>Saved workouts</Label>
      {saved.length === 0 ? (
        <Body muted>Finish a workout and tap Save as a workout to keep it here.</Body>
      ) : (
        <View style={{ gap: 8 }}>
          {saved.map((w) => (
            <SavedRow key={w.id} saved={w} onStart={() => starter.start(w.id)} />
          ))}
        </View>
      )}
      <WorkoutInProgressSheet visible={blocked} onClose={() => setBlocked(false)} />
      {starter.sheet}
      {limit.sheets}
    </Screen>
  );
}
