import { View } from 'react-native';
import { metconVoice, type MetconElement } from '../../domain/sessionBlock';
import { Body, Num } from '../Text';
import { useTheme } from '../ThemeProvider';

/** The space above a block's first line under the name row: clear of its controls' 10pt reach (`NAME_ROW_HIT_SLOP`). */
const UNDER_NAME_ROW = 10;

/**
 * The format line of a block that is not set rows (Task 7b): "AMRAP 10 min", "Run 29:00", "6 × 3:00 hard / 2:00 easy".
 * Body strong, under the name row; it wraps at any text size.
 */
export function FormatLine({ text }: { text: string }) {
  return (
    <Body weight={600} style={{ marginTop: UNDER_NAME_ROW }}>
      {text}
    </Body>
  );
}

type MetconProps = { parts: { format: string; elements: MetconElement[] } };

/**
 * A metcon's format and moves (R-t7b2, design gate #2): the format line ("21-15-9 for time · 8 min cap"), then one line
 * per move with its amount in its own Barlow column ("10", "200 m", "21-15-9") and its load muted after the name, in the
 * session unit. A list with no amounts at all (no name to read them from) has no amount column. One element for
 * VoiceOver, read as a sentence. At large text the amount column grows and the names wrap.
 */
export function MetconLines({ parts }: MetconProps) {
  const { colors } = useTheme();
  const amounts = parts.elements.some((e) => e.amount !== null);
  return (
    <View accessible accessibilityLabel={metconVoice(parts)} style={{ marginTop: UNDER_NAME_ROW, gap: 4 }}>
      <Body weight={600}>{parts.format}</Body>
      {parts.elements.length > 0 ? (
        <View style={{ gap: 4, marginTop: 4 }}>
          {parts.elements.map((e, i) => (
            <View key={`${i}:${e.name}`} testID="metcon-move" style={{ flexDirection: 'row', alignItems: 'baseline', columnGap: 12 }}>
              {/* The amount column: as wide as "200 m" at the default size, wider as the text grows ("21-15-9"). */}
              {amounts ? (
                <Num weight={600} style={{ fontSize: 17, minWidth: 48, color: colors.text }}>
                  {e.amount ?? ''}
                </Num>
              ) : null}
              <Body style={{ flexShrink: 1 }}>
                {e.name}
                {e.load !== null ? (
                  <Body muted>
                    {' · '}
                    {e.load}
                  </Body>
                ) : null}
              </Body>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
