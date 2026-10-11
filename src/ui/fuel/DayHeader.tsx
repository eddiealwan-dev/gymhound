import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { dayTitle, shiftDay } from '../../domain/dates';
import { Body, Display } from '../Text';

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
        <Arrow glyph={'‹'} label="Previous day" disabled={false} onPress={() => onChange(shiftDay(day, -1))} />
        <Display accessibilityRole="header" style={{ flex: 1, textAlign: 'center' }}>
          {dayTitle(day, today, locale)}
        </Display>
        <Arrow glyph={'›'} label="Next day" disabled={atToday} onPress={() => onChange(shiftDay(day, 1) > today ? today : shiftDay(day, 1))} />
      </View>
      {trainingDay === null ? null : <Body muted>{trainingDay ? 'Training day' : 'Rest day'}</Body>}
    </View>
  );
}
