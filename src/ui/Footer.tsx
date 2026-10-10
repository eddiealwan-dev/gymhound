import { View } from 'react-native';
import { Body } from './Text';

export function Footer() {
  return (
    <View style={{ paddingVertical: 24 }}>
      <Body muted style={{ fontSize: 12, textAlign: 'center' }}>
        Powered by GruntHound LLC
      </Body>
    </View>
  );
}
