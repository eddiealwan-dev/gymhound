import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { getLift, liftSessions } from '../../../src/db/repositories/liftsRepo';
import { getSettings } from '../../../src/db/repositories/settingsRepo';
import type { Db } from '../../../src/db/types';
import { chartSummary, markedSummary, pointsInRange, rangeChange } from '../../../src/domain/chart';
import type { ChartRange } from '../../../src/domain/chart';
import { calendarDayTitle, toLocalDate } from '../../../src/domain/dates';
import { MARK_LABELS } from '../../../src/domain/labels';
import { liftMetric, liftPoints, liftRecords, sessionText } from '../../../src/domain/liftStats';
import type { LiftMetric, LiftPoint, LiftRecord, LiftSession } from '../../../src/domain/liftStats';
import { formatDuration } from '../../../src/domain/setEntry';
import type { LoggingType, WeightUnit } from '../../../src/domain/types';
import { formatWeight } from '../../../src/domain/units';
import { deviceLocale } from '../../../src/platform/locale';
import { useFocusedDbQuery } from '../../../src/state/dataVersion';
import { flushAll } from '../../../src/state/draftFlush';
import { BackLink } from '../../../src/ui/BackLink';
import { RangeChips } from '../../../src/ui/body/BodyLog';
import { Button } from '../../../src/ui/Button';
import { LineChart } from '../../../src/ui/charts/LineChart';
import { Screen } from '../../../src/ui/Screen';
import { spokenLift as spoken } from '../../../src/ui/stats/LiftsSection';
import { Body, Label, ScreenTitle } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';

/** Sessions listed before **Show all**. */
const SESSION_LIMIT = 10;

/** Back where it was opened from; a link opened with no history goes to /lifts. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/lifts');
}

function openWorkout(workoutId: string) {
  flushAll();
  Keyboard.dismiss();
  router.push(`/history/${workoutId}`);
}

/** What the chart shows, in the words under the title (R173). Assisted charts the assistance. */
function metricCaption(metric: LiftMetric, loggingType: LoggingType): string {
  if (metric === 'best_reps') return 'Most reps in a set, per session';
  if (metric === 'longest_hold') return 'Longest hold per session';
  return loggingType === 'assisted' ? 'Assistance per session' : 'Working weight per session';
}

/** A chart value or a change as shown: "185 lb", "12 reps", "1:30". */
function valueFormat(metric: LiftMetric, unit: WeightUnit): (v: number) => string {
  if (metric === 'best_reps') return (v) => `${v} ${v === 1 ? 'rep' : 'reps'}`;
  if (metric === 'longest_hold') return (v) => formatDuration(v);
  return (v) => formatWeight(v, unit);
}

