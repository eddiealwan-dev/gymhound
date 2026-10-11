import { router } from 'expo-router';
import { BackLink } from '../../../../src/ui/BackLink';
import { Screen } from '../../../../src/ui/Screen';
import { Body, Display } from '../../../../src/ui/Text';

/** The editor for a finished workout, a hidden tab route under History (R166, R172). A placeholder until Task 9; no footer (§18.4). */
export default function EditWorkout() {
  return (
    <Screen>
      <BackLink label="History" onPress={() => router.back()} />
      <Display>Edit workout</Display>
      <Body muted>Not built yet.</Body>
    </Screen>
  );
}
