import type { ReactElement } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { calendarDayTitle, shiftDay } from '../../domain/dates';
import { StepArrow } from '../StepArrow';
import { Body, Display, TITLE_MAX_SCALE } from '../Text';

/**
 * The day Fuel shows (R148): ‹ steps back to any earlier day, › forward but never past today. Under it, which targets
 * apply ("Training day" or "Rest day", R146), when targets do.
 */
export function DayHeader({
  day,
  today,
  locale,
  trainingDay,
  onChange,
}: {
  day: string;
  today: string;
  locale: string;
  /** Null when no targets apply (locked, or none set), so the line is left out. */
  trainingDay: boolean | null;
  onChange: (day: string) => void;
}): ReactElement {
  const atToday = day >= today;
  const { fontScale } = useWindowDimensions();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <StepArrow glyph={'‹'} label="Previous day" disabled={false} onPress={() => onChange(shiftDay(day, -1))} />
        {/* Room under the line that grows with the text size: at the largest sizes the foot of "Today" was cut off
            (Rounds 10 and 11), and a glyph drawn past a text's frame on iOS is clipped. */}
        <Display accessibilityRole="header" style={{ flex: 1, textAlign: 'center', paddingBottom: Math.ceil(4 * Math.min(fontScale, TITLE_MAX_SCALE)) }}>
          {calendarDayTitle(day, today, locale)}
        </Display>
        <StepArrow glyph={'›'} label="Next day" disabled={atToday} onPress={() => onChange(shiftDay(day, 1) > today ? today : shiftDay(day, 1))} />
      </View>
      {trainingDay === null ? null : <Body muted>{trainingDay ? 'Training day' : 'Rest day'}</Body>}
    </View>
  );
}
