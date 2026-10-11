import { Ionicons } from '@expo/vector-icons';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import type { WorkoutDetailExercise } from '../../db/repositories/historyRepo';
import { historySetText } from '../../domain/history';
import { MARK_LABELS } from '../../domain/labels';
import { finishLine, type NextTime } from '../../domain/ruleLine';
import { setLabels, setName } from '../../domain/setEntry';
import type { WeightUnit } from '../../domain/types';
import { Body, Display } from '../Text';
import { useTheme } from '../ThemeProvider';

/**
 * Each exercise's next-time line (`finishLine`), or null. The summary's lines come in workout order, one for each
 * exercise the rule left a weight for, so each is matched to the next exercise of its name.
 */
export function nextLinesFor(exercises: readonly { name: string }[], next: readonly NextTime[]): (string | null)[] {
  let k = 0;
  return exercises.map((e) => {
    if (k < next.length && next[k].name === e.name) return finishLine(next[k++]);
    return null;
  });
}

/** A set as the screen reader says it: "185 by 5", "Bodyweight by 12", ", RPE 8" for " @ 8". */
function spokenSet(text: string): string {
  return text.replace(/^BW\b/, 'Bodyweight').replaceAll(' × ', ' by ').replace(' @ ', ', RPE ');
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
      <Display weight={700} style={{ fontSize: 22 }}>
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
          const said = [setName(labels[i]), spokenSet(text), ...(pr ? ['personal best'] : [])].join(', ');
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
