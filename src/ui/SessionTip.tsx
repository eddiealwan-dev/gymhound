import type { ReactElement } from 'react';
import { useDb } from '../db/DbProvider';
import { finishedWorkoutCount } from '../db/repositories/onboardingRepo';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import type { Db } from '../db/types';
import { bumpData, useDbQuery } from '../state/dataVersion';
import { Hint } from './Hint';

export const SESSION_TIP = "Tap an exercise's name to see how it's done. ⋯ has its rest time, the plates to load and more.";
/** What VoiceOver reads: ⋯ is the Options button there. */
export const SESSION_TIP_SPOKEN = "Tap an exercise's name to see how it's done. Its Options button has its rest time, the plates to load and more.";

/** Whether the tip shows: before the first finished workout, until dismissed (R408). */
function readSessionTip(db: Db): { sessionTip: boolean } {
  return { sessionTip: !getSettings(db).hintSessionDismissed && finishedWorkoutCount(db) === 0 };
}

/**
 * The session's one-time first-run tip (§18.15, R408), over the first exercise: the two things the screen can't show at
 * a glance, that the name opens the form demo and that ⋯ holds the rest time and the plates. Something off and + Note
 * are already words on the screen, so it leaves them out. It shows only to a lifter who has never finished a workout,
 * and the × puts it away for good.
 */
export function SessionTip(): ReactElement | null {
  const db = useDb();
  const { sessionTip } = useDbQuery(readSessionTip);
  // Strictly true: a read that says nothing about the tip (a test's stand-in) shows nothing.
  if (sessionTip !== true) return null;
  return (
    <Hint
      style={{ marginBottom: 24 }}
      text={SESSION_TIP}
      spoken={SESSION_TIP_SPOKEN}
      onDismiss={() => {
        setSetting(db, 'hintSessionDismissed', true);
        bumpData();
      }}
    />
  );
}
