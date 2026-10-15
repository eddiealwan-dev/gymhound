/** @jest-environment node */
import { PROGRAMS } from '../seed/programs.generated';
import {
  decodeRoutine,
  encodePremade,
  encodeRoutine,
  encodeRoutineV1,
  isShareablePremade,
  PROGRAM_NOT_HERE,
  RoutineNotShareable,
  signBytes,
} from './routineShare';
import type { SharedRoutine, SharedSlot } from './routineShare';

const LIBRARY = ['barbell-bench-press', 'barbell-back-squat', 'pull-up', 'plank'];

const slot = (exercise: SharedSlot['exercise'], over: Partial<SharedSlot> = {}): SharedSlot => ({
  exercise,
  setCount: 3,
  repMin: 8,
  repMax: 12,
  increment: 5,
  incrementUnit: 'lb',
  supersetWithNext: false,
  restSeconds: null,
  ...over,
});

/** Every field version 2 carries, and each of its short cuts: a repeated target, usual and unusual increments. */
const ROUTINE: SharedRoutine = {
  name: 'Gym à la maison 💪',
  customs: [
    { name: 'Landmine press', loggingType: 'weighted', equipment: 'barbell', primaryMuscles: ['front_delts'], secondaryMuscles: ['triceps', 'chest'] },
    { name: 'Wall sit', loggingType: 'timed', equipment: 'bodyweight', primaryMuscles: ['quads'], secondaryMuscles: [] },
  ],
  days: [
    {
      name: 'Push',
      slots: [
        slot({ library: 'barbell-bench-press' }, { supersetWithNext: true, restSeconds: 90 }),
        slot({ custom: 0 }),
        slot({ library: 'barbell-back-squat' }, { increment: 3.75, incrementUnit: 'kg', setCount: 5, repMin: 5, repMax: 5 }),
        slot({ library: 'barbell-back-squat' }, { increment: 3.75, incrementUnit: 'kg', setCount: 5, repMin: 5, repMax: 5 }),
      ],
    },
    {
      name: '',
      slots: [
        slot({ custom: 1 }, { increment: 0, repMin: 30, repMax: 60, restSeconds: 60 }),
        slot({ library: 'plank' }, { increment: 0, repMin: 30, repMax: 60 }),
        slot({ library: 'pull-up' }, { increment: 2.5, setCount: 10, repMin: 1, repMax: 3600 }),
      ],
    },
  ],
};

