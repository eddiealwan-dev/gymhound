import { groupsOutsideBand, MAJOR_GROUPS, weeklyFrequencyByGroup } from '../domain/programVolume';
import type { MajorGroup } from '../domain/programVolume';
import { LIBRARY_EXERCISES } from './library.generated';
import { PREMADE_ORDER, SEED_ROUTINES } from './routines';
import type { SeedRoutine } from './routines';

const LIBRARY = new Map(LIBRARY_EXERCISES.map((e) => [e.id, e]));
const exercise = (id: string) => {
  const found = LIBRARY.get(id);
  if (!found) throw new Error(`${id} is not in the library`);
  return found;
};
const muscles = (id: string) => ({ primary: exercise(id).primaryMuscles, secondary: exercise(id).secondaryMuscles });
const week = (routine: SeedRoutine) =>
  routine.days.map((d) => ({ exercises: d.exercises.map((e) => ({ exerciseId: e.exercise, sets: e.sets })) }));
const program = (id: string) => SEED_ROUTINES.find((r) => r.id === id)!;
const entries = (routine: SeedRoutine) => routine.days.flatMap((d) => d.exercises);
const GROUPS = Object.keys(MAJOR_GROUPS) as MajorGroup[];
/** What an exercise trains, leaving out the front delts: pressing trains them on every pushing day (R93). */
const musclesBesidesFrontDelts = (id: string) => ({
  primary: muscles(id).primary.filter((m) => m !== 'front_delts'),
  secondary: muscles(id).secondary.filter((m) => m !== 'front_delts'),
});
/** Exercises that are not isolation or core work. */
const isCompound = (id: string) => !['isolation', 'core'].includes(exercise(id).pattern);

