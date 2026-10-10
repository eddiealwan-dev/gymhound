import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { buildRows, tableColumns } from '../../domain/setTable';
import type { DistanceUnit, SetType, WeightUnit } from '../../domain/types';
import { addSetTo, commitSetField, removeSetFrom, saveNote } from '../../state/sessionActions';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { Body, Display } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';
import { cellStyle, COLUMN_GAP, SetRow } from './SetRow';

const SET_TYPES: { type: SetType; label: string }[] = [
  { type: 'working', label: 'Working' },
  { type: 'warmup', label: 'Warmup' },
  { type: 'drop', label: 'Drop' },
  { type: 'failure', label: 'Failure' },
];

type Props = { ex: WorkoutExerciseView; unit: WeightUnit; distanceUnit: DistanceUnit };

/** One exercise: its name, its note, the set table with each set's last result beside the inputs, and Add set. */
export function ExerciseBlock({ ex, unit, distanceUnit }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const columns = tableColumns(ex.loggingType, unit, ex.showRpe);
  // Each row's previous is worked out once for the whole block.
  const rows = buildRows(ex, unit);

  /** The note while it is being typed; null shows the saved one. */
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [typeFor, setTypeFor] = useState<string | null>(null);
  const [removeFor, setRemoveFor] = useState<string | null>(null);
  const typeRow = rows.find((r) => r.set.id === typeFor);
  const removeRow = rows.find((r) => r.set.id === removeFor);

  const saveNoteOnBlur = () => {
    if (noteDraft === null) return;
    const text = noteDraft.trim();
    if (text !== (ex.note ?? '')) saveNote(db, ex.exerciseId, text);
    setNoteDraft(null);
  };

  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Display weight={700} style={{ flex: 1, minWidth: 0, fontSize: 22 }}>
          {ex.name}
        </Display>
        {/* The menu arrives with the exercise menu (Task 15). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Options for ${ex.name}`}
          hitSlop={4}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <TextInput
        value={noteDraft ?? ex.note ?? ''}
        onChangeText={setNoteDraft}
        onBlur={saveNoteOnBlur}
        placeholder="Add a note for next time"
        placeholderTextColor={colors.textMuted}
        multiline
        submitBehavior="blurAndSubmit"
        accessibilityLabel={`Note for ${ex.name}`}
        style={{
          minHeight: 40,
          marginTop: 4,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          color: colors.text,
          fontFamily: fonts.body400,
          fontSize: 14,
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: COLUMN_GAP, marginTop: 14, marginBottom: 4 }}>
        {columns.map((column) => (
          <View key={column.key} style={cellStyle(column.key)}>
            <Body
              weight={600}
              muted
              numberOfLines={1}
              style={{ fontSize: 10, letterSpacing: 0.3, textAlign: column.key === 'previous' || column.key === 'set' ? 'left' : 'center' }}
            >
              {column.header}
            </Body>
          </View>
        ))}
      </View>

      <View style={{ gap: 2 }}>
        {rows.map((row) => (
          <SetRow
            key={row.set.id}
            ex={ex}
            row={row}
            columns={columns}
            unit={unit}
            distanceUnit={distanceUnit}
            onChangeType={() => setTypeFor(row.set.id)}
            onLongPress={() => setRemoveFor(row.set.id)}
          />
        ))}
      </View>

      <View style={{ marginTop: 8 }}>
        <Button label="+ Add set" variant="secondary" onPress={() => addSetTo(db, ex.id)} />
      </View>

      <Sheet visible={typeRow !== undefined} onClose={() => setTypeFor(null)}>
        <Display weight={700} style={{ marginBottom: 12 }}>
          Set type
        </Display>
        <View style={{ gap: 8 }}>
          {SET_TYPES.map(({ type, label }) => (
            <Button
              key={type}
              label={label}
              variant={typeRow?.set.setType === type ? 'primary' : 'secondary'}
              onPress={() => {
                if (typeRow && typeRow.set.setType !== type) commitSetField(db, typeRow.set.id, { setType: type });
                setTypeFor(null);
              }}
            />
          ))}
        </View>
      </Sheet>

      <Sheet visible={removeRow !== undefined} onClose={() => setRemoveFor(null)}>
        <Display weight={700} style={{ marginBottom: 12 }}>
          {`Set ${removeRow?.label ?? ''}`}
        </Display>
        <View style={{ gap: 8 }}>
          <Button
            label="Remove set"
            onPress={() => {
              if (removeRow) removeSetFrom(db, removeRow.set.id);
              setRemoveFor(null);
            }}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setRemoveFor(null)} />
        </View>
      </Sheet>
    </View>
  );
}
