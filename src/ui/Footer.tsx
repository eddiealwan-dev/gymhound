import { Image, View } from 'react-native';
import { Body } from './Text';
import { useTheme } from './ThemeProvider';

const ON_DARK = require('../../assets/brand/grunthound-on-dark.png');
const ON_LIGHT = require('../../assets/brand/grunthound-on-light.png');

/**
 * The FieldHound footer: "powered by" over the GruntHound wordmark, both centred.
 * The wordmark is 153.5px wide at the image's own 776:82 ratio. It comes in two files, white GRUNT and LLC on dark and black on light, with HOUND blue in both.
 * The hound is never part of it. The two lines read as one element: "Powered by GruntHound LLC".
 */
export function Footer() {
  const { scheme } = useTheme();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Powered by GruntHound LLC" style={{ alignItems: 'center', paddingBottom: 24 }}>
      <Body muted style={{ fontSize: 10, lineHeight: 12, marginBottom: 10, textAlign: 'center' }}>
        powered by
      </Body>
      <Image source={scheme === 'dark' ? ON_DARK : ON_LIGHT} resizeMode="contain" style={{ width: 153.5, height: 16.2 }} />
    </View>
  );
}
