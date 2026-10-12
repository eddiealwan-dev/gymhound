import { equipmentLabel, muscleLabel } from './labels';
import type { Equipment, Muscle } from './types';

export type SearchItem = {
  id: string;
  name: string;
  aliases: readonly string[];
  primaryMuscles: readonly Muscle[];
  equipment: Equipment;
};

/** Lower-case words, split on anything that is not a letter or digit. */
export function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/**
 * What a lifter calls each delt. Every delt reads as Shoulders (`muscleLabel`), but a search for "delts" finds any delt
 * and "rear delt" only the rear one.
 */
const DELT_WORDS: Partial<Record<Muscle, readonly string[]>> = {
  front_delts: ['front', 'delts'],
  side_delts: ['side', 'delts'],
  rear_delts: ['rear', 'delts'],
};

/** The words that may come before "delt" to name one delt. */
const DELT_SIDES = new Set(['front', 'side', 'rear']);

/**
 * The query's words, with "front", "side" or "rear" joined to a "delt…" word after it ("rear delt" is one term), so a
 * delt is found by its name and not by any exercise that says "rear" somewhere and works another delt.
 */
function terms(query: string): string[][] {
  const out: string[][] = [];
  const qs = words(query);
  for (let i = 0; i < qs.length; i++) {
    if (DELT_SIDES.has(qs[i]) && qs[i + 1]?.startsWith('delt')) {
      out.push([qs[i], qs[i + 1]]);
      i++;
    } else {
      out.push([qs[i]]);
    }
  }
  return out;
}

type Indexed = {
  /** The name's words joined by single spaces, which a query that starts the name matches. */
  nameText: string;
  /**
   * Every word a query word may start: the name's, the aliases', the primary muscles' labels, "delts" for a delt, and
   * the equipment's label.
   */
  searchable: string[];
  /**
   * The runs of words a two-word term ("rear delt") may match, its last word as a start: the name, each alias, and
   * each primary delt's own name ("rear delts").
   */
  phrases: (readonly string[])[];
};

/**
 * Each item's words, worked out the first time it is searched. The picker searches the same rows on every keystroke
 * until the library is read again, so typing splits nothing twice (Review Focus 5: under ~50 ms on a phone).
 */
const indexes = new WeakMap<SearchItem, Indexed>();

function indexed(item: SearchItem): Indexed {
  let index = indexes.get(item);
  if (!index) {
    const nameWords = words(item.name);
    const aliasWords = item.aliases.map(words);
    const delts = item.primaryMuscles.flatMap((m) => {
      const delt = DELT_WORDS[m];
      return delt ? [delt] : [];
    });
    index = {
      nameText: nameWords.join(' '),
      searchable: [
        ...nameWords,
        ...aliasWords.flat(),
        ...item.primaryMuscles.flatMap((m) => words(muscleLabel(m))),
        ...(delts.length > 0 ? ['delts'] : []),
        ...words(equipmentLabel(item.equipment)),
      ],
      phrases: [nameWords, ...aliasWords, ...delts],
    };
    indexes.set(item, index);
  }
  return index;
}

/**
 * Works out every item's words now, so the first search does not (R401). The picker calls it once the phone is idle
 * after opening. Items already worked out are skipped.
 */
export function warmSearch(items: readonly SearchItem[]): void {
  for (const item of items) indexed(item);
}

/** Whether a two-word term matches two words in a row of some phrase: the first whole, the second as a start. */
function matchesPhrase(index: Indexed, [first, second]: string[]): boolean {
  return index.phrases.some((p) => p.some((w, i) => w === first && i + 1 < p.length && p[i + 1].startsWith(second)));
}

/**
 * Exercise picker search (§8.7). Every word of the query must be the start of some word in the name, an alias, a
 * primary muscle's label ("Chest", "Upper back", "Shoulders") or the equipment's label ("Band", "EZ bar"); the words
 * may match different fields ("dumbbell chest"). "delts" finds any primary delt, and "front delt", "side delt" and
 * "rear delt" that one (or a name that says it). Names that start with the query come first, then the rest, each in
 * the order given: `items` comes sorted by name (`listExercises`), so nothing is sorted on each keystroke. An empty
 * query lists every item in order. Does not modify `items`.
 */
export function searchExercises<T extends SearchItem>(items: readonly T[], query: string): T[] {
  const queryTerms = terms(query);
  const queryText = queryTerms.flat().join(' ');

  const first: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const index = indexed(item);
    const matches = queryTerms.every((t) =>
      t.length === 1 ? index.searchable.some((w) => w.startsWith(t[0])) : matchesPhrase(index, t),
    );
    if (matches) (index.nameText.startsWith(queryText) ? first : rest).push(item);
  }
  return first.concat(rest);
}

/** The picker's chips: one muscle and one kind of equipment, either or both. */
export type ExerciseFilter = { muscle?: Muscle; equipment?: Equipment };

/**
 * The exercises that train `muscle` as a primary muscle and use `equipment`, in the order given; a filter left out
 * keeps everything. A muscle matches by what it reads as, so any delt chooses all three: Shoulders.
 */
export function filterExercises<T extends SearchItem>(items: readonly T[], { muscle, equipment }: ExerciseFilter): T[] {
  const reads = muscle === undefined ? null : muscleLabel(muscle);
  return items.filter(
    (item) =>
      (equipment === undefined || item.equipment === equipment) &&
      (reads === null || item.primaryMuscles.some((m) => muscleLabel(m) === reads)),
  );
}
