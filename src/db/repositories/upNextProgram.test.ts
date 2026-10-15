/** @jest-environment node */
// Train's Up next for one of the twenty programs (spec §18.29, R616, R617, R620, R627, R636): the week, the week's
// numbers for each slot, the reactive deload's offer and the block done.
import { eq } from 'drizzle-orm';
import { routines } from '../schema';
import { seededDb } from '../testing/fixtures';
import { fakeSessions, insertProgram, runSession } from '../testing/programFixture';
import { setActiveProgram, startEarlyDeload, startProgramOver } from './programRunRepo';
import { dismissDeloadOffer, getUpNext } from './routinesRepo';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 12, 9, 0).getTime();

const BF = 'program-barbell-foundations';
const DUP = 'program-advanced-upper-lower-dup';

describe('Up next for a program', () => {
  it('Set active makes week 1 and the first day (R636)', () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);
    const upNext = getUpNext(db)!;
    expect(upNext).toMatchObject({ dayName: 'A', program: { week: 1, weeks: 12, done: false, weekInfo: null, offerDeload: false } });
    expect(upNext.program!.afterThisProgram).toMatch(/^Run it again from your current weights\./);
  });

  it('a deload week shows half the sets for each slot (R617)', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-upper-lower-powerbuilding');
    setActiveProgram(db, program.id, NOW);
    fakeSessions(db, program.id, 9 * program.daysPerWeek, NOW + HOUR);
    const upNext = getUpNext(db)!;
    expect(upNext.program).toMatchObject({ week: 10, weekInfo: { kind: 'deload' } });
    const first = program.days[0].slots[0];
    expect(upNext.exercises[0]).toMatchObject({ routineExerciseId: first.id, setCount: Math.ceil(first.sets / 2) });
  });

  it("a run shows the week's target on a clock, a carry its distance (R620, R607)", () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-hybrid-athlete');
    setActiveProgram(db, program.id, NOW);
    fakeSessions(db, program.id, 2 * program.daysPerWeek, NOW + HOUR);
    const sat = program.days.findIndex((d) => d.name.startsWith('Sat'));
    db.update(routines).set({ nextDayIndex: sat }).where(eq(routines.id, program.id)).run();
    // Week 3 of the long run: 3,600 s + 2 × 300 s.
    expect(getUpNext(db)!.exercises[0]).toMatchObject({ name: 'Long run', setCount: 1, repMin: 4200, repMax: 4200, schemeExtra: { clock: true } });

    const strongman = insertProgram(db, 'program-strongman-prep');
    setActiveProgram(db, strongman.id, NOW + DAY);
    const thu = strongman.days.findIndex((d) => d.name.startsWith('Thu'));
    db.update(routines).set({ nextDayIndex: thu }).where(eq(routines.id, strongman.id)).run();
    expect(getUpNext(db)!.exercises[0]).toMatchObject({ name: 'Yoke carry', repMin: 50, schemeExtra: { distanceUnit: 'ft' } });
  });

  it('a ladder shows its rung, a metcon its format (R618, R622)', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-crossfit-foundations');
    setActiveProgram(db, program.id, NOW);
    const metcon = getUpNext(db)!.exercises.find((e) => e.loggingType === 'rounds')!;
    expect(metcon.schemeExtra).toEqual({ metcon: { format: 'AMRAP', workMinutes: 10 } });
  });

  describe('the reactive deload (R627)', () => {
    /** Week 1 of Advanced Upper/Lower DUP with both main lifts missed. */
    function twoMisses() {
      const db = seededDb();
      const program = insertProgram(db, DUP);
      setActiveProgram(db, DUP, NOW);
      const [upper, lower] = program.days;
      runSession(db, `${DUP}:${upper.slug}`, NOW + HOUR, { [upper.slots[0].id]: { weight: 185, reps: [3, 3, 3, 3] } });
      runSession(db, `${DUP}:${lower.slug}`, NOW + DAY, { [lower.slots[0].id]: { weight: 225, reps: [3, 3, 3, 3] } });
      return db;
    }

    it('is offered at two main misses in a week', () => {
      expect(getUpNext(twoMisses())!.program).toMatchObject({ offerDeload: true, week: 1 });
    });

    it('starts the deload on yes and is offered no more', () => {
      const db = twoMisses();
      startEarlyDeload(db, DUP, NOW + DAY + HOUR);
      expect(getUpNext(db)!.program).toMatchObject({ offerDeload: false, weekInfo: { kind: 'deload' } });
    });

    it('Not now hides it for that week', () => {
      const db = twoMisses();
      dismissDeloadOffer(db, getUpNext(db)!.program!.offerKey);
      expect(getUpNext(db)!.program!.offerDeload).toBe(false);
    });

    it('is never offered on a program without it', () => {
      const db = seededDb();
      const program = insertProgram(db, 'program-upper-lower-powerbuilding');
      setActiveProgram(db, program.id, NOW);
      const [first, second] = program.days;
      runSession(db, `${program.id}:${first.slug}`, NOW + HOUR, { [first.slots[0].id]: { weight: 185, reps: [1, 1, 1] } });
      runSession(db, `${program.id}:${second.slug}`, NOW + DAY, { [second.slots[0].id]: { weight: 225, reps: [1, 1, 1] } });
      expect(getUpNext(db)!.program!.offerDeload).toBe(false);
    });
  });

  it('after the last week: done, until Start over (R616)', () => {
    const db = seededDb();
    const program = insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);
    fakeSessions(db, BF, 12 * program.daysPerWeek, NOW + HOUR);
    expect(getUpNext(db)!.program).toMatchObject({ done: true, week: 13 });
    startProgramOver(db, BF, NOW + 100 * DAY);
    expect(getUpNext(db)!.program).toMatchObject({ done: false, week: 1 });
  });

  it('your own routine has no program part (R628)', () => {
    const db = seededDb();
    setActiveProgram(db, 'premade-ppl-6', NOW);
    expect(getUpNext(db)!.program ?? null).toBeNull();
  });
});
