/** Lower-case words, split on anything that is not a letter or digit, as the exercise search splits them (`search.ts`). */
function words(s: string): string[] {
  return s
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
  const queryWords = words(query);
  if (queryWords.length === 0) return [];
  const queryText = queryWords.join(' ');

  const first: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const nameWords = words(item.name);
    if (queryWords.every((q) => nameWords.some((w) => w.startsWith(q)))) {
      (nameWords.join(' ').startsWith(queryText) ? first : rest).push(item);
    }
  }
  return first.concat(rest);
}
