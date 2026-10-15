import type { ImportedSet } from './importCsv';
import type { Equipment, LoggingType, Muscle } from './types';

/** What matching needs to know of an exercise in the library or of your own. */
export type MatchCandidate = { id: string; name: string; aliases: readonly string[]; equipment: Equipment; isCustom: boolean };

/** Short forms other apps use, written out the way the library names things. */
const SHORT_FORMS: [RegExp, string][] = [
  [/\bdbs?\b/g, 'dumbbell'],
  [/\bbbs?\b/g, 'barbell'],
  [/\bkbs?\b/g, 'kettlebell'],
  [/\bez[ -]?bar\b|\bez\b/g, 'ezbar'],
  [/\bohp\b/g, 'overhead press'],
  [/\brdls?\b/g, 'romanian deadlift'],
  [/\bsldl\b/g, 'stiff leg deadlift'],
  [/\bpull[ -]?ups?\b/g, 'pullup'],
  [/\bchin[ -]?ups?\b/g, 'chinup'],
  [/\bpush[ -]?ups?\b/g, 'pushup'],
  [/\bsit[ -]?ups?\b/g, 'situp'],
  [/\bpull[ -]?downs?\b/g, 'pulldown'],
  [/\bpush[ -]?downs?\b/g, 'pushdown'],
  [/\bdead[ -]?lifts?\b/g, 'deadlift'],
  [/\bsmith machine\b/g, 'smith'],
  [/&/g, ' and '],
];

/** Words naming the equipment, and the library's equipment each means. */
const EQUIPMENT_WORDS: Record<string, Equipment> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
  smith: 'machine',
  kettlebell: 'kettlebell',
  band: 'band',
  ezbar: 'ez_bar',
  bodyweight: 'bodyweight',
};

/** Words that only say where a lift is felt ("Bicep curl"): a file may add them where the library doesn't. */
const DESCRIPTIVE = new Set(['bicep', 'tricep', 'chest', 'shoulder', 'ab', 'abdominal', 'glute', 'quad', 'hamstring', 'calf', 'exercise', 'weighted', 'assisted']);

/** Words that name the usual version of a lift ("Barbell back squat" for a squat, "Flat bench press"): either side may add them. */
const USUAL = new Set(['back', 'flat', 'conventional', 'regular', 'traditional', 'standard']);

const STOP = new Set(['the', 'a', 'an', 'with', 'on', 'of', 'and', 'to', 'grip', 'normal']);

