import { Ionicons } from '@expo/vector-icons';
import { Fragment, memo, useCallback, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { MARK_LABELS } from '../../domain/labels';
import { planInUnit, type Gear } from '../../domain/plates';
import { restAfterLine, restLengthFor } from '../../domain/rest';
import { lastSummary, ruleSentence, todaysRead } from '../../domain/ruleLine';
import { countLabel, exerciseProgress } from '../../domain/sessionProgress';
import { buildRows, tableColumns, type RowModel } from '../../domain/setTable';
import type { DistanceUnit, SetType, WeightUnit } from '../../domain/types';
import { flushAll, useDraftFlush } from '../../state/draftFlush';
import { addSetTo, addWarmupTo, commitSetField, removeSetFrom, saveNote } from '../../state/sessionActions';
import { sameProps, useShareEqual } from '../../state/shareEqual';
import { Button } from '../Button';
import type { FormDemo as FormDemoType } from '../FormDemo';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../Sheet';
import { SheetTitle } from '../SheetTitle';
import { Body, Display, Num } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';
import { useCallbacksByKey } from '../useCallbacksByKey';
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
  /**
   * On the block that opens a superset, what VoiceOver says for its "Superset" label ("Superset of Bench press and Ab
   * roller"); null on every other block (R100).
   */
  supersetLabel: string | null;
  /**
   * Mid-superset, the exercise the rest waits for (`restWaitsFor`): the set ticked last then shows "Rest after {it}"
   * where the rest row would be. Null when a tick of this exercise starts the rest itself (R100).
   */
  restWaitsFor: string | null;
  /** The set ticked last in the whole workout (`latestTickedSetId`), or null. */
  latestTickedSetId: string | null;
  /**
   * When the running rest ends (`rest_ends_at`), or null when none is running. The session passes it only to the block
   * that holds `restSetId`, so a rest starting or moving redraws that block alone.
   */
  restEndsAt: number | null;
  /** Whether a rest is running anywhere in the workout. Left out, it is `restEndsAt !== null`. */
  restRunning?: boolean;
  /**
   * The set whose tick started the running rest (`rest_set_id`, R38): the countdown shows under it, and only when that
   * set is in this block. A removed set shows none, and the rest bar still does.
   */
  restSetId: string | null;
  /** The next set to do in the whole workout (spec 18.6), or null: its tick gets the bolder ring when it is in this block. */
  nextSetId: string | null;
  /** The rest that has just run out (`useRestUp`): its "Rest's up" shows under its set, when that set is in this block. */
  restUp: { setId: string; endsAt: number } | null;
  /** What the rest row says once the rest is up (`restUpText`). */
  upText: string;
  /** The rest in Settings, in seconds: the length of a rest of an exercise with none of its own. */
  settingsRestSeconds: number;
  /** Opens this exercise's rest choices: the countdown was tapped. */
  onOpenRest: () => void;
  /** Opens this exercise's Something off reasons: its Something off control was tapped (R81). */
  onOpenMark: () => void;
  /** Opens Modify, to swap in an exercise that works the same muscles (R553). Without it there is no Modify. */
  onOpenModify?: () => void;
  /** Opens this exercise's stats: its chart and history (R554). Without it there is no Stats. */
  onOpenStats?: () => void;
};

/**
 * How far a name-row control's target reaches past what it draws: 10pt above and below its 24pt line (a 44pt target),
 * and half the group's 12pt gap to each side, so neighbouring targets meet without overlapping.
 */
export const NAME_ROW_HIT_SLOP = { top: 10, bottom: 10, left: 6, right: 6 };

/** How far the name's target reaches above and below its 26pt line: a 44pt target, as ⋯ has. */
const NAME_HIT_SLOP = { top: 9, bottom: 9 };

/** The space between the count, + Note and Something off, and between the name row's two columns. */
const NAME_ROW_GAP = 12;

/**
 * A quiet, compact control in the name row: a 14pt muted icon and muted 14pt words. + Note and Something off share it
 * (R81). It draws a 24pt line and reaches 10pt above and below it (`NAME_ROW_HIT_SLOP`), so its target is 44pt while the
 * line it adds under the name costs 24pt. It may shrink within the controls group, and its words then wrap rather than
 * end in "…" (a long reason such as "Short on food" at the largest text on a narrow phone).
 */
