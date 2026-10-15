import type { SeriesPoint } from './chart';
import type { Muscle } from './types';
import {
  bodyweightTrend,
  GROUP_LABELS,
  groupWeekText,
  type LoggedBlock,
  muscleWeek,
  sessionsSummary,
  sessionsText,
  trendText,
} from './weeklyAnalytics';

const MUSCLES: Record<string, { primary: Muscle[]; secondary: Muscle[] }> = {
  bench: { primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  raise: { primary: ['side_delts'], secondary: [] },
  frontRaise: { primary: ['front_delts'], secondary: [] },
  rdl: { primary: ['hamstrings', 'glutes'], secondary: [] },
  plank: { primary: ['abs'], secondary: [] },
  rearFly: { primary: ['rear_delts'], secondary: [] },
  ohp: { primary: ['front_delts'], secondary: ['side_delts', 'triceps', 'traps'] },
};
const muscles = (id: string) => MUSCLES[id];
const block = (workoutId: string, exerciseId: string, hardSets: number, loggingType: LoggedBlock['loggingType'] = 'weighted'): LoggedBlock => ({
  workoutId,
  exerciseId,
  loggingType,
  hardSets,
});
const find = (weeks: ReturnType<typeof muscleWeek>, group: string) => weeks.find((g) => g.group === group)!;

describe('muscleWeek', () => {
  it('counts a push day of 4 bench sets: chest 4 under, triceps 2 under (R176)', () => {
    const weeks = muscleWeek([block('w1', 'bench', 4)], muscles);
    expect(weeks.map((g) => g.group)).toEqual(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes']);
    expect(find(weeks, 'chest')).toEqual({ group: 'chest', sets: 4, status: 'under' });
    expect(find(weeks, 'triceps')).toEqual({ group: 'triceps', sets: 2, status: 'under' });
    expect(find(weeks, 'back')).toEqual({ group: 'back', sets: 0, status: 'under' });
  });

  it('adds up blocks across workouts and keeps halves', () => {
    const weeks = muscleWeek([block('w1', 'bench', 5), block('w2', 'bench', 4)], muscles);
    expect(find(weeks, 'chest')).toEqual({ group: 'chest', sets: 9, status: 'in' });
    expect(find(weeks, 'triceps').sets).toBe(4.5);
  });

  it('does not count timed holds or distance', () => {
    const weeks = muscleWeek([block('w1', 'bench', 4, 'timed'), block('w1', 'bench', 4, 'distance_time')], muscles);
    expect(find(weeks, 'chest').sets).toBe(0);
  });

  it("counts a loaded carry's sets, and not a metcon's one score (R607)", () => {
    expect(find(muscleWeek([block('w1', 'bench', 3, 'weighted_distance')], muscles), 'chest').sets).toBe(3);
    const scores = muscleWeek([block('w1', 'bench', 1, 'rounds'), block('w1', 'bench', 1, 'for_time')], muscles);
    expect(find(scores, 'chest').sets).toBe(0);
  });

  it('counts weighted, bodyweight plus, assisted and weight-and-time blocks', () => {
    const weeks = muscleWeek(
      [
        block('w1', 'bench', 1, 'weighted'),
        block('w1', 'bench', 1, 'bodyweight_plus'),
        block('w1', 'bench', 1, 'assisted'),
        block('w1', 'bench', 1, 'weighted_time'),
      ],
      muscles,
    );
    expect(find(weeks, 'chest').sets).toBe(4);
  });

  it('reads over 24 as over', () => {
    expect(find(muscleWeek([block('w1', 'rdl', 25)], muscles), 'hamstrings').status).toBe('over');
    expect(find(muscleWeek([block('w1', 'rdl', 24)], muscles), 'hamstrings').status).toBe('in');
    expect(find(muscleWeek([block('w1', 'rdl', 8)], muscles), 'hamstrings').status).toBe('in');
  });

  it('shows shoulders as the figure the band checked (R93, R189): the floor when under or in range', () => {
    // 12 overhead press sets: front 12, side 6 (secondary) → floor 6 + 12/2 = 12, cap 6.
    expect(find(muscleWeek([block('w1', 'ohp', 12)], muscles), 'shoulders')).toEqual({ group: 'shoulders', sets: 12, status: 'in' });
    // 30 front raises: front delts are not capped and count half towards the floor → 15, in range.
    expect(find(muscleWeek([block('w1', 'frontRaise', 30)], muscles), 'shoulders')).toEqual({ group: 'shoulders', sets: 15, status: 'in' });
    // 10 front raises: floor 5 → under.
    expect(find(muscleWeek([block('w1', 'frontRaise', 10)], muscles), 'shoulders')).toEqual({ group: 'shoulders', sets: 5, status: 'under' });
  });

  it('shows shoulders as the cap (side and rear sets) when over (R189)', () => {
    // 13 side raises, 13 rear flyes and 10 front raises: cap 26 → over; the front raises are not in the figure.
    const weeks = muscleWeek([block('w1', 'raise', 13), block('w2', 'rearFly', 13), block('w2', 'frontRaise', 10)], muscles);
    expect(find(weeks, 'shoulders')).toEqual({ group: 'shoulders', sets: 26, status: 'over' });
  });
});

describe('groupWeekText', () => {
  it('says the group, the sets and the band', () => {
    expect(groupWeekText({ group: 'chest', sets: 12, status: 'in' })).toBe('Chest · 12 sets · in range');
    expect(groupWeekText({ group: 'hamstrings', sets: 4.5, status: 'under' })).toBe('Hamstrings · 4.5 sets · under 8');
    expect(groupWeekText({ group: 'back', sets: 26, status: 'over' })).toBe('Back · 26 sets · over 24');
    expect(groupWeekText({ group: 'biceps', sets: 1, status: 'under' })).toBe('Biceps · 1 set · under 8');
  });

  it('says what the shoulders figure counts (R189)', () => {
    expect(groupWeekText({ group: 'shoulders', sets: 6, status: 'under' })).toBe('Shoulders · 6 sets, front delts count half · under 8');
    expect(groupWeekText({ group: 'shoulders', sets: 12, status: 'in' })).toBe('Shoulders · 12 sets, front delts count half · in range');
    expect(groupWeekText({ group: 'shoulders', sets: 26, status: 'over' })).toBe('Shoulders · 26 side and rear sets · over 24');
  });

  it('has a label for every group', () => {
    expect(Object.values(GROUP_LABELS)).toEqual(['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes']);
  });
});

describe('sessionsSummary', () => {
  // 2026-10-14 is a Wednesday; this week starts Monday 2026-10-12.
  const TODAY = '2026-10-14';

  it('counts this week from Monday to today and last week Monday to Sunday', () => {
    const dates = ['2026-10-04', '2026-10-05', '2026-10-11', '2026-10-11', '2026-10-12', '2026-10-14'];
    const s = sessionsSummary(dates, TODAY);
    expect(s.thisWeek).toBe(2);
    expect(s.lastWeek).toBe(3);
  });

  it('counts a workout started Sunday 23:50 for that Sunday’s week (its local date)', () => {
    const s = sessionsSummary(['2026-10-11'], TODAY);
    expect(s.lastWeek).toBe(1);
    expect(s.thisWeek).toBe(0);
  });

  it('averages the 8 full weeks before this one, to one decimal', () => {
    // First workout long ago; 27 sessions in the 8 weeks from 2026-08-17 to 2026-10-11.
    const dates = ['2026-01-05'];
    for (let i = 0; i < 27; i++) dates.push(i % 2 === 0 ? '2026-08-17' : '2026-10-11');
    const s = sessionsSummary(dates, TODAY);
    expect(s.averageWeeks).toBe(8);
    expect(s.average).toBe(3.4);
  });

  it('averages over 3 weeks for a 3-week-old history', () => {
    // First workout in the week of 2026-09-21: three full weeks before this one.
    const dates = ['2026-09-23', '2026-09-30', '2026-10-01', '2026-10-06', '2026-10-13'];
    const s = sessionsSummary(dates, TODAY);
    expect(s.averageWeeks).toBe(3);
    expect(s.average).toBe(1.3);
  });

  it('has no average for a 1-week-old history or none', () => {
    expect(sessionsSummary(['2026-10-06'], TODAY)).toEqual({ thisWeek: 0, lastWeek: 1, average: null, averageWeeks: 1 });
    expect(sessionsSummary(['2026-10-13'], TODAY)).toEqual({ thisWeek: 1, lastWeek: 0, average: null, averageWeeks: 0 });
    expect(sessionsSummary([], TODAY)).toEqual({ thisWeek: 0, lastWeek: 0, average: null, averageWeeks: 0 });
  });

  it('takes a shorter window when asked', () => {
    expect(sessionsSummary(['2026-01-05', '2026-10-06'], TODAY, 4)).toMatchObject({ averageWeeks: 4, average: 0.3 });
  });
});

describe('sessionsText', () => {
  it('says this week, last week and the average', () => {
    expect(sessionsText({ thisWeek: 3, lastWeek: 4, average: 3.4, averageWeeks: 8 })).toBe('3 this week · 4 last week · 3.4 a week over 8 weeks');
    expect(sessionsText({ thisWeek: 1, lastWeek: 0, average: 3, averageWeeks: 3 })).toBe('1 this week · 0 last week · 3 a week over 3 weeks');
    expect(sessionsText({ thisWeek: 0, lastWeek: 1, average: null, averageWeeks: 1 })).toBe('0 this week · 1 last week');
  });
});

describe('bodyweightTrend', () => {
  const TODAY = '2026-10-14';
  const p = (localDate: string, value: number): SeriesPoint => ({ localDate, value });

  it('compares the last 7 days with the 7 days four weeks earlier (R179)', () => {
    const daily = [p('2026-09-09', 99), p('2026-09-10', 90), p('2026-09-16', 80.4), p('2026-09-15', 81), p('2026-10-08', 80), p('2026-10-14', 79.6)];
    // Earlier window 2026-09-10 … 2026-09-16: 90, 81, 80.4 → 83.8 average; last 7 days: 80, 79.6 → 79.8. 09-09 is outside.
    const t = bodyweightTrend(daily, TODAY)!;
    expect(t.change).toBeCloseTo(-4);
    expect(t.perWeek).toBeCloseTo(-1);
  });

  it('is null when either window has no point', () => {
    expect(bodyweightTrend([p('2026-10-14', 80)], TODAY)).toBeNull();
    expect(bodyweightTrend([p('2026-09-12', 80), p('2026-10-07', 80)], TODAY)).toBeNull();
    expect(bodyweightTrend([], TODAY)).toBeNull();
  });
});

describe('trendText', () => {
  it('says down, up, steady or how to get a trend', () => {
    expect(trendText({ change: -1.2, perWeek: -0.3 }, 'kg')).toBe('Down 1.2 kg in 4 weeks, about 0.3 kg a week.');
    expect(trendText({ change: 0.5, perWeek: 0.125 }, 'lb')).toBe('Up 0.5 lb in 4 weeks, about 0.1 lb a week.');
    expect(trendText({ change: 0.04, perWeek: 0.01 }, 'kg')).toBe('Steady over 4 weeks.');
    expect(trendText({ change: -0.049, perWeek: -0.012 }, 'kg')).toBe('Steady over 4 weeks.');
    expect(trendText(null, 'kg')).toBe('Log your weight a few times a week to see a trend.');
  });

  it('decides Steady on the rounded figure shown', () => {
    // 0.05 shows as 0.1, so it is not steady; 0.09999 shows as 0.1 too.
    expect(trendText({ change: 0.05, perWeek: 0.0125 }, 'lb')).toBe('Up 0.1 lb in 4 weeks, about 0.01 lb a week.');
    expect(trendText({ change: -0.09999, perWeek: -0.025 }, 'kg')).toBe('Down 0.1 kg in 4 weeks, about 0.03 kg a week.');
  });

  it('never says about 0 a week', () => {
    expect(trendText({ change: -0.15, perWeek: -0.0375 }, 'kg')).toBe('Down 0.2 kg in 4 weeks, about 0.04 kg a week.');
  });
});
