import { LIBRARY_EXERCISES } from './library.generated';
import { CATALOG_NEW, NEW_ALIASES, RUNG_NEW } from './newExerciseData';
import {
  buildPrograms,
  BY_NAME,
  BY_NEW_ALIAS,
  CATALOG_TO_EXERCISE,
  CUSTOM_RULES,
  daySlug,
  DELOAD_EXEMPT,
  FREE_NUMBERS,
  LADDERS,
  NEW_BY_CATALOG,
  PICTURES,
  programLibrary,
  RING_LADDERS,
  SLOT_EXERCISE,
  slotIds,
  TOP_SET_AND_BACK_OFF,
  VOLUME_ONLY_NAMES,
  WEEK_PLANS,
  whyBullets,
} from './programMapping';
import type { Program, ProgramSlot } from './programTypes';

type JsonSlot = { exercise: string; type: string; increment_rule: { type: string; rule?: string; amount_lb?: number }; notes: string };
type JsonProgram = { id: string; number: number; level: string; days: { name: string; exercises: JsonSlot[] }[] };
type JsonCatalog = Record<string, { primary: string[]; secondary: string[]; type: string }>;
const JSON_SOURCE: { exercise_catalog: JsonCatalog; programs: JsonProgram[] } = require('../../scripts/vendor/programs/gymhound_programs.json');
const WHY: Record<string, string[]> = require('../../scripts/vendor/programs/why-bullets.json');

const LIBRARY = programLibrary(LIBRARY_EXERCISES, [...CATALOG_NEW, ...RUNG_NEW], NEW_ALIASES);
const IDS = new Set(LIBRARY.map((e) => e.id));
const { programs } = buildPrograms(JSON_SOURCE, LIBRARY, WHY);
const byNumber = (n: number): Program => programs.find((p) => p.number === n)!;
const allSlots = (p: Program): ProgramSlot[] => p.days.flatMap((d) => d.slots);
const slotNamed = (n: number, catalogName: string, day?: string): ProgramSlot =>
  byNumber(n)
    .days.filter((d) => day === undefined || d.name === day)
    .flatMap((d) => d.slots)
    .find((s) => s.catalogName === catalogName)!;
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const usedBy = (name: string) => JSON_SOURCE.programs.filter((p) => p.days.some((d) => d.exercises.some((e) => e.exercise === name))).map((p) => p.number);

describe('daySlug', () => {
  it('lower-cases a day name into a slug', () => {
    expect(daySlug('A · Grind')).toBe('a-grind');
    expect(daySlug('B · Swings & get-ups')).toBe('b-swings-get-ups');
    expect(daySlug('Tue · Upper strength + easy run')).toBe('tue-upper-strength-easy-run');
    expect(daySlug('Thu · Full body (light legs)')).toBe('thu-full-body-light-legs');
    expect(daySlug('Upper Power')).toBe('upper-power');
    expect(daySlug('Bench 2')).toBe('bench-2');
  });
});

describe('slotIds', () => {
  it('gives a second slot of one exercise on a day @2, a third @3 (R625)', () => {
    expect(slotIds('program-x', 'squat', ['barbell-back-squat', 'barbell-back-squat', 'plank', 'barbell-back-squat'])).toEqual([
      'program-x:squat:barbell-back-squat',
      'program-x:squat:barbell-back-squat@2',
      'program-x:squat:plank',
      'program-x:squat:barbell-back-squat@3',
    ]);
  });
});

describe('whyBullets', () => {
  it('returns the docx bullets when they join into the paragraph with single spaces', () => {
    expect(whyBullets('One [1]. Two.', ['One [1].', 'Two.'])).toEqual(['One [1].', 'Two.']);
  });

  it('throws when they do not join exactly', () => {
    expect(() => whyBullets('One [1]. Two.', ['One [1].', 'Two'])).toThrow();
    expect(() => whyBullets('One [1]. Two.', [])).toThrow();
  });
});

