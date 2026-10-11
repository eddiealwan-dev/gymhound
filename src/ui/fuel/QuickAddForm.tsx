import { useRef, useState, type ReactElement } from 'react';
import { Keyboard, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { logQuickAdd } from '../../db/repositories/foodLogRepo';
import { type MacroInput, parseQuickAdd } from '../../domain/fuel';
import { announce } from '../../platform/announce';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { Body } from '../Text';
import { FuelField, MacroFields } from './MacroFields';

/** A quick add as typed. The add screen holds it, so switching to Search and back keeps it. */
export type QuickAddDraft = MacroInput & { name: string };

export const EMPTY_QUICK_ADD: QuickAddDraft = { kcal: '', protein: '', carbs: '', fat: '', name: '' };

/** Whether anything is typed, so leaving would lose it. */
export function quickAddStarted(draft: QuickAddDraft): boolean {
  return Object.values(draft).some((v) => v.trim() !== '');
}

type Errors = Partial<Record<keyof MacroInput | 'name' | 'form', string>>;

/**
 * Quick add (R143): calories, protein, carbs and fat, and a name if you want one, logged for `localDate` as one entry
 * with no food behind it. What stops **Add** shows beside its field (and "Enter calories or protein." over Add) and is
 * said to the screen reader; nothing is logged. After a log the form empties and `onAdded` gets the name.
 */
export function QuickAddForm({
  localDate,
  draft,
  onChange,
  onAdded,
}: {
  localDate: string;
  draft: QuickAddDraft;
  onChange: (draft: QuickAddDraft) => void;
  onAdded: (name: string) => void;
}): ReactElement {
  const db = useDb();
  const [errors, setErrors] = useState<Errors>({});
  /** The draft last logged: a second tap before the form empties logs nothing more. */
  const loggedRef = useRef<QuickAddDraft | null>(null);

  const change = (next: QuickAddDraft) => {
    setErrors({});
    onChange(next);
  };

  const add = () => {
    Keyboard.dismiss();
    if (loggedRef.current === draft) return;
    const result = parseQuickAdd(draft);
    if (!result.ok) {
      setErrors(result.errors);
      // Each problem once, in the order the fields read.
      const order = ['kcal', 'protein', 'carbs', 'fat', 'name', 'form'] as const;
      const said = [...new Set(order.map((key) => result.errors[key]).filter((m): m is string => m !== undefined))];
      announce(said.join(' '));
      return;
    }
    loggedRef.current = draft;
    logQuickAdd(db, result.name, result.totals, localDate, Date.now());
    bumpData();
    change(EMPTY_QUICK_ADD);
    onAdded(result.name);
  };

  return (
    <View style={{ gap: 24 }}>
      <MacroFields
        value={draft}
        onChange={(macros) => change({ ...draft, ...macros })}
        errors={errors}
        kcalLabel="Calories"
      />
      <FuelField label="Name (optional)" value={draft.name} onChangeText={(name) => change({ ...draft, name })} error={errors.name} onSubmit={add} />
      <View style={{ gap: 16 }}>
        {errors.form ? <Body muted>{errors.form}</Body> : null}
        <Button label="Add" onPress={add} />
      </View>
    </View>
  );
}
