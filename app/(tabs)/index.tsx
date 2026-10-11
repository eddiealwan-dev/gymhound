import { Ionicons } from '@expo/vector-icons';
import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useDb } from '../../src/db/DbProvider';
import { getUpNext } from '../../src/db/repositories/routinesRepo';
import type { UpNext } from '../../src/db/repositories/routinesRepo';
import { getSettings } from '../../src/db/repositories/settingsRepo';
import { ActiveWorkoutExistsError } from '../../src/db/repositories/workoutsRepo';
import { getActiveWorkoutView, getTrainingDates, getVolumeSetsSince } from '../../src/db/repositories/workoutViewsRepo';
import type { Db } from '../../src/db/types';
import { formatElapsed, formatTrainDate, greetingFor, mondayOf, toLocalDate } from '../../src/domain/dates';
import { formatRepScheme } from '../../src/domain/labels';
import { computeStreak } from '../../src/domain/streak';
import type { WeightUnit } from '../../src/domain/types';
import { startDayLabel, upNextDayHasWeight, upNextLoad, upNextNeedsWeights, upNextSubtitle } from '../../src/domain/upNext';
import { formatVolume, totalVolume } from '../../src/domain/volume';
import { useDbQuery } from '../../src/state/dataVersion';
import { startEmpty, startFromDay } from '../../src/state/sessionActions';
import { useNow } from '../../src/state/useNow';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { afterSheetCloses, Sheet } from '../../src/ui/Sheet';
import { Body, Display, Num } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';

const openSession = () => router.push('/session');

const deviceLocale = () => getLocales()[0]?.languageTag ?? 'en-US';

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

/** A small upper-case label over a card's title: "UP NEXT", "IN PROGRESS". */
function Eyebrow({ children }: { children: string }) {
  return (
    <Body weight={600} muted style={{ fontSize: 14, letterSpacing: 0.5 }}>
      {children}
    </Body>
  );
}

/** The workout in progress, with an elapsed clock that ticks every second. */
function ResumeCard({ name, startedAt, setsDone }: { name: string; startedAt: number; setsDone: number }) {
  const now = useNow(1000);
  return (
    <Card>
      <Eyebrow>IN PROGRESS</Eyebrow>
      <Display weight={800} style={{ fontSize: 32, marginTop: 4 }}>
        {name}
      </Display>
      <Body muted style={{ marginBottom: 16, fontVariant: ['tabular-nums'] }}>
        {`${formatElapsed(now - startedAt)} · ${setsDone} ${setsDone === 1 ? 'set' : 'sets'} done`}
      </Body>
      <Button label="Resume" onPress={openSession} />
    </Card>
  );
}

/**
 * The big number's size. On the phone it is always 44 and `adjustsFontSizeToFit` shrinks it only when it must.
 * The web build cannot shrink text to fit, so there it steps down in proportion once the number is longer than the 5 characters that fit a card at 320 wide.
 */
const statFontSize = (value: string) => (Platform.OS === 'web' ? Math.min(44, Math.floor((44 * 5) / value.length)) : 44);

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
        <Num adjustsFontSizeToFit minimumFontScale={0.5} numberOfLines={1} style={{ fontSize, lineHeight: Math.round(fontSize * 1.18) }}>
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

/** A quiet link at the foot of the Up next card that opens Routines. */
function ChangeRoutineLink() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Change routine"
      hitSlop={4}
      onPress={() => router.push('/routines')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        minHeight: 44,
        marginTop: 4,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Body weight={600}>Change routine</Body>
      <Ionicons name="chevron-forward" size={18} color={colors.text} />
    </Pressable>
  );
}

