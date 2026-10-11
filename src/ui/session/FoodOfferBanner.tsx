import { Ionicons } from '@expo/vector-icons';
import { useCallback, type ReactElement } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { foodOfferDue } from '../../db/repositories/foodOfferRepo';
import type { Db } from '../../db/types';
import { useIsPro } from '../../platform/entitlements';
import { useDbQuery } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { acceptFoodOffer, dismissFoodOffer } from '../../state/sessionActions';
import { Button } from '../Button';
import { Body } from '../Text';
import { useTheme } from '../ThemeProvider';

/**
 * The Short on food offer, under the session header (§7.10, R152): a slim `surface` row with a `borderStrong` edge,
 * the line, a compact filled **Mark it** and a 44pt × (VoiceOver "Dismiss"). It shows while `foodOfferDue` says so,
 * with Pro read live, so turning Pro off hides it at once. Both buttons save what is typed first; either one records
 * the offer, so it never comes back for this workout. The header above already clears the safe area, so the row adds
 * no top padding. Mark it is announced by `acceptFoodOffer`.
 */
export function FoodOfferBanner({ workoutId }: { workoutId: string }): ReactElement | null {
  const db = useDb();
  const isPro = useIsPro();
  const { colors } = useTheme();
  const query = useCallback((d: Db) => foodOfferDue(d, workoutId, isPro), [workoutId, isPro]);
  const due = useDbQuery(query);
  if (!due) return null;

  const before = () => {
    flushAll();
    Keyboard.dismiss();
  };
  const onMark = () => {
    before();
    acceptFoodOffer(db, workoutId);
  };
  const onDismiss = () => {
    before();
    dismissFoodOffer(db, workoutId);
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
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Body style={{ flex: 1, minWidth: 0, fontSize: 15 }}>Protein is behind today. Mark this session Short on food?</Body>
        <Button label="Mark it" size="compact" onPress={onMark} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          style={({ pressed }) => ({ width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}
