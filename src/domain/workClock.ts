import { formatRest } from './dates';
import { spokenRest } from './rest';

/**
 * The work clock (Task 7b): the timer of a metcon, a run, intervals or an EMOM, drawn as the rest row's twin. Like the
 * rest timer it runs on the wall clock: what is stored is when the work starts and how long it has been paused, and
 * every number on screen is worked out from those and the time now, so it survives the phone locking, the app being
 * closed and a reload. Nothing here ticks.
 */

export type WorkClockKind = 'amrap' | 'for_time' | 'run' | 'intervals' | 'emom';

/**
 * One stretch of the clock: the work of a metcon or a run, a hard or easy part of an interval, or an EMOM's minute.
 * `set` is the set it belongs to (1-based). `holdAfter` makes the clock wait at its end until Start (intervals with no
 * easy part).
 */
export type WorkStep = { kind: 'work' | 'easy' | 'minute'; seconds: number; set: number; holdAfter?: boolean };

/** What the clock runs: its kind, the word it is called by ("Run", "Walk", "AMRAP") and its steps in order. */
export type WorkPlan = { kind: WorkClockKind; noun: string; steps: readonly WorkStep[] };

/** The clock as stored (settings key `work_timer`). Times are epoch ms. */
export type WorkTimer = {
  workoutId: string;
  workoutExerciseId: string;
  plan: WorkPlan;
  /** When the work starts: the Start tap plus the lead-in. */
  startsAt: number;
  /** When it was paused, or null while it runs. */
  pausedAt: number | null;
  /** Time spent paused before `pausedAt`, and time spent waiting at released holds. */
  pausedMs: number;
  /** How many holds (`holdAfter`) have been released with Start. */
  released: number;
  /** How many cues (`cuesOf`) have been dealt with: rung, said, or passed while away. */
  rang: number;
  /** Where Done stopped it, in whole seconds of work, or null while it goes. */
  doneAtS: number | null;
};

/** The time between Start and the work, to put the phone down and get to the bar. */
export const LEAD_IN_MS = 10_000;

/** The most notifications scheduled at once for one clock (R-t7b1). iOS keeps 64 pending for the whole app. */
export const CUE_LIMIT = 30;

/** A cue rings out loud only within this long of its time; one further past was rung by its notification. */
export const CUE_RING_WINDOW_MS = 3_000;

const sumMs = (steps: readonly WorkStep[]) => steps.reduce((total, step) => total + step.seconds * 1000, 0);
const setCount = (plan: WorkPlan) => plan.steps.reduce((most, step) => Math.max(most, step.set), 0);
const countsUp = (plan: WorkPlan) => plan.kind === 'for_time';

/** A new clock for `plan`, its work starting after the lead-in. */
export function startTimer(a: { workoutId: string; workoutExerciseId: string; plan: WorkPlan }, now: number): WorkTimer {
  return { ...a, startsAt: now + LEAD_IN_MS, pausedAt: null, pausedMs: 0, released: 0, rang: 0, doneAtS: null };
}

/** The ends of the steps that hold, in ms of work, in order. */
function holdEnds(plan: WorkPlan): number[] {
  const ends: number[] = [];
  let at = 0;
  for (const step of plan.steps) {
    at += step.seconds * 1000;
    if (step.holdAfter) ends.push(at);
  }
  return ends;
}

/** The ms of work as of `now` before any hold: negative in the lead-in, frozen while paused. */
const rawElapsed = (t: WorkTimer, now: number) => (t.pausedAt ?? now) - t.startsAt - t.pausedMs;

/** The ms of work done, held at the first hold not yet released, and whether it is waiting there. */
function elapsed(t: WorkTimer, now: number): { ms: number; waiting: boolean } {
  const raw = rawElapsed(t, now);
  const hold = holdEnds(t.plan)[t.released];
  if (hold !== undefined && raw >= hold) return { ms: hold, waiting: true };
  return { ms: raw, waiting: false };
}

export function pauseTimer(t: WorkTimer, now: number): WorkTimer {
  return t.pausedAt !== null || t.doneAtS !== null ? t : { ...t, pausedAt: now };
}

