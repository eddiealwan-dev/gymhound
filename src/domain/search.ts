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
function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

type Indexed = {
  /** The name in lower case, which the alphabetical order compares. */
  name: string;
  /** The name's words joined by single spaces, which a query that starts the name matches. */
  nameText: string;
  /** Every word a query word may start: the name's, the aliases', the primary muscles' labels and the equipment's label. */
  searchable: string[];
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
    index = {
      name: item.name.toLowerCase(),
      nameText: nameWords.join(' '),
      searchable: [
        ...nameWords,
        ...item.aliases.flatMap(words),
        ...item.primaryMuscles.flatMap((m) => words(muscleLabel(m))),
        ...words(equipmentLabel(item.equipment)),
      ],
    };
    indexes.set(item, index);
  }
  return index;
}

/**
 * Exercise picker search (§8.7). Every word of the query must be the start of some word in the name, an alias, a
 * primary muscle's label ("Chest", "Upper back", "Shoulders") or the equipment's label ("Band", "EZ bar"); the words
 * may match different fields ("dumbbell chest"). Names that start with the query come first, then everything
 * alphabetically; an empty query lists all items alphabetically. Does not modify `items`.
 */
export function searchExercises<T extends SearchItem>(items: readonly T[], query: string): T[] {
  const queryWords = words(query);
  const queryText = queryWords.join(' ');

  return items
    .map((item) => {
      const index = indexed(item);
      return {
        item,
        name: index.name,
        matches: queryWords.every((q) => index.searchable.some((w) => w.startsWith(q))),
        startsWithQuery: index.nameText.startsWith(queryText),
      };
    })
    .filter((r) => r.matches)
    .sort((a, b) => Number(b.startsWithQuery) - Number(a.startsWithQuery) || a.name.localeCompare(b.name))
    .map((r) => r.item);
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