/** The next day of the active routine: its name, when it was last done, a button that starts it, and its exercises. */
function UpNextCard({ upNext, locale, onStart }: { upNext: UpNext; locale: string; onStart: (dayId: string) => void }) {
  const dayHasWeight = upNextDayHasWeight(upNext.exercises);
  return (
    <Card>
      <Eyebrow>UP NEXT</Eyebrow>
      <Display weight={700} style={{ fontSize: 24, marginTop: 4 }}>
        {`${upNext.routineName} · ${upNext.dayName}`}
      </Display>
      <Body muted style={{ fontSize: 14 }}>
        {upNextSubtitle(upNext.lastTime, upNextNeedsWeights(upNext.exercises), locale)}
      </Body>
      <View style={{ marginTop: 16, marginBottom: 8 }}>
        <Button label={startDayLabel(upNext.routineName, upNext.dayName)} onPress={() => onStart(upNext.dayId)} />
      </View>
      {upNext.exercises.map((exercise) => {
        const load = upNextLoad(exercise, dayHasWeight);
        const scheme = formatRepScheme(exercise.setCount, exercise.repMin, exercise.repMax, exercise.loggingType);
        // At a large text size the scheme drops under the name rather than squeezing it. The name's flex basis stays
        // 'auto' (not flex: 1, whose basis of 0 would keep the row from ever wrapping); when both fit it grows and
        // pushes the scheme to the right edge.
        return (
          <View key={exercise.routineExerciseId} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, paddingVertical: 8 }}>
            <Body style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>{exercise.name}</Body>
            <Body muted style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
              {load === null ? scheme : `${scheme} · ${load}`}
            </Body>
          </View>
        );
      })}
      <ChangeRoutineLink />
    </Card>
  );
}

/** No routine is active: a way to choose one, or to start a workout without one. */
function NoRoutineCard({ onStartEmpty }: { onStartEmpty: () => void }) {
  return (
    <Card>
      <Body style={{ marginBottom: 16 }}>No routine yet. Pick one and Train will line up your next workout.</Body>
      <View style={{ gap: 8 }}>
        <Button label="Choose a routine" onPress={() => router.push('/routines')} />
        <Button label="Start empty workout" variant="secondary" onPress={onStartEmpty} />
      </View>
    </Card>
  );
}

/**
 * Train: today's date, then the workout in progress, what is up next, or a way to choose a routine; then the streak
 * and the week's volume, and, under Up next, a way to start an empty workout.
 */
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
  const startEmptyWorkout = () => begin(() => startEmpty(db));

  return (
    <Screen footer>
      <Display weight={700} style={{ fontSize: 20, letterSpacing: 0.5, color: colors.textMuted }}>
        {greetingFor(new Date(now))}
      </Display>
      <Display weight={800} adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: 56, lineHeight: 60 }}>
        {formatTrainDate(new Date(now), locale)}
      </Display>

      <View style={{ marginTop: 16 }}>
        {active !== null ? (
          <ResumeCard name={active.name} startedAt={active.startedAt} setsDone={active.setsDone} />
        ) : upNext !== null ? (
          <UpNextCard upNext={upNext} locale={locale} onStart={(dayId) => begin(() => startFromDay(db, dayId))} />
        ) : (
          <NoRoutineCard onStartEmpty={startEmptyWorkout} />
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
        <StatCard label="Streak" value={`${streak}`} caption={streak === 1 ? 'day' : 'days'} />
        <StatCard label="This week" value={volumeNumber(weekVolume, unit, locale)} caption={`${unit} moved`} />
      </View>

      {active === null && upNext !== null ? (
        <View style={{ marginTop: 16 }}>
          <Button label="Start empty workout" variant="secondary" onPress={startEmptyWorkout} />
        </View>
      ) : null}

      <Sheet visible={blocked} onClose={() => setBlocked(false)}>
        <Body style={{ marginBottom: 16 }}>Finish or discard the workout in progress first.</Body>
        <Button
          label="Resume"
          onPress={() => {
            setBlocked(false);
            afterSheetCloses(openSession);
          }}
        />
      </Sheet>
    </Screen>
  );
}
