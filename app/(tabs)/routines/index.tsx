import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { listRoutines } from '../../../src/db/repositories/routinesRepo';
import type { RoutineSummary } from '../../../src/db/repositories/routinesRepo';
import { listSavedWorkouts } from '../../../src/db/repositories/savedWorkoutsRepo';
import type { SavedWorkoutSummary } from '../../../src/db/repositories/savedWorkoutsRepo';
import { useDbQuery } from '../../../src/state/dataVersion';
import { ActiveBadge } from '../../../src/ui/ActiveBadge';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { EmptyState } from '../../../src/ui/EmptyState';
import { useRoutineLimit } from '../../../src/ui/RoutineLimit';
import { RoutineOptionsSheet, useRoutineActions } from '../../../src/ui/routines/useRoutineActions';
import { routineLine } from '../../../src/domain/programInfo';
import { canUseRoutine, canUseSavedWorkouts } from '../../../src/domain/routineLimit';
import { useIsPro } from '../../../src/platform/entitlements';
import { PROGRAM_ORDER, programById } from '../../../src/seed/programs.generated';
import type { Program } from '../../../src/seed/programTypes';
import { ProgramPicture } from '../../../src/ui/programs/ProgramPicture';
import { Screen } from '../../../src/ui/Screen';
import { useStartSaved } from '../../../src/ui/StartSaved';
import { Body, Label, ScreenTitle } from '../../../src/ui/Text';
import { breakableName, useLargeText } from '../../../src/ui/largeText';
import { useTheme } from '../../../src/ui/ThemeProvider';

/** Back to where Routines was opened from (Train). With nothing to go back to (opened by address, or reloaded), it lands on Train. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/');
}

/** Under the title while no routine is in use (R403). */
const PICK_ONE = 'Set one active and Train lines up its next workout.';

/** Over New routine while you have none of your own (R401). */
const YOURS_EMPTY = 'Routines you make or duplicate show here.';

/**
 * The mark on a Pro program's row for a free lifter (R525): a small outlined tag, smaller than a pill button so it reads
 * as a mark on the row, not an action. Never red.
 */
