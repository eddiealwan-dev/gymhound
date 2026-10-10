import { View } from 'react-native';
import { useDb } from '../../../src/db/DbProvider';
import { listRoutines, setActiveRoutine } from '../../../src/db/repositories/routinesRepo';
import type { RoutineSummary } from '../../../src/db/repositories/routinesRepo';
import { bumpData, useDbQuery } from '../../../src/state/dataVersion';
import { Button } from '../../../src/ui/Button';
import { Screen } from '../../../src/ui/Screen';
import { Body, Display } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';

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

/** The premade routines, each with a way to make it the active one. Your own routines arrive in a later task. */
export default function Routines() {
  const db = useDb();
  const premade = useDbQuery(listRoutines).filter((routine) => routine.isPremade);
  return (
    <Screen footer>
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
              setActiveRoutine(db, routine.id);
              bumpData();
            }}
          />
        ))}
      </View>
    </Screen>
  );
}
