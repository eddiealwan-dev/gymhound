import { minus15, restAfterMinus15, restAfterTick, restPhase, restRemainingSeconds, RING_WINDOW_MS, shouldStartRestAfterTick } from './rest';

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

describe('restAfterTick: the rest a tick starts (Task 15 Step 6)', () => {
  const plain = [
    { id: 'a', position: 0, supersetGroup: null },
    { id: 'b', position: 1, supersetGroup: null },
  ];
  const superset = [
    { id: 'bench', position: 0, supersetGroup: 1 },
    { id: 'ohp', position: 1, supersetGroup: 1 },
  ];

  it('starts a rest of the Settings length from now', () => {
    expect(restAfterTick(plain, 'a', now, 120)).toEqual({ kind: 'start', endsAt: now + 120_000 });
    expect(restAfterTick(plain, 'a', now, 90)).toEqual({ kind: 'start', endsAt: now + 90_000 });
  });

  it('starts nothing after a superset member that is not the last of its round, and starts one after the last', () => {
    expect(restAfterTick(superset, 'bench', now, 120)).toEqual({ kind: 'none' });
    expect(restAfterTick(superset, 'ohp', now, 120)).toEqual({ kind: 'start', endsAt: now + 120_000 });
  });

  it('starts nothing when the length is zero', () => {
    expect(restAfterTick(plain, 'a', now, 0)).toEqual({ kind: 'none' });
  });
});

describe('restAfterMinus15: -15s and Skip (Task 15 Step 6)', () => {
  it('shortens the timer by 15 seconds while some is left', () => {
    expect(restAfterMinus15(now + 120_000, now)).toEqual({ kind: 'shorten', endsAt: now + 105_000 });
  });

  it('skips when taking 15 seconds off would end it', () => {
    expect(restAfterMinus15(now + 15_000, now)).toEqual({ kind: 'skip' });
    expect(restAfterMinus15(now + 5_000, now)).toEqual({ kind: 'skip' });
  });
});

describe('restPhase: what the rest bar does at each tick', () => {
  const endsAt = now + 10_000;

  it('is running while time is left, whether or not the bar saw it run', () => {
    expect(restPhase(endsAt, now, false)).toBe('running');
    expect(restPhase(endsAt, now + 9_999, true)).toBe('running');
  });

  it('rings when a timer the bar watched has just run out', () => {
    expect(restPhase(endsAt, endsAt, true)).toBe('ring');
    expect(restPhase(endsAt, endsAt + 250, true)).toBe('ring');
    expect(restPhase(endsAt, endsAt + RING_WINDOW_MS, true)).toBe('ring');
  });

  it('does not ring for an end the bar was not watching: it clears quietly', () => {
    // Opened on a timer that had already run out (the app was closed or in the background), so the notification already rang.
    expect(restPhase(endsAt, endsAt + 250, false)).toBe('clear');
  });

  it('does not ring late: after the window it clears quietly', () => {
    // The phone was locked or the app backgrounded; the notification carried the sound.
    expect(restPhase(endsAt, endsAt + RING_WINDOW_MS + 1, true)).toBe('clear');
    expect(restPhase(endsAt, endsAt + 600_000, true)).toBe('clear');
  });
});
