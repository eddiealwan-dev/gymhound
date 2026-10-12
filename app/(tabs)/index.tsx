import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useDb } from '../../src/db/DbProvider';
import { getUpNext } from '../../src/db/repositories/routinesRepo';
import type { UpNext } from '../../src/db/repositories/routinesRepo';
import { getSettings, setSetting } from '../../src/db/repositories/settingsRepo';
import { ActiveWorkoutExistsError } from '../../src/db/repositories/workoutsRepo';
import { getActiveWorkoutView, getTrainingDates, getVolumeSetsSince } from '../../src/db/repositories/workoutViewsRepo';
import type { Db } from '../../src/db/types';
import { formatElapsed, formatTrainDate, greetingFor, mondayOf, toLocalDate } from '../../src/domain/dates';
import { formatRepScheme } from '../../src/domain/labels';
import { gearFor, type Gear } from '../../src/domain/plates';
import { computeStreak } from '../../src/domain/streak';
import type { DistanceUnit, WeightUnit } from '../../src/domain/types';
import { startDayLabel, upNextDayHasWeight, upNextLoad, upNextNeedsWeights, upNextOutcome, upNextSubtitle } from '../../src/domain/upNext';
import { formatVolume, totalVolume } from '../../src/domain/volume';
import { deviceLocale } from '../../src/platform/locale';
import { bumpData, useFocusedDbQuery } from '../../src/state/dataVersion';
import { startEmpty, startFromDay } from '../../src/state/sessionActions';
import { useNow } from '../../src/state/useNow';
import { Button } from '../../src/ui/Button';
import { Hint } from '../../src/ui/Hint';
import { Screen } from '../../src/ui/Screen';
import { Sheet } from '../../src/ui/Sheet';
import { Body, Display, Label, Num } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';
import { canUseRoutine, lockedRoutineReason, proReasonText } from '../../src/domain/routineLimit';
import { quoteFor } from '../../src/domain/quotes';
import { useIsPro } from '../../src/platform/entitlements';
import { useOpenPaywall } from '../../src/ui/pro/openPaywall';
import { WorkoutInProgressSheet } from '../../src/ui/WorkoutInProgressSheet';

const openSession = () => router.push('/session');

/** Train's first-run line about units (R407): which ones the phone's region chose, and where to change them. */
function unitsHintText(unit: WeightUnit, distanceUnit: DistanceUnit): string {
  return `Weights are in ${unit} and distances in ${distanceUnit}, from your phone's region. Change them in Settings.`;
}

/** What Train shows from the database. `weekStart` is the Monday on or before today. `gear` is the display unit's bar and plates. */
function readTrain(db: Db, weekStart: string) {
  const settings = getSettings(db);
  const { unit } = settings;
  const active = getActiveWorkoutView(db);
  const trainingDates = getTrainingDates(db);
  return {
    unit,
    distanceUnit: settings.distanceUnit,
    // Before the first finished workout, until dismissed, Train says which units it uses (R407).
    unitsHint: !settings.hintUnitsDismissed && trainingDates.length === 0,
    gear: gearFor(unit, settings),
    active:
      active === null
        ? null
        : {
            name: active.name,
            startedAt: active.startedAt,
            setsDone: active.exercises.reduce((n, exercise) => n + exercise.sets.filter((set) => set.done).length, 0),
          },
    upNext: getUpNext(db),
    trainingDates,
    weekVolume: totalVolume(getVolumeSetsSince(db, weekStart), unit),
  };
}

function Card({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>{children}</View>
  );
}

/**
 * The workout in progress, with an elapsed clock that ticks every second, and the quiet Change routine at its foot, as
 * on Up next (Round 4). The routine can't change while a workout runs, so it says so (`onChangeRoutine`, R80).
 */
