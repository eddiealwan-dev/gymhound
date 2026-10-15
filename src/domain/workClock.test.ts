import {
  clockAt,
  clockVoiceLabel,
  CUE_LIMIT,
  cuesOf,
  dueCue,
  idleClock,
  LEAD_IN_MS,
  notificationCues,
  pauseTimer,
  releaseHold,
  resumeTimer,
  startTimer,
  startVoiceLabel,
  stopTimer,
  type WorkPlan,
  type WorkTimer,
} from './workClock';

const T0 = 1_000_000;
const amrap10: WorkPlan = { kind: 'amrap', noun: 'AMRAP', steps: [{ kind: 'work', seconds: 600, set: 1 }] };
const fran: WorkPlan = { kind: 'for_time', noun: 'For Time', steps: [{ kind: 'work', seconds: 480, set: 1 }] };
const run29: WorkPlan = { kind: 'run', noun: 'Run', steps: [{ kind: 'work', seconds: 1740, set: 1 }] };
const intervals: WorkPlan = {
  kind: 'intervals',
  noun: 'Intervals',
  steps: [
    { kind: 'work', seconds: 180, set: 1 },
    { kind: 'easy', seconds: 120, set: 1 },
    { kind: 'work', seconds: 180, set: 2 },
  ],
};
const noEasy: WorkPlan = {
  kind: 'intervals',
  noun: 'Intervals',
  steps: [
    { kind: 'work', seconds: 60, set: 1, holdAfter: true },
    { kind: 'work', seconds: 60, set: 2 },
  ],
};
const emom3: WorkPlan = {
  kind: 'emom',
  noun: 'EMOM',
  steps: [1, 2, 3].map((set) => ({ kind: 'minute' as const, seconds: 60, set })),
};

const start = (plan: WorkPlan, at = T0): WorkTimer => startTimer({ workoutId: 'w1', workoutExerciseId: 'we1', plan }, at);
const s = (seconds: number) => seconds * 1000;
/** The time `seconds` into the work, after the lead-in. */
const into = (seconds: number) => T0 + LEAD_IN_MS + s(seconds);

describe('startTimer', () => {
  it('stores the moment the work starts, after a 10 s lead-in, and nothing that ticks', () => {
    const t = start(amrap10);
    expect(LEAD_IN_MS).toBe(10_000);
    expect(t).toMatchObject({ workoutId: 'w1', workoutExerciseId: 'we1', startsAt: T0 + 10_000, pausedAt: null, pausedMs: 0, released: 0, rang: 0, doneAtS: null });
    expect(t.plan).toBe(amrap10);
  });
});

