import { V8_ORDER, V8_ROUTINES } from '../db/testing/v8Routines';
import { LIBRARY_EXERCISES } from './library.generated';
import { NEW_EXERCISES } from './newExercises';
import { PROGRAM_ORDER, PROGRAMS } from './programs.generated';
import { PREMADE_ORDER, RETIRED_PREMADES, SEED_ROUTINES } from './routines';

// The twenty programs' own checks (volume, rules, the documents' words) are in programs.test.ts and
// programMapping.test.ts; these check what the seed writes from them.

const KNOWN = new Set([...LIBRARY_EXERCISES, ...NEW_EXERCISES].map((e) => e.id));

describe('the twenty programs the seed writes (§18.29, R596)', () => {
  it('are the programs, by number, with their names and days', () => {
    expect(SEED_ROUTINES.map((r) => [r.id, r.name, r.days.map((d) => [d.slug, d.name])])).toEqual(
      PROGRAMS.map((p) => [p.id, p.name, p.days.map((d) => [d.slug, d.name])]),
    );
    expect(SEED_ROUTINES).toHaveLength(20);
  });

  it("give each routine exercise its slot's id, exercise, sets, range and increment in lb", () => {
    SEED_ROUTINES.forEach((routine, r) => {
      routine.days.forEach((day, d) => {
        expect(day.exercises).toEqual(
          PROGRAMS[r].days[d].slots.map((s) => ({ id: s.id, exercise: s.exerciseId, sets: s.sets, reps: [s.repMin, s.repMax], incrementLb: s.incrementLb })),
        );
      });
    });
  });

  it("give every routine exercise a unique id that starts with its day's id (`${routine}:${slug}:`)", () => {
    const ids = SEED_ROUTINES.flatMap((r) => r.days.flatMap((d) => d.exercises.map((e) => e.id)));
    expect(new Set(ids).size).toBe(ids.length);
    for (const routine of SEED_ROUTINES) {
      for (const day of routine.days) {
        for (const e of day.exercises) expect([e.id, e.id.startsWith(`${routine.id}:${day.slug}:${e.exercise}`)]).toEqual([e.id, true]);
      }
    }
  });

  it('use only exercises the seed writes, the library or the new ones', () => {
    const missing = SEED_ROUTINES.flatMap((r) => r.days.flatMap((d) => d.exercises.map((e) => e.exercise))).filter((id) => !KNOWN.has(id));
    expect(missing).toEqual([]);
  });

  it('give every slot at least one set, a range from low to high and an increment of 0 or more', () => {
    for (const e of SEED_ROUTINES.flatMap((r) => r.days.flatMap((d) => d.exercises))) {
      expect([e.id, e.sets >= 1, e.reps[0] > 0, e.reps[0] <= e.reps[1], e.incrementLb >= 0]).toEqual([e.id, true, true, true, true]);
    }
  });

  it('are listed free five first, then Pro by number (R597)', () => {
    expect(PREMADE_ORDER).toEqual(PROGRAM_ORDER);
    expect(PREMADE_ORDER.slice(0, 5).map((id) => PROGRAMS.find((p) => p.id === id)!.free)).toEqual([true, true, true, true, true]);
    const pro = PREMADE_ORDER.slice(5).map((id) => PROGRAMS.find((p) => p.id === id)!);
    expect(pro.every((p) => !p.free)).toBe(true);
    expect(pro.map((p) => p.number)).toEqual([...pro.map((p) => p.number)].sort((a, b) => a - b));
  });
});

describe('the nine retired (§18.29, R598)', () => {
  it('are the nine seed version 8 wrote, in its order', () => {
    expect(RETIRED_PREMADES).toEqual(V8_ORDER);
    expect([...RETIRED_PREMADES].sort()).toEqual(V8_ROUTINES.map((r) => r.id).sort());
  });

  it('keep their ids to themselves: no program reuses one, even where the name continues', () => {
    expect(SEED_ROUTINES.filter((r) => RETIRED_PREMADES.includes(r.id) || !r.id.startsWith('program-'))).toEqual([]);
    const oldDays = new Set(V8_ROUTINES.flatMap((r) => r.days.map((d) => `${r.id}:${d.slug}`)));
    expect(SEED_ROUTINES.flatMap((r) => r.days.map((d) => `${r.id}:${d.slug}`)).filter((id) => oldDays.has(id))).toEqual([]);
  });
});
