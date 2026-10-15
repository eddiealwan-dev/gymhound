// Stats' rule-based weekly analytics and the weekly check-in (§18.3, R176–R180): sets per muscle against R93's band,
// sessions, the bodyweight trend and last week's review. Pure: the repository (`analyticsRepo.ts`) reads the rows.
import type { SeriesPoint } from './chart';
import { daysBetween, mondayOf, shiftDay } from './dates';
import { MAJOR_GROUPS, type MajorGroup, WEEKLY_SETS_BAND, weeklySetsForBand } from './programVolume';
import type { LoggingType, Muscle, WeightUnit } from './types';

export const GROUP_LABELS: Record<MajorGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
};

/** One exercise of a finished workout: its hard sets are the done sets that are not warm-ups (R176). */
export type LoggedBlock = { workoutId: string; exerciseId: string; loggingType: LoggingType; hardSets: number };

/**
 * A group's week: `sets` is the figure the band checked (R189). For every group but shoulders that is its sets
 * (`weeklySetsByGroup`); for shoulders it is R93's floor (side + rear + ½ front) when under or in range, and its cap
 * (side + rear) when over.
 */
export type GroupWeek = { group: MajorGroup; sets: number; status: 'under' | 'in' | 'over' };

/**
 * The logging types whose sets count as volume for a muscle (R176): timed holds and cardio don't (as R87). A loaded
 * carry's sets do, as a loaded hold's do; a metcon's one score (an AMRAP or For Time) is not a hard set (R607).
 */
const COUNTED_TYPES: ReadonlySet<LoggingType> = new Set<LoggingType>(['weighted', 'bodyweight_plus', 'assisted', 'weighted_time', 'weighted_distance']);

/** True when a block's sets count towards sets per muscle and the check-in's hard sets (R176). */
export function countsAsHardSets(block: Pick<LoggedBlock, 'loggingType'>): boolean {
  return COUNTED_TYPES.has(block.loggingType);
}

function oneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Sets per major group for a week of blocks (R176), in `MAJOR_GROUPS` order: each workout is one "day" of
 * `weeklySetsForBand` (primary 1, secondary ½), so the band reads as R93 (with the shoulder floor and cap). `under`
 * when the floor is below 8, `over` when the cap is above 24, else `in`; `sets` is the figure checked (R189), to one
 * decimal.
 */
export function muscleWeek(
  blocks: readonly LoggedBlock[],
  muscles: (exerciseId: string) => { primary: Muscle[]; secondary: Muscle[] },
): GroupWeek[] {
  const days = new Map<string, { exerciseId: string; sets: number }[]>();
  for (const b of blocks) {
    if (!countsAsHardSets(b) || b.hardSets <= 0) continue;
    const day = days.get(b.workoutId);
    const entry = { exerciseId: b.exerciseId, sets: b.hardSets };
    if (day) day.push(entry);
    else days.set(b.workoutId, [entry]);
  }
  const week = [...days.values()].map((exercises) => ({ exercises }));
  const band = weeklySetsForBand(week, muscles);
  return (Object.keys(MAJOR_GROUPS) as MajorGroup[]).map((group) => {
    const { floor, cap } = band[group];
    const status: GroupWeek['status'] =
      floor < WEEKLY_SETS_BAND.min ? 'under' : cap > WEEKLY_SETS_BAND.max ? 'over' : 'in';
    return { group, sets: oneDecimal(status === 'over' ? cap : floor), status };
  });
}

const STATUS_TEXT: Record<GroupWeek['status'], string> = {
  under: `under ${WEEKLY_SETS_BAND.min}`,
  in: 'in range',
  over: `over ${WEEKLY_SETS_BAND.max}`,
};

/**
 * "Chest · 12 sets · in range", "Hamstrings · 4.5 sets · under 8", "Back · 26 sets · over 24". Shoulders say what
 * their figure counts (R189): "Shoulders · 6 sets, front delts count half · under 8", "Shoulders · 26 side and rear
 * sets · over 24".
 */
export function groupWeekText(g: GroupWeek): string {
  const noun = g.sets === 1 ? 'set' : 'sets';
  let count = `${g.sets} ${noun}`;
  if (g.group === 'shoulders') count = g.status === 'over' ? `${g.sets} side and rear ${noun}` : `${count}, front delts count half`;
  return `${GROUP_LABELS[g.group]} · ${count} · ${STATUS_TEXT[g.status]}`;
}

