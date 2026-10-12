import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { AppState, Keyboard, View } from 'react-native';
import { toLocalDate } from '../../domain/dates';
import {
  lastSevenDays,
  stepsAverage,
  stepsAverageLine,
  stepsCount,
  stepsSpoken,
  stepsWindows,
  weekdayInitial,
  type StepsPermission,
} from '../../domain/steps';
import { announce } from '../../platform/announce';
import { stepsSource } from '../../platform/steps';
import { flushAll } from '../../state/draftFlush';
import { deviceLocale } from '../body/BodyLog';
import { Button } from '../Button';
import { Body, Label, Num } from '../Text';
import { useTheme } from '../ThemeProvider';

const INVITE = "See today's steps and the last 7 days from your iPhone's motion sensor.";
const DENIED = 'Motion access is off. Turn it on in Settings to see your steps.';
const FAILED = "Couldn't read your steps.";

/** The bars' height: the tallest day fills it. */
const BAR_HEIGHT = 64;

/** What the card shows. `none` is nothing at all: not known yet, or no counter to read (Android, the web, no sensor). */
type Shown =
  | { kind: 'none' }
  | { kind: 'undetermined' }
  | { kind: 'denied' }
  | { kind: 'failed' }
  | { kind: 'granted'; days: string[]; counts: number[] };

/**
 * Stats → Steps on iPhone (R182): today's steps and the last 7 days from the motion sensor, with a 7-day average. Before
 * motion access is asked it offers **Show steps**, the only place that asks; refused, it says where to turn it on.
 * Counts are read each time Stats comes into sight and when the app comes back to the front, and are never stored.
 * Android and the web draw nothing (Health Connect is phase 7). It takes no props (R187).
 */
export function StepsCard(): ReactElement | null {
  const { colors } = useTheme();
  const source = useMemo(() => stepsSource(), []);
  const [shown, setShown] = useState<Shown>({ kind: 'none' });
  /** Each read takes a ticket; only the newest one's result is shown, so a slow read never overwrites a newer one. */
  const ticket = useRef(0);
  const mounted = useRef(false);
  const focused = useRef(false);
  /** While iOS's motion question is up. The app goes inactive and back behind it; that return must not read over its answer. */
  const asking = useRef(false);
  const locale = deviceLocale();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (ask: () => Promise<StepsPermission>): Promise<Shown> => {
      const mine = ++ticket.current;
      let next: Shown;
      let permission: StepsPermission;
      try {
        permission = await ask();
      } catch {
        permission = 'unavailable';
      }
      if (permission === 'granted') {
        const now = Date.now();
        const today = toLocalDate(now);
        try {
          const counts = await Promise.all(stepsWindows(today, now).map(({ start, end }) => source.stepsBetween(start, end)));
          next = { kind: 'granted', days: lastSevenDays(today), counts };
        } catch {
          next = { kind: 'failed' };
        }
      } else {
        next = { kind: permission === 'unavailable' ? 'none' : permission };
      }
      if (mounted.current && mine === ticket.current) setShown(next);
      return next;
    },
    [source],
  );

  const refresh = useCallback(() => {
    if (asking.current) return;
    void load(() => source.permission());
  }, [load, source]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      refresh();
      return () => {
        focused.current = false;
      };
    }, [refresh]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && focused.current) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const showSteps = async () => {
    flushAll();
    Keyboard.dismiss();
    asking.current = true;
    let next: Shown;
    try {
      next = await load(() => source.request());
    } finally {
      asking.current = false;
    }
    // The button is gone once this lands, so VoiceOver is told what took its place.
    if (next.kind === 'granted') announce(`${stepsCount(next.counts[next.counts.length - 1] ?? 0, locale)} steps today.`);
    else if (next.kind === 'denied') announce(DENIED);
    else if (next.kind === 'failed') announce(FAILED);
  };

  if (shown.kind === 'none') return null;

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
      <Label>Steps</Label>
      {shown.kind === 'undetermined' ? (
        <>
          <Body muted>{INVITE}</Body>
          <View style={{ alignItems: 'flex-start' }}>
            <Button label="Show steps" variant="secondary" size="compact" onPress={() => void showSteps()} />
          </View>
        </>
      ) : null}
      {shown.kind === 'denied' ? <Body muted>{DENIED}</Body> : null}
      {shown.kind === 'failed' ? <Body muted>{FAILED}</Body> : null}
      {shown.kind === 'granted' ? <StepsWeek days={shown.days} counts={shown.counts} locale={locale} /> : null}
    </View>
  );
}

/** Today's count over "steps today", the seven bars (today's last) with their weekday initials, and the average line. */
function StepsWeek({ days, counts, locale }: { days: string[]; counts: number[]; locale: string }): ReactElement {
  const { colors } = useTheme();
  const today = stepsCount(counts[counts.length - 1] ?? 0, locale);
  const tallest = Math.max(0, ...counts);
  return (
    <>
      <View accessible accessibilityLabel={`${today} steps today`} style={{ gap: 4 }}>
        <Num style={{ fontSize: 44 }}>{today}</Num>
        <Body muted>steps today</Body>
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={stepsSpoken(days, counts, locale)} style={{ flexDirection: 'row', gap: 8 }}>
        {days.map((day, i) => (
          <View key={day} style={{ flex: 1, minWidth: 3, gap: 6 }}>
            <View style={{ height: BAR_HEIGHT, backgroundColor: colors.surfaceRaised, justifyContent: 'flex-end', overflow: 'hidden' }}>
              <View
                testID={`steps-bar-${i}`}
                style={{ height: `${tallest > 0 ? (counts[i] / tallest) * 100 : 0}%`, backgroundColor: colors.text }}
              />
            </View>
            {/* Capped, as the body charts' labels are, so seven initials still fit side by side at the largest text on a 320pt phone. */}
            <Body muted maxFontSizeMultiplier={1.5} style={{ fontSize: 12, textAlign: 'center' }}>
              {weekdayInitial(day, locale)}
            </Body>
          </View>
        ))}
      </View>
      <Body muted>{stepsAverageLine(stepsAverage(counts), locale)}</Body>
    </>
  );
}
