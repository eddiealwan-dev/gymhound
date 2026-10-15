/** @jest-environment node */
// What the session and the finish summary show of a program slot (spec §18.29, R606, R610–R626): the rule's words read
// from the slot and its finished history, the warm-up line, the slot's note, Change rung in a workout and the finish
// lines. The words themselves are tested in ruleLine.test.ts.
import { asc, eq } from 'drizzle-orm';
import { PROGRAMS } from '../../seed/programs.generated';
import { exercises, routineExercises, sets, workoutExercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import { fakeSessions, insertProgram, runSession } from '../testing/programFixture';
import type { LoggingType } from '../../domain/types';
import type { Db } from '../types';
import { changeRungToday, programPageOf, showsWarmUp } from './programViewRepo';
import { changeRung, setActiveProgram, startEarlyDeload } from './programRunRepo';
import { getActiveWorkoutView, getFinishSummary } from './workoutViewsRepo';
import { finishWorkout, startWorkoutFromDay, tickSet } from './workoutsRepo';
import { programRuleSentence } from '../../domain/ruleLine';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 12, 9, 0).getTime();
const at = (n: number) => NOW + n * DAY;

const BF = 'program-barbell-foundations';
const BF_A = `${BF}:a`;
const SQUAT_A = `${BF_A}:barbell-back-squat`;
const CALI = 'program-calisthenics-foundations';
const CALI_A = `${CALI}:a`;
const PULL_LADDER = `${CALI_A}:fedb-scapular-pull-up`;

const viewOf = (db: Db) => getActiveWorkoutView(db)!;
const blockIn = (db: Db, routineExerciseId: string) => {
  const view = viewOf(db);
  const we = db.select().from(workoutExercises).where(eq(workoutExercises.routineExerciseId, routineExerciseId)).all();
  return view.exercises.find((e) => we.some((w) => w.id === e.id))!;
};

describe('the session view of a program slot', () => {
  it('Barbell Foundations A, week 1: the load rule, the warm-up line under the first slot only, and the week', () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);
    startWorkoutFromDay(db, BF_A, at(1));
    const view = viewOf(db);
    expect(view.program).toEqual({ name: 'Barbell Foundations', week: 1, weeks: 12, weekLine: null, done: false });
    const [first, second] = view.exercises;
    expect(first.program).toMatchObject({ warmUp: true, note: 'Beginner squat: 5 lb per session, not 10' });
    expect(first.program!.rule).toMatchObject({ kind: 'load', halved: false, missesBefore: 0, missesToReset: 3, week: 1 });
    expect(second.program?.warmUp).toBe(false);
  });

  it('after a miss: the halved increment and the miss so far', () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);
    runSession(db, BF_A, at(1), { [SQUAT_A]: { weight: 135, reps: [5, 5, 4] } });
    startWorkoutFromDay(db, BF_A, at(2));
    expect(blockIn(db, SQUAT_A).program!.rule).toMatchObject({ halved: true, missesBefore: 1 });
  });

  it('a deload week says so at the top and in each lifting slot', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-upper-lower-powerbuilding');
    setActiveProgram(db, program.id, NOW);
    fakeSessions(db, program.id, 9 * program.daysPerWeek, NOW + HOUR);
    startWorkoutFromDay(db, `${program.id}:${program.days[0].slug}`, at(30));
    const view = viewOf(db);
    expect(view.program).toMatchObject({ week: 10, weekLine: 'Deload week: half the sets, same weight. Nothing goes up or counts as a miss.' });
    expect(view.exercises[0].program!.rule.weekInfo).toMatchObject({ kind: 'deload', holds: true });
  });

  it('a ladder names its rungs from the library', () => {
    const db = seededDb();
    insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    startWorkoutFromDay(db, CALI_A, at(1));
    const rule = blockIn(db, PULL_LADDER).program!.rule;
    expect(rule.rung).toBe(0);
    expect(rule.rungs!.map((r) => r.name)).toEqual([
      'Scapular pull-up',
      'Arch hang',
      'Negative pull-up',
      'Band assisted pull-up',
      'Pull-up',
      'Weighted pull-up',
    ]);
    expect(rule.rungs![5]).toMatchObject({ weighted: true });
    expect(blockIn(db, PULL_LADDER).program!.note).toBe('Pull-up ladder. Start rung: hardest you can do for 3×5 (Change rung lists them)');
  });

  it('your own routine has no program parts (R628)', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, 'premade-ppl-6:push-a', at(1));
    expect(id).toBeTruthy();
    const view = viewOf(db);
    expect(view.program ?? null).toBeNull();
    expect(view.exercises.every((e) => (e.program ?? null) === null)).toBe(true);
  });
});

