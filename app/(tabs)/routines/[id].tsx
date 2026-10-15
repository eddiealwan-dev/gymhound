import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useDb } from '../../../src/db/DbProvider';
import { changeRung, startProgramOver } from '../../../src/db/repositories/programRunRepo';
import { programPageOf, type ProgramPageView, type SlotScheme } from '../../../src/db/repositories/programViewRepo';
import { getRoutineDetail, swapRoutineExercise } from '../../../src/db/repositories/routinesRepo';
import { programExerciseId } from '../../../src/domain/alternatives';
import { routineLine } from '../../../src/domain/programInfo';
import { programById } from '../../../src/seed/programs.generated';
import type { Program } from '../../../src/seed/programTypes';
import type { RoutineDetail, RoutineDetailExercise } from '../../../src/db/repositories/routinesRepo';
import type { Db } from '../../../src/db/types';
import { formatRepScheme } from '../../../src/domain/labels';
import { graduationLine, programWeekText, startOverQuestion } from '../../../src/domain/upNext';
import { linksFromGroups } from '../../../src/domain/routineDraft';
import { bumpData, useDbQuery } from '../../../src/state/dataVersion';
import { ActiveBadge } from '../../../src/ui/ActiveBadge';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { canSeeProgramExercises, canUseRoutine, lockedRoutineReason, proReasonText } from '../../../src/domain/routineLimit';
import { useIsPro } from '../../../src/platform/entitlements';
import { useOpenPaywall } from '../../../src/ui/pro/openPaywall';
import { ModifySheet } from '../../../src/ui/ModifySheet';
import { ProgramCard } from '../../../src/ui/programs/ProgramCard';
import { useProGate } from '../../../src/ui/RoutineLimit';
import { useRoutineActions } from '../../../src/ui/routines/useRoutineActions';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../../../src/ui/Sheet';
import { SheetTitle } from '../../../src/ui/SheetTitle';
import { Screen } from '../../../src/ui/Screen';
import { SupersetBar, supersetRuns } from '../../../src/ui/SupersetBar';
import { Body, Display, ScreenTitle } from '../../../src/ui/Text';
import { breakableName } from '../../../src/ui/largeText';
import { useTheme } from '../../../src/ui/ThemeProvider';

/** Back to Routines. With nothing to go back to (opened by address, or reloaded), it lands on Routines. */
function toRoutines() {
  if (router.canGoBack()) router.back();
  else router.navigate('/routines');
}

/**
 * An exercise of a day: its name, and its sets and reps (seconds for timed ones) as Up next shows them. Tapping it opens
 * its Modify and Stats (R553, R554).
 */
function ExerciseRow({
  exercise,
  plan,
  onPress,
}: {
  exercise: RoutineDetailExercise;
  /** A program slot's next session (§18.29): the week's sets, the rung's range, a carry's distance, a metcon's format. */
  plan: SlotScheme | null;
  onPress: (exercise: RoutineDetailExercise) => void;
}) {
  const scheme = schemeOf(exercise, plan);
  return (
    // At a large text size the scheme drops under the name rather than squeezing it, as on Up next.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, ${scheme}`}
      accessibilityHint="Modify or see its stats"
      onPress={() => onPress(exercise)}
      style={({ pressed }) => ({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, paddingVertical: 8, minHeight: 44, opacity: pressed ? 0.8 : 1 })}
    >
      <Body style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>{exercise.name}</Body>
      <Body muted style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
        {scheme}
      </Body>
    </Pressable>
  );
}

/** An exercise's sets and reps as Up next shows them; a program slot's as its next session will start (§18.29). */
function schemeOf(exercise: RoutineDetailExercise, plan: SlotScheme | null): string {
  return plan
    ? formatRepScheme(plan.setCount, plan.repMin, plan.repMax, exercise.loggingType, plan.schemeExtra)
    : formatRepScheme(exercise.setCount, exercise.repMin, exercise.repMax, exercise.loggingType);
}

