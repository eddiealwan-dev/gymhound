import { Share } from 'react-native';
import { sharedRoutineFor } from '../db/repositories/routineShareRepo';
import type { Db } from '../db/types';
import { encodePremade, encodeRoutine, isShareablePremade, shareMessage } from '../domain/routineShare';
import { storeUrl } from '../platform/runtime';

/**
 * Opens the share sheet with the routine's message: what it is and the code (§18.18, R463, R473). Text only,
 * so it goes into any messaging app; nothing is uploaded. 'failed' is logged; a dismissed sheet is not a failure.
 */
export async function shareRoutine(db: Db, routineId: string): Promise<'shared' | 'dismissed' | 'failed'> {
  try {
    const shared = sharedRoutineFor(db, routineId);
    if (shared === null) throw new Error(`No routine with id ${routineId}.`);
    // A premade program travels by name, a dozen characters; a routine of your own as a whole (R472).
    const code = isShareablePremade(routineId) ? encodePremade(routineId) : encodeRoutine(shared);
    const message = shareMessage(shared.name, code, storeUrl());
    const result = await Share.share({ message });
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch (error) {
    console.warn('GymHound could not share the routine.', error);
    return 'failed';
  }
}
