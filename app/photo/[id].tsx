import { router } from 'expo-router';
import { View } from 'react-native';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Body, Display } from '../../src/ui/Text';

/** One progress photo, full screen above the tabs with no dock (R181). A placeholder until Task 12; no footer (§18.4). */
export default function Photo() {
  return (
    <Screen>
      <Display>Photo</Display>
      <Body muted>Not built yet.</Body>
      <View style={{ marginTop: 16 }}>
        <Button label="Close" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
