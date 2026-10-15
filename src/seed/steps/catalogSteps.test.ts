import { CATALOG_NEW, CATALOG_NEW_IDS } from '../newExerciseData';
import { CATALOG_STEPS } from './catalogSteps';

const ids = (type: (id: string) => boolean) => CATALOG_NEW_IDS.filter(type);
const METCONS = ids((id) => id.startsWith('metcon-'));
const MOBILITY = [
  'leg-swing',
  'ninety-ninety-hip-switch',
  'couch-stretch',
  'knee-to-wall-ankle-rock',
  'cossack-squat',
  'deep-goblet-squat-hold',
  'shoulder-cars',
  'thoracic-open-book',
  'wall-slide',
  'band-dislocate',
  'dumbbell-pullover-stretch',
  'dead-hang',
  'hip-cars',
  'jefferson-curl',
  'dumbbell-rdl-stretch-hold',
  'pigeon-stretch',
];
const CARRIES = ['yoke-carry', 'farmers-carry-distance', 'sandbag-carry', 'sled-push-distance'];
const stepsOf = (id: string) => CATALOG_STEPS[id] ?? [];

describe('catalog steps', () => {
  it('covers exactly the 48 catalog-new ids', () => {
    expect(CATALOG_NEW_IDS).toHaveLength(48);
    expect(Object.keys(CATALOG_STEPS).sort()).toEqual([...CATALOG_NEW_IDS].sort());
  });

  it('every catalog-new id has 2-4 steps', () => {
    for (const id of CATALOG_NEW_IDS) {
      const steps = stepsOf(id);
      expect([id, steps.length >= 2 && steps.length <= 4]).toEqual([id, true]);
    }
  });

  it('every step is a plain, non-empty, trimmed sentence of reasonable length', () => {
    for (const id of CATALOG_NEW_IDS) {
      for (const step of stepsOf(id)) {
        expect([id, step.trim()]).toEqual([id, step]);
        expect(step.length).toBeGreaterThan(15);
        expect(step.length).toBeLessThanOrEqual(260);
        expect(step).toMatch(/[.]$/);
      }
    }
  });

  it('no step has "!", curly quotes, dashes, or the words detect, notice or decide', () => {
    for (const id of CATALOG_NEW_IDS) {
      for (const step of stepsOf(id)) {
        expect([id, step]).toEqual([id, step.replace(/[!‘’“”–—]/g, '')]);
        expect([id, /\b(detect|detects|notice|notices|decide|decides|calorie|calories|injury|injuries)\b/i.test(step)]).toEqual([id, false]);
      }
    }
  });

  it('steps are unique across the non-metcon exercises', () => {
    const all = CATALOG_NEW_IDS.filter((id) => !id.startsWith('metcon-')).flatMap(stepsOf);
    expect(new Set(all).size).toBe(all.length);
  });

  it('every metcon names its format, its score and its cap or time', () => {
    expect(METCONS).toHaveLength(7);
    for (const id of METCONS) {
      const text = stepsOf(id).join(' ');
      expect([id, /AMRAP|for time/i.test(text)]).toEqual([id, true]);
      expect([id, /score/i.test(text)]).toEqual([id, true]);
      expect([id, /\b(cap|minutes)\b/i.test(text)]).toEqual([id, true]);
    }
  });

  it('each metcon names its elements with their reps and loads', () => {
    const must: Record<string, RegExp[]> = {
      'metcon-amrap-10-squat-pushup-run': [/AMRAP/, /10 minutes/, /10 goblet squats/i, /10 push-ups/i, /200 m run/i, /rounds/i],
      'metcon-3-rounds-row-thruster-ring-row': [/3 rounds/i, /for time/i, /200 m row/i, /10 thrusters/i, /10 ring rows/i, /12 minutes/i],
      'metcon-amrap-15-cindy-scaled': [/AMRAP/, /15 minutes/, /5 pull-ups/i, /10 push-ups/i, /15 air squats/i, /rounds/i],
      'metcon-amrap-12-wallball-t2b-row': [/AMRAP/, /12 minutes/, /10 wall balls/i, /10 toes-to-bar/i, /12-calorie row|12 cal/i, /rounds/i],
      'metcon-21-15-9-thruster-pullup': [/21-15-9/, /for time/i, /thrusters/i, /95 lb/, /65 lb/, /pull-ups/i, /8 minutes/i],
      'metcon-amrap-25-run-wallball-burpee': [/AMRAP/, /25 minutes/, /400 m run/i, /15 wall balls/i, /10 burpees/i, /rounds/i],
      'metcon-5-rounds-db-snatch-c2b': [/5 rounds/i, /for time/i, /12 dumbbell snatches/i, /alternat/i, /10 chest-to-bar pull-ups/i, /15 minutes/i],
    };
    for (const id of METCONS) {
      const text = stepsOf(id).join(' ');
      for (const re of must[id] ?? []) expect([id, re.test(text)]).toEqual([id, true]);
      expect(must[id]).toBeDefined();
    }
  });

  it('every mobility step set says to stop short of pain', () => {
    for (const id of MOBILITY) {
      expect(CATALOG_NEW_IDS).toContain(id);
      expect([id, /stop short of pain/i.test(stepsOf(id).join(' '))]).toEqual([id, true]);
    }
  });

  it('runs and intervals say how hard, and how to log', () => {
    const effort: Record<string, RegExp> = {
      'easy-run': /talk in full sentences/i,
      'interval-run': /5 km pace/i,
      'tempo-run': /comfortably hard/i,
      'long-run': /conversational|talk/i,
      'bike-intervals': /hard/i,
      'rower-intervals': /hard/i,
      'incline-treadmill-walk': /incline/i,
    };
    for (const [id, re] of Object.entries(effort)) expect([id, re.test(stepsOf(id).join(' '))]).toEqual([id, true]);
  });

  it('strongman moving events carry a stop-if-your-back-rounds safety line', () => {
    for (const id of CARRIES) expect([id, /back/i.test(stepsOf(id).join(' ')) && /(stop|set it down|put it down)/i.test(stepsOf(id).join(' '))]).toEqual([id, true]);
  });

  it('names no exercise that is not in the registry', () => {
    expect(Object.keys(CATALOG_STEPS).every((id) => CATALOG_NEW.some((e) => e.id === id))).toBe(true);
  });
});
