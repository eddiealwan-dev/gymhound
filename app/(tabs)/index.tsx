import { getLocales } from 'expo-localization';
import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useDb } from '../../src/db/DbProvider';
import { getUpNext } from '../../src/db/repositories/routinesRepo';
import type { UpNext } from '../../src/db/repositories/routinesRepo';
import { getSettings } from '../../src/db/repositories/settingsRepo';
import { ActiveWorkoutExistsError } from '../../src/db/repositories/workoutsRepo';
import { getActiveWorkoutView, getTrainingDates, getVolumeSetsSince } from '../../src/db/repositories/workoutViewsRepo';
import type { Db } from '../../src/db/types';
import { formatElapsed, formatTrainDate, fromLocalDate, greetingFor, mondayOf, toLocalDate } from '../../src/domain/dates';
import { DAY_MARK_LABELS, formatRepScheme } from '../../src/domain/labels';
import { computeStreak } from '../../src/domain/streak';
import type { WeightUnit } from '../../src/domain/types';
import { formatWeight } from '../../src/domain/units';
import { formatVolume, totalVolume } from '../../src/domain/volume';
import { useDbQuery } from '../../src/state/dataVersion';
import { startEmpty, startFromDay } from '../../src/state/sessionActions';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Sheet } from '../../src/ui/Sheet';
import { Body, Display, Num } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';

/** The session screen arrives in Task 14. Until its route exists the typed router does not know it, hence the cast. */
const openSession = () => router.push('/session' as Href);

const deviceLocale = () => getLocales()[0]?.languageTag ?? 'en-US';

/** Reads the clock now, then again every `everyMs` while this screen is focused, so a screen left in the background does no work. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const timer = setInterval(() => setNow(Date.now()), everyMs);
      return () => clearInterval(timer);
    }, [everyMs]),
  );
  return now;
}

/** What Train shows from the database. `weekStart` is the Monday on or before today. */
function readTrain(db: Db, weekStart: string) {
  const { unit } = getSettings(db);
  const active = getActiveWorkoutView(db);
  return {
    unit,
    active:
      active === null
        ? null
        : {
            name: active.name,
            startedAt: active.startedAt,
            setsDone: active.exercises.reduce((n, exercise) => n + exercise.sets.filter((set) => set.done).length, 0),
          },
    upNext: getUpNext(db),
    trainingDates: getTrainingDates(db),
    weekVolume: totalVolume(getVolumeSetsSince(db, weekStart), unit),
  };
}

function Card({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>{children}</View>
  );
}

/** The workout in progress, with an elapsed clock that ticks every second. */
function ResumeCard({ name, startedAt, setsDone }: { name: string; startedAt: number; setsDone: number }) {
  const now = useNow(1000);
  return (
    <View style={{ marginTop: 16 }}>
      <Card>
        <Body weight={600} muted style={{ fontSize: 14 }}>
          Resume
        </Body>
        <Display weight={800} style={{ fontSize: 32, marginTop: 4 }}>
          {name}
        </Display>
        <Body muted style={{ marginBottom: 16, fontVariant: ['tabular-nums'] }}>
          {`${formatElapsed(now - startedAt)} · ${setsDone} ${setsDone === 1 ? 'set' : 'sets'} done`}
        </Body>
        <Button label="Resume" onPress={openSession} />
      </Card>
    </View>
  );
}

/** The big number's size: 44, and smaller in proportion once it is longer than the 5 characters that fit a card at 320 wide. The web build cannot shrink text to fit, so this does it. */
const statFontSize = (value: string) => Math.min(44, Math.floor((44 * 5) / value.length));

/** A label, one big number and a small line under it. Two of these sit side by side at equal width. */
function StatCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  const { colors } = useTheme();
  const fontSize = statFontSize(value);
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>
      <Body weight={600} muted style={{ fontSize: 14 }}>
        {label}
      </Body>
      {/* A common minimum height keeps the captions of the two cards level. Native also shrinks the number when the phone's text size is turned up. */}
      <View style={{ minHeight: 52, justifyContent: 'center' }}>
        <Num adjustsFontSizeToFit numberOfLines={1} style={{ fontSize, lineHeight: Math.round(fontSize * 1.18) }}>
          {value}
        </Num>
      </View>
      <Body muted style={{ fontSize: 14 }}>
        {caption}
      </Body>
    </View>
  );
}

/** The number from `formatVolume`, without its unit: the card says "lb moved" itself. */
function volumeNumber(n: number, unit: WeightUnit, locale: string): string {
  const text = formatVolume(n, unit, locale);
  return text.slice(0, text.length - unit.length - 1);
}

