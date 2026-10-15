/** @jest-environment node */
// R608: no PR marks for the run exercises. A 40-minute run is not a "longest hold".
import { eq, inArray } from 'drizzle-orm';
import { NO_PR_EXERCISES } from '../../domain/prs';
import { routines, sets, workoutExercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import { insertProgram, runSession } from '../testing/programFixture';
import { setActiveProgram } from './programRunRepo';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 12, 9, 0).getTime();

describe('no PR marks for runs (R608)', () => {
  it('names the seven run exercises', () => {
    expect([...NO_PR_EXERCISES].sort()).toEqual(
      ['bike-intervals', 'easy-run', 'incline-treadmill-walk', 'interval-run', 'long-run', 'rower-intervals', 'tempo-run'].sort(),
    );
  });

  it('a longer long run marks nothing', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-hybrid-athlete');
    setActiveProgram(db, program.id, NOW);
    const sat = program.days.findIndex((d) => d.name.startsWith('Sat'));
    const day = program.days[sat];
    const run = day.slots[0];
    for (let i = 0; i < 3; i++) {
      db.update(routines).set({ nextDayIndex: sat }).where(eq(routines.id, program.id)).run();
      runSession(db, `${program.id}:${day.slug}`, NOW + i * DAY, { [run.id]: { seconds: [3600 + i * 600] } });
    }
    const runRows = db.select({ id: workoutExercises.id }).from(workoutExercises).where(eq(workoutExercises.exerciseId, 'long-run')).all();
    const runSets = db.select().from(sets).where(inArray(sets.workoutExerciseId, runRows.map((r) => r.id))).all();
    expect(runSets.filter((s) => s.done)).toHaveLength(3);
    expect(runSets.every((s) => s.prFlags === 0)).toBe(true);
  });
});
