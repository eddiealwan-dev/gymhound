import { daysBetween } from './dates';

/** A quote and the person it comes from ("Japanese proverb" or "Proverb" when it has no one person). */
export type Quote = { text: string; by: string };

/**
 * Train's line under the greeting (§18.22, R530, R541, R564): one quote a day, with who said it. The owner asked for
 * real quotes after Round 9 (Stoic, training, sport and motivation, named where the source is known), and after Round
 * 11 dropped seven of the first 76 and asked for 200 in all: Stoic, strength, discipline, coaching and athletes. Only quotes whose source
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
  { text: 'Well done is better than well said.', by: 'Benjamin Franklin' },
  { text: 'If there is no struggle, there is no progress.', by: 'Frederick Douglass' },
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
  { text: 'There are no limits. There are only plateaus, and you must not stay there, you must go beyond them.', by: 'Bruce Lee' },
  { text: 'Discipline is the bridge between goals and accomplishment.', by: 'Jim Rohn' },
  { text: 'Motivation is what gets you started. Habit is what keeps you going.', by: 'Jim Ryun' },
  { text: "Gold medals aren't really made of gold. They're made of sweat, determination, and a hard-to-find alloy called guts.", by: 'Dan Gable' },
  { text: 'To give anything less than your best is to sacrifice the gift.', by: 'Steve Prefontaine' },
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
  { text: "Hard work beats talent when talent doesn't work hard.", by: 'Tim Notke' },
  { text: 'Practice does not make perfect. Only perfect practice makes perfect.', by: 'Vince Lombardi' },
  { text: 'The man who can drive himself further once the effort gets painful is the man who will win.', by: 'Roger Bannister' },
  { text: 'You are in danger of living a life so comfortable and soft that you will die without ever realizing your true potential.', by: 'David Goggins' },
  { text: "People often say that motivation doesn't last. Well, neither does bathing. That's why we recommend it daily.", by: 'Zig Ziglar' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', by: 'James Clear' },
  { text: 'Every action you take is a vote for the type of person you wish to become.', by: 'James Clear' },
  { text: 'Strong people are harder to kill than weak people, and more useful in general.', by: 'Mark Rippetoe' },
  // Round 11: stoic and classical.
  { text: 'It is more important for you to keep the resolutions you have already made than to go on and make noble ones.', by: 'Seneca' },
  { text: 'Men endure with greater courage, when they have once become accustomed to them, the things which they had at first regarded as hardships.', by: 'Seneca' },
  { text: 'Is it for this purpose that we are strong, that we may have light burdens to bear?', by: 'Seneca' },
  { text: 'The burden should be suited to your strength, nor should you tackle more than you can adequately handle.', by: 'Seneca' },
  { text: 'Skilled wrestlers are kept up to the mark by practice; a musician is stirred to action by one of equal proficiency.', by: 'Seneca' },
  { text: 'All his adversities he counts mere training.', by: 'Seneca' },
  { text: 'Not what you endure, but how you endure, is important.', by: 'Seneca' },
  { text: 'The staunchest member of the body is the one that is kept in constant use.', by: 'Seneca' },
  { text: 'No tree becomes rooted and sturdy unless many a wind assails it.', by: 'Seneca' },
  { text: "Men's minds ought to have relaxation: they rise up better and more vigorous after rest.", by: 'Seneca' },
  { text: 'In the morning when thou risest unwillingly, let this thought be present: I am rising to the work of a human being.', by: 'Marcus Aurelius' },
  { text: 'Practise thyself even in the things which thou despairest of accomplishing.', by: 'Marcus Aurelius' },
  { text: 'Be like the promontory against which the waves continually break, but it stands firm and tames the fury of the water around it.', by: 'Marcus Aurelius' },
  { text: "The art of life is more like the wrestler's art than the dancer's.", by: 'Marcus Aurelius' },
  { text: 'I shall never be a Milo, and yet I do not neglect my body.', by: 'Epictetus' },
  { text: 'When a difficulty falls upon you, remember that God, like a trainer of wrestlers, has matched you with a rough young man.', by: 'Epictetus' },
  { text: 'It was for this that I exercised myself, for this I disciplined myself.', by: 'Epictetus' },
  { text: 'The exercise master does right when he says: "Raise him up with both hands, and the heavier he is, so much the more is my advantage."', by: 'Epictetus' },
  { text: 'You have to submit to discipline, follow a strict diet, give up sweet cakes, train under compulsion, at a fixed hour, in heat or in cold.', by: 'Epictetus' },
  { text: 'Remember that now is the contest, and here before you are the Olympic games, and that it is impossible to delay any longer.', by: 'Epictetus' },
  { text: 'If you accomplish something good with hard work, the labor passes quickly, but the good endures.', by: 'Musonius Rufus' },
  { text: 'Although understanding the theory behind the action enables one to speak, it is practice that enables one to act.', by: 'Musonius Rufus' },
  { text: 'Strength is produced by taking much food and undergoing much exertion.', by: 'Aristotle' },
  { text: 'Strength is destroyed both by excessive and by deficient exercises.', by: 'Aristotle' },
  { text: 'In the Olympic Games it is not the most beautiful and the strongest that are crowned but those who compete.', by: 'Aristotle' },
  { text: 'By nature, men are nearly alike; by practice, they get to be wide apart.', by: 'Confucius' },
  { text: 'Those whose strength is insufficient give over in the middle of the way but now you limit yourself.', by: 'Confucius' },
  { text: 'Desire to have things done quickly prevents their being done thoroughly.', by: 'Confucius' },
  { text: 'The mechanic, who wishes to do his work well, must first sharpen his tools.', by: 'Confucius' },
  { text: 'People in their conduct of affairs are constantly ruining them when they are on the eve of success.', by: 'Lao Tzu' },
  { text: 'Fear never advanced any man to the highest standing.', by: 'Publilius Syrus' },
  { text: "Exercise and temperance can preserve even in old age something of one's pristine vigor.", by: 'Cicero' },
  { text: 'It is sickness that makes health pleasant and good; hunger, plenty; weariness, rest.', by: 'Heraclitus' },
  { text: 'Without an adversary, prowess shrivels.', by: 'Seneca' },
  { text: 'No prizefighter can go with high spirits into the strife if he has never been beaten black and blue.', by: 'Seneca' },
  { text: 'If you would make anything a habit, do it; if you would not make it a habit, do not do it.', by: 'Epictetus' },
  { text: 'We become just by doing just acts, temperate by doing temperate acts, brave by doing brave acts.', by: 'Aristotle' },
  { text: 'It is not that we have a short space of time, but that we waste much of it.', by: 'Seneca' },
  { text: 'One swallow does not make a summer, nor does one day.', by: 'Aristotle' },
  { text: 'Such as are thy habitual thoughts, such also will be the character of thy mind; for the soul is dyed by the thoughts.', by: 'Marcus Aurelius' },
  { text: 'Everywhere means nowhere.', by: 'Seneca' },
  { text: 'The will of even a common man cannot be taken from him.', by: 'Confucius' },
  { text: 'Pain is slight if opinion has added nothing to it.', by: 'Seneca' },
  // Round 11: strength and lifting.
  { text: 'Friends may come and go. But two hundred pounds is always two hundred pounds.', by: 'Henry Rollins' },
  { text: 'The Iron is the best antidepressant I have ever found. There is no better way to fight weakness than with strength.', by: 'Henry Rollins' },
  { text: 'Physical strength is the most important thing in life. This is true whether we want it to be or not.', by: 'Mark Rippetoe' },
  { text: 'The goal is to keep the goal the goal.', by: 'Dan John' },
  { text: 'The problem is yes, everything works. Doing everything at once makes you marginal at everything... at best.', by: 'Dan John' },
  { text: 'When things go wrong, simplify.', by: 'Dan John' },
  { text: 'Absolute strength is the glass. Everything else is the liquid inside the glass. The bigger the glass, the more of everything else you can do.', by: 'Dan John' },
  { text: 'Strength has a greater purpose.', by: 'Pavel Tsatsouline' },
  { text: "If you don't find the time, if you don't do the work, you don't get the results.", by: 'Arnold Schwarzenegger' },
  { text: 'Training gives us an outlet for suppressed energies created by stress and thus tones the spirit just as exercise conditions the body.', by: 'Arnold Schwarzenegger' },
  { text: 'What I learned is that we are always stronger than we know.', by: 'Arnold Schwarzenegger' },
  { text: "The only way you can hurt the body is not use it. Inactivity is the killer and, remember, it's never too late.", by: 'Jack LaLanne' },
  { text: 'Physical fitness is the first requisite of happiness.', by: 'Joseph Pilates' },
  { text: 'Without strength—and by strength I mean health, vitality, and a general sense of physical well-being—life is but a gloomy business.', by: 'Eugen Sandow' },
  { text: 'But strength is a most greedy mistress. You can never get enough.', by: 'Bill Starr' },
  // Round 11: coaches.
  { text: "Be quick, but don't hurry.", by: 'John Wooden' },
  { text: 'Make each day your masterpiece.', by: 'John Wooden' },
  { text: 'When you improve a little each day, eventually big things occur.', by: 'John Wooden' },
  { text: "Champions behave like champions before they're champions; they have a winning standard of performance before they are winners.", by: 'Bill Walsh' },
  { text: 'The culture precedes positive results.', by: 'Bill Walsh' },
  { text: "That's all training is. Stress. Recover. Improve.", by: 'Bill Bowerman' },
  { text: 'The vision of a champion is someone who is bent over, drenched in sweat, at the point of exhaustion, when no one else is watching.', by: 'Anson Dorrance' },
  { text: "Train, don't strain.", by: 'Arthur Lydiard' },
  { text: 'Karate is like boiling water; without heat, it returns to its tepid state.', by: 'Gichin Funakoshi' },
  { text: 'Strength is a skill.', by: 'Pavel Tsatsouline' },
  { text: 'Discipline yourself so no one else has to.', by: 'Pat Summitt' },
  { text: "You don't win once in a while; you don't do things right once in a while; you do them right all the time.", by: 'Vince Lombardi' },
  { text: 'Excellence is the gradual result of always wanting to do better.', by: 'Pat Riley' },
  { text: 'Champions are champions not because they do anything extraordinary but because they do the ordinary things better than anyone else.', by: 'Chuck Noll' },
  { text: 'No excuses, no explanations.', by: 'Tony Dungy' },
  { text: "Respond to adversity; don't react.", by: 'Tony Dungy' },
  { text: 'Your talent determines what you can do. Your motivation determines how much you are willing to do. Your attitude determines how well you do it.', by: 'Lou Holtz' },
  { text: 'Play hard; play together; play smart.', by: 'Dean Smith' },
  { text: 'Do today all you reasonably can—in your training, your affairs. Do not attempt to see the end of the road.', by: 'Percy Cerutty' },
  { text: "Winning isn't about doing one thing 100% better but about doing 100 things 1% better.", by: 'Clive Woodward' },
  { text: 'Do not dwell on the negative; try to find positives in all training sessions.', by: 'Jack Daniels' },
  { text: 'Success is peace of mind which is a direct result of self-satisfaction in knowing you made the effort to become the best of which you are capable.', by: 'John Wooden' },
  // Round 11: athletes.
  { text: 'The truth is, I had to work very hard to make it look easy.', by: 'Roger Federer' },
  { text: "Most of the time, it's not about having a gift. It's about having grit.", by: 'Roger Federer' },
  { text: 'Pressure is a privilege.', by: 'Billie Jean King' },
  { text: "Athletics is not so much about the legs, it's about the heart and mind.", by: 'Eliud Kipchoge' },
  { text: 'Make discipline your lifestyle.', by: 'Eliud Kipchoge' },
  { text: "When you hit the water, the water doesn't know what age you are.", by: 'Dara Torres' },
  { text: "Set your bar high and don't be afraid to set goals that seem unrealistic at first or seem impossible.", by: 'Katie Ledecky' },
  { text: 'If you say "can\'t" you\'re restricting what you can do or ever will do.', by: 'Michael Phelps' },
  { text: 'My motto was always to keep swinging.', by: 'Hank Aaron' },
  { text: 'I really think a champion is defined not by their wins but by how they can recover when they fall.', by: 'Serena Williams' },
  { text: 'Make failure your fuel.', by: 'Abby Wambach' },
  { text: "I can accept failure, everyone fails at something. But I can't accept not trying.", by: 'Michael Jordan' },
  { text: 'Absorb what is useful, discard what is useless, and add what is specifically your own.', by: 'Bruce Lee' },
  // Round 11: discipline and character.
  { text: 'It is hard to fail, but it is worse never to have tried to succeed. In this life we get nothing save by effort.', by: 'Theodore Roosevelt' },
  { text: 'I wish to preach, not the doctrine of ignoble ease, but the doctrine of the strenuous life, the life of toil and effort, of labor and strife.', by: 'Theodore Roosevelt' },
  { text: 'The credit belongs to the man who is actually in the arena, whose face is marred by dust and sweat and blood.', by: 'Theodore Roosevelt' },
  { text: 'Opportunity is important but exertion is indispensable.', by: 'Frederick Douglass' },
  { text: 'Trust thyself: every heart vibrates to that iron string.', by: 'Ralph Waldo Emerson' },
  { text: 'Our strength grows out of our weakness.', by: 'Ralph Waldo Emerson' },
  { text: 'The characteristic of a genuine heroism is its persistency.', by: 'Ralph Waldo Emerson' },
  { text: 'I know of no more encouraging fact than the unquestionable ability of man to elevate his life by a conscious endeavor.', by: 'Henry David Thoreau' },
  { text: 'If you have built castles in the air, your work need not be lost; that is where they should be. Now put the foundations under them.', by: 'Henry David Thoreau' },
  { text: 'We are all sculptors and painters, and our material is our own flesh and blood and bones.', by: 'Henry David Thoreau' },
  { text: 'Not being able to govern events, I govern myself, and apply myself to them, if they will not apply themselves to me.', by: 'Michel de Montaigne' },
  { text: 'Great works are performed not by strength, but perseverance.', by: 'Samuel Johnson' },
  { text: 'He that shall walk with vigour three hours a day will pass in seven years a space equal to the circumference of the globe.', by: 'Samuel Johnson' },
  { text: 'Few things are impossible to diligence and skill.', by: 'Samuel Johnson' },
  { text: 'Keep the faculty of effort alive in you by a little gratuitous exercise every day.', by: 'William James' },
  { text: 'Never suffer an exception to occur till the new habit is securely rooted in your life.', by: 'William James' },
  { text: 'Compared with what we ought to be, we are only half awake.', by: 'William James' },
  { text: 'When we are no longer able to change a situation ... we are challenged to change ourselves.', by: 'Viktor Frankl' },
  { text: 'Throughout your life advance daily, becoming more skillful than yesterday, more skillful than today. This is never-ending.', by: 'Yamamoto Tsunetomo' },
  { text: 'If you want to change the world, start off by making your bed.', by: 'William H. McRaven' },
  { text: "If you want to change the world, don't ever, ever ring the bell.", by: 'William H. McRaven' },
  { text: 'Today is victory over yourself of yesterday; tomorrow is your victory over lesser men.', by: 'Miyamoto Musashi' },
  { text: 'Enthusiasm is common. Endurance is rare.', by: 'Angela Duckworth' },
  { text: "It's not what you preach, it's what you tolerate.", by: 'Jocko Willink and Leif Babin' },
  { text: 'Nothing ever comes to one, that is worth having, except as a result of hard work.', by: 'Booker T. Washington' },
  { text: 'Victory awaits him who has everything in order—luck, people call it.', by: 'Roald Amundsen' },
  { text: 'What saves a man is to take a step. Then another step. It is always the same step, but you have to take it.', by: 'Antoine de Saint-Exupéry' },
  { text: 'The world breaks every one and afterward many are strong at the broken places.', by: 'Ernest Hemingway' },
  { text: "The struggle itself toward the heights is enough to fill a man's heart. One must imagine Sisyphus happy.", by: 'Albert Camus' },
  { text: 'You gain strength, courage, and confidence by every experience in which you really stop to look fear in the face.', by: 'Eleanor Roosevelt' },
  { text: 'The harder the conflict, the more glorious the triumph.', by: 'Thomas Paine' },
  { text: 'Without haste, but without rest.', by: 'Johann Wolfgang von Goethe' },
  { text: 'Every noble work is at first impossible.', by: 'Thomas Carlyle' },
  { text: 'Optimism is true moral courage.', by: 'Ernest Shackleton' },
  { text: 'If you never push yourself beyond your comfort zone, you will never improve.', by: 'Anders Ericsson' },
  { text: 'Courage is reckoned the greatest of all virtues; because, unless a man has that virtue, he has no security for preserving any other.', by: 'Samuel Johnson' },
  { text: 'A strong body makes the mind strong.', by: 'Thomas Jefferson' },
  { text: 'Physical fitness is not only one of the most important keys to a healthy body, it is the basis of dynamic and creative intellectual activity.', by: 'John F. Kennedy' },
];

/** The day the passes through the list are counted from. */
const FIRST_DAY = '2026-01-01';

