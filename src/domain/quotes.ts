import { daysBetween } from './dates';

/** A quote and the person it comes from ("Japanese proverb" or "Proverb" when it has no one person). */
export type Quote = { text: string; by: string };

/**
 * Train's line under the greeting (§18.22, R530, R541): one quote a day, with who said it. The owner asked for real
 * quotes after Round 9: Stoic, training, sport and motivation, named where the source is known. Only quotes whose source
 * is well documented are here; the many that are usually pinned on the wrong person ("excellence is a habit" is Will
 * Durant summing up Aristotle, not Aristotle) are left out or put to the right name. Translations are the common ones.
 * Straight apostrophes and quotation marks, as everywhere in GymHound.
 */
export const QUOTES: readonly Quote[] = [
  { text: 'It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.', by: 'Seneca' },
  { text: 'While we are postponing, life speeds by.', by: 'Seneca' },
  { text: 'We suffer more often in imagination than in reality.', by: 'Seneca' },
  { text: 'Begin at once to live.', by: 'Seneca' },
  { text: 'If a man knows not to which port he sails, no wind is favorable.', by: 'Seneca' },
  { text: "Lay hold of today's task, and you will not need to depend so much upon tomorrow's.", by: 'Seneca' },
  { text: 'Sometimes even to live is an act of courage.', by: 'Seneca' },
  { text: 'As long as you live, keep learning how to live.', by: 'Seneca' },
  { text: 'It is a rough road that leads to the heights of greatness.', by: 'Seneca' },
  { text: 'The impediment to action advances action. What stands in the way becomes the way.', by: 'Marcus Aurelius' },
  { text: 'Waste no more time arguing about what a good man should be. Be one.', by: 'Marcus Aurelius' },
  { text: 'Very little is needed to make a happy life.', by: 'Marcus Aurelius' },
  { text: 'Do every act of your life as though it were the very last act of your life.', by: 'Marcus Aurelius' },
  { text: 'Confine yourself to the present.', by: 'Marcus Aurelius' },
  { text: 'First say to yourself what you would be; and then do what you have to do.', by: 'Epictetus' },
  { text: 'No great thing is created suddenly.', by: 'Epictetus' },
  { text: 'Every habit and faculty is maintained and increased by the corresponding actions.', by: 'Epictetus' },
  { text: 'If you want to improve, be content to be thought foolish and stupid.', by: 'Epictetus' },
  { text: 'No man is free who is not master of himself.', by: 'Epictetus' },
  { text: 'Men are disturbed not by things, but by the views which they take of things.', by: 'Epictetus' },
  { text: 'Practice yourself in little things, and then proceed to greater.', by: 'Epictetus' },
  { text: 'The first and best victory is to conquer self.', by: 'Plato' },
  { text: 'It is a shame for a man to grow old without seeing the beauty and strength of which his body is capable.', by: 'Socrates' },
  { text: 'The journey of a thousand miles begins with one step.', by: 'Lao Tzu' },
  { text: 'Mastering others is strength. Mastering yourself is true power.', by: 'Lao Tzu' },
  { text: 'Well begun is half done.', by: 'Aristotle' },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', by: 'Will Durant' },
  { text: 'Dripping water hollows out stone.', by: 'Ovid' },
  { text: 'Life grants nothing to us mortals without hard work.', by: 'Horace' },
  { text: 'They can because they think they can.', by: 'Virgil' },
  { text: 'Slow but steady wins the race.', by: 'Aesop' },
  { text: 'Well done is better than well said.', by: 'Benjamin Franklin' },
  { text: 'If there is no struggle, there is no progress.', by: 'Frederick Douglass' },
  { text: 'What does not kill me makes me stronger.', by: 'Friedrich Nietzsche' },
  { text: 'Character cannot be developed in ease and quiet.', by: 'Helen Keller' },
  { text: 'Fall seven times, stand up eight.', by: 'Japanese proverb' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', by: 'Proverb' },
  { text: 'Far and away the best prize that life offers is the chance to work hard at work worth doing.', by: 'Theodore Roosevelt' },
  { text: 'Do not pray for easy lives. Pray to be stronger men.', by: 'Phillips Brooks' },
  { text: 'It is not the mountain we conquer, but ourselves.', by: 'Edmund Hillary' },
  { text: `I hated every minute of training, but I said, "Don't quit. Suffer now and live the rest of your life as a champion."`, by: 'Muhammad Ali' },
  { text: 'The last three or four reps is what makes the muscle grow.', by: 'Arnold Schwarzenegger' },
  { text: 'The mind is the limit. As long as the mind can envision the fact that you can do something, you can do it.', by: 'Arnold Schwarzenegger' },
  { text: "I've failed over and over and over again in my life. And that is why I succeed.", by: 'Michael Jordan' },
  { text: "You miss 100% of the shots you don't take.", by: 'Wayne Gretzky' },
  { text: 'There are no limits. There are only plateaus, and you must not stay there, you must go beyond them.', by: 'Bruce Lee' },
  { text: 'Discipline is the bridge between goals and accomplishment.', by: 'Jim Rohn' },
  { text: 'Motivation is what gets you started. Habit is what keeps you going.', by: 'Jim Ryun' },
  { text: "Gold medals aren't really made of gold. They're made of sweat, determination, and a hard-to-find alloy called guts.", by: 'Dan Gable' },
  { text: 'To give anything less than your best is to sacrifice the gift.', by: 'Steve Prefontaine' },
  { text: 'If you want to win something, run 100 meters. If you want to experience something, run a marathon.', by: 'Emil Zátopek' },
  { text: 'Only the disciplined ones in life are free. If you are undisciplined, you are a slave to your moods and your passions.', by: 'Eliud Kipchoge' },
  { text: 'No human is limited.', by: 'Eliud Kipchoge' },
  { text: 'Discipline is doing what you hate to do, but doing it like you love it.', by: 'Mike Tyson' },
  { text: "Don't let what you cannot do interfere with what you can do.", by: 'John Wooden' },
  { text: 'Little things make big things happen.', by: 'John Wooden' },
  { text: 'The Iron never lies to you.', by: 'Henry Rollins' },
  { text: "Stimulate, don't annihilate.", by: 'Lee Haney' },
  { text: "Exercise is king. Nutrition is queen. Put them together and you've got a kingdom.", by: 'Jack LaLanne' },
  { text: 'Start where you are. Use what you have. Do what you can.', by: 'Arthur Ashe' },
  { text: 'Champions keep playing until they get it right.', by: 'Billie Jean King' },
  { text: 'I trained four years to run nine seconds.', by: 'Usain Bolt' },
  { text: 'Discipline equals freedom.', by: 'Jocko Willink' },
  { text: "Don't count on motivation. Count on discipline.", by: 'Jocko Willink' },
  { text: "It ain't about how hard you hit. It's about how hard you can get hit and keep moving forward.", by: 'Rocky Balboa' },
  { text: 'If you have a body, you are an athlete.', by: 'Bill Bowerman' },
  { text: `Whoever said, "It's not whether you win or lose that counts," probably lost.`, by: 'Martina Navratilova' },
  { text: "Hard work beats talent when talent doesn't work hard.", by: 'Tim Notke' },
  { text: 'Practice does not make perfect. Only perfect practice makes perfect.', by: 'Vince Lombardi' },
  { text: 'The man who can drive himself further once the effort gets painful is the man who will win.', by: 'Roger Bannister' },
  { text: 'You are in danger of living a life so comfortable and soft that you will die without ever realizing your true potential.', by: 'David Goggins' },
  { text: "People often say that motivation doesn't last. Well, neither does bathing. That's why we recommend it daily.", by: 'Zig Ziglar' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', by: 'James Clear' },
  { text: 'Every action you take is a vote for the type of person you wish to become.', by: 'James Clear' },
  { text: 'Strong people are harder to kill than weak people, and more useful in general.', by: 'Mark Rippetoe' },
  { text: 'Baseball is ninety percent mental and the other half is physical.', by: 'Yogi Berra' },
];

/**
 * The quote for a local date (YYYY-MM-DD): the same all day, a new one at midnight. Days step through the list by a
 * stride that shares no factor with its length, so every quote comes up once before any comes up again, and two days
 * in a row are never neighbours in the list.
 */
export function quoteFor(localDate: string): Quote {
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
