import { Ionicons } from '@expo/vector-icons';
import { Fragment, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import type { Gear } from '../../domain/plates';
import { countLabel, exerciseProgress } from '../../domain/sessionProgress';
import { buildRows, tableColumns, type RowModel } from '../../domain/setTable';
import type { DistanceUnit, SetType, WeightUnit } from '../../domain/types';
import { useDraftFlush } from '../../state/draftFlush';
import { addSetTo, addWarmupTo, commitSetField, removeSetFrom, saveNote } from '../../state/sessionActions';
import { Button } from '../Button';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../Sheet';
import { Body, Display, Num } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';
import { RestInline } from './RestInline';
import { cellStyle, COLUMN_GAP, SetRow } from './SetRow';

const SET_TYPES: { type: SetType; label: string }[] = [
  { type: 'working', label: 'Working' },
  { type: 'warmup', label: 'Warmup' },
  { type: 'drop', label: 'Drop' },
  { type: 'failure', label: 'Failure' },
];

type Props = {
  workoutId: string;
  ex: WorkoutExerciseView;
  unit: WeightUnit;
  /** The bar and plates in Settings for `unit`: a barbell target planned in the other unit rounds to what they load. */
  gear: Gear;
  distanceUnit: DistanceUnit;
  /** Opens this exercise's ⋯ menu. */
  onOpenMenu: () => void;
  /** Whether the exercise is in a superset: it then shows a bar on its left edge. */
  inSuperset: boolean;
  /** Whether the next exercise is in the same superset: the bar then runs on through the gap between them. */
  joinsNext: boolean;
  /** When the running rest ends (`rest_ends_at`), or null when none is running. */
  restEndsAt: number | null;
  /**
   * The set whose tick started the running rest (`rest_set_id`, R38): the countdown shows under it, and only when that
   * set is in this block. A removed set shows none, and the rest bar still does.
   */
  restSetId: string | null;
  /** The next set to do in the whole workout (spec 18.6), or null: its tick gets the bolder ring when it is in this block. */
  nextSetId: string | null;
};

/** Space below a block. A superset's bar crosses it to join the members. */
const BLOCK_GAP = 28;

/**
 * One exercise: its name, how many of its sets are ticked, + Note when it has no note, its ⋯ menu, the saved note as a
 * muted line under the name (tapping it, or + Note, opens the note field), the set table with each set's last result
 * beside the inputs, and the compact + Set and + Warmup buttons. The next set to do has the bolder tick ring.
 * Tapping a set number opens the set-type sheet, which also removes the set; pressing and holding the row opens a sheet
 * that removes it too. A ticked set is removed only after "Remove set n?". The running rest shows under the set that
 * started it.
 */
export function ExerciseBlock({
  workoutId,
  ex,
  unit,
  gear,
  distanceUnit,
  onOpenMenu,
  inSuperset,
  joinsNext,
  restEndsAt,
  restSetId,
  nextSetId,
}: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const columns = tableColumns(ex.loggingType, unit, ex.showRpe);
  // Each row's previous is worked out once for the whole block.
  const rows = buildRows(ex, unit, gear);
  const progress = exerciseProgress(ex);

  /** The note while its field is open; null closes the field and shows the saved note, or + Note when there is none. */
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const editingNote = noteDraft !== null;
  /** Opens the note field on the saved note; a string draft is what a blur or `flushAll()` then saves. */
  const openNote = () => setNoteDraft(ex.note ?? '');
  const [typeFor, setTypeFor] = useState<string | null>(null);
  const [removeFor, setRemoveFor] = useState<string | null>(null);
  const typeRow = rows.find((r) => r.set.id === typeFor);
  const removeRow = rows.find((r) => r.set.id === removeFor);
  /** The ticked set waiting on "Remove set n?". */
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  /** Its label, kept after the question closes so the title does not change while it fades. */
  const [confirmLabel, setConfirmLabel] = useState('');

  /**
   * Removes a set chosen in either sheet. One not ticked goes at once. A ticked one holds a logged result, so it asks
   * first, as removing an exercise with ticked sets does, once the sheet it was chosen in has gone (the caller closes it).
   */
  const removeOrAsk = (row: RowModel | undefined) => {
    if (!row) return;
    if (!row.set.done) {
      removeSetFrom(db, row.set.id);
      return;
    }
    const { id } = row.set;
    setConfirmLabel(row.label);
    afterSheetCloses(() => setConfirmFor(id));
  };

  const saveNoteOnBlur = () => {
    if (noteDraft === null) return;
    const text = noteDraft.trim();
    if (text !== (ex.note ?? '')) saveNote(db, ex.exerciseId, text);
    setNoteDraft(null);
  };
  // Back, the ⋯ menu and the picker save a note that is typed but not yet left; the screen may unmount before a blur (R29).
  useDraftFlush(saveNoteOnBlur);

  return (
    <View style={{ marginBottom: BLOCK_GAP }}>
      {inSuperset ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: -11, width: 3, top: 0, bottom: joinsNext ? -BLOCK_GAP : 0, backgroundColor: colors.text }}
        />
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Display weight={700} style={{ flex: 1, minWidth: 0, fontSize: 22 }}>
          {ex.name}
        </Display>
        {progress.total > 0 ? (
          // No text-size cap: the name wraps instead.
          <Num weight={600} accessibilityLabel={countLabel(progress)} style={{ fontSize: 16, color: colors.textMuted, flexShrink: 0 }}>
            {`${progress.done}/${progress.total}`}
          </Num>
        ) : null}
        {!ex.note && !editingNote ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add a note for ${ex.name}`}
            onPress={openNote}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="pencil" size={14} color={colors.textMuted} />
            <Body muted numberOfLines={1} style={{ fontSize: 14 }}>
              + Note
            </Body>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Options for ${ex.name}`}
          onPress={onOpenMenu}
          hitSlop={4}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {editingNote ? (
        <TextInput
          value={noteDraft}
          onChangeText={setNoteDraft}
          onBlur={saveNoteOnBlur}
          autoFocus
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
      ) : ex.note ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Note for ${ex.name}: ${ex.note}`}
          accessibilityHint="Edits the note"
          onPress={openNote}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Body muted style={{ fontSize: 14 }}>
            {ex.note}
          </Body>
        </Pressable>
      ) : null}

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
          <Fragment key={row.set.id}>
            <SetRow
              ex={ex}
              row={row}
              columns={columns}
              unit={unit}
              distanceUnit={distanceUnit}
              // The keyboard goes before a sheet opens; its blur saves what is typed (the Sheet closes it too).
              onChangeType={() => {
                Keyboard.dismiss();
                setTypeFor(row.set.id);
              }}
              onLongPress={() => {
                Keyboard.dismiss();
                setRemoveFor(row.set.id);
              }}
              isNext={row.set.id === nextSetId}
            />
            {restEndsAt !== null && row.set.id === restSetId ? <RestInline workoutId={workoutId} endsAt={restEndsAt} /> : null}
          </Fragment>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        <Button
          label="+ Set"
          variant="quiet"
          size="compact"
          accessibilityLabel={`Add a set to ${ex.name}`}
          onPress={() => addSetTo(db, ex.id)}
        />
        <Button
          label="+ Warmup"
          variant="quiet"
          size="compact"
          accessibilityLabel={`Add a warmup to ${ex.name}`}
          onPress={() => addWarmupTo(db, ex.id)}
        />
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
        <View style={{ marginTop: 16 }}>
          <Button
            label="Remove set"
            variant="secondary"
            onPress={() => {
              removeOrAsk(typeRow);
              setTypeFor(null);
            }}
          />
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
              removeOrAsk(removeRow);
              setRemoveFor(null);
            }}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setRemoveFor(null)} />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={confirmFor !== null && rows.some((r) => r.set.id === confirmFor)}
        title={`Remove set ${confirmLabel}?`}
        body="It's ticked. What it logged will be deleted."
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => {
          if (confirmFor !== null) removeSetFrom(db, confirmFor);
          setConfirmFor(null);
        }}
        onCancel={() => setConfirmFor(null)}
      />
    </View>
  );
}