/** A small seeded random number generator (mulberry32): the same seed always gives the same numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One pass's order, shuffled from its number alone. */
function shuffled(pass: number, n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const random = seeded(Math.imul(pass + 1, 0x9e3779b1) ^ 0x5bd1e995);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const orders = new Map<number, number[]>();

/**
 * The order of the list's indexes for one pass through it (R564): shuffled, and a different order each pass. A pass
 * never opens with the quote the one before it ended on, so no quote shows two days running.
 */
export function quoteOrder(pass: number, n: number = QUOTES.length): number[] {
  const key = pass * 1000 + n;
  const known = orders.get(key);
  if (known) return known;
  const order = shuffled(pass, n);
  if (n > 2 && order[0] === shuffled(pass - 1, n)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  if (orders.size > 8) orders.clear();
  orders.set(key, order);
  return order;
}

/**
 * The quote for a local date (YYYY-MM-DD): the same all day, a new one at midnight. The days go through the whole list
 * in a random order (the owner's Round 11 request), then through it again in another, so a quote comes back only once
 * every quote has had its day.
 */
export function quoteFor(localDate: string): Quote {
  const n = QUOTES.length;
  const day = daysBetween(FIRST_DAY, localDate);
  const pass = Math.floor(day / n);
  return QUOTES[quoteOrder(pass, n)[day - pass * n]];
}