describe('the catalog on library ids (R602, Appendix A)', () => {
  const names = Object.keys(JSON_SOURCE.exercise_catalog);

  it('every catalog name resolves (exercise id, ladder or volume-only), and only one way', () => {
    for (const name of names) {
      const direct = CATALOG_TO_EXERCISE[name] !== undefined;
      const users = usedBy(name);
      const ladder = users.length > 0 && users.every((n) => LADDERS[`${n}:${name}`] !== undefined);
      expect([name, direct !== ladder]).toEqual([name, true]);
    }
  });

  it("splits the 158 as the spec counts them: 56 by name, 17 by a new alias, 6 top-set and back-off, 22 ladders, 11 volume-only, 46 new", () => {
    const ladderNames = names.filter((n) => JSON_SOURCE.exercise_catalog[n].type === 'ladder');
    expect(names).toHaveLength(158);
    expect(Object.keys(BY_NAME)).toHaveLength(56);
    expect(Object.keys(BY_NEW_ALIAS)).toHaveLength(17);
    expect(Object.keys(TOP_SET_AND_BACK_OFF)).toHaveLength(6);
    expect(ladderNames).toHaveLength(22);
    expect(Object.keys(RING_LADDERS)).toHaveLength(3);
    expect(VOLUME_ONLY_NAMES).toHaveLength(11);
    expect(Object.keys(NEW_BY_CATALOG)).toHaveLength(46);
    const all = [
      ...Object.keys(BY_NAME),
      ...Object.keys(BY_NEW_ALIAS),
      ...Object.keys(TOP_SET_AND_BACK_OFF),
      ...ladderNames,
      ...VOLUME_ONLY_NAMES,
      ...Object.keys(NEW_BY_CATALOG),
    ];
    expect(new Set(all).size).toBe(158);
    expect([...all].sort()).toEqual([...names].sort());
  });

  it('matches the 56 by the library name or an alias the library already had', () => {
    for (const [name, id] of Object.entries(BY_NAME)) {
      const e = LIBRARY_EXERCISES.find((x) => x.id === id);
      expect([name, e !== undefined && [e.name, ...e.aliases].some((n) => norm(n) === norm(name))]).toEqual([name, true]);
    }
  });

  it('matches the 17 by an alias the seed adds (R606)', () => {
    for (const [name, id] of Object.entries(BY_NEW_ALIAS)) {
      const added = (NEW_ALIASES[id] ?? []).map(norm);
      // "Log clean and press (speed)" shares the log's alias.
      expect([name, added.includes(norm(name.replace(' (speed)', '')))]).toEqual([name, true]);
    }
  });

  it('puts the 46 on the new exercises, and the top sets and back-offs on squat, bench press and deadlift', () => {
    const newIds = new Set(CATALOG_NEW.map((e) => e.id));
    for (const id of Object.values(NEW_BY_CATALOG)) expect(newIds.has(id)).toBe(true);
    expect(new Set(Object.values(TOP_SET_AND_BACK_OFF))).toEqual(new Set(['barbell-back-squat', 'barbell-bench-press', 'barbell-deadlift']));
    expect(NEW_BY_CATALOG['Sled push']).toBe('sled-push-distance');
    expect(NEW_BY_CATALOG['Armor Building Complex (2 cleans / 1 press / 3 front squats)']).toBe('armor-building-complex');
  });

  it('every mapped exercise, rung and picture is a library or new exercise id', () => {
    const ids = [
      ...Object.values(CATALOG_TO_EXERCISE).filter((v): v is string => typeof v === 'string'),
      ...Object.values(SLOT_EXERCISE),
      ...Object.values(LADDERS).flatMap((rungs) => rungs.map((r) => r.exerciseId)),
      ...Object.values(PICTURES).map((p) => p.exerciseId),
    ];
    expect(ids.filter((id) => !IDS.has(id))).toEqual([]);
  });

  it('logs the two exercises whose type differs by program as their own exercises (F2, F3)', () => {
    expect(CATALOG_TO_EXERCISE["Farmer's carry"]).toBe('fedb-farmers-walk');
    expect(SLOT_EXERCISE["19:Farmer's carry"]).toBe('farmers-carry-distance');
    expect(CATALOG_TO_EXERCISE['Toes-to-bar (scaled as needed)']).toEqual({ volumeOnly: true });
    expect(SLOT_EXERCISE['18:Toes-to-bar (scaled as needed)']).toBe('toes-to-bar');
    expect(slotNamed(8, "Farmer's carry").exerciseId).toBe('fedb-farmers-walk');
    expect(slotNamed(19, "Farmer's carry").exerciseId).toBe('farmers-carry-distance');
    expect(slotNamed(18, 'Toes-to-bar (scaled as needed)').exerciseId).toBe('toes-to-bar');
  });
});