describe('a weighted top rung counts its misses as the engine does (R613, R618)', () => {
  it("today's read can warn before a reset", () => {
    const db = seededDb();
    insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    changeRung(db, PULL_LADDER, 5);
    runSession(db, CALI_A, at(1), { [PULL_LADDER]: { weight: 10, reps: [4, 4, 4] } });
    startWorkoutFromDay(db, CALI_A, at(2));
    expect(blockIn(db, PULL_LADDER).program!.rule).toMatchObject({ rung: 5, missesBefore: 1 });
  });
});

describe('the session knows the block is done after an early deload (R627, R616)', () => {
  it('done once the deload sessions are finished, as Up next says', () => {
    const db = seededDb();
    const DUP = 'program-advanced-upper-lower-dup';
    const program = insertProgram(db, DUP);
    setActiveProgram(db, DUP, NOW);
    startEarlyDeload(db, DUP, NOW + HOUR);
    fakeSessions(db, DUP, program.daysPerWeek, NOW + 2 * HOUR);
    startWorkoutFromDay(db, `${DUP}:${program.days[0].slug}`, at(5));
    expect(viewOf(db).program).toMatchObject({ week: 2, done: true });
  });

  it('not done in an ordinary week', () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);
    startWorkoutFromDay(db, BF_A, at(1));
    expect(viewOf(db).program).toMatchObject({ done: false });
  });
});

describe('the warm-up line (R626, ruling R-t2b)', () => {
  const firstSlots = PROGRAMS.flatMap((p) => p.days.map((d) => ({ program: p, slot: d.slots[0] })));
  const shown = (programId: string, dayIndex: number, loggingType: LoggingType = 'weighted') => {
    const program = PROGRAMS.find((p) => p.id === programId)!;
    return showsWarmUp(program, program.days[dayIndex].slots[0], loggingType);
  };

  it('shows on lifting days only: not a run, a metcon, a skill hold or a Mobility move', () => {
    expect(shown(BF, 0)).toBe(true);
    expect(shown('program-strongman-prep', 0)).toBe(true);
    expect(shown('program-hybrid-athlete', 2, 'timed')).toBe(false);
    expect(shown('program-crossfit-performance', 3)).toBe(false);
    expect(shown('program-mobility-for-lifters', 0)).toBe(false);
    expect(shown('program-advanced-calisthenics', 0, 'timed')).toBe(false);
    expect(firstSlots.filter(({ program, slot }) => showsWarmUp(program, slot, 'weighted')).length).toBeGreaterThan(50);
  });

  it('never shows on a bodyweight or calisthenics day: its percentages need a working weight (R645)', () => {
    const bodyweight = (programId: string, dayIndex: number) => shown(programId, dayIndex, 'bodyweight_plus');
    expect(bodyweight(CALI, 0)).toBe(false);
    expect(bodyweight(CALI, 1)).toBe(false);
    expect(bodyweight('program-advanced-calisthenics', 1)).toBe(false);
    expect(bodyweight('program-crossfit-performance', 1)).toBe(false);
    expect(shown('program-kettlebell-strength-conditioning', 1)).toBe(true);
  });

  it("never shows on a day that opens with a carry or a loaded hold: its percentages are of a bar's working weight (ruling R-w2b)", () => {
    // #19's Thu Events A (yoke) and Sat Events B (farmer's carry).
    expect(shown('program-strongman-prep', 2, 'weighted_distance')).toBe(false);
    expect(shown('program-strongman-prep', 3, 'weighted_distance')).toBe(false);
    expect(shown('program-strongman-prep', 2, 'weighted_time')).toBe(false);
    const strongman = PROGRAMS.find((p) => p.id === 'program-strongman-prep')!;
    expect(strongman.days.map((d) => showsWarmUp(strongman, d.slots[0], d.slots[0].targetUnit === 'feet' ? 'weighted_distance' : 'weighted'))).toEqual([true, true, false, false]);
  });

  it('never shows under a slot that is not the first of its day', () => {
    for (const p of PROGRAMS) for (const d of p.days) for (const s of d.slots.slice(1)) expect(showsWarmUp(p, s, 'weighted')).toBe(false);
  });
});

