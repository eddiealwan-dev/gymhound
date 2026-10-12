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
 *
 * With `tierOf` (R545), matches are ranked: by tier (lower first), then names that start with the query, then shorter
 * names (fewer words: "Chicken breast, roasted" before "Chicken, broilers or fryers, breast, meat only, cooked,
 * roasted"), then the order given. Without it, the order is `searchFoods`' own.
 */
export function indexFoods<T extends { name: string }>(items: readonly T[], tierOf?: (item: T) => number): (query: string) => T[] {
  const folded = items.map((item, order) => {
    const nameWords = words(item.name);
    return { item, order, nameWords, nameText: nameWords.join(' '), tier: tierOf?.(item) ?? 0 };
  });
  return (query) => {
    const queryWords = words(query);
    if (queryWords.length === 0) return [];
    const queryText = queryWords.join(' ');
    const matches = folded.filter(({ nameWords }) => queryWords.every((q) => nameWords.some((w) => w.startsWith(q))));
    const starts = (m: (typeof matches)[number]) => (m.nameText.startsWith(queryText) ? 0 : 1);
    if (tierOf === undefined) {
      return [...matches.filter((m) => starts(m) === 0), ...matches.filter((m) => starts(m) === 1)].map((m) => m.item);
    }
    return matches
      .sort((a, b) => a.tier - b.tier || starts(a) - starts(b) || a.nameWords.length - b.nameWords.length || a.order - b.order)
      .map((m) => m.item);
  };
}