describe('ladders (R618, Appendix B)', () => {
  const ids = (key: string) => LADDERS[key].map((r) => r.exerciseId);

  it('start the #3 pull-up ladder on the existing scapular pull-up (ruling R-t1a)', () => {
    expect(ids('3:Pull-up ladder')).toEqual(['fedb-scapular-pull-up', 'arch-hang', 'negative-pull-up', 'fedb-band-assisted-pull-up', 'pull-up', 'pull-up']);
    expect(LADDERS['3:Pull-up ladder'][1]).toEqual({ exerciseId: 'arch-hang', timed: true, repMin: 10, repMax: 30, weightedIncrementLb: null, note: null });
    expect(LADDERS['3:Pull-up ladder'][5].weightedIncrementLb).toBe(5);
    expect(LADDERS['3:Pull-up ladder'][4].weightedIncrementLb).toBeNull();
  });

  it("keep per-program rung lists where the documents differ (#17's CrossFit scaling, F8)", () => {
    expect(ids('17:Pull-up ladder')).toEqual(['ring-row', 'fedb-band-assisted-pull-up', 'negative-pull-up', 'pull-up', 'chest-to-bar-pull-up']);
    expect(ids('17:Push-up ladder')).toEqual(['fedb-incline-push-up', 'knee-push-up', 'push-up', 'deficit-push-up']);
    expect(ids('8:Push-up ladder (hypertrophy range)')).toEqual(['push-up', 'fedb-decline-push-up', 'deficit-push-up', 'archer-push-up']);
    expect(ids('3:Hinge ladder').slice(5, 7)).toEqual(['band-assisted-nordic-curl', 'eccentric-nordic-curl']);
    expect(ids('16:Nordic curl ladder').slice(0, 2)).toEqual(['eccentric-nordic-curl', 'band-assisted-nordic-curl']);
  });

  it('give weighted top rungs their increment: 5 lb upper, 10 lb lower', () => {
    const top = (key: string) => LADDERS[key][LADDERS[key].length - 1].weightedIncrementLb;
    expect(top('3:Squat ladder')).toBe(10);
    expect(top('3:Dip ladder')).toBe(5);
    expect(top('3:Hinge ladder')).toBe(10);
    expect(top('3:Row ladder')).toBe(5);
    expect(top('16:Pistol squat ladder')).toBe(5);
    expect(top('16:Nordic curl ladder')).toBe(10);
    expect(top('16:Front lever ladder')).toBeNull();
  });

  it('use the slot range, except a hold rung in a reps ladder (10–30 s) and the plank ladder rollouts (8–12)', () => {
    for (const p of programs) {
      for (const s of allSlots(p).filter((x) => x.ruleKind === 'ladder')) {
        expect(s.ladder).not.toBeNull();
        expect(s.exerciseId).toBe(s.ladder![0].exerciseId);
        for (const r of s.ladder!) {
          const range = [r.repMin, r.repMax];
          const ok =
            (range[0] === s.repMin && range[1] === s.repMax) ||
            (r.timed && s.targetUnit === 'reps' && range[0] === 10 && range[1] === 30) ||
            (s.catalogName === 'Plank ladder' && !r.timed && range[0] === 8 && range[1] === 12);
          expect([p.number, s.catalogName, r.exerciseId, ok]).toEqual([p.number, s.catalogName, r.exerciseId, true]);
        }
      }
    }
  });

  it('mark the timed rungs by the exercise logging type', () => {
    const timed = new Set([...LIBRARY_EXERCISES, ...CATALOG_NEW, ...RUNG_NEW].filter((e) => e.loggingType === 'timed').map((e) => e.id));
    for (const rungs of Object.values(LADDERS)) for (const r of rungs) expect([r.exerciseId, r.timed]).toEqual([r.exerciseId, timed.has(r.exerciseId)]);
  });

  it('note the box jump heights', () => {
    expect(LADDERS['17:Box jump ladder'].map((r) => [r.exerciseId, r.note])).toEqual([
      ['box-step-up', null],
      ['fedb-front-box-jump', '12–16 in'],
      ['fedb-front-box-jump', '20 in / 24 in, step down'],
    ]);
  });

  it('make the three ring ladders single exercises with a manual rule (F10)', () => {
    for (const [name, id] of Object.entries(RING_LADDERS)) {
      const s = slotNamed(16, name);
      expect(s.exerciseId).toBe(id);
      expect(s.ladder).toBeNull();
      expect(s.ruleKind).toBe('manual');
      expect(s.manualText).toBe('Top of the range on every set: lower the rings or raise your feet, and start again at the bottom.');
    }
  });
});

