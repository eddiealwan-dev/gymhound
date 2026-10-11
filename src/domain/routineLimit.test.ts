import { canAddRoutine, FREE_ROUTINE_LIMIT } from './routineLimit';

describe('canAddRoutine (§8.6, R88)', () => {
  it('free holds one routine of your own', () => {
    expect(FREE_ROUTINE_LIMIT).toBe(1);
    expect(canAddRoutine(0, false)).toBe(true);
    expect(canAddRoutine(1, false)).toBe(false);
    expect(canAddRoutine(2, false)).toBe(false);
  });

  it('Pro holds as many as you like', () => {
    expect(canAddRoutine(0, true)).toBe(true);
    expect(canAddRoutine(1, true)).toBe(true);
    expect(canAddRoutine(12, true)).toBe(true);
  });
});
