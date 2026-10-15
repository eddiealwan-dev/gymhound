import { router } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { setActiveProgram } from '../../db/repositories/programRunRepo';
import { deleteRoutine, duplicateRoutine } from '../../db/repositories/routinesRepo';
import { getActiveWorkoutId } from '../../db/repositories/workoutsRepo';
import { canSeeProgramExercises, canUseRoutine, lockedRoutineReason } from '../../domain/routineLimit';
import { SHARE_TOO_LONG } from '../../domain/routineShare';
import { announce } from '../../platform/announce';
import { useIsPro } from '../../platform/entitlements';
import { bumpData } from '../../state/dataVersion';
import { shareRoutine } from '../../state/routineShare';
import { Button } from '../Button';
import { useOpenPaywall } from '../pro/openPaywall';
import { useProGate, useRoutineLimit } from '../RoutineLimit';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../Sheet';
import { SheetTitle } from '../SheetTitle';
import { WorkoutInProgressSheet } from '../WorkoutInProgressSheet';

/** What the actions need to know about a routine. */
export type ActionRoutine = { id: string; name: string; isPremade: boolean; isActive: boolean };

/** What a failed Duplicate, Share or Delete says, under the routine it was for. Nothing was changed. */
export type RoutineFailure = { action: 'copy' | 'delete' | 'share'; routineId: string; text: string };

/**
 * A routine's actions (§8.6), one set for its page and for the ⋯ sheet on each row of Routines (Round 9, R542):
 * **Set active** (waits for a workout in progress, R80; a Pro program or a kept routine opens the Pro sheet, R525),
 * **Edit** (your own), **Duplicate** (Pro, R521; opens the copy), **Share routine** and **Delete routine** (your own;
 * asks first, keeps the history, R90). `onDeleted` runs after a delete, so the page can leave. Render `sheets` once.
 */
export function useRoutineActions(onDeleted?: () => void) {
  const db = useDb();
  const [blocked, setBlocked] = useState(false);
  const [deleting, setDeleting] = useState<ActionRoutine | null>(null);
  const [failed, setFailed] = useState<RoutineFailure | null>(null);
  const limit = useRoutineLimit();
  const gate = useProGate();

  const fail = (action: RoutineFailure['action'], routineId: string, text: string, error: unknown) => {
    if (error !== null) console.warn(`GymHound could not ${action} the routine.`, error);
    setFailed({ action, routineId, text });
    announce(text);
  };

  const setActive = (routine: ActionRoutine) =>
    gate.when(canUseRoutine(routine, gate.isPro()), lockedRoutineReason(routine), () => {
      if (getActiveWorkoutId(db) !== null) {
        setBlocked(true);
        return;
      }
      // One of the twenty starts its run at week 1 when it has none; a run it has continues (R616, R636).
      setActiveProgram(db, routine.id, Date.now());
      bumpData();
    });

  /** A routine of your own kept after Pro ends can be read and deleted, not changed, until Pro is back (R524). */
  const edit = (routine: ActionRoutine) =>
    gate.when(canUseRoutine(routine, gate.isPro()), lockedRoutineReason(routine), () => router.push(`/routines/edit/${routine.id}`));

  const duplicate = (routine: ActionRoutine) =>
    limit.whenRoomFor(() => {
      setFailed(null);
      let copyId: string;
      try {
        copyId = duplicateRoutine(db, routine.id, Date.now());
      } catch (error) {
        fail('copy', routine.id, "Couldn't copy. Try again.", error);
        return;
      }
      bumpData();
      router.push(`/routines/${copyId}`);
    });

  /** The routine's message and code through the share sheet (§18.18). Closing the share sheet says nothing. */
  const share = (routine: ActionRoutine) => {
    setFailed(null);
    void shareRoutine(db, routine.id).then((result) => {
      // shareRoutine has logged the error already.
      if (result === 'failed') fail('share', routine.id, "Couldn't open the share sheet. Try again.", null);
      // A copy with a target past what a code carries says why, rather than to try again (ruling R-t9a).
      if (result === 'too_long') fail('share', routine.id, SHARE_TOO_LONG, null);
    });
  };

  const remove = () => {
    const routine = deleting;
    setDeleting(null);
    if (routine === null) return;
    setFailed(null);
    try {
      deleteRoutine(db, routine.id);
    } catch (error) {
      fail('delete', routine.id, "Couldn't delete. Try again.", error);
      return;
    }
    bumpData();
    onDeleted?.();
  };

  const sheets: ReactNode = (
    <>
      <WorkoutInProgressSheet visible={blocked} onClose={() => setBlocked(false)} />
      <ConfirmSheet
        visible={deleting !== null}
        title="Delete this routine?"
        body="Workouts you finished with it stay in History."
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
      {limit.sheets}
      {gate.sheets}
    </>
  );

  return { setActive, edit, duplicate, share, askDelete: setDeleting, failed, sheets };
}

/**
 * The ⋯ sheet of a routine on Routines (Round 9, R542): its name, then what its page offers, so nothing needs a long
 * press. A Pro program or a kept routine shows **See Pro** in place of Set active, as its row does; the routine in use
 * shows no Set active. Each button closes the sheet, then acts once it has gone, so a sheet it opens never stacks.
 */
export function RoutineOptionsSheet({
  routine,
  actions,
  onClose,
}: {
  routine: ActionRoutine | null;
  actions: ReturnType<typeof useRoutineActions>;
  onClose: () => void;
}) {
  const pro = useIsPro();
  const openPaywall = useOpenPaywall();
  const locked = routine !== null && !canUseRoutine(routine, pro);
  const then = (go: (r: ActionRoutine) => void) => () => {
    if (routine === null) return;
    onClose();
    afterSheetCloses(() => go(routine));
  };
  return (
    <Sheet visible={routine !== null} onClose={onClose}>
      <SheetTitle>{routine?.name ?? ''}</SheetTitle>
      <View style={{ gap: 8 }}>
        {locked ? <Button label="See Pro" onPress={then(() => openPaywall())} /> : null}
        {!locked && routine !== null && !routine.isActive ? <Button label="Set active" variant="secondary" onPress={then(actions.setActive)} /> : null}
        {routine !== null && !routine.isPremade ? <Button label="Edit" variant="secondary" onPress={then(actions.edit)} /> : null}
        {/* Duplicate copies the exercises, so a program offers it only while they show: the active one (R634, R635). */}
        {routine !== null && canSeeProgramExercises(routine, pro) ? <Button label="Duplicate" variant="secondary" onPress={then(actions.duplicate)} /> : null}
        <Button label="Share routine" variant="secondary" onPress={then(actions.share)} />
        {routine !== null && !routine.isPremade ? <Button label="Delete routine" variant="secondary" onPress={then(actions.askDelete)} /> : null}
        <Button label="Cancel" variant="quiet" onPress={onClose} />
      </View>
    </Sheet>
  );
}
