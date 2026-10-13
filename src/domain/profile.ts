import { fromLocalDate, mondayOf, shiftDay } from './dates';

/** The widgets the Profile's dashboard can hold (R567). */
export type WidgetId = 'workouts_per_week' | 'daily_macros' | 'body_weight';

export type WidgetInfo = {
  id: WidgetId;
  title: string;
  /** The muted word over the title, as Strong groups them: what the widget reads from. */
  group: 'Activity' | 'Nutrition' | 'Body';
  /** Part of GymHound Pro: Daily macros reads Fuel, which is Pro (§9). */
  pro: boolean;
  /** One line in the + Widget sheet. */
  about: string;
};

export const WIDGETS: readonly WidgetInfo[] = [
  { id: 'workouts_per_week', title: 'Workouts per week', group: 'Activity', pro: false, about: 'The last 8 weeks, and your weekly goal if you set one.' },
  { id: 'daily_macros', title: 'Daily macros', group: 'Nutrition', pro: true, about: "Today's calories, protein, carbs and fat against your targets." },
  { id: 'body_weight', title: 'Body weight', group: 'Body', pro: false, about: 'Your latest weigh-in and the last 90 days.' },
];

/** A new profile's dashboard: the week's training, and the day's food (Pro; a free lifter sees what it would show). */
export const DEFAULT_WIDGETS: readonly WidgetId[] = ['workouts_per_week', 'daily_macros'];

export const widgetInfo = (id: WidgetId): WidgetInfo => WIDGETS.find((w) => w.id === id)!;

/** The dashboard's widgets from what was stored: known ids only, each once, in their order. Anything else gives the default. */
export function dashboardWidgets(stored: unknown): WidgetId[] {
  if (!Array.isArray(stored)) return [...DEFAULT_WIDGETS];
  const known = new Set<string>(WIDGETS.map((w) => w.id));
  const out: WidgetId[] = [];
  for (const id of stored) if (typeof id === 'string' && known.has(id) && !out.includes(id as WidgetId)) out.push(id as WidgetId);
  return out;
}

/** The list with `id` moved one place up (-1) or down (1). At the end it stays where it is. */
export function moveWidget(list: readonly WidgetId[], id: WidgetId, by: -1 | 1): WidgetId[] {
  const out = [...list];
  const at = out.indexOf(id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= out.length) return out;
  [out[at], out[to]] = [out[to], out[at]];
  return out;
}

/** The longest name and goal the profile keeps. */
export const NAME_MAX = 40;
export const GOAL_MAX = 140;

/** A name or goal as kept: no space at either end, runs of spaces and line breaks as one space, at most `max` characters. */
export function tidyProfileText(text: string, max: number): string {
  return Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
}

/** Up to two initials for the photo's stand-in: "Eddie Alwan" is "EA", "eddie" is "E", no name is "". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w));
  const first = (w: string) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ''))[0] ?? '';
  if (words.length === 0) return '';
  const letters = words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
  return letters.toLocaleUpperCase();
}

/** "1 workout", "119 workouts", with the phone's separators. */
export function workoutCountText(count: number, locale?: string): string {
  return `${count.toLocaleString(locale)} ${count === 1 ? 'workout' : 'workouts'}`;
}

export type WeekCount = { weekStart: string; count: number };

/**
 * Finished workouts in each of the last `weeks` weeks, oldest first, this week last (R567). Weeks start on Monday, as
 * Stats' week does. `dates` are the workouts' local dates, one per workout.
 */
export function workoutsPerWeek(dates: readonly string[], today: string, weeks = 8): WeekCount[] {
  const thisWeek = mondayOf(today);
  const out: WeekCount[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ weekStart: shiftDay(thisWeek, -7 * i), count: 0 });
  const first = out[0].weekStart;
  for (const date of dates) {
    if (date < first || date > shiftDay(thisWeek, 6)) continue;
    const week = out.find((w) => w.weekStart === mondayOf(date));
    if (week) week.count += 1;
  }
  return out;
}

/** The weekly goals the widget offers: once to seven times a week. */
export const WEEKLY_GOALS = [1, 2, 3, 4, 5, 6, 7] as const;

/** A week's label under its bar, as Strong writes them: the Monday, month and day the phone's way ("8/24", "24/08"). */
export function weekLabel(weekStart: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(fromLocalDate(weekStart));
}

/** The week as VoiceOver says it: "week of August 24". */
export function weekSpoken(weekStart: string, locale: string): string {
  return `week of ${new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(fromLocalDate(weekStart))}`;
}