function ResumeCard({
  name,
  startedAt,
  setsDone,
  onChangeRoutine,
}: {
  name: string;
  startedAt: number;
  setsDone: number;
  onChangeRoutine: () => void;
}) {
  const now = useNow(1000);
  return (
    <Card>
      <Label>IN PROGRESS</Label>
      <Display weight={800} style={{ fontSize: 32, marginTop: 4 }}>
        {name}
      </Display>
      <Body muted style={{ marginBottom: 16, fontVariant: ['tabular-nums'] }}>
        {`${formatElapsed(now - startedAt)} · ${setsDone} ${setsDone === 1 ? 'set' : 'sets'} done`}
      </Body>
      <Button label="Resume" onPress={openSession} />
      <ChangeRoutineLink onPress={onChangeRoutine} />
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
      {/* The Label style UP NEXT uses, as Fuel's CALORIES LEFT does under its number; not a heading here. */}
      <Label accessibilityRole="none">{label}</Label>
      {/* A common minimum height keeps the captions of the two cards level. Native also shrinks the number when the phone's
          text size is turned up. No fixed line height, as for the date (R79): iOS shrinks only the font to fit. */}
      <View style={{ minHeight: 52, justifyContent: 'center' }}>
        <Num adjustsFontSizeToFit minimumFontScale={0.5} numberOfLines={1} style={{ fontSize }}>
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

const openRoutines = () => router.push('/routines');

/**
 * A quiet link at the foot of the Up next and Resume cards. It opens Routines unless `onPress` says otherwise. Its 44pt
 * target reaches 12pt into the card's bottom padding, so the words sit as far from the card's bottom edge as the label
 * does from its top (16pt) instead of floating 28pt above it.
 */
function ChangeRoutineLink({ onPress = openRoutines }: { onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Change routine"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        minHeight: 44,
        marginTop: 4,
        marginBottom: -12,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Body weight={600}>Change routine</Body>
      <Ionicons name="chevron-forward" size={18} color={colors.text} />
    </Pressable>
  );
}

/**
 * The next day of the active routine: its name, when it was last done, a button that starts it, and its exercises,
 * each with its load in the display unit and how it went last time.
 */
function UpNextCard({
  upNext,
  unit,
  gear,
  locale,
  onStart,
}: {
  upNext: UpNext;
  unit: WeightUnit;
  gear: Gear;
  locale: string;
  onStart: (dayId: string) => void;
}) {
  const dayHasWeight = upNextDayHasWeight(upNext.exercises);
  return (
    <Card>
      <Label>UP NEXT</Label>
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
        const load = upNextLoad(exercise, dayHasWeight, unit, gear);
        const scheme = formatRepScheme(exercise.setCount, exercise.repMin, exercise.repMax, exercise.loggingType);
        const outcome = upNextOutcome(exercise, unit, gear) ?? '';
        // At a large text size the scheme drops under the name rather than squeezing it. The name's flex basis stays
        // 'auto' (not flex: 1, whose basis of 0 would keep the row from ever wrapping); when both fit it grows and
        // pushes the scheme to the right edge. The 14pt scheme sits on the 16pt name's baseline, not its top.
        return (
          <View
            key={exercise.routineExerciseId}
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, paddingVertical: 8 }}
          >
            <Body style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>{exercise.name}</Body>
            <Body muted style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
              {`${load === null ? scheme : `${scheme} · ${load}`}${outcome}`}
            </Body>
          </View>
        );
      })}
      <ChangeRoutineLink />
    </Card>
  );
}

/**
 * The active routine can't be used now (§18.21, R526): a program outside free, or a routine of your own kept after Pro
 * ended. Its name, why, **See Pro**, and Change routine to pick one free holds. Nothing about it is lost.
 */
