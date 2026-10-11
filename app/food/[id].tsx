import { router } from 'expo-router';
import { View } from 'react-native';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Body, Display } from '../../src/ui/Text';

/** One of your own foods, a modal over Fuel: `new` creates (param `name`), any other id edits (R144, R154). A placeholder until Task 9; no footer. */
export default function FoodEditor() {
  return (
    <Screen>
      <Display>Food</Display>
      <Body muted>Not built yet.</Body>
      <View style={{ marginTop: 16 }}>
        <Button label="Close" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