export function resumeTimer(t: WorkTimer, now: number): WorkTimer {
  return t.pausedAt === null ? t : { ...t, pausedAt: null, pausedMs: t.pausedMs + (now - t.pausedAt) };
}

/** Done: the clock stops where it is, in whole seconds of work. */
export function stopTimer(t: WorkTimer, now: number): WorkTimer {
  if (t.doneAtS !== null) return t;
  const ms = Math.min(Math.max(0, elapsed(t, now).ms), sumMs(t.plan.steps));
  return { ...t, doneAtS: Math.floor(ms / 1000), pausedAt: null };
}

/** Start at a hold: the next set starts now, the time waited counted as paused. */
export function releaseHold(t: WorkTimer, now: number): WorkTimer {
  const hold = holdEnds(t.plan)[t.released];
  if (hold === undefined) return t;
  const raw = rawElapsed(t, now);
  if (raw < hold) return t;
  return { ...t, released: t.released + 1, pausedMs: t.pausedMs + (raw - hold) };
}

export type ClockPhase = 'ready' | 'running' | 'paused' | 'waiting' | 'ended';

export type ClockState = {
  phase: ClockPhase;
  /** The words over the time, upper case as drawn ("AMRAP", "HARD · 2 OF 6", "GET READY"). */
  label: string;
  /** The seconds the clock shows: left in the step, the lead-in left, or for For Time the seconds done. */
  shown: number;
  /** How much of the track is drawn: the share of the step left, or of the cap done for For Time. */
  fraction: number;
  /** For Time's cap in seconds; null for the others. */
  capS: number | null;
  /** The step the clock is in (0-based), and its set (1-based). */
  stepIndex: number;
  set: number;
  /** Once ended: the line it holds. */
  endLine: string | null;
  /** Once ended, for For Time and a run: the time to log. */
  timeS: number | null;
};

const STEP_WORD = { work: 'HARD', easy: 'EASY' } as const;

function stepLabel(plan: WorkPlan, step: WorkStep): string {
  switch (plan.kind) {
    case 'amrap':
      return 'AMRAP';
    case 'for_time':
      return 'FOR TIME';
    case 'run':
      return plan.noun.toUpperCase();
    case 'intervals':
      return `${STEP_WORD[step.kind === 'easy' ? 'easy' : 'work']} · ${step.set} OF ${setCount(plan)}`;
    case 'emom':
      return `EMOM · MINUTE ${step.set} OF ${setCount(plan)}`;
  }
}

/** The line an ended clock holds: run to its end, or stopped with Done at `doneAtS`. */
function endLineOf(plan: WorkPlan, doneAtS: number | null): string {
  const total = sumMs(plan.steps) / 1000;
  if (doneAtS !== null) {
    const at = `Stopped at ${formatRest(doneAtS)}.`;
    switch (plan.kind) {
      case 'amrap':
        return `${at} Enter your rounds.`;
      case 'for_time':
      case 'run':
        return `${at} Tick to log it.`;
      case 'intervals':
        return `${at} Tick each set you ran.`;
      case 'emom':
        return at;
    }
  }
  switch (plan.kind) {
    case 'amrap':
      return 'Time. Enter your rounds.';
    case 'for_time':
      return `Cap reached. ${formatRest(total)} is your time.`;
    case 'run':
      return `${formatRest(total)} done. Tick to log it.`;
    case 'intervals': {
      const n = setCount(plan);
      return `${n} of ${n} done. Tick each set you ran.`;
    }
    case 'emom':
      return `${Math.round(total / 60)} minutes done.`;
  }
}

/** The step `ms` of work falls in, and the ms into it. Past the end, the last step, full. */
function stepAt(plan: WorkPlan, ms: number): { index: number; into: number } {
  let start = 0;
  for (let i = 0; i < plan.steps.length; i++) {
    const end = start + plan.steps[i].seconds * 1000;
    if (ms < end) return { index: i, into: ms - start };
    start = end;
  }
  const last = plan.steps.length - 1;
  return { index: last, into: plan.steps[last].seconds * 1000 };
}

