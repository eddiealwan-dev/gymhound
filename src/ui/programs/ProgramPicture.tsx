import { Image, View } from 'react-native';
import { PROGRAM_PICTURES } from '../../seed/programPictures.generated';
import { useTheme } from '../ThemeProvider';

/** The card's picture is 3:2 at the top left of the card; the Routines row's is a 1:1 thumbnail (R632, R633). */
const SIZE = { card: { width: 150, height: 100 }, thumb: { width: 64, height: 64 } } as const;

/**
 * A program's picture (R632): a bundled free-exercise-db photo of its signature movement, in grayscale, so the twenty
 * read as one series and red stays for the wordmark, the active tab and PR marks. 8pt corners and a 1px Seam edge, as
 * a field's. VoiceOver reads "{movement} photo"; inside a row whose own label says what it is, `decorative` leaves it
 * out. A program with no picture yet draws nothing, and the layout closes up around it.
 */
export function ProgramPicture({
  programId,
  label,
  kind,
  decorative = false,
}: {
  programId: string;
  label: string;
  kind: 'card' | 'thumb';
  decorative?: boolean;
}) {
  const { colors } = useTheme();
  const picture = PROGRAM_PICTURES[programId];
  if (picture === undefined) return null;
  const size = SIZE[kind];
  return (
    <View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : `${label} photo`}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      style={{ ...size, borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.surfaceRaised }}
    >
      {/* The frame's 1px border sits inside its size, so the photo fills what is left of it and never covers the edge. */}
      <Image source={kind === 'card' ? picture.card : picture.thumb} accessible={false} resizeMode="cover" style={{ width: size.width - 2, height: size.height - 2 }} />
    </View>
  );
}