function NameRowControl({
  icon,
  label,
  readAs,
  onPress,
}: {
  icon: 'pencil' | 'alert-circle-outline' | 'swap-horizontal' | 'stats-chart-outline';
  label: string;
  /** What the screen reader says. */
  readAs: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={readAs}
      onPress={onPress}
      hitSlop={NAME_ROW_HIT_SLOP}
      style={({ pressed }) => ({
        minHeight: 24,
        minWidth: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: 1,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Body muted style={{ flexShrink: 1, fontSize: 14 }}>
        {label}
      </Body>
    </Pressable>
  );
}

/** Space below a block. A superset's bar crosses it to join the members. */
const BLOCK_GAP = 28;

/**
 * One exercise: its name, how many of its sets are ticked, + Note when it has no note, Something off (its reason when
 * flagged, R81), its ⋯ menu, the saved note as a muted line under the name led by + Note's pencil (tapping it, or
 * + Note, opens the note field), the rule and today's read (spec 7.4), the set table with each set's last result beside
 * the inputs, and the compact + Set and + Warmup buttons. The next set to do has the bolder tick ring.
 * Tapping a set number opens the set-type sheet, which also removes the set; pressing and holding the row opens a sheet
 * that removes it too. A ticked set is removed only after "Remove set n?". The running rest shows under the set that
 * started it, and holds "Rest's up" there for a moment after it runs out. Tapping the name opens its form demo (R86).
 */
export const ExerciseBlock = memo(function ExerciseBlock({
  workoutId,
  ex,
  unit,
  gear,
  distanceUnit,
  onOpenMenu,
  inSuperset,
  joinsNext,
  supersetLabel,
  restWaitsFor,
  latestTickedSetId,
  restEndsAt,
  restSetId,
  nextSetId,
  restUp,
  upText,
  settingsRestSeconds,
  onOpenRest,
  onOpenMark,
  onOpenModify,
  onOpenStats,
  restRunning = restEndsAt !== null,
}: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const columns = useMemo(() => tableColumns(ex.loggingType, unit, ex.showRpe), [ex.loggingType, unit, ex.showRpe]);
  // Each row's previous is worked out once for the whole block. A row equal to the one drawn before keeps its object,
  // so only the set rows that changed draw again.
  const rows = useShareEqual(useMemo(() => buildRows(ex, unit, gear, distanceUnit), [ex, unit, gear, distanceUnit]));
  /** The exercise as last drawn, for a set row's tick (`SetRow`'s `latestEx`). */
  const exRef = useRef(ex);
  exRef.current = ex;
  const latestEx = useCallback(() => exRef.current, []);
  const progress = exerciseProgress(ex);
  /** A plan or an override in the unit shown, as the set table shows today's target (`planInUnit`, spec 7.1). */
  const shown = (weight: number | null, from: WeightUnit | null) =>
    weight === null ? null : { weight: planInUnit(weight, from ?? unit, unit, ex.equipment === 'barbell', gear.bar, gear.plates), unit };
  const read = todaysRead({
    rule: ex.rule,
    loggingType: ex.loggingType,
    planned: shown(ex.plannedWeight, ex.plannedUnit),
    override: shown(ex.overrideWeight, ex.overrideUnit),
    mark: ex.mark,
    equipment: ex.equipment,
    gear,
  });
  const sentence = ruleSentence({ rule: ex.rule, loggingType: ex.loggingType, unit, last: lastSummary(ex.previous) });
  const restLength = restLengthFor(ex.restSeconds, settingsRestSeconds);
  /** The rest to show under a set: the running one under the set that started it, else the one just up, under its set. */
  const restUnder = (setId: string): number | null => {
    if (restRunning) return setId === restSetId ? restEndsAt : null;
    return restUp?.setId === setId ? restUp.endsAt : null;
  };

  /** The note while its field is open; null closes the field and shows the saved note, or + Note when there is none. */
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const editingNote = noteDraft !== null;
  /** Opens the note field on the saved note; a string draft is what a blur or `flushAll()` then saves. */
  const openNote = () => setNoteDraft(ex.note ?? '');
  const [typeFor, setTypeFor] = useState<string | null>(null);
  const [removeFor, setRemoveFor] = useState<string | null>(null);
  /**
   * Each set row's sheet openers, the same functions on every draw. The keyboard goes before a sheet opens; its blur
   * saves what is typed (the Sheet closes it too).
   */
  const rowHandlers = useCallbacksByKey((setId) => ({
    onChangeType: () => {
      Keyboard.dismiss();
      setTypeFor(setId);
    },
    onLongPress: () => {
      Keyboard.dismiss();
      setRemoveFor(setId);
    },
  }));
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

  /** Whether the form demo is open (R86). */
  const [demoOpen, setDemoOpen] = useState(false);
  /**
   * The form demo, loaded the first time it opens and kept after: it reads the photo index (about 1,746 requires), which
   * the session screen should not load until a demo is asked for.
   */
  const [FormDemo, setFormDemo] = useState<typeof FormDemoType | null>(null);
  /** Saves every draft and puts the keyboard away before the sheet opens over the session (R29). */
  const openDemo = () => {
    flushAll();
    Keyboard.dismiss();
    if (FormDemo === null) setFormDemo(() => (require('../FormDemo') as typeof import('../FormDemo')).FormDemo);
    setDemoOpen(true);
  };

  return (
    <View style={{ marginBottom: BLOCK_GAP }}>
      {inSuperset ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: -11, width: 3, top: 0, bottom: joinsNext ? -BLOCK_GAP : 0, backgroundColor: colors.text }}
        />
      ) : null}
      {/*
        The name row, in the order [name][count][+ Note][Something off][⋯] (R81). ⋯ keeps the right edge, over the tick
        column, centred on the name's first line. The group of count, + Note and Something off follows the name: on its
        line when both fit (a short name, a flagged day, a tablet), and otherwise under it as one quiet line, left-aligned
        with it. That line is 24pt and its targets reach 10pt above and below it, so it adds 26pt to the block rather
        than a 44pt row, and the name always keeps the full width beside ⋯ instead of squeezing (R54). The name does
        not grow (a basis of 'auto', never flex: 1), so the group sits right after it either way. At large text the name
        wraps, and the group wraps among itself; its words wrap rather than end in "…".
      */}
      {supersetLabel !== null ? (
        // The bar alone said nothing about what it means (R100): a quiet word beside it, on the superset's first block.
        // It ends where the name's reach above it (`NAME_HIT_SLOP`) begins, so a tap on it never opens the form demo.
        <Body muted weight={500} accessibilityLabel={supersetLabel} style={{ fontSize: 13, marginBottom: NAME_HIT_SLOP.top }}>
          Superset
        </Body>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', columnGap: NAME_ROW_GAP }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: NAME_ROW_GAP, rowGap: 2 }}>
          {/*
            The name opens the form demo (R86). Its 26pt line reaches 9pt above and below, as ⋯ does: a 44pt target.
            The pressable takes the name's place in the wrapping column, so it shrinks and wraps the same way.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Show form for ${ex.name}`}
            onPress={openDemo}
            hitSlop={NAME_HIT_SLOP}
            style={({ pressed }) => ({
              flexShrink: 1,
              flexBasis: 'auto',
              minWidth: 0,
              minHeight: 26,
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            {/* The muted ⓘ after the last word says the name opens the demo (R94), as the picker's ⓘ does. */}
            <Display weight={700} style={{ flexShrink: 1, flexBasis: 'auto', minWidth: 0, fontSize: 22 }}>
              {ex.name}
              {/* A no-break space, so the glyph never sits alone on a line (R94). */}
              {'\u00A0'}
              {/* Ionicons turns font scaling off by default: the glyph grows with the name. */}
              <Ionicons testID="form-demo-cue" name="information-circle-outline" size={16} color={colors.textMuted} allowFontScaling />
            </Display>
          </Pressable>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: NAME_ROW_GAP,
              // Two lines of controls at large text: their 10pt reaches meet, never overlap.
              rowGap: NAME_ROW_HIT_SLOP.top + NAME_ROW_HIT_SLOP.bottom,
              flexShrink: 0,
              maxWidth: '100%',
            }}
          >
            {progress.total > 0 ? (
              // No text-size cap: the row wraps instead.
              <Num weight={600} accessibilityLabel={countLabel(progress)} style={{ fontSize: 16, color: colors.textMuted, flexShrink: 0 }}>
                {`${progress.done}/${progress.total}`}
              </Num>
            ) : null}
            {!ex.note && !editingNote ? (
              <NameRowControl icon="pencil" label="+ Note" readAs={`Add a note for ${ex.name}`} onPress={openNote} />
            ) : null}
            {/* Quiet even when flagged: it shows the reason, muted, never red (R81). */}
            <NameRowControl
              icon="alert-circle-outline"
              label={ex.mark ? MARK_LABELS[ex.mark] : 'Something off'}
              readAs={ex.mark ? `Something off for ${ex.name}: ${MARK_LABELS[ex.mark]}` : `Something off for ${ex.name}`}
              onPress={onOpenMark}
            />
            {/* Modify and Stats (R553, R554, the owner's Round 10 request), quiet like + Note. */}
            {onOpenModify ? <NameRowControl icon="swap-horizontal" label="Modify" readAs={`Modify ${ex.name}: swap in another exercise`} onPress={onOpenModify} /> : null}
            {onOpenStats ? <NameRowControl icon="stats-chart-outline" label="Stats" readAs={`Stats for ${ex.name}`} onPress={onOpenStats} /> : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Options for ${ex.name}`}
          onPress={onOpenMenu}
          hitSlop={4}
          // Centred on the name's first 26pt line: the 44pt box reaches 9pt above and below it without making the row taller.
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            marginVertical: -9,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
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
            // Clear of the name row's 10pt reach below Something off, so the two targets never overlap.
            marginTop: NAME_ROW_HIT_SLOP.bottom,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
            color: colors.text,
            fontFamily: fonts.body400,
            fontSize: 14,
          }}
        />
      ) : ex.note ? (
        // With a note saved there is no + Note, so the note line leads with its pencil: muted like the rule under it,
        // it otherwise read as the rule's first line, and the note looked missing (Round 5).
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Note for ${ex.name}: ${ex.note}`}
          accessibilityHint="Edits the note"
          onPress={openNote}
          // Clear of the name row's 10pt reach below Something off, so the two targets never overlap.
          style={({ pressed }) => ({
            minHeight: 44,
            marginTop: NAME_ROW_HIT_SLOP.bottom,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name="pencil" size={14} color={colors.textMuted} />
          <Body muted style={{ flexShrink: 1, fontSize: 14 }}>
            {ex.note}
          </Body>
        </Pressable>
      ) : null}

      {/* No text-size cap: it wraps. It starts below the name row's 10pt reach: drawn later, it would win the hit test where
          the two overlap and cut + Note and Something off short of 44pt. */}
      <Body muted style={{ fontSize: 14, marginTop: NAME_ROW_HIT_SLOP.bottom }}>
        {read === null ? sentence : `${sentence} ${read}`}
      </Body>

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
        {rows.map((row, i) => {
          const restEnd = restUnder(row.set.id);
          return (
            <Fragment key={row.set.id}>
              <SetRow
                latestEx={latestEx}
                row={row}
                columns={columns}
                unit={unit}
                distanceUnit={distanceUnit}
                onChangeType={rowHandlers(row.set.id).onChangeType}
                onLongPress={rowHandlers(row.set.id).onLongPress}
                isNext={row.set.id === nextSetId}
              />
              {restEnd !== null ? (
                // A new tick of this set starts a new rest, with a new row that takes the length chosen since (the row
                // keeps the length it started with, through +15s and a new choice from the countdown).
                <RestInline
                  key={String(ex.sets[i].completedAt)}
                  workoutId={workoutId}
                  endsAt={restEnd}
                  lengthSeconds={restLength}
                  upText={upText}
                  onOpenRest={onOpenRest}
                />
              ) : restWaitsFor !== null && row.set.id === latestTickedSetId && !restRunning ? (
                // A tick mid-superset starts no rest: where the rest row would be, a quiet line says when it comes (R100).
                // Not while a rest runs anywhere (the rest watcher clears its end at zero), so two rests never seem to show.
                <Body muted style={{ fontSize: 14, paddingVertical: 6 }}>
                  {restAfterLine(restWaitsFor)}
                </Body>
              ) : null}
            </Fragment>
          );
        })}
      </View>

      {/* Quiet buttons have no edge, so the row steps back by their 12pt padding: "+ Set" lines up with the set column. */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8, marginTop: 4, marginLeft: -12 }}>
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
        <SheetTitle>Set type</SheetTitle>
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
        <SheetTitle>{`Set ${removeRow?.label ?? ''}`}</SheetTitle>
        <View style={{ gap: 8 }}>
          <Button
            label="Remove set"
            onPress={() => {
              removeOrAsk(removeRow);
              setRemoveFor(null);
            }}
          />
          <Button label="Cancel" variant="quiet" onPress={() => setRemoveFor(null)} />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={confirmFor !== null && rows.some((r) => r.set.id === confirmFor)}
        title={`Remove set ${confirmLabel}?`}
        body="It's complete. What it logged will be deleted."
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => {
          if (confirmFor !== null) removeSetFrom(db, confirmFor);
          setConfirmFor(null);
        }}
        onCancel={() => setConfirmFor(null)}
      />

      {FormDemo !== null ? <FormDemo exerciseId={demoOpen ? ex.exerciseId : null} onClose={() => setDemoOpen(false)} /> : null}
    </View>
  );
}, sameProps);
