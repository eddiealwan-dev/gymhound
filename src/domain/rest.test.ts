import { minus15, restRemainingSeconds, shouldStartRestAfterTick } from './rest';

const now = 1_000_000;

describe('restRemainingSeconds (Review Focus 1)', () => {
  it('shows nothing when no timer is running', () => {
    expect(restRemainingSeconds(null, now)).toBeNull();
  });

  it('rounds a partial second up', () => {
    expect(restRemainingSeconds(now + 90_500, now)).toBe(91);
  });

  it('shows nothing once the end time has passed', () => {
    expect(restRemainingSeconds(now - 1, now)).toBeNull();
  });

  it('shows nothing at the exact end time', () => {
    expect(restRemainingSeconds(now, now)).toBeNull();
  });
});

describe('minus15', () => {
  it('moves the end 15 seconds earlier', () => {
    expect(minus15(now + 60_000, now)).toBe(now + 45_000);
  });

  it('returns null when the shortened timer would already be over', () => {
    expect(minus15(now + 10_000, now)).toBeNull();
  });

  it('returns null when the shortened end lands exactly on now', () => {
    expect(minus15(now + 15_000, now)).toBeNull();
  });
});

describe('shouldStartRestAfterTick (spec 8.4)', () => {
  const ex = [
    { id: 'a', position: 1, supersetGroup: 1 },
    { id: 'b', position: 2, supersetGroup: 1 },
    { id: 'c', position: 3, supersetGroup: null },
  ];

  it('waits while a superset round is unfinished', () => {
    expect(shouldStartRestAfterTick(ex, 'a')).toBe(false);
  });

  it('starts after the last member of a superset', () => {
    expect(shouldStartRestAfterTick(ex, 'b')).toBe(true);
  });

  it('starts after an exercise that is not in a superset', () => {
    expect(shouldStartRestAfterTick(ex, 'c')).toBe(true);
  });

  it('judges the last member by position, not by list order', () => {
    const shuffled = [ex[1], ex[2], ex[0]];
    expect(shouldStartRestAfterTick(shuffled, 'a')).toBe(false);
    expect(shouldStartRestAfterTick(shuffled, 'b')).toBe(true);
  });
});
