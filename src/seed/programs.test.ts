import { DOCUMENT_BAND_GROUPS, DOCUMENT_GROUPS, documentVolume, WEEKLY_SETS_BAND } from '../domain/programVolume';
import type { DocumentGroup } from '../domain/programVolume';
import { LIBRARY_EXERCISES } from './library.generated';
import { CATALOG_NEW, NEW_ALIASES, RUNG_NEW } from './newExerciseData';
import { buildPrograms, programLibrary } from './programMapping';
import { PROGRAM_ORDER, PROGRAM_SOURCES, PROGRAMS, programById } from './programs.generated';
import type { Program } from './programTypes';

// src/seed/programs.generated.ts is written only by scripts/build-programs.mjs (spec §18.29, R596); these checks fail
// if it goes stale or is edited, and hold the data to the documents.
type JsonProgram = {
  id: string;
  number: number;
  name: string;
  why_it_works: string;
  volume_checked: boolean;
  expected_weekly_volume: Record<string, { hard_sets: number; days_per_week: number }> & Record<string, unknown>;
  source_ids: number[];
};
const JSON_SOURCE: { programs: JsonProgram[]; sources: { id: number; citation: string; url: string }[] } = require('../../scripts/vendor/programs/gymhound_programs.json');
const WHY: Record<string, string[]> = require('../../scripts/vendor/programs/why-bullets.json');
const byNumber = (n: number): Program => PROGRAMS.find((p) => p.number === n)!;
const json = (n: number): JsonProgram => JSON_SOURCE.programs.find((p) => p.number === n)!;