describe('the rule in each slot (R610, R611, Appendix C)', () => {
  it('reads load and next bell as load: 5 → 5 lb, 10 → 10 lb, next bell → 8 lb, halving as the JSON says', () => {
    expect(slotNamed(1, 'Barbell back squat')).toMatchObject({ ruleKind: 'load', incrementLb: 5, halveAfterFirstMiss: true });
    expect(slotNamed(1, 'Deadlift')).toMatchObject({ ruleKind: 'load', incrementLb: 10, halveAfterFirstMiss: true });
    expect(slotNamed(8, 'Kettlebell swing')).toMatchObject({ ruleKind: 'load', incrementLb: 8, halveAfterFirstMiss: false });
  });

  it('reads reps as reps only, seconds as a hold, next variation as a ladder', () => {
    expect(slotNamed(3, 'Band pull-apart')).toMatchObject({ ruleKind: 'reps_only', incrementLb: 0 });
    expect(slotNamed(9, 'Plank')).toMatchObject({ ruleKind: 'hold', incrementLb: 0 });
    expect(slotNamed(3, 'Plank ladder').ruleKind).toBe('ladder');
  });

  it('has exactly one rule for every custom slot, and no rule nobody uses', () => {
    const used = new Set<string>();
    for (const p of JSON_SOURCE.programs) {
      for (const d of p.days) {
        for (const e of d.exercises) {
          const specific = `${p.number}:${e.exercise}:${e.increment_rule.rule}`;
          const general = `${p.number}:${e.exercise}`;
          const key = CUSTOM_RULES[specific] ? specific : CUSTOM_RULES[general] ? general : null;
          if (e.increment_rule.type === 'custom') expect([general, key]).not.toEqual([general, null]);
          if (key) used.add(key);
        }
      }
    }
    expect(Object.keys(CUSTOM_RULES).filter((k) => !used.has(k))).toEqual([]);
  });

  it("gives Mobility's slots the JSON's words as a manual rule, holds for the timed stretches and reps only for leg swings", () => {
    const mobility = JSON_SOURCE.programs.find((p) => p.number === 14)!;
    const built = allSlots(byNumber(14));
    const json = mobility.days.flatMap((d) => d.exercises);
    expect(built).toHaveLength(18);
    built.forEach((s, i) => {
      const e = json[i];
      const expected = ['Couch stretch', 'Dead hang', 'Pigeon stretch'].includes(e.exercise)
        ? { ruleKind: 'hold', manualText: null }
        : e.exercise === 'Leg swings'
          ? { ruleKind: 'reps_only', manualText: null }
          : { ruleKind: 'manual', manualText: e.increment_rule.rule };
      expect([e.exercise, s.ruleKind, s.manualText]).toEqual([e.exercise, expected.ruleKind, expected.manualText]);
    });
  });

  it('reads the conditioning, strongman and metcon rules', () => {
    expect(slotNamed(8, "Farmer's carry")).toMatchObject({ ruleKind: 'load', incrementLb: 8, halveAfterFirstMiss: false });
    expect(slotNamed(8, 'Armor Building Complex (2 cleans / 1 press / 3 front squats)')).toMatchObject({
      ruleKind: 'add_set',
      addSet: { capSets: 8, then: { kind: 'load', lb: 8, backToSets: 5 } },
    });
    expect(slotNamed(9, 'Bike intervals').addSet).toEqual({ capSets: 8, then: { kind: 'seconds', step: 5 } });
    expect(slotNamed(9, 'Rower intervals').addSet).toEqual({ capSets: 10, then: { kind: 'seconds', step: 5 } });
    expect(slotNamed(9, 'Incline treadmill walk').weekly).toEqual({ kind: 'seconds', startS: 900, stepS: 60, capS: 1800 });
    expect(slotNamed(20, 'Easy run', 'Tue · Upper strength + easy run').weekly).toEqual({ kind: 'seconds', startS: 1500, stepS: 120, capS: 2400 });
    expect(slotNamed(20, 'Easy run', 'Wed · Intervals').weekly).toEqual({ kind: 'fixed' });
    expect(slotNamed(20, 'Interval run').weekly).toEqual({ kind: 'sets_then_seconds', startSets: 6, capSets: 8, seconds: 180, stepS: 15 });
    expect(slotNamed(20, 'Tempo run').weekly).toEqual({ kind: 'seconds', startS: 1200, stepS: 120, capS: 1800 });
    expect(slotNamed(20, 'Long run').weekly).toEqual({ kind: 'seconds', startS: 3600, stepS: 300, capS: 5400 });
    expect(slotNamed(19, 'Yoke carry')).toMatchObject({ ruleKind: 'load', incrementLb: 10, targetUnit: 'feet', repMin: 50, repMax: 50 });
    expect(slotNamed(19, "Farmer's carry")).toMatchObject({ ruleKind: 'load', incrementLb: 5 });
    expect(slotNamed(19, 'Sandbag carry')).toMatchObject({ ruleKind: 'load', incrementLb: 5 });
    expect(slotNamed(19, 'Sled push')).toMatchObject({ ruleKind: 'load', incrementLb: 25, targetUnit: 'yards' });
    expect(slotNamed(19, 'Atlas stone load')).toMatchObject({ ruleKind: 'load', incrementLb: 10, sessionsToRaise: 2 });
    expect(slotNamed(1, 'Barbell back squat').sessionsToRaise).toBe(1);
  });

  it('makes each metcon one score entry with its format, work minutes, elements and cap, and creditPerSet minutes / 5', () => {
    const b = slotNamed(17, 'Metcon B · 3 rounds for time: 200 m row, 10 thrusters, 10 ring rows (cap 12 min)');
    expect(b).toMatchObject({ exerciseId: 'metcon-3-rounds-row-thruster-ring-row', ruleKind: 'metcon', sets: 1, creditPerSet: 2 });
    expect(b.metcon).toEqual({ format: 'For Time', workMinutes: 10, elements: ['Row (erg)', 'Thruster', 'Ring row'], capMinutes: 12 });
    expect(b.credits).toEqual([
      { primary: [], secondary: [] },
      { primary: ['quads', 'front delts'], secondary: ['glutes', 'triceps'] },
      { primary: ['upper back', 'lats'], secondary: ['biceps', 'rear delts'] },
    ]);
    const engine = slotNamed(18, 'Metcon · AMRAP 25 min: 400 m run, 15 wall balls, 10 burpees');
    expect(engine.metcon).toEqual({ format: 'AMRAP', workMinutes: 25, elements: ['Run', 'Wall ball', 'Burpee'], capMinutes: null });
    expect(engine.creditPerSet).toBe(5);
    expect(engine.note.startsWith('Metcon · AMRAP 25 min: 400 m run, 15 wall balls, 10 burpees')).toBe(true);
  });

  it("uses 0.95 for Strength Peaking's top sets and 0.9 elsewhere (R613, F13)", () => {
    expect(slotNamed(12, 'Barbell back squat (top set)').resetMultiplier).toBe(0.95);
    expect(slotNamed(12, 'Deadlift (top set)').resetMultiplier).toBe(0.95);
    expect(slotNamed(12, 'Barbell back squat (back-off sets)').resetMultiplier).toBe(0.9);
    expect(slotNamed(13, allSlots(byNumber(13))[0].catalogName).resetMultiplier).toBe(0.9);
  });

  it('keeps technique sets and runs out of the volume check as the JSON says (R624)', () => {
    expect(slotNamed(18, 'Snatch')).toMatchObject({ ruleKind: 'load', countsTowardVolume: false });
    expect(slotNamed(19, 'Log clean and press (speed)')).toMatchObject({ exerciseId: 'fedb-log-lift', countsTowardVolume: false });
    expect(slotNamed(20, 'Long run').countsTowardVolume).toBe(false);
    expect(slotNamed(16, 'Freestanding handstand practice').countsTowardVolume).toBe(false);
  });

  it("keeps Lean Out's finishers at full length in the deload (R617)", () => {
    expect(DELOAD_EXEMPT).toEqual(['9:Bike intervals', '9:Incline treadmill walk', '9:Rower intervals']);
    const exempt = programs.flatMap((p) => allSlots(p).filter((s) => s.deloadExempt).map((s) => `${p.number}:${s.catalogName}`));
    expect(exempt).toEqual(['9:Bike intervals', '9:Incline treadmill walk', '9:Rower intervals', '9:Incline treadmill walk']);
  });
});

