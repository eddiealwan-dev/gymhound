import { Image } from 'react-native';
import { useTheme } from './ThemeProvider';

const LIGHT = require('../../assets/brand/mark.png');
const DARK = require('../../assets/brand/mark-dark.png');

/** The GruntHound hound, exported at 40px with @2x and @3x. The dark export carries a thin blue outline so it reads on the dark background. The art is never redrawn. */
export function HoundMark({ size }: { size: number }) {
  const { scheme } = useTheme();
  return (
    <Image
      source={scheme === 'dark' ? DARK : LIGHT}
      style={{ width: size, height: size }}
      accessibilityLabel="GruntHound hound"
    />
  );
}
