import { StyleSheet, Text, TextInput, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { SetView, WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import type { ProgramRule } from '../../domain/ruleLine';
import type { RestKind } from '../../domain/restKind';
import { startTimer, type WorkTimer } from '../../domain/workClock';
import type { MetconRule } from '../../seed/programTypes';
import { Button } from '../Button';
import { ExerciseBlock } from './ExerciseBlock';
import { RestInline } from './RestInline';
import { WorkClock } from './WorkClock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(() => Promise.resolve()), NotificationFeedbackType: { Warning: 'warning' } }));
jest.mock('../../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/sessionActions', () => ({
  addSetTo: jest.fn(),
  addWarmupTo: jest.fn(),
  commitSetField: jest.fn(),
  removeSetFrom: jest.fn(),
  saveNote: jest.fn(),
  tick: jest.fn(),
  untick: jest.fn(),
}));
// They draw nothing here: their own tests cover what they show; here, where they sit and their props are what is read.
jest.mock('./RestInline', () => ({ RestInline: () => null }));
jest.mock('./WorkClock', () => ({ WorkClock: () => null }));
jest.mock('../FormDemo', () => ({ FormDemo: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const set = (id: string, position: number, extra: Partial<SetView> = {}): SetView => ({
  id,
  position,
  setType: 'working',
  weight: null,
  weightUnit: null,
  reps: null,
  rpe: null,
  durationS: null,
  distance: null,
  distanceUnit: null,
  done: false,
  completedAt: null,
  ...extra,
});

const programRule = (over: Partial<ProgramRule> = {}): ProgramRule => ({
  kind: 'load',
  carryUnit: null,
  sessionsToRaise: 1,
  halved: false,
  missesBefore: 0,
  missesToReset: 3,
  resetMultiplier: 0.9,
  week: 2,
  weekInfo: null,
  sets: 3,
  rung: null,
  rungs: null,
  addSet: null,
  weekly: null,
  metconText: null,
  manualText: null,
  ...over,
});

type Slot = {
  rule?: Partial<ProgramRule>;
  metcon?: MetconRule | null;
  catalogName?: string;
  note?: string | null;
  countsTowardVolume?: boolean;
  restKind?: RestKind;
};

const exercise = (over: Partial<WorkoutExerciseView>, slot: Slot | null): WorkoutExerciseView => ({
  id: 'we1',
  exerciseId: 'barbell-back-squat',
  name: 'Barbell back squat',
  loggingType: 'weighted',
  equipment: 'barbell',
  position: 0,
  supersetGroup: null,
  showRpe: false,
  note: null,
  restSeconds: null,
  rule: null,
  plannedWeight: null,
  plannedUnit: null,
  overrideWeight: null,
  overrideUnit: null,
  mark: null,
  sets: [set('s1', 0)],
  previous: [],
  ...over,
  program:
    slot === null
      ? null
      : {
          rule: programRule(slot.rule),
          warmUp: false,
          note: slot.note ?? null,
          metcon: slot.metcon ?? null,
          catalogName: slot.catalogName ?? 'Barbell back squat',
          countsTowardVolume: slot.countsTowardVolume ?? true,
          restKind: slot.restKind ?? 'heavy',
        },
});

const amrap: MetconRule = { format: 'AMRAP', workMinutes: 10, elements: ['Goblet squat (metcon)', 'Push-up', 'Run'], capMinutes: null };
const AMRAP_NAME = 'Metcon A · AMRAP 10 min: 10 goblet squats, 10 push-ups (scaled), 200 m run';
const metconA = (over: Partial<WorkoutExerciseView> = {}) =>
  exercise(
    { exerciseId: 'metcon-amrap-10-squat-pushup-run', name: 'AMRAP 10: goblet squat, push-up, run', loggingType: 'rounds', equipment: 'other', rule: { setCount: 1, repMin: 4, repMax: 7, increment: 0, incrementUnit: 'lb' }, ...over },
    { rule: { kind: 'metcon', metconText: 'AMRAP 10 min: 10 goblet squats, 10 push-ups (scaled), 200 m run' }, metcon: amrap, catalogName: AMRAP_NAME, restKind: 'none', note: "Short-to-medium time domain; alternates: 'Cindy' scaled" },
  );

const fran: MetconRule = { format: 'For Time', workMinutes: 6, elements: ['Thruster', 'Pull-up (scaled as needed)'], capMinutes: 8 };
const FRAN_NAME = 'Metcon · 21-15-9 for time: thrusters (95/65 lb) and pull-ups (cap 8 min)';
const franEx = () =>
  exercise(
    { exerciseId: 'metcon-21-15-9-thruster-pullup', name: '21-15-9: thruster, pull-up', loggingType: 'for_time', equipment: 'other', previous: [{ ...set('p', 0), durationS: 462 }] },
    { rule: { kind: 'metcon', metconText: '21-15-9 for time: thrusters (95/65 lb) and pull-ups (cap 8 min)' }, metcon: fran, catalogName: FRAN_NAME, restKind: 'none' },
  );

const run = () =>
  exercise(
    { exerciseId: 'easy-run', name: 'Easy run', loggingType: 'timed', equipment: 'other', rule: { setCount: 1, repMin: 1740, repMax: 1740, increment: 0, incrementUnit: 'lb' } },
    { rule: { kind: 'weekly_seconds', weekly: { kind: 'seconds', startS: 1500, stepS: 120, capS: 2400 } }, restKind: 'none', countsTowardVolume: false, catalogName: 'Easy run' },
  );

const intervals = () =>
  exercise(
    {
      exerciseId: 'interval-run',
      name: 'Interval run',
      loggingType: 'timed',
      equipment: 'other',
      rule: { setCount: 6, repMin: 180, repMax: 180, increment: 0, incrementUnit: 'lb' },
      sets: [0, 1, 2, 3, 4, 5].map((i) => set(`i${i}`, i)),
    },
    {
      rule: { kind: 'weekly_seconds', weekly: { kind: 'sets_then_seconds', startSets: 4, capSets: 8, seconds: 180, stepS: 15 } },
      restKind: 'none',
      countsTowardVolume: false,
      catalogName: 'Interval run',
      note: 'Hard (about 5 km pace) with 120 s easy jog between',
    },
  );

const yoke = () =>
  exercise(
    {
      exerciseId: 'yoke-carry',
      name: 'Yoke carry',
      loggingType: 'weighted_distance',
      equipment: 'other',
      rule: { setCount: 3, repMin: 50, repMax: 50, increment: 20, incrementUnit: 'lb' },
      plannedWeight: 335,
      plannedUnit: 'lb',
      previous: [{ ...set('p', 0), weight: 315, weightUnit: 'lb', distance: 50, distanceUnit: 'ft', durationS: 22 }],
    },
    { rule: { kind: 'load', carryUnit: 'ft' }, catalogName: 'Yoke carry', restKind: 'heavy' },
  );

const snatch = () =>
  exercise(
    { exerciseId: 'power-snatch', name: 'Power snatch', sets: [0, 1, 2].map((i) => set(`n${i}`, i)) },
    { rule: { kind: 'manual', manualText: 'Technique work, add weight when every rep is crisp' }, countsTowardVolume: false, note: 'EMOM 10: 2 reps every minute', catalogName: 'Power snatch (technique)' },
  );

function mount(ex: WorkoutExerciseView, workTimer: WorkTimer | null = null, clockBusy = false, unit: 'lb' | 'kg' = 'lb'): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ExerciseBlock
        workoutId="w1"
        ex={ex}
        unit={unit}
        gear={{ bar: 45, plates: { '45': 4 } }}
        distanceUnit="mi"
        onOpenMenu={() => {}}
        inSuperset={false}
        joinsNext={false}
        supersetLabel={null}
        restWaitsFor={null}
        latestTickedSetId={null}
        restEndsAt={null}
        restSetId={null}
        restUp={null}
        upText=""
        settingsRestSeconds={120}
        onOpenRest={() => {}}
        onOpenMark={() => {}}
        nextSetId={null}
        workTimer={workTimer}
        clockBusy={clockBusy}
      />,
    );
  });
  return tree;
}

function shownText(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}
const labels = (tree: ReactTestRenderer) => tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && typeof n.type !== 'string').map((n) => n.props.accessibilityLabel as string);
const buttons = (tree: ReactTestRenderer) => tree.root.findAllByType(Button).map((b) => b.props.label as string);
const fields = (tree: ReactTestRenderer) => tree.root.findAllByType(TextInput);
const field = (tree: ReactTestRenderer, label: string) => fields(tree).find((f) => f.props.accessibilityLabel === label)!;
const clock = (tree: ReactTestRenderer) => tree.root.findAllByType(WorkClock);
const headers = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => n.type === Text && StyleSheet.flatten(n.props.style)?.fontSize === 10).map((n) => [n.props.children].flat().join(''));

