import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable } from 'react-native';
import { calendarDayTitle } from '../../domain/dates';
import { cardLine, marksLine, type HistoryCard as Card } from '../../domain/history';
import type { WeightUnit } from '../../domain/types';
import { flushAll } from '../../state/draftFlush';
import { Body, Display } from '../Text';
import { useTheme } from '../ThemeProvider';

/**
 * One finished workout on History (R163): a card (surface, Seam edge, 16 corners and padding) with the muted date, the
 * name, the muted "48 min · 12,340 lb · 3 PRs" and, when an exercise was marked, "Something off: Rough sleep · Pain".
 * The PR count is a count, not a PR mark, so it is never red. Pressing it opens the workout. VoiceOver reads it as one
 * button: "{name}, {date}, {card line}{, marks}".
 */
export function HistoryCard({ card, unit, today, locale }: { card: Card; unit: WeightUnit; today: string; locale: string }): ReactElement {
  const { colors } = useTheme();
  const date = calendarDayTitle(card.localDate, today, locale);
  const line = cardLine(card, unit, locale);
  const marks = marksLine(card.marks);
  return (
    <Pressable
      testID={`history-card-${card.id}`}
      accessibilityRole="button"
      accessibilityLabel={[card.name, date, line, marks].filter(Boolean).join(', ')}
      onPress={() => {
        flushAll();
        router.push(`/history/${card.id}`);
      }}
      style={({ pressed }) => ({
        minHeight: 44,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        gap: 4,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Body muted style={{ fontSize: 14 }}>
        {date}
      </Body>
      <Display style={{ fontSize: 22 }}>{card.name}</Display>
      <Body muted style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
        {line}
      </Body>
      {marks ? (
        <Body muted style={{ fontSize: 14 }}>
          {marks}
        </Body>
      ) : null}
    </Pressable>
  );
}
