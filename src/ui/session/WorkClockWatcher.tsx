import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { getSettings } from '../../db/repositories/settingsRepo';
import { getActiveRest } from '../../db/repositories/workoutsRepo';
import type { Db } from '../../db/types';
import { cuesLeft, dueCue } from '../../domain/workClock';
import { announce } from '../../platform/announce';
import { playBell } from '../../platform/restTimer/bell';
import { useDbQuery } from '../../state/dataVersion';
import { workCueDealtWith } from '../../state/workClockActions';

/** How often the clock is read while a work clock runs, as the rest watcher reads its own. */
const TICK_MS = 250;

/** Module-level so `useDbQuery` reads again only when the data changes. */
function readWork(db: Db) {
  const { workTimer, restBell, restBellSound, restBellVolume } = getSettings(db);
  return { timer: workTimer, workoutId: getActiveRest(db)?.workoutId ?? null, bell: restBell, sound: restBellSound, volume: restBellVolume };
}

/** The rest bell's haptic. The web has none, and a missing one never stops the bell. */
function cueHaptic(): void {
  if (Platform.OS === 'web') return;
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    // no haptics here
  }
}

/**
 * Rings the work clock's cues wherever the lifter is in the app (Task 7b), as `RestWatcher` rings the rest: the go after
 * the lead-in, each interval step or EMOM minute, and the end, with the rest bell's haptic and its sound and volume when
 * Settings has the bell on, and the words for VoiceOver; the minute-left warning is said only. Each cue once: a cue is
 * written as dealt with (`rang`) before the next read, so a resume after a lock never rings it again, and a cue long
 * past (its lock-screen notification rang it) is only caught up on, quietly. Mounted once at the root; it draws nothing,
 * and reads the clock only while one runs.
 */
export function WorkClockWatcher(): null {
  const db = useDb();
  const { timer, workoutId, bell, sound, volume } = useDbQuery(readWork);
  // It reads the clock only while one runs with a cue still to ring: once the end has rung, it stops (`cuesLeft`).
  const live = timer !== null && timer.workoutId === workoutId && timer.pausedAt === null && cuesLeft(timer);
  const [now, setNow] = useState(() => Date.now());
  /** The cue last dealt with, by the clock's start and its index, so a slow read-back cannot ring it twice. */
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const handle = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(handle);
  }, [live]);

  useEffect(() => {
    if (!live || timer === null) return;
    const due = dueCue(timer, now);
    if (due === null) return;
    const key = `${timer.startsAt}:${due.index}`;
    if (handled.current === key) return;
    handled.current = key;
    if (due.audible) {
      if (due.cue.title !== null) {
        cueHaptic();
        if (bell) void playBell(sound, volume);
      }
      announce(due.cue.say);
    }
    workCueDealtWith(db, due.index, due.cue.kind);
  }, [db, live, timer, now, bell, sound, volume]);

  return null;
}
