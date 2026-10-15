import { Ionicons } from '@expo/vector-icons';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import type { WorkoutDetailExercise, WorkoutDetailSet } from '../../db/repositories/historyRepo';
import { formatRest } from '../../domain/dates';
import { historySetText } from '../../domain/history';
import { MARK_LABELS } from '../../domain/labels';
import { finishLine, type NextTime } from '../../domain/ruleLine';
import { spokenRest } from '../../domain/rest';
import { formatDuration, setLabels, setName } from '../../domain/setEntry';
import type { LoggingType, WeightUnit } from '../../domain/types';
import { Body, Display } from '../Text';
import { useTheme } from '../ThemeProvider';

/** Each block's next-time line (`finishLine`), or null when the rule left it none: matched by the block, not the name. */
export function nextLinesFor(exercises: readonly { workoutExerciseId: string }[], next: readonly NextTime[]): (string | null)[] {
  const byBlock = new Map(next.map((n) => [n.workoutExerciseId, n]));
  return exercises.map((e) => {
    const n = byBlock.get(e.workoutExerciseId);
    return n === undefined ? null : finishLine(n);
  });
}

/** A carry's distance unit in words (R607): "50 ft" is said "50 feet". */
const SPOKEN_DISTANCE: [RegExp, string][] = [
  [/^(\S+) ft\b/, '$1 feet'],
  [/^(\S+) yd\b/, '$1 yards'],
  [/^(\S+) m\b/, '$1 metres'],
];

/**
 * A set as the screen reader says it: "185 by 5", "Bodyweight by 12", "40 seconds", "70 lb by 1 minute 30 seconds",
 * "2 km, 12 minutes 30 seconds", and for the program types (R607) "50 feet, 315 lb, 32 seconds", "6 rounds and 4 reps"
 * and "7 minutes 42 seconds"; then ", RPE 8" when it has one.
 */
export function spokenSet(set: WorkoutDetailSet, position: number, loggingType: LoggingType, unit: WeightUnit): string {
  let text = historySetText({ ...set, position, rpe: null }, loggingType, unit);
  if (loggingType === 'rounds' && set.reps !== null) {
    const rounds = `${set.reps} ${set.reps === 1 ? 'round' : 'rounds'}`;
    const extra = set.extraReps ?? null;
    text = extra === null ? rounds : `${rounds} and ${extra} ${extra === 1 ? 'rep' : 'reps'}`;
  }
  if (set.durationS !== null) {
    const seconds = Math.max(0, Math.floor(set.durationS));
    const shown = [formatDuration(seconds), formatRest(seconds)].find((d) => text.endsWith(d));
    if (shown !== undefined) text = `${text.slice(0, -shown.length)}${spokenRest(seconds)}`;
  }
  if (loggingType === 'weighted_distance') for (const [unitText, words] of SPOKEN_DISTANCE) text = text.replace(unitText, words);
  text = text.replace(/^BW\b/, 'Bodyweight').replaceAll(' × ', ' by ').replaceAll(' · ', ', ');
  return set.rpe === null ? text : `${text}, RPE ${set.rpe}`;
}

/**
 * One exercise of a finished workout on the History detail (R165): its name (Title), "Something off: {Reason}" when it
 * was marked, the note saved with the workout led by the pencil (read-only), one row per set (its label, the set as
 * Previous writes it with its RPE, and a red "PR" on a flagged set: a PR mark may be red), then the next-time line.
 * Each set row reads as one: "Set 1, 185 by 5, personal best". Everything wraps with the phone's text size.
 */
export function DetailExercise({ exercise, unit, nextLine }: { exercise: WorkoutDetailExercise; unit: WeightUnit; nextLine: string | null }): ReactElement {
  const { colors } = useTheme();
  const labels = setLabels(exercise.sets.map((s) => s.setType));
  return (
    <View style={{ paddingVertical: 8, gap: 4 }}>
      <Display weight={700} accessibilityRole="header" style={{ fontSize: 22 }}>
        {exercise.name}
      </Display>
      {exercise.mark !== null && <Body muted style={{ fontSize: 14 }}>{`Something off: ${MARK_LABELS[exercise.mark]}`}</Body>}
      {exercise.note ? (
        <View accessible accessibilityLabel={`Note: ${exercise.note}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="pencil" size={14} color={colors.textMuted} />
          <Body muted style={{ flexShrink: 1, fontSize: 14 }}>
            {exercise.note}
          </Body>
        </View>
      ) : null}
      <View style={{ marginTop: 4, gap: 4 }}>
        {exercise.sets.map((s, i) => {
          const text = historySetText({ ...s, position: i }, exercise.loggingType, unit);
          const pr = s.prFlags !== 0;
          const said = [setName(labels[i]), spokenSet(s, i, exercise.loggingType, unit), ...(pr ? ['personal record'] : [])].join(', ');
          return (
            <View key={s.id} accessible accessibilityLabel={said} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
              <Body weight={600} muted style={{ minWidth: 24, fontVariant: ['tabular-nums'] }}>
                {labels[i]}
              </Body>
              <Body style={{ flexShrink: 1, fontVariant: ['tabular-nums'] }}>{text}</Body>
              {pr && (
                <Display weight={800} style={{ fontSize: 14, color: colors.red }}>
                  PR
                </Display>
              )}
            </View>
          );
        })}
      </View>
      {nextLine !== null && (
        <Body muted style={{ fontSize: 14, marginTop: 4 }}>
          {nextLine}
        </Body>
      )}
    </View>
  );
}