describe('clockAt: derived from the stored start, never counted', () => {
  it('counts the lead-in down first', () => {
    const t = start(amrap10);
    expect(clockAt(t, T0)).toMatchObject({ phase: 'ready', label: 'GET READY', shown: 10 });
    expect(clockAt(t, T0 + 2_500)).toMatchObject({ phase: 'ready', shown: 8 });
  });

  it('counts an AMRAP down from its minutes, the track draining, and ends at zero', () => {
    const t = start(amrap10);
    expect(clockAt(t, into(0))).toMatchObject({ phase: 'running', label: 'AMRAP', shown: 600, fraction: 1 });
    expect(clockAt(t, into(150))).toMatchObject({ phase: 'running', shown: 450, fraction: 0.75 });
    expect(clockAt(t, into(599.5))).toMatchObject({ shown: 1 });
    expect(clockAt(t, into(600))).toMatchObject({ phase: 'ended', endLine: 'Time. Enter your rounds.', shown: 0 });
    // A phone locked for an hour comes back to the same end.
    expect(clockAt(t, into(4_000))).toMatchObject({ phase: 'ended', endLine: 'Time. Enter your rounds.' });
  });

  it('counts For Time up toward its cap, the track filling, and stops at the cap', () => {
    const t = start(fran);
    expect(clockAt(t, into(0))).toMatchObject({ phase: 'running', label: 'FOR TIME', shown: 0, fraction: 0, capS: 480 });
    expect(clockAt(t, into(120.9))).toMatchObject({ shown: 120, fraction: 0.25 });
    expect(clockAt(t, into(480))).toMatchObject({ phase: 'ended', shown: 480, endLine: 'Cap reached. 8:00 is your time.', timeS: 480 });
  });

  it('holds still while paused and goes on from there on resume', () => {
    let t = start(amrap10);
    t = pauseTimer(t, into(100));
    expect(clockAt(t, into(100))).toMatchObject({ phase: 'paused', shown: 500 });
    expect(clockAt(t, into(700))).toMatchObject({ phase: 'paused', shown: 500 });
    t = resumeTimer(t, into(700));
    expect(t.pausedAt).toBeNull();
    expect(clockAt(t, into(700))).toMatchObject({ phase: 'running', shown: 500 });
    expect(clockAt(t, into(800))).toMatchObject({ phase: 'running', shown: 400 });
    expect(clockAt(t, into(1_200))).toMatchObject({ phase: 'ended' });
  });

  it('pauses in the lead-in too', () => {
    let t = start(amrap10);
    t = pauseTimer(t, T0 + 4_000);
    expect(clockAt(t, T0 + 60_000)).toMatchObject({ phase: 'paused', label: 'GET READY', shown: 6 });
    t = resumeTimer(t, T0 + 60_000);
    expect(clockAt(t, T0 + 66_000)).toMatchObject({ phase: 'running', shown: 600 });
  });

  it('stops For Time where Done was tapped, with the time to log', () => {
    const t = stopTimer(start(fran), into(462.4));
    expect(t.doneAtS).toBe(462);
    expect(clockAt(t, into(2_000))).toMatchObject({ phase: 'ended', shown: 462, timeS: 462, endLine: 'Stopped at 7:42. Tick to log it.' });
  });

  it('runs a run down to its target, and Done early gives the time run', () => {
    const t = start(run29);
    expect(clockAt(t, into(0))).toMatchObject({ label: 'RUN', shown: 1740 });
    expect(clockAt(t, into(1740))).toMatchObject({ phase: 'ended', timeS: 1740, endLine: '29:00 done. Tick to log it.' });
    expect(clockAt(stopTimer(t, into(1275)), into(1300))).toMatchObject({ phase: 'ended', timeS: 1275, endLine: 'Stopped at 21:15. Tick to log it.' });
  });

  it('steps intervals through hard and easy, with no easy after the last', () => {
    const t = start(intervals);
    expect(clockAt(t, into(0))).toMatchObject({ label: 'HARD · 1 OF 2', shown: 180, fraction: 1 });
    expect(clockAt(t, into(90))).toMatchObject({ label: 'HARD · 1 OF 2', shown: 90, fraction: 0.5 });
    expect(clockAt(t, into(180))).toMatchObject({ label: 'EASY · 1 OF 2', shown: 120 });
    expect(clockAt(t, into(300))).toMatchObject({ label: 'HARD · 2 OF 2', shown: 180 });
    expect(clockAt(t, into(480))).toMatchObject({ phase: 'ended', endLine: '2 of 2 done. Tick each set you ran.' });
  });

  it('waits between sets when intervals have no easy part, until Start', () => {
    let t = start(noEasy);
    expect(clockAt(t, into(60))).toMatchObject({ phase: 'waiting', label: 'HARD · 2 OF 2', shown: 60 });
    expect(clockAt(t, into(500))).toMatchObject({ phase: 'waiting', shown: 60 });
    t = releaseHold(t, into(500));
    expect(t.released).toBe(1);
    expect(clockAt(t, into(500))).toMatchObject({ phase: 'running', label: 'HARD · 2 OF 2', shown: 60 });
    expect(clockAt(t, into(530))).toMatchObject({ shown: 30 });
    expect(clockAt(t, into(560))).toMatchObject({ phase: 'ended' });
  });

  it('counts each EMOM minute down to the next', () => {
    const t = start(emom3);
    expect(clockAt(t, into(0))).toMatchObject({ label: 'EMOM · MINUTE 1 OF 3', shown: 60 });
    expect(clockAt(t, into(78))).toMatchObject({ label: 'EMOM · MINUTE 2 OF 3', shown: 42 });
    expect(clockAt(t, into(180))).toMatchObject({ phase: 'ended', endLine: '3 minutes done.' });
  });

  it('names a walk, a ride or a row by its own word', () => {
    const walk = start({ ...run29, noun: 'Walk', steps: [{ kind: 'work', seconds: 900, set: 1 }] });
    expect(clockAt(walk, into(0)).label).toBe('WALK');
    expect(clockAt(walk, into(900)).endLine).toBe('15:00 done. Tick to log it.');
  });
});

