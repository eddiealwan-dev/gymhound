import { Text } from 'react-native';
import type { Ref } from 'react';
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

/**
 * A screen's title (Display 700, 28): Train's date aside, every page opens with one, under its BackLink when it has one.
 * It is a VoiceOver heading, so a screen-reader user lands on where they are (R355). The page puts 24pt under it, or
 * 4pt over a muted line about it (a routine's days, a workout's date).
 */
export function ScreenTitle(props: TextProps) {
  return <Display accessibilityRole="header" {...props} />;
}

/** Inter, for everything that reads as a sentence. */
export function Body({ weight = 400, muted = false, style, ...rest }: BodyProps) {
  const { colors } = useTheme();
  return <Text {...rest} style={[{ fontFamily: BODY[weight], fontSize: 16, color: muted ? colors.textMuted : colors.text }, style]} />;
}

/**
 * Inter 600 at 14pt, muted, upper case and lightly tracked: the state label on a Train card ("UP NEXT") and the heading
 * of a group of settings or routines. The words are written as they read ("Units"); the screen reader hears them as a
 * heading, in the case they were written in.
 */
export function Label({ style, ...rest }: TextProps & { ref?: Ref<Text> }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      {...rest}
      style={[{ fontFamily: BODY[600], fontSize: 14, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textMuted }, style]}
    />
  );
}

/** Barlow Condensed with tabular figures, so columns of numbers line up. */
export function Num({ weight = 700, style, ...rest }: NumProps) {
  const { colors } = useTheme();
  return <Text {...rest} style={[{ fontFamily: DISPLAY[weight], fontSize: 24, color: colors.text, fontVariant: ['tabular-nums'] }, style]} />;
}
