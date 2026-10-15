/** @jest-environment node */
// The two-session raise (R623) on one lift run on two days (R625 as amended by ruling R-w1). No program among the
// twenty has a two-session lift on two days, so this suite runs Strongman Prep with its Thursday Atlas stone load also
// on Saturday.
import { asc, eq } from 'drizzle-orm';
import type { Program } from '../../seed/programTypes';
import { routineExercises, workoutExercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import { insertProgram, runSession } from '../testing/programFixture';
import type { Db } from '../types';
import { progressionGroup, setActiveProgram } from './programRunRepo';

jest.mock('../../seed/programs.generated', () => {
  const actual = jest.requireActual('../../seed/programs.generated');
  const id = 'program-strongman-prep';
  const withSaturdayStones = (p: Program): Program => {
    if (p.id !== id) return p;
    const stones = p.days.flatMap((d) => d.slots).find((s) => s.id === `${id}:thu-events-a:fedb-atlas-stones`)!;
    return {
      ...p,
      days: p.days.map((d) =>
        d.slug === 'sat-events-b'
          ? { ...d, slots: [...d.slots, { ...stones, id: `${id}:sat-events-b:fedb-atlas-stones`, isMain: false, warmUpLine: false }] }
          : d,
      ),
    };
  };
  const PROGRAMS = (actual.PROGRAMS as readonly Program[]).map(withSaturdayStones);
  return { ...actual, PROGRAMS, programById: (programId: string) => PROGRAMS.find((p) => p.id === programId) };
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 12, 9, 0).getTime();
const at = (n: number) => NOW + n * DAY;

const SM = 'program-strongman-prep';
const THU = `${SM}:thu-events-a`;
const SAT = `${SM}:sat-events-b`;
const STONES_THU = `${THU}:fedb-atlas-stones`;
const STONES_SAT = `${SAT}:fedb-atlas-stones`;

const slotRow = (db: Db, id: string) => db.select().from(routineExercises).where(eq(routineExercises.id, id)).get()!;
function blockOf(db: Db, workoutId: string, routineExerciseId: string) {
  return db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all()
    .find((b) => b.routineExerciseId === routineExerciseId)!;
}

describe('the two-session raise on one lift across two days (R623, R625 amended)', () => {
  it("every set on Thursday, then every set on Saturday: Saturday's is the second in a row and raises both days", () => {
    const db = seededDb();
    insertProgram(db, SM);
    setActiveProgram(db, SM, NOW);
    expect(progressionGroup(db, STONES_THU).sort()).toEqual([STONES_THU, STONES_SAT].sort());

    const thu = runSession(db, THU, at(1), { [STONES_THU]: { weight: 200, reps: [1, 1, 1, 1, 1] } });
    expect(blockOf(db, thu, STONES_THU)).toMatchObject({ outcome: 'held', nextWeight: 200 });
    expect(slotRow(db, STONES_SAT).nextWeight).toBe(200);

    const sat = runSession(db, SAT, at(3), { [STONES_SAT]: { weight: 200, reps: [1, 1, 1, 1, 1] } });
    expect(blockOf(db, sat, STONES_SAT)).toMatchObject({ outcome: 'raised', nextWeight: 210 });
    expect([slotRow(db, STONES_THU).nextWeight, slotRow(db, STONES_SAT).nextWeight]).toEqual([210, 210]);
  });
});
