import { Screen } from '../../src/ui/Screen';
import { Body, Display } from '../../src/ui/Text';

/** Placeholder until the Fuel task. Fuel shows the GruntHound footer, as Train does (Task 26). */
export default function Fuel() {
  return (
    <Screen footer>
      <Display>Fuel</Display>
      <Body muted>Not built yet.</Body>
    </Screen>
  );
}
