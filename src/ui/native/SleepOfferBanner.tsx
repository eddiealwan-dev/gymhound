import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Keyboard, Pressable, useWindowDimensions, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { sleepOfferOpen } from '../../db/repositories/healthRepo';
import type { Db } from '../../db/types';
import { roughSleepOfferLine, type RoughSleepReason } from '../../domain/health';
import { getHealthStore } from '../../platform/health';
import { useDbQuery } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { acceptSleepOffer, dismissSleepOffer, roughSleepOfferFor } from '../../state/healthSync';
import { Button } from '../Button';
import { Body } from '../Text';
import { useTheme } from '../ThemeProvider';

/** As the Short on food offer's line: its narrowest comfortable width at the standard text size. */
const LINE_BASIS = 150;

/**
 * PHASE 7: the Rough sleep offer under the session header (§17.1, R309), laid out as the Short on food offer
 * (FoodOfferBanner, R152). Health is read once, when the session opens; the offer shows while it is still open for
 * this workout. Mark it flags every unflagged exercise Rough sleep; × hides it for good. With no health store (Expo Go,
 * the web) it reads nothing and draws nothing.
 */
export function SleepOfferBanner({ workoutId }: { workoutId: string }): ReactElement | null {
  const db = useDb();
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [reason, setReason] = useState<RoughSleepReason | null>(null);
  useEffect(() => {
    const store = getHealthStore();
    if (store === null) return;
    let live = true;
    roughSleepOfferFor(db, workoutId, store).then(
      (r) => {
        if (live) setReason(r);
      },
      // The offer is a nicety: a failure shows none.
      (error: unknown) => console.warn('GymHound: the Rough sleep offer could not be worked out.', error),
    );
    return () => {
      live = false;
    };
  }, [db, workoutId]);
  const open = useDbQuery(useCallback((d: Db) => sleepOfferOpen(d, workoutId), [workoutId]));
  if (reason === null || !open) return null;

  const before = () => {
    flushAll();
    Keyboard.dismiss();
  };

  return (
    <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.borderStrong }}>
      <View
        style={{
          width: '100%',
          maxWidth: 512,
          alignSelf: 'center',
          paddingLeft: 16,
          paddingRight: 4,
          paddingVertical: 4,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 8,
          rowGap: 4,
        }}
      >
        <Body style={{ flexGrow: 1, flexShrink: 1, flexBasis: LINE_BASIS * fontScale, minWidth: 0, fontSize: 15 }}>
          {roughSleepOfferLine(reason)}
        </Body>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <Button
            label="Mark it"
            size="compact"
            onPress={() => {
              before();
              acceptSleepOffer(db, workoutId);
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => {
              before();
              dismissSleepOffer(db, workoutId);
            }}
            style={({ pressed }) => ({ width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