describe('what the session blocks read of a slot (Task 7b, R639, R-t7b2)', () => {
  const day = (db: Db, program: string, slug: string) => {
    insertProgram(db, program);
    setActiveProgram(db, program, NOW);
    startWorkoutFromDay(db, `${program}:${slug}`, at(1));
    return viewOf(db).exercises;
  };

  it("a metcon carries its structured rule and the program's name for it, and rests none", () => {
    const db = seededDb();
    const [, , , metcon, raise] = day(db, 'program-crossfit-foundations', 'a');
    expect(metcon.program).toMatchObject({
      metcon: { format: 'AMRAP', workMinutes: 10, elements: ['Goblet squat (metcon)', 'Push-up', 'Run'], capMinutes: null },
      catalogName: 'Metcon A · AMRAP 10 min: 10 goblet squats, 10 push-ups (scaled), 200 m run',
      countsTowardVolume: true,
      restKind: 'none',
    });
    expect(raise.program).toMatchObject({ metcon: null, restKind: 'isolation' });
  });

  it('the first slot rests heavy, a barbell press too, and the technique slot does not count', () => {
    const db = seededDb();
    const [snatch, front, rdl, t2b] = day(db, 'program-crossfit-performance', 'wed-olympic-squat');
    expect(snatch.program).toMatchObject({ countsTowardVolume: false, restKind: 'heavy', note: 'EMOM 10: 2 reps every minute' });
    expect(front.program?.restKind).toBe('heavy');
    expect(rdl.program?.restKind).toBe('heavy');
    expect(t2b.program?.restKind).toBe('isolation');
  });

  it('events rest heavy, and runs none', () => {
    const db = seededDb();
    const events = day(db, 'program-strongman-prep', 'sat-events-b');
    expect(events.slice(0, 3).map((e) => e.program?.restKind)).toEqual(['heavy', 'heavy', 'heavy']);
    expect(events[3].program?.restKind).toBe('compound');
  });

  it('a run day rests none after a run, and the hold after it as isolation', () => {
    const db = seededDb();
    const [warm, tempo, plank] = day(db, 'program-hybrid-athlete', 'fri-tempo-run');
    expect([warm, tempo].map((e) => e.program?.restKind)).toEqual(['none', 'none']);
    expect(plank.program?.restKind).toBe('isolation');
  });
});

describe("the slot's note (R606)", () => {
  it("names the program's exercise first wherever it differs from the library's name", () => {
    const db = seededDb();
    const names = new Map(db.select({ id: exercises.id, name: exercises.name }).from(exercises).all().map((e) => [e.id, e.name]));
    // Spelling alone ("Band pull apart" and "Band pull-apart") is the same name.
    const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');
    const differs = PROGRAMS.flatMap((p) => p.days.flatMap((d) => d.slots)).filter((s) => !s.ladder && !same(names.get(s.exerciseId) ?? '', s.catalogName));
    expect(differs.length).toBeGreaterThan(10);
    const missing = differs.filter((s) => !s.note.startsWith(s.catalogName)).map((s) => `${s.id} | ${names.get(s.exerciseId)} | ${s.catalogName} | ${s.note}`);
    expect(missing).toEqual([]);
    const log = differs.find((s) => s.exerciseId === 'fedb-log-lift')!;
    expect(names.get('fedb-log-lift')).toBe('Log lift');
    expect(log.note.startsWith('Log clean and press')).toBe(true);
  });
});

