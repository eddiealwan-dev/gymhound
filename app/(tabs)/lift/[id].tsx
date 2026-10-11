import { router } from 'expo-router';
import { BackLink } from '../../../src/ui/BackLink';
import { Screen } from '../../../src/ui/Screen';
import { Body, Display } from '../../../src/ui/Text';

/** A lift's trend, records and sessions, a hidden tab route under Stats (R172–R174). A placeholder until Task 10; no footer (§18.4). */
export default function Lift() {
  return (
    <Screen>
      <BackLink label="Back" accessibilityLabel="Back" onPress={() => router.back()} />
      <Display>Lift</Display>
      <Body muted>Not built yet.</Body>
    </Screen>
  );
}