export type SessionsSummary = { thisWeek: number; lastWeek: number; average: number | null; averageWeeks: number };

/**
 * Sessions (R177) from one local date per finished workout: this week (Monday of `today` to `today`), last week (the
 * Monday–Sunday before), and the average a week over the full weeks before this one since the week of the first
 * workout, at most `weeks`, to one decimal. No average under 2 such weeks.
 */
export function sessionsSummary(workoutDates: readonly string[], today: string, weeks = 8): SessionsSummary {
  const thisMonday = mondayOf(today);
  const lastMonday = shiftDay(thisMonday, -7);
  const between = (from: string, to: string) => workoutDates.filter((d) => d >= from && d <= to).length;

  let first: string | null = null;
  for (const d of workoutDates) if (first === null || d < first) first = d;
  const fullWeeks = first === null ? 0 : Math.max(0, Math.floor(daysBetween(mondayOf(first), thisMonday) / 7));
  const averageWeeks = Math.min(weeks, fullWeeks);
  const average =
    averageWeeks < 2 ? null : oneDecimal(between(shiftDay(thisMonday, -7 * averageWeeks), shiftDay(thisMonday, -1)) / averageWeeks);

  return {
    thisWeek: between(thisMonday, today),
    lastWeek: between(lastMonday, shiftDay(thisMonday, -1)),
    average,
    averageWeeks,
  };
}

/** "3 this week · 4 last week · 3.4 a week over 8 weeks"; no average part when there is none. */
export function sessionsText(s: SessionsSummary): string {
  const base = `${s.thisWeek} this week · ${s.lastWeek} last week`;
  return s.average === null ? base : `${base} · ${s.average} a week over ${s.averageWeeks} weeks`;
}

export type BodyweightTrend = { change: number; perWeek: number };

/** The average of the daily points dated `from` to `to`, inclusive; null with none. */
export function averageOfDays(points: readonly SeriesPoint[], from: string, to: string): number | null {
  const inWindow = points.filter((p) => p.localDate >= from && p.localDate <= to);
  if (inWindow.length === 0) return null;
  return inWindow.reduce((sum, p) => sum + p.value, 0) / inWindow.length;
}

/**
 * The bodyweight trend (R179) from daily points in the display unit: the average of the last 7 days (today included)
 * minus the average of the 7 days from 34 to 28 days ago; `perWeek` is that over 4. Null when either window is empty.
 */
export function bodyweightTrend(daily: readonly SeriesPoint[], today: string): BodyweightTrend | null {
  const recent = averageOfDays(daily, shiftDay(today, -6), today);
  const earlier = averageOfDays(daily, shiftDay(today, -34), shiftDay(today, -28));
  if (recent === null || earlier === null) return null;
  const change = recent - earlier;
  return { change, perWeek: change / 4 };
}

/** One decimal, or two when one would round to 0 ("about 0.04 kg a week"). */
function amount(n: number): number {
  const a = Math.abs(n);
  const one = oneDecimal(a);
  return one > 0 ? one : Math.round(a * 100) / 100;
}

/**
 * "Down 1.2 kg in 4 weeks, about 0.3 kg a week.", "Up 0.5 lb in 4 weeks, about 0.1 lb a week.", "Steady over 4
 * weeks." (when the change shown rounds to 0), or, with no trend, "Log your weight a few times a week to see a trend."
 */
export function trendText(t: BodyweightTrend | null, unit: WeightUnit): string {
  if (t === null) return 'Log your weight a few times a week to see a trend.';
  if (oneDecimal(Math.abs(t.change)) === 0) return 'Steady over 4 weeks.';
  const direction = t.change < 0 ? 'Down' : 'Up';
  return `${direction} ${amount(t.change)} ${unit} in 4 weeks, about ${amount(t.perWeek)} ${unit} a week.`;
}

export type CheckIn = {
  /** Monday of the week reviewed: the Monday–Sunday before this week. */
  weekStart: string;
  sessions: number;
  hardSets: number;
  /** Volume in the display unit, a whole number. */
  volume: number;
  prs: number;
  /** The average of that week's daily bodyweight values in the display unit; null with none. */
  bodyweightAverage: number | null;
  /** That average minus the week before's; null when either week has no value. */
  bodyweightChange: number | null;
  under: MajorGroup[];
  over: MajorGroup[];
};

/** This week's three check-in items (R180): true when done (an entry dated Monday to today). */
export type CheckInTodo = { bodyweight: boolean; waist: boolean; photo: boolean };
