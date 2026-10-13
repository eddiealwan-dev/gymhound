import { useLocalSearchParams } from 'expo-router';
import { LiftDetail } from '../(tabs)/lift/[id]';

/**
 * A lift's stats over a workout in progress (R554): Stats on an exercise opens its chart, records and sessions here,
 * as a sheet over the session, so Back returns to the workout as it was. Its rows don't open other workouts.
 */
export default function LiftStatsOverWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LiftDetail key={String(id)} id={String(id)} fromWorkout />;
}