/** The next day of the active routine, or a prompt to pick one. */
function UpNextCard({ upNext, locale, onStart }: { upNext: UpNext | null; locale: string; onStart: (dayId: string) => void }) {
  const { colors } = useTheme();
  if (upNext === null) {
    return (
      <Card>
        <Body style={{ marginBottom: 16 }}>{"Pick a routine to see what's up next."}</Body>
        <Button label="Routines" variant="secondary" onPress={() => router.push('/routines')} />
      </Card>
    );
  }
  const { lastTime } = upNext;
  return (
    <Card>
      <Display weight={700} style={{ fontSize: 24 }}>
        {`${upNext.routineName} · ${upNext.dayName}`}
      </Display>
      <Body muted style={{ fontSize: 14, marginBottom: 8 }}>
        {lastTime === null
          ? 'First time on this day.'
          : `Last time: ${formatTrainDate(fromLocalDate(lastTime.localDate), locale)} · ${DAY_MARK_LABELS[lastTime.dayMark]}`}
      </Body>
      {upNext.exercises.map((exercise, index) => {
        // Timed and distance exercises carry no weight, so there is nothing to pick.
        const hasLoad = exercise.loggingType !== 'timed' && exercise.loggingType !== 'distance_time';
        const load =
          exercise.nextWeight !== null && exercise.nextWeightUnit !== null
            ? formatWeight(exercise.nextWeight, exercise.nextWeightUnit)
            : 'pick a weight';
        return (
          <View
            key={exercise.routineExerciseId}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Body weight={600}>{exercise.name}</Body>
              <Body muted style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
                {formatRepScheme(exercise.setCount, exercise.repMin, exercise.repMax, exercise.loggingType)}
              </Body>
            </View>
            {hasLoad ? (
              <Body weight={exercise.nextWeight === null ? 400 : 600} muted={exercise.nextWeight === null} style={{ flexShrink: 0, fontVariant: ['tabular-nums'] }}>
                {load}
              </Body>
            ) : null}
          </View>
        );
      })}
      <View style={{ marginTop: 8 }}>
        <Button label="Start this" onPress={() => onStart(upNext.dayId)} />
      </View>
    </Card>
  );
}

/** Train: today's date, the streak and the week's volume, ways to start a workout, and what is up next (or the workout in progress). */
export default function Train() {
  const db = useDb();
  const { colors } = useTheme();
  const now = useNow(60_000);
  const today = toLocalDate(now);
  const locale = deviceLocale();
  const weekStart = mondayOf(today);
  const read = useCallback((d: Db) => readTrain(d, weekStart), [weekStart]);
  const { unit, active, upNext, trainingDates, weekVolume } = useDbQuery(read);
  const [blocked, setBlocked] = useState(false);

  const streak = computeStreak(trainingDates, today);

  /** Starts a workout and opens it, unless one is already active. Then a sheet says to finish or discard it first. */
  const begin = (start: () => void) => {
    if (active !== null) {
      setBlocked(true);
      return;
    }
    try {
      start();
    } catch (error) {
      if (error instanceof ActiveWorkoutExistsError) {
        setBlocked(true);
        return;
      }
      throw error;
    }
    openSession();
  };

  return (
    <Screen footer>
      <Display weight={700} style={{ fontSize: 20, letterSpacing: 0.5, color: colors.textMuted }}>
        {greetingFor(new Date(now))}
      </Display>
      <Display weight={800} adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: 56, lineHeight: 60 }}>
        {formatTrainDate(new Date(now), locale)}
      </Display>

      {active !== null ? <ResumeCard name={active.name} startedAt={active.startedAt} setsDone={active.setsDone} /> : null}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
        <StatCard label="Streak" value={`${streak}`} caption={streak === 1 ? 'day' : 'days'} />
        <StatCard label="This week" value={volumeNumber(weekVolume, unit, locale)} caption={`${unit} moved`} />
      </View>

      <View style={{ gap: 8, marginTop: 16 }}>
        <Button label="Start empty" onPress={() => begin(() => startEmpty(db))} />
        <Button label="Routines" variant="secondary" onPress={() => router.push('/routines')} />
      </View>

      {active === null ? (
        <View style={{ marginTop: 16 }}>
          <UpNextCard upNext={upNext} locale={locale} onStart={(dayId) => begin(() => startFromDay(db, dayId))} />
        </View>
      ) : null}

      <Sheet visible={blocked} onClose={() => setBlocked(false)}>
        <Body style={{ marginBottom: 16 }}>Finish or discard the workout in progress first.</Body>
        <Button
          label="Resume"
          onPress={() => {
            setBlocked(false);
            openSession();
          }}
        />
      </Sheet>
    </Screen>
  );
}
