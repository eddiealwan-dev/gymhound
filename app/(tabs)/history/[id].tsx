import { router } from 'expo-router';
import { BackLink } from '../../../src/ui/BackLink';
import { Screen } from '../../../src/ui/Screen';
import { Body, Display } from '../../../src/ui/Text';

/** A finished workout's detail, a hidden tab route under History (R165, R172). A placeholder until Task 8; no footer (§18.4). */
export default function WorkoutDetail() {
  return (
    <Screen>
      <BackLink label="History" onPress={() => router.back()} />
      <Display>Workout</Display>
      <Body muted>Not built yet.</Body>
    </Screen>
  );
}
