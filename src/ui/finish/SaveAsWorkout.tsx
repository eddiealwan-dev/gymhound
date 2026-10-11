import { useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { savedWorkoutOf, saveWorkoutAs } from '../../db/repositories/savedWorkoutsRepo';
import { validateSavedName } from '../../domain/savedWorkout';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { NameSheet } from '../NameSheet';
import { Body } from '../Text';

/**
 * The finish summary's **Save as a workout**, or the line saying the saved workout it came from remembers today's sets
 * (R118, R120). Sits just above Done, 16pt over it. The button opens a sheet with the workout's name to keep or
 * change; once saved it becomes the muted line "Saved as {name}.".
 */
export function SaveAsWorkout({ workoutId, workoutName }: { workoutId: string; workoutName: string }): ReactElement | null {
  const db = useDb();
  // Read once: the workout is finished, and saving it here makes a new saved workout, not the one it came from.
  const [from] = useState(() => savedWorkoutOf(db, workoutId));
  const [open, setOpen] = useState(false);
  const [savedAs, setSavedAs] = useState<string | null>(null);

  const save = (name: string): string | null => {
    const problem = validateSavedName(name);
    if (problem !== null) return problem;
    try {
      saveWorkoutAs(db, workoutId, name, Date.now());
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    bumpData();
    setSavedAs(name.trim());
    setOpen(false);
    return null;
  };

  const line = from !== null ? `${from.name} remembers today's sets.` : savedAs !== null ? `Saved as ${savedAs}.` : null;

  return (
    <View testID="save-as-workout" style={{ marginBottom: 16 }}>
      {line !== null ? (
        <Body muted accessibilityLiveRegion="polite">
          {line}
        </Body>
      ) : (
        <Button label="Save as a workout" variant="secondary" onPress={() => setOpen(true)} />
      )}
      <NameSheet
        visible={open}
        title="Save as a workout"
        fieldLabel="Workout name"
        initial={workoutName}
        onSave={save}
        onCancel={() => setOpen(false)}
      />
    </View>
  );
}