describe('a metcon is one block: its format, its moves, its clock and one score (Task 7b)', () => {
  it("is called by the program's label, with the format and each move's amount in its own column, in the program's words", () => {
    const tree = mount(metconA());
    const shown = shownText(tree);
    expect(shown).toContain('Metcon A');
    expect(shown).not.toContain('AMRAP 10: goblet squat, push-up, run');
    expect(shown).toEqual(expect.arrayContaining(['AMRAP 10 min', '10', 'Goblet squats', 'Push-ups (scaled)', '200 m', 'Run']));
    expect(labels(tree)).toContain('Show form for Metcon A');
    expect(labels(tree)).toContain('AMRAP 10 minutes: 10 Goblet squats, 10 Push-ups (scaled), 200 metres Run.');
  });

  it('keeps the rule line to its second half, the note after it', () => {
    const shown = shownText(mount(metconA()));
    expect(shown).toContain('Beat your score twice in a row, then go heavier or take the next scaling step.');
    expect(shown.some((s) => s.startsWith('AMRAP 10 min: 10 goblet squats'))).toBe(false);
    expect(shown).toContain("Short-to-medium time domain; alternates: 'Cindy' scaled");
  });

  it("runs its clock: an AMRAP of 10 minutes, this block's stored clock, dimmed while another runs", () => {
    const timer = startTimer({ workoutId: 'w1', workoutExerciseId: 'we1', plan: { kind: 'amrap', noun: 'AMRAP', steps: [{ kind: 'work', seconds: 600, set: 1 }] } }, 1_000);
    const [c] = clock(mount(metconA(), timer, true));
    expect(c.props).toMatchObject({ workoutId: 'w1', workoutExerciseId: 'we1', timer, busy: true, plan: { kind: 'amrap', steps: [{ seconds: 600 }] } });
  });

  it('scores in one row with no SET chip, suggesting nothing, with last time beside it', () => {
    const tree = mount(metconA({ previous: [{ ...set('p', 0), reps: 6, extraReps: 4 }] }));
    expect(headers(tree)).toEqual(['PREVIOUS', 'ROUNDS', '+REPS', '✓']);
    expect(shownText(tree)).toContain('6 + 4');
    expect(field(tree, 'Score rounds').props.placeholder).toBe('');
    expect(field(tree, 'Score extra reps').props.placeholder).toBe('');
    expect(labels(tree)).toContain('Score done');
    expect(labels(tree)).not.toContain('Set 1');
    expect(buttons(tree)).not.toContain('+ Set');
    expect(buttons(tree)).not.toContain('+ Warmup');
  });

  it('lets the clock go once the score is ticked', () => {
    const tree = mount(metconA({ sets: [set('s1', 0, { done: true, reps: 6, completedAt: 5 })] }));
    expect(clock(tree)).toHaveLength(0);
  });

  it('says its rep scheme and cap in the format line, the scheme beside each move and the load in the session unit (design gate #2)', () => {
    const tree = mount(franEx(), null, false, 'kg');
    const shown = shownText(tree);
    expect(shown).toContain('Metcon');
    expect(shown).toContain('21-15-9 for time · 8 min cap');
    expect(shown.filter((s) => s === '21-15-9')).toHaveLength(2);
    expect(shown).toEqual(expect.arrayContaining(['Thrusters', '43 / 29.5 kg', 'Pull-ups (scaled as needed)']));
    // The name is not repeated under the format line.
    expect(shown.some((s) => s.includes('thrusters (95/65 lb)'))).toBe(false);
    expect(shown).toContain('7:42');
    expect(field(tree, 'Score time').props.placeholder).toBe('');
    expect(clock(tree)[0].props.plan).toMatchObject({ kind: 'for_time', steps: [{ seconds: 480 }] });
  });
});