describe('the generated programs', () => {
  it('are exactly what the mapping builds from the vendored JSON and the docx bullets', () => {
    const library = programLibrary(LIBRARY_EXERCISES, [...CATALOG_NEW, ...RUNG_NEW], NEW_ALIASES);
    const built = buildPrograms(JSON_SOURCE, library, WHY);
    expect(PROGRAMS).toEqual(built.programs);
    expect(PROGRAM_SOURCES).toEqual(built.sources);
  });

  it('buildPrograms: 20 programs, numbers 1–20, ids program-{json id}', () => {
    expect(PROGRAMS.map((p) => p.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(PROGRAMS.map((p) => p.id)).toEqual(JSON_SOURCE.programs.map((p) => `program-${p.id}`));
    expect(programById('program-hybrid-athlete')?.name).toBe('Hybrid Athlete');
    expect(programById('program-barbell-foundations')?.number).toBe(1);
  });

  it('every slot exerciseId and every rung is a library or new exercise id', () => {
    expect(PROGRAMS).toHaveLength(20);
    const ids = new Set([...LIBRARY_EXERCISES, ...CATALOG_NEW, ...RUNG_NEW].map((e) => e.id));
    const missing = PROGRAMS.flatMap((p) =>
      p.days.flatMap((d) => d.slots.flatMap((s) => [s.exerciseId, ...(s.ladder ?? []).map((r) => r.exerciseId)])),
    ).filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it('free is exactly Barbell Foundations, Dumbbell Full Body, Minimalist Two-Day, CrossFit Foundations, Mobility for Lifters', () => {
    expect(PROGRAMS.filter((p) => p.free).map((p) => p.name).sort()).toEqual(
      ['Barbell Foundations', 'Dumbbell Full Body', 'Minimalist Two-Day', 'CrossFit Foundations', 'Mobility for Lifters'].sort(),
    );
  });

  it("PROGRAM_ORDER lists the free five first in the owner's order", () => {
    const names = PROGRAM_ORDER.map((id) => programById(id)!.name);
    expect(names.slice(0, 5)).toEqual(['Barbell Foundations', 'Dumbbell Full Body', 'Minimalist Two-Day', 'CrossFit Foundations', 'Mobility for Lifters']);
    expect(PROGRAM_ORDER.slice(5).map((id) => programById(id)!.number)).toEqual([3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 18, 19, 20]);
    expect(new Set(PROGRAM_ORDER).size).toBe(20);
  });

  it('whyItWorks bullets join to the JSON paragraph for all 20', () => {
    expect(PROGRAMS).toHaveLength(20);
    for (const p of PROGRAMS) {
      expect(p.whyItWorks.length).toBeGreaterThanOrEqual(4);
      expect(p.whyItWorks.join(' ')).toBe(json(p.number).why_it_works);
    }
  });

  it("sourceIds all exist in PROGRAM_SOURCES; every [n] in the program's text is in its sourceIds", () => {
    expect(PROGRAM_SOURCES.map((s) => s.id)).toEqual(Array.from({ length: 88 }, (_, i) => i + 1));
    expect(PROGRAM_SOURCES).toEqual(JSON_SOURCE.sources);
    const known = new Set(PROGRAM_SOURCES.map((s) => s.id));
    for (const p of PROGRAMS) {
      expect(p.sourceIds).toEqual(json(p.number).source_ids);
      expect(p.sourceIds.filter((id) => !known.has(id))).toEqual([]);
      const text = [
        p.goal,
        p.equipment,
        p.schedule,
        p.specialWeeksText,
        p.lineage,
        ...p.whyItWorks,
        p.progressionNotes,
        p.afterThisProgram,
        ...p.days.flatMap((d) => d.slots.map((s) => s.note)),
      ].join(' ');
      const cited = [...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      expect([p.number, cited.filter((n) => !p.sourceIds.includes(n))]).toEqual([p.number, []]);
    }
  });

  it('slot ids are unique; #12 squat top set and back-off are barbell-back-squat and barbell-back-squat@2; #20 Wed easy runs are easy-run and easy-run@2', () => {
    const ids = PROGRAMS.flatMap((p) => p.days.flatMap((d) => d.slots.map((s) => s.id)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(437);
    const squat = byNumber(12).days.find((d) => d.name === 'Squat')!;
    expect(squat.slug).toBe('squat');
    expect(squat.slots.slice(0, 2).map((s) => [s.id, s.exerciseId])).toEqual([
      ['program-strength-peaking-block:squat:barbell-back-squat', 'barbell-back-squat'],
      ['program-strength-peaking-block:squat:barbell-back-squat@2', 'barbell-back-squat'],
    ]);
    const wed = byNumber(20).days.find((d) => d.name === 'Wed · Intervals')!;
    expect(wed.slots.map((s) => s.id)).toEqual([
      'program-hybrid-athlete:wed-intervals:easy-run',
      'program-hybrid-athlete:wed-intervals:interval-run',
      'program-hybrid-athlete:wed-intervals:easy-run@2',
    ]);
  });

  it('increments: 5 → 5 lb, 10 → 10 lb, next_bell → 8 lb', () => {
    const slot = (n: number, name: string) => byNumber(n).days.flatMap((d) => d.slots).find((s) => s.catalogName === name)!;
    expect(slot(1, 'Barbell bench press').incrementLb).toBe(5);
    expect(slot(1, 'Deadlift').incrementLb).toBe(10);
    expect(slot(8, 'Double kettlebell front squat').incrementLb).toBe(8);
    expect(slot(8, 'Turkish get-up').incrementLb).toBe(8);
  });

  it('week plans: #5 week 10 deload half; #12 week 5 taper, week 6 test holds; #19 weeks 9, 11, 12; #20 weeks 4, 8, 12 at 0.6 run time; beginners none', () => {
    const week = (n: number, w: number) => byNumber(n).weekPlan.find((x) => x.week === w);
    expect(week(5, 10)).toEqual({ week: 10, kind: 'deload', halfSets: true, holds: true, runShare: 1, note: '' });
    expect(byNumber(5).weekPlan).toHaveLength(1);
    expect(week(12, 5)).toMatchObject({ kind: 'taper', halfSets: true, holds: true, note: 'Taper: half the sets, top sets at full weight.' });
    expect(week(12, 6)).toMatchObject({
      kind: 'test',
      halfSets: false,
      holds: true,
      note: 'Test week: work up to a single on squat, bench and deadlift. Skip the accessories.',
    });
    expect(week(12, 1)).toMatchObject({ kind: 'note', halfSets: false, holds: false, note: 'Build: top sets heavy, back-off sets 8–10% lighter.' });
    expect(week(19, 9)).toMatchObject({ kind: 'mock_meet', halfSets: false, holds: true });
    expect(week(19, 11)).toMatchObject({ kind: 'taper', halfSets: true, holds: true, note: 'Taper: events at 60–70% of contest weight.' });
    expect(week(19, 12)).toMatchObject({ kind: 'meet', halfSets: false, holds: true });
    expect(week(19, 10)).toMatchObject({ kind: 'note', holds: false, note: 'Heavy week.' });
    for (const w of [4, 8, 12]) expect(week(20, w)).toMatchObject({ kind: 'lighter', halfSets: true, holds: true, runShare: 0.6 });
    expect(week(20, 12)!.note).toBe('Finish with a 5 km time trial and a rep-max test on the main lifts.');
    expect(week(11, 6)).toMatchObject({ kind: 'deload', halfSets: true });
    expect(byNumber(16).weekPlan.map((w) => w.week)).toEqual([5, 10]);
    expect(week(18, 8)).toMatchObject({ kind: 'transition', halfSets: true, holds: true });
    expect(week(17, 8)).toMatchObject({ kind: 'note', halfSets: false, holds: false, note: "Retest week 1's metcons as benchmarks." });
    for (const n of [1, 2, 3, 4, 8, 14]) expect(byNumber(n).weekPlan).toEqual([]);
    for (const p of PROGRAMS.filter((x) => x.level === 'Beginner')) expect(p.weekPlan.filter((w) => w.halfSets || w.holds)).toEqual([]);
    for (const p of PROGRAMS) {
      for (const w of p.weekPlan) {
        expect(w.week).toBeGreaterThanOrEqual(1);
        expect(w.week).toBeLessThanOrEqual(p.weeks);
        expect(w.runShare).toBe(w.kind === 'lighter' ? 0.6 : 1);
      }
    }
  });

  it('documentVolume matches expected_weekly_volume within 0.05 for every volume_checked program (hard sets, days a week, side/rear/front delts)', () => {
    const checked = PROGRAMS.filter((p) => p.volumeChecked);
    expect(checked).toHaveLength(19);
    for (const p of checked) {
      const v = documentVolume(p);
      const expected = json(p.number).expected_weekly_volume;
      for (const group of Object.keys(DOCUMENT_GROUPS) as DocumentGroup[]) {
        const want = expected[group];
        expect([p.number, group, Math.abs(v.groups[group].hardSets - want.hard_sets) <= 0.05]).toEqual([p.number, group, true]);
        expect([p.number, group, Math.abs(v.groups[group].daysPerWeek - want.days_per_week) <= 0.05]).toEqual([p.number, group, true]);
        expect(p.expectedVolume[group]).toEqual({ hardSets: want.hard_sets, daysPerWeek: want.days_per_week });
      }
      expect(Math.abs(v.delts.side - (expected.side_delts as unknown as number))).toBeLessThanOrEqual(0.05);
      expect(Math.abs(v.delts.rear - (expected.rear_delts as unknown as number))).toBeLessThanOrEqual(0.05);
      expect(Math.abs(v.delts.front - (expected.front_delts as unknown as number))).toBeLessThanOrEqual(0.05);
      expect(p.expectedDelts).toEqual({ side: expected.side_delts, rear: expected.rear_delts, front: expected.front_delts });
    }
  });

  it('band 8–24 for the eight groups except #4 (exempt)', () => {
    for (const p of PROGRAMS.filter((x) => x.volumeChecked)) {
      const v = documentVolume(p);
      const outside = DOCUMENT_BAND_GROUPS.filter(
        (g) => v.groups[g].hardSets < WEEKLY_SETS_BAND.min - 1e-9 || v.groups[g].hardSets > WEEKLY_SETS_BAND.max + 1e-9,
      );
      expect([p.number, outside]).toEqual([p.number, [...p.volumeBandExempt]]);
    }
    expect(byNumber(4).volumeBandExempt).toEqual(['Chest', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings']);
    expect(PROGRAMS.filter((p) => p.volumeBandExempt.length > 0).map((p) => p.number)).toEqual([4]);
    // #10's glutes sit on the top of the band, inside.
    expect(documentVolume(byNumber(10)).groups.Glutes.hardSets).toBeCloseTo(24, 5);
  });

  it('Mobility is not volume-checked', () => {
    const mobility = byNumber(14);
    expect(mobility.name).toBe('Mobility for Lifters');
    expect(mobility.volumeChecked).toBe(false);
    expect(mobility.expectedVolume).toEqual({});
    expect(mobility.volumeBandExempt).toEqual([]);
  });
});
