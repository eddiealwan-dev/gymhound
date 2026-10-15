import { Ionicons } from '@expo/vector-icons';
import { Keyboard, Pressable, View } from 'react-native';
import type { DraftExercise, DraftProblem, DraftSet } from '../../domain/historyDraft';
import { MARK_LABELS } from '../../domain/labels';
import { setLabels } from '../../domain/setEntry';
import { tableColumns } from '../../domain/setTable';
import type { DistanceUnit, WeightUnit } from '../../domain/types';
import { Button } from '../Button';
import { cellStyle, COLUMN_GAP } from '../session/SetRow';
import { Body, Display } from '../Text';
import { useTheme } from '../ThemeProvider';
import { EditSetRow } from './EditSetRow';
import { SET_HEADER_MAX_SCALE } from '../largeText';

type Props = {
  exercise: DraftExercise;
  /** A stable key per set, in the order of `exercise.sets`. */
  setKeys: string[];
  unit: WeightUnit;
  distanceUnit: DistanceUnit;
  /** What ticked sets lack, once Save has been tried (`draftProblems`); empty before. */
  problems: DraftProblem[];
  tried: boolean;
  onPatch: (index: number, patch: Partial<DraftSet>) => void;
  onAddSet: () => void;
  onOpenSet: (index: number) => void;
  onOpenMark: () => void;
  onInvalidChange: (setKey: string, invalid: boolean) => void;
};

/**
 * One exercise of a finished workout in the history editor (R166): its name (Title), the quiet Something off control as in
 * the session (its reason when set, muted, never red), the column headers without Previous, a row per set and a quiet
 * **+ Set**. Exercises are not added, replaced or reordered here, and the note is not edited.
 */
export function EditExercise({ exercise, setKeys, unit, distanceUnit, problems, tried, onPatch, onAddSet, onOpenSet, onOpenMark, onInvalidChange }: Props) {
  const { colors } = useTheme();
  const { name, mark } = exercise;
  // A carry's distance is in its own unit (R607), as its sets were logged; it heads the column ("FT").
  const carryUnit = exercise.loggingType === 'weighted_distance' ? (exercise.sets.find((x) => x.distanceUnit !== null)?.distanceUnit ?? 'm') : undefined;
  const columns = tableColumns(exercise.loggingType, unit, exercise.showRpe, carryUnit).filter((c) => c.key !== 'previous');
  const labels = setLabels(exercise.sets.map((s) => s.setType));
  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 2 }}>
        <Display accessibilityRole="header" style={{ fontSize: 22, flexShrink: 1 }}>
          {name}
        </Display>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mark ? `Something off for ${name}: ${MARK_LABELS[mark]}` : `Something off for ${name}`}
          onPress={() => {
            Keyboard.dismiss();
            onOpenMark();
          }}
          // A 24pt line reaching 10pt above and below: a 44pt target, as in the session (R81).
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          style={({ pressed }) => ({ minHeight: 24, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name="alert-circle-outline" size={14} color={colors.textMuted} />
          <Body muted style={{ flexShrink: 1, fontSize: 14 }}>
            {mark ? MARK_LABELS[mark] : 'Something off'}
          </Body>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: COLUMN_GAP, marginTop: 14, marginBottom: 4 }}>
        {columns.map((column) => (
          <View key={column.key} style={cellStyle(column.key)}>
            <Body weight={600} muted numberOfLines={1} maxFontSizeMultiplier={SET_HEADER_MAX_SCALE} style={{ fontSize: 10, letterSpacing: 0.3, textAlign: column.key === 'set' ? 'left' : 'center' }}>
              {column.header}
            </Body>
          </View>
        ))}
      </View>

      <View style={{ gap: 2 }}>
        {exercise.sets.map((set, i) => (
          <EditSetRow
            key={setKeys[i]}
            exerciseName={name}
            loggingType={exercise.loggingType}
            set={set}
            label={labels[i]}
            columns={columns}
            unit={unit}
            distanceUnit={distanceUnit}
            need={problems.find((p) => p.index === i)?.need ?? null}
            tried={tried}
            onPatch={(patch) => onPatch(i, patch)}
            onChip={() => onOpenSet(i)}
            onInvalidChange={(invalid) => onInvalidChange(setKeys[i], invalid)}
          />
        ))}
      </View>

      {/* A quiet button steps back by its 12pt padding, so "+ Set" lines up with the set column. */}
      <View style={{ flexDirection: 'row', marginTop: 4, marginLeft: -12 }}>
        <Button label="+ Set" variant="quiet" size="compact" accessibilityLabel={`Add a set to ${name}`} onPress={onAddSet} />
      </View>
    </View>
  );
}
