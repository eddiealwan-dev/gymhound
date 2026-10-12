import {
  shouldStartTrial,
  TRIAL_DAYS,
  trialActive,
  trialChipSpoken,
  trialChipText,
  trialEndingLine,
  trialEndsAt,
  trialPitchLine,
  trialSettingsLine,
  trialStartFor,
  trialStartForPreset,
  trialStatus,
} from './trial';

/** Local time, so the tests read the same in any time zone. */
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

// Monday 12 Oct 2026, 6:40 PM.
const START = at(2026, 10, 12, 18, 40);

describe('trialEndsAt', () => {
  it('is the same clock time seven calendar days later', () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(trialEndsAt(START)).toBe(at(2026, 10, 19, 18, 40));
  });

  it('keeps the clock time across a change of summer time and a month end', () => {
    expect(new Date(trialEndsAt(at(2026, 10, 28, 9, 15))).getHours()).toBe(9);
    expect(trialEndsAt(at(2026, 10, 28, 9, 15))).toBe(at(2026, 11, 4, 9, 15));
    expect(trialEndsAt(at(2026, 3, 5, 7, 0))).toBe(at(2026, 3, 12, 7, 0));
    expect(trialEndsAt(at(2026, 12, 29, 20, 0))).toBe(at(2027, 1, 5, 20, 0));
  });

  it('trialStartFor goes back the same way', () => {
    expect(trialStartFor(trialEndsAt(START))).toBe(START);
  });
});

describe('trialStatus', () => {
  it('has not started without a start', () => {
    expect(trialStatus(null, START)).toEqual({ phase: 'not_started', startedAt: null, endsAt: null, daysLeft: null });
    expect(trialActive(null, START)).toBe(false);
  });

  it('counts calendar days left the way a person reads them: 7 on the first day, 0 on the last', () => {
    const expected: [number, number, number, number][] = [
      [12, 18, 40, 7], // the moment it starts
      [12, 23, 0, 7],
      [13, 0, 0, 6],
      [13, 9, 0, 6],
      [14, 12, 0, 5],
      [17, 12, 0, 2],
      [18, 12, 0, 1],
      [18, 23, 0, 1],
      [19, 0, 0, 0], // the last day
      [19, 18, 39, 0], // a minute before it ends
    ];
    for (const [day, hour, minute, left] of expected) {
      const status = trialStatus(START, at(2026, 10, day, hour, minute));
      expect([day, hour, status.phase, status.daysLeft]).toEqual([day, hour, 'active', left]);
    }
  });

  it('runs until the same clock time a week later, and ends at that moment', () => {
    const endsAt = trialEndsAt(START);
    expect(trialStatus(START, endsAt - 1)).toMatchObject({ phase: 'active', daysLeft: 0, endsAt });
    expect(trialStatus(START, endsAt)).toEqual({ phase: 'ended', startedAt: START, endsAt, daysLeft: null });
    expect(trialActive(START, endsAt - 1)).toBe(true);
    expect(trialActive(START, endsAt)).toBe(false);
    expect(trialActive(START, at(2027, 1, 1))).toBe(false);
  });

  it('reads a clock set back before the start as the first day', () => {
    expect(trialStatus(START, START - 3 * 86_400_000)).toMatchObject({ phase: 'active', daysLeft: 7 });
  });

  it('never runs past seven days from its start, wherever the clock goes', () => {
    // Set back to the middle of the week after it ended: still measured from the start, so only the days left of it.
    expect(trialStatus(START, at(2026, 10, 17, 12))).toMatchObject({ phase: 'active', daysLeft: 2 });
    expect(trialStatus(START, at(2026, 10, 20, 12)).phase).toBe('ended');
  });

  it('treats a stored value that is not a time as not started', () => {
    expect(trialStatus(Number.NaN, START).phase).toBe('not_started');
  });
});

describe('shouldStartTrial', () => {
  it('starts only once: never again after a start, even one long ended', () => {
    expect(shouldStartTrial(null)).toBe(true);
    expect(shouldStartTrial(START)).toBe(false);
    expect(shouldStartTrial(at(2020, 1, 1))).toBe(false);
  });
});

