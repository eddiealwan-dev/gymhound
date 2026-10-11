/**
 * Lower-case words without accents ("Crème" reads "creme", composed or decomposed alike), split on anything that is
 * not a letter or digit, as the exercise search splits them (`search.ts`).
 */
function words(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/**
 * Food search (R140): every word of the query must be the start of a word of the name, ignoring case (no aliases, so
 * "pb" finds no peanut butter). Names that start with the query come first, then the rest, each in the order given.
 * An empty query finds nothing (the add screen shows recent foods instead). Does not modify `items`.
 */
export function searchFoods<T extends { name: string }>(items: readonly T[], query: string): T[] {
  return indexFoods(items)(query);
}

/**
 * `searchFoods` over `items` with each name folded once, up front: the returned function searches them as the query
 * changes without folding every name again at each keystroke.
 */
export function indexFoods<T extends { name: string }>(items: readonly T[]): (query: string) => T[] {
  const folded = items.map((item) => {
    const nameWords = words(item.name);
    return { item, nameWords, nameText: nameWords.join(' ') };
  });
  return (query) => {
    const queryWords = words(query);
    if (queryWords.length === 0) return [];
    const queryText = queryWords.join(' ');
    const first: T[] = [];
    const rest: T[] = [];
    for (const { item, nameWords, nameText } of folded) {
      if (queryWords.every((q) => nameWords.some((w) => w.startsWith(q)))) {
        (nameText.startsWith(queryText) ? first : rest).push(item);
      }
    }
    return first.concat(rest);
  };
}
