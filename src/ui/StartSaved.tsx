import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useDb } from '../db/DbProvider';
import { ActiveWorkoutExistsError } from '../db/repositories/activeWorkout';
import { startSavedWorkout } from '../db/repositories/savedWorkoutsRepo';
import { getActiveWorkoutId } from '../db/repositories/workoutsRepo';
import { bumpData } from '../state/dataVersion';
import { canUseSavedWorkouts } from '../domain/routineLimit';
import { Button } from './Button';
import { useProGate } from './RoutineLimit';
import { Sheet } from './Sheet';
import { Body } from './Text';
import { WorkoutInProgressSheet } from './WorkoutInProgressSheet';

/**
 * Starting a saved workout (R119, R122), from a Routines row or its detail: `start(id)` starts it and opens the
 * session, as Up next does. While a workout is in progress it starts nothing and opens "Workout in progress" (R80)
 * instead; any other failure says "Couldn't start. Try again." and never throws. Render `sheet` once.
 */
export function useStartSaved(): { start: (savedId: string) => void; sheet: ReactNode } {
  const db = useDb();
  const gate = useProGate();
  const [open, setOpen] = useState<'blocked' | 'failed' | null>(null);
  const close = () => setOpen(null);

  // Saved workouts are Pro (§18.21, R522): without it, the Pro sheet says so and nothing starts.
  const start = (savedId: string) => gate.when(canUseSavedWorkouts(gate.isPro()), { kind: 'saved_workout' }, () => startNow(savedId));

  const startNow = (savedId: string) => {
    if (getActiveWorkoutId(db) !== null) {
      setOpen('blocked');
      return;
    }
    try {
      startSavedWorkout(db, savedId, Date.now());
    } catch (error) {
      if (!(error instanceof ActiveWorkoutExistsError)) console.warn('GymHound could not start the saved workout.', error);
      setOpen(error instanceof ActiveWorkoutExistsError ? 'blocked' : 'failed');
      return;
    }
    bumpData();
    router.push('/session');
  };

  const sheet = (
    <>
      <WorkoutInProgressSheet
        visible={open === 'blocked'}
        onClose={close}
        body="Finish or discard the workout in progress before starting another."
      />
      <Sheet visible={open === 'failed'} onClose={close}>
        <Body style={{ marginBottom: 16 }}>Couldn't start. Try again.</Body>
        <Button label="OK" onPress={close} />
      </Sheet>
      {gate.sheets}
    </>
  );

  return { start, sheet };
}