describe('Change rung in a workout (R618)', () => {
  it("moves the slot and today's exercise to the rung, with its range, and clears its sets", () => {
    const db = seededDb();
    const program = insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    const ladder = program.days[0].slots.find((s) => s.id === PULL_LADDER)!.ladder!;
    startWorkoutFromDay(db, CALI_A, at(1));
    const block = blockIn(db, PULL_LADDER);
    tickSet(db, block.sets[0].id, { weight: null, reps: 5, durationS: null, distance: null }, 'lb', at(1), 'mi');

    changeRungToday(db, block.id, 4);
    const after = db.select().from(workoutExercises).where(eq(workoutExercises.id, block.id)).get()!;
    expect(after).toMatchObject({
      exerciseId: ladder[4].exerciseId,
      routineExerciseId: PULL_LADDER,
      ruleRung: 4,
      ruleKind: 'ladder',
      ruleRepMin: ladder[4].repMin,
      ruleRepMax: ladder[4].repMax,
      ruleSetCount: 3,
    });
    expect(db.select().from(routineExercises).where(eq(routineExercises.id, PULL_LADDER)).get()).toMatchObject({
      ladderRung: 4,
      exerciseId: ladder[4].exerciseId,
    });
    const left = db.select().from(sets).where(eq(sets.workoutExerciseId, block.id)).orderBy(asc(sets.position)).all();
    expect(left).toHaveLength(3);
    expect(left.every((s) => !s.done && s.reps === null)).toBe(true);
    expect(blockIn(db, PULL_LADDER).program!.rule.rung).toBe(4);
  });

  it('a weighted top rung takes its increment today', () => {
    const db = seededDb();
    insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    startWorkoutFromDay(db, CALI_A, at(1));
    changeRungToday(db, blockIn(db, PULL_LADDER).id, 5);
    expect(blockIn(db, PULL_LADDER).rule).toMatchObject({ increment: 5, incrementUnit: 'lb' });
  });

  it('refuses a slot that is not a ladder', () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);
    startWorkoutFromDay(db, BF_A, at(1));
    expect(() => changeRungToday(db, blockIn(db, SQUAT_A).id, 1)).toThrow();
  });
});

