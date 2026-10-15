import type { ProgramSlot } from '../seed/programTypes';
import {
  documentVolume,
  groupsOutsideBand,
  MAJOR_GROUPS,
  WEEKLY_SETS_BAND,
  weeklyFrequency,
  weeklyFrequencyByGroup,
  weeklySetsByGroup,
  weeklySetsByMuscle,
  weeklySetsForBand,
} from './programVolume';
import type { Muscle } from './types';

const MUSCLES: Record<string, { primary: Muscle[]; secondary: Muscle[] }> = {
  bench: { primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  ohp: { primary: ['front_delts'], secondary: ['side_delts', 'triceps'] },
  raise: { primary: ['side_delts'], secondary: [] },
  facePull: { primary: ['rear_delts'], secondary: ['upper_back'] },
  row: { primary: ['lats', 'upper_back'], secondary: ['biceps', 'rear_delts'] },
  squat: { primary: ['quads', 'glutes'], secondary: ['adductors'] },
  curl: { primary: ['biceps'], secondary: [] },
  frontRaise: { primary: ['front_delts'], secondary: [] },
  rdl: { primary: ['hamstrings', 'glutes'], secondary: [] },
  pushdown: { primary: ['triceps'], secondary: [] },
  incline: { primary: ['chest', 'front_delts'], secondary: ['triceps'] },
};
const muscles = (id: string) => MUSCLES[id];
const day = (...exercises: [string, number][]) => ({ exercises: exercises.map(([exerciseId, sets]) => ({ exerciseId, sets })) });

describe('weeklySetsByMuscle', () => {
  it('counts each set 1 for a primary muscle and ½ for a secondary, across every day of the week', () => {
    const sets = weeklySetsByMuscle([day(['bench', 4], ['row', 3]), day(['bench', 3], ['curl', 2])], muscles);
    expect(sets.chest).toBe(7);
    expect(sets.front_delts).toBe(3.5);
    expect(sets.triceps).toBe(3.5);
    expect(sets.lats).toBe(3);
    expect(sets.upper_back).toBe(3);
    expect(sets.biceps).toBe(1.5 + 2);
    expect(sets.rear_delts).toBe(1.5);
  });

  it('has every muscle, at 0 when the week never trains it', () => {
    const sets = weeklySetsByMuscle([day(['curl', 3])], muscles);
    expect(Object.keys(sets)).toHaveLength(18);
    expect(sets.calves).toBe(0);
    expect(sets.hamstrings).toBe(0);
    expect(weeklySetsByMuscle([], muscles).chest).toBe(0);
  });
});

describe('weeklyFrequency', () => {
  it('counts the days that train a muscle as primary, once a day however many exercises do', () => {
    const frequency = weeklyFrequency([day(['bench', 4], ['bench', 2]), day(['ohp', 3]), day(['bench', 3], ['curl', 2])], muscles);
    expect(frequency.chest).toBe(2);
    expect(frequency.front_delts).toBe(1);
    expect(frequency.biceps).toBe(1);
  });

  it('does not count a day that trains the muscle only as secondary', () => {
    const frequency = weeklyFrequency([day(['bench', 4]), day(['row', 3])], muscles);
    expect(frequency.triceps).toBe(0);
    expect(frequency.biceps).toBe(0);
    expect(frequency.calves).toBe(0);
  });
});

describe('major muscle groups', () => {
  it('checks the eight major groups, shoulders as all three delts and back as lats with upper back', () => {
    expect(MAJOR_GROUPS).toEqual({
      chest: ['chest'],
      back: ['lats', 'upper_back'],
      shoulders: ['front_delts', 'side_delts', 'rear_delts'],
      biceps: ['biceps'],
      triceps: ['triceps'],
      quads: ['quads'],
      hamstrings: ['hamstrings'],
      glutes: ['glutes'],
    });
  });

  it('counts a set once per group: 1 when it trains the group as primary, else ½ when as secondary', () => {
    const sets = weeklySetsByGroup([day(['ohp', 3], ['raise', 3], ['facePull', 2]), day(['row', 4], ['bench', 4])], muscles);
    // Overhead press is front delts primary and side delts secondary: 1 shoulder set each, not 1½.
    // Rows: lats and upper back both primary count 1, and their rear delts ½; bench adds ½ for its front delts.
    expect(sets.shoulders).toBe(3 + 3 + 2 + 4 * 0.5 + 4 * 0.5);
    expect(sets.back).toBe(4 + 2 * 0.5);
    expect(sets.chest).toBe(4);
    expect(sets.triceps).toBe(3 * 0.5 + 4 * 0.5);
    expect(sets.quads).toBe(0);
  });

  it('counts the days that train any of a group as primary', () => {
    const frequency = weeklyFrequencyByGroup([day(['ohp', 3]), day(['raise', 3]), day(['row', 3]), day(['facePull', 2], ['squat', 3])], muscles);
    expect(frequency.shoulders).toBe(3);
    expect(frequency.back).toBe(1);
    expect(frequency.quads).toBe(1);
    expect(frequency.glutes).toBe(1);
    expect(frequency.biceps).toBe(0);
  });
});

describe('the band the programs are held to (R93)', () => {
  it('reads "about 10 to 20 hard sets a week" as 8 to 24 per major group', () => {
    expect(WEEKLY_SETS_BAND).toEqual({ min: 8, max: 24 });
  });

  it('checks every group but shoulders by its sets, against both ends', () => {
    const days = [day(['bench', 4], ['row', 4], ['squat', 4]), day(['bench', 4], ['curl', 3])];
    const band = weeklySetsForBand(days, muscles);
    const sets = weeklySetsByGroup(days, muscles);
    for (const group of ['chest', 'back', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes'] as const) {
      expect(band[group]).toEqual({ floor: sets[group], cap: sets[group] });
    }
  });

  it('caps shoulders on side and rear delts only, and floors them on side + rear + half the front', () => {
    const band = weeklySetsForBand([day(['ohp', 4], ['raise', 3], ['facePull', 3]), day(['bench', 4])], muscles);
    // Side: 3 raises + ½ × 4 presses = 5. Rear: 3 face pulls. Front: 4 presses + ½ × 4 bench = 6.
    expect(band.shoulders).toEqual({ floor: 5 + 3 + 6 / 2, cap: 5 + 3 });
  });

  it('never caps front delts: any amount of pressing stays inside the band', () => {
    const band = weeklySetsForBand([day(['frontRaise', 20], ['incline', 20]), day(['frontRaise', 20])], muscles);
    expect(band.shoulders).toEqual({ floor: 30, cap: 0 });
    expect(groupsOutsideBand([day(['frontRaise', 20], ['incline', 20]), day(['frontRaise', 20])], muscles)).not.toContain('shoulders');
  });

  it('names the groups under 8 or over 24 sets', () => {
    const days = [day(['bench', 5], ['squat', 5], ['rdl', 5], ['raise', 5]), day(['bench', 5], ['squat', 5], ['rdl', 5], ['raise', 4], ['pushdown', 4])];
    // Chest, quads and hamstrings 10, triceps 4 + ½ × 10 = 9 and glutes 20 pass; shoulders cap 9, floor 9 + ½ × 5 = 11.5.
    // Back and biceps get nothing.
    expect(groupsOutsideBand(days, muscles)).toEqual(['back', 'biceps']);
    const tooMuch = [day(['squat', 5], ['rdl', 5]), day(['squat', 5], ['rdl', 5]), day(['squat', 5])];
    expect(groupsOutsideBand(tooMuch, muscles)).toContain('glutes');
    expect(weeklySetsByGroup(tooMuch, muscles).glutes).toBe(25);
  });
});

describe("documentVolume (R629, the documents' check)", () => {
  // Slots carry the catalog's own credits ("front delts"), as the twenty programs do.
  const slot = (sets: number, primary: string[], secondary: string[], countsTowardVolume = true) =>
    ({ sets, credits: [{ primary, secondary }], creditPerSet: 1, countsTowardVolume }) as unknown as ProgramSlot;
  const pday = (...slots: ProgramSlot[]) => ({ slug: 'd', name: 'D', slots });

  it('counts a set once per group, 1 for a primary, else ½, times days a week over the days in the rotation', () => {
    // A/B run 3 times a week: each day counts 1.5 times.
    const v = documentVolume({
      daysPerWeek: 3,
      days: [
        pday(slot(3, ['chest'], ['front delts', 'triceps']), slot(3, ['lats', 'upper back'], ['biceps', 'rear delts', 'lower back'])),
        pday(slot(3, ['quads', 'glutes'], ['adductors', 'lower back'])),
      ],
    });
    expect(v.groups.Chest).toEqual({ hardSets: 4.5, daysPerWeek: 1.5 });
    // Lats and upper back are both Back, and a row's set counts once for the group.
    expect(v.groups.Back).toEqual({ hardSets: 4.5, daysPerWeek: 1.5 });
    expect(v.groups.Triceps).toEqual({ hardSets: 2.25, daysPerWeek: 1.5 });
    expect(v.groups.Biceps).toEqual({ hardSets: 2.25, daysPerWeek: 1.5 });
    expect(v.groups.Quads).toEqual({ hardSets: 4.5, daysPerWeek: 1.5 });
    expect(v.groups.Hamstrings).toEqual({ hardSets: 0, daysPerWeek: 0 });
    expect(v.groups.Calves).toEqual({ hardSets: 0, daysPerWeek: 0 });
    expect(v.groups.Abs).toEqual({ hardSets: 0, daysPerWeek: 0 });
  });

  it('counts a day for a group that gets only secondary credit (unlike R87)', () => {
    const v = documentVolume({ daysPerWeek: 2, days: [pday(slot(4, ['hamstrings'], ['calves'])), pday(slot(3, ['chest'], []))] });
    expect(v.groups.Calves).toEqual({ hardSets: 2, daysPerWeek: 1 });
    expect(v.groups.Hamstrings).toEqual({ hardSets: 4, daysPerWeek: 1 });
  });

  it('gives shoulders as side + rear delts, and the three delts on their own', () => {
    const v = documentVolume({
      daysPerWeek: 1,
      days: [pday(slot(3, ['side delts'], ['traps']), slot(2, ['rear delts'], ['upper back']), slot(4, ['front delts'], ['side delts', 'triceps']))],
    });
    expect(v.delts).toEqual({ side: 3 + 2, rear: 2, front: 4 });
    expect(v.groups.Shoulders).toEqual({ hardSets: 5 + 2, daysPerWeek: 1 });
  });

  it('counts front delts nowhere in shoulders', () => {
    const v = documentVolume({ daysPerWeek: 1, days: [pday(slot(4, ['front delts'], ['triceps']))] });
    expect(v.groups.Shoulders).toEqual({ hardSets: 0, daysPerWeek: 0 });
    expect(v.delts.front).toBe(4);
  });

  it('counts each metcon element by its credit, 1 set per 5 work minutes', () => {
    // AMRAP 15: pull-up, push-up, air squat, then a run that credits nothing. 15 / 5 = 3 sets per element.
    const metcon = {
      sets: 1,
      creditPerSet: 3,
      countsTowardVolume: true,
      credits: [
        { primary: ['lats'], secondary: ['biceps', 'upper back'] },
        { primary: ['chest'], secondary: ['front delts', 'triceps'] },
        { primary: ['quads', 'glutes'], secondary: [] },
        { primary: [], secondary: [] },
      ],
    } as unknown as ProgramSlot;
    const v = documentVolume({ daysPerWeek: 1, days: [pday(metcon)] });
    expect(v.groups.Back).toEqual({ hardSets: 3, daysPerWeek: 1 });
    expect(v.groups.Chest.hardSets).toBe(3);
    expect(v.groups.Biceps.hardSets).toBe(1.5);
    expect(v.groups.Triceps.hardSets).toBe(1.5);
    expect(v.groups.Glutes.hardSets).toBe(3);
    expect(v.delts.front).toBe(1.5);
  });

  it('leaves out what the documents do not count (technique sets, runs, skill practice)', () => {
    const v = documentVolume({ daysPerWeek: 1, days: [pday(slot(10, ['glutes', 'hamstrings', 'upper back'], ['quads'], false))] });
    expect(v.groups.Glutes).toEqual({ hardSets: 0, daysPerWeek: 0 });
    expect(v.groups.Quads).toEqual({ hardSets: 0, daysPerWeek: 0 });
  });
});