describe('routine codes, version 2 (§18.18, R472)', () => {
  it('carries every field through and back exactly', () => {
    const code = encodeRoutine(ROUTINE, LIBRARY);
    expect(code.startsWith('GH2.')).toBe(true);
    expect(decodeRoutine(code, LIBRARY)).toEqual({ ok: true, code, routine: ROUTINE, premadeId: null });
  });

  it('is under half the length of the same routine in version 1', () => {
    expect(encodeRoutine(ROUTINE, LIBRARY).length).toBeLessThan(encodeRoutineV1(ROUTINE, LIBRARY).length / 2);
  });

  it('reads a library exercise past the end of an older list as missing', () => {
    const code = encodeRoutine(ROUTINE, LIBRARY);
    const decoded = decodeRoutine(code, LIBRARY.slice(0, 2));
    expect(decoded.ok && decoded.routine?.days[1].slots.map((s) => s.exercise)).toEqual([{ custom: 1 }, { missing: 3 }, { missing: 2 }]);
  });

  it('refuses what it cannot carry, and drops a link off the end of a day', () => {
    expect(() => encodeRoutine({ ...ROUTINE, name: '  ' }, LIBRARY)).toThrow(RoutineNotShareable);
    const tooMany = { ...ROUTINE, days: [{ name: 'A', slots: [slot({ library: 'pull-up' }, { setCount: 11 })] }] };
    expect(() => encodeRoutine(tooMany, LIBRARY)).toThrow(RoutineNotShareable);
    const odd = { ...ROUTINE, days: [{ name: 'A', slots: [slot({ library: 'pull-up' }, { restSeconds: 7 })] }] };
    expect(() => encodeRoutine(odd, LIBRARY)).toThrow(RoutineNotShareable);
    const trailing = { ...ROUTINE, days: [{ name: 'A', slots: [slot({ library: 'pull-up' }, { supersetWithNext: true })] }] };
    const decoded = decodeRoutine(encodeRoutine(trailing, LIBRARY), LIBRARY);
    expect(decoded.ok && decoded.routine?.days[0].slots[0].supersetWithNext).toBe(false);
  });

  it("carries a program's carry by its library id with its distance range; a custom never has a program type (R607)", () => {
    const library = [...LIBRARY, 'yoke-carry'];
    const yoke = { name: 'Strongman', customs: [], days: [{ name: 'Events', slots: [slot({ library: 'yoke-carry' }, { setCount: 4, repMin: 50, repMax: 150, increment: 10 })] }] };
    const decoded = decodeRoutine(encodeRoutine(yoke, library), library);
    expect(decoded.ok && decoded.routine).toEqual(yoke);
    for (const loggingType of ['weighted_distance', 'rounds', 'for_time'] as const) {
      const custom = { ...ROUTINE, customs: [{ ...ROUTINE.customs[0], loggingType }] };
      expect(() => encodeRoutine(custom, LIBRARY)).toThrow(RoutineNotShareable);
    }
  });

  it('refuses bytes that are off, however well signed', () => {
    const good = encodeRoutine(ROUTINE, LIBRARY);
    const bytes = [...Buffer.from(good.split('.')[1], 'base64url')];
    // Cut short by a byte; a byte left over; a slot that repeats the one before when there is none.
    expect(decodeRoutine(signBytes(bytes.slice(0, -1), 2), LIBRARY).ok).toBe(false);
    expect(decodeRoutine(signBytes([...bytes, 0], 2), LIBRARY).ok).toBe(false);
    const repeatFirst = [1, 0, 1, 65, 0, 1, 1, 65, 1, 0, 8];
    expect(decodeRoutine(signBytes(repeatFirst, 2), LIBRARY)).toEqual({ ok: false, error: 'not_routine' });
  });
});

describe('program codes (R472, §18.29 R601)', () => {
  const bytesOf = (code: string) => [...Buffer.from(code.split('.')[1], 'base64url')];
  const NINE = [
    'premade-fullbody-3',
    'premade-5x5-3',
    'premade-dumbbell-3',
    'premade-mobility-3',
    'premade-ppl-6',
    'premade-upperlower-4',
    'premade-advancedfullbody-4',
    'premade-brosplit-5',
    'premade-calisthenics-3',
  ];

  it('share: program-barbell-foundations has place 9 and round-trips; an old place still reads; a missing retired id gives the message', () => {
    const code = encodePremade('program-barbell-foundations');
    expect(bytesOf(code).slice(0, 2)).toEqual([0, 9]);
    expect(code.length).toBeLessThanOrEqual(12);
    expect(decodeRoutine(code)).toEqual({ ok: true, code, routine: null, premadeId: 'program-barbell-foundations' });
    // The twenty follow the nine at places 9 to 28, by program number; the nine keep 0 to 8.
    PROGRAMS.forEach((p, i) => {
      expect([p.id, bytesOf(encodePremade(p.id))[1]]).toEqual([p.id, 9 + i]);
      const decoded = decodeRoutine(encodePremade(p.id));
      expect([p.id, decoded.ok && decoded.premadeId]).toEqual([p.id, p.id]);
    });
    NINE.forEach((id, place) => {
      expect([id, isShareablePremade(id), bytesOf(encodePremade(id))[1]]).toEqual([id, true, place]);
      const old = signBytes([0, place], 2);
      expect(decodeRoutine(old)).toEqual({ ok: true, code: old, routine: null, premadeId: id });
    });
    // A place past the twenty is a newer GymHound's program.
    expect(decodeRoutine(signBytes([0, 29], 2))).toEqual({ ok: false, error: 'newer_version' });
    // What Add from code says when the phone doesn't have the program a code names (a retired one, on a new install).
    expect(PROGRAM_NOT_HERE).toBe('This program is no longer in GymHound.');
  });
});
