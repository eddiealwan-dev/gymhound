import { dashboardWidgets, DEFAULT_WIDGETS, initials, moveWidget, tidyProfileText, weekLabel, weekSpoken, workoutCountText, workoutsPerWeek } from './profile';

describe('the dashboard list (R567)', () => {
  it('keeps known widgets once, in their order, and falls back to the default for anything else', () => {
    expect(dashboardWidgets(['body_weight', 'workouts_per_week', 'body_weight', 'calendar', 3])).toEqual(['body_weight', 'workouts_per_week']);
    expect(dashboardWidgets([])).toEqual([]);
    expect(dashboardWidgets(null)).toEqual(DEFAULT_WIDGETS);
    expect(dashboardWidgets('workouts_per_week')).toEqual(DEFAULT_WIDGETS);
    expect(DEFAULT_WIDGETS).toEqual(['workouts_per_week', 'daily_macros']);
  });

  it('moves a widget one place, and not past either end', () => {
    const list = ['workouts_per_week', 'daily_macros', 'body_weight'] as const;
    expect(moveWidget(list, 'daily_macros', -1)).toEqual(['daily_macros', 'workouts_per_week', 'body_weight']);
    expect(moveWidget(list, 'daily_macros', 1)).toEqual(['workouts_per_week', 'body_weight', 'daily_macros']);
    expect(moveWidget(list, 'workouts_per_week', -1)).toEqual(list);
    expect(moveWidget(list, 'body_weight', 1)).toEqual(list);
  });
});

describe('name and goal (R566)', () => {
  it('are kept without stray spaces or line breaks, and at most so long', () => {
    expect(tidyProfileText('  Eddie   Alwan \n', 40)).toBe('Eddie Alwan');
    expect(tidyProfileText('Bench 225\nfor reps', 140)).toBe('Bench 225 for reps');
    expect(tidyProfileText('abcdef', 3)).toBe('abc');
    // Cut by characters, never through one: an emoji stays whole.
    expect(tidyProfileText('ab💪cd', 3)).toBe('ab💪');
    expect(tidyProfileText('   ', 40)).toBe('');
  });

  it('give up to two initials for the photo stand-in', () => {
    expect(initials('Eddie Alwan')).toBe('EA');
    expect(initials('eddie')).toBe('E');
    expect(initials('Mary Jo van Dyke')).toBe('MD');
    expect(initials('  ')).toBe('');
    expect(initials('"Big" Lou')).toBe('BL');
    expect(initials('Élodie')).toBe('É');
  });

  it('counts workouts with separators and the right word', () => {
    expect(workoutCountText(0, 'en-US')).toBe('0 workouts');
    expect(workoutCountText(1, 'en-US')).toBe('1 workout');
    expect(workoutCountText(1190, 'en-US')).toBe('1,190 workouts');
  });
});

describe('workouts per week (R567)', () => {
  it('counts the last 8 weeks, Monday to Sunday, oldest first, this week last', () => {
    // Tue Oct 13 2026: this week began Mon Oct 12; 8 weeks back is Mon Aug 24.
    const weeks = workoutsPerWeek(['2026-08-23', '2026-08-24', '2026-08-30', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-13', '2026-10-19'], '2026-10-13');
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
    // Aug 23 (a Sunday) is the week before; Oct 19 is next week; two on one day count twice.
    expect(weeks.map((w) => w.count)).toEqual([2, 0, 0, 0, 0, 0, 1, 3]);
  });

  it('labels each week by its Monday, the phone’s way', () => {
    expect(weekLabel('2026-08-24', 'en-US')).toBe('8/24');
    expect(weekLabel('2026-08-24', 'en-GB')).toBe('24/08');
    expect(weekSpoken('2026-08-24', 'en-US')).toBe('week of August 24');
  });
});
