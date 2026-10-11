import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useDb } from '../../../src/db/DbProvider';
import { listRoutines, setActiveRoutine } from '../../../src/db/repositories/routinesRepo';
import type { RoutineSummary } from '../../../src/db/repositories/routinesRepo';
import { getActiveWorkoutId } from '../../../src/db/repositories/workoutsRepo';
import { bumpData, useDbQuery } from '../../../src/state/dataVersion';
import { ActiveBadge } from '../../../src/ui/ActiveBadge';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { useRoutineLimit } from '../../../src/ui/RoutineLimit';
import { Screen } from '../../../src/ui/Screen';
import { Body, Display, Label } from '../../../src/ui/Text';
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

/**
 * Routines (§8.6): the premades, then your own with **New routine**. A routine opens its detail. While a workout runs,
 * the routine can't change: Set active says to finish or discard it first (R80), rather than changing a routine Train
 * won't show until then. New routine keeps to the free limit (R88).
 */
export default function Routines() {
  const db = useDb();
  const routines = useDbQuery(listRoutines);
  const premade = routines.filter((routine) => routine.isPremade);
  const yours = routines.filter((routine) => !routine.isPremade);
  const [blocked, setBlocked] = useState(false);
  const limit = useRoutineLimit();

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
      <Display>Routines</Display>
      {/* The group heading Settings uses, so "Premade" reads as a heading and not as a routine's name. */}
      <Label style={{ marginTop: 24, marginBottom: 8 }}>Premade</Label>
      <View style={{ gap: 8 }}>{premade.map(row)}</View>
      <Label style={{ marginTop: 32, marginBottom: 8 }}>Yours</Label>
      <View style={{ gap: 8 }}>
        {yours.map(row)}
        <Button label="New routine" variant="secondary" onPress={() => limit.whenRoomFor(() => router.push('/routines/edit/new'))} />
      </View>
      <WorkoutInProgressSheet visible={blocked} onClose={() => setBlocked(false)} />
      {limit.sheets}
    </Screen>
  );
}
