import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useDb } from '../db/DbProvider';
import { userRoutineCount } from '../db/repositories/routinesRepo';
import { canAddRoutine } from '../domain/routineLimit';
import { entitlementsFor } from '../platform/entitlements';
import { Button } from './Button';
import { afterSheetCloses, Sheet } from './Sheet';
import { Body } from './Text';

type Open = 'limit' | 'coming' | null;

/**
 * The free limit (§8.6, R88): free holds one routine of your own. `whenRoomFor(add)` runs `add` when another fits (Pro
 * is on, or there is none of your own yet), counting when it is tapped, so deleting your routine frees the slot.
 * Otherwise it opens the limit sheet, whose **See Pro** says "GymHound Pro is coming." until Pro exists (phase 5).
 * New routine, Duplicate and the editor's Save of a new routine all go through it; render `sheets` once.
 */
export function useRoutineLimit(): { whenRoomFor: (add: () => void) => void; sheets: ReactNode } {
  const db = useDb();
  const entitlements = entitlementsFor(db);
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  const whenRoomFor = (add: () => void) => {
    if (canAddRoutine(userRoutineCount(db), entitlements.isPro())) add();
    else setOpen('limit');
  };

  const sheets = (
    <>
      <Sheet visible={open === 'limit'} onClose={close}>
        <Body style={{ marginBottom: 16 }}>Free holds one routine of your own. GymHound Pro holds as many as you like.</Body>
        <View style={{ gap: 8 }}>
          <Button
            label="See Pro"
            onPress={() => {
              close();
              afterSheetCloses(() => setOpen('coming'));
            }}
          />
          <Button label="Not now" variant="secondary" onPress={close} />
        </View>
      </Sheet>
      <Sheet visible={open === 'coming'} onClose={close}>
        <Body style={{ marginBottom: 16 }}>GymHound Pro is coming.</Body>
        <Button label="OK" onPress={close} />
      </Sheet>
    </>
  );

  return { whenRoomFor, sheets };
}