describe('the words', () => {
  const day = (d: number, h = 12) => trialStatus(START, at(2026, 10, d, h));

  it('Settings', () => {
    expect(trialSettingsLine(trialStatus(null, START))).toBeNull();
    expect(trialSettingsLine(day(12, 20))).toBe('Full access trial · 7 days left');
    expect(trialSettingsLine(day(14))).toBe('Full access trial · 5 days left');
    expect(trialSettingsLine(day(18))).toBe('Full access trial · 1 day left');
    expect(trialSettingsLine(day(19, 9))).toBe('Last day of your trial');
    expect(trialSettingsLine(day(20))).toBe('Trial ended');
  });

  it('the Fuel chip, and what VoiceOver reads for it', () => {
    expect(trialChipText(day(14))).toBe('Trial · 5 days left');
    expect(trialChipSpoken(day(14))).toBe('Full access trial, 5 days left');
    expect(trialChipText(day(18))).toBe('Trial · 1 day left');
    expect(trialChipText(day(19, 9))).toBe('Trial · last day');
    expect(trialChipSpoken(day(19, 9))).toBe('Last day of your full access trial');
    expect(trialChipText(day(20))).toBeNull();
    expect(trialChipText(trialStatus(null, START))).toBeNull();
  });

  it('the pitch', () => {
    expect(trialPitchLine(trialStatus(null, START))).toBe('Your next finished workout starts a 7-day full access trial. Nothing to set up.');
    expect(trialPitchLine(day(14))).toBe('5 days left in your full access trial');
    expect(trialPitchLine(day(18))).toBe('1 day left in your full access trial');
    expect(trialPitchLine(day(19, 9))).toBe('Last day of your full access trial');
    expect(trialPitchLine(day(20))).toBe('Your full access trial has ended.');
  });

  it("Train's line shows only on the last two days", () => {
    for (const d of [12, 13, 14, 15, 16, 17]) expect(trialEndingLine(day(d), 'en-US')).toBeNull();
    expect(trialEndingLine(day(18), 'en-US')).toBe(
      "Your full access trial ends tomorrow. Then Fuel locks and you can't add more routines. Your routines and food log stay.",
    );
    expect(trialEndingLine(day(19, 9), 'en-US')).toBe(
      "Your full access trial ends today at 6:40 PM. Then Fuel locks and you can't add more routines. Your routines and food log stay.".replace(
        ' ',
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(START).includes(' ') ? ' ' : ' ',
      ),
    );
    expect(trialEndingLine(day(20), 'en-US')).toBeNull();
    expect(trialEndingLine(trialStatus(null, START), 'en-US')).toBeNull();
  });

  it('never says it will charge, bill, pay or renew', () => {
    const all = [
      trialPitchLine(trialStatus(null, START)),
      ...[12, 14, 18, 19, 20].flatMap((d) => [
        trialSettingsLine(day(d, 9)),
        trialChipText(day(d, 9)),
        trialChipSpoken(day(d, 9)),
        trialPitchLine(day(d, 9)),
        trialEndingLine(day(d, 9), 'en-US'),
      ]),
    ].join(' ');
    expect(all).not.toMatch(/charge|bill|pay|renew|subscri|price|\$/i);
  });
});

describe('trialStartForPreset (the developer controls)', () => {
  const now = at(2026, 10, 12, 15, 0);

  it('not started, first day, last day, ended', () => {
    expect(trialStartForPreset('not_started', now)).toBeNull();
    expect(trialStatus(trialStartForPreset('first_day', now), now)).toMatchObject({ phase: 'active', daysLeft: 7 });
    expect(trialStatus(trialStartForPreset('last_day', now), now)).toMatchObject({ phase: 'active', daysLeft: 0 });
    expect(trialStatus(trialStartForPreset('ended', now), now).phase).toBe('ended');
  });

  it('the last day ends later today, even a minute before midnight', () => {
    const late = at(2026, 10, 12, 23, 59);
    const status = trialStatus(trialStartForPreset('last_day', late), late);
    expect(status).toMatchObject({ phase: 'active', daysLeft: 0 });
    expect(status.endsAt).toBeGreaterThan(late);
    expect(trialStatus(trialStartForPreset('last_day', now), now).endsAt).toBe(at(2026, 10, 12, 19, 30));
  });
});