describe('cues: the bell, the haptic, the words and the lock screen', () => {
  it('lists the go, each step, a minute-left warning and the end for an AMRAP', () => {
    expect(cuesOf(start(amrap10))).toEqual([
      { atMs: 0, kind: 'go', title: 'Go.', say: 'Go. AMRAP, 10 minutes.' },
      { atMs: s(540), kind: 'warn', title: null, say: '1 minute left.' },
      { atMs: s(600), kind: 'end', title: 'Time.', say: 'Time. Enter your rounds.' },
    ]);
  });

  it('says the cap is a minute away for For Time, and the cap', () => {
    expect(cuesOf(start(fran)).map((c) => c.say)).toEqual(['Go. For Time, 8 minute cap.', '1 minute to the cap.', 'Cap reached. 8:00 is your time.']);
  });

  it('calls each interval step', () => {
    expect(cuesOf(start(intervals)).map((c) => [c.atMs / 1000, c.title, c.say])).toEqual([
      [0, 'Go.', 'Go. Hard, 1 of 2.'],
      [180, 'Easy.', 'Easy, 2 minutes.'],
      [300, 'Hard. 2 of 2.', 'Hard, 2 of 2.'],
      [480, 'Intervals done.', '2 of 2 done. Tick each set you ran.'],
    ]);
  });

  it('calls each EMOM minute', () => {
    expect(cuesOf(start(emom3)).map((c) => c.say)).toEqual(['Go. Minute 1 of 3.', 'Minute 2.', 'Minute 3.', '3 minutes done.']);
  });

  it('has no minute-left warning on a clock of a minute or less', () => {
    const short = start({ ...amrap10, steps: [{ kind: 'work', seconds: 60, set: 1 }] });
    expect(cuesOf(short).some((c) => c.kind === 'warn')).toBe(false);
  });

  it('rings a cue once, as it comes due, and a cue long past only catches up quietly', () => {
    const t = start(amrap10);
    expect(dueCue(t, T0 + 5_000)).toBeNull();
    expect(dueCue(t, into(0.4))).toMatchObject({ index: 1, audible: true, cue: { kind: 'go' } });
    const rung = { ...t, rang: 1 };
    expect(dueCue(rung, into(100))).toBeNull();
    expect(dueCue(rung, into(540.5))).toMatchObject({ index: 2, audible: true, cue: { kind: 'warn' } });
    // Back after a lock: the end passed long ago, so the notification rang it. Catch up without a bell.
    expect(dueCue({ ...t, rang: 1 }, into(900))).toMatchObject({ index: 3, audible: false, cue: { kind: 'end' } });
  });

  it('rings no cue while paused or once stopped', () => {
    const t = start(amrap10);
    expect(dueCue(pauseTimer(t, into(10)), into(700))).toMatchObject({ index: 1 });
    expect(dueCue({ ...pauseTimer(t, into(10)), rang: 1 }, into(700))).toBeNull();
    expect(dueCue({ ...stopTimer(t, into(10)), rang: 1 }, into(700))).toBeNull();
  });

  it('rings nothing past a hold until it is released', () => {
    const t = { ...start(noEasy), rang: 1 };
    // The end of set 1 is the hold itself: due once, then nothing more while it waits.
    expect(dueCue(t, into(60.2))).toMatchObject({ index: 2, cue: { title: 'Set 2 next.' } });
    expect(dueCue({ ...t, rang: 2 }, into(500))).toBeNull();
  });
});

