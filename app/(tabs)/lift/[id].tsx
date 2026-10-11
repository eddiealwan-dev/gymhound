import { router } from 'expo-router';
import { BackLink } from '../../../src/ui/BackLink';
import { Screen } from '../../../src/ui/Screen';
import { Body, Display } from '../../../src/ui/Text';

/** Back where it was opened from; a link opened with no history goes to /lifts. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/lifts');
}

/** A lift's trend, records and sessions, a hidden tab route under Stats (R172–R174). A placeholder until Task 10; no footer (§18.4). */
export default function Lift() {
  return (
    <Screen>
      <BackLink label="Back" accessibilityLabel="Back" onPress={leave} />
      <Display>Lift</Display>
      <Body muted>Not built yet.</Body>
    </Screen>
  );
}
