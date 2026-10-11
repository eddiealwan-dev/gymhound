import { router } from 'expo-router';
import { BackLink } from '../../src/ui/BackLink';
import { Screen } from '../../src/ui/Screen';
import { Body, Display } from '../../src/ui/Text';

/** Back where it was opened from; a link opened with no history goes to /stats. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/stats');
}

/** Progress photos, a hidden tab route under Stats (R181). A placeholder until Task 12; no footer (§18.4). */
export default function Photos() {
  return (
    <Screen>
      <BackLink label="Stats" onPress={leave} />
      <Display>Progress photos</Display>
      <Body muted>Not built yet.</Body>
    </Screen>
  );
}
