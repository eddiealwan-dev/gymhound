import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { firstWorkoutMonth, trainingDaysInMonth } from '../../db/repositories/historyRepo';
import { getTrainingDates } from '../../db/repositories/workoutViewsRepo';
import type { Db } from '../../db/types';
import { monthTitle } from '../../domain/history';
import { computeStreak } from '../../domain/streak';
import { announce } from '../../platform/announce';
import { deviceLocale } from '../../platform/locale';
import { useFocusedDbQuery } from '../../state/dataVersion';
import { StepArrow } from '../StepArrow';
import { Body } from '../Text';
import { useTheme } from '../ThemeProvider';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The YYYY-MM month `n` months after `month` (before, when negative), across years. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** A day of the month as an English ordinal: "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** The grid as VoiceOver reads it: "October: trained on the 1st, 3rd and 5th." or "October: no training." */
export function calendarSentence(title: string, days: readonly string[]): string {
  if (days.length === 0) return `${title}: no training.`;
  const names = days.map((d) => ordinal(Number(d.slice(8, 10))));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${title}: trained on the ${list}.`;
}

/**
 * The line under the grid (R193): it counts days trained, not workouts. "Trained 4 days in October · 9-day streak",
 * "Trained 1 day in October", "No training in October"; the streak part only when `streak` > 0.
 */
export function trainedLine(days: number, title: string, streak: number): string {
  const line = days === 0 ? `No training in ${title}` : `Trained ${days} ${days === 1 ? 'day' : 'days'} in ${title}`;
  return streak > 0 ? `${line} · ${streak}-day streak` : line;
}

/** A YYYY-MM month in weeks of seven local dates, Monday first; days outside the month are null. */
export function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const length = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= length; d++) cells.push(`${month}-${pad2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The weekday initials for the locale, Monday first ("M T W T F S S" in English). */
export function weekdayInitials(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  // 5 January 2026 is a Monday.
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2026, 0, 5 + i)));
}

/**
 * History → the consistency calendar for one month (`YYYY-MM`, R164): a 44pt ‹ and › around the month's name, then a
 * Monday-first grid with the locale's weekday initials. A trained day (a finished workout's `local_date`; the active
 * workout is not one) is a circle filled with the text colour and numbered in the background colour; today has a 1.5pt
 * text-colour ring; other days are muted. Days are not buttons (at 320pt a day is ~41pt, under 44), so the grid is one
 * element read as a sentence. Under it "Trained {n} days in {Month}" (R193), with "· {s}-day streak" on the current
 * month while a streak runs. › stops at the current month and ‹ at the first workout's month; each
 * move says the new month's sentence. Its reads wait while History is out of sight (R185).
 *
 * The day numbers and initials are capped at 1.3x the text size, so a day stays inside its circle at the largest size;
 * the sentence carries the same facts at any size.
 */
export function ConsistencyCalendar({ month, today, onMonthChange }: { month: string; today: string; onMonthChange: (month: string) => void }): ReactElement | null {
  const { colors } = useTheme();
  const locale = deviceLocale();
  const currentMonth = today.slice(0, 7);
  const isCurrent = month === currentMonth;

  const read = useCallback(
    (db: Db) => ({
      days: trainingDaysInMonth(db, month),
      first: firstWorkoutMonth(db),
      // The streak shows only on the current month, so the full scan is skipped on any other.
      dates: isCurrent ? getTrainingDates(db) : [],
    }),
    [month, isCurrent],
  );
  const { days, first, dates } = useFocusedDbQuery(read);

  const title = monthTitle(month, locale, today);
  const sentence = calendarSentence(title, days);
  const streak = isCurrent ? computeStreak(dates, today) : 0;
  const trained = new Set(days);
  const earliest = first ?? currentMonth;

  // A move says the new month; mounting and a refresh with new data say nothing.
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    announce(sentence);
  }, [month, sentence]);

  const step = (n: number) => {
    moved.current = true;
    onMonthChange(shiftMonth(month, n));
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <StepArrow glyph={'‹'} label="Previous month" disabled={month <= earliest} onPress={() => step(-1)} />
        <Body weight={600} accessibilityRole="header" style={{ flex: 1, textAlign: 'center' }}>
          {title}
        </Body>
        <StepArrow glyph={'›'} label="Next month" disabled={month >= currentMonth} onPress={() => step(1)} />
      </View>
      <View accessible accessibilityLabel={sentence} style={{ marginTop: 8, gap: 4 }}>
        <View style={{ flexDirection: 'row' }}>
          {weekdayInitials(locale).map((initial, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Body muted maxFontSizeMultiplier={1.3} style={{ fontSize: 12 }}>
                {initial}
              </Body>
            </View>
          ))}
        </View>
        {monthGrid(month).map((week, w) => (
          <View key={w} style={{ flexDirection: 'row' }}>
            {week.map((date, i) => (
              <View key={date ?? `empty-${w}-${i}`} style={{ flex: 1, alignItems: 'center' }}>
                {date ? (
                  <View
                    testID={`day-${date}`}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      // The ring sits 1.5pt outside the fill, so a trained today still shows it.
                      borderWidth: 1.5,
                      borderColor: date === today ? colors.text : 'transparent',
                      padding: 1.5,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 15,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: trained.has(date) ? colors.text : 'transparent',
                      }}
                    >
                      <Body
                        weight={trained.has(date) ? 600 : 400}
                        muted={!trained.has(date) && date !== today}
                        maxFontSizeMultiplier={1.3}
                        style={[{ fontSize: 15, fontVariant: ['tabular-nums'] }, trained.has(date) && { color: colors.bg }]}
                      >
                        {String(Number(date.slice(8, 10)))}
                      </Body>
                    </View>
                  </View>
                ) : (
                  <View style={{ width: 36, height: 36 }} />
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
      <Body muted style={{ fontSize: 14, marginTop: 8 }}>
        {trainedLine(days.length, title, streak)}
      </Body>
    </View>
  );
}
