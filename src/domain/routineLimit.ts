/** How many routines of your own the free tier holds (§8.6). Premades never count. */
export const FREE_ROUTINE_LIMIT = 1;

/**
 * Whether a routine of your own can be added, by New routine or Duplicate, when you already have `userCount`.
 * Free holds one; Pro holds as many as you like (R88).
 */
export function canAddRoutine(userCount: number, isPro: boolean): boolean {
  return isPro || userCount < FREE_ROUTINE_LIMIT;
}
