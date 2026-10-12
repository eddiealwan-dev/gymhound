import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { listHistory } from '../../../src/db/repositories/historyRepo';
import { getSettings } from '../../../src/db/repositories/settingsRepo';
import type { Db } from '../../../src/db/types';
import { toLocalDate } from '../../../src/domain/dates';
import { groupByMonth } from '../../../src/domain/history';
import { focusOn } from '../../../src/platform/announce';
import { deviceLocale } from '../../../src/platform/locale';
import { useFocusedDbQuery } from '../../../src/state/dataVersion';
import { Button } from '../../../src/ui/Button';
import { EmptyState } from '../../../src/ui/EmptyState';
import { ConsistencyCalendar } from '../../../src/ui/history/ConsistencyCalendar';
import { HistoryCard } from '../../../src/ui/history/HistoryCard';
import { Screen } from '../../../src/ui/Screen';
import { Label, ScreenTitle } from '../../../src/ui/Text';

/** Months shown at first, and how many more each Show earlier months adds (R163). */
const FIRST_MONTHS = 3;
const MORE_MONTHS = 6;

/** Every finished workout as a card, in the display unit. */
function readHistory(db: Db) {
  const unit = getSettings(db).unit;
  return { unit, cards: listHistory(db, unit) };
}

/**
 * History (§8.8, R163, R164): the consistency calendar for the month shown (the current month at first; moving it does
 * not move the list), then finished workouts grouped by month, newest first, each a card that opens the workout. The 3
 * newest months with workouts show; a quiet Show earlier months adds 6 more each tap and goes when none are left. With
 * no workouts, a muted line says how History fills and Go to Train is the one action. The footer closes the page. It reads only while in sight (R185);
 * `today` is read again each time it comes into sight, so a screen left open past midnight moves on a day.
 */
export default function History() {
  const [today, setToday] = useState(() => toLocalDate(Date.now()));
  useFocusEffect(
    useCallback(() => {
      setToday(toLocalDate(Date.now()));
    }, []),
  );
  const [month, setMonth] = useState(() => today.slice(0, 7));
  // Back in sight in a new month: a calendar left on the old current month moves to the new one; an earlier month the
  // lifter chose stays.
  const shownToday = useRef(today);
  useEffect(() => {
    const before = shownToday.current.slice(0, 7);
    shownToday.current = today;
    if (today.slice(0, 7) !== before) setMonth((m) => (m === before ? today.slice(0, 7) : m));
  }, [today]);
  const [shown, setShown] = useState(FIRST_MONTHS);
  const { unit, cards } = useFocusedDbQuery(readHistory);
  const locale = deviceLocale();
  const months = useMemo(() => groupByMonth(cards, locale, today), [cards, locale, today]);
  const visible = months.slice(0, shown);

  // Show earlier months moves VoiceOver to the first month it added, as the button may have gone.
  const labels = useRef(new Map<string, Text>());
  const firstAdded = useRef<string | null>(null);
  useEffect(() => {
    if (!firstAdded.current) return;
    focusOn(labels.current.get(firstAdded.current));
    firstAdded.current = null;
  }, [shown]);

  const showEarlier = () => {
    firstAdded.current = months[shown]?.month ?? null;
    setShown((n) => n + MORE_MONTHS);
  };

  return (
    <Screen footer>
      <ScreenTitle>History</ScreenTitle>
      <View style={{ marginTop: 24 }}>
        <ConsistencyCalendar month={month} today={today} onMonthChange={setMonth} />
      </View>
      {months.length === 0 ? (
        <EmptyState
          style={{ marginTop: 24 }}
          text="No workouts yet. Finish one on Train and it shows here, with its day marked on the calendar."
          action={{ label: 'Go to Train', onPress: () => router.navigate('/') }}
        />
      ) : (
        <View style={{ marginTop: 32, gap: 32 }}>
          {visible.map((group) => (
            <View key={group.month} style={{ gap: 8 }}>
              <Label
                testID="history-month"
                ref={(node: Text | null) => {
                  if (node) labels.current.set(group.month, node);
                  else labels.current.delete(group.month);
                }}
              >
                {group.title}
              </Label>
              {group.cards.map((card) => (
                <HistoryCard key={card.id} card={card} unit={unit} today={today} locale={locale} />
              ))}
            </View>
          ))}
          {months.length > shown ? (
            // A quiet button steps back by its padding, so its label lines up with the cards' edge.
            <View style={{ alignSelf: 'flex-start', marginLeft: -20, marginTop: -16 }}>
              <Button label="Show earlier months" variant="quiet" onPress={showEarlier} />
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