describe('buildPrograms', () => {
  it('builds 20 programs, numbers 1–20, ids program-{json id}', () => {
    expect(programs.map((p) => p.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(programs.map((p) => p.id)).toEqual(JSON_SOURCE.programs.map((p) => `program-${p.id}`));
    expect(programs.map((p) => p.jsonId)).toEqual(JSON_SOURCE.programs.map((p) => p.id));
  });

  it('sets free by the owner list (R597, F1), not the JSON access', () => {
    expect(FREE_NUMBERS).toEqual([1, 2, 4, 17, 14]);
    expect(programs.filter((p) => p.free).map((p) => p.number)).toEqual([1, 2, 4, 14, 17]);
  });

  it('reads misses to a reset from the level: 3 for Beginner, 2 otherwise; the reactive deload on #11 only', () => {
    for (const p of programs) {
      expect(p.missesToReset).toBe(p.level === 'Beginner' ? 3 : 2);
      expect(p.reactiveDeload).toBe(p.number === 11);
    }
  });

  it('marks each day first slot as the main lift with the warm-up line, and no other', () => {
    for (const p of programs) {
      for (const d of p.days) {
        d.slots.forEach((s, i) => {
          expect(s.isMain).toBe(i === 0);
          expect(s.warmUpLine).toBe(i === 0);
        });
      }
    }
  });

  it("shows the program's name for an exercise as the slot's note where it differs (R606), then the JSON's note", () => {
    const log = slotNamed(19, 'Log clean and press');
    expect(log.exerciseId).toBe('fedb-log-lift');
    expect(log.note).toBe('Log clean and press. Clean every rep in contest prep; axle or barbell if no log');
    expect(slotNamed(1, 'Barbell back squat').note).toBe('Beginner squat: 5 lb per session, not 10');
    expect(slotNamed(1, 'Barbell bench press').note).toBe('');
    expect(slotNamed(3, 'Band pull-apart').note).toBe('Rear delts; stronger band at 3×20');
  });

  it("logs Turkish get-up as reps with the note per side (F14)", () => {
    const s = slotNamed(8, 'Turkish get-up');
    expect(s.targetUnit).toBe('reps');
    expect(s.note).toContain('per side');
  });

  it('throws on a catalog name the mapping does not know', () => {
    const broken = JSON.parse(JSON.stringify(JSON_SOURCE));
    broken.programs[0].days[0].exercises[0].exercise = 'Zercher squat';
    broken.exercise_catalog['Zercher squat'] = { primary: ['quads'], secondary: [], type: 'weighted_or_bodyweight' };
    expect(() => buildPrograms(broken, LIBRARY, WHY)).toThrow(/Zercher squat/);
  });

  it('throws on an exercise id the library does not have', () => {
    expect(() => buildPrograms(JSON_SOURCE, LIBRARY.filter((e) => e.id !== 'barbell-row'), WHY)).toThrow(/barbell-row/);
  });

  it('takes the card pictures of ruling R-t5d: twenty distinct photos, with their frames and movements', () => {
    expect(Object.keys(PICTURES).map(Number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(Object.values(PICTURES).map((p) => p.exerciseId)).size).toBe(20);
    expect(PICTURES[9]).toEqual({ exerciseId: 'fedb-recumbent-bike', frame: 0, label: 'Recumbent bike' });
    expect(PICTURES[10]).toEqual({ exerciseId: 'glute-bridge', frame: 1, label: 'Glute bridge' });
    expect(PICTURES[13]).toEqual({ exerciseId: 'dumbbell-one-arm-row', frame: 1, label: 'One-arm dumbbell row' });
    expect(PICTURES[16]).toEqual({ exerciseId: 'fedb-kettlebell-pistol-squat', frame: 1, label: 'Pistol squat' });
    expect(PICTURES[19]).toEqual({ exerciseId: 'fedb-sled-push', frame: 1, label: 'Sled push' });
    expect(PICTURES[8]).toEqual({ exerciseId: 'fedb-one-arm-kettlebell-swings', frame: 0, label: 'Kettlebell swing' });
    expect([5, 7, 8, 9, 18].every((n) => PICTURES[n].frame === 0)).toBe(true);
  });

  it('copies the week plans and pictures from the mapping', () => {
    for (const p of programs) {
      expect(p.weekPlan).toEqual(WEEK_PLANS[p.number] ?? []);
      expect(p.picture).toEqual(PICTURES[p.number]);
    }
  });
});
