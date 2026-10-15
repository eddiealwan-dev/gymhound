import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useDb } from '../db/DbProvider';
import { swapCandidates } from '../db/repositories/routinesRepo';
import { alternativesFor } from '../domain/alternatives';
import { equipmentLabel, muscleLabel } from '../domain/labels';
import type { RungWords } from '../domain/ruleLine';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { SheetTitle } from './SheetTitle';
import { Body } from './Text';
import { useTheme } from './ThemeProvider';

/** What Modify is changing: the exercise now in place, and for a program, the one the program has there. */
export type ModifyTarget = {
  /** The exercise now in place. */
  exerciseId: string;
  name: string;
  /** The program's own exercise when this is a program's slot and it has been swapped; null otherwise. */
  programExerciseId: string | null;
  /** Exercises already in the day or workout, which aren't offered again. */
  inUse: readonly string[];
};

/** A ladder slot's rungs (R618), for Change rung: their words, the current one (0-based) and the slot's sets. */
export type LadderChoice = { rungs: readonly RungWords[]; current: number; sets: number };

/** A rung's sets and range: "3 × 5–8", or "3 × 10–30 s" for a hold. */
const rungScheme = (r: RungWords, sets: number): string =>
  `${sets} × ${r.repMin === r.repMax ? r.repMin : `${r.repMin}–${r.repMax}`}${r.timed ? ' s' : ''}`;

/**
 * Modify (R553, the owner's Round 10 request): "Choose a new exercise" lists up to eight exercises that work the same
 * muscles (`alternativesFor`), each with its equipment; on a program's swapped slot, the program's own exercise comes
 * first, marked "(program's)". `note` says how long the swap lasts. Choosing one calls `onChoose`; the caller swaps.
 *
 * On a ladder slot (`ladder`, R618) it is **Change rung** instead: the ladder's rungs in order, each with its sets and
 * range, the current one marked "(current)", so the lifter starts where the notes say. Choosing another calls
 * `onChooseRung`; the current one just closes.
 */
export function ModifySheet({
  target,
  note,
  onChoose,
  onClose,
  ladder = null,
  onChooseRung,
}: {
  target: ModifyTarget | null;
  note: string;
  onChoose: (exerciseId: string) => void;
  onClose: () => void;
  ladder?: LadderChoice | null;
  onChooseRung?: (rung: number) => void;
}) {
  const db = useDb();
  const { colors } = useTheme();
  const options = useMemo(() => {
    if (target === null || ladder !== null) return { main: null, rows: [] as { id: string; name: string; detail: string; program: boolean }[] };
    const all = swapCandidates(db);
    const current = all.find((c) => c.id === target.exerciseId);
    if (current === undefined) return { main: null, rows: [] };
    const exclude = new Set(target.inUse);
    const program = target.programExerciseId !== null && target.programExerciseId !== target.exerciseId ? all.find((c) => c.id === target.programExerciseId) : undefined;
    if (program) exclude.add(program.id);
    const picked = [...(program ? [program] : []), ...alternativesFor(current, all, exclude)];
    return {
      main: current.primaryMuscles[0] ?? null,
      rows: picked.map((c) => ({ id: c.id, name: c.name, detail: equipmentLabel(c.equipment), program: c.id === program?.id })),
    };
  }, [db, target, ladder]);

  if (ladder !== null) {
    return (
      <Sheet visible={target !== null} onClose={onClose}>
        <SheetTitle>Change rung</SheetTitle>
        <View style={{ marginBottom: 12 }}>
          {ladder.rungs.map((rung, i) => {
            const current = i === ladder.current;
            const scheme = rungScheme(rung, ladder.sets);
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`Rung ${i + 1}, ${rung.name}${current ? ', current' : ''}, ${scheme}`}
                accessibilityState={{ selected: current }}
                onPress={() => (current ? onClose() : onChooseRung?.(i))}
                style={({ pressed }) => ({
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body weight={600}>{`${i + 1}. ${rung.name}${current ? ' (current)' : ''}`}</Body>
                  <Body muted style={{ fontSize: 14 }}>
                    {scheme}
                  </Body>
                </View>
                {current ? null : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
              </Pressable>
            );
          })}
        </View>
        <Body muted style={{ fontSize: 14, marginBottom: 16 }}>
          {note}
        </Body>
        <Button label="Cancel" variant="quiet" onPress={onClose} />
      </Sheet>
    );
  }

  return (
    <Sheet visible={target !== null} onClose={onClose}>
      <SheetTitle subtitle={options.main === null ? null : `In place of ${target?.name ?? ''}. Works your ${muscleLabel(options.main).toLowerCase()}.`}>
        Choose a new exercise
      </SheetTitle>
      {options.rows.length === 0 ? (
        <Body muted style={{ marginBottom: 16 }}>
          Nothing else in the library works the same muscles the same way.
        </Body>
      ) : (
        <View style={{ marginBottom: 12 }}>
          {options.rows.map((row) => (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={`${row.name}${row.program ? ", the program's" : ''}, ${row.detail}`}
              onPress={() => onChoose(row.id)}
              style={({ pressed }) => ({
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body weight={600}>{row.program ? `${row.name} (program's)` : row.name}</Body>
                <Body muted style={{ fontSize: 14 }}>
                  {row.detail}
                </Body>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
      <Body muted style={{ fontSize: 14, marginBottom: 16 }}>
        {note}
      </Body>
      <Button label="Cancel" variant="quiet" onPress={onClose} />
    </Sheet>
  );
}
