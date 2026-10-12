import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, View } from 'react-native';
import { getFuelTargets, isTrainingDay, listEntries } from '../../src/db/repositories/foodLogRepo';
import type { Db } from '../../src/db/types';
import { calendarDayTitle, toLocalDate } from '../../src/domain/dates';
import { dayTotals, targetsFor } from '../../src/domain/fuel';
import { announce } from '../../src/platform/announce';
import { useIsPro } from '../../src/platform/entitlements';
import { useFocusedDbQuery } from '../../src/state/dataVersion';
import { flushAll } from '../../src/state/draftFlush';
import { deviceLocale } from '../../src/platform/locale';
import { Button } from '../../src/ui/Button';
import { DayHeader } from '../../src/ui/fuel/DayHeader';
import { FoodEntries } from '../../src/ui/fuel/FoodEntries';
import { FuelSummary } from '../../src/ui/fuel/FuelSummary';
import { FuelTrends } from '../../src/ui/fuel/FuelTrends';
import { MacroBars } from '../../src/ui/fuel/MacroBars';
import { TargetsForm } from '../../src/ui/fuel/TargetsForm';
import { WaterCard } from '../../src/ui/fuel/WaterCard';
import { ProPitch } from '../../src/ui/pro/ProPitch';
import { Screen } from '../../src/ui/Screen';
import { Body, Label, ScreenTitle } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';
import { useOnce } from '../../src/ui/useOnce';

/**
 * Today's date, read again whenever the tab regains focus or the app comes back to the foreground, so a Fuel left open
 * past midnight moves on. `onNewDay(was, now)` runs when it changed.
 */
function useToday(onNewDay: (was: string, now: string) => void): string {
  const [today, setToday] = useState(() => toLocalDate(Date.now()));
  const latest = useRef({ today, onNewDay });
  latest.current = { today, onNewDay };

  const check = useCallback(() => {
    const now = toLocalDate(Date.now());
    const was = latest.current.today;
    if (now === was) return;
    latest.current.today = now;
    setToday(now);
    latest.current.onNewDay(was, now);
  }, []);

  useFocusEffect(check);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);
  return today;
}

/**
 * Fuel (§8.10): the day header and water for everyone (R150, R151); then the pitch when Pro is off; else the day — the
 * two numbers, the macro bars, the entries, Add food and Quick add, the trends and Targets › — or, with no targets yet,
 * the entries, Add food and Quick add, then the setup card. The footer shows in every state. Pro turning off locks it at once; the data stays (R151).
 */
export default function Fuel() {
  const pro = useIsPro();
  const { colors } = useTheme();
  const locale = deviceLocale();
  const [day, setDay] = useState(() => toLocalDate(Date.now()));
  // A screen left on Today follows it to the new day; one left on an earlier day stays there (R148).
  const today = useToday((was, now) => setDay((d) => (d === was || d > now ? now : d)));

  const read = useCallback(
    (db: Db) => ({ targets: getFuelTargets(db), entries: listEntries(db, day), trainingDay: isTrainingDay(db, day) }),
    [day],
  );
  // Focused only, as Train, History and Stats (R185): the tab stays mounted, and every tick in a workout bumps the data
  // version. A bump while away is read when Fuel is back in view.
  const { targets, entries, trainingDay } = useFocusedDbQuery(read);

  const goTo = (next: string) => {
    flushAll();
    Keyboard.dismiss();
    const clamped = next > today ? today : next;
    setDay(clamped);
    announce(calendarDayTitle(clamped, today, locale));
  };

  // One guard for every screen Fuel opens: a double tap, or a tap on Add food and then Quick add, opens one.
  const once = useOnce();
  const push = (go: () => void) =>
    once(() => {
      flushAll();
      Keyboard.dismiss();
      go();
    });

  const target = pro && targets !== null ? targetsFor(targets, trainingDay) : null;
  const totals = dayTotals(entries);
  // The day's food and the two ways to add to it: there with targets or without (Round 8: with only the targets form
  // showing, there was no way to log food until targets were saved).
  const food = (
    <>
      <FoodEntries entries={entries} totals={totals} locale={locale} />
      <View style={{ gap: 8 }}>
        <Button label="Add food" onPress={() => push(() => router.push({ pathname: '/food/add', params: { date: day } }))} />
        <Button label="Quick add" variant="secondary" onPress={() => push(() => router.push({ pathname: '/food/add', params: { date: day, mode: 'quick' } }))} />
      </View>
    </>
  );

  return (
    <Screen footer>
      <View style={{ gap: 24 }}>
        <View style={{ gap: 8 }}>
          <ScreenTitle>Fuel</ScreenTitle>
          <DayHeader day={day} today={today} locale={locale} trainingDay={target === null ? null : trainingDay} onChange={goTo} />
        </View>
        <WaterCard localDate={day} today={today} />
        {!pro ? (
          <ProPitch context="tab" />
        ) : target === null ? (
          <>
            {food}
            <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
              <Label>Set your targets</Label>
              <Body>Fuel counts down from a target. Set one for training days and one for rest days.</Body>
              {/* Saving bumps the data version, so this screen reads the targets again and shows the day. */}
              <TargetsForm initial={null} submitLabel="Save targets" onSaved={() => {}} />
            </View>
          </>
        ) : (
          <>
            <FuelSummary target={target} totals={totals} locale={locale} />
            <MacroBars target={target} totals={totals} locale={locale} />
            {food}
            <FuelTrends today={today} />
            {/* Steps back by the quiet button's padding so its words line up with the page. */}
            <View style={{ alignItems: 'flex-start', marginLeft: -20 }}>
              <Button label={'Targets ›'} variant="quiet" accessibilityLabel="Targets" onPress={() => push(() => router.push('/fuel-targets'))} />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
