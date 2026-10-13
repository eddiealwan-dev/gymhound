import { breakableName, SET_HEADER_MAX_SCALE, STACK_ABOVE_SCALE } from './largeText';
import { BODY_MAX_SCALE, TITLE_MAX_SCALE } from './Text';

describe('text at the largest sizes (R562, Round 13)', () => {
  it('lets a name break after each slash and nowhere else', () => {
    expect(breakableName('Push/pull/legs')).toBe('Push/​pull/​legs');
    expect(breakableName('Adductor/groin stretch')).toBe('Adductor/​groin stretch');
    expect(breakableName('Beginner full body')).toBe('Beginner full body');
  });

  it("caps body text where iOS's own body style stops, titles at 2×, and the set table at 1.5×", () => {
    expect(BODY_MAX_SCALE).toBeCloseTo(53 / 17, 6);
    // React Native's own factor at the largest size is 3.571: past iOS's body text.
    expect(BODY_MAX_SCALE).toBeLessThan(3.571);
    expect(TITLE_MAX_SCALE).toBe(2);
    expect(SET_HEADER_MAX_SCALE).toBe(1.5);
    expect(STACK_ABOVE_SCALE).toBe(1.3);
  });
});