/** A day as a card: its name, then its exercises in order, a superset marked by the bar down its members' edge. */
function DayCard({
  day,
  plans,
  onExercise,
}: {
  day: RoutineDetail['days'][number];
  plans: ProgramPageView['slots'] | null;
  onExercise: (exercise: RoutineDetailExercise) => void;
}) {
  const { colors } = useTheme();
  const links = linksFromGroups(day.exercises.map((e) => e.supersetGroup));
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>
      <Display accessibilityRole="header" style={{ fontSize: 22, marginBottom: 4 }}>
        {day.name}
      </Display>
      {supersetRuns(day.exercises, links).map((run) => {
        const rows = run.members.map((exercise) => (
          <ExerciseRow key={exercise.id} exercise={exercise} plan={plans?.[exercise.id]?.scheme ?? null} onPress={onExercise} />
        ));
        return run.superset ? <SupersetBar key={run.members[0].id}>{rows}</SupersetBar> : rows;
      })}
    </View>
  );
}

/** Under a program's card while its days and exercises are hidden (R634). */
const HIDDEN = "The days and exercises show once it's your active program.";

/** Under a retired program's name (R598): it is listed under Earlier programs only while someone still has it. */
const RETIRED = 'Retired. It keeps running for you, and its history stays.';

/**
 * A routine (§8.6). One of the twenty programs is its card (R630): the documents' description, then its state and
 * actions; its days and exercises show only while it is your active program and you can use it (R634), and until then
 * the card ends with **Set active**, or for a Pro program on free R525's line and **See Pro**. Any other routine shows
 * its days and exercises, with **Set active** and **Duplicate**, and for your own **Edit** and **Delete**; a retired
 * program says it keeps running (R598). Premades are read-only but still progress when run. The actions are
 * `useRoutineActions`, shared with the ⋯ sheet on Routines (R542); Delete leaves for Routines.
 */
/**
 * The active program's state under its card (R634, R636, R616, R614): Active with the week ("Week 3 of 12", or "12
 * weeks done."), the week's line, a line for each lift that dropped back twice in this run, and Start over, which asks
 * first.
 */
function ActiveProgramState({ name, page, onStartOver }: { name: string; page: ProgramPageView | null; onStartOver: () => void }) {
  if (page === null) return <ActiveBadge />;
  return (
    <View style={{ gap: 4 }}>
      <ActiveBadge />
      <Body weight={600}>{programWeekText(page)}</Body>
      {page.weekLine === null ? null : <Body muted>{page.weekLine}</Body>}
      {page.droppedTwice.map((exercise) => (
        <Body key={exercise} muted>
          {graduationLine(exercise)}
        </Body>
      ))}
      <View style={{ marginTop: 4 }}>
        <Button label="Start over" variant="secondary" accessibilityLabel={`Start ${name} over at week 1`} onPress={onStartOver} />
      </View>
    </View>
  );
}

/** The routine and, for the active program whose exercises show, its state (R634). */
function readPage(db: Db, id: string, pro: boolean) {
  const routine = getRoutineDetail(db, id);
  const page = routine !== null && routine.isPremade && routine.isActive && canSeeProgramExercises(routine, pro) ? programPageOf(db, id) : null;
  return { routine, page };
}

