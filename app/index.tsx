import { getSettings } from '../src/db/repositories/settingsRepo';
import { listExercises } from '../src/db/repositories/exercisesRepo';
import { listRoutines } from '../src/db/repositories/routinesRepo';
import type { Db } from '../src/db/types';
import { useDbQuery } from '../src/state/dataVersion';
import { Screen } from '../src/ui/Screen';
import { Body, Display } from '../src/ui/Text';
import { useTheme } from '../src/ui/ThemeProvider';

const countExercises = (db: Db) => listExercises(db).length;
const countRoutines = (db: Db) => listRoutines(db).length;

/** Temporary check screen: proves the database, theme and fonts are wired. Task 12 replaces it with the Train tab. */
export default function Index() {
  const { colors } = useTheme();
  const settings = useDbQuery(getSettings);
  const exercises = useDbQuery(countExercises);
  const routines = useDbQuery(countRoutines);
  return (
    <Screen footer>
      <Display weight={800} upper style={{ color: colors.red, fontSize: 32, letterSpacing: -0.5 }} numberOfLines={1}>
        GYMHOUND
      </Display>
      <Body>{`Theme: ${settings.theme}`}</Body>
      <Body>{`Unit: ${settings.unit}`}</Body>
      <Body>{`${exercises} exercises`}</Body>
      <Body>{`${routines} routines`}</Body>
    </Screen>
  );
}
