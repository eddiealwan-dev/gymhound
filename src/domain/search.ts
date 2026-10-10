export type SearchItem = { id: string; name: string; aliases: string[] };

/** Lower-case words, split on anything that is not a letter or digit. */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/**
 * Exercise picker search. Every word of the query must be the start of some word in the name or in
 * any alias. Names that start with the query come first, then everything alphabetically; an empty
 * query lists all items alphabetically. Does not modify `items`.
 */
export function searchExercises<T extends SearchItem>(items: T[], query: string): T[] {
  const queryWords = words(query);
  const queryText = queryWords.join(' ');

  return items
    .map((item) => {
      const nameWords = words(item.name);
      const searchable = [...nameWords, ...item.aliases.flatMap(words)];
      return {
        item,
        name: item.name.toLowerCase(),
        matches: queryWords.every((q) => searchable.some((w) => w.startsWith(q))),
        startsWithQuery: nameWords.join(' ').startsWith(queryText),
      };
    })
    .filter((r) => r.matches)
    .sort((a, b) => Number(b.startsWithQuery) - Number(a.startsWithQuery) || a.name.localeCompare(b.name))
    .map((r) => r.item);
}