describe('a run is a timed effort with its own block', () => {
  it("reads as the run and the week's target, with the clock and one row that suggests the target", () => {
    const tree = mount(run());
    expect(shownText(tree)).toContain('Run 29:00');
    expect(clock(tree)[0].props.plan).toMatchObject({ kind: 'run', steps: [{ seconds: 1740 }] });
    expect(headers(tree)).toEqual(['PREVIOUS', 'TIME', '✓']);
    expect(field(tree, 'Run time').props.placeholder).toBe('29:00');
    expect(labels(tree)).toContain('Run done');
    expect(buttons(tree)).not.toContain('+ Set');
  });

  it("reads its target from one field, as its rule line and clock do, when the range's ends differ", () => {
    const base = run();
    const tree = mount({ ...base, rule: { ...base.rule!, repMin: 1740, repMax: 1800 } });
    expect(shownText(tree)).toContain('Run 29:00');
    expect(clock(tree)[0].props.plan).toMatchObject({ steps: [{ seconds: 1740 }] });
    expect(field(tree, 'Run time').props.placeholder).toBe('29:00');
  });

  it('steps intervals through hard and easy, the easy part from the note, with + Set only', () => {
    const tree = mount(intervals());
    expect(shownText(tree)).toContain('6 × 3:00 hard / 2:00 easy');
    expect(clock(tree)[0].props.plan).toMatchObject({ kind: 'intervals' });
    expect(clock(tree)[0].props.plan.steps).toHaveLength(11);
    expect(headers(tree)[0]).toBe('SET');
    expect(buttons(tree)).toContain('+ Set');
    expect(buttons(tree)).not.toContain('+ Warmup');
  });
});