export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pro = useIsPro();
  const read = useCallback((d: Db) => readPage(d, id, pro), [id, pro]);
  const { routine, page } = useDbQuery(read);
  /** Start over waiting on its question (R616). */
  const [askStartOver, setAskStartOver] = useState(false);
  /** The ladder slot Change rung is open for (R618). */
  const [changingRung, setChangingRung] = useState<RoutineDetailExercise | null>(null);
  const actions = useRoutineActions(toRoutines);
  const openPaywall = useOpenPaywall();
  const db = useDb();
  const gate = useProGate();
  /** The exercise whose sheet is open, and the one Modify is open for. */
  const [chosen, setChosen] = useState<RoutineDetailExercise | null>(null);
  const [modifying, setModifying] = useState<RoutineDetailExercise | null>(null);

  if (routine === null) {
    return (
      <Screen>
        <BackLink label="Routines" onPress={toRoutines} />
        <Body muted style={{ marginTop: 8 }}>
          That routine isn't here.
        </Body>
      </Screen>
    );
  }

  const locked = !canUseRoutine(routine, pro);
  const failed = actions.failed?.routineId === routine.id ? actions.failed : null;
  const program: Program | undefined = routine.isPremade ? programById(routine.id) : undefined;
  // R634: a program's days show only while it is the active one and usable; any other routine's always do.
  const showDays = canSeeProgramExercises(routine, pro);

  return (
    <Screen>
      <BackLink label="Routines" onPress={toRoutines} />
      {program !== undefined ? (
        <ProgramCard
          program={program}
          footer={
            <View style={{ gap: 8 }}>
              {locked ? <Body muted>{proReasonText(lockedRoutineReason(routine))}</Body> : showDays ? null : <Body muted>{HIDDEN}</Body>}
              {showDays ? (
                <ActiveProgramState name={routine.name} page={page} onStartOver={() => setAskStartOver(true)} />
              ) : (
                <Button label={locked ? 'See Pro' : 'Set active'} onPress={locked ? openPaywall : () => actions.setActive(routine)} />
              )}
              {/* Duplicate copies the exercises, so it is offered only while they show (R635). */}
              {showDays ? <Button label="Duplicate" variant="secondary" onPress={() => actions.duplicate(routine)} /> : null}
              {failed?.action === 'copy' ? <Body muted>{failed.text}</Body> : null}
              <Button label="Share routine" variant="quiet" accessibilityLabel={`Share ${routine.name}`} onPress={() => actions.share(routine)} />
              {failed?.action === 'share' ? <Body muted>{failed.text}</Body> : null}
            </View>
          }
        />
      ) : (
        <>
          <ScreenTitle>{breakableName(routine.name)}</ScreenTitle>
          <Body muted style={{ fontSize: 14, marginTop: 4 }}>
            {routineLine({ id: routine.id, isPremade: routine.isPremade, dayCount: routine.days.length })}
          </Body>
          {routine.isPremade ? (
            <Body muted style={{ marginTop: 4 }}>
              {RETIRED}
            </Body>
          ) : null}
          <View style={{ gap: 8, marginTop: 24 }}>
            {locked ? <Body muted>{proReasonText(lockedRoutineReason(routine))}</Body> : null}
            {routine.isActive && !locked ? <ActiveBadge /> : <Button label={locked ? 'See Pro' : 'Set active'} onPress={locked ? openPaywall : () => actions.setActive(routine)} />}
            {/* Side by side when both fit; at a large text size the second drops under the first. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <View style={{ flexGrow: 1 }}>
                <Button label="Duplicate" variant="secondary" onPress={() => actions.duplicate(routine)} />
              </View>
              {routine.isPremade ? null : (
                <View style={{ flexGrow: 1 }}>
                  <Button label="Edit" variant="secondary" onPress={() => actions.edit(routine)} />
                </View>
              )}
            </View>
            {failed?.action === 'copy' ? <Body muted>{failed.text}</Body> : null}
            <Button
              label="Share routine"
              variant="quiet"
              accessibilityLabel={`Share ${routine.name}`}
              onPress={() => actions.share(routine)}
            />
            {failed?.action === 'share' ? <Body muted>{failed.text}</Body> : null}
          </View>
        </>
      )}
      {showDays ? (
        <View style={{ gap: 16, marginTop: 32 }}>
          {routine.days.map((day) => (
            <DayCard key={day.id} day={day} plans={page?.slots ?? null} onExercise={setChosen} />
          ))}
        </View>
      ) : null}
      {routine.isPremade ? null : (
        // At the foot of the page, quiet and centred, as Delete workout is on a workout and Discard workout in the session.
        <View style={{ marginTop: 24 }}>
          <Button label="Delete routine" variant="quiet" onPress={() => actions.askDelete(routine)} />
          {failed?.action === 'delete' ? <Body muted style={{ textAlign: 'center' }}>{failed.text}</Body> : null}
        </View>
      )}
      <Sheet visible={chosen !== null} onClose={() => setChosen(null)}>
        <SheetTitle subtitle={chosen === null ? null : schemeOf(chosen, page?.slots[chosen.id]?.scheme ?? null)}>{chosen?.name ?? ''}</SheetTitle>
        <View style={{ gap: 8 }}>
          {/* A ladder slot changes its rung in place of Modify (R618). */}
          {chosen !== null && page?.slots[chosen.id]?.ladder ? (
            <Button
              label="Change rung"
              variant="secondary"
              accessibilityLabel={`Change rung for ${chosen.name}`}
              onPress={() => {
                const exercise = chosen;
                setChosen(null);
                afterSheetCloses(() => gate.when(canUseRoutine(routine, gate.isPro()), lockedRoutineReason(routine), () => setChangingRung(exercise)));
              }}
            />
          ) : (
            <Button
              label="Modify"
              variant="secondary"
              onPress={() => {
                const exercise = chosen;
                setChosen(null);
                // A Pro program or a kept routine can't change until Pro is back (R524, R525).
                if (exercise) afterSheetCloses(() => gate.when(canUseRoutine(routine, gate.isPro()), lockedRoutineReason(routine), () => setModifying(exercise)));
              }}
            />
          )}
          <Button
            label="Stats"
            variant="secondary"
            onPress={() => {
              const exercise = chosen;
              setChosen(null);
              if (exercise) afterSheetCloses(() => router.push(`/lift/${exercise.exerciseId}`));
            }}
          />
          <Button label="Cancel" variant="quiet" onPress={() => setChosen(null)} />
        </View>
      </Sheet>
      <ModifySheet
        target={
          modifying === null
            ? null
            : {
                exerciseId: modifying.exerciseId,
                name: modifying.name,
                programExerciseId: programExerciseId(modifying.id, routine.isPremade),
                inUse: routine.days.find((d) => d.exercises.some((e) => e.id === modifying.id))?.exercises.map((e) => e.exerciseId) ?? [],
              }
        }
        note={`Changes it in ${routine.name} from the next workout. Its sets and reps stay; the next workout asks for a starting weight.`}
        onClose={() => setModifying(null)}
        onChoose={(exerciseId) => {
          if (modifying) swapRoutineExercise(db, modifying.id, exerciseId);
          setModifying(null);
          bumpData();
        }}
      />
      <ModifySheet
        target={changingRung === null ? null : { exerciseId: changingRung.exerciseId, name: changingRung.name, programExerciseId: null, inUse: [] }}
        ladder={changingRung === null ? null : (page?.slots[changingRung.id]?.ladder ?? null)}
        note="Changes it from the next workout. Its next weight starts fresh."
        onChoose={() => setChangingRung(null)}
        onChooseRung={(rung) => {
          if (changingRung) changeRung(db, changingRung.id, rung);
          setChangingRung(null);
          bumpData();
        }}
        onClose={() => setChangingRung(null)}
      />
      <ConfirmSheet
        visible={askStartOver}
        title={startOverQuestion(routine.name)}
        confirmLabel="Start over"
        cancelLabel="Not now"
        onConfirm={() => {
          setAskStartOver(false);
          startProgramOver(db, routine.id, Date.now());
          bumpData();
        }}
        onCancel={() => setAskStartOver(false)}
      />
      {gate.sheets}
      {actions.sheets}
    </Screen>
  );
}
