import { router } from 'expo-router';
import { View } from 'react-native';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Body, Display } from '../src/ui/Text';

/** The paywall, full screen above the tabs with no dock (§8.12, R154). A placeholder until Task 7; no footer. */
export default function Paywall() {
  return (
    <Screen>
      <Display>GymHound Pro</Display>
      <Body muted>Not built yet.</Body>
      <View style={{ marginTop: 16 }}>
        <Button label="Close" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
