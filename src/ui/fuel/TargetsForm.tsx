import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Keyboard, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { setFuelTargets } from '../../db/repositories/foodLogRepo';
import { validateTargets, type MacroInput } from '../../domain/fuel';
import type { FuelTargets, Macros } from '../../domain/types';
import { announce } from '../../platform/announce';
import { bumpData } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { BodyField } from '../body/BodyLog';
import { Button } from '../Button';
import { Body, Label } from '../Text';

type Day = 'training' | 'rest';
type Key = keyof MacroInput;
type Input = Record<Day, MacroInput>;

const KEYS: readonly Key[] = ['kcal', 'protein', 'carbs', 'fat'];

const DAY_LABEL: Record<Day, string> = { training: 'Training day', rest: 'Rest day' };

/** What each field shows above it, what VoiceOver hears, and the name an announced problem uses. */
const FIELD: Record<Key, { shown: string; spoken: string; named: string }> = {
  kcal: { shown: 'Calories', spoken: 'Calories', named: 'calories' },
  protein: { shown: 'Protein (g)', spoken: 'Protein, grams', named: 'protein' },
  carbs: { shown: 'Carbs (g, optional)', spoken: 'Carbs, grams, optional', named: 'carbs' },
  fat: { shown: 'Fat (g, optional)', spoken: 'Fat, grams, optional', named: 'fat' },
};

/** A stored target as the field shows it: blank when not set. */
const asText = (value: number | null) => (value === null ? '' : String(value));

const dayText = (macros: Macros | undefined): MacroInput => ({
  kcal: macros ? asText(macros.kcal) : '',
  protein: macros ? asText(macros.protein) : '',
  carbs: macros ? asText(macros.carbs) : '',
  fat: macros ? asText(macros.fat) : '',
});

const toInput = (targets: FuelTargets | null): Input => ({ training: dayText(targets?.training), rest: dayText(targets?.rest) });

const sameInput = (a: Input, b: Input) => (['training', 'rest'] as const).every((day) => KEYS.every((key) => a[day][key] === b[day][key]));

/** One target: its label, the number field (wrapping under the label at a large text size), and what is wrong with it. */
function TargetField({
  day,
  field,
  value,
  error,
  onChange,
}: {
  day: Day;
  field: Key;
  value: string;
  error: string | undefined;
  onChange: (text: string) => void;
}) {
  const spoken = `${DAY_LABEL[day]}, ${FIELD[field].spoken}`;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Body style={{ flexShrink: 1 }}>{FIELD[field].shown}</Body>
        <BodyField
          value={value}
          onChangeText={onChange}
          onSubmit={() => Keyboard.dismiss()}
          // The problem is part of the field's name, so VoiceOver says it when the field is reached again.
          accessibilityLabel={error ? `${spoken}, ${error}` : spoken}
          invalid={error !== undefined}
        />
      </View>
      {/* Muted, never red, and no live region: Save announces it (`announce`). */}
      {error ? <Body muted>{error}</Body> : null}
    </View>
  );
}

/**
 * Training-day and rest-day targets (R145): calories and protein needed for both days, carbs and fat optional. Save
 * checks them with `validateTargets` ("Needed." or "Check this number" beside each field, all of it announced), writes
 * the `fuelTargets` setting, then calls `onSaved`. **Same as training day** copies the four training fields into the
 * rest day. Prefills from `initial` (null fields blank); a remount (a new `key`) starts again from it.
 * `onDirtyChange` hears whether the fields differ from `initial`, so a screen can ask before it is left.
 */
export function TargetsForm({
  initial,
  submitLabel,
  onSaved,
  onDirtyChange,
}: {
  initial: FuelTargets | null;
  submitLabel: string;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}): ReactElement | null {
  const db = useDb();
  /** What the fields hold no changes against: `initial`, then whatever was last saved. */
  const [start, setStart] = useState(() => toInput(initial));
  const [input, setInput] = useState(start);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty = !sameInput(start, input);
  const reported = useRef(false);
  const tell = useRef(onDirtyChange);
  tell.current = onDirtyChange;
  useEffect(() => {
    if (reported.current === dirty) return;
    reported.current = dirty;
    tell.current?.(dirty);
  }, [dirty]);

  const change = (day: Day, key: Key, text: string) => {
    setInput((current) => ({ ...current, [day]: { ...current[day], [key]: text } }));
    setErrors((current) => {
      if (!(`${day}.${key}` in current)) return current;
      const { [`${day}.${key}`]: _gone, ...rest } = current;
      return rest;
    });
  };

  const sameAsTraining = () => {
    setInput((current) => ({ ...current, rest: { ...current.training } }));
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith('rest.'))));
    announce('Rest day set to the training day numbers.');
  };

  const save = () => {
    flushAll();
    Keyboard.dismiss();
    const result = validateTargets(input);
    if (!result.ok) {
      setErrors(result.errors);
      const said = (['training', 'rest'] as const).flatMap((day) =>
        KEYS.filter((key) => result.errors[`${day}.${key}`] !== undefined).map(
          (key) => `${DAY_LABEL[day]} ${FIELD[key].named}: ${result.errors[`${day}.${key}`]}`,
        ),
      );
      // "Check this number" has no full stop of its own.
      announce(said.map((line) => (line.endsWith('.') ? line : `${line}.`)).join(' '));
      return;
    }
    setFuelTargets(db, result.targets);
    bumpData();
    setErrors({});
    setStart(input);
    // Saved: nothing is left to lose, so the screen can go without asking.
    reported.current = false;
    tell.current?.(false);
    announce('Targets saved.');
    onSaved();
  };

  const day = (which: Day) => (
    <View style={{ gap: 12 }}>
      {KEYS.map((key) => (
        <TargetField key={key} day={which} field={key} value={input[which][key]} error={errors[`${which}.${key}`]} onChange={(text) => change(which, key, text)} />
      ))}
    </View>
  );

  return (
    <View>
      <Label style={{ marginBottom: 12 }}>{DAY_LABEL.training}</Label>
      {day('training')}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 32, marginBottom: 12 }}>
        <Label>{DAY_LABEL.rest}</Label>
        <Button label="Same as training day" variant="quiet" size="compact" onPress={sameAsTraining} />
      </View>
      {day('rest')}
      <View style={{ marginTop: 32 }}>
        <Button label={submitLabel} onPress={save} />
      </View>
    </View>
  );
}