describe('the finish lines of a program workout (R613, R617, R618, R622)', () => {
  const linesOf = (db: Db, id: string) => getFinishSummary(db, id, 'lb').lines ?? [];

  it('a reset says why in the rule\'s words', () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);
    runSession(db, BF_A, at(1), { [SQUAT_A]: { weight: 135, reps: [5, 5, 4] } });
    runSession(db, BF_A, at(2), { [SQUAT_A]: { weight: 135, reps: [5, 4, 4] } });
    const w3 = runSession(db, BF_A, at(3), { [SQUAT_A]: { weight: 135, reps: [5, 5, 3] } });
    expect(linesOf(db, w3)).toContainEqual({
      workoutExerciseId: expect.any(String),
      text: 'Barbell back squat — next time 120 lb ↓',
      why: 'Missed the bottom of the range 3 times in a row, so next time drops 10% to 120 lb.',
    });
  });

  it('a ladder that moves up names the next rung', () => {
    const db = seededDb();
    insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    const w1 = runSession(db, CALI_A, at(1), { [PULL_LADDER]: { reps: [8, 8, 8] } });
    const line = linesOf(db, w1).find((l) => l.text.includes('rung 2 of 6'));
    expect(line).toMatchObject({ text: expect.stringMatching(/ — next time Arch hang, rung 2 of 6 ↑$/), why: null });
  });

  it('a holding week names the week after the weight', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-upper-lower-powerbuilding');
    setActiveProgram(db, program.id, NOW);
    fakeSessions(db, program.id, 9 * program.daysPerWeek, NOW + HOUR);
    const day = program.days[0];
    db.update(routineExercises).set({ nextWeight: 100, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, day.slots[0].id)).run();
    const id = runSession(db, `${program.id}:${day.slug}`, at(30), { [day.slots[0].id]: { weight: 100, reps: [5, 5] } });
    expect(linesOf(db, id)[0].text).toMatch(/ — holds at 100 lb · Deload week$/);
  });

  it('a metcon not yet beaten twice keeps its line, with no why (R622)', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-crossfit-foundations');
    setActiveProgram(db, program.id, NOW);
    const dayA = program.days[0];
    const metcon = dayA.slots.find((s) => s.ruleKind === 'metcon')!;
    const id = runSession(db, `${program.id}:${dayA.slug}`, at(1), { [metcon.id]: { reps: [5] } });
    // Its outcome and its rule, in the lift lines' style (design gate #6).
    expect(linesOf(db, id)).toContainEqual({ workoutExerciseId: expect.any(String), text: 'AMRAP 10 — 5 rounds. Beat it twice in a row to go heavier.', why: null });
  });

  it('a metcon beaten twice in a row says so (R622)', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-crossfit-foundations');
    setActiveProgram(db, program.id, NOW);
    const dayA = program.days[0];
    const metcon = dayA.slots.find((s) => s.ruleKind === 'metcon')!;
    const dayId = `${program.id}:${dayA.slug}`;
    // Day A comes round every third session; the other days run in between.
    const scores = [5, 6, 7];
    let last = '';
    scores.forEach((rounds, i) => {
      last = runSession(db, dayId, at(i * 3 + 1), { [metcon.id]: { reps: [rounds] } });
    });
    expect(linesOf(db, last)).toContainEqual({
      workoutExerciseId: expect.any(String),
      text: 'AMRAP 10 — 7 rounds.',
      why: 'You beat your score twice in a row. Go heavier or take the next scaling step.',
    });
  });
});

describe('the finish lines of the new blocks (design gate #6)', () => {
  const linesOf = (db: Db, id: string) => getFinishSummary(db, id, 'lb').lines ?? [];

  it('a For Time score says its time, with the load of its main move when logged', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-crossfit-performance');
    setActiveProgram(db, program.id, NOW);
    const tue = program.days.find((d) => d.name.startsWith('Tue'))!;
    const fran = tue.slots.find((s) => s.ruleKind === 'metcon')!;
    const id = runSession(db, `${program.id}:${tue.slug}`, at(1), { [fran.id]: { seconds: [13], weight: 95 } });
    expect(linesOf(db, id).map((l) => l.text)).toContain('21-15-9 for time — 0:13 at 95 lb. Beat it twice in a row to go heavier.');
  });

  it('an easy run says next week\'s time, and intervals next week\'s sets', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-hybrid-athlete');
    setActiveProgram(db, program.id, NOW);
    const tue = program.days.find((d) => d.name.startsWith('Tue'))!;
    const run = tue.slots.find((s) => s.exerciseId === 'easy-run')!;
    const tueId = runSession(db, `${program.id}:${tue.slug}`, at(1), { [run.id]: { seconds: [1500] } });
    expect(linesOf(db, tueId).map((l) => l.text)).toContain('Easy run — next time 27:00.');
    const wed = program.days.find((d) => d.name.startsWith('Wed'))!;
    const [warm, intervals, cool] = wed.slots;
    const wedId = runSession(db, `${program.id}:${wed.slug}`, at(2), { [warm.id]: { seconds: [600] }, [intervals.id]: { seconds: [180, 180, 180, 180, 180, 180] }, [cool.id]: { seconds: [600] } });
    const texts = linesOf(db, wedId).map((l) => l.text);
    expect(texts).toContain('Interval run — next time 7 × 3:00.');
    // The warm-up and cool-down jogs stay the same every week: nothing to say.
    expect(texts.some((t) => t.startsWith('Warm-up run') || t.startsWith('Cool-down run'))).toBe(false);
  });

  it("#20 week 3: the easy run's line and its finish line give the lighter week 4's time (R654)", () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-hybrid-athlete');
    setActiveProgram(db, program.id, NOW);
    fakeSessions(db, program.id, 2 * program.daysPerWeek, NOW + HOUR);
    const tue = program.days.find((d) => d.name.startsWith('Tue'))!;
    const run = tue.slots.find((s) => s.exerciseId === 'easy-run')!;
    const id = runSession(db, `${program.id}:${tue.slug}`, at(30), { [run.id]: { seconds: [1740] } }, false);
    const rule = blockIn(db, run.id).program!.rule;
    expect(rule.week).toBe(3);
    expect(rule.nextWeekInfo).toMatchObject({ kind: 'lighter', runShare: 0.6 });
    expect(
      programRuleSentence({ program: rule, rule: { setCount: 1, repMin: 1740, repMax: 1740, increment: 0, incrementUnit: 'lb' }, loggingType: 'timed', unit: 'lb', last: null }),
    ).toBe('Adds 2:00 a week, up to 40:00. Next week is lighter: 18:36.');
    finishWorkout(db, id, at(30) + HOUR);
    expect(linesOf(db, id).map((l) => l.text)).toContain('Easy run — next time 18:36.');
  });

  it('counts a score as a score, not a set', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-crossfit-foundations');
    setActiveProgram(db, program.id, NOW);
    const dayA = program.days[0];
    const [squat, , , metcon] = dayA.slots;
    const id = runSession(db, `${program.id}:${dayA.slug}`, at(1), { [squat.id]: { weight: 95, reps: [5, 5, 5] }, [metcon.id]: { reps: [5] } });
    expect(getFinishSummary(db, id, 'lb')).toMatchObject({ setCount: 4, scoreCount: 1 });
  });
});