/** One word in its usual form: lower case, without a plural s ("presses" → "press", "curls" → "curl"). */
function word(w: string): string {
  if (/(sses|ches|shes|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** A name's words, written out and in their usual forms. Brackets count as words ("Bench Press (Barbell)"). */
export function nameWords(name: string): string[] {
  let text = name.toLowerCase().replace(/[()[\]]/g, ' ');
  for (const [from, to] of SHORT_FORMS) text = text.replace(from, to);
  return text
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && !STOP.has(w))
    .map(word);
}

const key = (words: readonly string[]) => [...new Set(words)].sort().join(' ');

/**
 * The exercise a name from another app means (R565), or null. An exact name or alias first, written out ("DB curl" is
 * "dumbbell curl"); then the same words in any order ("Bench Press (Barbell)" is "Barbell bench press"); then the same
 * lift where one name only adds the usual version's word ("Squat (Barbell)" is "Barbell back squat") or where the muscle
 * is felt ("Bicep curl (Dumbbell)" is "Dumbbell curl"). Equipment a file names must be the exercise's. When more than
 * one fits, the library's everyday staple wins, then the shortest name. Your own exercises count as well.
 */
export function matchExercise(name: string, candidates: readonly MatchCandidate[]): MatchCandidate | null {
  const words = nameWords(name);
  if (words.length === 0) return null;
  const wanted = key(words);
  const named = words.map((w) => EQUIPMENT_WORDS[w]).filter((e): e is Equipment => e !== undefined);
  // Apps tell cable and machine apart less carefully than the library does, so those two stand in for each other.
  const near = (e: Equipment) => (e === 'cable' || e === 'machine' ? ['cable', 'machine'] : [e]);
  const fits = (c: MatchCandidate) => named.length === 0 || named.some((e) => near(e).includes(c.equipment));
  const rank = (c: MatchCandidate) => [c.isCustom ? 0 : c.id.startsWith('fedb-') ? 2 : 1, c.name.length] as const;
  const best = (list: MatchCandidate[]) =>
    list.sort((a, b) => {
      const [ra, rb] = [rank(a), rank(b)];
      // Your own first (you named it), then the library's staples, then the rest; then the shortest name.
      return ra[0] - rb[0] || ra[1] - rb[1];
    })[0] ?? null;

  // 1. The same words as the name or an alias.
  const same = candidates.filter((c) => fits(c) && [c.name, ...c.aliases].some((n) => key(nameWords(n)) === wanted));
  if (same.length > 0) return best(same);

  // 2. The same lift: the words that matter agree both ways. The fewest extra words wins ("Crunch" is a crunch, not
  // a cable crunch), then as above.
  const mine = new Set(words);
  const core = words.filter((w) => !(w in EQUIPMENT_WORDS) && !DESCRIPTIVE.has(w) && !USUAL.has(w));
  if (core.length === 0) return null;
  const close: { c: MatchCandidate; extra: number }[] = [];
  for (const c of candidates) {
    if (!fits(c)) continue;
    let extra = Infinity;
    for (const n of [c.name, ...c.aliases]) {
      const theirs = nameWords(n);
      const set = new Set(theirs);
      const theirCore = theirs.filter((w) => !(w in EQUIPMENT_WORDS) && !USUAL.has(w) && !DESCRIPTIVE.has(w));
      if (core.every((w) => set.has(w)) && theirCore.every((w) => mine.has(w))) extra = Math.min(extra, theirs.filter((w) => !mine.has(w)).length);
    }
    if (extra < Infinity) close.push({ c, extra });
  }
  const fewest = Math.min(...close.map((x) => x.extra));
  return best(close.filter((x) => x.extra === fewest).map((x) => x.c));
}

/** Words in a name that say which muscle it works, for an exercise added as your own. */
const MUSCLE_WORDS: [RegExp, Muscle][] = [
  [/\b(curl|bicep|chin ?up|chinup)\b/, 'biceps'],
  [/\b(tricep|pushdown|skull|kickback|dip|close grip)\b/, 'triceps'],
  [/\b(leg curl|hamstring|nordic|good morning|romanian|stiff leg)\b/, 'hamstrings'],
  [/\b(squat|leg press|lunge|leg extension|step up|split)\b/, 'quads'],
  [/\b(deadlift|back extension|hyperextension)\b/, 'lower_back'],
  [/\b(hip thrust|glute|bridge|kickback)\b/, 'glutes'],
  [/\b(calf|calve)\b/, 'calves'],
  [/\b(bench|chest|fly|flye|pec|pushup|push up)\b/, 'chest'],
  [/\b(pulldown|pullup|pull up|lat)\b/, 'lats'],
  [/\b(row|rear delt|face pull)\b/, 'upper_back'],
  [/\b(lateral raise|side raise|upright row)\b/, 'side_delts'],
  [/\b(overhead|shoulder|military|arnold|front raise|press)\b/, 'front_delts'],
  [/\b(shrug|trap)\b/, 'traps'],
  [/\b(crunch|sit ?up|situp|plank|ab|leg raise|hollow|rollout|core)\b/, 'abs'],
  [/\b(oblique|russian twist|side bend|woodchop)\b/, 'obliques'],
  [/\b(wrist|forearm|grip|farmer)\b/, 'forearms'],
  [/\b(adductor|adduction)\b/, 'adductors'],
];

/**
 * How to keep an exercise no library entry matched, as your own (R565): its equipment and main muscle from the words of
 * its name where they say ("Hack squat (Machine)" is a machine for the quads; none when nothing says), and how it is
 * logged from what the file logged for it: weight and reps, reps alone, time, time with weight, or distance. It is
 * always one of the six types your own exercises can have (R108), never a program type (R607): a carry's weight and
 * distance log as distance, and an AMRAP score's rounds and extra reps as reps.
 */
export function guessOwnExercise(name: string, sets: readonly ImportedSet[]): { equipment: Equipment; primaryMuscles: Muscle[]; loggingType: LoggingType } {
  const words = nameWords(name);
  const text = ` ${words.join(' ')} `;
  const equipment = words.map((w) => EQUIPMENT_WORDS[w]).find((e) => e !== undefined) ?? 'other';
  const muscle = MUSCLE_WORDS.find(([pattern]) => pattern.test(text))?.[1];
  const any = (f: (s: ImportedSet) => boolean) => sets.some(f);
  const loggingType: LoggingType = any((s) => s.distance !== null)
    ? 'distance_time'
    : any((s) => s.durationS !== null) && !any((s) => s.reps !== null)
      ? any((s) => s.weight !== null)
        ? 'weighted_time'
        : 'timed'
      : any((s) => s.weight !== null)
        ? 'weighted'
        : 'bodyweight_plus';
  return { equipment: loggingType === 'bodyweight_plus' && equipment === 'other' ? 'bodyweight' : equipment, primaryMuscles: muscle ? [muscle] : [], loggingType };
}