function LockedUpNextCard({ upNext }: { upNext: UpNext }) {
  const openPaywall = useOpenPaywall();
  return (
    <Card>
      <Label>UP NEXT</Label>
      <Display weight={700} style={{ fontSize: 24, marginTop: 4 }}>
        {upNext.routineName}
      </Display>
      <Body muted style={{ marginTop: 4 }}>
        {proReasonText(lockedRoutineReason({ name: upNext.routineName, isPremade: upNext.routineIsPremade }))}
      </Body>
      <View style={{ marginTop: 16, marginBottom: 8 }}>
        <Button label="See Pro" onPress={openPaywall} />
      </View>
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
/** The day's quote and, muted under it, who said it (R541). Read as one: the quote, then the name. */
function DailyQuote({ localDate }: { localDate: string }) {
  const quote = quoteFor(localDate);
  return (
    <View accessible accessibilityLabel={`${quote.text} ${quote.by}`} style={{ marginTop: 4, gap: 2 }}>
      <Body testID="daily-quote" style={{ fontSize: 15, lineHeight: 21 }}>
        {quote.text}
      </Body>
      <Body testID="daily-quote-by" muted style={{ fontSize: 13, lineHeight: 18 }}>
        {`— ${quote.by}`}
      </Body>
    </View>
  );
}

export default function Train() {
  const db = useDb();
  const { colors } = useTheme();
  const now = useNow(60_000);
  const today = toLocalDate(now);
  const locale = deviceLocale();
  const pro = useIsPro();
  const weekStart = mondayOf(today);
  const read = useCallback((d: Db) => readTrain(d, weekStart), [weekStart]);
  // Focused only: Train stays mounted under the session, and every tick there bumps the data version. Reading the whole
  // active workout, Up next, every training date and the week's volume again on each tick was wasted while out of sight;
  // a bump while away is read when Train is back in view (R185).
  const { unit, distanceUnit, unitsHint, gear, active, upNext, trainingDates, weekVolume } = useFocusedDbQuery(read);
  const [blocked, setBlocked] = useState(false);
  /** Change routine was tapped while a workout runs (R80). */
  const [changeBlocked, setChangeBlocked] = useState(false);
  /** A start failed for a reason other than a workout in progress. */
  const [startFailed, setStartFailed] = useState(false);

  const streak = computeStreak(trainingDates, today);

  /**
   * Starts a workout and opens it, unless one is already active. Then a sheet says to finish or discard it first; any
   * other failure says "Couldn't start. Try again.", as a saved workout and Repeat do.
   */
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
      // Nothing was started; a press handler must not throw.
      console.warn('GymHound could not start the workout.', error);
      setStartFailed(true);
      return;
    }
    openSession();
  };
  const startEmptyWorkout = () => begin(() => startEmpty(db));

  return (
    <Screen footer>
      <Display weight={700} style={{ fontSize: 20, letterSpacing: 0.5, color: colors.textMuted }}>
        {greetingFor(new Date(now))}
      </Display>
      {/* The day's quote, a new one each day (R530, R541), under the greeting, with who said it. One stop for VoiceOver. */}
      <DailyQuote localDate={today} />
      {/* Half the size it was (the owner, after Round 8: 56 to 28). One line that shrinks to fit at any text size (R79). No
          fixed line height: iOS shrinks only the font to fit, never the line height, so the date is never lost. */}
      <Display weight={800} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.3} style={{ fontSize: 28, marginTop: 12 }}>
        {formatTrainDate(new Date(now), locale)}
      </Display>

      <View style={{ marginTop: 16 }}>
        {active !== null ? (
          <ResumeCard
            name={active.name}
            startedAt={active.startedAt}
            setsDone={active.setsDone}
            onChangeRoutine={() => setChangeBlocked(true)}
          />
        ) : upNext !== null && !canUseRoutine({ id: upNext.routineId, isPremade: upNext.routineIsPremade }, pro) ? (
          <LockedUpNextCard upNext={upNext} />
        ) : upNext !== null ? (
          <UpNextCard upNext={upNext} unit={unit} gear={gear} locale={locale} onStart={(dayId) => begin(() => startFromDay(db, dayId))} />
        ) : (
          <NoRoutineCard onStartEmpty={startEmptyWorkout} />
        )}
      </View>

      {unitsHint === true && active === null ? (
        <Hint
          style={{ marginTop: 16 }}
          text={unitsHintText(unit, distanceUnit)}
          onDismiss={() => {
            setSetting(db, 'hintUnitsDismissed', true);
            bumpData();
          }}
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
        <StatCard label="Streak" value={`${streak}`} caption={streak === 1 ? 'day' : 'days'} />
        <StatCard label="This week" value={volumeNumber(weekVolume, unit, locale)} caption={`${unit} moved`} />
      </View>

      {active === null && upNext !== null ? (
        <View style={{ marginTop: 16 }}>
          <Button label="Start empty workout" variant="secondary" onPress={startEmptyWorkout} />
        </View>
      ) : null}

      {/* The same question Routines, a saved workout and History ask, in the words spec 8.3 gives it. */}
      <WorkoutInProgressSheet visible={blocked} onClose={() => setBlocked(false)} body="Finish or discard the workout in progress first." />
      <WorkoutInProgressSheet visible={changeBlocked} onClose={() => setChangeBlocked(false)} />
      <Sheet visible={startFailed} onClose={() => setStartFailed(false)}>
        <Body style={{ marginBottom: 16 }}>Couldn't start. Try again.</Body>
        <Button label="OK" onPress={() => setStartFailed(false)} />
      </Sheet>
    </Screen>
  );
}