describe("a program day's rows on its page and Up next (design gate #19, #20)", () => {
  it("names #20's easy runs either side of the intervals by what they are", () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-hybrid-athlete');
    setActiveProgram(db, program.id, NOW);
    const wed = program.days.find((d) => d.name.includes('Intervals'))!;
    const page = programPageOf(db, program.id)!;
    expect(wed.slots.map((s) => page.slots[s.id].scheme.name ?? null)).toEqual(['Warm-up run', null, 'Cool-down run']);
  });

  it("gives a For Time metcon its cap, for the scheme column", () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-crossfit-performance');
    setActiveProgram(db, program.id, NOW);
    const fran = program.days.flatMap((d) => d.slots).find((s) => s.exerciseId === 'metcon-21-15-9-thruster-pullup')!;
    expect(programPageOf(db, program.id)!.slots[fran.id].scheme.schemeExtra).toEqual({ metcon: { format: 'For Time', workMinutes: 6, capMinutes: 8 } });
  });
});

describe('what a slot rule knows of its block (design gate #4, #5)', () => {
  it("knows an EMOM technique slot, and calls a sled's set a push", () => {
    const db = seededDb();
    const perf = insertProgram(db, 'program-crossfit-performance');
    setActiveProgram(db, perf.id, NOW);
    const wed = perf.days.find((d) => d.name.startsWith('Wed'))!;
    startWorkoutFromDay(db, `${perf.id}:${wed.slug}`, at(1));
    const [snatch, squat] = viewOf(db).exercises;
    expect(snatch.program!.rule.emom).toBe(true);
    expect(squat.program!.rule.emom).toBeFalsy();
  });

  it('calls a carry a carry and a sled push a push', () => {
    const db = seededDb();
    const sm = insertProgram(db, 'program-strongman-prep');
    setActiveProgram(db, sm.id, NOW);
    const sat = sm.days.find((d) => d.name.startsWith('Sat'))!;
    startWorkoutFromDay(db, `${sm.id}:${sat.slug}`, at(1));
    const [farmer, sandbag, sled] = viewOf(db).exercises;
    expect([farmer, sandbag, sled].map((e) => e.program!.rule.eventWord)).toEqual(['carry', 'carry', 'push']);
  });
});
