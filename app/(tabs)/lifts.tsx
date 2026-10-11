import { router } from 'expo-router';
import { BackLink } from '../../src/ui/BackLink';
import { Screen } from '../../src/ui/Screen';
import { Body, Display } from '../../src/ui/Text';

/** Every lift, a hidden tab route under Stats (R172). A placeholder until Task 10; no footer (§18.4). */
export default function Lifts() {
  return (
    <Screen>
      <BackLink label="Stats" onPress={() => router.back()} />
      <Display>Lifts</Display>
      <Body muted>Not built yet.</Body>
    </Screen>
  );
}
