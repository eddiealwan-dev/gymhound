import { useRef, useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { logFood } from '../../db/repositories/foodLogRepo';
import { entryTotals, type FoodPerServing, kcalProteinText, parseServings, SERVING_CHIPS, servingsText } from '../../domain/fuel';
import { announce } from '../../platform/announce';
import { deviceLocale } from '../../platform/locale';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { SheetTitle } from '../SheetTitle';
import { Body } from '../Text';
import { FuelField } from './MacroFields';

type ContentProps = {
  food: FoodPerServing;
  localDate: string;
  onClose: () => void;
  onAdded: (name: string) => void;
  onEdit: (id: string) => void;
};

function ServingsContent({ food, localDate, onClose, onAdded, onEdit }: ContentProps) {
  const db = useDb();
  const locale = deviceLocale();
  const [draft, setDraft] = useState(() => servingsText(1, locale));
  const [invalid, setInvalid] = useState(false);
  /** Logged already: a second tap before the sheet closes logs nothing more. */
  const addedRef = useRef(false);
  const servings = parseServings(draft);
  const grams = food.servingGrams === null ? '' : ` (${food.servingGrams.toLocaleString(locale, { maximumFractionDigits: 1 })} g)`;

  const change = (text: string) => {
    setDraft(text);
    setInvalid(false);
  };

  const add = () => {
    if (addedRef.current) return;
    if (servings === null) {
      setInvalid(true);
      announce('Check this number');
      return;
    }
    addedRef.current = true;
    logFood(db, food.id, servings, localDate, Date.now());
    bumpData();
    onAdded(food.name);
  };

  return (
    <>
      <SheetTitle marginBottom={4}>{food.name}</SheetTitle>
      <Body muted style={{ marginBottom: 16 }}>{`${food.servingLabel}${grams}`}</Body>
      <View style={{ gap: 12, marginBottom: 24 }}>
        <FuelField label="Servings" value={draft} onChangeText={change} onSubmit={add} numeric error={invalid ? 'Check this number' : undefined} />
        {/* 4pt inset keeps each pill's 4pt hit slop inside the row. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 4, margin: -4 }}>
          {SERVING_CHIPS.map((chip) => {
            const chosen = servings === chip.value;
            return (
              <Button
                key={chip.value}
                label={chip.label}
                accessibilityLabel={chip.spoken}
                size="compact"
                variant={chosen ? 'primary' : 'secondary'}
                selected={chosen}
                onPress={() => change(servingsText(chip.value, locale))}
              />
            );
          })}
        </View>
        {servings !== null ? <Body>{kcalProteinText(entryTotals(food, servings), locale)}</Body> : null}
      </View>
      <View style={{ gap: 8 }}>
        <Button label="Add" onPress={add} />
        <Button label="Cancel" variant="quiet" onPress={onClose} />
        {food.source === 'custom' ? <Button label="Edit food" variant="quiet" onPress={() => onEdit(food.id)} /> : null}
      </View>
    </>
  );
}

/**
 * How many servings of `food` to log for `localDate` (R141): its serving (and weight when known), a servings field that
 * starts at 1 and takes a comma or a dot, the ½ 1 1½ 2 chips, and the calories and protein those servings come to.
 * **Add** logs and hands the name to `onAdded`; bad servings show "Check this number" and log nothing. Your own food
 * also offers **Edit food**. Closed while `food` is null; the last food stays drawn while the sheet fades out.
 */
export function ServingsSheet({
  food,
  localDate,
  onClose,
  onAdded,
  onEdit,
}: {
  food: FoodPerServing | null;
  localDate: string;
  onClose: () => void;
  onAdded: (name: string) => void;
  onEdit: (id: string) => void;
}): ReactElement {
  // The food drawn, and how many times the sheet has opened: each opening is a fresh field, even for the same food.
  const [shown, setShown] = useState<{ food: FoodPerServing; opening: number } | null>(null);
  const [lastFood, setLastFood] = useState<FoodPerServing | null>(null);
  if (food !== lastFood) {
    setLastFood(food);
    if (food !== null) setShown({ food, opening: (shown?.opening ?? 0) + 1 });
  }
  return (
    <Sheet visible={food !== null} onClose={onClose}>
      {shown !== null ? (
        <ServingsContent key={shown.opening} food={shown.food} localDate={localDate} onClose={onClose} onAdded={onAdded} onEdit={onEdit} />
      ) : null}
    </Sheet>
  );
}