/** The clock at `now`, worked out from what is stored. */
export function clockAt(t: WorkTimer, now: number): ClockState {
  const { plan } = t;
  const totalMs = sumMs(plan.steps);
  const capS = countsUp(plan) ? totalMs / 1000 : null;
  const base = { capS, endLine: null, timeS: null };
  const { ms, waiting } = elapsed(t, now);
  const ended = t.doneAtS !== null || ms >= totalMs;
  if (ended) {
    const timeS = plan.kind === 'for_time' || plan.kind === 'run' ? (t.doneAtS ?? totalMs / 1000) : null;
    const last = plan.steps.length - 1;
    return {
      phase: 'ended',
      label: stepLabel(plan, plan.steps[last]),
      shown: countsUp(plan) ? (timeS ?? 0) : 0,
      fraction: countsUp(plan) ? 1 : 0,
      capS,
      stepIndex: last,
      set: plan.steps[last].set,
      endLine: endLineOf(plan, t.doneAtS),
      timeS,
    };
  }
  const paused = t.pausedAt !== null;
  if (ms < 0) {
    const shown = Math.ceil(-ms / 1000);
    return { ...base, phase: paused ? 'paused' : 'ready', label: 'GET READY', shown, fraction: shown / (LEAD_IN_MS / 1000), stepIndex: 0, set: plan.steps[0].set };
  }
  const { index, into } = stepAt(plan, ms);
  const step = plan.steps[index];
  if (waiting) {
    // At a hold: the next set is shown full, waiting for Start.
    const next = plan.steps[index] ?? step;
    return { ...base, phase: 'waiting', label: stepLabel(plan, next), shown: next.seconds, fraction: 1, stepIndex: index, set: next.set };
  }
  const phase: ClockPhase = paused ? 'paused' : 'running';
  if (countsUp(plan)) {
    const shown = Math.floor(ms / 1000);
    return { ...base, phase, label: stepLabel(plan, step), shown, fraction: shown / (totalMs / 1000), stepIndex: index, set: step.set };
  }
  const shown = Math.ceil((step.seconds * 1000 - into) / 1000);
  return { ...base, phase, label: stepLabel(plan, step), shown, fraction: shown / step.seconds, stepIndex: index, set: step.set };
}

/**
 * A moment the clock calls out: the go after the lead-in, each step, a minute-left warning (spoken only) and the end.
 * `atMs` is in ms of work; `title` is the lock-screen notification's, null for the spoken-only warning; `say` is what
 * VoiceOver is told. `hold` marks the end of a step that waits for Start.
 */
export type Cue = { atMs: number; kind: 'go' | 'step' | 'warn' | 'end'; title: string | null; say: string; hold?: true };

function goSay(plan: WorkPlan): string {
  const total = sumMs(plan.steps) / 1000;
  const first = plan.steps[0];
  switch (plan.kind) {
    case 'amrap':
    case 'run':
      return `Go. ${plan.noun}, ${spokenRest(total)}.`;
    case 'for_time':
      return `Go. For Time, ${Math.round(total / 60)} minute cap.`;
    case 'intervals':
      return `Go. Hard, ${first.set} of ${setCount(plan)}.`;
    case 'emom':
      return `Go. Minute ${first.set} of ${setCount(plan)}.`;
  }
}

/** The cue at the start of `step` (not the first). */
function stepCue(plan: WorkPlan, step: WorkStep, atMs: number): Cue {
  if (step.kind === 'easy') return { atMs, kind: 'step', title: 'Easy.', say: `Easy, ${spokenRest(step.seconds)}.` };
  if (step.kind === 'minute') return { atMs, kind: 'step', title: `Minute ${step.set}.`, say: `Minute ${step.set}.` };
  const n = setCount(plan);
  return { atMs, kind: 'step', title: `Hard. ${step.set} of ${n}.`, say: `Hard, ${step.set} of ${n}.` };
}

