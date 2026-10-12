import { daysBetween } from './dates';

/**
 * Train's line under the greeting (§18.22, R530): one short motivational line a day. The owner asked for it after
 * Round 8, which replaces PRODUCT.md's earlier "no motivational quotes". The lines are GymHound's own, in its voice:
 * plain, short, about showing up and the work, never about pain, punishment or bodies; no flames, skulls or slogans in
 * capitals, and no names put to words someone may never have said.
 */
export const QUOTES: readonly string[] = [
  'Show up today. The weight will meet you there.',
  'Small jumps, every week, add up to a lot.',
  'The best workout is the one you start.',
  'Strong is built one set at a time.',
  "Today's warmup is tomorrow's working weight.",
  'Consistency beats intensity you can only manage once.',
  'Log it. Next time will thank you.',
  "You don't have to feel ready. You have to begin.",
  'Good form today, more weight later.',
  'Rest is part of the plan, not a break from it.',
  'One more good rep is still progress.',
  "Train for the person you'll be next year.",
  'A slow week is still a week you showed up.',
  'Hard days count. So do easy ones.',
  "The bar doesn't care about your mood. Lift it anyway.",
  'Progress hides in the boring weeks.',
  "Do the sets you planned. That's the whole secret.",
  'Strength is patience you can measure.',
  "Every rep is a vote for who you're becoming.",
  'You beat last time by showing up this time.',
  'Start light. Finish strong.',
  'Your future self is watching this set.',
  'The plan works if you work the plan.',
  'Missed a day? The next set is still yours.',
  'Earn the weight, then add it.',
  'Breathe, brace, lift.',
  'Quiet focus moves heavy things.',
  'Steady beats fast, every time.',
  'Little by little, then all at once.',
  'Lift today so carrying things is easy later.',
  'The hardest part is the walk to the bar.',
  "Make today's workout a good one, not a perfect one.",
  'Your only competition is your last workout.',
  'Grip it, own it, move it.',
  "Write it down and you'll know it worked.",
  'Show up tired. Leave proud.',
  'Strength grows between workouts. Sleep well.',
  'Eat, train, sleep, repeat.',
  'Good habits are heavy lifting for your future.',
  "One workout won't change you. Fifty will.",
  'Be the person who finishes the plan.',
  'The weight is the same every day. You are not.',
  'Effort today, results soon.',
  'Two minutes of rest, one more good set.',
  'Your pace is the right pace.',
  'Count the sets, not the excuses.',
  'Better than yesterday is plenty.',
  'Strong backs carry more than weight.',
  'Train the lift, trust the process.',
  'Finish the set you started.',
  'Clean reps beat heavy mistakes.',
  'Make the next rep your best rep.',
  'Showing up is a skill. Practise it.',
  'Big goals, small steps.',
  'Today is a good day to add a little.',
  'Nobody gets strong by accident.',
  "Trust the work you've already done.",
  'A plan on paper becomes strength in your hands.',
  "Don't chase perfect. Chase consistent.",
  'Hold the line on a hard day: the weight holds too.',
  'Stronger, one honest set at a time.',
  'Your body keeps the score. Give it good numbers.',
  'Lift with intent. Rest with purpose.',
  'Every PR started as a warmup.',
  "Be patient with the bar. It moves when you're ready.",
  "Today's effort is the only one you can spend.",
  'Get under it. Get after it.',
  'Keep the promise you made to yourself.',
  'Discipline is choosing what you want most.',
  'Momentum starts with the first set.',
  "Strong isn't a size. It's a habit.",
  "You're one workout closer than yesterday.",
  'Do it well, then do it again.',
  'The work is simple. Doing it is the hard part.',
  'Respect the warmup. It respects you back.',
  'Show the bar who showed up.',
  'Progress, not perfection.',
  'Steady reps build strong years.',
  'Today counts.',
  'One set at a time is how mountains move.',
  'Train hard, recover harder.',
  'Your best lifts are ahead of you.',
  'Be the reason the plan works.',
  'Good sessions are built from ordinary sets.',
  'When in doubt, do the warmup and see.',
  'Earned, not given.',
  'The habit is the program.',
  'Strength is a long game. Keep playing.',
  'A good day in the gym is a good day.',
  'Come back next time a little stronger.',
];

/**
 * The line for a local date (YYYY-MM-DD): the same all day, a new one at midnight. Days step through the list by a
 * stride that shares no factor with its length, so every line comes up once before any comes up again, and two days
 * in a row are never neighbours in the list.
 */
export function quoteFor(localDate: string): string {
  const n = QUOTES.length;
  const day = daysBetween('2026-01-01', localDate);
  const stride = strideFor(n);
  return QUOTES[(((day * stride) % n) + n) % n];
}

/** The first stride from 37 up that shares no factor with `n`. */
function strideFor(n: number): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let s = 37;
  while (gcd(s, n) !== 1) s++;
  return s % n === 0 ? 1 : s;
}