/** A row that opens a workout: at least 44pt, a hairline under it, its text wrapping at a large text size. */
/** A session or a record. `onPress` opens its workout; without it (opened from a workout in progress) it is only read. */
function WorkoutRow({ label, onPress, children }: { label: string; onPress?: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={onPress === undefined}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        gap: 2,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

/** Under a lift's chart while it has one session: a single dot, no line yet (R402). */
const ONE_SESSION = 'One session so far. Your next one starts the line.';

/**
 * The chart of `points` in the chosen range (3M by default, 1Y, All), the change across it, the hollow-point key when
 * a hollow point is in range, and the range chips (R173, R175). The whole chart reads as one sentence.
 */
function LiftChart({ points, caption, format, today, locale }: { points: LiftPoint[]; caption: string; format: (v: number) => string; today: string; locale: string }) {
  const { colors } = useTheme();
  const [range, setRange] = useState<ChartRange>('3M');
  // pointsInRange filters the points it is given, so each keeps its mark and label.
  const shown = pointsInRange(points, range, today) as LiftPoint[];
  const change = rangeChange(shown, format, locale);
  const anyHollow = shown.some((pt) => pt.hollow);
  return (
    <View style={{ gap: 12 }}>
      {points.length === 0 ? (
        <Body muted>No chart for this lift yet.</Body>
      ) : shown.length === 0 ? (
        <Body muted>No sessions in this range.</Body>
      ) : (
        <LineChart
          points={shown}
          formatValue={format}
          locale={locale}
          dotFill={colors.bg}
          accessibilityLabel={`${caption}. ${chartSummary(shown, format, locale)}${markedSummary(shown, locale)}`}
        />
      )}
      {change !== null ? <Body muted>{change}</Body> : null}
      {/* One session ever is one dot: say how the line starts (R402). */}
      {points.length === 1 ? <Body muted>{ONE_SESSION}</Body> : null}
      {anyHollow ? <Body muted>Hollow points are sessions with something off.</Body> : null}
      {/* With nothing to chart in any range, the chips would change nothing. */}
      {points.length > 0 ? <RangeChips value={range} onChange={setRange} /> : null}
    </View>
  );
}

/** A record: its title (Body 600), its value in the unit logged, and its day, muted; opens its workout (R174). */
function RecordRow({ record, today, locale, onPress }: { record: LiftRecord; today: string; locale: string; onPress?: () => void }) {
  const day = calendarDayTitle(record.localDate, today, locale);
  return (
    <WorkoutRow label={`${record.title}, ${spoken(record.value)}, ${day}`} onPress={onPress}>
      <Body weight={600}>{record.title}</Body>
      <Body style={{ fontVariant: ['tabular-nums'] }}>{record.value}</Body>
      <Body muted>{day}</Body>
    </WorkoutRow>
  );
}

/**
 * A lift's chart, records and sessions. `fromWorkout` (Stats on an exercise in a workout, R554) shows it over the
 * workout: its rows don't open other workouts, which would leave the one in progress.
 */
export function LiftDetail({ id, fromWorkout = false }: { id: string; fromWorkout?: boolean }) {
  const read = useCallback(
    (db: Db) => {
      const lift = getLift(db, id);
      return { lift, sessions: lift ? liftSessions(db, id) : [], unit: getSettings(db).unit };
    },
    [id],
  );
  const { lift, sessions, unit } = useFocusedDbQuery(read);
  const [showAll, setShowAll] = useState(false);
  const today = toLocalDate(Date.now());
  const locale = deviceLocale();

  if (!lift || sessions.length === 0) {
    return (
      <Screen>
        <BackLink label="Back" accessibilityLabel="Back" onPress={leave} />
        {lift ? <ScreenTitle>{lift.name}</ScreenTitle> : null}
        <Body muted style={{ marginTop: 8 }}>
          {lift ? 'No sessions yet. Its chart and history fill in once you log it.' : "This lift isn't in your history."}
        </Body>
      </Screen>
    );
  }
  const open = (workoutId: string) => (fromWorkout ? undefined : () => openWorkout(workoutId));

  const metric = liftMetric(lift.loggingType, sessions);
  const points = liftPoints(lift.loggingType, sessions, unit);
  const records = liftRecords(lift.loggingType, sessions);
  const caption = metricCaption(metric, lift.loggingType);
  // A session's reason, or "Stall" as its point carries it (R173, R190).
  const pointLabel = new Map(points.map((pt) => [pt.workoutId, pt.label]));
  const tagOf = (s: LiftSession) => (s.mark !== null ? MARK_LABELS[s.mark] : (pointLabel.get(s.workoutId) ?? null));
  const newestFirst = [...sessions].reverse();
  const listed = showAll ? newestFirst : newestFirst.slice(0, SESSION_LIMIT);

  return (
    <Screen>
      <BackLink label="Back" accessibilityLabel="Back" onPress={leave} />
      <ScreenTitle>{lift.name}</ScreenTitle>
      {metric === 'none' ? (
        <Body muted style={{ marginTop: 4 }}>
          Distance and time show records only.
        </Body>
      ) : (
        <>
          <Body muted style={{ marginTop: 4 }}>
            {caption}
          </Body>
          <View style={{ marginTop: 16 }}>
            <LiftChart points={points} caption={caption} format={valueFormat(metric, unit)} today={today} locale={locale} />
          </View>
        </>
      )}

      {records.length > 0 ? (
        <View style={{ marginTop: 32 }}>
          <Label style={{ marginBottom: 8 }}>Records</Label>
          {records.map((record) => (
            <RecordRow key={record.kind} record={record} today={today} locale={locale} onPress={open(record.workoutId)} />
          ))}
        </View>
      ) : null}

      <View style={{ marginTop: 32 }}>
        <Label style={{ marginBottom: 8 }}>Sessions</Label>
        {listed.map((s) => {
          const day = calendarDayTitle(s.localDate, today, locale);
          const sets = sessionText(lift.loggingType, s, unit);
          const tag = tagOf(s);
          return (
            <WorkoutRow
              key={s.workoutId}
              label={[day, spoken(sets), tag].filter((part) => part !== null && part !== '').join(', ')}
              onPress={open(s.workoutId)}
            >
              <Body muted>{day}</Body>
              <Body style={{ fontVariant: ['tabular-nums'] }}>{`${sets}${tag !== null ? ` · ${tag}` : ''}`}</Body>
            </WorkoutRow>
          );
        })}
        {!showAll && newestFirst.length > SESSION_LIMIT ? (
          <View style={{ alignSelf: 'flex-start', marginLeft: -20, marginTop: 4 }}>
            <Button label="Show all" variant="quiet" onPress={() => setShowAll(true)} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * A lift (R173–R175), a hidden tab route under Stats: what is charted, the chart of each session with marked sessions
 * hollow and labelled, the change across the range, the records (each opening its workout) and the sessions, newest
 * first, ten and then **Show all**. Distance and time show records only. No footer (§18.4).
 */
export default function Lift() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LiftDetail key={String(id)} id={String(id)} />;
}
