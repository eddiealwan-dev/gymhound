import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { fromLocalDate, toLocalDate } from '../../domain/dates';
import { Body, Display } from '../Text';

/** The local date `days` days after `localDate` (before, when negative), across months, years and DST changes. */
export function shiftDay(localDate: string, days: number): string {
  const d = fromLocalDate(localDate);
  return toLocalDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime());
}

/** "Today", "Yesterday", else the weekday and date ("Fri, Oct 9"), with the year when it isn't this year. */
export function dayTitle(localDate: string, today: string, locale: string): string {
  if (localDate === today) return 'Today';
  if (localDate === shiftDay(today, -1)) return 'Yesterday';
  const sameYear = localDate.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? null : { year: 'numeric' }) }).format(
    fromLocalDate(localDate),
  );
}

/** A 44pt arrow; dimmed and ignored when it can't go further. */
function Arrow({ glyph, label, disabled, onPress }: { glyph: string; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? () => undefined : onPress}
      style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : pressed ? 0.6 : 1 })}
    >
      <Display weight={700} style={{ fontSize: 32, lineHeight: 36 }}>
        {glyph}
      </Display>
    </Pressable>
  );
}

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
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ marginLeft: -12 }}>
          <Arrow glyph={'‹'} label="Previous day" disabled={false} onPress={() => onChange(shiftDay(day, -1))} />
        </View>
        <Display accessibilityRole="header" style={{ flexShrink: 1, textAlign: 'center' }}>
          {dayTitle(day, today, locale)}
        </Display>
        <Arrow glyph={'›'} label="Next day" disabled={atToday} onPress={() => onChange(shiftDay(day, 1) > today ? today : shiftDay(day, 1))} />
      </View>
      {trainingDay === null ? null : <Body muted>{trainingDay ? 'Training day' : 'Rest day'}</Body>}
    </View>
  );
}
