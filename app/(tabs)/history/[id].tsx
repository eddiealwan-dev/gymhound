import { router } from 'expo-router';
import { BackLink } from '../../../src/ui/BackLink';
import { Screen } from '../../../src/ui/Screen';
import { Body, Display } from '../../../src/ui/Text';

/** Back where it was opened from; a link opened with no history goes to /history. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/history');
}

/** A finished workout's detail, a hidden tab route under History (R165, R172). A placeholder until Task 8; no footer (§18.4). */
export default function WorkoutDetail() {
  return (
    <Screen>
      <BackLink label="History" onPress={leave} />
      <Display>Workout</Display>
      <Body muted>Not built yet.</Body>
    </Screen>
  );
}
