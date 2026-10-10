import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { getSettings } from '../../db/repositories/settingsRepo';
import { getActiveRest } from '../../db/repositories/workoutsRepo';
import type { Db } from '../../db/types';
import { restPhase, wasAwayAt, type AwaySpan } from '../../domain/rest';
import { playBell } from '../../platform/restTimer/bell';
import { useDbQuery } from '../../state/dataVersion';
import { restEnded } from '../../state/sessionActions';

/** How often the clock is read, while a rest is running. */
const TICK_MS = 250;

/** Module-level so `useDbQuery` reads again only when the data changes. */
function readRest(db: Db) {
  const { restBell, restBellSound } = getSettings(db);
  return { rest: getActiveRest(db), bell: restBell, sound: restBellSound };
}

/** A success haptic when the rest ends. The web has none, and a missing one never stops the bell. */
function endHaptic(): void {
  if (Platform.OS === 'web') return;
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    // no haptics here
  }
}

/**
 * Rings the end of the rest timer wherever the user is in the app, so leaving the session for Train mid-rest changes nothing.
 * Mounted once at the root. It draws nothing, and ticks only while a rest is running.
 *
 * When the time runs out while it is watching: a haptic (native), then the bell if Settings has it on (the bell ducks
 * any music), then it clears the rest (`restEnded`, which leaves the notification alone: it fires on its own). Once per
 * rest end. A rest that ended while the app was away or closed is cleared quietly (see `restPhase`): on the phone the
 * notification already rang, and ringing again on return would double it. The web has no notification, so it rings.
 *
 * "Away" means `background` only. On iOS, Control Center, Notification Center and the app switcher make the app
 * `inactive` while it is still in front, and the foreground notification handler is silent, so nothing else would ring.
 */
export function RestWatcher(): null {
  const db = useDb();
  const { rest, bell, sound } = useDbQuery(readRest);
  const endsAt = rest?.restEndsAt ?? null;
  const workoutId = rest?.workoutId ?? null;
  const running = endsAt !== null;
  const [now, setNow] = useState(() => Date.now());
  /** Whether the last look found time left: only a rest watched running out rings. */
  const wasRunning = useRef(false);
  /** The end time already dealt with, so a slow read-back cannot ring it twice. */
  const handled = useRef<number | null>(null);
  /** The latest stretch the app was not in the foreground. A rest that ended inside it was rung by the notification. */
  const away = useRef<AwaySpan | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (AppState.currentState === 'background') away.current = { from: Date.now(), to: null };
    const subscription = AppState.addEventListener('change', (state) => {
      const t = Date.now();
      if (state === 'background') {
        if (away.current === null || away.current.to !== null) away.current = { from: t, to: null };
      } else if (state === 'active' && away.current !== null && away.current.to === null) {
        // Coming back from the background passes through `inactive`, which leaves the span open until the app is active.
        away.current = { ...away.current, to: t };
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (endsAt === null || workoutId === null) {
      wasRunning.current = false;
      return;
    }
    const phase = restPhase(endsAt, now, wasRunning.current, wasAwayAt(away.current, endsAt));
    wasRunning.current = phase === 'running';
    if (phase === 'running' || handled.current === endsAt) return;
    handled.current = endsAt;
    if (phase === 'ring') {
      endHaptic();
      if (bell) void playBell(sound);
    }
    restEnded(db, workoutId, endsAt);
  }, [db, workoutId, endsAt, now, bell, sound]);

  return null;
}
