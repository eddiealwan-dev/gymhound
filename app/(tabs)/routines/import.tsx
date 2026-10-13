import { router, useLocalSearchParams } from 'expo-router';
import { BackLink } from '../../../src/ui/BackLink';
import { ImportRoutine } from '../../../src/ui/routines/ImportRoutine';
import { Screen } from '../../../src/ui/Screen';
import { Body, ScreenTitle } from '../../../src/ui/Text';

/** Back to Routines, or there when the page was opened by a link with nothing behind it. */
function toRoutines() {
  if (router.canGoBack()) router.back();
  else router.replace('/routines');
}

/**
 * Routines → Add from code (§18.18): paste a routine someone shared, see what it holds, and add it as a routine of
 * your own. A shared link opens this page with its code already in the field (`/routine/<code>`).
 */
export default function ImportRoutineScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return (
    <Screen>
      <BackLink label="Routines" onPress={toRoutines} />
      <ScreenTitle>Add from code</ScreenTitle>
      <Body muted style={{ marginTop: 4, marginBottom: 24 }}>
        Paste a routine someone shared with you. It's added as a routine of your own; nothing of theirs but the routine
        comes with it.
      </Body>
      <ImportRoutine initial={typeof code === 'string' ? code : ''} onCancel={toRoutines} />
    </Screen>
  );
}
