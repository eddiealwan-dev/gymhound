import { router } from 'expo-router';
import { View } from 'react-native';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Body, Display } from '../../src/ui/Text';

/** Add food, a modal over Fuel (params `date`, `mode`; R141, R154). A placeholder until Task 9; no footer. */
export default function AddFood() {
  return (
    <Screen>
      <Display>Add food</Display>
      <Body muted>Not built yet.</Body>
      <View style={{ marginTop: 16 }}>
        <Button label="Close" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
