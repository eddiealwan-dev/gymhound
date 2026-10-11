import { useEffect, useRef, useState, type ReactElement } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { logFood } from '../../db/repositories/foodLogRepo';
import { entryTotals, type FoodPerServing, fuelNumber, parseServings, servingsText } from '../../domain/fuel';
import { announce } from '../../platform/announce';
import { bumpData } from '../../state/dataVersion';
import { deviceLocale } from '../body/BodyLog';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { Body } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';
import { FuelField } from './MacroFields';

/** The servings chips (R141), with what VoiceOver says for each. */
const CHIPS = [
  { value: 0.5, label: '½', spoken: 'Half a serving' },
  { value: 1, label: '1', spoken: '1 serving' },
  { value: 1.5, label: '1½', spoken: '1 and a half servings' },
  { value: 2, label: '2', spoken: '2 servings' },
] as const;

/** "{kcal} kcal · {protein} g protein", each rounded once (R156). */
export function kcalProteinText(t: { kcal: number; proteinG: number }, locale?: string): string {
  return `${fuelNumber(t.kcal, locale)} kcal · ${fuelNumber(t.proteinG, locale)} g protein`;
}

/** A sheet title as ConfirmSheet draws it (Display 700); VoiceOver moves to it when the sheet opens. */
function SheetTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  const ref = useRef<Text>(null);
  useEffect(() => {
    if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
  }, []);
  return (
    <Text ref={ref} accessibilityRole="header" style={{ fontFamily: fonts.display700, fontSize: 28, color: colors.text, marginBottom: 4 }}>
      {children}
    </Text>
  );
}

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
  const servings = parseServings(draft);
  const grams = food.servingGrams === null ? '' : ` (${food.servingGrams.toLocaleString(locale, { maximumFractionDigits: 1 })} g)`;

  const change = (text: string) => {
    setDraft(text);
    setInvalid(false);
  };

  const add = () => {
    if (servings === null) {
      setInvalid(true);
      announce('Check this number');
      return;
    }
    logFood(db, food.id, servings, localDate, Date.now());
    bumpData();
    onAdded(food.name);
  };

  return (
    <>
      <SheetTitle>{food.name}</SheetTitle>
      <Body muted style={{ marginBottom: 16 }}>{`${food.servingLabel}${grams}`}</Body>
      <View style={{ gap: 12, marginBottom: 24 }}>
        <FuelField label="Servings" value={draft} onChangeText={change} onSubmit={add} numeric error={invalid ? 'Check this number' : undefined} />
        {/* 4pt inset keeps each pill's 4pt hit slop inside the row. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 4, margin: -4 }}>
          {CHIPS.map((chip) => {
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
        <Button label="Cancel" variant="secondary" onPress={onClose} />
        {food.source === 'custom' ? <Button label="Edit food" variant="quiet" onPress={() => onEdit(food.id)} /> : null}
      </View>
    </>
  );
}

/**
 * How many servings of `food` to log for `localDate` (R141): its serving (and weight when known), a servings field that
 * starts at 1 and takes a comma or a dot, the ½ 1 1½ 2 chips, and the calories and protein those servings come to.
 * **Add** logs and hands the name to `onAdded`; bad servings show "Check this number" and log nothing. Your own food
 * also offers **Edit food**. Closed while `food` is null.
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
  return (
    <Sheet visible={food !== null} onClose={onClose}>
      {/* A fresh field for each food: what one held never shows in another's. */}
      {food !== null ? <ServingsContent key={food.id} food={food} localDate={localDate} onClose={onClose} onAdded={onAdded} onEdit={onEdit} /> : null}
    </Sheet>
  );
}