/** Each built-in program with its name and days (§18.3, §18.8 R87). */
const PROGRAMS = [
  { id: 'premade-ppl-6', name: 'Push/pull/legs', days: ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'] },
  { id: 'premade-upperlower-4', name: '4-day upper/lower', days: ['Upper A', 'Lower A', 'Upper B', 'Lower B'] },
  { id: 'premade-fullbody-3', name: 'Beginner full body', days: ['A', 'B', 'C'] },
  { id: 'premade-advancedfullbody-4', name: 'Advanced full body', days: ['A', 'B', 'C', 'D'] },
  { id: 'premade-brosplit-5', name: 'Bro split', days: ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms'] },
  { id: 'premade-dumbbell-3', name: 'Dumbbell full body', days: ['A', 'B', 'C'] },
  { id: 'premade-calisthenics-3', name: 'Calisthenics', days: ['A', 'B', 'C'] },
  { id: 'premade-mobility-3', name: 'Mobility', days: ['Hips and legs', 'Back and shoulders', 'Full body'] },
] as const;

const VOLUME_CHECKED = PROGRAMS.filter((p) => p.id !== 'premade-mobility-3');
const GYM_PROGRAMS = VOLUME_CHECKED.filter((p) => p.id !== 'premade-calisthenics-3');

describe('the eight programs', () => {
  it('are the premades, in the spec order, with their names and days', () => {
    expect(PREMADE_ORDER).toEqual(PROGRAMS.map((p) => p.id));
    expect(SEED_ROUTINES.map((r) => [r.id, r.name, r.days.map((d) => d.name)])).toEqual(
      PROGRAMS.map((p) => [p.id, p.name, [...p.days]]),
    );
  });

  it('keep the ids of the programs that continue, so their next weights survive', () => {
    for (const id of ['premade-ppl-6', 'premade-upperlower-4', 'premade-fullbody-3', 'premade-dumbbell-3']) {
      expect(PREMADE_ORDER).toContain(id);
    }
    expect(program('premade-ppl-6').days.map((d) => d.slug)).toEqual(['push-a', 'pull-a', 'legs-a', 'push-b', 'pull-b', 'legs-b']);
    expect(program('premade-upperlower-4').days.map((d) => d.slug)).toEqual(['upper-a', 'lower-a', 'upper-b', 'lower-b']);
    expect(program('premade-fullbody-3').days.map((d) => d.slug)).toEqual(['a', 'b', 'c']);
    expect(program('premade-dumbbell-3').days.map((d) => d.slug)).toEqual(['a', 'b', 'c']);
    expect(PREMADE_ORDER).not.toContain('premade-5x5-3');
    expect(PREMADE_ORDER).not.toContain('premade-noequipment-3');
  });

  it('use only exercises the library has', () => {
    const missing = SEED_ROUTINES.flatMap((r) => entries(r).map((e) => e.exercise)).filter((id) => !LIBRARY.has(id));
    expect(missing).toEqual([]);
  });

  it('give each day a unique name and slug, and each exercise once a day (its id is day and exercise)', () => {
    for (const routine of SEED_ROUTINES) {
      const names = routine.days.map((d) => d.name);
      const slugs = routine.days.map((d) => d.slug);
      expect(new Set(names).size).toBe(names.length);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const day of routine.days) {
        const ids = day.exercises.map((e) => e.exercise);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('give every exercise 1 to 5 sets and a rep range from low to high', () => {
    for (const e of SEED_ROUTINES.flatMap(entries)) {
      expect(e.sets).toBeGreaterThanOrEqual(1);
      expect(e.sets).toBeLessThanOrEqual(5);
      expect(e.reps[0]).toBeGreaterThan(0);
      expect(e.reps[0]).toBeLessThanOrEqual(e.reps[1]);
    }
  });
});

describe('weekly volume and frequency (§18.8 R87, R93)', () => {
  it.each(VOLUME_CHECKED.map((p) => [p.name, p.id]))(
    '%s gives each major group about 10 to 20 working sets a week: 8 to 24, shoulders capped on side and rear delts',
    (_name, id) => {
      expect(groupsOutsideBand(week(program(id)), muscles)).toEqual([]);
    },
  );

  it.each(
    VOLUME_CHECKED.filter((p) => p.id !== 'premade-brosplit-5' && p.id !== 'premade-calisthenics-3').map((p) => [p.name, p.id]),
  )('%s trains each major group at least twice a week', (_name, id) => {
    const frequency = weeklyFrequencyByGroup(week(program(id)), muscles);
    for (const group of GROUPS) expect([group, frequency[group] >= 2]).toEqual([group, true]);
  });

  it('Bro split trains each major group on one day only, shoulders by their side and rear delts', () => {
    // Chest day's incline press trains the front delts too; like the volume cap (R93), the count leaves them out.
    const frequency = weeklyFrequencyByGroup(week(program('premade-brosplit-5')), musclesBesidesFrontDelts);
    expect(frequency).toEqual(Object.fromEntries(GROUPS.map((g) => [g, 1])));
  });

  it('Calisthenics trains each major group at least twice a week; biceps, which no bodyweight move trains first, on every pulling day', () => {
    const calisthenics = program('premade-calisthenics-3');
    const frequency = weeklyFrequencyByGroup(week(calisthenics), muscles);
    for (const group of GROUPS.filter((g) => g !== 'biceps')) expect([group, frequency[group] >= 2]).toEqual([group, true]);
    // The exception: the library has no bodyweight exercise with biceps as a primary muscle (no curls on rings or a
    // bar; the timed ones are stretches). Chin-ups, pull-ups and inverted rows train them as secondary, on every day,
    // which the band above holds to at least 8 sets a week.
    expect(LIBRARY_EXERCISES.filter((e) => e.primaryMuscles.includes('biceps') && e.loggingType === 'bodyweight_plus')).toEqual([]);
    for (const day of calisthenics.days) {
      expect(day.exercises.some((e) => exercise(e.exercise).secondaryMuscles.includes('biceps'))).toBe(true);
    }
  });
});

describe('what each program is built from', () => {
  it.each(GYM_PROGRAMS.map((p) => [p.name, p.id]))('%s presses with a barbell or dumbbells on every day that trains chest or front delts', (_name, id) => {
    for (const day of program(id).days) {
      const pressing = day.exercises.some((e) => muscles(e.exercise).primary.some((m) => m === 'chest' || m === 'front_delts'));
      const press = day.exercises.some((e) => {
        const { equipment, loggingType, pattern } = exercise(e.exercise);
        return (equipment === 'barbell' || equipment === 'dumbbell') && loggingType === 'weighted' && pattern.endsWith('_push');
      });
      expect([day.name, !pressing || press]).toEqual([day.name, true]);
    }
  });

  it.each(VOLUME_CHECKED.map((p) => [p.name, p.id]))('%s puts compound lifts before isolation and core work', (_name, id) => {
    for (const day of program(id).days) {
      const firstSmall = day.exercises.findIndex((e) => !isCompound(e.exercise));
      const late = firstSmall === -1 ? [] : day.exercises.slice(firstSmall).filter((e) => isCompound(e.exercise));
      expect([day.name, late.map((e) => e.exercise)]).toEqual([day.name, []]);
    }
  });

  it('Beginner full body is three days of barbell and dumbbell basics, with a few cable and machine moves', () => {
    const kinds = entries(program('premade-fullbody-3')).map((e) => exercise(e.exercise).equipment);
    expect(kinds.filter((k) => k === 'barbell' || k === 'dumbbell').length).toBeGreaterThan(kinds.length / 2);
    expect(program('premade-fullbody-3').days).toHaveLength(3);
  });

  it('Dumbbell full body uses only dumbbells and bodyweight', () => {
    const kinds = new Set(entries(program('premade-dumbbell-3')).map((e) => exercise(e.exercise).equipment));
    expect([...kinds].filter((k) => k !== 'dumbbell' && k !== 'bodyweight')).toEqual([]);
  });

  it('Calisthenics uses only bodyweight and timed exercises, progressing by reps', () => {
    for (const e of entries(program('premade-calisthenics-3'))) {
      expect([e.exercise, exercise(e.exercise).loggingType]).toEqual([e.exercise, expect.stringMatching(/^(bodyweight_plus|timed)$/)]);
      expect(e.inc).toBe('none');
    }
  });

  it('Mobility is three days of timed stretches and holds, in seconds, with no weight', () => {
    const mobility = program('premade-mobility-3');
    expect(mobility.days).toHaveLength(3);
    for (const e of entries(mobility)) {
      expect([e.exercise, exercise(e.exercise).loggingType]).toEqual([e.exercise, 'timed']);
      expect(e.inc).toBe('none');
      expect(e.reps[0]).toBeGreaterThanOrEqual(20);
      expect(e.reps[1]).toBeLessThanOrEqual(90);
    }
  });

  it('Bro split is five days, one muscle group each', () => {
    const bro = program('premade-brosplit-5');
    expect(bro.days).toHaveLength(5);
    const trainedFirst = (day: number) =>
      new Set(
        bro.days[day].exercises.flatMap((e) =>
          GROUPS.filter((g) => musclesBesidesFrontDelts(e.exercise).primary.some((m) => MAJOR_GROUPS[g].includes(m))),
        ),
      );
    expect([0, 1, 2, 3, 4].map((d) => [...trainedFirst(d)].sort())).toEqual([
      ['chest'],
      ['back'],
      ['shoulders'],
      ['glutes', 'hamstrings', 'quads'],
      ['biceps', 'triceps'],
    ]);
  });

  it('runs the other programs on the days the spec names: six, four, four and three', () => {
    expect(program('premade-ppl-6').days).toHaveLength(6);
    expect(program('premade-upperlower-4').days).toHaveLength(4);
    expect(program('premade-advancedfullbody-4').days).toHaveLength(4);
    expect(program('premade-dumbbell-3').days).toHaveLength(3);
  });
});

describe('rep ranges and increments', () => {
  const LOWER_BODY = ['squat', 'hinge', 'lunge'];

  it('adds no weight to a timed exercise', () => {
    for (const e of SEED_ROUTINES.flatMap(entries)) {
      if (exercise(e.exercise).loggingType === 'timed') expect([e.exercise, e.inc]).toEqual([e.exercise, 'none']);
    }
  });

  it('raises lower-body barbell lifts by double the increment and other weighted lifts by the default', () => {
    for (const e of SEED_ROUTINES.flatMap(entries)) {
      const { equipment, loggingType, pattern } = exercise(e.exercise);
      if (loggingType !== 'weighted') continue;
      const expected = equipment === 'barbell' && LOWER_BODY.includes(pattern) ? 'double' : 'default';
      expect([e.exercise, e.inc]).toEqual([e.exercise, expected]);
    }
  });

  it('never doubles the increment of a bodyweight exercise', () => {
    for (const e of SEED_ROUTINES.flatMap(entries)) {
      if (exercise(e.exercise).loggingType === 'bodyweight_plus') expect([e.exercise, e.inc]).not.toEqual([e.exercise, 'double']);
    }
  });

  it('works the main barbell lifts for 5 to 8 reps, and calves and lateral raises for 12 to 20', () => {
    const MAIN = ['barbell-back-squat', 'barbell-front-squat', 'barbell-deadlift', 'barbell-bench-press'];
    for (const e of SEED_ROUTINES.flatMap(entries)) {
      const { primaryMuscles, pattern } = exercise(e.exercise);
      if (MAIN.includes(e.exercise)) expect([e.exercise, e.reps]).toEqual([e.exercise, [5, 8]]);
      const calvesOrLaterals = primaryMuscles.includes('calves') || (primaryMuscles.includes('side_delts') && pattern === 'isolation');
      if (calvesOrLaterals && exercise(e.exercise).loggingType === 'weighted') expect([e.exercise, e.reps]).toEqual([e.exercise, [12, 20]]);
    }
  });
});