function ProMark() {
  const { colors } = useTheme();
  return (
    <View style={{ borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Body weight={600} style={{ fontSize: 13 }}>
        Pro
      </Body>
    </View>
  );
}

/**
 * One of the twenty programs (R633): its 48pt picture, its name (a line may break after a slash) and "3 days a week ·
 * 12 weeks · Beginner", all one 44pt+ target that opens its card, where Set active lives. A Pro program for a free
 * lifter carries the Pro mark (R525), the program in use the Active mark; at a large text size the mark drops under
 * the line rather than squeezing the name. ⋯ at the end opens the program's options (R542).
 */
function ProgramRow({
  routine,
  program,
  locked,
  onOptions,
}: {
  routine: RoutineSummary;
  program: Program;
  locked: boolean;
  onOptions: () => void;
}) {
  const { colors } = useTheme();
  const stacked = useStackedRow();
  const line = routineLine(routine);
  const active = routine.isActive && !locked;
  const mark = locked ? <ProMark /> : active ? <ActiveBadge /> : null;
  const state = locked ? 'part of GymHound Pro' : active ? 'active' : null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[`${routine.name}, ${line}`, state].filter((part) => part !== null).join(', ')}
        onPress={() => router.push(`/routines/${routine.id}`)}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.8 : 1 })}
      >
        <ProgramPicture programId={program.id} label={program.picture.label} kind="thumb" decorative />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight={600}>{breakableName(routine.name)}</Body>
          <Body muted style={{ fontSize: 14 }}>
            {line}
          </Body>
          {stacked && mark !== null ? <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>{mark}</View> : null}
        </View>
        {stacked ? null : mark}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Options for ${routine.name}`}
        onPress={onOptions}
        hitSlop={4}
        style={({ pressed }) => ({ width: 36, height: 44, marginRight: -8, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

/**
 * A routine: its name and days, which open its detail (the chevron says so), and Set active as a compact pill (36pt
 * with a 4pt hit slop, a 44pt target), the size of a row's own action elsewhere (the rest pills, Finish); the routine
 * in use shows the Active mark instead. The pill is beside the name, never inside it, so the screen reader reaches both.
 * ⋯ at the end opens the routine's options (R542).
 */
function RoutineRow({
  routine,
  locked,
  onSetActive,
  onOptions,
}: {
  routine: RoutineSummary;
  locked: boolean;
  onSetActive: () => void;
  onOptions: () => void;
}) {
  const { colors } = useTheme();
  const stacked = useStackedRow();
  // "3 days a week · 12 weeks · Beginner" for a program (R555), the days for your own.
  const days = routineLine(routine);
  return (
    <View
      style={{
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'stretch' : 'center',
        gap: 12,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${routine.name}, ${days}`}
        onPress={() => router.push(`/routines/${routine.id}`)}
        style={({ pressed }) => ({ flex: stacked ? undefined : 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight={600}>{breakableName(routine.name)}</Body>
          <Body muted style={{ fontSize: 14 }}>
            {days}
          </Body>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: stacked ? 'space-between' : undefined }}>
      {/* A program outside free, or a routine of your own kept after Pro ends, says Pro where Set active would be (R525). */}
      {routine.isActive && !locked ? (
        <ActiveBadge />
      ) : (
        <Button
          label={locked ? 'Pro' : 'Set active'}
          variant="secondary"
          size="compact"
          accessibilityLabel={locked ? `${routine.name} is part of GymHound Pro` : undefined}
          onPress={onSetActive}
        />
      )}
      {/* Everything the routine's page offers, without opening it or holding the row (Round 9, R542). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Options for ${routine.name}`}
        onPress={onOptions}
        hitSlop={4}
        style={({ pressed }) => ({ width: 36, height: 44, marginRight: -8, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={colors.textMuted} />
      </Pressable>
      </View>
    </View>
  );
}

/** Above `STACK_ABOVE_SCALE` a row's name takes the whole width and its buttons go under it, rather than squeezing it (R562). */
const useStackedRow = useLargeText;

const exerciseCount = (n: number) => (n === 1 ? '1 exercise' : `${n} exercises`);

/**
 * A saved workout (R122): its name and how many exercises, which open its detail, and Start as a compact pill beside
 * it, as Set active is on a routine.
 */
function SavedRow({ saved, locked, onStart }: { saved: SavedWorkoutSummary; locked: boolean; onStart: () => void }) {
  const { colors } = useTheme();
  const stacked = useStackedRow();
  const count = exerciseCount(saved.exerciseCount);
  return (
    <View
      style={{
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'flex-start' : 'center',
        gap: 12,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${saved.name}, ${count}`}
        onPress={() => router.push(`/saved/${saved.id}`)}
        style={({ pressed }) => ({ flex: stacked ? undefined : 1, alignSelf: stacked ? 'stretch' : undefined, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight={600}>{saved.name}</Body>
          <Body muted style={{ fontSize: 14 }}>
            {count}
          </Body>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      {/* Saved workouts are Pro (R521): without it the pill says so, as a Pro program's does (Round 10 note). */}
      <Button
        label={locked ? 'Pro' : 'Start'}
        variant="secondary"
        size="compact"
        accessibilityLabel={locked ? `${saved.name} is part of GymHound Pro` : `Start ${saved.name}`}
        onPress={onStart}
      />
    </View>
  );
}

/** Where a program sits in Routines' order: the free five first, then Pro by number (R597). */
const programRank = (id: string) => {
  const rank = PROGRAM_ORDER.indexOf(id);
  return rank === -1 ? PROGRAM_ORDER.length + (programById(id)?.number ?? 0) : rank;
};

/**
 * Routines (§8.6): the twenty programs (the free five first, R597), then your own with **New routine**, then saved
 * workouts, then **Earlier programs**: the retired nine, listed only while one is active or has finished workouts
 * (R598; `listRoutines` leaves the others out). A program opens its card; a routine its detail. While a workout runs,
 * the routine can't change: Set active says to finish or discard it first (R80), rather than changing a routine Train
 * won't show until then. New routine keeps to the free limit (R88). Saved workouts (R122) are free and don't count
 * toward the limit (R118); Start waits for a workout in progress too.
 */
export default function Routines() {
  const routines = useDbQuery(listRoutines);
  const programs = routines
    .filter((routine) => routine.isPremade && programById(routine.id) !== undefined)
    .sort((a, b) => programRank(a.id) - programRank(b.id));
  const earlier = routines.filter((routine) => routine.isPremade && programById(routine.id) === undefined);
  const yours = routines.filter((routine) => !routine.isPremade);
  const noneActive = !routines.some((routine) => routine.isActive);
  const limit = useRoutineLimit();
  const saved = useDbQuery(listSavedWorkouts);
  const starter = useStartSaved();
  const pro = useIsPro();
  const actions = useRoutineActions();
  /** The routine whose ⋯ sheet is open. */
  const [options, setOptions] = useState<RoutineSummary | null>(null);

  const row = (routine: RoutineSummary) => (
    <View key={routine.id} style={{ gap: 4 }}>
      <RoutineRow
        routine={routine}
        locked={!canUseRoutine(routine, pro)}
        onSetActive={() => actions.setActive(routine)}
        onOptions={() => setOptions(routine)}
      />
      {actions.failed?.routineId === routine.id ? <Body muted>{actions.failed.text}</Body> : null}
    </View>
  );

  const programRow = (routine: RoutineSummary) => {
    const program = programById(routine.id);
    if (program === undefined) return null;
    return (
      <View key={routine.id} style={{ gap: 4 }}>
        <ProgramRow routine={routine} program={program} locked={!canUseRoutine(routine, pro)} onOptions={() => setOptions(routine)} />
        {actions.failed?.routineId === routine.id ? <Body muted>{actions.failed.text}</Body> : null}
      </View>
    );
  };

  return (
    <Screen>
      {/* Routines is not on the dock, so this is the way back. */}
      <BackLink label="Train" onPress={leave} />
      <ScreenTitle>Routines</ScreenTitle>
      {/* Until one is in use, say what Set active does (R403): the first run arrives here from Train's Choose a routine. */}
      {noneActive ? (
        <Body muted style={{ marginTop: 4 }}>
          {PICK_ONE}
        </Body>
      ) : null}
      {/* The group heading Settings uses, so "Programs" reads as a heading and not as a routine's name. */}
      {programs.length > 0 ? (
        <>
          <Label style={{ marginTop: 24, marginBottom: 8 }}>Programs</Label>
          <View style={{ gap: 8 }}>{programs.map(programRow)}</View>
        </>
      ) : null}
      <Label style={{ marginTop: programs.length > 0 ? 32 : 24, marginBottom: 8 }}>Yours</Label>
      <View style={{ gap: 8 }}>
        {yours.length === 0 ? <EmptyState text={YOURS_EMPTY} /> : yours.map(row)}
        <Button label="New routine" variant="secondary" onPress={() => limit.whenRoomFor(() => router.push('/routines/edit/new'))} />
        {/* A routine someone shared, by its link or code (§18.18). The limit is checked when it is added. */}
        <Button label="Add from code" variant="quiet" onPress={() => router.push('/routines/import')} />
      </View>
      <Label style={{ marginTop: 32, marginBottom: 8 }}>Saved workouts</Label>
      {saved.length === 0 ? (
        <EmptyState text="Finish a workout and tap Save as a workout to keep it here." />
      ) : (
        <View style={{ gap: 8 }}>
          {saved.map((w) => (
            <SavedRow key={w.id} saved={w} locked={!canUseSavedWorkouts(pro)} onStart={() => starter.start(w.id)} />
          ))}
        </View>
      )}
      {/* The retired programs someone still has (R598): they keep running, so they keep their row and Set active. */}
      {earlier.length > 0 ? (
        <>
          <Label style={{ marginTop: 32, marginBottom: 8 }}>Earlier programs</Label>
          <View style={{ gap: 8 }}>{earlier.map(row)}</View>
        </>
      ) : null}
      <RoutineOptionsSheet routine={options} actions={actions} onClose={() => setOptions(null)} />
      {actions.sheets}
      {starter.sheet}
      {limit.sheets}
    </Screen>
  );
}
