import {
  minus15,
  plus15,
  PLUS_15_MS,
  REST_CHOICES,
  REST_UP_MS,
  restLengthFor,
  restAfterMinus15,
  restAfterPlus15,
  restAfterTick,
  restPhase,
  restRemainingSeconds,
  restRowPhase,
  restTrackFraction,
  RING_WINDOW_MS,
  shouldStartRestAfterTick,
  spokenRest,
  tickAnnouncement,
  wasAwayAt,
} from './rest';

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

describe('wasAwayAt: whether the app was away (in the background or inactive) at a moment (R31)', () => {
  it('is false when the app has not been away', () => {
    expect(wasAwayAt(null, now)).toBe(false);
  });

  it('is true inside a span that is still open, from its start on', () => {
    expect(wasAwayAt({ from: now, to: null }, now)).toBe(true);
    expect(wasAwayAt({ from: now, to: null }, now + 60_000)).toBe(true);
    expect(wasAwayAt({ from: now, to: null }, now - 1)).toBe(false);
  });

  it('is true inside a closed span, ends included, and false outside it', () => {
    const span = { from: now, to: now + 10_000 };
    expect(wasAwayAt(span, now)).toBe(true);
    expect(wasAwayAt(span, now + 5_000)).toBe(true);
    expect(wasAwayAt(span, now + 10_000)).toBe(true);
    expect(wasAwayAt(span, now - 1)).toBe(false);
    expect(wasAwayAt(span, now + 10_001)).toBe(false);
  });
});

describe('restPhase when the app was away as the rest ended (R31)', () => {
  const endsAt = now + 10_000;

  it('does not ring in the app on return: the notification already rang, so it clears quietly', () => {
    // Backgrounded before the end, back within the ring window: without this it would ring a second time.
    expect(restPhase(endsAt, endsAt + 500, true, true)).toBe('clear');
    expect(restPhase(endsAt, endsAt + RING_WINDOW_MS, true, true)).toBe('clear');
  });

  it('still rings when the app was active at the end, as before', () => {
    expect(restPhase(endsAt, endsAt + 500, true, false)).toBe('ring');
    expect(restPhase(endsAt, endsAt + 500, true)).toBe('ring');
  });

  it('is still running while time is left, away or not', () => {
    expect(restPhase(endsAt, now, true, true)).toBe('running');
  });
});

describe('REST_CHOICES and restLengthFor: rest per exercise (Task 21)', () => {
  it('offers Off, then 30 seconds to 5 minutes', () => {
    expect(REST_CHOICES).toEqual([0, 30, 45, 60, 90, 120, 150, 180, 240, 300]);
  });

  it("uses the exercise's own rest when it has one, Off (0) included", () => {
    expect(restLengthFor(90, 120)).toBe(90);
    expect(restLengthFor(0, 120)).toBe(0);
  });

  it('falls back on the Settings rest when the exercise has none', () => {
    expect(restLengthFor(null, 120)).toBe(120);
  });
});

describe('plus15 and restAfterPlus15: +15s (spec 18.6)', () => {
  it('moves the end 15 seconds later', () => {
    expect(PLUS_15_MS).toBe(15_000);
    expect(plus15(now + 60_000)).toBe(now + 75_000);
  });

  it('extends the running rest by 15 seconds, however little is left', () => {
    expect(restAfterPlus15(now + 60_000, now)).toEqual({ kind: 'extend', endsAt: now + 75_000 });
    expect(restAfterPlus15(now + 1_000, now)).toEqual({ kind: 'extend', endsAt: now + 16_000 });
  });

  it('does nothing once the rest is over', () => {
    expect(restAfterPlus15(now, now)).toEqual({ kind: 'none' });
    expect(restAfterPlus15(now - 1, now)).toEqual({ kind: 'none' });
  });
});

describe("restRowPhase: the rest row counts down, holds Rest's up, then goes (spec 18.6)", () => {
  it('counts down in whole seconds, rounded up', () => {
    expect(restRowPhase(now + 105_000, now)).toEqual({ kind: 'running', remaining: 105 });
    expect(restRowPhase(now + 500, now)).toEqual({ kind: 'running', remaining: 1 });
  });

  it("holds Rest's up for 10 seconds from the end", () => {
    expect(REST_UP_MS).toBe(10_000);
    expect(restRowPhase(now, now)).toEqual({ kind: 'up' });
    expect(restRowPhase(now, now + 9_999)).toEqual({ kind: 'up' });
  });

  it('is gone after that', () => {
    expect(restRowPhase(now, now + REST_UP_MS)).toEqual({ kind: 'gone' });
  });
});

describe('restTrackFraction: how much of the track is left', () => {
  it('is the share of the rest left, kept within 0 and 1', () => {
    expect(restTrackFraction(60, 120)).toBe(0.5);
    expect(restTrackFraction(135, 120)).toBe(1);
    expect(restTrackFraction(0, 120)).toBe(0);
  });

  it('is full when the length is unknown', () => {
    expect(restTrackFraction(30, 0)).toBe(1);
    expect(restTrackFraction(30, NaN)).toBe(1);
  });
});

describe('spokenRest and tickAnnouncement: what VoiceOver says after a tick', () => {
  it('says a rest length in words', () => {
    expect(spokenRest(120)).toBe('2 minutes');
    expect(spokenRest(60)).toBe('1 minute');
    expect(spokenRest(90)).toBe('1 minute 30 seconds');
    expect(spokenRest(150)).toBe('2 minutes 30 seconds');
    expect(spokenRest(45)).toBe('45 seconds');
    expect(spokenRest(1)).toBe('1 second');
  });

  it('names the set, then the rest it started, if any', () => {
    expect(tickAnnouncement('2', 120)).toBe('Set 2 logged. Rest 2 minutes.');
    expect(tickAnnouncement('2', null)).toBe('Set 2 logged.');
    expect(tickAnnouncement('W', 90)).toBe('Warmup logged. Rest 1 minute 30 seconds.');
  });
});