describe('an event reads as an event', () => {
  it('heads distance with its unit, shows last time as load × distance, and ticks drop-free', () => {
    const tree = mount(yoke());
    expect(headers(tree)).toEqual(['SET', 'PREVIOUS', 'LB', 'FT', 'TIME', '✓']);
    expect(shownText(tree)).toContain('315 × 50');
    expect(labels(tree)).toContain('Previous 315 pounds for 50 feet in 22 seconds');
    expect(labels(tree)).toContain('Set 1 carried drop-free');
    expect(shownText(tree).some((s) => s.endsWith('A drop ends the set: log what you carried unbroken.'))).toBe(true);
    expect(buttons(tree)).toEqual(expect.arrayContaining(['+ Set', '+ Warmup']));
    expect(clock(tree)).toHaveLength(0);
  });

  it("marks the time as optional with a faint dash", () => {
    const tree = mount(yoke());
    const time = field(tree, 'Set 1 time, optional');
    // Last time's time, as a clock, as a carry's Previous reads it (Task 7).
    expect(time.props.placeholder).toBe('0:22');
    const fresh = mount(exercise({ ...yoke(), previous: [] }, { rule: { kind: 'load', carryUnit: 'ft' }, restKind: 'heavy' }));
    expect(field(fresh, 'Set 1 time, optional').props.placeholder).toBe('–');
  });
});

describe('technique sets', () => {
  it('say they are not counted, with an EMOM clock when the note starts EMOM', () => {
    const tree = mount(snatch());
    expect(shownText(tree)).toContain('Technique · not counted');
    expect(clock(tree)[0].props.plan).toMatchObject({ kind: 'emom' });
    expect(clock(tree)[0].props.plan.steps).toHaveLength(10);
    expect(headers(tree)[0]).toBe('SET');
  });
});

describe('your own routines keep their set rows', () => {
  it('draws no clock, no format line and no technique line, with the SET chip and both add buttons', () => {
    const tree = mount(exercise({ exerciseId: 'easy-run', name: 'Easy run', loggingType: 'timed', equipment: 'other' }, null));
    expect(clock(tree)).toHaveLength(0);
    expect(headers(tree)).toEqual(['SET', 'PREVIOUS', 'TIME', '✓']);
    expect(buttons(tree)).toEqual(expect.arrayContaining(['+ Set', '+ Warmup']));
    expect(labels(tree)).toContain('Set 1 done');
    expect(tree.root.findAllByType(RestInline)).toHaveLength(0);
  });
});

describe('a metcon whose name gives no amounts', () => {
  it('shows the full name as its format line and no list, never an empty amount column', () => {
    const odd = exercise(
      { exerciseId: 'metcon-amrap-10-squat-pushup-run', name: 'AMRAP 10', loggingType: 'rounds', equipment: 'other' },
      { rule: { kind: 'metcon' }, metcon: amrap, catalogName: 'Metcon · AMRAP 10: goblet squat, push-up, run', restKind: 'none' },
    );
    const tree = mount(odd);
    expect(shownText(tree)).toContain('AMRAP 10: goblet squat, push-up, run');
    expect(tree.root.findAll((n) => n.type === View && n.props.testID === 'metcon-move')).toHaveLength(0);
  });
});

describe('large text', () => {
  it('lets every line of a block wrap: nothing is cut to one line but the column headers', () => {
    for (const ex of [metconA(), franEx(), run(), intervals(), yoke(), snatch()]) {
      const tree = mount(ex);
      const capped = tree.root.findAll((n) => n.type === Text && n.props.numberOfLines !== undefined && StyleSheet.flatten(n.props.style)?.fontSize !== 10);
      expect(capped).toHaveLength(0);
      const views = tree.root.findAll((n) => n.type === View && n.props.testID === 'metcon-move');
      views.forEach((v) => expect(v.props.style).toMatchObject({ flexDirection: 'row' }));
    }
  });
});
