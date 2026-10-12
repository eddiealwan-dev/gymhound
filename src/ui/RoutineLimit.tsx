import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useDb } from '../db/DbProvider';
import { userRoutineCount } from '../db/repositories/routinesRepo';
import { canAddRoutine, proReasonText, type ProReason } from '../domain/routineLimit';
import { entitlementsFor } from '../platform/entitlements';
import { Button } from './Button';
import { useOpenPaywall } from './pro/openPaywall';
import { afterSheetCloses, Sheet } from './Sheet';
import { SheetTitle } from './SheetTitle';

/**
 * The Pro gate (§18.21, R524): `when(allowed, reason, go)` runs `go` when `allowed` (read when tapped, so the trial
 * starting or Pro coming on counts at once); otherwise it opens one sheet saying why, in plain words, with **See Pro**
 * (closes it, then opens the paywall once it has gone, R138) and **Not now**. Render `sheets` once.
 */
export function useProGate(): { when: (allowed: boolean, reason: ProReason, go: () => void) => void; isPro: () => boolean; sheets: ReactNode } {
  const db = useDb();
  const entitlements = entitlementsFor(db);
  const openPaywall = useOpenPaywall();
  const [reason, setReason] = useState<ProReason | null>(null);
  const close = () => setReason(null);

  const when = (allowed: boolean, why: ProReason, go: () => void) => {
    if (allowed) go();
    else setReason(why);
  };

  const sheets = (
    <Sheet visible={reason !== null} onClose={close}>
      <SheetTitle subtitle={reason === null ? null : proReasonText(reason)}>GymHound Pro</SheetTitle>
      <View style={{ gap: 8 }}>
        <Button
          label="See Pro"
          onPress={() => {
            close();
            afterSheetCloses(openPaywall);
          }}
        />
        <Button label="Not now" variant="quiet" onPress={close} />
      </View>
    </Sheet>
  );

  return { when, isPro: () => entitlements.isPro(), sheets };
}

/**
 * Making a routine of your own (§18.21, R521): New routine, Duplicate, the editor's Save of a new routine and Add from
 * code. `whenRoomFor(add)` runs `add` with Pro (or the trial); otherwise the Pro sheet says routines of your own are
 * part of Pro. Render `sheets` once.
 */
export function useRoutineLimit(): { whenRoomFor: (add: () => void) => void; sheets: ReactNode } {
  const db = useDb();
  const gate = useProGate();
  const whenRoomFor = (add: () => void) => gate.when(canAddRoutine(userRoutineCount(db), gate.isPro()), { kind: 'own_routine' }, add);
  return { whenRoomFor, sheets: gate.sheets };
}
