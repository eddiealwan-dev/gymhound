import { Text } from 'react-native';
import type { TextProps } from 'react-native';
import { fonts } from './theme';
import { useTheme } from './ThemeProvider';

const DISPLAY = { 600: fonts.display600, 700: fonts.display700, 800: fonts.display800 } as const;
const BODY = { 400: fonts.body400, 500: fonts.body500, 600: fonts.body600 } as const;

type DisplayProps = TextProps & { weight?: keyof typeof DISPLAY; upper?: boolean };
type BodyProps = TextProps & { weight?: keyof typeof BODY; muted?: boolean };
type NumProps = TextProps & { weight?: keyof typeof DISPLAY };

/** Barlow Condensed, for titles and big labels. */
export function Display({ weight = 700, upper = false, style, ...rest }: DisplayProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[{ fontFamily: DISPLAY[weight], fontSize: 28, color: colors.text }, upper && { textTransform: 'uppercase' }, style]}
    />
  );
}

/** Inter, for everything that reads as a sentence. */
export function Body({ weight = 400, muted = false, style, ...rest }: BodyProps) {
  const { colors } = useTheme();
  return <Text {...rest} style={[{ fontFamily: BODY[weight], fontSize: 16, color: muted ? colors.textMuted : colors.text }, style]} />;
}

/** Barlow Condensed with tabular figures, so columns of numbers line up. */
export function Num({ weight = 700, style, ...rest }: NumProps) {
  const { colors } = useTheme();
  return <Text {...rest} style={[{ fontFamily: DISPLAY[weight], fontSize: 24, color: colors.text, fontVariant: ['tabular-nums'] }, style]} />;
}
