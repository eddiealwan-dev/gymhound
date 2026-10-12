import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { listRoutines } from '../../../src/db/repositories/routinesRepo';
import type { RoutineSummary } from '../../../src/db/repositories/routinesRepo';
import { listSavedWorkouts } from '../../../src/db/repositories/savedWorkoutsRepo';
import type { SavedWorkoutSummary } from '../../../src/db/repositories/savedWorkoutsRepo';
import { useDbQuery } from '../../../src/state/dataVersion';
import { ActiveBadge } from '../../../src/ui/ActiveBadge';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { EmptyState } from '../../../src/ui/EmptyState';
import { useRoutineLimit } from '../../../src/ui/RoutineLimit';
import { RoutineOptionsSheet, useRoutineActions } from '../../../src/ui/routines/useRoutineActions';
import { canUseRoutine, canUseSavedWorkouts } from '../../../src/domain/routineLimit';
import { useIsPro } from '../../../src/platform/entitlements';
import { Screen } from '../../../src/ui/Screen';
import { useStartSaved } from '../../../src/ui/StartSaved';
import { Body, Label, ScreenTitle } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';

/** Back to where Routines was opened from (Train). With nothing to go back to (opened by address, or reloaded), it lands on Train. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/');
}

/** Under the title while no routine is in use (R403). */
const PICK_ONE = 'Set one active and Train lines up its next workout.';

/** Over New routine while you have none of your own (R401). */
const YOURS_EMPTY = 'Routines you make or duplicate show here.';

const dayCount = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/**
 * A routine: its name and days, which open its detail (the chevron says so), and Set active as a compact pill (36pt
 * with a 4pt hit slop, a 44pt target), the size of a row's own action elsewhere (the rest pills, Finish); the routine
 * in use shows the Active mark instead. The pill is beside the name, never inside it, so the screen reader reaches both.
 * ⋯ at the end opens the routine's options (R542).
 */
function RoutineRow({
  routine,
  locked,
  onSetActive,
  onOptions,
}: {
  routine: RoutineSummary;
  locked: boolean;
  onSetActive: () => void;
  onOptions: () => void;
}) {
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
      {/* A program outside free, or a routine of your own kept after Pro ends, says Pro where Set active would be (R525). */}
      {routine.isActive && !locked ? (
        <ActiveBadge />
      ) : (
        <Button
          label={locked ? 'Pro' : 'Set active'}
          variant="secondary"
          size="compact"
          accessibilityLabel={locked ? `${routine.name} is part of GymHound Pro` : undefined}
          onPress={onSetActive}
        />
      )}
      {/* Everything the routine's page offers, without opening it or holding the row (Round 9, R542). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Options for ${routine.name}`}
        onPress={onOptions}
        hitSlop={4}
        style={({ pressed }) => ({ width: 36, height: 44, marginRight: -8, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const exerciseCount = (n: number) => (n === 1 ? '1 exercise' : `${n} exercises`);

/**
 * A saved workout (R122): its name and how many exercises, which open its detail, and Start as a compact pill beside
 * it, as Set active is on a routine.
 */
function SavedRow({ saved, locked, onStart }: { saved: SavedWorkoutSummary; locked: boolean; onStart: () => void }) {
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
      {/* Saved workouts are Pro (R521): without it the pill says so, as a Pro program's does (Round 10 note). */}
      <Button
        label={locked ? 'Pro' : 'Start'}
        variant="secondary"
        size="compact"
        accessibilityLabel={locked ? `${saved.name} is part of GymHound Pro` : `Start ${saved.name}`}
        onPress={onStart}
      />
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
  const routines = useDbQuery(listRoutines);
  const premade = routines.filter((routine) => routine.isPremade);
  const yours = routines.filter((routine) => !routine.isPremade);
  const noneActive = !routines.some((routine) => routine.isActive);
  const limit = useRoutineLimit();
  const saved = useDbQuery(listSavedWorkouts);
  const starter = useStartSaved();
  const pro = useIsPro();
  const actions = useRoutineActions();
  /** The routine whose ⋯ sheet is open. */
  const [options, setOptions] = useState<RoutineSummary | null>(null);

  const row = (routine: RoutineSummary) => (
    <View key={routine.id} style={{ gap: 4 }}>
      <RoutineRow
        routine={routine}
        locked={!canUseRoutine(routine, pro)}
        onSetActive={() => actions.setActive(routine)}
        onOptions={() => setOptions(routine)}
      />
      {actions.failed?.routineId === routine.id ? <Body muted>{actions.failed.text}</Body> : null}
    </View>
  );


  return (
    <Screen>
      {/* Routines is not on the dock, so this is the way back. */}
      <BackLink label="Train" onPress={leave} />
      <ScreenTitle>Routines</ScreenTitle>
      {/* Until one is in use, say what Set active does (R403): the first run arrives here from Train's Choose a routine. */}
      {noneActive ? (
        <Body muted style={{ marginTop: 4 }}>
          {PICK_ONE}
        </Body>
      ) : null}
      {/* The group heading Settings uses, so "Premade" reads as a heading and not as a routine's name. */}
      <Label style={{ marginTop: 24, marginBottom: 8 }}>Premade</Label>
      <View style={{ gap: 8 }}>{premade.map(row)}</View>
      <Label style={{ marginTop: 32, marginBottom: 8 }}>Yours</Label>
      <View style={{ gap: 8 }}>
        {yours.length === 0 ? <EmptyState text={YOURS_EMPTY} /> : yours.map(row)}
        <Button label="New routine" variant="secondary" onPress={() => limit.whenRoomFor(() => router.push('/routines/edit/new'))} />
        {/* A routine someone shared, by its link or code (§18.18). The limit is checked when it is added. */}
        <Button label="Add from code" variant="quiet" onPress={() => router.push('/routines/import')} />
      </View>
      <Label style={{ marginTop: 32, marginBottom: 8 }}>Saved workouts</Label>
      {saved.length === 0 ? (
        <EmptyState text="Finish a workout and tap Save as a workout to keep it here." />
      ) : (
        <View style={{ gap: 8 }}>
          {saved.map((w) => (
            <SavedRow key={w.id} saved={w} locked={!canUseSavedWorkouts(pro)} onStart={() => starter.start(w.id)} />
          ))}
        </View>
      )}
      <RoutineOptionsSheet routine={options} actions={actions} onClose={() => setOptions(null)} />
      {actions.sheets}
      {starter.sheet}
      {limit.sheets}
    </Screen>
  );
}
