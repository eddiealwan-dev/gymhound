import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useDb } from '../db/DbProvider';
import { ActiveWorkoutExistsError } from '../db/repositories/activeWorkout';
import { startSavedWorkout } from '../db/repositories/savedWorkoutsRepo';
import { getActiveWorkoutId } from '../db/repositories/workoutsRepo';
import { bumpData } from '../state/dataVersion';
import { WorkoutInProgressSheet } from './WorkoutInProgressSheet';

/**
 * Starting a saved workout (R119, R122), from a Routines row or its detail: `start(id)` starts it and opens the
 * session, as Up next does. While a workout is in progress it starts nothing and opens "Workout in progress" (R80)
 * instead; render `sheet` once.
 */
export function useStartSaved(): { start: (savedId: string) => void; sheet: ReactNode } {
  const db = useDb();
  const [blocked, setBlocked] = useState(false);

  const start = (savedId: string) => {
    if (getActiveWorkoutId(db) !== null) {
      setBlocked(true);
      return;
    }
    try {
      startSavedWorkout(db, savedId, Date.now());
    } catch (error) {
      if (error instanceof ActiveWorkoutExistsError) {
        setBlocked(true);
        return;
      }
      throw error;
    }
    bumpData();
    router.push('/session');
  };

  const sheet = (
    <WorkoutInProgressSheet
      visible={blocked}
      onClose={() => setBlocked(false)}
      body="Finish or discard the workout in progress before starting another."
    />
  );

  return { start, sheet };
}