/** Every cue of the clock, in time order. */
export function cuesOf(t: Pick<WorkTimer, 'plan'>): Cue[] {
  const { plan } = t;
  const totalMs = sumMs(plan.steps);
  const cues: Cue[] = [{ atMs: 0, kind: 'go', title: 'Go.', say: goSay(plan) }];
  let at = 0;
  plan.steps.forEach((step, i) => {
    at += step.seconds * 1000;
    const next = plan.steps[i + 1];
    if (!next) return;
    if (step.holdAfter) cues.push({ atMs: at, kind: 'step', title: `Set ${next.set} next.`, say: `Set ${next.set} next. Tap Start when ready.`, hold: true });
    else cues.push(stepCue(plan, next, at));
  });
  if ((plan.kind === 'amrap' || plan.kind === 'run' || plan.kind === 'for_time') && totalMs > 60_000) {
    const say = plan.kind === 'for_time' ? '1 minute to the cap.' : '1 minute left.';
    cues.push({ atMs: totalMs - 60_000, kind: 'warn', title: null, say });
  }
  const endTitle = plan.kind === 'amrap' ? 'Time.' : plan.kind === 'for_time' ? 'Cap reached.' : `${plan.noun} done.`;
  cues.push({ atMs: totalMs, kind: 'end', title: endTitle, say: endLineOf(plan, null) });
  return cues.sort((a, b) => a.atMs - b.atMs);
}

/** When a cue falls, in epoch ms, as the clock now stands. */
const cueTime = (t: WorkTimer, cue: Cue) => t.startsAt + t.pausedMs + cue.atMs;

/**
 * The newest cue that has come due and not been dealt with (`rang`), with its index (1-based, the new `rang`), and
 * whether to ring it out loud: only within `CUE_RING_WINDOW_MS` of its time, since one long past (the phone was
 * locked) was rung by its notification. Null when nothing new is due, or the clock was stopped.
 */
export function dueCue(t: WorkTimer, now: number): { index: number; cue: Cue; audible: boolean } | null {
  if (t.doneAtS !== null) return null;
  const cues = cuesOf(t);
  const { ms } = elapsed(t, now);
  const due = cues.filter((c) => c.atMs <= ms).length;
  if (due <= t.rang) return null;
  const cue = cues[due - 1];
  return { index: due, cue, audible: t.pausedAt === null && now - cueTime(t, cue) <= CUE_RING_WINDOW_MS };
}

/**
 * The lock-screen notifications to schedule (R-t7b1): every cue with a title still to come, at its time, up to and
 * including the next hold not yet released, at most `CUE_LIMIT`. None while paused, waiting or stopped.
 */
export function notificationCues(t: WorkTimer, now: number): { at: number; title: string }[] {
  if (t.pausedAt !== null || t.doneAtS !== null || elapsed(t, now).waiting) return [];
  const out: { at: number; title: string }[] = [];
  let holds = 0;
  for (const cue of cuesOf(t)) {
    if (cue.title !== null && cueTime(t, cue) > now) out.push({ at: cueTime(t, cue), title: cue.title });
    if (cue.hold) {
      holds += 1;
      if (holds > t.released) break;
    }
  }
  return out.slice(0, CUE_LIMIT);
}

/** What VoiceOver reads for the time: a duration with what the clock is, or the end line once ended. */
export function clockVoiceLabel(state: ClockState, plan: WorkPlan): string {
  if (state.phase === 'ended') return state.endLine ?? '';
  const paused = state.phase === 'paused' ? ', paused' : '';
  const time = spokenRest(state.shown);
  if (state.label === 'GET READY') return `Get ready, ${time}${paused}`;
  const step = plan.steps[state.stepIndex];
  const n = setCount(plan);
  if (state.phase === 'waiting') return `Set ${state.set} next, ${time}. Tap Start when ready`;
  switch (plan.kind) {
    case 'amrap':
    case 'run':
      return `${plan.noun}, ${time} left${paused}`;
    case 'for_time':
      return `For Time, ${time}, cap ${spokenRest(state.capS ?? 0)}${paused}`;
    case 'intervals':
      return `${step.kind === 'easy' ? 'Easy' : 'Hard'}, interval ${state.set} of ${n}, ${time} left${paused}`;
    case 'emom':
      return `EMOM, minute ${state.set} of ${n}, ${time} left${paused}`;
  }
}
