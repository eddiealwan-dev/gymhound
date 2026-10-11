import { router } from 'expo-router';
import { BackLink } from '../../src/ui/BackLink';
import { Screen } from '../../src/ui/Screen';
import { Body, Display } from '../../src/ui/Text';

/** Fuel → Targets, a hidden tab route so the header and dock stay (R145, R154). A placeholder until Task 10. */
export default function FuelTargets() {
  return (
    <Screen>
      <BackLink label="Fuel" onPress={() => router.back()} />
      <Display>Targets</Display>
      <Body muted>Not built yet.</Body>
    </Screen>
  );
}
