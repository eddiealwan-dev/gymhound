import { router } from 'expo-router';
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

/**
 * The free limit (§8.6, R88): free holds one routine of your own. `whenRoomFor(add)` runs `add` when another fits (Pro
 * is on, or there is none of your own yet), counting when it is tapped, so deleting your routine frees the slot.
 * Otherwise it opens the limit sheet, whose **See Pro** closes it and, once it has gone, opens the paywall (R138).
 * New routine, Duplicate and the editor's Save of a new routine all go through it; render `sheets` once.
 */
export function useRoutineLimit(): { whenRoomFor: (add: () => void) => void; sheets: ReactNode } {
  const db = useDb();
  const entitlements = entitlementsFor(db);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const whenRoomFor = (add: () => void) => {
    if (canAddRoutine(userRoutineCount(db), entitlements.isPro())) add();
    else setOpen(true);
  };

  const sheets = (
    <Sheet visible={open} onClose={close}>
      <Body style={{ marginBottom: 16 }}>Free holds one routine of your own. GymHound Pro holds as many as you like.</Body>
      <View style={{ gap: 8 }}>
        <Button
          label="See Pro"
          onPress={() => {
            close();
            afterSheetCloses(() => router.push('/paywall'));
          }}
        />
        <Button label="Not now" variant="secondary" onPress={close} />
      </View>
    </Sheet>
  );

  return { whenRoomFor, sheets };
}