describe('notificationCues (R-t7b1)', () => {
  it('schedules each bell still to come at its time, never the spoken-only warning', () => {
    const t = start(intervals);
    expect(notificationCues(t, T0)).toEqual([
      { at: into(0), title: 'Go.' },
      { at: into(180), title: 'Easy.' },
      { at: into(300), title: 'Hard. 2 of 2.' },
      { at: into(480), title: 'Intervals done.' },
    ]);
    expect(notificationCues(t, into(200)).map((c) => c.title)).toEqual(['Hard. 2 of 2.', 'Intervals done.']);
  });

  it('schedules nothing while paused, waiting or stopped', () => {
    const t = start(intervals);
    expect(notificationCues(pauseTimer(t, into(10)), into(10))).toEqual([]);
    expect(notificationCues(stopTimer(t, into(10)), into(10))).toEqual([]);
    expect(notificationCues(start(noEasy), into(70))).toEqual([]);
  });

  it('stops at an unreleased hold, and at 30', () => {
    expect(notificationCues(start(noEasy), T0).map((c) => c.title)).toEqual(['Go.', 'Set 2 next.']);
    const long: WorkPlan = { ...emom3, steps: Array.from({ length: 40 }, (_, i) => ({ kind: 'minute' as const, seconds: 60, set: i + 1 })) };
    expect(CUE_LIMIT).toBe(30);
    expect(notificationCues(start(long), T0)).toHaveLength(30);
  });

  it('moves the cues by the time spent paused', () => {
    const t = resumeTimer(pauseTimer(start(amrap10), into(100)), into(160));
    expect(notificationCues(t, into(160))).toEqual([{ at: into(660), title: 'Time.' }]);
  });
});

describe('clockVoiceLabel', () => {
  it('reads the time as a duration, with what the clock is', () => {
    const at = (plan: WorkPlan, seconds: number) => clockVoiceLabel(clockAt(start(plan), into(seconds)), start(plan).plan);
    expect(clockVoiceLabel(clockAt(start(amrap10), T0 + 2_000), amrap10)).toBe('Get ready, 8 seconds');
    expect(at(amrap10, 167.5)).toBe('AMRAP, 7 minutes 13 seconds left');
    expect(at(fran, 185)).toBe('For Time, 3 minutes 5 seconds, cap 8 minutes');
    expect(at(intervals, 80)).toBe('Hard, interval 1 of 2, 1 minute 40 seconds left');
    expect(at(intervals, 200)).toBe('Easy, interval 1 of 2, 1 minute 40 seconds left');
    expect(at(emom3, 78)).toBe('EMOM, minute 2 of 3, 42 seconds left');
    expect(at(run29, 1020)).toBe('Run, 12 minutes left');
  });

  it('says paused, and the end line once ended', () => {
    const paused = pauseTimer(start(amrap10), into(60));
    expect(clockVoiceLabel(clockAt(paused, into(90)), amrap10)).toBe('AMRAP, 9 minutes left, paused');
    expect(clockVoiceLabel(clockAt(start(amrap10), into(700)), amrap10)).toBe('Time. Enter your rounds.');
  });
});

describe('the clock before Start', () => {
  it('shows the full time over its name, and For Time at 0:00 toward its cap', () => {
    expect(idleClock(amrap10)).toMatchObject({ phase: 'idle', label: 'AMRAP', shown: 600, fraction: 1, capS: null });
    expect(idleClock(fran)).toMatchObject({ phase: 'idle', label: 'FOR TIME', shown: 0, fraction: 0, capS: 480 });
    expect(idleClock(run29)).toMatchObject({ label: 'RUN', shown: 1740 });
    expect(idleClock(intervals)).toMatchObject({ label: 'HARD · 1 OF 2', shown: 180 });
    expect(idleClock(emom3)).toMatchObject({ label: 'EMOM · MINUTE 1 OF 3', shown: 60 });
  });

  it('reads to VoiceOver as what it will run', () => {
    expect(clockVoiceLabel(idleClock(amrap10), amrap10)).toBe('AMRAP, 10 minutes');
    expect(clockVoiceLabel(idleClock(fran), fran)).toBe('For Time, 8 minute cap');
    expect(clockVoiceLabel(idleClock(run29), run29)).toBe('Run, 29 minutes');
    expect(clockVoiceLabel(idleClock(intervals), intervals)).toBe('Intervals, 2 sets of 3 minutes hard');
    expect(clockVoiceLabel(idleClock(emom3), emom3)).toBe('EMOM, 3 minutes');
  });

  it('names what Start starts', () => {
    expect(startVoiceLabel(amrap10)).toBe('Start the AMRAP');
    expect(startVoiceLabel(fran)).toBe('Start the For Time clock');
    expect(startVoiceLabel(run29)).toBe('Start the run');
    expect(startVoiceLabel({ ...run29, noun: 'Walk' })).toBe('Start the walk');
    expect(startVoiceLabel(intervals)).toBe('Start the intervals');
    expect(startVoiceLabel(emom3)).toBe('Start the EMOM');
  });
});
